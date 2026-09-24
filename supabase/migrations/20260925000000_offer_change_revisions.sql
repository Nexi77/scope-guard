alter table public.offers
  add column base_revision bigint not null default 1,
  add column active_scope_revision bigint not null default 1;

create table public.offer_revisions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  contractor_id uuid not null,
  revision bigint not null check (revision > 0),
  base_scope text not null check (btrim(base_scope) <> ''),
  base_amount_minor bigint not null check (base_amount_minor between 0 and 9999999999999999),
  currency_code text not null,
  base_deadline date not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  status text not null check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  superseded_by uuid references public.offer_revisions(id),
  decision_outcome text check (decision_outcome in ('accepted', 'rejected')),
  rejection_comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (offer_id, revision),
  unique (id, offer_id, contractor_id),
  foreign key (offer_id, contractor_id) references public.offers(id, contractor_id) on delete cascade
);

alter table public.offer_changes
  drop constraint offer_changes_status_check,
  add constraint offer_changes_status_check
    check (status in ('pending', 'accepted', 'rejected', 'agreed', 'superseded')),
  drop constraint offer_changes_check,
  add constraint offer_changes_check
    check (
      (status in ('pending', 'accepted', 'rejected', 'superseded')
        and (price_delta_minor is not null or deadline_delta_days is not null))
      or (status = 'agreed' and price_delta_minor is null and deadline_delta_days is null)
    ),
  add column proposal_revision bigint not null default 1,
  add column superseded_by uuid references public.offer_changes(id),
  add column estimate_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(estimate_snapshot) = 'object'),
  add column item_effects jsonb not null default '[]'::jsonb
    check (jsonb_typeof(item_effects) = 'array'),
  add column activation_order bigint;

create sequence public.offer_change_activation_order_seq;
create index offer_changes_activation_order_idx
  on public.offer_changes (offer_id, activation_order)
  where activation_order is not null;

alter table public.offer_revisions enable row level security;
alter table public.offer_revisions force row level security;
create policy "contractors read own offer revisions"
  on public.offer_revisions for select to authenticated
  using ((select auth.uid()) = contractor_id);
revoke all on table public.offer_revisions from anon, authenticated;
grant select on table public.offer_revisions to authenticated;
grant all on table public.offer_revisions to service_role;
revoke insert, update, delete on table public.offer_changes from authenticated;
grant select, insert, update, delete on table public.offer_changes, public.change_decisions to service_role;

create function public.sync_offer_revision_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.offer_revisions (
      offer_id, contractor_id, revision, base_scope, base_amount_minor,
      currency_code, base_deadline, items, status
    ) values (
      new.id, new.contractor_id, new.base_revision, new.base_scope,
      new.base_amount_minor, new.currency_code, new.base_deadline, '[]'::jsonb, 'pending'
    ) on conflict (offer_id, revision) do nothing;
    return new;
  end if;
  update public.offer_revisions set base_scope = new.base_scope,
      base_amount_minor = new.base_amount_minor, base_deadline = new.base_deadline,
      items = public.offer_item_snapshot(new.id)
    where offer_id = new.id and revision = new.base_revision and status = 'pending';
  return new;
end;
$$;

create trigger sync_offer_revision_on_offer_insert
  after insert on public.offers for each row execute function public.sync_offer_revision_snapshot();
create trigger sync_offer_revision_on_base_update
  after update of base_scope, base_amount_minor, base_deadline on public.offers
  for each row execute function public.sync_offer_revision_snapshot();
revoke all on function public.sync_offer_revision_snapshot() from public, anon, authenticated;

create function public.offer_item_snapshot(p_offer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'quantity', quantity, 'unit', unit,
    'specification', specification, 'selling_rate_minor', selling_rate_minor,
    'labor_hours_per_unit', labor_hours_per_unit,
    'line_amount_minor', line_amount_minor
  ) order by position), '[]'::jsonb)
  from public.offer_items where offer_id = p_offer_id
$$;

revoke all on function public.offer_item_snapshot(uuid) from public, anon, authenticated;

create function public.get_effective_offer_items(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_items jsonb;
  v_next jsonb;
  v_change record;
  v_effect jsonb;
  v_item_id uuid;
  v_after jsonb;
  v_found boolean;
  v_item jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.offers where id = p_offer_id and contractor_id = auth.uid()
  ) then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;
  v_items := public.offer_item_snapshot(p_offer_id);
  for v_change in
    select item_effects from public.offer_changes
    where offer_id = p_offer_id and status in ('accepted', 'agreed')
    order by activation_order nulls last, created_at, id
  loop
    for v_effect in select value from jsonb_array_elements(v_change.item_effects)
    loop
      v_item_id := coalesce(v_effect ->> 'item_id', v_effect -> 'before' ->> 'id', v_effect -> 'after' ->> 'id')::uuid;
      v_after := v_effect -> 'after';
      v_next := '[]'::jsonb;
      v_found := false;
      for v_item in select value from jsonb_array_elements(v_items)
      loop
        if v_item ->> 'id' = v_item_id::text then
          v_found := true;
          if v_after is not null and v_after <> 'null'::jsonb then
            v_next := v_next || jsonb_build_array(v_after || jsonb_build_object(
              'line_amount_minor', round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric)
            ));
          end if;
        else
          v_next := v_next || jsonb_build_array(v_item);
        end if;
      end loop;
      if not v_found and v_after is not null and v_after <> 'null'::jsonb then
        v_next := v_next || jsonb_build_array(v_after || jsonb_build_object(
          'line_amount_minor', round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric)
        ));
      end if;
      v_items := v_next;
    end loop;
  end loop;
  return v_items;
end;
$$;

revoke all on function public.get_effective_offer_items(uuid) from public, anon;
grant execute on function public.get_effective_offer_items(uuid) to authenticated;

insert into public.offer_revisions (
  offer_id, contractor_id, revision, base_scope, base_amount_minor,
  currency_code, base_deadline, items, status
)
select o.id, o.contractor_id, o.base_revision, o.base_scope, o.base_amount_minor,
  o.currency_code, o.base_deadline, public.offer_item_snapshot(o.id),
  case when o.status in ('accepted', 'agreed') then 'accepted'
       when o.status = 'rejected' then 'rejected' else 'pending' end
from public.offers o;

update public.offer_changes
set activation_order = nextval('public.offer_change_activation_order_seq')
where status in ('accepted', 'agreed');

create function public.publish_offer_change(
  p_offer_id uuid,
  p_expected_scope_revision bigint,
  p_description text,
  p_price_delta_minor bigint,
  p_deadline_delta_days integer,
  p_estimate_snapshot jsonb,
  p_item_effects jsonb,
  p_confirmed_impact boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_change_id uuid;
  v_superseded_ids uuid[] := '{}'::uuid[];
  v_status text;
  v_effect jsonb;
  v_before jsonb;
  v_after jsonb;
  v_current jsonb;
  v_item_id uuid;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_active_items jsonb;
  v_item_delta numeric := 0;
  v_commercial_adjustment numeric := 0;
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers
    where id = p_offer_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'Offer is unavailable' using errcode = 'P0001'; end if;
  if v_offer.status not in ('accepted', 'agreed') then
    raise exception 'Offer must be accepted before recording a change' using errcode = 'P0001';
  end if;
  if p_expected_scope_revision is distinct from v_offer.active_scope_revision then
    raise exception 'Offer scope changed; reload before publishing' using errcode = 'P0001';
  end if;
  if (p_estimate_snapshot ->> 'scope_revision')::bigint is distinct from p_expected_scope_revision then
    raise exception 'Estimate snapshot does not match the active scope revision' using errcode = 'P0001';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 1 and 4000
    or p_estimate_snapshot is null or jsonb_typeof(p_estimate_snapshot) <> 'object'
    or p_item_effects is null or jsonb_typeof(p_item_effects) <> 'array'
    or jsonb_array_length(p_item_effects) > 100
    or (p_price_delta_minor is null and p_deadline_delta_days is null)
    or (p_price_delta_minor = 0 and p_deadline_delta_days is null)
    or (p_deadline_delta_days = 0 and p_price_delta_minor is null)
    or (p_price_delta_minor is not null and abs(p_price_delta_minor::numeric) > 9999999999999999)
    or p_confirmed_impact is not true then
    raise exception 'Confirmed change details are invalid' using errcode = 'P0001';
  end if;
  v_active_items := public.get_effective_offer_items(v_offer.id);
  begin
    v_commercial_adjustment := coalesce((p_estimate_snapshot ->> 'commercial_adjustment_minor')::numeric, 0);
  exception when others then
    raise exception 'Commercial adjustment is invalid' using errcode = 'P0001';
  end;
  if v_commercial_adjustment <> trunc(v_commercial_adjustment)
    or abs(v_commercial_adjustment) > 9999999999999999 then
    raise exception 'Commercial adjustment is outside supported bounds' using errcode = 'P0001';
  end if;
  for v_effect in select value from jsonb_array_elements(p_item_effects)
  loop
    if jsonb_typeof(v_effect) <> 'object'
      or not (v_effect ?& array['item_id', 'before', 'after'])
      or (v_effect - array['item_id', 'before', 'after']) <> '{}'::jsonb
      or jsonb_typeof(v_effect -> 'item_id') <> 'string'
      or (v_effect -> 'before') = 'null'::jsonb and (v_effect -> 'after') = 'null'::jsonb then
      raise exception 'Item effect is invalid' using errcode = 'P0001';
    end if;
    begin
      v_item_id := (v_effect ->> 'item_id')::uuid;
    exception when others then
      raise exception 'Item effect identity is invalid' using errcode = 'P0001';
    end;
    if v_item_id = any(v_seen_ids) then
      raise exception 'Item effects must use unique item IDs' using errcode = 'P0001';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_item_id);
    select value into v_current from jsonb_array_elements(v_active_items) where value ->> 'id' = v_item_id::text;
    v_before := v_effect -> 'before';
    v_after := v_effect -> 'after';
    if v_before is null or v_before = 'null'::jsonb then
      if v_current is not null then
        raise exception 'Added item identity is already active' using errcode = 'P0001';
      end if;
    else
      if v_current is null or v_before <> v_current then
        raise exception 'Item before-state does not match the active scope' using errcode = 'P0001';
      end if;
      v_item_delta := v_item_delta - round((v_before ->> 'quantity')::numeric * (v_before ->> 'selling_rate_minor')::numeric);
    end if;
    if v_after is not null and v_after <> 'null'::jsonb then
      if jsonb_typeof(v_after) <> 'object'
        or not (v_after ?& array['id', 'name', 'quantity', 'unit', 'specification', 'selling_rate_minor', 'labor_hours_per_unit'])
        or (v_after - array['id', 'name', 'quantity', 'unit', 'specification', 'selling_rate_minor', 'labor_hours_per_unit']) <> '{}'::jsonb
        or v_after ->> 'id' <> v_item_id::text
        or jsonb_typeof(v_after -> 'quantity') <> 'number'
        or jsonb_typeof(v_after -> 'selling_rate_minor') <> 'number'
        or jsonb_typeof(v_after -> 'labor_hours_per_unit') <> 'number'
        or jsonb_typeof(v_after -> 'name') <> 'string'
        or jsonb_typeof(v_after -> 'unit') <> 'string'
        or jsonb_typeof(v_after -> 'specification') <> 'string'
        or (v_after ->> 'quantity')::numeric <= 0
        or (v_after ->> 'quantity')::numeric >= 1000000000
        or (v_after ->> 'quantity')::numeric <> trunc((v_after ->> 'quantity')::numeric, 3)
        or (v_after ->> 'selling_rate_minor')::numeric < 0
        or (v_after ->> 'selling_rate_minor')::numeric > 9999999999999999
        or (v_after ->> 'selling_rate_minor')::numeric <> trunc((v_after ->> 'selling_rate_minor')::numeric)
        or (v_after ->> 'labor_hours_per_unit')::numeric < 0
        or (v_after ->> 'labor_hours_per_unit')::numeric >= 1000000000
        or (v_after ->> 'labor_hours_per_unit')::numeric <> trunc((v_after ->> 'labor_hours_per_unit')::numeric, 3)
        or v_after ->> 'unit' not in ('piece', 'set', 'm', 'm²', 'm³', 'kg', 'l', 'hour')
        or char_length(btrim(v_after ->> 'name')) not between 1 and 200
        or char_length(btrim(v_after ->> 'specification')) not between 1 and 2000
        or round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric) > 9999999999999999 then
        raise exception 'Item after-state is invalid' using errcode = 'P0001';
      end if;
      v_item_delta := v_item_delta + round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric);
    end if;
  end loop;
  if v_item_delta + v_commercial_adjustment <> coalesce(p_price_delta_minor, 0) then
    raise exception 'Confirmed price must reconcile to item effects and commercial adjustment' using errcode = 'P0001';
  end if;
  if (v_offer.base_amount_minor + coalesce((
      select sum(price_delta_minor) from public.offer_changes
      where offer_id = v_offer.id and status in ('accepted', 'agreed')
    ), 0) + coalesce(p_price_delta_minor, 0)) < 0 then
    raise exception 'Active offer amount cannot be negative' using errcode = 'P0001';
  end if;

  with superseded as (
    update public.offer_changes set status = 'superseded', updated_at = now()
      where offer_id = v_offer.id and status = 'pending'
      returning id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into v_superseded_ids from superseded;
  v_status := case when coalesce(p_price_delta_minor, 0) = 0
      and coalesce(p_deadline_delta_days, 0) = 0 then 'agreed' else 'pending' end;
  insert into public.offer_changes (
    contractor_id, offer_id, description, price_delta_minor, deadline_delta_days,
    status, proposal_revision, estimate_snapshot, item_effects
  ) values (
    v_contractor_id, v_offer.id, btrim(p_description),
    nullif(p_price_delta_minor, 0), nullif(p_deadline_delta_days, 0), v_status,
    coalesce((select max(proposal_revision) + 1 from public.offer_changes where offer_id = v_offer.id), 1),
    p_estimate_snapshot, p_item_effects
  ) returning id into v_change_id;
  update public.offer_changes set superseded_by = v_change_id
    where id = any(v_superseded_ids);

  if v_status = 'agreed' then
    update public.offer_changes set activation_order = nextval('public.offer_change_activation_order_seq')
      where id = v_change_id;
  end if;
  update public.offers set active_scope_revision = active_scope_revision + 1, updated_at = now()
    where id = v_offer.id and v_status = 'agreed';
  return v_change_id;
end;
$$;

create function public.replace_pending_offer_revision(
  p_offer_id uuid,
  p_expected_revision bigint,
  p_base_scope text,
  p_base_deadline date,
  p_items jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_total bigint;
  v_revision bigint;
  v_revision_id uuid;
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers
    where id = p_offer_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'Offer is unavailable' using errcode = 'P0001'; end if;
  if v_offer.status <> 'pending' then
    raise exception 'Only an unaccepted offer can be revised' using errcode = 'P0001';
  end if;
  if p_expected_revision is distinct from v_offer.base_revision then
    raise exception 'Offer revision changed; reload before editing' using errcode = 'P0001';
  end if;
  if p_base_scope is null or char_length(btrim(p_base_scope)) not between 1 and 4000
    or p_base_deadline is null or p_base_deadline < current_date then
    raise exception 'Offer revision details are invalid' using errcode = 'P0001';
  end if;

  update public.offer_revisions set status = 'superseded'
    where offer_id = v_offer.id and status = 'pending';
  v_total := public.apply_offer_items(v_offer.id, v_contractor_id, p_items, true);
  v_revision := v_offer.base_revision + 1;
  update public.offers set base_scope = btrim(p_base_scope), base_deadline = p_base_deadline,
      base_amount_minor = v_total, base_revision = v_revision,
      items_revision = items_revision + 1, updated_at = now()
    where id = v_offer.id;
  insert into public.offer_revisions (
    offer_id, contractor_id, revision, base_scope, base_amount_minor,
    currency_code, base_deadline, items, status
  ) values (
    v_offer.id, v_contractor_id, v_revision, btrim(p_base_scope), v_total,
    v_offer.currency_code, p_base_deadline, public.offer_item_snapshot(v_offer.id), 'pending'
  ) returning id into v_revision_id;
  update public.offer_revisions set superseded_by = v_revision_id
    where offer_id = v_offer.id and status = 'superseded' and superseded_by is null;
  return v_revision;
end;
$$;

create function public.decide_shared_offer_revision(
  p_share_token uuid, p_pin text, p_offer_revision_id uuid,
  p_outcome text, p_rejection_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_offer public.offers%rowtype;
  v_revision public.offer_revisions%rowtype;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
    or p_outcome not in ('accepted', 'rejected')
    or (p_outcome = 'rejected' and coalesce(btrim(p_rejection_comment), '') = '') then
    raise exception 'Invalid decision request' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers
    where share_token = p_share_token and share_link_revoked_at is null for update;
  if not found or v_offer.pin_hash is null
    or extensions.crypt(p_pin, v_offer.pin_hash) is distinct from v_offer.pin_hash then
    raise exception 'Invalid shared offer or PIN' using errcode = 'P0001';
  end if;
  select * into v_revision from public.offer_revisions
    where id = p_offer_revision_id and offer_id = v_offer.id for update;
  if not found then raise exception 'Invalid decision request' using errcode = 'P0001'; end if;
  if v_revision.decision_outcome is not null then
    return jsonb_build_object('revision_id', v_revision.id, 'status', v_revision.status,
      'outcome', v_revision.decision_outcome, 'decided_at', v_revision.decided_at);
  end if;
  if v_revision.status <> 'pending' or v_revision.revision <> v_offer.base_revision then
    raise exception 'Offer revision is stale or superseded' using errcode = 'P0001';
  end if;
  update public.offer_revisions set status = p_outcome, decision_outcome = p_outcome,
      rejection_comment = case when p_outcome = 'rejected' then btrim(p_rejection_comment) end,
      decided_at = now() where id = v_revision.id returning * into v_revision;
  update public.offers set status = p_outcome, updated_at = now() where id = v_offer.id;
  return jsonb_build_object('revision_id', v_revision.id, 'status', v_revision.status,
    'outcome', v_revision.decision_outcome, 'decided_at', v_revision.decided_at);
end;
$$;

create or replace function public.decide_shared_offer_change(
  p_share_token uuid, p_pin text, p_offer_change_id uuid,
  p_outcome text, p_rejection_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_offer public.offers%rowtype;
  v_change public.offer_changes%rowtype;
  v_decision public.change_decisions%rowtype;
  v_offer_status text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
    or p_outcome is null or p_outcome not in ('accepted', 'rejected')
    or (p_outcome = 'rejected' and coalesce(btrim(p_rejection_comment), '') = '') then
    raise exception 'Invalid decision request' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers
    where share_token = p_share_token and share_link_revoked_at is null for update;
  if not found or v_offer.pin_hash is null
    or extensions.crypt(p_pin, v_offer.pin_hash) is distinct from v_offer.pin_hash then
    raise exception 'Invalid shared offer or PIN' using errcode = 'P0001';
  end if;
  select * into v_change from public.offer_changes
    where id = p_offer_change_id and offer_id = v_offer.id for update;
  if not found then raise exception 'Invalid decision request' using errcode = 'P0001'; end if;
  select * into v_decision from public.change_decisions where offer_change_id = v_change.id;
  if found then return jsonb_build_object('offer_id', v_offer.id, 'offer_status', v_offer.status,
    'change_id', v_change.id, 'change_status', v_change.status, 'outcome', v_decision.outcome,
    'rejection_comment', v_decision.rejection_comment, 'decided_at', v_decision.decided_at); end if;
  if v_change.status <> 'pending' then
    raise exception 'Change is stale or not pending' using errcode = 'P0001';
  end if;
  insert into public.change_decisions (contractor_id, offer_change_id, outcome, rejection_comment)
    values (v_change.contractor_id, v_change.id, p_outcome,
      case when p_outcome = 'rejected' then btrim(p_rejection_comment) end)
    returning * into v_decision;
  update public.offer_changes set status = p_outcome, updated_at = now(),
      activation_order = case when p_outcome = 'accepted'
        then nextval('public.offer_change_activation_order_seq') else null end
    where id = v_change.id;
  v_offer_status := case when p_outcome = 'accepted' then 'accepted'
      when v_offer.status in ('accepted', 'agreed') then v_offer.status else 'rejected' end;
  update public.offers set status = v_offer_status,
      active_scope_revision = active_scope_revision + case when p_outcome = 'accepted' then 1 else 0 end,
      updated_at = now() where id = v_offer.id;
  return jsonb_build_object('offer_id', v_offer.id, 'offer_status', v_offer_status,
    'change_id', v_change.id, 'change_status', p_outcome, 'outcome', v_decision.outcome,
    'rejection_comment', v_decision.rejection_comment, 'decided_at', v_decision.decided_at);
end;
$$;

revoke all on function public.publish_offer_change(uuid, bigint, text, bigint, integer, jsonb, jsonb, boolean)
  from public, anon;
grant execute on function public.publish_offer_change(uuid, bigint, text, bigint, integer, jsonb, jsonb, boolean)
  to authenticated;
revoke all on function public.replace_pending_offer_revision(uuid, bigint, text, date, jsonb)
  from public, anon;
grant execute on function public.replace_pending_offer_revision(uuid, bigint, text, date, jsonb)
  to authenticated;
revoke all on function public.decide_shared_offer_revision(uuid, text, uuid, text, text) from public;
grant execute on function public.decide_shared_offer_revision(uuid, text, uuid, text, text) to anon;
revoke all on function public.decide_shared_offer_change(uuid, text, uuid, text, text) from public;
grant execute on function public.decide_shared_offer_change(uuid, text, uuid, text, text) to anon;

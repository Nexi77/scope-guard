do $$
begin
  if exists (select 1 from public.offers) then
    raise exception 'Structured offers require an empty preproduction offers table; reset data separately before migration';
  end if;
end;
$$;

alter table public.offers
  add column items_revision bigint not null default 1,
  add constraint offers_base_amount_minor_bound
    check (base_amount_minor between 0 and 9999999999999999);

create table public.offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  contractor_id uuid not null,
  position integer not null check (position > 0),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (char_length(btrim(unit)) between 1 and 40),
  specification text not null check (char_length(btrim(specification)) between 1 and 2000),
  selling_rate_minor bigint not null
    check (selling_rate_minor between 0 and 9999999999999999),
  labor_hours_per_unit numeric(12, 3) not null
    check (labor_hours_per_unit >= 0),
  line_amount_minor bigint generated always as (
    round(quantity * selling_rate_minor)::bigint
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, position),
  unique (id, offer_id, contractor_id),
  foreign key (offer_id, contractor_id)
    references public.offers (id, contractor_id)
    on delete cascade,
  check (round(quantity * selling_rate_minor) between 0 and 9999999999999999)
);

create index offer_items_offer_position_idx
  on public.offer_items (offer_id, position);

alter table public.offer_items enable row level security;
alter table public.offer_items force row level security;

create policy "contractors read own offer items"
  on public.offer_items
  for select
  to authenticated
  using ((select auth.uid()) = contractor_id);

revoke all on table public.offer_items from anon, authenticated;
grant select on table public.offer_items to authenticated;
revoke insert, update, delete on table public.offers from authenticated;
grant select on table public.offers to authenticated;
grant select, update (pin_hash, share_link_revoked_at, status, created_at)
  on table public.offers to service_role;

drop function public.create_offer_with_customer(uuid, text, boolean, text, bigint, text, date);

create function public.apply_offer_items(
  p_offer_id uuid,
  p_contractor_id uuid,
  p_items jsonb,
  p_allow_retained_ids boolean
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_item_id uuid;
  v_position integer := 0;
  v_count integer;
  v_total numeric := 0;
  v_quantity numeric;
  v_rate_numeric numeric;
  v_rate bigint;
  v_hours numeric;
  v_line numeric;
  v_name text;
  v_unit text;
  v_specification text;
  v_existing_offer_id uuid;
begin
  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 100
    or octet_length(p_items::text) > 262144 then
    raise exception 'Items must contain between 1 and 100 bounded entries' using errcode = 'P0001';
  end if;

  if exists (
    select lower(item ->> 'id')
    from jsonb_array_elements(p_items) as rows(item)
    where item ? 'id' and item ->> 'id' is not null
    group by lower(item ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'Item IDs must be unique' using errcode = 'P0001';
  end if;

  delete from public.offer_items
    where offer_id = p_offer_id
      and contractor_id = p_contractor_id
      and not exists (
        select 1 from jsonb_array_elements(p_items) as rows(item)
        where item ->> 'id' = offer_items.id::text
      );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;

    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ?& array['name', 'quantity', 'unit', 'specification', 'selling_rate_minor', 'labor_hours_per_unit'])
      or (v_item - array['id', 'name', 'quantity', 'unit', 'specification', 'selling_rate_minor', 'labor_hours_per_unit']) <> '{}'::jsonb then
      raise exception 'Item payload has missing or unsupported fields' using errcode = 'P0001';
    end if;

    v_name := btrim(v_item ->> 'name');
    v_unit := btrim(v_item ->> 'unit');
    v_specification := btrim(v_item ->> 'specification');

    if jsonb_typeof(v_item -> 'name') <> 'string'
      or char_length(v_name) not between 1 and 200
      or jsonb_typeof(v_item -> 'unit') <> 'string'
      or char_length(v_unit) not between 1 and 40
      or jsonb_typeof(v_item -> 'specification') <> 'string'
      or char_length(v_specification) not between 1 and 2000
      or jsonb_typeof(v_item -> 'quantity') <> 'number'
      or jsonb_typeof(v_item -> 'selling_rate_minor') <> 'number'
      or jsonb_typeof(v_item -> 'labor_hours_per_unit') <> 'number' then
      raise exception 'Item fields have invalid values' using errcode = 'P0001';
    end if;

    begin
      v_quantity := (v_item ->> 'quantity')::numeric;
      v_rate_numeric := (v_item ->> 'selling_rate_minor')::numeric;
      v_rate := v_rate_numeric::bigint;
      v_hours := (v_item ->> 'labor_hours_per_unit')::numeric;
    exception when others then
      raise exception 'Item numbers are invalid or out of range' using errcode = 'P0001';
    end;

    if v_quantity <= 0 or v_quantity <> trunc(v_quantity, 3) or v_quantity >= 1000000000
      or v_rate_numeric <> trunc(v_rate_numeric)
      or v_rate < 0 or v_rate > 9999999999999999
      or v_hours < 0 or v_hours <> trunc(v_hours, 3) or v_hours >= 1000000000 then
      raise exception 'Item numbers are outside the supported precision or bounds' using errcode = 'P0001';
    end if;

    v_line := round(v_quantity * v_rate);
    v_total := v_total + v_line;
    if v_line > 9999999999999999 or v_total > 9999999999999999 then
      raise exception 'Offer total exceeds the supported amount' using errcode = 'P0001';
    end if;

    v_item_id := null;
    if v_item ? 'id' and v_item ->> 'id' is not null then
      if not p_allow_retained_ids then
        raise exception 'New offer items cannot supply IDs' using errcode = 'P0001';
      end if;
      begin
        v_item_id := (v_item ->> 'id')::uuid;
      exception when others then
        raise exception 'Item ID is invalid' using errcode = 'P0001';
      end;
      select offer_id into v_existing_offer_id
        from public.offer_items
        where id = v_item_id;
      if not found or v_existing_offer_id <> p_offer_id then
        raise exception 'Item ID is unavailable' using errcode = 'P0001';
      end if;
    else
      v_item_id := gen_random_uuid();
    end if;

    insert into public.offer_items (
      id, offer_id, contractor_id, position, name, quantity, unit,
      specification, selling_rate_minor, labor_hours_per_unit
    ) values (
      v_item_id, p_offer_id, p_contractor_id, v_position, v_name, v_quantity,
      v_unit, v_specification, v_rate, v_hours
    )
    on conflict (id) do update set
      position = excluded.position,
      name = excluded.name,
      quantity = excluded.quantity,
      unit = excluded.unit,
      specification = excluded.specification,
      selling_rate_minor = excluded.selling_rate_minor,
      labor_hours_per_unit = excluded.labor_hours_per_unit,
      updated_at = now()
    where offer_items.offer_id = p_offer_id
      and offer_items.contractor_id = p_contractor_id;
  end loop;

  return v_total::bigint;
end;
$$;

create function public.create_offer_with_customer(
  p_customer_id uuid,
  p_customer_name text,
  p_confirm_duplicate boolean,
  p_base_scope text,
  p_currency_code text,
  p_base_deadline date,
  p_items jsonb
)
returns table (offer_id uuid, customer_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_customer_id uuid;
  v_customer_name text;
  v_base_scope text;
  v_currency_code text;
  v_offer_id uuid;
  v_total bigint;
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;
  if (p_customer_id is null) = (p_customer_name is null) then
    raise exception 'Provide exactly one customer source' using errcode = 'P0001';
  end if;

  v_base_scope := btrim(p_base_scope);
  v_currency_code := upper(btrim(p_currency_code));
  if v_base_scope is null or v_base_scope = '' then
    raise exception 'Base scope is required' using errcode = 'P0001';
  end if;
  if v_currency_code is distinct from 'PLN' then
    raise exception 'Currency must be PLN' using errcode = 'P0001';
  end if;
  if p_base_deadline is null or p_base_deadline < current_date then
    raise exception 'Base deadline cannot be in the past' using errcode = 'P0001';
  end if;

  if p_customer_id is not null then
    select customers.id into v_customer_id
      from public.customers
      where customers.id = p_customer_id
        and customers.contractor_id = v_contractor_id;
    if not found then
      raise exception 'Customer is unavailable' using errcode = 'P0001';
    end if;
  else
    v_customer_name := btrim(p_customer_name);
    if v_customer_name is null or v_customer_name = '' then
      raise exception 'Customer name is required' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_contractor_id::text || ':' || lower(v_customer_name), 0));
    if exists (
      select 1 from public.customers
      where contractor_id = v_contractor_id
        and lower(btrim(name)) = lower(v_customer_name)
    ) and p_confirm_duplicate is not true then
      raise exception 'A matching customer requires confirmation' using errcode = 'P0001';
    end if;
    insert into public.customers (contractor_id, name)
      values (v_contractor_id, v_customer_name)
      returning id into v_customer_id;
  end if;

  insert into public.offers (
    contractor_id, customer_id, base_scope, base_amount_minor,
    currency_code, base_deadline
  ) values (
    v_contractor_id, v_customer_id, v_base_scope, 0, v_currency_code, p_base_deadline
  ) returning id into v_offer_id;

  v_total := public.apply_offer_items(v_offer_id, v_contractor_id, p_items, false);
  update public.offers set base_amount_minor = v_total where id = v_offer_id;
  return query select v_offer_id, v_customer_id;
end;
$$;

create function public.edit_offer_items(
  p_offer_id uuid,
  p_expected_revision bigint,
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
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;
  select * into v_offer
    from public.offers
    where id = p_offer_id and contractor_id = v_contractor_id
    for update;
  if not found then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'Offer items can only be edited while pending' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.offer_changes where offer_id = v_offer.id) then
    raise exception 'Offer items cannot be edited after change history begins' using errcode = 'P0001';
  end if;
  if p_expected_revision is distinct from v_offer.items_revision then
    raise exception 'Offer items have changed; reload before editing' using errcode = 'P0001';
  end if;

  v_total := public.apply_offer_items(v_offer.id, v_contractor_id, p_items, true);
  update public.offers
    set base_amount_minor = v_total,
        items_revision = items_revision + 1,
        updated_at = now()
    where id = v_offer.id;
  return v_offer.items_revision + 1;
end;
$$;

create or replace function public.get_shared_offer(p_share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_offer public.offers%rowtype;
  v_active_changes jsonb;
  v_history jsonb;
  v_public_items jsonb;
  v_active_amount_minor bigint;
  v_active_deadline date;
begin
  select * into v_offer
    from public.offers
    where share_token = p_share_token and share_link_revoked_at is null;
  if not found then return null; end if;

  select
    coalesce(sum(price_delta_minor), 0),
    v_offer.base_deadline + coalesce(sum(deadline_delta_days), 0)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'description', description, 'price_delta_minor', price_delta_minor,
      'deadline_delta_days', deadline_delta_days, 'status', status
    ) order by created_at, id), '[]'::jsonb)
    into v_active_amount_minor, v_active_deadline, v_active_changes
    from public.offer_changes
    where offer_id = v_offer.id and status in ('accepted', 'agreed');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'quantity', quantity,
    'unit', unit,
    'specification', specification,
    'selling_rate_minor', selling_rate_minor,
    'line_amount_minor', line_amount_minor
  ) order by position), '[]'::jsonb)
    into v_public_items
    from public.offer_items
    where offer_id = v_offer.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', change_record.id, 'description', change_record.description,
    'price_delta_minor', change_record.price_delta_minor,
    'deadline_delta_days', change_record.deadline_delta_days, 'status', change_record.status,
    'decision', case when decision_record.id is null then null else jsonb_build_object(
      'outcome', decision_record.outcome, 'rejection_comment', decision_record.rejection_comment,
      'decided_at', decision_record.decided_at
    ) end
  ) order by change_record.created_at, change_record.id), '[]'::jsonb)
    into v_history
    from public.offer_changes as change_record
    left join public.change_decisions as decision_record
      on decision_record.offer_change_id = change_record.id
    where change_record.offer_id = v_offer.id;

  return jsonb_build_object(
    'id', v_offer.id,
    'status', v_offer.status,
    'currency_code', v_offer.currency_code,
    'active_scope', jsonb_build_object('base_scope', v_offer.base_scope, 'items', v_public_items,
      'accepted_changes', v_active_changes),
    'active_amount_minor', v_offer.base_amount_minor + v_active_amount_minor,
    'active_deadline', v_active_deadline,
    'changes', v_history
  );
end;
$$;

revoke all on function public.apply_offer_items(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.create_offer_with_customer(uuid, text, boolean, text, text, date, jsonb)
  from public, anon;
revoke all on function public.edit_offer_items(uuid, bigint, jsonb) from public, anon;
grant execute on function public.create_offer_with_customer(uuid, text, boolean, text, text, date, jsonb)
  to authenticated;
grant execute on function public.edit_offer_items(uuid, bigint, jsonb) to authenticated;
revoke all on function public.get_shared_offer(uuid) from public;
grant execute on function public.get_shared_offer(uuid) to anon;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, contractor_id)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid not null,
  base_scope text not null check (btrim(base_scope) <> ''),
  base_amount_minor bigint not null check (base_amount_minor >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  base_deadline date not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'agreed')),
  share_token uuid not null default gen_random_uuid(),
  share_link_revoked_at timestamptz,
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, contractor_id),
  unique (share_token),
  foreign key (customer_id, contractor_id)
    references public.customers (id, contractor_id)
    on delete restrict
);

create table public.offer_changes (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references auth.users (id) on delete cascade,
  offer_id uuid not null,
  description text not null check (btrim(description) <> ''),
  price_delta_minor bigint,
  deadline_delta_days integer,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'agreed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, contractor_id),
  foreign key (offer_id, contractor_id)
    references public.offers (id, contractor_id)
    on delete cascade,
  check (price_delta_minor is null or price_delta_minor <> 0),
  check (deadline_delta_days is null or deadline_delta_days <> 0),
  check (
    (status in ('pending', 'accepted', 'rejected')
      and (price_delta_minor is not null or deadline_delta_days is not null))
    or (status = 'agreed'
      and price_delta_minor is null
      and deadline_delta_days is null)
  )
);

create unique index offer_changes_one_pending_impacting_offer_idx
  on public.offer_changes (offer_id)
  where status = 'pending'
    and (price_delta_minor is not null or deadline_delta_days is not null);

create table public.change_decisions (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references auth.users (id) on delete cascade,
  offer_change_id uuid not null,
  outcome text not null check (outcome in ('accepted', 'rejected')),
  rejection_comment text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (offer_change_id),
  foreign key (offer_change_id, contractor_id)
    references public.offer_changes (id, contractor_id)
    on delete cascade,
  check (
    outcome <> 'rejected'
    or (rejection_comment is not null and btrim(rejection_comment) <> '')
  )
);

create index customers_contractor_id_idx on public.customers (contractor_id);
create index offers_contractor_id_idx on public.offers (contractor_id);
create index offers_customer_id_idx on public.offers (customer_id);
create index offer_changes_contractor_id_idx on public.offer_changes (contractor_id);
create index offer_changes_offer_id_idx on public.offer_changes (offer_id);
create index change_decisions_contractor_id_idx on public.change_decisions (contractor_id);

alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.offers enable row level security;
alter table public.offers force row level security;
alter table public.offer_changes enable row level security;
alter table public.offer_changes force row level security;
alter table public.change_decisions enable row level security;
alter table public.change_decisions force row level security;

create policy "contractors manage own customers"
  on public.customers
  for all
  to authenticated
  using ((select auth.uid()) = contractor_id)
  with check ((select auth.uid()) = contractor_id);

create policy "contractors manage own offers"
  on public.offers
  for all
  to authenticated
  using ((select auth.uid()) = contractor_id)
  with check ((select auth.uid()) = contractor_id);

create policy "contractors manage own offer changes"
  on public.offer_changes
  for all
  to authenticated
  using ((select auth.uid()) = contractor_id)
  with check ((select auth.uid()) = contractor_id);

create policy "contractors manage own change decisions"
  on public.change_decisions
  for all
  to authenticated
  using ((select auth.uid()) = contractor_id)
  with check ((select auth.uid()) = contractor_id);

revoke all on table public.customers from anon;
revoke all on table public.offers from anon;
revoke all on table public.offer_changes from anon;
revoke all on table public.change_decisions from anon;

grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.offers to authenticated;
grant select, insert, update, delete on table public.offer_changes to authenticated;
grant select, insert, update, delete on table public.change_decisions to authenticated;

create function public.get_shared_offer(p_share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_offer public.offers%rowtype;
  v_active_changes jsonb;
  v_history jsonb;
  v_active_amount_minor bigint;
  v_active_deadline date;
begin
  select *
    into v_offer
    from public.offers
    where share_token = p_share_token
      and share_link_revoked_at is null;

  if not found then
    return null;
  end if;

  select
    coalesce(sum(price_delta_minor), 0),
    v_offer.base_deadline + coalesce(sum(deadline_delta_days), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'description', description,
          'price_delta_minor', price_delta_minor,
          'deadline_delta_days', deadline_delta_days,
          'status', status
        )
        order by created_at, id
      ),
      '[]'::jsonb
    )
    into v_active_amount_minor, v_active_deadline, v_active_changes
    from public.offer_changes
    where offer_id = v_offer.id
      and status in ('accepted', 'agreed');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', change_record.id,
        'description', change_record.description,
        'price_delta_minor', change_record.price_delta_minor,
        'deadline_delta_days', change_record.deadline_delta_days,
        'status', change_record.status,
        'decision', case
          when decision_record.id is null then null
          else jsonb_build_object(
            'outcome', decision_record.outcome,
            'rejection_comment', decision_record.rejection_comment,
            'decided_at', decision_record.decided_at
          )
        end
      )
      order by change_record.created_at, change_record.id
    ),
    '[]'::jsonb
  )
  into v_history
  from public.offer_changes as change_record
  left join public.change_decisions as decision_record
    on decision_record.offer_change_id = change_record.id
  where change_record.offer_id = v_offer.id;

  return jsonb_build_object(
    'id', v_offer.id,
    'status', v_offer.status,
    'currency_code', v_offer.currency_code,
    'active_scope', jsonb_build_object(
      'base_scope', v_offer.base_scope,
      'accepted_changes', v_active_changes
    ),
    'active_amount_minor', v_offer.base_amount_minor + v_active_amount_minor,
    'active_deadline', v_active_deadline,
    'changes', v_history
  );
end;
$$;

create function public.decide_shared_offer_change(
  p_share_token uuid,
  p_pin text,
  p_offer_change_id uuid,
  p_outcome text,
  p_rejection_comment text default null
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
    or (p_outcome = 'rejected' and (p_rejection_comment is null or btrim(p_rejection_comment) = '')) then
    raise exception 'Invalid decision request' using errcode = 'P0001';
  end if;

  select *
    into v_offer
    from public.offers
    where share_token = p_share_token
      and share_link_revoked_at is null
    for update;

  if not found
    or v_offer.pin_hash is null
    or extensions.crypt(p_pin, v_offer.pin_hash) is distinct from v_offer.pin_hash then
    raise exception 'Invalid shared offer or PIN' using errcode = 'P0001';
  end if;

  select *
    into v_change
    from public.offer_changes
    where id = p_offer_change_id
      and offer_id = v_offer.id
    for update;

  if not found then
    raise exception 'Invalid decision request' using errcode = 'P0001';
  end if;

  select *
    into v_decision
    from public.change_decisions
    where offer_change_id = v_change.id;

  if found then
    return jsonb_build_object(
      'offer_id', v_offer.id,
      'offer_status', v_offer.status,
      'change_id', v_change.id,
      'change_status', v_change.status,
      'outcome', v_decision.outcome,
      'rejection_comment', v_decision.rejection_comment,
      'decided_at', v_decision.decided_at
    );
  end if;

  if v_change.status <> 'pending' then
    raise exception 'Change is not pending' using errcode = 'P0001';
  end if;

  insert into public.change_decisions (
    contractor_id,
    offer_change_id,
    outcome,
    rejection_comment
  )
  values (
    v_change.contractor_id,
    v_change.id,
    p_outcome,
    case when p_outcome = 'rejected' then btrim(p_rejection_comment) else null end
  )
  returning * into v_decision;

  update public.offer_changes
    set status = p_outcome,
        updated_at = now()
    where id = v_change.id;

  v_offer_status := case
    when p_outcome = 'accepted' then 'accepted'
    when v_offer.status in ('accepted', 'agreed') then v_offer.status
    else 'rejected'
  end;

  update public.offers
    set status = v_offer_status,
        updated_at = now()
    where id = v_offer.id;

  return jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_status', v_offer_status,
    'change_id', v_change.id,
    'change_status', p_outcome,
    'outcome', v_decision.outcome,
    'rejection_comment', v_decision.rejection_comment,
    'decided_at', v_decision.decided_at
  );
end;
$$;

revoke all on function public.get_shared_offer(uuid) from public;
revoke all on function public.decide_shared_offer_change(uuid, text, uuid, text, text) from public;

grant execute on function public.get_shared_offer(uuid) to anon;
grant execute on function public.decide_shared_offer_change(uuid, text, uuid, text, text) to anon;

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

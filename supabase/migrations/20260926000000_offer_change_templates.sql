create table public.offer_change_templates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null check (char_length(btrim(template_key)) between 1 and 120),
  version integer not null default 1 check (version > 0),
  trade text not null check (trade in ('painting', 'tiling', 'electrical', 'plumbing')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  unit text not null check (unit in ('piece', 'set', 'm', 'm²', 'm³', 'kg', 'l', 'hour')),
  prompts jsonb not null default '[]'::jsonb check (jsonb_typeof(prompts) = 'array'),
  selling_rate_minor bigint check (selling_rate_minor between 0 and 9007199254740991),
  labor_hours_per_unit numeric(12, 3) check (labor_hours_per_unit between 0 and 999999999.999),
  companion_operations jsonb not null default '[]'::jsonb check (jsonb_typeof(companion_operations) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contractor_id, template_key, version)
);

create index offer_change_templates_owner_idx
  on public.offer_change_templates (contractor_id, trade, template_key, version desc);

alter table public.offer_change_templates enable row level security;
alter table public.offer_change_templates force row level security;

create policy "contractors manage own offer change templates"
  on public.offer_change_templates for all to authenticated
  using ((select auth.uid()) = contractor_id)
  with check ((select auth.uid()) = contractor_id);

revoke all on table public.offer_change_templates from anon, public;
grant select, insert, update, delete on table public.offer_change_templates to authenticated;
grant all on table public.offer_change_templates to service_role;

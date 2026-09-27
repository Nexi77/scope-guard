create index if not exists customers_contractor_name_page_idx
  on public.customers (contractor_id, name, id);

create index if not exists offers_contractor_customer_created_page_idx
  on public.offers (contractor_id, customer_id, created_at desc, id desc);

create function public.list_contractor_customers(
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  customer_id uuid,
  name text,
  offer_count bigint,
  last_activity timestamptz,
  total_customers bigint,
  page integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_query text := left(btrim(coalesce(p_query, '')), 100);
  v_total bigint;
  v_page integer;
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Invalid customer page size' using errcode = 'P0001';
  end if;

  select count(*)
    into v_total
    from public.customers as customer
    where customer.contractor_id = v_contractor_id
      and (v_query = '' or position(lower(v_query) in lower(customer.name)) > 0);

  v_page := greatest(
    1,
    least(
      greatest(coalesce(p_page, 1), 1),
      greatest(1, ceil(v_total::numeric / p_page_size)::integer)
    )
  );

  return query
  with customer_summaries as materialized (
    select
      customer.id,
      customer.name,
      count(offer.id)::bigint as offer_count,
      max(offer.updated_at) as last_activity
    from public.customers as customer
    left join public.offers as offer
      on offer.customer_id = customer.id
      and offer.contractor_id = v_contractor_id
    where customer.contractor_id = v_contractor_id
      and (v_query = '' or position(lower(v_query) in lower(customer.name)) > 0)
    group by customer.id, customer.name
  )
  select
    summary.id,
    summary.name,
    summary.offer_count,
    summary.last_activity,
    v_total,
    v_page
  from customer_summaries as summary
  order by summary.name, summary.id
  limit p_page_size
  offset (v_page - 1) * p_page_size;
end;
$$;

revoke all on function public.list_contractor_customers(text, integer, integer) from public;
revoke all on function public.list_contractor_customers(text, integer, integer) from anon;
grant execute on function public.list_contractor_customers(text, integer, integer) to authenticated;

create function public.list_contractor_customer_offer_page(
  p_customer_id uuid,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  offer_id uuid,
  original_scope text,
  status text,
  currency_code text,
  current_amount_minor text,
  current_deadline date,
  created_at timestamptz,
  total_offers bigint,
  page integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_total bigint;
  v_page integer;
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;

  if p_customer_id is null or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Invalid offer page request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.customers as customer
    where customer.id = p_customer_id
      and customer.contractor_id = v_contractor_id
  ) then
    return;
  end if;

  select count(*)
    into v_total
    from public.offers as offer
    where offer.customer_id = p_customer_id
      and offer.contractor_id = v_contractor_id;

  v_page := greatest(
    1,
    least(
      greatest(coalesce(p_page, 1), 1),
      greatest(1, ceil(v_total::numeric / p_page_size)::integer)
    )
  );

  return query
  with offer_page as materialized (
    select
      offer.id,
      offer.base_scope,
      offer.status,
      offer.currency_code,
      offer.base_amount_minor,
      offer.base_deadline,
      offer.created_at
    from public.offers as offer
    where offer.customer_id = p_customer_id
      and offer.contractor_id = v_contractor_id
    order by offer.created_at desc, offer.id desc
    limit p_page_size
    offset (v_page - 1) * p_page_size
  )
  select
    page.id,
    page.base_scope,
    page.status,
    page.currency_code,
    (page.base_amount_minor + coalesce(changes.price_delta_minor, 0))::text,
    page.base_deadline + coalesce(changes.deadline_delta_days, 0)::integer,
    page.created_at,
    v_total,
    v_page
  from offer_page as page
  left join lateral (
    select
      sum(change.price_delta_minor) as price_delta_minor,
      sum(change.deadline_delta_days) as deadline_delta_days
    from public.offer_changes as change
    where change.offer_id = page.id
      and change.contractor_id = v_contractor_id
      and change.status in ('accepted', 'agreed')
  ) as changes on true
  order by page.created_at desc, page.id desc;
end;
$$;

revoke all on function public.list_contractor_customer_offer_page(uuid, integer, integer) from public;
revoke all on function public.list_contractor_customer_offer_page(uuid, integer, integer) from anon;
grant execute on function public.list_contractor_customer_offer_page(uuid, integer, integer) to authenticated;

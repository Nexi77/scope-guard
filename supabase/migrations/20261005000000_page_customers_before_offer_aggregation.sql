create or replace function public.list_contractor_customers(
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
  with customer_page as materialized (
    select customer.id, customer.name
    from public.customers as customer
    where customer.contractor_id = v_contractor_id
      and (v_query = '' or position(lower(v_query) in lower(customer.name)) > 0)
    order by customer.name, customer.id
    limit p_page_size
    offset (v_page - 1) * p_page_size
  ), customer_summaries as (
    select
      customer.id,
      customer.name,
      count(offer.id)::bigint as offer_count,
      max(offer.updated_at) as last_activity
    from customer_page as customer
    left join public.offers as offer
      on offer.customer_id = customer.id
      and offer.contractor_id = v_contractor_id
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
  order by summary.name, summary.id;
end;
$$;

revoke all on function public.list_contractor_customers(text, integer, integer) from public;
revoke all on function public.list_contractor_customers(text, integer, integer) from anon;
grant execute on function public.list_contractor_customers(text, integer, integer) to authenticated;

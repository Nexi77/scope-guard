create function public.list_customer_offers(
  p_customer_id uuid,
  p_limit integer,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  offer_id uuid,
  original_scope text,
  status text,
  currency_code text,
  current_amount_minor text,
  current_deadline date,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;

  if p_customer_id is null
    or p_limit is null
    or p_limit < 1
    or p_limit > 100
    or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid offer page request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.customers as customer
    where customer.id = p_customer_id
      and customer.contractor_id = auth.uid()
  ) then
    return;
  end if;

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
      and offer.contractor_id = auth.uid()
      and (
        p_before_created_at is null
        or (offer.created_at, offer.id) < (p_before_created_at, p_before_id)
      )
    order by offer.created_at desc, offer.id desc
    limit p_limit
  )
  select
    page.id,
    page.base_scope,
    page.status,
    page.currency_code,
    (page.base_amount_minor + coalesce(changes.price_delta_minor, 0))::text,
    page.base_deadline + coalesce(changes.deadline_delta_days, 0)::integer,
    page.created_at
  from offer_page as page
  left join lateral (
    select sum(change.price_delta_minor) as price_delta_minor,
      sum(change.deadline_delta_days) as deadline_delta_days
    from public.offer_changes as change
    where change.offer_id = page.id
      and change.contractor_id = auth.uid()
      and change.status in ('accepted', 'agreed')
  ) as changes on true
  order by page.created_at desc, page.id desc;
end;
$$;

revoke all on function public.list_customer_offers(uuid, integer, timestamptz, uuid) from public;
revoke all on function public.list_customer_offers(uuid, integer, timestamptz, uuid) from anon;
grant execute on function public.list_customer_offers(uuid, integer, timestamptz, uuid) to authenticated;

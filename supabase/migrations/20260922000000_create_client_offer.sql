create function public.create_offer_with_customer(
  p_customer_id uuid,
  p_customer_name text,
  p_confirm_duplicate boolean,
  p_base_scope text,
  p_base_amount_minor bigint,
  p_currency_code text,
  p_base_deadline date
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

  if p_base_amount_minor is null or p_base_amount_minor < 0 then
    raise exception 'Base amount must be non-negative' using errcode = 'P0001';
  end if;

  if v_currency_code is null or v_currency_code <> 'PLN' then
    raise exception 'Currency must be PLN' using errcode = 'P0001';
  end if;

  if p_base_deadline is null or p_base_deadline < current_date then
    raise exception 'Base deadline cannot be in the past' using errcode = 'P0001';
  end if;

  if p_customer_id is not null then
    select customers.id
      into v_customer_id
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

    perform pg_advisory_xact_lock(
      hashtextextended(v_contractor_id::text || ':' || lower(v_customer_name), 0)
    );

    if exists (
      select 1
      from public.customers
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
    contractor_id,
    customer_id,
    base_scope,
    base_amount_minor,
    currency_code,
    base_deadline
  )
  values (
    v_contractor_id,
    v_customer_id,
    v_base_scope,
    p_base_amount_minor,
    v_currency_code,
    p_base_deadline
  )
  returning id into v_offer_id;

  return query select v_offer_id, v_customer_id;
end;
$$;

revoke all on function public.create_offer_with_customer(uuid, text, boolean, text, bigint, text, date)
  from public;
grant execute on function public.create_offer_with_customer(uuid, text, boolean, text, bigint, text, date)
  to authenticated;

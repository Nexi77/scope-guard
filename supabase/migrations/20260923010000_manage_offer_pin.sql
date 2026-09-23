create function public.set_offer_pin(p_offer_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_pin_hash text;
begin
  if v_contractor_id is null then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must contain exactly six digits' using errcode = 'P0001';
  end if;

  select offers.pin_hash
    into v_pin_hash
    from public.offers
    where offers.id = p_offer_id
      and offers.contractor_id = v_contractor_id
    for update;

  if not found then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;

  if v_pin_hash is not null
    and extensions.crypt(p_pin, v_pin_hash) = v_pin_hash then
    raise exception 'PIN must differ from the current PIN' using errcode = 'P0001';
  end if;

  update public.offers
    set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
        updated_at = now()
    where offers.id = p_offer_id
      and offers.contractor_id = v_contractor_id;

  return true;
end;
$$;

revoke all on function public.set_offer_pin(uuid, text) from public, anon;
grant execute on function public.set_offer_pin(uuid, text) to authenticated;

create function public.lock_offer_before_change_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from new.contractor_id then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;

  perform 1
    from public.offers
    where id = new.offer_id
      and contractor_id = new.contractor_id
    for update;
  if not found then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.lock_offer_before_change_insert() from public, anon, authenticated;

create trigger lock_offer_before_change_insert
  before insert on public.offer_changes
  for each row
  execute function public.lock_offer_before_change_insert();

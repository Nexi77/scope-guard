-- Keep the existing item-edit command for callers, but make every edit a
-- superseding pending-offer revision instead of mutating the presented snapshot.
create or replace function public.edit_offer_items(
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

  perform public.replace_pending_offer_revision(
    v_offer.id, v_offer.base_revision, v_offer.base_scope, v_offer.base_deadline, p_items
  );
  return v_offer.items_revision + 1;
end;
$$;

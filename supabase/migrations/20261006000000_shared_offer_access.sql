create function public.manage_shared_offer_access(p_offer_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_offer public.offers%rowtype;
begin
  if v_contractor_id is null then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;
  if p_action is null or p_action not in ('revoke', 'reshare') then
    raise exception 'Invalid share action' using errcode = 'P0001';
  end if;

  select * into v_offer
    from public.offers
    where id = p_offer_id and contractor_id = v_contractor_id
    for update;
  if not found then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;

  if p_action = 'revoke' then
    update public.offers
      set share_link_revoked_at = coalesce(share_link_revoked_at, now()), updated_at = now()
      where id = v_offer.id
      returning * into v_offer;
    return jsonb_build_object('action', 'revoke', 'revoked', true);
  end if;

  if v_offer.share_link_revoked_at is null then
    raise exception 'Share link must be revoked before re-sharing' using errcode = 'P0001';
  end if;
  update public.offers
    set share_token = gen_random_uuid(), share_link_revoked_at = null, updated_at = now()
    where id = v_offer.id
    returning * into v_offer;
  return jsonb_build_object('action', 'reshare', 'revoked', false, 'share_token', v_offer.share_token);
end;
$$;

revoke all on function public.manage_shared_offer_access(uuid, text) from public, anon;
grant execute on function public.manage_shared_offer_access(uuid, text) to authenticated;

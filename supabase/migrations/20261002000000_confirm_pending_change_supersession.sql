-- Serialize publication against the pending proposal the contractor actually saw.
-- The original publication command remains internal to this guarded wrapper.
create function public.publish_offer_change_checked(
  p_offer_id uuid,
  p_expected_scope_revision bigint,
  p_description text,
  p_price_delta_minor bigint,
  p_deadline_delta_days integer,
  p_estimate_snapshot jsonb,
  p_item_effects jsonb,
  p_confirmed_impact boolean,
  p_expected_pending_change_id uuid,
  p_supersession_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_offer_id uuid;
  v_pending_change_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;
  select id into v_offer_id from public.offers
    where id = p_offer_id and contractor_id = auth.uid() for update;
  if not found then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;
  select id into v_pending_change_id from public.offer_changes
    where offer_id = v_offer_id and status = 'pending';
  if v_pending_change_id is distinct from p_expected_pending_change_id then
    raise exception 'Pending proposal changed; reload before publishing' using errcode = 'PT409';
  end if;
  if v_pending_change_id is not null and p_supersession_confirmed is not true then
    raise exception 'Confirm replacement of the pending proposal' using errcode = 'P0001';
  end if;
  return public.publish_offer_change(
    p_offer_id, p_expected_scope_revision, p_description, p_price_delta_minor,
    p_deadline_delta_days, p_estimate_snapshot, p_item_effects, p_confirmed_impact
  );
end;
$$;

revoke all on function public.publish_offer_change(uuid, bigint, text, bigint, integer, jsonb, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.publish_offer_change_checked(uuid, bigint, text, bigint, integer, jsonb, jsonb, boolean, uuid, boolean)
  from public, anon;
grant execute on function public.publish_offer_change_checked(uuid, bigint, text, bigint, integer, jsonb, jsonb, boolean, uuid, boolean)
  to authenticated;

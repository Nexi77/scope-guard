create or replace function public.replace_pending_offer_revision(
  p_offer_id uuid,
  p_expected_revision bigint,
  p_base_scope text,
  p_base_deadline date,
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
  v_total bigint;
  v_revision bigint;
  v_revision_id uuid;
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers
    where id = p_offer_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'Offer is unavailable' using errcode = 'P0001'; end if;
  if v_offer.status <> 'pending' then
    raise exception 'Only an unaccepted offer can be revised' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.offer_changes where offer_id = v_offer.id) then
    raise exception 'Offer change history prevents revision' using errcode = 'PT409';
  end if;
  if p_expected_revision is distinct from v_offer.base_revision then
    raise exception 'Offer revision changed; reload before editing' using errcode = 'P0001';
  end if;
  if p_base_scope is null or char_length(btrim(p_base_scope)) not between 1 and 4000
    or p_base_deadline is null or p_base_deadline < current_date then
    raise exception 'Offer revision details are invalid' using errcode = 'P0001';
  end if;

  update public.offer_revisions set status = 'superseded'
    where offer_id = v_offer.id and status = 'pending';
  v_total := public.apply_offer_items(v_offer.id, v_contractor_id, p_items, true);
  v_revision := v_offer.base_revision + 1;
  update public.offers set base_scope = btrim(p_base_scope), base_deadline = p_base_deadline,
      base_amount_minor = v_total, base_revision = v_revision,
      items_revision = items_revision + 1, updated_at = now()
    where id = v_offer.id;
  insert into public.offer_revisions (
    offer_id, contractor_id, revision, base_scope, base_amount_minor,
    currency_code, base_deadline, items, status
  ) values (
    v_offer.id, v_contractor_id, v_revision, btrim(p_base_scope), v_total,
    v_offer.currency_code, p_base_deadline, public.offer_item_snapshot(v_offer.id), 'pending'
  ) returning id into v_revision_id;
  update public.offer_revisions set superseded_by = v_revision_id
    where offer_id = v_offer.id and status = 'superseded' and superseded_by is null;
  return v_revision;
end;
$$;

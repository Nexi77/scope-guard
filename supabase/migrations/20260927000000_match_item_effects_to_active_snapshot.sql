create or replace function public.publish_offer_change(
  p_offer_id uuid,
  p_expected_scope_revision bigint,
  p_description text,
  p_price_delta_minor bigint,
  p_deadline_delta_days integer,
  p_estimate_snapshot jsonb,
  p_item_effects jsonb,
  p_confirmed_impact boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_contractor_id uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_change_id uuid;
  v_superseded_ids uuid[] := '{}'::uuid[];
  v_status text;
  v_effect jsonb;
  v_before jsonb;
  v_after jsonb;
  v_current jsonb;
  v_item_id uuid;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_active_items jsonb;
  v_item_delta numeric := 0;
  v_commercial_adjustment numeric := 0;
begin
  if v_contractor_id is null then
    raise exception 'Authentication is required' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers
    where id = p_offer_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'Offer is unavailable' using errcode = 'P0001'; end if;
  if v_offer.status not in ('accepted', 'agreed') then
    raise exception 'Offer must be accepted before recording a change' using errcode = 'P0001';
  end if;
  if p_expected_scope_revision is distinct from v_offer.active_scope_revision then
    raise exception 'Offer scope changed; reload before publishing' using errcode = 'P0001';
  end if;
  if (p_estimate_snapshot ->> 'scope_revision')::bigint is distinct from p_expected_scope_revision then
    raise exception 'Estimate snapshot does not match the active scope revision' using errcode = 'P0001';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 1 and 4000
    or p_estimate_snapshot is null or jsonb_typeof(p_estimate_snapshot) <> 'object'
    or p_item_effects is null or jsonb_typeof(p_item_effects) <> 'array'
    or jsonb_array_length(p_item_effects) > 100
    or (p_price_delta_minor is null and p_deadline_delta_days is null)
    or (p_price_delta_minor = 0 and p_deadline_delta_days is null)
    or (p_deadline_delta_days = 0 and p_price_delta_minor is null)
    or (p_price_delta_minor is not null and abs(p_price_delta_minor::numeric) > 9999999999999999)
    or p_confirmed_impact is not true then
    raise exception 'Confirmed change details are invalid' using errcode = 'P0001';
  end if;
  v_active_items := public.get_effective_offer_items(v_offer.id);
  begin
    v_commercial_adjustment := coalesce((p_estimate_snapshot ->> 'commercial_adjustment_minor')::numeric, 0);
  exception when others then
    raise exception 'Commercial adjustment is invalid' using errcode = 'P0001';
  end;
  if v_commercial_adjustment <> trunc(v_commercial_adjustment)
    or abs(v_commercial_adjustment) > 9999999999999999 then
    raise exception 'Commercial adjustment is outside supported bounds' using errcode = 'P0001';
  end if;
  for v_effect in select value from jsonb_array_elements(p_item_effects)
  loop
    if jsonb_typeof(v_effect) <> 'object'
      or not (v_effect ?& array['item_id', 'before', 'after'])
      or (v_effect - array['item_id', 'before', 'after']) <> '{}'::jsonb
      or jsonb_typeof(v_effect -> 'item_id') <> 'string'
      or (v_effect -> 'before') = 'null'::jsonb and (v_effect -> 'after') = 'null'::jsonb then
      raise exception 'Item effect is invalid' using errcode = 'P0001';
    end if;
    begin
      v_item_id := (v_effect ->> 'item_id')::uuid;
    exception when others then
      raise exception 'Item effect identity is invalid' using errcode = 'P0001';
    end;
    if v_item_id = any(v_seen_ids) then
      raise exception 'Item effects must use unique item IDs' using errcode = 'P0001';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_item_id);
    select value into v_current from jsonb_array_elements(v_active_items) where value ->> 'id' = v_item_id::text;
    v_before := v_effect -> 'before';
    v_after := v_effect -> 'after';
    if v_before is null or v_before = 'null'::jsonb then
      if v_current is not null then
        raise exception 'Added item identity is already active' using errcode = 'P0001';
      end if;
    else
      -- The active projection adds this derived field; item effects contain only persisted item fields.
      if v_current is null or v_before <> (v_current - 'line_amount_minor') then
        raise exception 'Item before-state does not match the active scope' using errcode = 'P0001';
      end if;
      v_item_delta := v_item_delta - round((v_before ->> 'quantity')::numeric * (v_before ->> 'selling_rate_minor')::numeric);
    end if;
    if v_after is not null and v_after <> 'null'::jsonb then
      if jsonb_typeof(v_after) <> 'object'
        or not (v_after ?& array['id', 'name', 'quantity', 'unit', 'specification', 'selling_rate_minor', 'labor_hours_per_unit'])
        or (v_after - array['id', 'name', 'quantity', 'unit', 'specification', 'selling_rate_minor', 'labor_hours_per_unit']) <> '{}'::jsonb
        or v_after ->> 'id' <> v_item_id::text
        or jsonb_typeof(v_after -> 'quantity') <> 'number'
        or jsonb_typeof(v_after -> 'selling_rate_minor') <> 'number'
        or jsonb_typeof(v_after -> 'labor_hours_per_unit') <> 'number'
        or jsonb_typeof(v_after -> 'name') <> 'string'
        or jsonb_typeof(v_after -> 'unit') <> 'string'
        or jsonb_typeof(v_after -> 'specification') <> 'string'
        or (v_after ->> 'quantity')::numeric <= 0
        or (v_after ->> 'quantity')::numeric >= 1000000000
        or (v_after ->> 'quantity')::numeric <> trunc((v_after ->> 'quantity')::numeric, 3)
        or (v_after ->> 'selling_rate_minor')::numeric < 0
        or (v_after ->> 'selling_rate_minor')::numeric > 9999999999999999
        or (v_after ->> 'selling_rate_minor')::numeric <> trunc((v_after ->> 'selling_rate_minor')::numeric)
        or (v_after ->> 'labor_hours_per_unit')::numeric < 0
        or (v_after ->> 'labor_hours_per_unit')::numeric >= 1000000000
        or (v_after ->> 'labor_hours_per_unit')::numeric <> trunc((v_after ->> 'labor_hours_per_unit')::numeric, 3)
        or v_after ->> 'unit' not in ('piece', 'set', 'm', 'm²', 'm³', 'kg', 'l', 'hour')
        or char_length(btrim(v_after ->> 'name')) not between 1 and 200
        or char_length(btrim(v_after ->> 'specification')) not between 1 and 2000
        or round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric) > 9999999999999999 then
        raise exception 'Item after-state is invalid' using errcode = 'P0001';
      end if;
      v_item_delta := v_item_delta + round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric);
    end if;
  end loop;
  if v_item_delta + v_commercial_adjustment <> coalesce(p_price_delta_minor, 0) then
    raise exception 'Confirmed price must reconcile to item effects and commercial adjustment' using errcode = 'P0001';
  end if;
  if (v_offer.base_amount_minor + coalesce((
      select sum(price_delta_minor) from public.offer_changes
      where offer_id = v_offer.id and status in ('accepted', 'agreed')
    ), 0) + coalesce(p_price_delta_minor, 0)) < 0 then
    raise exception 'Active offer amount cannot be negative' using errcode = 'P0001';
  end if;

  with superseded as (
    update public.offer_changes set status = 'superseded', updated_at = now()
      where offer_id = v_offer.id and status = 'pending'
      returning id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into v_superseded_ids from superseded;
  v_status := case when coalesce(p_price_delta_minor, 0) = 0
      and coalesce(p_deadline_delta_days, 0) = 0 then 'agreed' else 'pending' end;
  insert into public.offer_changes (
    contractor_id, offer_id, description, price_delta_minor, deadline_delta_days,
    status, proposal_revision, estimate_snapshot, item_effects
  ) values (
    v_contractor_id, v_offer.id, btrim(p_description),
    nullif(p_price_delta_minor, 0), nullif(p_deadline_delta_days, 0), v_status,
    coalesce((select max(proposal_revision) + 1 from public.offer_changes where offer_id = v_offer.id), 1),
    p_estimate_snapshot, p_item_effects
  ) returning id into v_change_id;
  update public.offer_changes set superseded_by = v_change_id
    where id = any(v_superseded_ids);

  if v_status = 'agreed' then
    update public.offer_changes set activation_order = nextval('public.offer_change_activation_order_seq')
      where id = v_change_id;
  end if;
  update public.offers set active_scope_revision = active_scope_revision + 1, updated_at = now()
    where id = v_offer.id and v_status = 'agreed';
  return v_change_id;
end;
$$;

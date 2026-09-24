-- One internal projection supplies current item values to both guarded read commands.
create function public.project_effective_offer_items(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_items jsonb := public.offer_item_snapshot(p_offer_id);
  v_next jsonb;
  v_change record;
  v_effect jsonb;
  v_item jsonb;
  v_after jsonb;
  v_item_id text;
  v_found boolean;
begin
  for v_change in
    select item_effects from public.offer_changes
    where offer_id = p_offer_id and status in ('accepted', 'agreed')
    order by activation_order nulls last, created_at, id
  loop
    for v_effect in select value from jsonb_array_elements(v_change.item_effects)
    loop
      v_item_id := coalesce(v_effect ->> 'item_id', v_effect -> 'before' ->> 'id', v_effect -> 'after' ->> 'id');
      v_after := v_effect -> 'after';
      v_next := '[]'::jsonb;
      v_found := false;
      for v_item in select value from jsonb_array_elements(v_items)
      loop
        if v_item ->> 'id' = v_item_id then
          v_found := true;
          if v_after is not null and v_after <> 'null'::jsonb then
            v_next := v_next || jsonb_build_array(v_after || jsonb_build_object(
              'line_amount_minor', round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric)
            ));
          end if;
        else
          v_next := v_next || jsonb_build_array(v_item);
        end if;
      end loop;
      if not v_found and v_after is not null and v_after <> 'null'::jsonb then
        v_next := v_next || jsonb_build_array(v_after || jsonb_build_object(
          'line_amount_minor', round((v_after ->> 'quantity')::numeric * (v_after ->> 'selling_rate_minor')::numeric)
        ));
      end if;
      v_items := v_next;
    end loop;
  end loop;
  return v_items;
end;
$$;

revoke all on function public.project_effective_offer_items(uuid) from public, anon, authenticated;

create or replace function public.get_effective_offer_items(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.offers where id = p_offer_id and contractor_id = auth.uid()
  ) then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;
  return public.project_effective_offer_items(p_offer_id);
end;
$$;

create function public.current_offer_projection(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_offer public.offers%rowtype;
  v_items jsonb;
  v_public_items jsonb;
  v_active_changes jsonb;
  v_history jsonb;
  v_price_delta bigint;
  v_day_delta integer;
begin
  select * into v_offer from public.offers where id = p_offer_id;
  if not found then return null; end if;
  v_items := public.project_effective_offer_items(p_offer_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', value ->> 'id', 'name', value ->> 'name',
      'quantity', value -> 'quantity', 'unit', value ->> 'unit',
      'specification', value ->> 'specification',
      'selling_rate_minor', value ->> 'selling_rate_minor',
      'line_amount_minor', value ->> 'line_amount_minor'
    ) order by ordinal), '[]'::jsonb)
    into v_public_items from jsonb_array_elements(v_items) with ordinality as item(value, ordinal);

  select coalesce(sum(price_delta_minor), 0)::bigint,
      coalesce(sum(deadline_delta_days), 0)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'description', description, 'price_delta_minor', price_delta_minor::text,
        'deadline_delta_days', deadline_delta_days, 'status', status,
        'proposal_revision', proposal_revision, 'activation_order', activation_order,
        'price_explanation', coalesce(estimate_snapshot ->> 'explanation', description),
        'price_breakdown', jsonb_build_object(
          'item_effects_delta_minor', estimate_snapshot ->> 'item_effects_delta_minor',
          'credit_reconciliation_minor', estimate_snapshot ->> 'credit_reconciliation_minor',
          'consequence_delta_minor', estimate_snapshot ->> 'consequence_delta_minor',
          'commercial_adjustment_minor', estimate_snapshot ->> 'contractor_commercial_adjustment_minor',
          'commercial_adjustment_reason', estimate_snapshot ->> 'commercial_adjustment_reason'),
        'legacy_adjustment', estimate_snapshot = '{}'::jsonb
      ) order by activation_order nulls last, created_at, id), '[]'::jsonb)
    into v_price_delta, v_day_delta, v_active_changes
    from public.offer_changes
    where offer_id = p_offer_id and status in ('accepted', 'agreed');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'description', c.description,
      'price_delta_minor', c.price_delta_minor::text, 'deadline_delta_days', c.deadline_delta_days,
      'status', c.status, 'proposal_revision', c.proposal_revision,
      'superseded_by', c.superseded_by,
      'price_explanation', coalesce(c.estimate_snapshot ->> 'explanation', c.description),
      'price_breakdown', jsonb_build_object(
        'item_effects_delta_minor', c.estimate_snapshot ->> 'item_effects_delta_minor',
        'credit_reconciliation_minor', c.estimate_snapshot ->> 'credit_reconciliation_minor',
        'consequence_delta_minor', c.estimate_snapshot ->> 'consequence_delta_minor',
        'commercial_adjustment_minor', c.estimate_snapshot ->> 'contractor_commercial_adjustment_minor',
        'commercial_adjustment_reason', c.estimate_snapshot ->> 'commercial_adjustment_reason'),
      'decision', case when d.id is null then null else jsonb_build_object(
        'outcome', d.outcome, 'rejection_comment', d.rejection_comment,
        'decided_at', d.decided_at) end
    ) order by c.created_at, c.id), '[]'::jsonb)
    into v_history
    from public.offer_changes c
    left join public.change_decisions d on d.offer_change_id = c.id
    where c.offer_id = p_offer_id;

  return jsonb_build_object(
    'id', v_offer.id, 'status', v_offer.status, 'currency_code', v_offer.currency_code,
    'active_scope', jsonb_build_object('base_scope', v_offer.base_scope,
      'items', v_public_items, 'accepted_changes', v_active_changes),
    'active_amount_minor', (v_offer.base_amount_minor + v_price_delta)::text,
    'active_deadline', v_offer.base_deadline + v_day_delta,
    'changes', v_history
  );
end;
$$;

revoke all on function public.current_offer_projection(uuid) from public, anon, authenticated;

create or replace function public.get_shared_offer(p_share_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_offer_id uuid;
begin
  select id into v_offer_id from public.offers
    where share_token = p_share_token and share_link_revoked_at is null;
  if not found then return null; end if;
  return public.current_offer_projection(v_offer_id);
end;
$$;

create function public.get_contractor_offer_current(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.offers where id = p_offer_id and contractor_id = auth.uid()
  ) then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;
  return public.current_offer_projection(p_offer_id);
end;
$$;

revoke all on function public.get_contractor_offer_current(uuid) from public, anon;
grant execute on function public.get_contractor_offer_current(uuid) to authenticated;

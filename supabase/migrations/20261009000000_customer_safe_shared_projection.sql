-- Keep anonymous shared reads limited to fields rendered to the customer.
create or replace function public.get_shared_offer(p_share_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_offer_id uuid;
  v_scope_revision bigint;
  v_projection jsonb;
begin
  select id, active_scope_revision
    into v_offer_id, v_scope_revision
    from public.offers
    where share_token = p_share_token and share_link_revoked_at is null;
  if not found then
    return null;
  end if;

  v_projection := public.current_offer_projection(v_offer_id);
  return jsonb_build_object(
    'id', v_projection -> 'id',
    'status', v_projection -> 'status',
    'currency_code', v_projection -> 'currency_code',
    'active_scope', jsonb_build_object(
      'base_scope', v_projection #> '{active_scope,base_scope}',
      'items', v_projection #> '{active_scope,items}'
    ),
    'active_amount_minor', v_projection -> 'active_amount_minor',
    'active_deadline', v_projection -> 'active_deadline',
    'changes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.value -> 'id',
        'description', c.value -> 'description',
        'price_delta_minor', c.value -> 'price_delta_minor',
        'deadline_delta_days', c.value -> 'deadline_delta_days',
        'status', c.value -> 'status',
        'proposal_revision', c.value -> 'proposal_revision',
        'superseded_by', c.value -> 'superseded_by',
        'decision', c.value -> 'decision'
      ) order by c.ordinal), '[]'::jsonb)
      from jsonb_array_elements(v_projection -> 'changes') with ordinality as c(value, ordinal)
    )
  )
    || public.current_base_revision_projection(v_offer_id)
    || jsonb_build_object('active_scope_revision', v_scope_revision);
end;
$$;

revoke all on function public.get_shared_offer(uuid) from public, authenticated;
grant execute on function public.get_shared_offer(uuid) to anon;

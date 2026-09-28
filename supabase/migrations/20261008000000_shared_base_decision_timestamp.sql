-- Add only the persisted decision time to the guarded customer-safe base target.
create or replace function public.current_base_revision_projection(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_revision jsonb;
begin
  select jsonb_build_object(
      'id', r.id,
      'revision', r.revision,
      'status', r.status,
      'decided_at', r.decided_at
    )
    into v_revision
    from public.offers o
    join public.offer_revisions r
      on r.offer_id = o.id and r.revision = o.base_revision
    where o.id = p_offer_id;
  if not found then
    raise exception 'Current offer revision is unavailable' using errcode = 'P0001';
  end if;
  return jsonb_build_object('base_revision', v_revision);
end;
$$;

revoke all on function public.current_base_revision_projection(uuid) from public, anon, authenticated;

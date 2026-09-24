-- Expose only the current base revision identity through the guarded offer reads.
-- The customer decision command needs this exact ID to reject stale open views.
create function public.current_base_revision_projection(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_revision jsonb;
begin
  select jsonb_build_object('id', r.id, 'revision', r.revision, 'status', r.status)
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
  return public.current_offer_projection(v_offer_id)
    || public.current_base_revision_projection(v_offer_id);
end;
$$;

create or replace function public.get_contractor_offer_current(p_offer_id uuid)
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
  return public.current_offer_projection(p_offer_id)
    || public.current_base_revision_projection(p_offer_id);
end;
$$;

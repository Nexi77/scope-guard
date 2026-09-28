-- Customer decisions are accepted only through the server's rate-limited endpoint.
create or replace function public.decide_customer_offer_revision(
  p_share_token uuid, p_offer_revision_id uuid, p_expected_base_revision bigint,
  p_expected_active_scope_revision bigint, p_pin text, p_outcome text,
  p_rejection_comment text default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_offer public.offers%rowtype; v_revision public.offer_revisions%rowtype;
begin
  select * into v_offer from public.offers where share_token = p_share_token and share_link_revoked_at is null for update;
  if not found or v_offer.pin_hash is null or p_pin is null
    or p_pin !~ '^[0-9]{6}$' or extensions.crypt(p_pin, v_offer.pin_hash) is distinct from v_offer.pin_hash then
    raise exception 'Invalid shared offer or PIN' using errcode = 'P0001';
  end if;
  select * into v_revision from public.offer_revisions where id = p_offer_revision_id and offer_id = v_offer.id for update;
  if not found then raise exception 'Invalid decision request' using errcode = 'P0001'; end if;
  if v_revision.decision_outcome is not null then
    return jsonb_build_object('target_id', v_revision.id, 'outcome', v_revision.decision_outcome, 'decided_at', v_revision.decided_at);
  end if;
  if p_outcome is null or p_outcome not in ('accepted','rejected')
    or (p_outcome = 'rejected' and coalesce(btrim(p_rejection_comment),'') = '') then
    raise exception 'Invalid decision request' using errcode = 'P0001';
  end if;
  if p_expected_base_revision is distinct from v_offer.base_revision
    or p_expected_active_scope_revision is distinct from v_offer.active_scope_revision
    or v_revision.status <> 'pending' or v_revision.revision <> v_offer.base_revision then
    raise exception 'Offer revision is stale or superseded' using errcode = 'PT409';
  end if;
  update public.offer_revisions set status=p_outcome, decision_outcome=p_outcome,
    rejection_comment=case when p_outcome='rejected' then btrim(p_rejection_comment) end, decided_at=now()
    where id=v_revision.id returning * into v_revision;
  update public.offers set status=p_outcome, updated_at=now() where id=v_offer.id;
  return jsonb_build_object('target_id',v_revision.id,'outcome',v_revision.decision_outcome,'decided_at',v_revision.decided_at);
end $$;

create or replace function public.decide_customer_offer_change(
  p_share_token uuid, p_offer_change_id uuid, p_expected_base_revision bigint,
  p_expected_active_scope_revision bigint, p_pin text, p_outcome text,
  p_rejection_comment text default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_offer public.offers%rowtype; v_change public.offer_changes%rowtype; v_decision public.change_decisions%rowtype;
  v_offer_status text;
begin
  select * into v_offer from public.offers where share_token=p_share_token and share_link_revoked_at is null for update;
  if not found or v_offer.pin_hash is null or p_pin is null
    or p_pin !~ '^[0-9]{6}$' or extensions.crypt(p_pin,v_offer.pin_hash) is distinct from v_offer.pin_hash then
    raise exception 'Invalid shared offer or PIN' using errcode='P0001';
  end if;
  select * into v_change from public.offer_changes where id=p_offer_change_id and offer_id=v_offer.id for update;
  if not found then raise exception 'Invalid decision request' using errcode='P0001'; end if;
  select * into v_decision from public.change_decisions where offer_change_id=v_change.id;
  if found then return jsonb_build_object('target_id',v_change.id,'outcome',v_decision.outcome,'decided_at',v_decision.decided_at); end if;
  if p_outcome is null or p_outcome not in ('accepted','rejected')
    or (p_outcome='rejected' and coalesce(btrim(p_rejection_comment),'')='') then
    raise exception 'Invalid decision request' using errcode='P0001';
  end if;
  if p_expected_base_revision is distinct from v_offer.base_revision
    or p_expected_active_scope_revision is distinct from v_offer.active_scope_revision
    or v_change.status <> 'pending' then
    raise exception 'Change is stale or superseded' using errcode='PT409';
  end if;
  insert into public.change_decisions(contractor_id,offer_change_id,outcome,rejection_comment)
    values(v_change.contractor_id,v_change.id,p_outcome,case when p_outcome='rejected' then btrim(p_rejection_comment) end)
    returning * into v_decision;
  update public.offer_changes set status=p_outcome,updated_at=now(),activation_order=case when p_outcome='accepted' then nextval('public.offer_change_activation_order_seq') else null end where id=v_change.id;
  v_offer_status:=case when p_outcome='accepted' then 'accepted' when v_offer.status in ('accepted','agreed') then v_offer.status else 'rejected' end;
  update public.offers set status=v_offer_status,active_scope_revision=active_scope_revision+case when p_outcome='accepted' then 1 else 0 end,updated_at=now() where id=v_offer.id;
  return jsonb_build_object('target_id',v_change.id,'outcome',v_decision.outcome,'decided_at',v_decision.decided_at);
end $$;

revoke all on function public.decide_shared_offer_revision(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.decide_shared_offer_change(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.decide_customer_offer_revision(uuid,uuid,bigint,bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.decide_customer_offer_change(uuid,uuid,bigint,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.decide_customer_offer_revision(uuid,uuid,bigint,bigint,text,text,text) to service_role;
grant execute on function public.decide_customer_offer_change(uuid,uuid,bigint,bigint,text,text,text) to service_role;

create or replace function public.get_shared_offer(p_share_token uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_offer_id uuid; v_scope_revision bigint;
begin
  select id,active_scope_revision into v_offer_id,v_scope_revision from public.offers
    where share_token=p_share_token and share_link_revoked_at is null;
  if not found then return null; end if;
  return public.current_offer_projection(v_offer_id) || public.current_base_revision_projection(v_offer_id)
    || jsonb_build_object('active_scope_revision',v_scope_revision);
end $$;
revoke all on function public.get_shared_offer(uuid) from public,authenticated;
grant execute on function public.get_shared_offer(uuid) to anon;

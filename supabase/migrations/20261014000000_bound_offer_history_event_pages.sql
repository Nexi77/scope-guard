create or replace function public.get_contractor_offer_history_page(
  p_offer_id uuid,
  p_cursor jsonb default null,
  p_page_size integer default 25,
  p_target_record_id uuid default null,
  p_target_record_kind text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  v_direction text := coalesce(p_cursor ->> 'direction', 'after');
  v_cursor_at timestamptz;
  v_cursor_priority integer;
  v_cursor_stable_id text;
  v_target_stable_id text;
  v_target_at timestamptz;
  v_rows jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_first jsonb;
  v_last jsonb;
  v_has_previous boolean := false;
  v_has_next boolean := false;
  v_previous_cursor jsonb;
  v_next_cursor jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.offers
    where id = p_offer_id and contractor_id = auth.uid()
  ) then
    raise exception 'Offer is unavailable' using errcode = 'P0001';
  end if;

  if p_cursor is not null then
    if v_direction not in ('after', 'before')
      or nullif(p_cursor ->> 'at', '') is null
      or nullif(p_cursor ->> 'priority', '') is null
      or nullif(p_cursor ->> 'stable_id', '') is null then
      raise exception 'History cursor is invalid' using errcode = '22023';
    end if;
    begin
      v_cursor_at := (p_cursor ->> 'at')::timestamptz;
      v_cursor_priority := (p_cursor ->> 'priority')::integer;
      v_cursor_stable_id := p_cursor ->> 'stable_id';
    exception when others then
      raise exception 'History cursor is invalid' using errcode = '22023';
    end;
  elsif p_target_record_id is not null then
    if p_target_record_kind not in ('revision', 'change') then
      raise exception 'History target is invalid' using errcode = '22023';
    end if;
    v_target_stable_id := p_target_record_kind || ':' || p_target_record_id::text;
    if p_target_record_kind = 'revision' then
      select r.created_at into v_target_at from public.offer_revisions r
        where r.id = p_target_record_id and r.offer_id = p_offer_id and r.contractor_id = auth.uid();
    else
      select c.created_at into v_target_at from public.offer_changes c
        where c.id = p_target_record_id and c.offer_id = p_offer_id and c.contractor_id = auth.uid();
    end if;
  end if;

  with history_keys as (
    select r.created_at as event_at, 1 as event_priority, 'revision:' || r.id::text as stable_id,
      'revision'::text as kind, r.id as record_id
    from public.offer_revisions r
    where r.offer_id = p_offer_id and r.contractor_id = auth.uid()
    union all
    select r.decided_at, 2, 'revision-decision:' || r.id::text, 'revision-decision', r.id
    from public.offer_revisions r
    where r.offer_id = p_offer_id and r.contractor_id = auth.uid() and r.decided_at is not null
    union all
    select r.superseded_at, 0, 'revision-replacement:' || r.id::text, 'revision-replacement', r.id
    from public.offer_revisions r
    where r.offer_id = p_offer_id and r.contractor_id = auth.uid() and r.superseded_at is not null
      and r.superseded_by is not null
    union all
    select c.created_at, 1, 'change:' || c.id::text, 'change', c.id
    from public.offer_changes c
    where c.offer_id = p_offer_id and c.contractor_id = auth.uid()
    union all
    select d.decided_at, 2, 'change-decision:' || c.id::text, 'change-decision', c.id
    from public.offer_changes c
    join public.change_decisions d on d.offer_change_id = c.id and d.contractor_id = c.contractor_id
    where c.offer_id = p_offer_id and c.contractor_id = auth.uid()
    union all
    select c.superseded_at, 0, 'change-replacement:' || c.id::text, 'change-replacement', c.id
    from public.offer_changes c
    where c.offer_id = p_offer_id and c.contractor_id = auth.uid() and c.superseded_at is not null
      and c.superseded_by is not null
  ), eligible as (
    select * from history_keys e
    where (p_cursor is null or case when v_direction = 'before'
      then (e.event_at, e.event_priority, e.stable_id) < (v_cursor_at, v_cursor_priority, v_cursor_stable_id)
      else (e.event_at, e.event_priority, e.stable_id) > (v_cursor_at, v_cursor_priority, v_cursor_stable_id) end)
      and (p_cursor is not null or v_target_stable_id is null or
        (e.event_at, e.event_priority, e.stable_id) >= (v_target_at, 1, v_target_stable_id))
  ), selected_keys as (
    select * from eligible e
    order by
      case when p_cursor is not null and v_direction = 'before' then e.event_at end desc,
      case when p_cursor is not null and v_direction = 'before' then e.event_priority end desc,
      case when p_cursor is not null and v_direction = 'before' then e.stable_id end desc,
      e.event_at, e.event_priority, e.stable_id
    limit v_page_size
  ), page as (
    select e.event_at, e.event_priority, e.stable_id,
      case e.kind
        when 'revision' then jsonb_build_object('kind', e.kind, 'at', e.event_at, 'id', e.record_id,
          'state_at_creation', 'pending', 'revision', to_jsonb(r))
        when 'revision-decision' then jsonb_build_object('kind', e.kind, 'at', e.event_at,
          'id', e.record_id, 'revision', to_jsonb(r))
        when 'revision-replacement' then jsonb_build_object('kind', e.kind, 'at', e.event_at,
          'id', e.record_id, 'revision', to_jsonb(r),
          'successor', jsonb_build_object('id', successor_revision.id,
            'revision', successor_revision.revision))
        when 'change' then jsonb_build_object('kind', e.kind, 'at', e.event_at, 'id', e.record_id,
          'state_at_creation', case when coalesce(c.price_delta_minor, 0) = 0
            and coalesce(c.deadline_delta_days, 0) = 0 then 'agreed' else 'pending' end,
          'change', to_jsonb(c))
        when 'change-decision' then jsonb_build_object('kind', e.kind, 'at', e.event_at,
          'id', e.record_id, 'change', to_jsonb(c), 'decision', to_jsonb(d))
        when 'change-replacement' then jsonb_build_object('kind', e.kind, 'at', e.event_at,
          'id', e.record_id, 'change', to_jsonb(c),
          'successor', jsonb_build_object('id', successor_change.id,
            'proposal_revision', successor_change.proposal_revision))
      end as payload
    from selected_keys e
    left join public.offer_revisions r on e.kind like 'revision%' and r.id = e.record_id
      and r.offer_id = p_offer_id and r.contractor_id = auth.uid()
    left join public.offer_revisions successor_revision on e.kind = 'revision-replacement'
      and successor_revision.id = r.superseded_by and successor_revision.offer_id = p_offer_id
      and successor_revision.contractor_id = auth.uid()
    left join public.offer_changes c on e.kind like 'change%' and c.id = e.record_id
      and c.offer_id = p_offer_id and c.contractor_id = auth.uid()
    left join public.offer_changes successor_change on e.kind = 'change-replacement'
      and successor_change.id = c.superseded_by and successor_change.offer_id = p_offer_id
      and successor_change.contractor_id = auth.uid()
    left join public.change_decisions d on e.kind = 'change-decision'
      and d.offer_change_id = c.id and d.contractor_id = auth.uid()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'payload', payload, 'at', event_at, 'priority', event_priority, 'stable_id', stable_id
    ) order by event_at, event_priority, stable_id), '[]'::jsonb)
  into v_rows
  from page;

  if jsonb_array_length(v_rows) > 0 then
    v_first := v_rows -> 0;
    v_last := v_rows -> (jsonb_array_length(v_rows) - 1);
    select coalesce(jsonb_agg((value -> 'payload') || jsonb_build_object(
      'priority', (value ->> 'priority')::integer, 'stable_id', value ->> 'stable_id'
    ) order by ordinal), '[]'::jsonb)
      into v_events
      from jsonb_array_elements(v_rows) with ordinality as page_row(value, ordinal);

    with history_keys as (
      select r.created_at as event_at, 1 as event_priority, 'revision:' || r.id::text as stable_id
      from public.offer_revisions r where r.offer_id = p_offer_id and r.contractor_id = auth.uid()
      union all
      select r.decided_at, 2, 'revision-decision:' || r.id::text
      from public.offer_revisions r where r.offer_id = p_offer_id and r.contractor_id = auth.uid()
        and r.decided_at is not null
      union all
      select r.superseded_at, 0, 'revision-replacement:' || r.id::text
      from public.offer_revisions r where r.offer_id = p_offer_id and r.contractor_id = auth.uid()
        and r.superseded_at is not null and r.superseded_by is not null
      union all
      select c.created_at, 1, 'change:' || c.id::text
      from public.offer_changes c where c.offer_id = p_offer_id and c.contractor_id = auth.uid()
      union all
      select d.decided_at, 2, 'change-decision:' || c.id::text
      from public.offer_changes c
      join public.change_decisions d on d.offer_change_id = c.id and d.contractor_id = c.contractor_id
      where c.offer_id = p_offer_id and c.contractor_id = auth.uid()
      union all
      select c.superseded_at, 0, 'change-replacement:' || c.id::text
      from public.offer_changes c where c.offer_id = p_offer_id and c.contractor_id = auth.uid()
        and c.superseded_at is not null and c.superseded_by is not null
    )
    select exists (
      select 1 from history_keys e where (e.event_at, e.event_priority, e.stable_id) <
        ((v_first ->> 'at')::timestamptz, (v_first ->> 'priority')::integer, v_first ->> 'stable_id')
    ), exists (
      select 1 from history_keys e where (e.event_at, e.event_priority, e.stable_id) >
        ((v_last ->> 'at')::timestamptz, (v_last ->> 'priority')::integer, v_last ->> 'stable_id')
    ) into v_has_previous, v_has_next;
    if v_has_previous then
      v_previous_cursor := jsonb_build_object(
        'direction', 'before', 'at', v_first ->> 'at',
        'priority', (v_first ->> 'priority')::integer, 'stable_id', v_first ->> 'stable_id'
      );
    end if;
    if v_has_next then
      v_next_cursor := jsonb_build_object(
        'direction', 'after', 'at', v_last ->> 'at',
        'priority', (v_last ->> 'priority')::integer, 'stable_id', v_last ->> 'stable_id'
      );
    end if;
  end if;

  return jsonb_build_object(
    'events', v_events,
    'has_previous', v_has_previous,
    'previous_cursor', v_previous_cursor,
    'has_next', v_has_next,
    'next_cursor', v_next_cursor
  );
end;
$$;

revoke all on function public.get_contractor_offer_history_page(uuid, jsonb, integer, uuid, text) from public, anon;
grant execute on function public.get_contractor_offer_history_page(uuid, jsonb, integer, uuid, text) to authenticated;

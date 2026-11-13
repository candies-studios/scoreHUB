-- =============================================================================
-- WDS — Strike Sheet share links (no sign-in on fight night)
--
-- Run ONCE in the WDS Supabase project (zxqaolyckzgaqohpiwtk) -> SQL Editor,
-- AFTER 002_fight_stats.sql and 003_strike_sheet_and_rankings.sql. Safe to re-run.
--
-- Management creates a share link for an event:
--   https://candies-studios.github.io/scoreHUB/strike-sheet.html#/t/<token>
--   (…#/t/<token>/bout/<bout id> opens one bout's sheet directly)
-- Whoever has the link can record strikes on that event's bouts while a bout is
-- LIVE, without signing in. It is the SAME sheet and the SAME tally as the
-- Strike Sheet inside ScoreHUB: every tap goes through the same functions into
-- public.bout_stats, so signed-in counters, link users and management all see
-- and change one set of numbers.
--
-- A link works until the morning after the event (06:00 IST the next day) and
-- management can turn it off or replace it at any time.
-- =============================================================================

create table if not exists public.strike_sheet_links (
  token      text primary key,
  event_id   uuid not null references public.events(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
comment on table public.strike_sheet_links is 'wds:v1 Strike Sheet share links (token = access without sign-in)';
create index if not exists strike_sheet_links_event_idx on public.strike_sheet_links(event_id);

alter table public.strike_sheet_links enable row level security;
drop policy if exists strike_links_select on public.strike_sheet_links;
create policy strike_links_select on public.strike_sheet_links for select using (public.is_staff());
-- no write policies: links are made and revoked only through the functions below
revoke all on public.strike_sheet_links from anon;

-- Which device made a tap (link users have no account; used for "Undo last").
alter table public.bout_stat_events add column if not exists device text;

-- Valid link for this bout's event?
create or replace function public.wds_link_ok(p_token text, p_bout uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_token is not null and exists (
    select 1 from public.strike_sheet_links l
      join public.bouts b on b.event_id = l.event_id
     where l.token = p_token and b.id = p_bout
       and l.revoked_at is null and now() < l.expires_at)
$$;
revoke all on function public.wds_link_ok(text, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- The recording functions gain p_token / p_device. Old signatures are dropped
-- so there is exactly one version of each (ScoreHUB simply leaves them out).
-- -----------------------------------------------------------------------------
drop function if exists public.bout_stats_record(uuid, int, text, text, text, text);
drop function if exists public.bout_stats_undo(uuid);
drop function if exists public.bout_stats_control(uuid, int, text, boolean);
drop function if exists public.bout_stats_adjust_control(uuid, int, text, int);
drop function if exists public.bout_stats_can_record(uuid);
drop function if exists public.wds_stats_stop_control(uuid, int, text, int);
drop function if exists public.wds_stats_guard(uuid, int, text);

-- Who may write: management, an assigned stat counter, or a valid share link.
create or replace function public.wds_stats_guard(p_bout uuid, p_round int, p_corner text, p_token text default null)
returns public.bouts language plpgsql stable security definer set search_path = public as $$
declare b public.bouts;
begin
  if not (public.is_bout_counter(p_bout) or public.wds_link_ok(p_token, p_bout)) then
    raise exception 'You are not a stat counter on this bout (or the share link has expired)' using errcode = '42501';
  end if;
  select * into b from public.bouts where id = p_bout;
  if not found then raise exception 'Bout not found' using errcode = 'P0002'; end if;
  if coalesce(upper(p_corner), '') not in ('BLUE','RED') then
    raise exception 'Corner must be BLUE or RED' using errcode = '22023';
  end if;
  if p_round is null or p_round < 1 or p_round > b.total_rounds then
    raise exception 'Round % is not in this bout', p_round using errcode = '22023';
  end if;
  if b.result_status = 'final' then
    raise exception 'This result is final — reopen it before changing stats' using errcode = 'P0001';
  end if;
  if b.status = 'CANCELLED' then
    raise exception 'This bout was cancelled' using errcode = 'P0001';
  end if;
  if b.status <> 'LIVE' and not public.is_staff() then
    raise exception 'Stats can be recorded only while the bout is live' using errcode = 'P0001';
  end if;
  if b.status = 'LIVE' and p_round > greatest(b.current_round, 1) and not public.is_staff() then
    raise exception 'Round % has not started yet', p_round using errcode = 'P0001';
  end if;
  return b;
end $$;

create or replace function public.wds_stats_stop_control(p_bout uuid, p_round int, p_corner text, p_cap int, p_device text default null)
returns int language plpgsql security definer set search_path = public as $$
declare started timestamptz; secs int;
begin
  select s.ctrl_started_at into started from public.bout_stats s
   where s.bout_id = p_bout and s.round_number = p_round and s.corner = p_corner
   for update;
  if started is null then return 0; end if;
  update public.bout_stats s set ctrl_started_at = null
   where s.bout_id = p_bout and s.round_number = p_round and s.corner = p_corner;
  secs := least(greatest(0, floor(extract(epoch from now() - started))::int), coalesce(p_cap, 1200));
  if secs > 0 then
    perform public.wds_stats_bump(p_bout, p_round, p_corner, jsonb_build_object('ctrl_seconds', secs), 1);
    insert into public.bout_stat_events(bout_id, round_number, corner, action, deltas, created_by, device)
    values (p_bout, p_round, p_corner, 'CONTROL', jsonb_build_object('ctrl_seconds', secs), auth.uid(), p_device);
  end if;
  return secs;
end $$;
revoke all on function public.wds_stats_guard(uuid, int, text, text)            from public, anon, authenticated;
revoke all on function public.wds_stats_stop_control(uuid, int, text, int, text) from public, anon, authenticated;

create or replace function public.bout_stats_can_record(p_bout uuid, p_token text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.is_bout_counter(p_bout) or public.wds_link_ok(p_token, p_bout))
     and exists (select 1 from public.bouts b where b.id = p_bout
                  and b.status <> 'CANCELLED' and b.result_status <> 'final'
                  and (b.status = 'LIVE' or public.is_staff()))
$$;

create or replace function public.bout_stats_record(
  p_bout uuid, p_round int, p_corner text, p_action text,
  p_target text default null, p_position text default null,
  p_token text default null, p_device text default null
) returns public.bout_stats language plpgsql security definer set search_path = public as $$
declare
  v_corner text := upper(p_corner);
  act    text := upper(p_action);
  tgt    text := upper(nullif(p_target, ''));
  pos    text := upper(nullif(p_position, ''));
  d      jsonb;
  r      public.bout_stats;
begin
  perform public.wds_stats_guard(p_bout, p_round, v_corner, p_token);

  if act in ('SIG_LANDED') or (act = 'KD' and tgt is not null) then
    if tgt not in ('HEAD','BODY','LEG') then
      raise exception 'Target must be HEAD, BODY or LEG' using errcode = '22023';
    end if;
    if coalesce(pos, 'DISTANCE') not in ('DISTANCE','CLINCH','GROUND') then
      raise exception 'Position must be DISTANCE, CLINCH or GROUND' using errcode = '22023';
    end if;
    pos := coalesce(pos, 'DISTANCE');
  end if;

  d := case act
    when 'SIG_LANDED' then jsonb_build_object(
      'sig_landed', 1, 'sig_attempted', 1, 'total_landed', 1, 'total_attempted', 1,
      lower(tgt) || '_landed', 1, lower(pos) || '_landed', 1)
    when 'SIG_MISSED' then '{"sig_attempted":1,"total_attempted":1}'::jsonb
    when 'STR_LANDED' then '{"total_landed":1,"total_attempted":1}'::jsonb
    when 'STR_MISSED' then '{"total_attempted":1}'::jsonb
    when 'TD_LANDED'  then '{"td_landed":1,"td_attempted":1}'::jsonb
    when 'TD_MISSED'  then '{"td_attempted":1}'::jsonb
    when 'SUB_ATT'    then '{"sub_att":1}'::jsonb
    when 'REV'        then '{"rev":1}'::jsonb
    when 'KD'         then case when tgt is null then '{"kd":1}'::jsonb else jsonb_build_object(
      'kd', 1, 'sig_landed', 1, 'sig_attempted', 1, 'total_landed', 1, 'total_attempted', 1,
      lower(tgt) || '_landed', 1, lower(pos) || '_landed', 1) end
    else null end;
  if d is null then raise exception 'Unknown stat action %', p_action using errcode = '22023'; end if;

  r := public.wds_stats_bump(p_bout, p_round, v_corner, d, 1);
  insert into public.bout_stat_events(bout_id, round_number, corner, action, deltas, created_by, device)
  values (p_bout, p_round, v_corner, act, d, auth.uid(), p_device);
  return r;
end $$;

-- Undo the caller's last tap on this bout: by account when signed in, by device
-- when recording through a share link.
create or replace function public.bout_stats_undo(p_bout uuid, p_token text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.bout_stat_events;
begin
  if auth.uid() is not null then
    select * into e from public.bout_stat_events
     where bout_id = p_bout and created_by = auth.uid() and undone_at is null
     order by id desc limit 1 for update;
  elsif p_device is not null and public.wds_link_ok(p_token, p_bout) then
    select * into e from public.bout_stat_events
     where bout_id = p_bout and created_by is null and device = p_device and undone_at is null
     order by id desc limit 1 for update;
  end if;
  if e.id is null then return null; end if;
  perform public.wds_stats_guard(p_bout, e.round_number, e.corner, p_token);
  perform public.wds_stats_bump(p_bout, e.round_number, e.corner, e.deltas, -1);
  update public.bout_stat_events set undone_at = now() where id = e.id;
  return jsonb_build_object('id', e.id, 'action', e.action, 'round', e.round_number, 'corner', e.corner);
end $$;

create or replace function public.bout_stats_control(
  p_bout uuid, p_round int, p_corner text, p_running boolean,
  p_token text default null, p_device text default null
) returns setof public.bout_stats language plpgsql security definer set search_path = public as $$
declare
  v_corner text := upper(p_corner);
  other  text;
  b      public.bouts;
begin
  b := public.wds_stats_guard(p_bout, p_round, v_corner, p_token);
  other := case v_corner when 'BLUE' then 'RED' else 'BLUE' end;
  perform 1 from public.bouts where id = p_bout for update;

  perform public.wds_stats_stop_control(p_bout, s.round_number, s.corner, b.round_duration, p_device)
     from public.bout_stats s
    where s.bout_id = p_bout and s.ctrl_started_at is not null
      and (s.round_number <> p_round or (p_running and s.corner = other));

  if p_running then
    insert into public.bout_stats(bout_id, round_number, corner) values (p_bout, p_round, v_corner)
    on conflict do nothing;
    update public.bout_stats
       set ctrl_started_at = coalesce(ctrl_started_at, now()), updated_by = auth.uid(), updated_at = now()
     where bout_id = p_bout and round_number = p_round and bout_stats.corner = v_corner;
  else
    perform public.wds_stats_stop_control(p_bout, p_round, v_corner, b.round_duration, p_device);
  end if;

  return query select * from public.bout_stats where bout_id = p_bout and round_number = p_round;
end $$;

create or replace function public.bout_stats_adjust_control(
  p_bout uuid, p_round int, p_corner text, p_seconds int,
  p_token text default null, p_device text default null
) returns public.bout_stats language plpgsql security definer set search_path = public as $$
declare v_corner text := upper(p_corner); r public.bout_stats; d jsonb; cur int;
begin
  perform public.wds_stats_guard(p_bout, p_round, v_corner, p_token);
  if p_seconds is null or p_seconds = 0 or abs(p_seconds) > 600 then
    raise exception 'Adjust by 1 to 600 seconds' using errcode = '22023';
  end if;
  select ctrl_seconds into cur from public.bout_stats
   where bout_id = p_bout and round_number = p_round and bout_stats.corner = v_corner;
  d := jsonb_build_object('ctrl_seconds', greatest(p_seconds, -coalesce(cur, 0)));
  if (d->>'ctrl_seconds')::int = 0 then
    select * into r from public.bout_stats where bout_id = p_bout and round_number = p_round and bout_stats.corner = v_corner;
    return r;
  end if;
  r := public.wds_stats_bump(p_bout, p_round, v_corner, d, 1);
  insert into public.bout_stat_events(bout_id, round_number, corner, action, deltas, created_by, device)
  values (p_bout, p_round, v_corner, 'CONTROL_ADJUST', d, auth.uid(), p_device);
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- Links: create / replace / turn off (management), open (anyone with the token)
-- -----------------------------------------------------------------------------
-- The event's active link, created if there is none. p_new = replace it.
create or replace function public.strike_link_get(p_event uuid, p_new boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.strike_sheet_links;
  e public.events;
  until timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Only management can share the Strike Sheet' using errcode = '42501';
  end if;
  select * into e from public.events where id = p_event;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if p_new then
    update public.strike_sheet_links set revoked_at = now()
     where event_id = p_event and revoked_at is null;
  end if;
  select * into l from public.strike_sheet_links
   where event_id = p_event and revoked_at is null and now() < expires_at
   order by created_at desc limit 1;
  if not found then
    -- until 06:00 IST the morning after the (last) event day, and at least 24 hours from now
    until := greatest(
      ((coalesce(e.end_date, e.event_date, (e.starts_at at time zone 'Asia/Kolkata')::date, current_date) + 1)::timestamp
        + interval '6 hours') at time zone 'Asia/Kolkata',
      now() + interval '24 hours');
    insert into public.strike_sheet_links(token, event_id, created_by, expires_at)
    values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), p_event, auth.uid(), until)
    returning * into l;
  end if;
  return jsonb_build_object('token', l.token, 'event_id', l.event_id, 'expires_at', l.expires_at, 'created_at', l.created_at);
end $$;

create or replace function public.strike_link_revoke(p_event uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff() then
    raise exception 'Only management can turn off a share link' using errcode = '42501';
  end if;
  update public.strike_sheet_links set revoked_at = now()
   where event_id = p_event and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- What a link opens: the event and its bouts (live first in the page).
create or replace function public.strike_link_info(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.strike_sheet_links; e public.events;
begin
  select * into l from public.strike_sheet_links where token = p_token;
  if not found or l.revoked_at is not null then
    raise exception 'This Strike Sheet link is not valid. Ask WDS management for a new one.' using errcode = '42501';
  end if;
  if now() >= l.expires_at then
    raise exception 'This Strike Sheet link has expired. Ask WDS management for a new one.' using errcode = '42501';
  end if;
  select * into e from public.events where id = l.event_id;
  return jsonb_build_object(
    'event_id', e.id, 'event_title', e.title, 'expires_at', l.expires_at,
    'bouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'bout_number', b.bout_number, 'bout_name', b.bout_name, 'discipline', b.discipline,
        'status', b.status, 'current_round', b.current_round, 'total_rounds', b.total_rounds,
        'result_status', b.result_status, 'blue_name', bf.name, 'red_name', rf.name,
        'event_id', e.id, 'event_title', e.title) order by b.bout_number)
        from public.bouts b
        left join public.fighters bf on bf.id = b.blue_fighter_id
        left join public.fighters rf on rf.id = b.red_fighter_id
       where b.event_id = e.id and b.status <> 'CANCELLED'), '[]'::jsonb));
end $$;

-- Everything the sheet needs for one bout, through a link (no account).
create or replace function public.strike_link_state(p_token text, p_bout uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b public.bouts;
begin
  if not public.wds_link_ok(p_token, p_bout) then
    raise exception 'This Strike Sheet link is not valid for this bout, or it has expired.' using errcode = '42501';
  end if;
  select * into b from public.bouts where id = p_bout;
  return jsonb_build_object(
    'bout', jsonb_build_object(
      'id', b.id, 'bout_number', b.bout_number, 'bout_name', b.bout_name, 'discipline', b.discipline,
      'status', b.status, 'current_round', b.current_round, 'total_rounds', b.total_rounds,
      'round_duration', b.round_duration, 'round_started_at', b.round_started_at,
      'started_at', b.started_at, 'completed_at', b.completed_at, 'end_round', b.end_round,
      'end_time_sec', b.end_time_sec, 'result_type', b.result_type, 'result_status', b.result_status,
      'blue_fighter_id', b.blue_fighter_id, 'red_fighter_id', b.red_fighter_id,
      'blueName', coalesce((select nullif(btrim(concat_ws(' ', f.first_name, f.last_name)), '') from public.fighters f where f.id = b.blue_fighter_id),
                           (select f.name from public.fighters f where f.id = b.blue_fighter_id), 'Blue corner'),
      'redName',  coalesce((select nullif(btrim(concat_ws(' ', f.first_name, f.last_name)), '') from public.fighters f where f.id = b.red_fighter_id),
                           (select f.name from public.fighters f where f.id = b.red_fighter_id), 'Red corner')),
    'stats', coalesce((select jsonb_agg(to_jsonb(s)) from public.bout_stats s where s.bout_id = p_bout), '[]'::jsonb),
    'can_record', public.bout_stats_can_record(p_bout, p_token));
end $$;

-- -----------------------------------------------------------------------------
-- Access
-- -----------------------------------------------------------------------------
revoke execute on function public.strike_link_get(uuid, boolean) from public, anon;
revoke execute on function public.strike_link_revoke(uuid)       from public, anon;
grant  execute on function public.strike_link_get(uuid, boolean), public.strike_link_revoke(uuid) to authenticated;

-- The recording functions are callable without an account; each one checks
-- the account or the link itself (wds_stats_guard).
grant execute on function
  public.bout_stats_can_record(uuid, text),
  public.bout_stats_record(uuid, int, text, text, text, text, text, text),
  public.bout_stats_undo(uuid, text, text),
  public.bout_stats_control(uuid, int, text, boolean, text, text),
  public.bout_stats_adjust_control(uuid, int, text, int, text, text),
  public.strike_link_info(text),
  public.strike_link_state(text, uuid)
  to anon, authenticated;

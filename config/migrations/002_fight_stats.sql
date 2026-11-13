-- =============================================================================
-- WDS — Fight Stats Sheet for ScoreHUB (strikes, grappling, control time)
--
-- Run ONCE in the WDS Supabase project -> SQL Editor (same project ScoreHUB's
-- supabase-bridge.js talks to). Safe to re-run.
--
-- Adds:
--   * public.bout_stats        one row per bout x round x corner (running totals)
--   * public.bout_stat_events  append-only log of every tap (audit + undo)
--   * RPCs  bout_stats_record / bout_stats_undo / bout_stats_control
--           bout_stats_adjust_control / bout_stats_can_record
--   * Realtime on bout_stats, so every tablet sees the same numbers live.
--
-- Who can record: the same people who can run the bout (public.is_bout_official:
-- staff, the bout's referee, judges seated on the bout). Officials record while
-- the bout is LIVE; ADMIN/PROMOTER can also correct a finished bout (unless the
-- result is FINAL). Every signed-in official can read.
--
-- These stats never change the judges' decision. ScoreHUB computes a
-- stat-based performance score from them on the sheet and scoreboard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table if not exists public.bout_stats (
  bout_id          uuid not null references public.bouts(id) on delete cascade,
  round_number     int  not null check (round_number between 1 and 12),
  corner           text not null check (corner in ('BLUE','RED')),
  -- striking
  kd               int  not null default 0 check (kd >= 0),
  sig_landed       int  not null default 0 check (sig_landed >= 0),
  sig_attempted    int  not null default 0 check (sig_attempted >= 0),
  total_landed     int  not null default 0 check (total_landed >= 0),
  total_attempted  int  not null default 0 check (total_attempted >= 0),
  head_landed      int  not null default 0 check (head_landed >= 0),
  body_landed      int  not null default 0 check (body_landed >= 0),
  leg_landed       int  not null default 0 check (leg_landed >= 0),
  distance_landed  int  not null default 0 check (distance_landed >= 0),
  clinch_landed    int  not null default 0 check (clinch_landed >= 0),
  ground_landed    int  not null default 0 check (ground_landed >= 0),
  -- grappling
  td_landed        int  not null default 0 check (td_landed >= 0),
  td_attempted     int  not null default 0 check (td_attempted >= 0),
  sub_att          int  not null default 0 check (sub_att >= 0),
  rev              int  not null default 0 check (rev >= 0),
  ctrl_seconds     int  not null default 0 check (ctrl_seconds >= 0),
  ctrl_started_at  timestamptz,           -- control clock running for this corner
  updated_by       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  primary key (bout_id, round_number, corner)
);
comment on table public.bout_stats is 'wds:v1 fight stats per bout/round/corner (written only through RPCs)';

create table if not exists public.bout_stat_events (
  id           bigint generated always as identity primary key,
  bout_id      uuid not null references public.bouts(id) on delete cascade,
  round_number int  not null,
  corner       text not null check (corner in ('BLUE','RED')),
  action       text not null,
  deltas       jsonb not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  undone_at    timestamptz
);
comment on table public.bout_stat_events is 'wds:v1 fight stats tap log (audit + undo)';
create index if not exists bout_stat_events_bout_idx on public.bout_stat_events(bout_id, created_by, id desc);

-- -----------------------------------------------------------------------------
-- 2. Internal helpers (not callable from the API)
-- -----------------------------------------------------------------------------
-- Checks the caller may write stats for this bout/round and returns the bout.
create or replace function public.wds_stats_guard(p_bout uuid, p_round int, p_corner text)
returns public.bouts language plpgsql stable security definer set search_path = public as $$
declare b public.bouts;
begin
  if not public.is_bout_official(p_bout) then
    raise exception 'You are not an official on this bout' using errcode = '42501';
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

-- Adds p_sign * deltas to a stats row (creating it). Counters never go below 0.
create or replace function public.wds_stats_bump(
  p_bout uuid, p_round int, p_corner text, d jsonb, p_sign int
) returns public.bout_stats language plpgsql security definer set search_path = public as $$
declare r public.bout_stats;
begin
  insert into public.bout_stats(bout_id, round_number, corner)
  values (p_bout, p_round, p_corner)
  on conflict do nothing;

  update public.bout_stats s set
    kd              = greatest(0, s.kd              + p_sign * coalesce((d->>'kd')::int, 0)),
    sig_landed      = greatest(0, s.sig_landed      + p_sign * coalesce((d->>'sig_landed')::int, 0)),
    sig_attempted   = greatest(0, s.sig_attempted   + p_sign * coalesce((d->>'sig_attempted')::int, 0)),
    total_landed    = greatest(0, s.total_landed    + p_sign * coalesce((d->>'total_landed')::int, 0)),
    total_attempted = greatest(0, s.total_attempted + p_sign * coalesce((d->>'total_attempted')::int, 0)),
    head_landed     = greatest(0, s.head_landed     + p_sign * coalesce((d->>'head_landed')::int, 0)),
    body_landed     = greatest(0, s.body_landed     + p_sign * coalesce((d->>'body_landed')::int, 0)),
    leg_landed      = greatest(0, s.leg_landed      + p_sign * coalesce((d->>'leg_landed')::int, 0)),
    distance_landed = greatest(0, s.distance_landed + p_sign * coalesce((d->>'distance_landed')::int, 0)),
    clinch_landed   = greatest(0, s.clinch_landed   + p_sign * coalesce((d->>'clinch_landed')::int, 0)),
    ground_landed   = greatest(0, s.ground_landed   + p_sign * coalesce((d->>'ground_landed')::int, 0)),
    td_landed       = greatest(0, s.td_landed       + p_sign * coalesce((d->>'td_landed')::int, 0)),
    td_attempted    = greatest(0, s.td_attempted    + p_sign * coalesce((d->>'td_attempted')::int, 0)),
    sub_att         = greatest(0, s.sub_att         + p_sign * coalesce((d->>'sub_att')::int, 0)),
    rev             = greatest(0, s.rev             + p_sign * coalesce((d->>'rev')::int, 0)),
    ctrl_seconds    = greatest(0, s.ctrl_seconds    + p_sign * coalesce((d->>'ctrl_seconds')::int, 0)),
    updated_by      = auth.uid(),
    updated_at      = now()
  where s.bout_id = p_bout and s.round_number = p_round and s.corner = p_corner
  returning * into r;
  return r;
end $$;

-- Stops a running control clock and books the elapsed seconds (logged, undoable).
create or replace function public.wds_stats_stop_control(p_bout uuid, p_round int, p_corner text, p_cap int)
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
    insert into public.bout_stat_events(bout_id, round_number, corner, action, deltas, created_by)
    values (p_bout, p_round, p_corner, 'CONTROL', jsonb_build_object('ctrl_seconds', secs), auth.uid());
  end if;
  return secs;
end $$;

-- -----------------------------------------------------------------------------
-- 3. API
-- -----------------------------------------------------------------------------
-- Can the signed-in user record stats on this bout right now?
create or replace function public.bout_stats_can_record(p_bout uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bout_official(p_bout)
     and exists (select 1 from public.bouts b where b.id = p_bout
                  and b.status <> 'CANCELLED' and b.result_status <> 'final'
                  and (b.status = 'LIVE' or public.is_staff()))
$$;

-- One tap on the sheet. p_action:
--   SIG_LANDED  (needs p_target HEAD|BODY|LEG and p_position DISTANCE|CLINCH|GROUND)
--   SIG_MISSED  STR_LANDED  STR_MISSED  (non-significant strikes)
--   TD_LANDED   TD_MISSED   SUB_ATT     REV     KD
-- KD also counts as a significant strike landed when p_target is given.
create or replace function public.bout_stats_record(
  p_bout uuid, p_round int, p_corner text, p_action text,
  p_target text default null, p_position text default null
) returns public.bout_stats language plpgsql security definer set search_path = public as $$
declare
  v_corner text := upper(p_corner);
  act    text := upper(p_action);
  tgt    text := upper(nullif(p_target, ''));
  pos    text := upper(nullif(p_position, ''));
  d      jsonb;
  r      public.bout_stats;
begin
  perform public.wds_stats_guard(p_bout, p_round, v_corner);

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
  insert into public.bout_stat_events(bout_id, round_number, corner, action, deltas, created_by)
  values (p_bout, p_round, v_corner, act, d, auth.uid());
  return r;
end $$;

-- Undo the caller's most recent tap on this bout. Returns the undone event or null.
create or replace function public.bout_stats_undo(p_bout uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.bout_stat_events;
begin
  select * into e from public.bout_stat_events
   where bout_id = p_bout and created_by = auth.uid() and undone_at is null
   order by id desc limit 1 for update;
  if not found then return null; end if;
  perform public.wds_stats_guard(p_bout, e.round_number, e.corner);
  perform public.wds_stats_bump(p_bout, e.round_number, e.corner, e.deltas, -1);
  update public.bout_stat_events set undone_at = now() where id = e.id;
  return jsonb_build_object('id', e.id, 'action', e.action, 'round', e.round_number, 'corner', e.corner);
end $$;

-- Start / stop the control clock for a corner. Only one fighter controls at a
-- time: starting one corner stops the other. Stopping books the seconds.
create or replace function public.bout_stats_control(
  p_bout uuid, p_round int, p_corner text, p_running boolean
) returns setof public.bout_stats language plpgsql security definer set search_path = public as $$
declare
  v_corner text := upper(p_corner);
  other  text;
  b      public.bouts;
begin
  b := public.wds_stats_guard(p_bout, p_round, v_corner);
  other := case v_corner when 'BLUE' then 'RED' else 'BLUE' end;
  perform 1 from public.bouts where id = p_bout for update;   -- serialise start/stop per bout

  -- a clock left running in another round is closed first
  perform public.wds_stats_stop_control(p_bout, s.round_number, s.corner, b.round_duration)
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
    perform public.wds_stats_stop_control(p_bout, p_round, v_corner, b.round_duration);
  end if;

  return query select * from public.bout_stats where bout_id = p_bout and round_number = p_round;
end $$;

-- Manual correction of control time, in seconds (e.g. +10 / -10). Logged, undoable.
create or replace function public.bout_stats_adjust_control(
  p_bout uuid, p_round int, p_corner text, p_seconds int
) returns public.bout_stats language plpgsql security definer set search_path = public as $$
declare v_corner text := upper(p_corner); r public.bout_stats; d jsonb; cur int;
begin
  perform public.wds_stats_guard(p_bout, p_round, v_corner);
  if p_seconds is null or p_seconds = 0 or abs(p_seconds) > 600 then
    raise exception 'Adjust by 1 to 600 seconds' using errcode = '22023';
  end if;
  select ctrl_seconds into cur from public.bout_stats
   where bout_id = p_bout and round_number = p_round and bout_stats.corner = v_corner;
  -- never log more than can actually be removed, so undo restores exactly
  d := jsonb_build_object('ctrl_seconds', greatest(p_seconds, -coalesce(cur, 0)));
  if (d->>'ctrl_seconds')::int = 0 then
    select * into r from public.bout_stats where bout_id = p_bout and round_number = p_round and bout_stats.corner = v_corner;
    return r;
  end if;
  r := public.wds_stats_bump(p_bout, p_round, v_corner, d, 1);
  insert into public.bout_stat_events(bout_id, round_number, corner, action, deltas, created_by)
  values (p_bout, p_round, v_corner, 'CONTROL_ADJUST', d, auth.uid());
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Housekeeping: a bout reset (reset_bout) also wipes its stats; a finished
--    bout's control clocks stop.
-- -----------------------------------------------------------------------------
create or replace function public.bouts_stats_housekeeping()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'SCHEDULED' and old.status <> 'SCHEDULED' and new.current_round = 0 then
    delete from public.bout_stats where bout_id = new.id;
    delete from public.bout_stat_events where bout_id = new.id;
  elsif new.status = 'COMPLETED' and old.status <> 'COMPLETED' then
    update public.bout_stats s
       set ctrl_seconds = s.ctrl_seconds + least(greatest(0, floor(extract(epoch from now() - s.ctrl_started_at))::int), new.round_duration),
           ctrl_started_at = null
     where s.bout_id = new.id and s.ctrl_started_at is not null;
  end if;
  return new;
end $$;

drop trigger if exists bouts_stats_housekeeping on public.bouts;
create trigger bouts_stats_housekeeping after update of status on public.bouts
  for each row execute function public.bouts_stats_housekeeping();

-- -----------------------------------------------------------------------------
-- 5. Security
-- -----------------------------------------------------------------------------
alter table public.bout_stats       enable row level security;
alter table public.bout_stat_events enable row level security;

drop policy if exists bout_stats_select on public.bout_stats;
create policy bout_stats_select on public.bout_stats for select using (public.is_official());
drop policy if exists bout_stat_events_select on public.bout_stat_events;
create policy bout_stat_events_select on public.bout_stat_events for select using (public.is_official());
-- no insert/update/delete policies: writes go through the RPCs only

revoke all on function public.wds_stats_guard(uuid, int, text)                from public, anon, authenticated;
revoke all on function public.wds_stats_bump(uuid, int, text, jsonb, int)     from public, anon, authenticated;
revoke all on function public.wds_stats_stop_control(uuid, int, text, int)    from public, anon, authenticated;
revoke all on function public.bouts_stats_housekeeping()                      from public, anon, authenticated;
revoke execute on function public.bout_stats_can_record(uuid)                         from public, anon;
revoke execute on function public.bout_stats_record(uuid, int, text, text, text, text) from public, anon;
revoke execute on function public.bout_stats_undo(uuid)                               from public, anon;
revoke execute on function public.bout_stats_control(uuid, int, text, boolean)        from public, anon;
revoke execute on function public.bout_stats_adjust_control(uuid, int, text, int)     from public, anon;
grant execute on function
  public.bout_stats_can_record(uuid),
  public.bout_stats_record(uuid, int, text, text, text, text),
  public.bout_stats_undo(uuid),
  public.bout_stats_control(uuid, int, text, boolean),
  public.bout_stats_adjust_control(uuid, int, text, int)
  to authenticated;
grant select on public.bout_stats, public.bout_stat_events to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Realtime
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bout_stats') then
    alter publication supabase_realtime add table public.bout_stats;
  end if;
end $$;

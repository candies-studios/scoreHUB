-- =============================================================================
-- WDS — Strike Sheet: stat counters, stat-based score, rankings with stats
--
-- Run ONCE in the WDS Supabase project -> SQL Editor, AFTER 002_fight_stats.sql.
-- (Project zxqaolyckzgaqohpiwtk — the one ScoreHUB's index.html points to.)
-- Safe to re-run.
--
-- 1. New official role STATS ("Stat Counter").
-- 2. bout_stat_counters: management assigns counters to each bout. Assigned
--    counters (and management) record strikes; several counters share ONE tally
--    per bout, so they can split the work (e.g. one per corner).
-- 3. stat_score_weights: the points each stat is worth (editable by management).
--    A fighter's STATS SHARE in a bout = their points ÷ both fighters' points × 100
--    (50 = even fight on the stats).
-- 4. ranking_formula: the ranking score gains a stats part:
--      Score = (Win% × 0.6 + Win Method Weight × 0.3 + Stats × 0.1) × √(total fights)
--    Stats = the fighter's average stats share over their finalized fights that
--    have strike stats; a fighter with no recorded stats counts as 50 (even).
--    The three weights are editable by management.
-- 5. Judges' cards still decide every bout. Stats only feed the rankings.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stat Counter role
-- -----------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
      from pg_constraint
     where conrelid in ('public.profiles'::regclass, 'public.official_invites'::regclass)
       and contype = 'c' and pg_get_constraintdef(oid) like '%REFEREE%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_role_check
  check (role in ('ADMIN','PROMOTER','JUDGE','REFEREE','STATS'));
alter table public.official_invites add constraint official_invites_role_check
  check (role in ('ADMIN','PROMOTER','JUDGE','REFEREE','STATS'));

-- -----------------------------------------------------------------------------
-- 2. Counters assigned to a bout
-- -----------------------------------------------------------------------------
-- Keyed by the official's email, so a counter can be assigned before their
-- first sign-in (an invite) as well as after it (a profile).
create table if not exists public.bout_stat_counters (
  bout_id    uuid not null references public.bouts(id) on delete cascade,
  email      text not null check (email = lower(btrim(email)) and email like '%@%'),
  created_at timestamptz not null default now(),
  primary key (bout_id, email)
);
comment on table public.bout_stat_counters is 'wds:v1 stat counters assigned to a bout (by official email)';
create index if not exists bout_stat_counters_email_idx on public.bout_stat_counters(email);

alter table public.bout_stat_counters enable row level security;
drop policy if exists stat_counters_select on public.bout_stat_counters;
create policy stat_counters_select on public.bout_stat_counters for select using (public.is_official());
drop policy if exists stat_counters_write on public.bout_stat_counters;
create policy stat_counters_write on public.bout_stat_counters for all
  using (public.is_staff()) with check (public.is_staff());
grant select, insert, delete on public.bout_stat_counters to authenticated;

-- Management, or a counter assigned to this bout.
create or replace function public.is_bout_counter(p_bout uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.bout_stat_counters c
                  join public.profiles p on lower(p.email) = c.email and p.active
                 where c.bout_id = p_bout and p.id = auth.uid())
$$;

-- Strike stats are now recorded by the assigned counters (and management).
create or replace function public.wds_stats_guard(p_bout uuid, p_round int, p_corner text)
returns public.bouts language plpgsql stable security definer set search_path = public as $$
declare b public.bouts;
begin
  if not public.is_bout_counter(p_bout) then
    raise exception 'You are not a stat counter on this bout' using errcode = '42501';
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
revoke all on function public.wds_stats_guard(uuid, int, text) from public, anon, authenticated;

create or replace function public.bout_stats_can_record(p_bout uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bout_counter(p_bout)
     and exists (select 1 from public.bouts b where b.id = p_bout
                  and b.status <> 'CANCELLED' and b.result_status <> 'final'
                  and (b.status = 'LIVE' or public.is_staff()))
$$;

-- Bouts for the Strike Sheet: a counter sees the bouts assigned to them;
-- management sees every bout of events that are not over.
create or replace function public.strike_sheet_bouts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'starts_at' nulls last, (x->>'bout_number')::int), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', b.id, 'bout_number', b.bout_number, 'bout_name', b.bout_name, 'discipline', b.discipline,
      'status', b.status, 'current_round', b.current_round, 'total_rounds', b.total_rounds,
      'result_status', b.result_status,
      'event_id', e.id, 'event_title', e.title, 'starts_at', e.starts_at,
      'blue_name', bf.name, 'red_name', rf.name,
      'assigned', exists (select 1 from public.bout_stat_counters c where c.bout_id = b.id and c.email = me.email),
      'counters', coalesce((select jsonb_agg(jsonb_build_object(
                                    'email', c.email,
                                    'name', coalesce(p.name, i.name, c.email),
                                    'registered', p.id is not null) order by coalesce(p.name, i.name, c.email))
                              from public.bout_stat_counters c
                              left join public.profiles p on lower(p.email) = c.email
                              left join public.official_invites i on i.email = c.email
                             where c.bout_id = b.id), '[]'::jsonb)
    ) as x
    from public.bouts b
    join public.events e on e.id = b.event_id
    left join public.fighters bf on bf.id = b.blue_fighter_id
    left join public.fighters rf on rf.id = b.red_fighter_id
    cross join (select lower(email) as email from public.profiles where id = auth.uid()) me
    where b.status <> 'CANCELLED'
      and (
        (public.is_staff() and (b.status in ('SCHEDULED','LIVE') or b.result_status <> 'final'))
        or (exists (select 1 from public.bout_stat_counters c where c.bout_id = b.id and c.email = me.email)
            and b.result_status <> 'final')
      )
  ) s
$$;
-- Stat counters management can assign: STATS officials, registered or invited.
create or replace function public.list_stat_counters()
returns table (email text, name text, phone text, registered boolean)
language sql stable security definer set search_path = public as $$
  select lower(p.email), p.name, p.phone, true
    from public.profiles p
   where public.is_staff() and p.active and p.role = 'STATS' and p.email is not null
  union all
  select i.email, i.name, i.phone, false
    from public.official_invites i
   where public.is_staff() and i.role = 'STATS'
     and not exists (select 1 from public.profiles p where lower(p.email) = i.email)
   order by 2
$$;
revoke execute on function public.list_stat_counters() from public, anon;
grant execute on function public.list_stat_counters() to authenticated;
revoke execute on function public.strike_sheet_bouts() from public, anon;
grant execute on function public.strike_sheet_bouts() to authenticated;
revoke execute on function public.is_bout_counter(uuid) from public, anon;
grant execute on function public.is_bout_counter(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. What each stat is worth (Strike Sheet performance score and rankings)
-- -----------------------------------------------------------------------------
create table if not exists public.stat_score_weights (
  key        text primary key check (key in ('sig_landed','head_bonus','body_bonus','leg_bonus','other_landed',
                                             'kd','td_landed','sub_att','rev','ctrl_per_minute')),
  weight     numeric(8,3) not null check (weight >= 0 and weight <= 100),
  label      text not null,
  sort       int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
comment on table public.stat_score_weights is 'wds:v1 points per strike stat (stats share for rankings)';
insert into public.stat_score_weights (key, weight, label, sort) values
  ('sig_landed',      1,    'Significant strike landed', 1),
  ('head_bonus',      0.5,  '+ extra if to the head', 2),
  ('body_bonus',      0.25, '+ extra if to the body', 3),
  ('leg_bonus',       0,    '+ extra if to the legs', 4),
  ('other_landed',    0.25, 'Other (non-significant) strike landed', 5),
  ('kd',              10,   'Knockdown', 6),
  ('td_landed',       3,    'Takedown landed', 7),
  ('sub_att',         3,    'Submission attempt', 8),
  ('rev',             2,    'Reversal', 9),
  ('ctrl_per_minute', 2,    'Control time, per minute', 10)
on conflict (key) do nothing;

alter table public.stat_score_weights enable row level security;
drop policy if exists stat_weights_select on public.stat_score_weights;
create policy stat_weights_select on public.stat_score_weights for select using (true);
drop policy if exists stat_weights_write on public.stat_score_weights;
create policy stat_weights_write on public.stat_score_weights for update
  using (public.is_staff()) with check (public.is_staff());
grant select on public.stat_score_weights to anon, authenticated;
grant update (weight) on public.stat_score_weights to authenticated;

-- Points for one fighter's stats (any rounds summed).
create or replace function public.wds_stat_points(
  p_kd int, p_sig int, p_head int, p_body int, p_leg int, p_total int,
  p_td int, p_sub int, p_rev int, p_ctrl_sec int
) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case w.key
    when 'sig_landed'      then w.weight * p_sig
    when 'head_bonus'      then w.weight * p_head
    when 'body_bonus'      then w.weight * p_body
    when 'leg_bonus'       then w.weight * p_leg
    when 'other_landed'    then w.weight * greatest(0, p_total - p_sig)
    when 'kd'              then w.weight * p_kd
    when 'td_landed'       then w.weight * p_td
    when 'sub_att'         then w.weight * p_sub
    when 'rev'             then w.weight * p_rev
    when 'ctrl_per_minute' then w.weight * p_ctrl_sec / 60.0
  end), 0)
  from public.stat_score_weights w
$$;

-- Whole-bout totals per corner, with points and the stats share.
create or replace view public.bout_stat_summary as
with t as (
  select s.bout_id, s.corner,
         sum(s.kd)::int kd, sum(s.sig_landed)::int sig_landed, sum(s.sig_attempted)::int sig_attempted,
         sum(s.total_landed)::int total_landed, sum(s.total_attempted)::int total_attempted,
         sum(s.head_landed)::int head_landed, sum(s.body_landed)::int body_landed, sum(s.leg_landed)::int leg_landed,
         sum(s.distance_landed)::int distance_landed, sum(s.clinch_landed)::int clinch_landed,
         sum(s.ground_landed)::int ground_landed, sum(s.td_landed)::int td_landed, sum(s.td_attempted)::int td_attempted,
         sum(s.sub_att)::int sub_att, sum(s.rev)::int rev, sum(s.ctrl_seconds)::int ctrl_seconds
    from public.bout_stats s
   group by s.bout_id, s.corner
), p as (
  select t.*, public.wds_stat_points(kd, sig_landed, head_landed, body_landed, leg_landed, total_landed,
                                     td_landed, sub_att, rev, ctrl_seconds) as points
    from t
)
select p.*,
       case p.corner when 'BLUE' then b.blue_fighter_id else b.red_fighter_id end as fighter_id,
       o.points as opponent_points,
       case when p.points + coalesce(o.points, 0) > 0
            then round(100 * p.points / (p.points + coalesce(o.points, 0)), 3) end as stats_share
  from p
  join public.bouts b on b.id = p.bout_id
  left join p o on o.bout_id = p.bout_id and o.corner <> p.corner;
revoke all on public.bout_stat_summary from anon;
grant select on public.bout_stat_summary to authenticated;

-- A fighter's stats share in one bout (null when the bout has no stats).
create or replace function public.wds_bout_stat_share(p_bout uuid, p_fighter uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select stats_share from public.bout_stat_summary where bout_id = p_bout and fighter_id = p_fighter
$$;
revoke all on function public.wds_bout_stat_share(uuid, uuid) from public, anon, authenticated;

-- Public: stats of FINALIZED bouts of public events (website, rankings).
create or replace view public.public_bout_stats
with (security_barrier = true) as
select s.bout_id, s.fighter_id, s.corner, s.kd, s.sig_landed, s.sig_attempted, s.total_landed, s.total_attempted,
       s.head_landed, s.body_landed, s.leg_landed, s.distance_landed, s.clinch_landed, s.ground_landed,
       s.td_landed, s.td_attempted, s.sub_att, s.rev, s.ctrl_seconds,
       round(s.points, 3) as points, s.stats_share,
       b.event_id, b.bout_type, b.discipline
  from public.bout_stat_summary s
  join public.bouts b on b.id = s.bout_id and b.result_status = 'final'
  join public.events e on e.id = b.event_id and e.status <> 'draft';
grant select on public.public_bout_stats to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Ranking formula with a stats part
-- -----------------------------------------------------------------------------
create table if not exists public.ranking_formula (
  id            boolean primary key default true check (id),
  win_pct_weight numeric(6,3) not null default 0.6 check (win_pct_weight between 0 and 1),
  method_weight  numeric(6,3) not null default 0.3 check (method_weight between 0 and 1),
  stats_weight   numeric(6,3) not null default 0.1 check (stats_weight between 0 and 1),
  stats_neutral  numeric(6,2) not null default 50  check (stats_neutral between 0 and 100),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null
);
comment on table public.ranking_formula is 'wds:v1 ranking score = (Win% × a + Method × b + Stats × c) × √fights';
insert into public.ranking_formula (id) values (true) on conflict do nothing;

alter table public.ranking_formula enable row level security;
drop policy if exists ranking_formula_select on public.ranking_formula;
create policy ranking_formula_select on public.ranking_formula for select using (true);
drop policy if exists ranking_formula_write on public.ranking_formula;
create policy ranking_formula_write on public.ranking_formula for update
  using (public.is_staff()) with check (public.is_staff());
grant select on public.ranking_formula to anon, authenticated;
grant update (win_pct_weight, method_weight, stats_weight, stats_neutral) on public.ranking_formula to authenticated;

create or replace function public.wds_score(p_wins int, p_losses int, p_draws int, p_method_points numeric, p_stats numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select case when coalesce(p_wins, 0) + coalesce(p_losses, 0) + coalesce(p_draws, 0) = 0 then 0
    else round(((100.0 * p_wins / (p_wins + p_losses + p_draws))::float8 * f.win_pct_weight::float8
               + p_method_points::float8 * f.method_weight::float8
               + coalesce(p_stats, f.stats_neutral)::float8 * f.stats_weight::float8)::numeric
               * sqrt((p_wins + p_losses + p_draws)::numeric), 4) end
  from public.ranking_formula f
$$;

alter table public.bout_points      add column if not exists stats_share numeric(7,3);
alter table public.fighter_rankings add column if not exists stats_score numeric(7,3);

-- Same engine as migration 4, plus the stats part.
create or replace function public.recompute_rankings()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  ra int; rb int; sa float8; ea float8; eb float8;
  n int;
  seq int := 0;
  side record;
  acc record;
  earned numeric;
  share numeric;
  fw float8; mw float8; sw float8; neutral float8;
begin
  select win_pct_weight, method_weight, stats_weight, stats_neutral into fw, mw, sw, neutral
    from public.ranking_formula limit 1;
  fw := coalesce(fw, 0.7); mw := coalesce(mw, 0.3); sw := coalesce(sw, 0); neutral := coalesce(neutral, 50);

  create temp table if not exists _elo (fighter_id uuid primary key, elo int not null, first_seq int not null) on commit drop;
  truncate _elo;

  for r in
    select b.blue_fighter_id as a, b.red_fighter_id as c, b.winner_id
      from public.bouts b
      join public.events e on e.id = b.event_id
     where b.result_status = 'final' and b.discipline = 'MMA'
       and b.result_type <> 'NO_CONTEST'
       and b.blue_fighter_id is not null and b.red_fighter_id is not null
     order by coalesce(e.event_date, b.bout_date, b.completed_at::date) nulls last,
              e.starts_at nulls last, e.created_at, b.bout_number, b.completed_at nulls last, b.id
  loop
    insert into _elo values (r.a, 1500, seq + 1), (r.c, 1500, seq + 2) on conflict do nothing;
    seq := seq + 2;
    select elo into ra from _elo where fighter_id = r.a;
    select elo into rb from _elo where fighter_id = r.c;
    sa := case when r.winner_id = r.a then 1 when r.winner_id = r.c then 0 else 0.5 end;
    ea := 1 / (1 + power(10::float8, (rb - ra)::float8 / 400));
    eb := 1 / (1 + power(10::float8, (ra - rb)::float8 / 400));
    update _elo set elo = floor(ra + 32 * (sa - ea) + 0.5)::int       where fighter_id = r.a;
    update _elo set elo = floor(rb + 32 * ((1 - sa) - eb) + 0.5)::int where fighter_id = r.c;
  end loop;

  -- Per-fight points, in fight order, for both corners. ss/sn = sum/count of stats shares.
  create temp table if not exists _acc2 (fighter_id uuid primary key, w int, l int, d int, mp numeric, ss numeric, sn int) on commit drop;
  truncate _acc2;
  delete from public.bout_points where true;
  seq := 0;
  for r in
    select b.id, b.blue_fighter_id, b.red_fighter_id, b.winner_id, b.result_type, b.end_round
      from public.bouts b
      join public.events e on e.id = b.event_id
     where b.result_status = 'final' and b.discipline = 'MMA'
       and b.blue_fighter_id is not null and b.red_fighter_id is not null
     order by coalesce(e.event_date, b.bout_date, b.completed_at::date) nulls last,
              e.starts_at nulls last, e.created_at, b.bout_number, b.completed_at nulls last, b.id
  loop
    seq := seq + 1;
    insert into _acc2 values (r.blue_fighter_id, 0, 0, 0, 0, 0, 0), (r.red_fighter_id, 0, 0, 0, 0, 0, 0) on conflict do nothing;
    for side in
      select x.fid, x.opp, x.corner,
             case when r.result_type = 'NO_CONTEST' then 'NC'
                  when r.winner_id = x.fid then 'W'
                  when r.winner_id is not null then 'L'
                  else 'D' end as outcome
        from (values (r.blue_fighter_id, r.red_fighter_id, 'BLUE'),
                     (r.red_fighter_id, r.blue_fighter_id, 'RED')) as x(fid, opp, corner)
    loop
      select * into acc from _acc2 where fighter_id = side.fid;
      earned := case when side.outcome = 'W' then public.wds_win_weight(r.result_type, r.end_round) else 0 end;
      share := case when side.outcome = 'NC' then null else public.wds_bout_stat_share(r.id, side.fid) end;
      insert into public.bout_points
        (bout_id, fighter_id, opponent_id, corner, outcome, result_type, end_round, method_weight,
         score_before, score_after, wins_after, losses_after, draws_after, seq, stats_share)
      values
        (r.id, side.fid, side.opp, side.corner, side.outcome, r.result_type, r.end_round, earned,
         public.wds_score(acc.w, acc.l, acc.d, acc.mp, case when acc.sn > 0 then acc.ss / acc.sn end),
         public.wds_score(acc.w + (side.outcome = 'W')::int, acc.l + (side.outcome = 'L')::int,
                          acc.d + (side.outcome = 'D')::int, acc.mp + earned,
                          case when acc.sn + (share is not null)::int > 0
                               then (acc.ss + coalesce(share, 0)) / (acc.sn + (share is not null)::int) end),
         acc.w + (side.outcome = 'W')::int, acc.l + (side.outcome = 'L')::int, acc.d + (side.outcome = 'D')::int,
         seq, share);
      update _acc2 set w = w + (side.outcome = 'W')::int, l = l + (side.outcome = 'L')::int,
                       d = d + (side.outcome = 'D')::int, mp = mp + earned,
                       ss = ss + coalesce(share, 0), sn = sn + (share is not null)::int
       where fighter_id = side.fid;
    end loop;
  end loop;

  with fights as (
    select b.id, f.fid,
           b.winner_id, b.result_type, b.end_round,
           coalesce(e.event_date, b.bout_date, b.completed_at::date) as fought_on,
           e.starts_at, e.created_at as ev_created, b.bout_number,
           coalesce(nullif(b.weight_class, ''), nullif(ef.weight_class, ''), nullif(fx.weight_class, '')) as division
      from public.bouts b
      join public.events e on e.id = b.event_id
      cross join lateral (values (b.blue_fighter_id), (b.red_fighter_id)) as f(fid)
      join public.fighters fx on fx.id = f.fid
      left join public.event_fighters ef on ef.event_id = b.event_id and ef.fighter_id = f.fid
     where b.result_status = 'final' and b.discipline = 'MMA'
       and b.blue_fighter_id is not null and b.red_fighter_id is not null
  ),
  stats as (
    select fid,
           count(*) filter (where winner_id = fid)                                       as wins,
           count(*) filter (where winner_id is not null and winner_id <> fid)            as losses,
           count(*) filter (where winner_id is null and result_type <> 'NO_CONTEST')     as draws,
           count(*) filter (where result_type = 'NO_CONTEST')                            as ncs,
           coalesce(sum(public.wds_win_weight(result_type, end_round)) filter (where winner_id = fid), 0) as method_points,
           avg(public.wds_bout_stat_share(id, fid)) filter (where result_type <> 'NO_CONTEST') as stats_avg,
           max(fought_on)                                                                as last_on,
           (array_agg(division order by fought_on desc nulls last, starts_at desc nulls last,
                                        ev_created desc, bout_number desc)
              filter (where division is not null))[1]                                    as division
      from fights group by fid
  ),
  scored as (
    select s.fid, coalesce(s.division, 'Unclassified') as division_name,
           public.wds_division_key(s.division) as division_key,
           x.elo, coalesce(x.first_seq, 2147483647) as first_seq,
           s.wins, s.losses, s.draws, s.ncs, s.last_on, s.method_points, s.stats_avg, fx.name,
           (s.wins + s.losses + s.draws) as counted,
           case when s.wins + s.losses + s.draws = 0 then 0
                else 100.0 * s.wins / (s.wins + s.losses + s.draws) end as win_pct
      from stats s
      join public.fighters fx on fx.id = s.fid
      left join _elo x on x.fighter_id = s.fid
  ),
  with_score as (
    select *, ((win_pct::float8 * fw + method_points::float8 * mw
                + coalesce(stats_avg::float8, neutral) * sw) * sqrt(counted::float8)) as score
      from scored
  ),
  ranked as (
    select *,
      row_number() over (partition by division_key order by score desc, wins desc, first_seq, name) as division_rank,
      row_number() over (order by score desc, wins desc, first_seq, name)                          as overall_rank
    from with_score
  )
  insert into public.fighter_rankings as fr
    (fighter_id, division_key, division_name, elo, wins, losses, draws, no_contests, fights,
     division_rank, overall_rank, last_fight_on, score, win_pct, method_points, stats_score, updated_at)
  select fid, division_key, division_name, elo, wins, losses, draws, ncs, wins + losses + draws + ncs,
         division_rank, overall_rank, last_on, round(score::numeric, 4), round(win_pct::numeric, 3),
         method_points, round(stats_avg::numeric, 3), now()
    from ranked
  on conflict (fighter_id) do update set
    division_key = excluded.division_key, division_name = excluded.division_name, elo = excluded.elo,
    wins = excluded.wins, losses = excluded.losses, draws = excluded.draws,
    no_contests = excluded.no_contests, fights = excluded.fights,
    division_rank = excluded.division_rank, overall_rank = excluded.overall_rank,
    last_fight_on = excluded.last_fight_on, score = excluded.score, win_pct = excluded.win_pct,
    method_points = excluded.method_points, stats_score = excluded.stats_score, updated_at = now()
  where (fr.division_key, fr.division_name, fr.elo, fr.wins, fr.losses, fr.draws, fr.no_contests,
         fr.division_rank, fr.overall_rank, fr.last_fight_on, fr.score, fr.win_pct, fr.method_points, fr.stats_score)
        is distinct from
        (excluded.division_key, excluded.division_name, excluded.elo, excluded.wins, excluded.losses,
         excluded.draws, excluded.no_contests, excluded.division_rank, excluded.overall_rank,
         excluded.last_fight_on, excluded.score, excluded.win_pct, excluded.method_points, excluded.stats_score);

  delete from public.fighter_rankings fr
   where not exists (
     select 1 from public.bouts b
      where b.result_status = 'final' and b.discipline = 'MMA'
        and b.blue_fighter_id is not null and b.red_fighter_id is not null
        and fr.fighter_id in (b.blue_fighter_id, b.red_fighter_id));

  select count(*) into n from public.fighter_rankings;
  return n;
end $$;
revoke execute on function public.recompute_rankings() from public, anon, authenticated;

-- Public read models: new columns appended at the end.
create or replace view public.public_rankings as
select fr.fighter_id, f.name, f.nickname, f.photo_url, f.country,
       fr.division_key, fr.division_name, fr.elo, fr.wins, fr.losses, fr.draws, fr.no_contests,
       fr.fights, fr.division_rank, fr.overall_rank, fr.last_fight_on, fr.updated_at,
       fr.score, fr.win_pct, fr.method_points, fr.stats_score
  from public.fighter_rankings fr
  join public.fighters f on f.id = fr.fighter_id;
grant select on public.public_rankings to anon, authenticated;

create or replace view public.public_bout_points as
select bp.bout_id, b.event_id, e.slug as event_slug, e.title as event_title,
       coalesce(e.event_date, b.bout_date) as fought_on, b.bout_number,
       bp.fighter_id, f.name as fighter_name, bp.opponent_id, o.name as opponent_name,
       bp.corner, bp.outcome, bp.result_type, bp.end_round, b.end_time_sec,
       bp.method_weight, bp.score_before, bp.score_after,
       round(bp.score_after - bp.score_before, 4) as score_change,
       bp.wins_after, bp.losses_after, bp.draws_after, bp.seq, bp.stats_share
  from public.bout_points bp
  join public.bouts b on b.id = bp.bout_id and b.result_status = 'final'
  join public.events e on e.id = b.event_id and e.status <> 'draft'
  join public.fighters f on f.id = bp.fighter_id
  left join public.fighters o on o.id = bp.opponent_id;
grant select on public.public_bout_points to anon, authenticated;

create or replace view public.public_last_fights as
select distinct on (fighter_id) *
  from public.public_bout_points
 order by fighter_id, seq desc;
grant select on public.public_last_fights to anon, authenticated;

-- Recalculate when the formula or a stat weight changes.
create or replace function public.ranking_formula_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists ranking_formula_touch on public.ranking_formula;
create trigger ranking_formula_touch before update on public.ranking_formula
  for each row execute function public.ranking_formula_touch();
drop trigger if exists stat_weights_touch on public.stat_score_weights;
create trigger stat_weights_touch before update on public.stat_score_weights
  for each row execute function public.ranking_formula_touch();

drop trigger if exists ranking_formula_dirty on public.ranking_formula;
create trigger ranking_formula_dirty after update on public.ranking_formula
  for each row execute function public.rankings_mark_dirty();
drop trigger if exists ranking_formula_flush on public.ranking_formula;
create trigger ranking_formula_flush after update on public.ranking_formula
  for each statement execute function public.rankings_flush();
drop trigger if exists stat_weights_dirty on public.stat_score_weights;
create trigger stat_weights_dirty after update on public.stat_score_weights
  for each row execute function public.rankings_mark_dirty();
drop trigger if exists stat_weights_flush on public.stat_score_weights;
create trigger stat_weights_flush after update on public.stat_score_weights
  for each statement execute function public.rankings_flush();

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['bout_stat_counters','ranking_formula','stat_score_weights'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

select public.recompute_rankings();

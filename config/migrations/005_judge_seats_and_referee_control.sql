-- =============================================================================
-- WDS — Judges take their own seat; only the referee runs the bout
--
-- Run ONCE in the WDS Supabase project (zxqaolyckzgaqohpiwtk) -> SQL Editor.
-- Safe to re-run. Independent of 002–004 (run order does not matter).
--
-- 1. Judges are no longer assigned in Edit Bout. A signed-in judge opens a
--    bout's Memory Sheet, types their name and picks Judge 1, 2 or 3; seats
--    already taken are not offered (bout_claim_seat).
-- 2. Referees are no longer assigned either: any signed-in referee can start
--    and stop the round clock and call a finish on any bout. The first referee
--    to do so is recorded as the bout's referee.
-- 3. Judges can no longer start/stop the clock or call finishes; they score and
--    submit their round cards.
-- =============================================================================

alter table public.bout_judges add column if not exists display_name text;
comment on column public.bout_judges.display_name is 'Name the judge typed when taking the seat';

-- Active referee or management.
create or replace function public.is_bout_controller()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'REFEREE')
$$;
revoke execute on function public.is_bout_controller() from public, anon;
grant execute on function public.is_bout_controller() to authenticated;

-- An official on a bout: management, any referee, or a judge seated on it.
create or replace function public.is_bout_official(p_bout uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bout_controller()
      or exists (select 1 from public.bouts b where b.id = p_bout and b.referee_id = auth.uid())
      or exists (select 1 from public.bout_judges j where j.bout_id = p_bout and j.judge_id = auth.uid())
$$;

-- Start a bout: referee or management only. A referee becomes the bout's referee.
create or replace function public.bout_start(p_bout uuid)
returns public.bouts language plpgsql security definer set search_path = public as $$
declare b public.bouts;
begin
  if not public.is_bout_controller() then
    raise exception 'Only the referee can start or stop a bout' using errcode = '42501';
  end if;
  select * into b from public.bouts where id = p_bout for update;
  if not found then raise exception 'Bout not found' using errcode = 'P0002'; end if;
  if b.status in ('COMPLETED','CANCELLED') then
    raise exception 'This bout is already complete' using errcode = 'P0001';
  end if;
  update public.bouts
     set status = 'LIVE',
         current_round = greatest(current_round, 1),
         started_at = coalesce(started_at, now()),
         referee_id = case
           when referee_id is null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'REFEREE')
           then auth.uid() else referee_id end
   where id = p_bout
  returning * into b;
  return b;
end $$;

-- bout_set_clock already calls bout_start, so it is now referee/management only.
create or replace function public.bout_set_clock(p_bout uuid, p_running boolean)
returns public.bouts language plpgsql security definer set search_path = public as $$
declare b public.bouts;
begin
  b := public.bout_start(p_bout);   -- validates the caller and the bout
  update public.bouts
     set round_started_at = case when p_running then coalesce(round_started_at, now()) else null end
   where id = p_bout
  returning * into b;
  return b;
end $$;

-- Finishes (KO, TKO, submission…) are called by the referee or management only.
do $$
declare src text;
begin
  select pg_get_functiondef('public.bout_finish(uuid,text,text,int,int,text)'::regprocedure) into src;
  if src like '%if not public.is_bout_official(p_bout) then%' then
    src := replace(src,
      E'if not public.is_bout_official(p_bout) then\n    raise exception ''You are not an official on this bout'' using errcode = ''42501'';',
      E'if not public.is_bout_controller() then\n    raise exception ''Only the referee can call a finish'' using errcode = ''42501'';');
    execute src;
  end if;
end $$;

-- A judge takes a seat (1, 2 or 3) on a bout, typing their name.
-- Changing seat is allowed until the judge has submitted a card on this bout.
create or replace function public.bout_claim_seat(p_bout uuid, p_seat int, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b    public.bouts;
  me   public.profiles;
  nm   text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  mine public.bout_judges;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found or not me.active or me.role is distinct from 'JUDGE' then
    raise exception 'Sign in as a judge to take a seat' using errcode = '42501';
  end if;
  if nm is null or length(nm) < 2 or length(nm) > 80 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if p_seat is null or p_seat not between 1 and 3 then
    raise exception 'Choose Judge 1, 2 or 3' using errcode = '22023';
  end if;
  select * into b from public.bouts where id = p_bout for update;   -- one seat change at a time per bout
  if not found then raise exception 'Bout not found' using errcode = 'P0002'; end if;
  if b.status in ('COMPLETED','CANCELLED') then
    raise exception 'This bout is already complete' using errcode = 'P0001';
  end if;

  select * into mine from public.bout_judges where bout_id = p_bout and judge_id = me.id;
  if exists (select 1 from public.bout_judges where bout_id = p_bout and seat = p_seat and judge_id <> me.id) then
    raise exception 'Judge % is already taken on this bout — choose another number', p_seat using errcode = '23505';
  end if;
  if mine.id is not null and mine.seat <> p_seat
     and exists (select 1 from public.round_scores where bout_id = p_bout and judge_id = me.id and submitted) then
    raise exception 'You have already submitted a card as Judge % on this bout', mine.seat using errcode = 'P0001';
  end if;

  if mine.id is null then
    insert into public.bout_judges (bout_id, judge_id, seat, display_name) values (p_bout, me.id, p_seat, nm);
  else
    update public.bout_judges set seat = p_seat, display_name = nm where id = mine.id;
  end if;

  return jsonb_build_object('bout_id', p_bout, 'seat', p_seat, 'name', nm);
end $$;
revoke execute on function public.bout_claim_seat(uuid, int, text) from public, anon;
grant execute on function public.bout_claim_seat(uuid, int, text) to authenticated;

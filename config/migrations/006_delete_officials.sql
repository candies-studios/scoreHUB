-- =============================================================================
-- WDS — Deleting an official really deletes them
--
-- Run ONCE in the WDS Supabase project (zxqaolyckzgaqohpiwtk) -> SQL Editor.
-- Safe to re-run.
--
-- delete_official(id): management only.
--   * An official who has never submitted a judge's scorecard is deleted from
--     the database: their login (auth.users), profile, PIN and any invite. The
--     same email can be added again later.
--   * An official who HAS submitted scorecards cannot be deleted, because
--     deleting them would also delete those cards from past bouts. They are made
--     inactive instead (they can no longer sign in), and the function says why.
--   * You cannot delete yourself, or the last active admin.
-- Things that only point at the official (referee of a bout, created an event,
-- a strike-sheet tap…) keep their data with the name link cleared.
-- =============================================================================

create or replace function public.delete_official(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  p      public.profiles;
  cards  int;
begin
  if not public.is_staff() then
    raise exception 'Only management can delete officials' using errcode = '42501';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot delete your own account' using errcode = 'P0001';
  end if;
  select * into p from public.profiles where id = p_id for update;
  if not found then
    raise exception 'Official not found' using errcode = 'P0002';
  end if;
  if p.role = 'ADMIN' and p.active
     and not exists (select 1 from public.profiles where role = 'ADMIN' and active and id <> p_id) then
    raise exception 'You cannot delete the last active admin' using errcode = 'P0001';
  end if;

  select count(*) into cards from public.round_scores where judge_id = p_id;
  if cards > 0 then
    update public.profiles set active = false where id = p_id;
    return jsonb_build_object('deleted', false, 'deactivated', true, 'cards', cards, 'name', p.name);
  end if;

  if p.email is not null then
    delete from public.official_invites where email = lower(p.email);
  end if;
  delete from auth.users where id = p_id;          -- cascades to the profile, seats and presence
  delete from public.profiles where id = p_id;     -- in case there was no login row
  return jsonb_build_object('deleted', true, 'name', p.name);
end $$;
revoke execute on function public.delete_official(uuid) from public, anon;
grant execute on function public.delete_official(uuid) to authenticated;

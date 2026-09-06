-- Follow-up hardening from the pre-Supabase-launch security review.

-- (1) SECURITY DEFINER functions must pin search_path, or an unqualified table
-- reference inside them resolves using the CALLER's search_path rather than a
-- fixed one — Supabase's own advisor flags this as "Function Search Path Mutable".
alter function finalize_game_points() set search_path = public;

-- (2) picks.points_earned / is_auto_assigned are server-computed (finalize_game_points
-- sets points_earned; is_auto_assigned is meant for a future auto-pick feature, not
-- user input). The existing "update their own unlocked picks" policy has no column
-- restriction, so a user could UPDATE either directly pre-kickoff. Column-level grants
-- are enforced independently of RLS, so this closes the gap without touching the policy.
revoke update (points_earned, is_auto_assigned) on picks from authenticated;

-- (3) Profiles/favorite-teams were readable by every authenticated user, not just
-- people who share a league with them. Scope reads to: yourself, plus anyone you
-- share at least one league with.
drop policy "profiles are publicly readable" on profiles;

create policy "users can read their own profile" on profiles
  for select using (auth.uid() = id);

create policy "users can read league co-members' profiles" on profiles
  for select using (
    exists (
      select 1 from league_members m1
      join league_members m2 on m2.league_id = m1.league_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

drop policy "favorite teams are publicly readable" on profile_favorite_teams;

-- (own rows are already covered by "users manage their own favorite teams" for all)
create policy "users can read league co-members' favorite teams" on profile_favorite_teams
  for select using (
    exists (
      select 1 from league_members m1
      join league_members m2 on m2.league_id = m1.league_id
      where m1.user_id = auth.uid() and m2.user_id = profile_favorite_teams.user_id
    )
  );

-- (4) join_league_with_code had no throttling, so a script could brute-force the
-- ~1e9-combination invite-code space. Track failed attempts per user (the RPC
-- already requires auth) and lock out further tries once someone racks up too many
-- in a short window. Successful joins aren't recorded — this only throttles guessing.
--
-- Not a full solution on its own (an attacker who can cheaply mint new accounts
-- resets their own counter), so it's worth pairing with Supabase Auth's email
-- confirmation if that isn't already on. An expiring invite code is a reasonable
-- next step later — it's a plain nullable `timestamptz` column, trivial to add to
-- `leagues` in a future migration whenever a regenerate-code flow exists to pair with it.
create table invite_code_attempts (
  user_id uuid not null references profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index idx_invite_code_attempts_user_time on invite_code_attempts (user_id, attempted_at);

-- RLS with no policies: only the table owner (and thus the security-definer
-- function below) can touch this table. No client, not even the owning user, can
-- read or write it directly.
alter table invite_code_attempts enable row level security;

create or replace function join_league_with_code(p_code text)
returns leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league leagues;
  v_recent_failures int;
begin
  -- opportunistic cleanup, keeps the table small without needing a cron job
  delete from invite_code_attempts
    where user_id = auth.uid() and attempted_at < now() - interval '1 day';

  select count(*) into v_recent_failures
    from invite_code_attempts
    where user_id = auth.uid() and attempted_at > now() - interval '10 minutes';

  if v_recent_failures >= 10 then
    raise exception 'Too many invalid attempts — please wait a few minutes and try again';
  end if;

  select * into v_league from leagues where invite_code = p_code;
  if not found then
    insert into invite_code_attempts (user_id) values (auth.uid());
    raise exception 'Invalid invite code';
  end if;

  insert into league_members (league_id, user_id) values (v_league.id, auth.uid())
    on conflict do nothing;
  return v_league;
end;
$$;

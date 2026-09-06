-- league_members' own select policy subquery on league_members recurses into itself once
-- anything else (leagues, picks, or the 0003 profile co-member policies) joins through it too.
-- SECURITY DEFINER functions bypass RLS internally, breaking the cycle.

create or replace function is_league_member(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from league_members where league_id = p_league_id and user_id = p_user_id
  );
$$;
grant execute on function is_league_member(uuid, uuid) to authenticated;

create or replace function shares_league_with(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from league_members m1
    join league_members m2 on m2.league_id = m1.league_id
    where m1.user_id = p_user_a and m2.user_id = p_user_b
  );
$$;
grant execute on function shares_league_with(uuid, uuid) to authenticated;

drop policy "members can read their league roster" on league_members;
create policy "members can read their league roster" on league_members
  for select using (is_league_member(league_members.league_id, auth.uid()));

drop policy "members can read their leagues" on leagues;
create policy "members can read their leagues" on leagues
  for select using (is_league_member(leagues.id, auth.uid()));

drop policy "members read league picks after kickoff" on picks;
create policy "members read league picks after kickoff" on picks
  for select using (
    exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time <= now())
    and is_league_member(picks.league_id, auth.uid())
  );

drop policy "users can read league co-members' profiles" on profiles;
create policy "users can read league co-members' profiles" on profiles
  for select using (shares_league_with(auth.uid(), profiles.id));

drop policy "users can read league co-members' favorite teams" on profile_favorite_teams;
create policy "users can read league co-members' favorite teams" on profile_favorite_teams
  for select using (shares_league_with(auth.uid(), profile_favorite_teams.user_id));

-- A cheap, narrow lookup for "which seasons does this user have any pick in" -- used to
-- populate the Reports page's season filter without fetching full pick history across every
-- season just to derive it. Same security_invoker reasoning as league_standings/mnf_standings
-- (0002_leagues_and_pickem.sql): queried with .eq('user_id', the signed-in caller's own id),
-- which "users read their own picks" already permits regardless of game/lock state. `distinct`
-- collapses it to one row per (user, league, season) instead of one row per pick.
create view user_pick_seasons with (security_invoker = true) as
  select distinct p.user_id, p.league_id, pe.season_year
  from picks p
  join periods pe on pe.id = p.period_id;

grant select on user_pick_seasons to authenticated;
-- With "Automatically expose new tables" off, service_role needs this too (bypassing RLS and
-- holding a table/view grant are independent) -- see 0009_grant_service_role.sql for the same
-- reasoning applied to the base tables.
grant select on user_pick_seasons to service_role;

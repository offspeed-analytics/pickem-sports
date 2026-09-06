-- service_role bypasses RLS, but with "Automatically expose new tables" off it still needs the
-- same explicit table-level grants authenticated needed — RLS bypass and table grants are
-- independent mechanisms. Needed by scripts/sync-games.mjs and scripts/auto-assign-picks.mjs.
grant select on teams to service_role;
grant select, insert, update on periods to service_role;
grant select, insert, update on games to service_role;
grant select on leagues to service_role;
grant select on league_members to service_role;
grant select, insert, update on picks to service_role;

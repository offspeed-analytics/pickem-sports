-- scripts/send-pick-reminders.mjs looks up usernames (for the email greeting) via the
-- service-role client. Same independent-grant requirement as 0009_grant_service_role.sql: RLS
-- bypass and table grants are separate mechanisms, and profiles was never previously needed by
-- a service-role script.
grant select on profiles to service_role;

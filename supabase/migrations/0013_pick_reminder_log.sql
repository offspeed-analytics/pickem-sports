-- Idempotency log for scripts/send-pick-reminders.mjs. The cron runs hourly (to catch the
-- reminder window promptly) but must send at most one reminder per (user, league, period) --
-- this table's unique constraint enforces that. Only the service-role script ever touches it:
-- RLS enabled with no policies, same pattern as invite_code_attempts in 0003_security_hardening.sql.

create table pick_reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  league_id uuid not null references leagues (id) on delete cascade,
  period_id uuid not null references periods (id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (user_id, league_id, period_id)
);

alter table pick_reminder_log enable row level security;

-- service_role bypasses RLS, but with "Automatically expose new tables" off it still needs the
-- same explicit table-level grant (see 0009_grant_service_role.sql).
grant select, insert on pick_reminder_log to service_role;

-- Redesigned scripts/send-pick-reminders.mjs to send once a week instead of hourly, which means
-- there's nothing left to deduplicate against -- a single weekly run needs no idempotency log.
-- Drops the table from the earlier hourly-cron design in case it was already applied to a
-- hosted project before this change landed.
drop table if exists pick_reminder_log;

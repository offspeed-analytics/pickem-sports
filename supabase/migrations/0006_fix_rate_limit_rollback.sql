-- 0003's rate limiting never actually worked: `raise exception` aborts the whole transaction,
-- which rolled back the `insert into invite_code_attempts` right before it in the same call —
-- so the tracked-attempts count never advanced past 0, and 13 real failed attempts in testing
-- confirmed zero rate-limiting ever kicked in. Fix: don't raise for "invalid code" (that's the
-- path that needs its insert to actually persist) — return null and let the client report it.
-- "Too many attempts" still raises; that path has nothing new to persist.
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
    return null;
  end if;

  insert into league_members (league_id, user_id) values (v_league.id, auth.uid())
    on conflict do nothing;
  return v_league;
end;
$$;

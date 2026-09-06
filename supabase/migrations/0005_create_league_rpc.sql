-- createLeague hit the same RLS shape problem join_league_with_code was already built to avoid:
-- reading the newly-inserted leagues row back (via .select()) requires satisfying the leagues
-- SELECT policy, which requires membership — but the owner isn't a member yet at that point.
-- A security-definer RPC does both inserts atomically and can read the row back internally,
-- bypassing RLS. Bonus: owner_id is now set from auth.uid() server-side, not trusted client input.
create or replace function create_league(p_name text)
returns leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league leagues;
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    begin
      insert into leagues (name, owner_id, invite_code) values (p_name, auth.uid(), v_code)
        returning * into v_league;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 5 then
        raise exception 'Could not generate a unique invite code — please try again';
      end if;
    end;
  end loop;

  insert into league_members (league_id, user_id) values (v_league.id, auth.uid());
  return v_league;
end;
$$;

grant execute on function create_league(text) to authenticated;

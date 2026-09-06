-- Reassigning a game's confidence value to one another game already holds needs an atomic swap,
-- not a plain update, or the unique constraint below would reject whichever update runs second.
-- Deferring the constraint lets both updates land inside one transaction before it's checked,
-- instead of after each statement. Looked up by column signature rather than a hardcoded name
-- since Postgres' auto-generated constraint name isn't guaranteed.
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'public.picks'::regclass
    and contype = 'u'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'public.picks'::regclass
        and attname in ('user_id', 'league_id', 'period_id', 'confidence_value')
    );

  execute format('alter table picks drop constraint %I', c_name);
  execute format(
    'alter table picks add constraint %I unique (user_id, league_id, period_id, confidence_value) deferrable initially deferred',
    c_name
  );
end $$;

-- No security definer here (unlike create_league/join_league_with_code): every row this touches
-- already belongs to the caller, so running as invoker and letting RLS apply normally is simpler
-- and narrower. The existing "users update their own unlocked picks" policy already blocks
-- swapping a locked game's own value; the exists() check below gives a clear error instead of a
-- raw unique_violation when the *other* game (the one being displaced) is the locked one.
create or replace function swap_pick_confidence(
  p_league_id uuid,
  p_period_id uuid,
  p_game_id uuid,
  p_new_value int
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_old_value int;
  v_other_game_id uuid;
begin
  select confidence_value into v_old_value
  from picks
  where user_id = auth.uid() and league_id = p_league_id and period_id = p_period_id and game_id = p_game_id;

  if v_old_value is null then
    raise exception 'No existing pick for this game';
  end if;

  if v_old_value = p_new_value then
    return;
  end if;

  select game_id into v_other_game_id
  from picks
  where user_id = auth.uid() and league_id = p_league_id and period_id = p_period_id
    and confidence_value = p_new_value;

  if v_other_game_id is not null then
    if exists (select 1 from games g where g.id = v_other_game_id and g.kickoff_time <= now()) then
      raise exception 'That value belongs to a game that has already locked and cannot be swapped';
    end if;

    update picks set confidence_value = v_old_value
      where user_id = auth.uid() and league_id = p_league_id and period_id = p_period_id
        and game_id = v_other_game_id;
  end if;

  update picks set confidence_value = p_new_value
    where user_id = auth.uid() and league_id = p_league_id and period_id = p_period_id
      and game_id = p_game_id;
end;
$$;

grant execute on function swap_pick_confidence(uuid, uuid, uuid, int) to authenticated;

-- pick_outcome is fully determined by points_earned (which finalize_game_points() already sets
-- correctly for every lifecycle state), but that convention -- null=pending, 0=incorrect (wrong
-- or tied), >0=correct -- previously only lived in that trigger's logic. A generated column makes
-- it queryable and self-maintaining: it can never drift from points_earned, and Postgres rejects
-- any attempt to write to it directly.
alter table picks add column pick_outcome text generated always as (
  case
    when points_earned is null then 'pending'
    when points_earned > 0 then 'correct'
    else 'incorrect'
  end
) stored;

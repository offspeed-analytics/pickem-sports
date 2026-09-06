-- finalize_game_points only fires when a game's status *transitions* to final, so it never
-- re-runs for a pick inserted afterward. With once-daily cron, an early game can finish (and get
-- marked final by that same run) hours before auto-assign-picks gets around to backfilling a
-- missing pick for it — that pick would sit with points_earned = null forever. This adds the
-- complementary case: score a pick at insert time if its game is already final.
create or replace function score_pick_if_game_already_final() returns trigger as $$
declare
  v_game games;
begin
  select * into v_game from games where id = new.game_id;
  if v_game.status = 'final' then
    if v_game.home_score = v_game.away_score then
      new.points_earned := 0;
    else
      new.points_earned := case
        when new.picked_team_id =
          (case when v_game.home_score > v_game.away_score then v_game.home_team_id else v_game.away_team_id end)
        then new.confidence_value else 0
      end;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_score_pick_if_game_already_final
  before insert on picks
  for each row execute function score_pick_if_game_already_final();

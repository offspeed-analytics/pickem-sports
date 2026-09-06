-- The insert policy in 0002 had no kickoff-time check, only the update policy did — meaning a
-- user's FIRST pick on an already-locked game could bypass the lock entirely (only edits to an
-- existing pick were blocked). Editing picks client-side already checks this, but RLS should
-- enforce it server-side too.
drop policy "users manage their own picks" on picks;
create policy "users insert their own unlocked picks" on picks
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time > now())
  );

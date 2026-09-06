-- Applied in Phase 6. Auth/profiles/teams already landed in 0001 (Phase 2).

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text not null default 'NFL',
  gameplay_mode text not null default 'confidence_pickem', -- open text so a future mode needs no migration
  settings jsonb not null default '{}'::jsonb,
  invite_code text not null unique,
  owner_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

-- A batch of games picked together (NFL "Week 5", or a postseason round) — named for the
-- confidence-pickem mechanic that needs it, not any one sport's calendar.
create table periods (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'NFL',
  season_year int not null,
  season_type text not null default 'regular', -- 'regular' | 'postseason'
  period_number int not null,
  unique (sport, season_year, season_type, period_number)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references periods (id) on delete cascade,
  external_game_id text, -- provider's event id, for idempotent sync upserts
  home_team_id uuid not null references teams (id),
  away_team_id uuid not null references teams (id),
  kickoff_time timestamptz not null,
  broadcast_window text, -- 'thursday_night' | 'sunday_night' | 'monday_night' | null; derived during sync
  is_neutral_site boolean not null default false,
  home_record text,
  away_record text,
  odds_spread text,
  odds_over_under numeric,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'final')),
  home_score int,
  away_score int,
  updated_at timestamptz not null default now(),
  unique (period_id, home_team_id, away_team_id)
);
create index idx_games_period on games (period_id);

create table picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  league_id uuid not null references leagues (id) on delete cascade,
  period_id uuid not null references periods (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  picked_team_id uuid not null references teams (id),
  confidence_value int not null check (confidence_value >= 1),
  is_auto_assigned boolean not null default false,
  points_earned int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, league_id, game_id),
  unique (user_id, league_id, period_id, confidence_value) -- enforces the 1..n-used-once rule
);
create index idx_picks_user_league_period on picks (user_id, league_id, period_id);

-- Leagues persist across seasons (members/invite code carry forward with no re-creation step —
-- a pick just references whichever period it was made for), so standings must be scored PER
-- SEASON, not as a lifetime total across every period the league has ever played.
create view league_standings with (security_invoker = true) as
  select p.league_id, p.user_id, pe.season_year, sum(coalesce(p.points_earned, 0)) as total_points
  from picks p
  join periods pe on pe.id = p.period_id
  group by p.league_id, p.user_id, pe.season_year;

-- MNF tiebreaker: cumulative points a user earned specifically on Monday-night picks, per season.
create view mnf_standings with (security_invoker = true) as
  select p.league_id, p.user_id, pe.season_year, sum(coalesce(p.points_earned, 0)) as total_points
  from picks p
  join games g on g.id = p.game_id
  join periods pe on pe.id = p.period_id
  where g.broadcast_window = 'monday_night'
  group by p.league_id, p.user_id, pe.season_year;

-- Without security_invoker, views run as their owner and would bypass picks' RLS,
-- leaking every league's standings to every authenticated user.
grant select on league_standings to authenticated;
grant select on mnf_standings to authenticated;

create or replace function finalize_game_points() returns trigger as $$
begin
  if new.status = 'final' and (old.status is distinct from 'final') then
    if new.home_score = new.away_score then
      update picks set points_earned = 0 where game_id = new.id;
    else
      update picks set points_earned =
        case when picked_team_id =
          (case when new.home_score > new.away_score then new.home_team_id else new.away_team_id end)
        then confidence_value else 0 end
      where game_id = new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_finalize_game_points
  after update on games
  for each row execute function finalize_game_points();

-- Security-definer RPC so the anon key can never enumerate leagues/invite codes via a table scan.
create or replace function join_league_with_code(p_code text)
returns leagues
language plpgsql security definer as $$
declare v_league leagues;
begin
  select * into v_league from leagues where invite_code = p_code;
  if not found then raise exception 'Invalid invite code'; end if;
  insert into league_members (league_id, user_id) values (v_league.id, auth.uid())
    on conflict do nothing;
  return v_league;
end;
$$;

alter table leagues enable row level security;
alter table league_members enable row level security;
alter table periods enable row level security;
alter table games enable row level security;
alter table picks enable row level security;

create policy "periods are publicly readable" on periods for select using (true);
create policy "games are publicly readable" on games for select using (true);

create policy "members can read their leagues" on leagues
  for select using (
    exists (select 1 from league_members m where m.league_id = leagues.id and m.user_id = auth.uid())
  );
create policy "authenticated users can create leagues" on leagues
  for insert with check (auth.uid() = owner_id);

create policy "members can read their league roster" on league_members
  for select using (
    exists (
      select 1 from league_members m
      where m.league_id = league_members.league_id and m.user_id = auth.uid()
    )
  );
-- Joining someone else's league only ever happens via join_league_with_code (security definer).
-- This is narrower: it only lets an owner add themselves as the first member of their own league.
create policy "owners can add themselves to their own league" on league_members
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from leagues l where l.id = league_members.league_id and l.owner_id = auth.uid())
  );

-- Own picks are always visible; other members' picks unlock once that game has kicked off.
create policy "users read their own picks" on picks
  for select using (auth.uid() = user_id);
create policy "members read league picks after kickoff" on picks
  for select using (
    exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time <= now())
    and exists (
      select 1 from league_members m where m.league_id = picks.league_id and m.user_id = auth.uid()
    )
  );
create policy "users manage their own picks" on picks
  for insert with check (auth.uid() = user_id);
create policy "users update their own unlocked picks" on picks
  for update using (
    auth.uid() = user_id
    and exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time > now())
  );

-- With "Automatically expose new tables" off, these grants (not just the RLS policies above)
-- are required for the Data API to serve these tables/functions at all. league_members' insert
-- grant only covers the owner-self-insert policy above; joining someone else's league still only
-- happens inside join_league_with_code, which runs as the function owner (security definer).
grant select on periods to authenticated;
grant select on games to authenticated;
grant select, insert on leagues to authenticated;
grant select, insert on league_members to authenticated;
grant select, insert, update on picks to authenticated;
grant execute on function join_league_with_code(text) to authenticated;

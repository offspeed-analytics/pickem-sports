-- Applied in Phase 2, alongside real Supabase Auth setup.
-- Leagues/periods/games/picks come later in 0002 (Phase 6) — everything else stays
-- on the mock DataClient until then.

create table teams (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'NFL',
  external_id text not null, -- the provider's own team id (e.g. ESPN's numeric id), the real sync match key
  name text not null,
  abbreviation text not null, -- display/logo-URL use; not used to match sync data
  logo_url text,
  conference text,
  division text,
  unique (sport, external_id),
  unique (sport, abbreviation)
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- One favorite team per sport per user (multi-sport is planned; a single FK column can't hold that).
create table profile_favorite_teams (
  user_id uuid not null references profiles (id) on delete cascade,
  sport text not null,
  team_id uuid not null references teams (id),
  primary key (user_id, sport)
);

alter table teams enable row level security;
alter table profiles enable row level security;
alter table profile_favorite_teams enable row level security;

-- Reference data: public read, writes only via the service-role key (never the browser).
create policy "teams are publicly readable" on teams for select using (true);

-- Usernames need to be visible across a league, so profiles are read-all rather than self-only.
create policy "profiles are publicly readable" on profiles for select using (true);

-- Onboarding inserts the row itself after signup (no auth trigger) and can update its own profile.
create policy "users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "favorite teams are publicly readable" on profile_favorite_teams for select using (true);

create policy "users manage their own favorite teams" on profile_favorite_teams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- With "Automatically expose new tables" off, these grants (not just the RLS policies above)
-- are required for the Data API to serve these tables at all.
grant select on teams to authenticated;
grant select, insert, update on profiles to authenticated;
grant select, insert, update, delete on profile_favorite_teams to authenticated;

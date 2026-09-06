-- sport and gameplay_mode are both strings we fully control (not user input), with identical
-- typo risk (e.g. 'Nfl' vs 'NFL' silently creating a second, wrong "sport"). Text-keyed lookup
-- tables catch that via FK constraint and give a home for future per-sport/per-mode metadata,
-- without needing a numeric/UUID surrogate id or any app-code changes — 'NFL' and
-- 'confidence_pickem' stay the actual values everywhere, just now referentially enforced.
-- Cheap to add even with real data: existing values already conform, so no backfill needed.

create table sports (code text primary key);
insert into sports (code) values ('NFL');

create table gameplay_modes (code text primary key);
insert into gameplay_modes (code) values ('confidence_pickem');

alter table sports enable row level security;
create policy "sports are publicly readable" on sports for select using (true);
grant select on sports to authenticated;

alter table gameplay_modes enable row level security;
create policy "gameplay modes are publicly readable" on gameplay_modes for select using (true);
grant select on gameplay_modes to authenticated;

alter table teams add constraint teams_sport_fkey foreign key (sport) references sports (code);
alter table periods add constraint periods_sport_fkey foreign key (sport) references sports (code);
alter table leagues add constraint leagues_sport_fkey foreign key (sport) references sports (code);
alter table profile_favorite_teams
  add constraint profile_favorite_teams_sport_fkey foreign key (sport) references sports (code);
alter table leagues
  add constraint leagues_gameplay_mode_fkey foreign key (gameplay_mode) references gameplay_modes (code);

-- season_type and broadcast_window stay plain text (not lookup tables): unlike sport/gameplay_mode,
-- neither is expected to grow — they're minor scheduling/display details, not extensibility axes.

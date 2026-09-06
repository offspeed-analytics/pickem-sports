# Pickem Sports

## Launch Overview

A web app (with a possible future mobile app) for pick'em-style games with friends. Users log in, then create or join groups to compete. The first supported gameplay mode is a **weighted confidence pick'em**:

- Pick the winner of every game in the week.
- Assign a confidence score from 1 to *n* (where *n* = number of games that week), using each value exactly once.
- A correct pick earns its assigned confidence points; an incorrect pick or a tie earns 0.
- Points accumulate across the season within each group — highest total at season's end wins.

## Infra Specifics

- **Database & backend:** Supabase (Postgres + Auth + Realtime + Edge Functions), free tier.
- **Frontend hosting:** GitHub Pages, serving a dynamic single-page app (not static content) that calls Supabase's API directly from the browser — no server of our own required.
- **Login:** Full auth support via Supabase Auth, plus onboarding to set a username and choose a favorite team.
- **Data model:** Standard OLTP tables — profiles, groups, group members, weeks, games, picks, tiebreaker predictions, and scores.
- **Game & odds data:** Pulled from an external sports API and synced into our own `games` table.
- **Score updates:** Pulled periodically (minimum nightly) to get updates. Only update scores and leaderboards as earned if the game is completed.
- **Future Live score updates:** A scheduled job (GitHub Actions cron, since Supabase's own cron is a paid feature) polls the sports data source every 5-10 minutes during live windows and writes results into Supabase. Supabase Realtime then pushes those changes to connected clients so leaderboards and scoreboards update without a manual refresh.
- **Future mobile app:** This architecture supports it cleanly — Supabase's API is frontend-agnostic, so a future React Native, Flutter, or native app would reuse the same backend, schema, auth, and scoring logic. Push notifications (e.g. "picks lock in 1 hour") would be a new addition at that point, via Firebase Cloud Messaging or APNs.

## League Specifics

- Create a league, or join an existing one via an invite code.
- Support for multiple gameplay modes:
  - **Launch mode:** confidence pick'em (detailed above).
  - **Future modes:** survivor pools, and others TBD.
- Multi-sport support planned, starting with NFL only at launch.
- Points accumulate across the season within each league.
- **Tiebreaker:** cumulative points scored across all Monday Night Football games over the season. Predictions are made weekly and tracked as running totals; lowest cumulative difference from actual scores wins ties at the season level. Weekly ties (if applicable) use that week's single MNF prediction rather than the cumulative total.
- Scoreboards update as games finish and points are earned, and periodically while games are live (see Infra Specifics).

## Pickem Specifics

- Weighted confidence scoring, as described above.
- Confidence values range from 1 to *n* (games that week), each used exactly once per user per week.
- Picks lock at each game's kickoff time and can be freely edited beforehand.
- If a user doesn't submit picks for a game, a random pick is assigned automatically so they stay in contention rather than scoring zero outright.
- A tie game awards 0 points to everyone, regardless of pick.

### Game Picking & Tracking

- A single scrollable screen per week displays all games.
- Each game shows both teams (logo + name); click a team to pick them as the winner.
- Team records, game time, and odds are displayed in the middle of the matchup card.
- A pick locks in immediately on click but remains editable until kickoff.
- Live tracking pulls periodic score updates once games are underway, keeping picks and standings current in near real time.

## Open Questions / Decisions Still Needed

- Confirm the exact source and refresh cadence for live score data (rate limits vs. desired "live" feel).
  - Leaning towards ESPN api. Ideally minimum 15-minute updates if that will work for free
  - And only if those updates can run during games. No need to run at 2am on a Tuesday for example
- Decide whether missing confidence-point assignments should also randomize (not just the winner pick), to keep the 1–*n* uniqueness constraint valid.
  - Yes assign random, but let's flag it in the data.
- Define UI/UX for survivor pools and other future modes before they're built.

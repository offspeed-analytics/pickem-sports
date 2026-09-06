// Syncs the current NFL regular season's schedule/scores from ESPN's public scoreboard endpoint
// into teams/periods/games. Run nightly via .github/workflows/sync-scores.yml, or locally with:
//   node --env-file=.env scripts/sync-games.mjs
// Postseason isn't synced yet — deliberately deferred, see the plan doc.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const REGULAR_SEASON_WEEKS = 18
const ET_OFFSET_HOURS = -4 // approximate; good enough for weekday/primetime derivation

function currentNflSeasonYear(now = new Date()) {
  // NFL season crosses the calendar year (Sep-Feb); games in Jan/Feb belong to the prior year's season.
  const month = now.getUTCMonth() // 0 = January
  return month <= 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
}

function broadcastWindow(isoDate) {
  const shifted = new Date(new Date(isoDate).getTime() + ET_OFFSET_HOURS * 3600 * 1000)
  const weekday = shifted.getUTCDay() // 0=Sun ... 6=Sat
  const hour = shifted.getUTCHours()
  if (weekday === 4) return 'thursday_night'
  if (weekday === 1) return 'monday_night'
  if (weekday === 0 && hour >= 19) return 'sunday_night'
  return null
}

function totalRecord(records) {
  return records?.find((r) => r.type === 'total')?.summary ?? null
}

function mapStatus(espnStatusName) {
  if (espnStatusName === 'STATUS_FINAL') return 'final'
  if (espnStatusName === 'STATUS_IN_PROGRESS') return 'in_progress'
  return 'scheduled'
}

async function fetchWeek(seasonYear, week) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${seasonYear}&seasontype=2&week=${week}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN fetch failed for week ${week}: ${res.status}`)
  return res.json()
}

async function main() {
  const seasonYear = currentNflSeasonYear()
  console.log(`Syncing NFL ${seasonYear} regular season...`)

  const { data: teamRows, error: teamsError } = await supabase
    .from('teams')
    .select('id, external_id')
    .eq('sport', 'NFL')
  if (teamsError) throw teamsError
  const teamIdByExternalId = new Map(teamRows.map((t) => [t.external_id, t.id]))

  let gamesUpserted = 0

  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
    const data = await fetchWeek(seasonYear, week)
    if (!data.events?.length) continue

    const { data: period, error: periodError } = await supabase
      .from('periods')
      .upsert(
        { sport: 'NFL', season_year: seasonYear, season_type: 'regular', period_number: week },
        { onConflict: 'sport,season_year,season_type,period_number' },
      )
      .select('id')
      .single()
    if (periodError) throw periodError

    const gameRows = []
    for (const event of data.events) {
      const comp = event.competitions[0]
      const home = comp.competitors.find((c) => c.homeAway === 'home')
      const away = comp.competitors.find((c) => c.homeAway === 'away')
      const homeTeamId = teamIdByExternalId.get(home.team.id)
      const awayTeamId = teamIdByExternalId.get(away.team.id)
      if (!homeTeamId || !awayTeamId) {
        console.warn(`Skipping event ${event.id}: unknown team (${home.team.id}/${away.team.id})`)
        continue
      }
      const odds = comp.odds?.[0]
      const status = mapStatus(comp.status.type.name)
      gameRows.push({
        period_id: period.id,
        external_game_id: event.id,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_time: comp.date,
        broadcast_window: broadcastWindow(comp.date),
        is_neutral_site: comp.neutralSite ?? false,
        home_record: totalRecord(home.records),
        away_record: totalRecord(away.records),
        odds_spread: odds?.details ?? null,
        odds_over_under: odds?.overUnder ?? null,
        status,
        home_score: status !== 'scheduled' ? Number(home.score) : null,
        away_score: status !== 'scheduled' ? Number(away.score) : null,
      })
    }

    if (gameRows.length > 0) {
      const { error: gamesError } = await supabase
        .from('games')
        .upsert(gameRows, { onConflict: 'period_id,home_team_id,away_team_id' })
      if (gamesError) throw gamesError
      gamesUpserted += gameRows.length
    }

    // be polite to ESPN's public endpoint
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  console.log(`Done. Upserted ${gamesUpserted} games across ${REGULAR_SEASON_WEEKS} weeks.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

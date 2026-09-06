// Backstops missing picks on games that just locked: assigns a random winner + a random unused
// confidence value, flagged via is_auto_assigned, so a user who forgot stays in contention rather
// than scoring zero outright (per the spec's explicit decision). Run via
// .github/workflows/auto-assign-picks.yml, or locally with:
//   node --env-file=.env scripts/auto-assign-picks.mjs
//
// Only looks at games that locked within the last LOOKBACK_HOURS — not all of history — so a
// member who joined after a game already passed never gets a retroactive auto-pick for it.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const LOOKBACK_HOURS = 24

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function main() {
  const now = new Date()
  const lookbackStart = new Date(now.getTime() - LOOKBACK_HOURS * 3600 * 1000).toISOString()

  const { data: lockedGames, error: gamesError } = await supabase
    .from('games')
    .select('id, period_id, home_team_id, away_team_id')
    .lte('kickoff_time', now.toISOString())
    .gte('kickoff_time', lookbackStart)
  if (gamesError) throw gamesError
  if (!lockedGames.length) {
    console.log('No recently-locked games to check.')
    return
  }

  const periodIds = [...new Set(lockedGames.map((g) => g.period_id))]

  const { data: periodGames, error: periodGamesError } = await supabase
    .from('games')
    .select('id, period_id')
    .in('period_id', periodIds)
  if (periodGamesError) throw periodGamesError
  const gameCountByPeriod = new Map()
  for (const g of periodGames) {
    gameCountByPeriod.set(g.period_id, (gameCountByPeriod.get(g.period_id) ?? 0) + 1)
  }

  const { data: leagues, error: leaguesError } = await supabase.from('leagues').select('id')
  if (leaguesError) throw leaguesError

  let assigned = 0

  for (const league of leagues) {
    const { data: members, error: membersError } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)
    if (membersError) throw membersError
    if (!members.length) continue

    for (const periodId of periodIds) {
      const gamesInPeriod = lockedGames.filter((g) => g.period_id === periodId)
      const gameCount = gameCountByPeriod.get(periodId) ?? 0
      if (gameCount === 0) continue

      const { data: existingPicks, error: picksError } = await supabase
        .from('picks')
        .select('user_id, game_id, confidence_value')
        .eq('league_id', league.id)
        .eq('period_id', periodId)
      if (picksError) throw picksError

      const picksByUser = new Map()
      for (const p of existingPicks) {
        if (!picksByUser.has(p.user_id)) picksByUser.set(p.user_id, [])
        picksByUser.get(p.user_id).push(p)
      }

      const newRows = []
      for (const member of members) {
        const userPicks = picksByUser.get(member.user_id) ?? []
        const pickedGameIds = new Set(userPicks.map((p) => p.game_id))
        const usedValues = new Set(userPicks.map((p) => p.confidence_value))

        for (const game of gamesInPeriod) {
          if (pickedGameIds.has(game.id)) continue
          const available = []
          for (let v = 1; v <= gameCount; v++) if (!usedValues.has(v)) available.push(v)
          if (available.length === 0) continue // shouldn't happen; don't crash the run over it
          const confidenceValue = randomChoice(available)
          usedValues.add(confidenceValue)
          newRows.push({
            user_id: member.user_id,
            league_id: league.id,
            period_id: periodId,
            game_id: game.id,
            picked_team_id: randomChoice([game.home_team_id, game.away_team_id]),
            confidence_value: confidenceValue,
            is_auto_assigned: true,
          })
        }
      }

      if (newRows.length > 0) {
        // ignoreDuplicates: a user could submit their own pick between our read and this write.
        const { error: insertError } = await supabase
          .from('picks')
          .upsert(newRows, { onConflict: 'user_id,league_id,game_id', ignoreDuplicates: true })
        if (insertError) throw insertError
        assigned += newRows.length
      }
    }
  }

  console.log(`Auto-assigned ${assigned} missing picks.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

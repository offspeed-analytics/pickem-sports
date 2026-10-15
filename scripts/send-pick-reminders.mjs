// Reminds league members, once a week, about picks they still haven't made for the current
// week's remaining (not-yet-locked) games. Mirrors scripts/auto-assign-picks.mjs's query shape
// (leagues -> members -> picks), but looking forward instead of back, and emailing instead of
// auto-assigning. Meant to run once per week (see .github/workflows/send-pick-reminders.yml) --
// deliberately no idempotency table: a single weekly send doesn't need one, at the cost that a
// manual re-run mid-week would re-email anyone still missing a pick. A member can belong to
// several leagues, so reminders are batched into one email per user per run rather than one
// email per league.
//
// "Current week" mirrors src/lib/periods.ts's pickCurrentPeriod: the earliest period (per sport)
// whose last game hasn't finished yet (plus a 24h grace window after it) -- not just "every
// upcoming game in the DB," since a season's schedule can be synced far in advance.
//
// No physical mailing address in the email body on purpose: this is a transactional reminder to
// an existing league member, not commercial bulk mail, so the CAN-SPAM postal-address mandate
// (aimed at ads) is not expected to apply -- sent via Brevo's transactional API, not their
// marketing-campaign product.
//
// Run via .github/workflows/send-pick-reminders.yml, or locally with:
//   node --env-file=.env scripts/send-pick-reminders.mjs [--dry-run] [--test-recipient=you@example.com]

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_API_KEY = process.env.BREVO_API_KEY
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL
const APP_BASE_URL = process.env.APP_BASE_URL

const DRY_RUN = process.argv.includes('--dry-run')
const testRecipientArg = process.argv.find((a) => a.startsWith('--test-recipient='))
const TEST_RECIPIENT = testRecipientArg
  ? testRecipientArg.slice('--test-recipient='.length)
  : process.env.TEST_RECIPIENT_EMAIL || null

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}
if (!DRY_RUN && (!BREVO_API_KEY || !BREVO_SENDER_EMAIL)) {
  throw new Error('BREVO_API_KEY and BREVO_SENDER_EMAIL must be set (unless --dry-run)')
}
if (!APP_BASE_URL) {
  throw new Error('APP_BASE_URL must be set (used to build the make-picks link in the email)')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

// Mirrors src/lib/periods.ts's pickCurrentPeriod (duplicated rather than imported: that file is
// TypeScript, and this script is plain Node ESM with no build step).
function pickCurrentPeriod(periods, lastKickoffByPeriodId, now) {
  const ascending = [...periods].sort(
    (a, b) => a.season_year - b.season_year || a.period_number - b.period_number,
  )
  for (const period of ascending) {
    const lastKickoff = lastKickoffByPeriodId.get(period.id)
    if (!lastKickoff) continue // no games synced for this period yet
    const cutoff = new Date(lastKickoff).getTime() + GRACE_PERIOD_MS
    if (now.getTime() < cutoff) return period
  }
  return ascending.at(-1) // season's fully over; nothing current to remind about
}

function periodLabel(period) {
  const kind = period.season_type === 'postseason' ? 'Postseason Round' : 'Week'
  return `${period.season_year} ${kind} ${period.period_number}`
}

function formatKickoff(kickoffTime) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(kickoffTime))
}

// One paginated pass over every auth user, reused for every league in this run -- avoids an
// admin API call per member. Emails live only in auth.users, never in `profiles`.
async function buildEmailMap() {
  const emailById = new Map()
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    for (const u of data.users) {
      if (u.email) emailById.set(u.id, u.email)
    }
    if (data.users.length < perPage) break
    page += 1
  }
  return emailById
}

async function sendBrevoEmail({ toEmail, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: "Pick'em Reminders" },
      to: [{ email: toEmail }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brevo send failed (${res.status}): ${body}`)
  }
}

function buildEmailHtml(entries) {
  return entries
    .map(({ league, period, missingGames, teamsById }) => {
      // HashRouter (src/main.tsx) means the real client route lives after a `#` -- without it
      // Vercel's static host has nothing to serve at this path and 404s (no server-side rewrite
      // exists, which is the whole point of using HashRouter here instead of vercel.json).
      const link = `${APP_BASE_URL}/#/leagues/${league.id}/weeks/${period.id}`
      const gamesHtml = missingGames
        .map((g) => {
          const home = teamsById.get(g.home_team_id)?.name ?? 'Home'
          const away = teamsById.get(g.away_team_id)?.name ?? 'Away'
          return `<li>${away} @ ${home} — locks ${formatKickoff(g.kickoff_time)}</li>`
        })
        .join('')
      return `
        <p>You still have ${missingGames.length} pick${missingGames.length > 1 ? 's' : ''}
        to make in <strong>${league.name}</strong> for ${periodLabel(period)} before kickoff:</p>
        <ul>${gamesHtml}</ul>
        <p><a href="${link}">Make your picks</a></p>
      `
    })
    .join('<hr />')
}

async function main() {
  const now = new Date()

  const { data: leagues, error: leaguesError } = await supabase
    .from('leagues')
    .select('id, name, sport')
  if (leaguesError) throw leaguesError
  if (!leagues.length) {
    console.log('No leagues exist.')
    return
  }

  const sports = [...new Set(leagues.map((l) => l.sport))]

  const { data: periods, error: periodsError } = await supabase
    .from('periods')
    .select('id, sport, season_year, season_type, period_number')
    .in('sport', sports)
  if (periodsError) throw periodsError

  const { data: allGames, error: gamesError } = await supabase
    .from('games')
    .select('id, period_id, home_team_id, away_team_id, kickoff_time, status')
    .in(
      'period_id',
      periods.map((p) => p.id),
    )
  if (gamesError) throw gamesError

  const gamesByPeriod = new Map()
  for (const g of allGames) {
    if (!gamesByPeriod.has(g.period_id)) gamesByPeriod.set(g.period_id, [])
    gamesByPeriod.get(g.period_id).push(g)
  }

  // Current period per sport, the same concept the app itself uses to decide what week a user
  // should be picking.
  const currentPeriodBySport = new Map()
  for (const sport of sports) {
    const sportPeriods = periods.filter((p) => p.sport === sport)
    const lastKickoffByPeriodId = new Map()
    for (const period of sportPeriods) {
      const kickoffs = (gamesByPeriod.get(period.id) ?? []).map((g) => g.kickoff_time)
      if (kickoffs.length) {
        lastKickoffByPeriodId.set(period.id, kickoffs.sort().at(-1))
      }
    }
    const current = pickCurrentPeriod(sportPeriods, lastKickoffByPeriodId, now)
    if (current) currentPeriodBySport.set(sport, current)
  }

  // Only the current period's games that haven't locked yet are worth reminding about.
  const remindableGamesByPeriod = new Map()
  for (const period of currentPeriodBySport.values()) {
    const remaining = (gamesByPeriod.get(period.id) ?? []).filter(
      (g) => g.status === 'scheduled' && new Date(g.kickoff_time) > now,
    )
    if (remaining.length) remindableGamesByPeriod.set(period.id, remaining)
  }
  if (!remindableGamesByPeriod.size) {
    console.log('No current-week games left to pick.')
    return
  }

  const relevantPeriodIds = [...remindableGamesByPeriod.keys()]

  const [
    { data: members, error: membersError },
    { data: existingPicks, error: picksError },
    { data: teamRows, error: teamsError },
  ] = await Promise.all([
    supabase.from('league_members').select('league_id, user_id, joined_at'),
    supabase
      .from('picks')
      .select('user_id, league_id, period_id, game_id')
      .in('period_id', relevantPeriodIds),
    supabase
      .from('teams')
      .select('id, name, abbreviation')
      .in('id', [
        ...new Set(
          [...remindableGamesByPeriod.values()]
            .flat()
            .flatMap((g) => [g.home_team_id, g.away_team_id]),
        ),
      ]),
  ])
  for (const e of [membersError, picksError, teamsError]) {
    if (e) throw e
  }

  const teamsById = new Map(teamRows.map((t) => [t.id, t]))

  const membersByLeague = new Map()
  for (const m of members) {
    if (!membersByLeague.has(m.league_id)) membersByLeague.set(m.league_id, [])
    membersByLeague.get(m.league_id).push(m)
  }

  const pickedGameIds = new Map() // `${leagueId}|${periodId}|${userId}` -> Set<gameId>
  for (const p of existingPicks) {
    const key = `${p.league_id}|${p.period_id}|${p.user_id}`
    if (!pickedGameIds.has(key)) pickedGameIds.set(key, new Set())
    pickedGameIds.get(key).add(p.game_id)
  }

  const emailById = await buildEmailMap()

  // One user can be in several leagues, so collect every pending (league, period) entry per
  // user first, then send a single email per user covering all of them.
  const entriesByUser = new Map()

  for (const league of leagues) {
    const currentPeriod = currentPeriodBySport.get(league.sport)
    if (!currentPeriod) continue
    const gamesInPeriod = remindableGamesByPeriod.get(currentPeriod.id)
    if (!gamesInPeriod) continue

    const leagueMembers = membersByLeague.get(league.id) ?? []
    for (const member of leagueMembers) {
      const picked =
        pickedGameIds.get(`${league.id}|${currentPeriod.id}|${member.user_id}`) ?? new Set()
      const joinedAt = new Date(member.joined_at)
      const missingGames = gamesInPeriod.filter(
        (g) => !picked.has(g.id) && new Date(g.kickoff_time) >= joinedAt,
      )
      if (!missingGames.length) continue

      if (!entriesByUser.has(member.user_id)) entriesByUser.set(member.user_id, [])
      entriesByUser
        .get(member.user_id)
        .push({ league, period: currentPeriod, missingGames, teamsById })
    }
  }

  let usersSent = 0
  let skippedNoEmail = 0
  let failedUsers = 0

  for (const [userId, entries] of entriesByUser) {
    const realEmail = emailById.get(userId)
    if (!realEmail) {
      skippedNoEmail += 1
      console.warn(`No email on file for user ${userId}, skipping.`)
      continue
    }

    const toEmail = TEST_RECIPIENT || realEmail
    const totalMissing = entries.reduce((n, e) => n + e.missingGames.length, 0)
    const subjectBase = `Pick reminder: ${totalMissing} pick${totalMissing > 1 ? 's' : ''} due this week`
    const subject = TEST_RECIPIENT ? `[TEST] ${subjectBase} (for ${realEmail})` : subjectBase
    const html = buildEmailHtml(entries)

    if (DRY_RUN) {
      const summary = entries
        .map((e) => `${e.league.name}/${periodLabel(e.period)}:${e.missingGames.length}`)
        .join(', ')
      console.log(`[dry-run] would email ${realEmail} — ${summary}`)
      usersSent += 1
      continue
    }

    try {
      await sendBrevoEmail({ toEmail, subject, html })
      usersSent += 1
    } catch (err) {
      // Log and move on -- one bad email (bounce, Brevo hiccup) shouldn't abort the run.
      failedUsers += 1
      console.error(`Failed to remind user ${userId}:`, err)
    }
  }

  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}Emailed ${usersSent} user(s), ${skippedNoEmail} skipped (no email), ${failedUsers} failed.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

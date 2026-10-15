// Reminds league members about missing picks on games that lock within REMINDER_WINDOW_HOURS.
// Mirrors scripts/auto-assign-picks.mjs's query shape (leagues -> members -> picks), inverted:
// upcoming scheduled games instead of just-locked ones, ending in "send an email" instead of
// "insert an auto-pick". Idempotency is enforced by pick_reminder_log's unique constraint
// (migration 0011) -- safe to run hourly. A member can belong to several leagues, so reminders
// are batched into one email per user per run (one pick_reminder_log row per league/period
// covered, but a single send) rather than one email per league.
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
const REMINDER_WINDOW_HOURS = Number(process.env.REMINDER_WINDOW_HOURS ?? 24)

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

// One paginated pass over every auth user, reused for every league/period in this run --
// avoids an admin API call per member. Emails live only in auth.users, never in `profiles`.
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
  const sections = entries
    .map(({ league, period, missingGames, teamsById }) => {
      const link = `${APP_BASE_URL}/leagues/${league.id}/weeks/${period.id}`
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
  return sections
}

async function main() {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3600 * 1000)

  const { data: upcomingGames, error: gamesError } = await supabase
    .from('games')
    .select('id, period_id, home_team_id, away_team_id, kickoff_time')
    .eq('status', 'scheduled')
    .gt('kickoff_time', now.toISOString())
    .lte('kickoff_time', windowEnd.toISOString())
  if (gamesError) throw gamesError
  if (!upcomingGames.length) {
    console.log('No games entering the reminder window.')
    return
  }

  const periodIds = [...new Set(upcomingGames.map((g) => g.period_id))]
  const gamesByPeriod = new Map()
  for (const g of upcomingGames) {
    if (!gamesByPeriod.has(g.period_id)) gamesByPeriod.set(g.period_id, [])
    gamesByPeriod.get(g.period_id).push(g)
  }

  const [
    { data: periods, error: periodsError },
    { data: leagues, error: leaguesError },
    { data: members, error: membersError },
    { data: existingPicks, error: picksError },
    { data: reminderLog, error: logError },
    { data: teamRows, error: teamsError },
  ] = await Promise.all([
    supabase
      .from('periods')
      .select('id, sport, season_year, season_type, period_number')
      .in('id', periodIds),
    supabase.from('leagues').select('id, name, sport'),
    supabase.from('league_members').select('league_id, user_id, joined_at'),
    supabase
      .from('picks')
      .select('user_id, league_id, period_id, game_id')
      .in('period_id', periodIds),
    supabase
      .from('pick_reminder_log')
      .select('user_id, league_id, period_id')
      .in('period_id', periodIds),
    supabase
      .from('teams')
      .select('id, name, abbreviation')
      .in('id', [...new Set(upcomingGames.flatMap((g) => [g.home_team_id, g.away_team_id]))]),
  ])
  for (const e of [periodsError, leaguesError, membersError, picksError, logError, teamsError]) {
    if (e) throw e
  }

  const periodsById = new Map(periods.map((p) => [p.id, p]))
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

  const alreadyReminded = new Set(
    reminderLog.map((r) => `${r.user_id}|${r.league_id}|${r.period_id}`),
  )

  const emailById = await buildEmailMap()

  // One user can be in several leagues, so collect every pending (league, period) entry per
  // user first, then send a single email per user covering all of them.
  const entriesByUser = new Map()

  for (const league of leagues) {
    const leagueMembers = membersByLeague.get(league.id) ?? []
    if (!leagueMembers.length) continue

    for (const periodId of periodIds) {
      const period = periodsById.get(periodId)
      if (!period || period.sport !== league.sport) continue
      const gamesInPeriod = gamesByPeriod.get(periodId) ?? []
      if (!gamesInPeriod.length) continue

      for (const member of leagueMembers) {
        const reminderKey = `${member.user_id}|${league.id}|${periodId}`
        if (alreadyReminded.has(reminderKey)) continue

        const picked = pickedGameIds.get(`${league.id}|${periodId}|${member.user_id}`) ?? new Set()
        const joinedAt = new Date(member.joined_at)
        const missingGames = gamesInPeriod.filter(
          (g) => !picked.has(g.id) && new Date(g.kickoff_time) >= joinedAt,
        )
        if (!missingGames.length) continue

        if (!entriesByUser.has(member.user_id)) entriesByUser.set(member.user_id, [])
        entriesByUser.get(member.user_id).push({ league, period, missingGames, teamsById })
      }
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
    const subjectBase = `Pick reminder: ${totalMissing} pick${totalMissing > 1 ? 's' : ''} due soon`
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

      // Redirected test sends don't count as having actually reminded the real user --
      // skip the log write so the real reminder still goes out on a later run.
      if (!TEST_RECIPIENT) {
        const rows = entries.map((e) => ({
          user_id: userId,
          league_id: e.league.id,
          period_id: e.period.id,
        }))
        const { error: insertError } = await supabase.from('pick_reminder_log').insert(rows)
        if (insertError) throw insertError
      }
    } catch (err) {
      // Log and move on -- one bad email (bounce, Brevo hiccup) shouldn't abort the run, and not
      // writing the log rows means this user's reminders are retried on the next hourly run.
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

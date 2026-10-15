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

// The league plays in Pacific time regardless of where this script runs -- pinning the zone
// matters because GitHub Actions runners are UTC, unlike a developer's own machine, where this
// would otherwise silently show the wrong time only once deployed.
const LEAGUE_TIMEZONE = 'America/Los_Angeles'

// Used once, in the intro sentence, so the reader knows what zone every other time in the email
// is implicitly in -- e.g. "5:25 PM PDT".
function formatTimeWithZone(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: LEAGUE_TIMEZONE,
  }).format(date)
}

// Used in the per-day listing, where the zone is already established -- terser, e.g. "10AM" or
// "5:25PM" (no ":00" for on-the-hour slots, no space before AM/PM).
function formatTimeOfDay(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
    timeZone: LEAGUE_TIMEZONE,
  }).formatToParts(date)
  const hour = parts.find((p) => p.type === 'hour').value
  const minute = parts.find((p) => p.type === 'minute').value
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod').value.toUpperCase()
  return minute === '00' ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: LEAGUE_TIMEZONE }).format(
    date,
  )
}

// e.g. "Thursday, October 15"
function formatDayHeader(date) {
  const weekday = formatWeekday(date)
  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: LEAGUE_TIMEZONE,
  }).format(date)
  return `${weekday}, ${monthDay}`
}

// Sortable calendar-day key in league-local time, e.g. "2026-10-18" -- grouping must bucket by
// the LOCAL date, since a late-night kickoff can fall on a different UTC date.
function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_TIMEZONE }).format(date)
}

// "today (Thursday)" / "tomorrow (Thursday)" / "Thursday" -- relative when close, otherwise just
// the weekday name, mirroring how someone would actually describe it to a friend.
function relativeDayLabel(now, date) {
  const dayMs = 24 * 60 * 60 * 1000
  const todayKey = new Date(dayKey(now)).getTime()
  const targetKey = new Date(dayKey(date)).getTime()
  const diffDays = Math.round((targetKey - todayKey) / dayMs)
  const weekday = formatWeekday(date)
  if (diffDays === 0) return `today (${weekday})`
  if (diffDays === 1) return `tomorrow (${weekday})`
  return weekday
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

// Leagues in the same period share the same underlying games (the games table isn't
// league-specific), so a user in several leagues for the same week would otherwise see the
// identical game list repeated once per league. Group by period and list the games once, then
// a short per-league line (with its own link and its own missing count, since how many of those
// shared games a member has actually picked can differ league to league).
function groupEntriesByPeriod(entries) {
  const byPeriod = new Map()
  for (const entry of entries) {
    if (!byPeriod.has(entry.period.id)) {
      byPeriod.set(entry.period.id, { period: entry.period, leagueEntries: [] })
    }
    byPeriod.get(entry.period.id).leagueEntries.push(entry)
  }
  return [...byPeriod.values()]
}

// Groups chronologically-sorted games by league-local calendar day, then within each day by
// exact kickoff timestamp -- several games almost always share a slot (NFL Sunday 10am games),
// and a count per slot is the most compact accurate way to describe the schedule.
function groupGamesByDayAndSlot(sortedGames) {
  const days = []
  for (const game of sortedGames) {
    const key = dayKey(new Date(game.kickoff_time))
    let day = days.at(-1)
    if (!day || day.key !== key) {
      day = { key, date: new Date(game.kickoff_time), slots: [] }
      days.push(day)
    }
    const slot = day.slots.at(-1)
    if (slot && slot.kickoffTime === game.kickoff_time) {
      slot.count += 1
    } else {
      day.slots.push({ kickoffTime: game.kickoff_time, count: 1 })
    }
  }
  return days
}

function buildEmailHtml({ now, username, entries }) {
  const greeting = `<p>Hey ${username ?? 'there'},</p>`

  const sections = groupEntriesByPeriod(entries).map(({ period, leagueEntries }) => {
    const gameIds = new Map()
    for (const { missingGames } of leagueEntries) {
      for (const g of missingGames) gameIds.set(g.id, g)
    }
    const sortedGames = [...gameIds.values()].sort(
      (a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time),
    )

    const firstGame = sortedGames[0]
    const intro = `<p>You still have ${sortedGames.length} pick${sortedGames.length > 1 ? 's' : ''} to make for ${periodLabel(period)}, and the first game locks ${relativeDayLabel(now, new Date(firstGame.kickoff_time))} at ${formatTimeWithZone(new Date(firstGame.kickoff_time))}.</p>`

    const daysHtml = groupGamesByDayAndSlot(sortedGames)
      .map((day) => {
        const itemsHtml = day.slots
          .map(
            (slot) =>
              `<li>${formatTimeOfDay(new Date(slot.kickoffTime))} - ${slot.count} game${slot.count > 1 ? 's' : ''}</li>`,
          )
          .join('')
        return `<p><strong>${formatDayHeader(day.date)}:</strong></p><ul>${itemsHtml}</ul>`
      })
      .join('')

    const ctaHtml =
      leagueEntries.length === 1
        ? `<p><a href="${APP_BASE_URL}/#/leagues/${leagueEntries[0].league.id}/weeks/${period.id}">Make your picks →</a></p>`
        : `<p>Make your picks:</p><ul>${leagueEntries
            .map(({ league, missingGames }) => {
              // HashRouter (src/main.tsx) means the real client route lives after a `#` --
              // without it Vercel's static host has nothing to serve at this path and 404s (no
              // server-side rewrite exists, the whole point of HashRouter over vercel.json).
              const link = `${APP_BASE_URL}/#/leagues/${league.id}/weeks/${period.id}`
              const count = missingGames.length
              return `<li><a href="${link}">${league.name}</a> — ${count} pick${count > 1 ? 's' : ''} missing</li>`
            })
            .join('')}</ul>`

    return `${intro}${daysHtml}<p>Once a game locks, that pick's gone — don't leave points on the table.</p>${ctaHtml}`
  })

  return `${greeting}${sections.join('<hr />')}<p>Good luck this week,</p>`
}

function countDistinctMissingGames(entries) {
  return groupEntriesByPeriod(entries).reduce((total, { leagueEntries }) => {
    const gameIds = new Set(leagueEntries.flatMap((e) => e.missingGames.map((g) => g.id)))
    return total + gameIds.size
  }, 0)
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
    .select('id, period_id, kickoff_time, status')
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

  const [{ data: members, error: membersError }, { data: existingPicks, error: picksError }] =
    await Promise.all([
      supabase.from('league_members').select('league_id, user_id, joined_at'),
      supabase
        .from('picks')
        .select('user_id, league_id, period_id, game_id')
        .in('period_id', relevantPeriodIds),
    ])
  for (const e of [membersError, picksError]) {
    if (e) throw e
  }

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
      entriesByUser.get(member.user_id).push({ league, period: currentPeriod, missingGames })
    }
  }

  const userIds = [...entriesByUser.keys()]
  const { data: profileRows, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds.length ? userIds : [null])
  if (profilesError) throw profilesError
  const usernameById = new Map(profileRows.map((p) => [p.id, p.username]))

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
    const distinctMissing = countDistinctMissingGames(entries)
    const subjectBase = `Pick reminder: ${distinctMissing} game${distinctMissing > 1 ? 's' : ''} to pick this week`
    const subject = TEST_RECIPIENT ? `[TEST] ${subjectBase} (for ${realEmail})` : subjectBase
    const html = buildEmailHtml({ now, username: usernameById.get(userId), entries })

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

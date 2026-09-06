import type { Period } from '../types/domain'

export function sortPeriodsDesc(periods: Period[]): Period[] {
  return [...periods].sort((a, b) => b.seasonYear - a.seasonYear || b.periodNumber - a.periodNumber)
}

export function formatPeriodLabel(period: Period): string {
  const label = period.seasonType === 'postseason' ? 'Postseason' : 'Week'
  return `${period.seasonYear} ${label} ${period.periodNumber}`
}

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

/**
 * The period a user should currently be picking: the earliest one whose last game hasn't
 * finished (plus a 24h grace window after it), not simply "whatever's in the DB with the
 * highest week number" — a full season's schedule can be synced far in advance.
 */
export function pickCurrentPeriod(
  periods: Period[],
  lastKickoffByPeriodId: Map<string, string>,
  now: Date = new Date(),
): Period | undefined {
  const ascending = [...periods].sort(
    (a, b) => a.seasonYear - b.seasonYear || a.periodNumber - b.periodNumber,
  )
  for (const period of ascending) {
    const lastKickoff = lastKickoffByPeriodId.get(period.id)
    if (!lastKickoff) continue // no games synced for this period yet
    const cutoff = new Date(lastKickoff).getTime() + GRACE_PERIOD_MS
    if (now.getTime() < cutoff) return period
  }
  return ascending.at(-1) // season's fully over; show the last period rather than nothing
}

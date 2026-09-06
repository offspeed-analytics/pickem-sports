import type { Period } from '../types/domain'

export function sortPeriodsDesc(periods: Period[]): Period[] {
  return [...periods].sort((a, b) => b.seasonYear - a.seasonYear || b.periodNumber - a.periodNumber)
}

export function formatPeriodLabel(period: Period): string {
  const label = period.seasonType === 'postseason' ? 'Postseason' : 'Week'
  return `${period.seasonYear} ${label} ${period.periodNumber}`
}

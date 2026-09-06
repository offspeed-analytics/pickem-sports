import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { StandingsTable } from '../components/standings/StandingsTable'
import { dataClient } from '../data'
import { usePeriods } from '../hooks/usePeriods'
import { useProfilesByIds } from '../hooks/useProfilesByIds'
import { sortPeriodsDesc } from '../lib/periods'

export function StandingsPage() {
  const { leagueId } = useParams<{ leagueId: string }>()

  // A league persists across seasons, so standings default to whichever season is most current.
  const periodsQuery = usePeriods('NFL')
  const currentSeasonYear = periodsQuery.data ? sortPeriodsDesc(periodsQuery.data)[0]?.seasonYear : undefined

  const standingsQuery = useQuery({
    queryKey: ['standings', leagueId, currentSeasonYear],
    queryFn: () => dataClient.getStandings(leagueId!, currentSeasonYear!),
    enabled: !!leagueId && currentSeasonYear !== undefined,
  })
  const mnfStandingsQuery = useQuery({
    queryKey: ['mnf-standings', leagueId, currentSeasonYear],
    queryFn: () => dataClient.getMnfStandings(leagueId!, currentSeasonYear!),
    enabled: !!leagueId && currentSeasonYear !== undefined,
  })

  const profiles = useProfilesByIds(standingsQuery.data?.map((s) => s.userId) ?? []).data ?? new Map()

  if (standingsQuery.isLoading || mnfStandingsQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }

  const mnfPointsByUser = new Map((mnfStandingsQuery.data ?? []).map((s) => [s.userId, s.totalPoints]))
  const rankedRows = [...(standingsQuery.data ?? [])]
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
      return (mnfPointsByUser.get(b.userId) ?? 0) - (mnfPointsByUser.get(a.userId) ?? 0)
    })
    .map((s) => ({ userId: s.userId, points: s.totalPoints }))

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Standings</h1>
        {currentSeasonYear && <span className="text-sm text-slate-500">{currentSeasonYear} season</span>}
      </div>
      <StandingsTable title="Season standings" rows={rankedRows} profiles={profiles} />
      <p className="text-xs text-slate-400">
        Ties are broken by cumulative points earned on Monday Night Football picks.
      </p>
    </div>
  )
}

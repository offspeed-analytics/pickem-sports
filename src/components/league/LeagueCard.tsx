import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dataClient } from '../../data'
import { usePeriods } from '../../hooks/usePeriods'
import { sortPeriodsDesc } from '../../lib/periods'
import type { League } from '../../types/domain'

export function LeagueCard({ league }: { league: League }) {
  const memberCountQuery = useQuery({
    queryKey: ['league-member-ids', league.id],
    queryFn: () => dataClient.getLeagueMemberIds(league.id),
  })
  const periodsQuery = usePeriods(league.sport)
  const currentPeriod = periodsQuery.data ? sortPeriodsDesc(periodsQuery.data)[0] : undefined

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{league.name}</h3>
        <span className="text-sm text-slate-500">
          {memberCountQuery.data ? `${memberCountQuery.data.length} members` : ' '}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Invite code: <span className="font-mono font-medium text-slate-700">{league.inviteCode}</span>
      </p>
      <div className="mt-3 flex gap-3 text-sm font-medium">
        {currentPeriod && (
          <Link to={`/leagues/${league.id}/weeks/${currentPeriod.id}`} className="text-brand-blue hover:underline">
            Make picks
          </Link>
        )}
        <Link to={`/leagues/${league.id}/standings`} className="text-brand-blue hover:underline">
          Standings
        </Link>
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { LeagueCard } from '../components/league/LeagueCard'
import { dataClient } from '../data'
import { useAuth } from '../hooks/useAuth'

export function LeagueListPage() {
  const { user } = useAuth()
  const leaguesQuery = useQuery({
    queryKey: ['leagues', 'mine', user!.id],
    queryFn: () => dataClient.getMyLeagues(user!.id),
  })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Your leagues</h1>
        <div className="flex gap-2">
          <Link
            to="/leagues/join"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Join a league
          </Link>
          <Link
            to="/leagues/new"
            className="rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue"
          >
            Create a league
          </Link>
        </div>
      </div>

      {leaguesQuery.isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {leaguesQuery.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          You're not in any leagues yet. Create one or join with an invite code.
        </div>
      )}

      <div className="space-y-3">
        {leaguesQuery.data?.map((league) => (
          <LeagueCard key={league.id} league={league} />
        ))}
      </div>
    </div>
  )
}

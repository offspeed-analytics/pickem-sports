import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { LeagueTabs } from '../components/league/LeagueTabs'
import { dataClient } from '../data'
import { usePeriods } from '../hooks/usePeriods'
import { useProfilesByIds } from '../hooks/useProfilesByIds'
import { isGameLocked } from '../lib/time'
import { formatPeriodLabel, sortPeriodsDesc } from '../lib/periods'

export function LeaguePicksComparisonPage() {
  const { leagueId, weekNumber: periodId } = useParams<{ leagueId: string; weekNumber: string }>()

  const periodsQuery = usePeriods('NFL')
  const periods = periodsQuery.data ? sortPeriodsDesc(periodsQuery.data) : []
  const currentIndex = periods.findIndex((p) => p.id === periodId)
  const currentPeriod = periods[currentIndex]
  const previousPeriod = currentIndex >= 0 ? periods[currentIndex + 1] : undefined
  const nextPeriod = currentIndex > 0 ? periods[currentIndex - 1] : undefined

  const gamesQuery = useQuery({
    queryKey: ['games', periodId],
    queryFn: () => dataClient.getGamesForPeriod(periodId!),
    enabled: !!periodId,
  })

  const teamsQuery = useQuery({
    queryKey: ['data-client-teams', 'NFL'],
    queryFn: () => dataClient.getTeams('NFL'),
  })
  const teamsById = new Map((teamsQuery.data ?? []).map((t) => [t.id, t]))

  const picksQuery = useQuery({
    queryKey: ['league-picks', leagueId, periodId],
    queryFn: () => dataClient.getLeaguePicksForPeriod({ leagueId: leagueId!, periodId: periodId! }),
    enabled: !!leagueId && !!periodId,
  })

  const memberIdsQuery = useQuery({
    queryKey: ['league-member-ids', leagueId],
    queryFn: () => dataClient.getLeagueMemberIds(leagueId!),
    enabled: !!leagueId,
  })

  const profiles = useProfilesByIds(memberIdsQuery.data ?? []).data ?? new Map()

  if (gamesQuery.isLoading || picksQuery.isLoading || teamsQuery.isLoading || memberIdsQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }

  const lockedGames = (gamesQuery.data ?? [])
    .filter((g) => isGameLocked(g))
    .sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())
  const lockedGameIds = new Set(lockedGames.map((g) => g.id))

  const pickByGameAndUser = new Map(
    (picksQuery.data ?? [])
      .filter((p) => lockedGameIds.has(p.gameId))
      .map((p) => [`${p.gameId}:${p.userId}`, p]),
  )
  const members = memberIdsQuery.data ?? []
  const totalByUser = new Map(
    members.map((userId) => [
      userId,
      lockedGames.reduce(
        (sum, game) => sum + (pickByGameAndUser.get(`${game.id}:${userId}`)?.pointsEarned ?? 0),
        0,
      ),
    ]),
  )

  return (
    <div>
      <LeagueTabs leagueId={leagueId!} periodId={periodId} />

      <div className="mb-4 flex items-center justify-between">
        {previousPeriod ? (
          <Link
            to={`/leagues/${leagueId}/league-picks/${previousPeriod.id}`}
            className="text-sm font-medium text-brand-blue hover:underline"
          >
            &larr; {formatPeriodLabel(previousPeriod)}
          </Link>
        ) : (
          <span />
        )}
        <h1 className="text-xl font-semibold text-slate-900">
          {currentPeriod ? formatPeriodLabel(currentPeriod) : 'This week'}
        </h1>
        {nextPeriod ? (
          <Link
            to={`/leagues/${leagueId}/league-picks/${nextPeriod.id}`}
            className="text-sm font-medium text-brand-blue hover:underline"
          >
            {formatPeriodLabel(nextPeriod)} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </div>

      {lockedGames.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No games locked. Check again after kickoff.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="p-3 font-medium">Game</th>
                {members.map((userId) => (
                  <th key={userId} className="p-3 font-medium">
                    {profiles.get(userId)?.username ?? 'Unknown'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lockedGames.map((game) => {
                const homeTeam = teamsById.get(game.homeTeamId)
                const awayTeam = teamsById.get(game.awayTeamId)
                const kickoff = new Date(game.kickoffTime)
                return (
                  <tr key={game.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-3 font-medium text-slate-900">
                      <div>
                        {awayTeam?.abbreviation ?? '?'} @ {homeTeam?.abbreviation ?? '?'}
                      </div>
                      <div className="text-xs font-normal text-slate-400">
                        {kickoff.toLocaleString(undefined, {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      {game.status === 'final' && game.homeScore !== null && game.awayScore !== null && (
                        <div className="text-xs font-normal text-slate-500">
                          {awayTeam?.abbreviation} {game.awayScore} - {game.homeScore}{' '}
                          {homeTeam?.abbreviation} Final
                        </div>
                      )}
                    </td>
                    {members.map((userId) => {
                      const pick = pickByGameAndUser.get(`${game.id}:${userId}`)
                      const pickedTeam = pick ? teamsById.get(pick.pickedTeamId) : undefined
                      return (
                        <td key={userId} className="whitespace-nowrap p-3 text-slate-900">
                          {pickedTeam ? (
                            <span className="flex items-center gap-1.5">
                              <img
                                src={pickedTeam.logoUrl}
                                alt={pickedTeam.abbreviation}
                                title={pickedTeam.abbreviation}
                                className="h-5 w-5 object-contain"
                              />
                              <span className="text-slate-400">({pick!.confidenceValue})</span>
                              {pick!.pointsEarned !== null &&
                                (pick!.pointsEarned > 0 ? (
                                  <span className="font-bold text-green-600" aria-label="Correct">
                                    ✓
                                  </span>
                                ) : (
                                  <span className="font-bold text-red-600" aria-label="Incorrect">
                                    ✗
                                  </span>
                                ))}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td className="p-3 font-semibold text-slate-900">Total</td>
                {members.map((userId) => (
                  <td key={userId} className="p-3 font-semibold text-slate-900">
                    {totalByUser.get(userId) ?? 0} pts
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

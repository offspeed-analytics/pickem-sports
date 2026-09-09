import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { LeagueTabs } from '../components/league/LeagueTabs'
import { MatchupCard } from '../components/matchup/MatchupCard'
import { dataClient } from '../data'
import { useAuth } from '../hooks/useAuth'
import { usePeriods } from '../hooks/usePeriods'
import { useProfilesByIds } from '../hooks/useProfilesByIds'
import { getErrorMessage } from '../lib/errors'
import { formatPeriodLabel, sortPeriodsDesc } from '../lib/periods'

function lowestUnusedConfidence(used: Map<number, string>, max: number): number {
  for (let i = 1; i <= max; i++) if (!used.has(i)) return i
  return max
}

export function WeekPicksPage() {
  const { leagueId, weekNumber: periodId } = useParams<{ leagueId: string; weekNumber: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const periodsQuery = usePeriods('NFL')
  const periods = periodsQuery.data ? sortPeriodsDesc(periodsQuery.data) : []
  const currentIndex = periods.findIndex((p) => p.id === periodId)
  const currentPeriod = periods[currentIndex]
  // periods is sorted newest-first, so the earlier period is at the next index and the later one before it.
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
    queryKey: ['my-picks', leagueId, periodId, user?.id],
    queryFn: () =>
      dataClient.getMyPicksForPeriod({ leagueId: leagueId!, periodId: periodId!, userId: user!.id }),
    enabled: !!leagueId && !!periodId && !!user,
  })

  const submitPick = useMutation({
    mutationFn: dataClient.submitPick,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['my-picks', leagueId, periodId, user?.id] }),
  })

  const swapConfidence = useMutation({
    mutationFn: dataClient.swapConfidence,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['my-picks', leagueId, periodId, user?.id] }),
  })

  const pickError = submitPick.error ?? swapConfidence.error

  const leaguePicksQuery = useQuery({
    queryKey: ['league-picks', leagueId, periodId],
    queryFn: () => dataClient.getLeaguePicksForPeriod({ leagueId: leagueId!, periodId: periodId! }),
    enabled: !!leagueId && !!periodId,
  })
  const leaguePicks = (leaguePicksQuery.data ?? []).filter((p) => p.userId !== user?.id)
  const profiles = useProfilesByIds(leaguePicks.map((p) => p.userId)).data ?? new Map()

  if (gamesQuery.isLoading || picksQuery.isLoading || teamsQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }

  const games = gamesQuery.data ?? []
  const picks = picksQuery.data ?? []
  const picksByGameId = new Map(picks.map((p) => [p.gameId, p]))
  const gamesById = new Map(games.map((g) => [g.id, g]))
  // Maps a used confidence value to "picked team over opponent" so re-picking that value shows
  // what it would bump, instead of just an opaque "already selected".
  const usedConfidenceValues = new Map<number, string>()
  for (const pick of picks) {
    const game = gamesById.get(pick.gameId)
    const pickedTeam = teamsById.get(pick.pickedTeamId)
    if (!game || !pickedTeam) continue
    const opponentTeamId = pick.pickedTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
    const opponentTeam = teamsById.get(opponentTeamId)
    if (!opponentTeam) continue
    usedConfidenceValues.set(pick.confidenceValue, `${pickedTeam.abbreviation} over ${opponentTeam.abbreviation}`)
  }

  function handlePickTeam(gameId: string, teamId: string) {
    const existing = picksByGameId.get(gameId)
    const confidenceValue = existing?.confidenceValue ?? lowestUnusedConfidence(usedConfidenceValues, games.length)
    submitPick.mutate({
      userId: user!.id,
      leagueId: leagueId!,
      periodId: periodId!,
      gameId,
      pickedTeamId: teamId,
      confidenceValue,
    })
  }

  function handleSetConfidence(gameId: string, value: number) {
    swapConfidence.mutate({
      userId: user!.id,
      leagueId: leagueId!,
      periodId: periodId!,
      gameId,
      confidenceValue: value,
    })
  }

  return (
    <div>
      <LeagueTabs leagueId={leagueId!} periodId={periodId} />

      <div className="mb-4 flex items-center justify-between">
        {previousPeriod ? (
          <Link
            to={`/leagues/${leagueId}/weeks/${previousPeriod.id}`}
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
            to={`/leagues/${leagueId}/weeks/${nextPeriod.id}`}
            className="text-sm font-medium text-brand-blue hover:underline"
          >
            {formatPeriodLabel(nextPeriod)} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </div>

      <details className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">How scoring works</summary>
        <p className="mt-2">
          Pick the winner of each game, then rank your confidence in that pick — 1 is your least
          confident, and the highest number is your most confident. Get it right, you earn those
          points. Get it wrong, you earn zero.
        </p>
      </details>

      {pickError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {getErrorMessage(pickError)}
        </p>
      )}

      <div className="space-y-3">
        {[...games]
          .sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())
          .map((game) => {
            const homeTeam = teamsById.get(game.homeTeamId)
            const awayTeam = teamsById.get(game.awayTeamId)
            if (!homeTeam || !awayTeam) return null
            return (
              <MatchupCard
                key={game.id}
                game={game}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                gameCount={games.length}
                myPick={picksByGameId.get(game.id)}
                usedConfidenceValues={usedConfidenceValues}
                onPickTeam={(teamId) => handlePickTeam(game.id, teamId)}
                onSetConfidence={(value) => handleSetConfidence(game.id, value)}
              />
            )
          })}
      </div>

      {leaguePicks.length > 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">League picks (locked games)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 font-medium">Member</th>
                <th className="pb-2 font-medium">Game</th>
                <th className="pb-2 font-medium">Pick</th>
                <th className="pb-2 text-right font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {leaguePicks.map((pick) => {
                const game = games.find((g) => g.id === pick.gameId)
                const pickedTeam = teamsById.get(pick.pickedTeamId)
                if (!game || !pickedTeam) return null
                const homeTeam = teamsById.get(game.homeTeamId)
                const awayTeam = teamsById.get(game.awayTeamId)
                return (
                  <tr key={pick.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-900">
                      {profiles.get(pick.userId)?.username ?? 'Unknown'}
                    </td>
                    <td className="py-2 text-slate-500">
                      {awayTeam?.abbreviation} @ {homeTeam?.abbreviation}
                    </td>
                    <td className="py-2 text-slate-900">{pickedTeam.abbreviation}</td>
                    <td className="py-2 text-right text-slate-900">{pick.confidenceValue}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

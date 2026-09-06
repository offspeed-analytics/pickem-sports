import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { MatchupCard } from '../components/matchup/MatchupCard'
import { dataClient } from '../data'
import teamsFixture from '../data/mock/fixtures/teams.json'
import { useAuth } from '../hooks/useAuth'
import { usePeriods } from '../hooks/usePeriods'
import { useProfilesByIds } from '../hooks/useProfilesByIds'
import { formatPeriodLabel, sortPeriodsDesc } from '../lib/periods'
import type { Team } from '../types/domain'

const teamsById = new Map((teamsFixture as Team[]).map((t) => [t.id, t]))

function lowestUnusedConfidence(used: Set<number>, max: number): number {
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

  const leaguePicksQuery = useQuery({
    queryKey: ['league-picks', leagueId, periodId],
    queryFn: () => dataClient.getLeaguePicksForPeriod({ leagueId: leagueId!, periodId: periodId! }),
    enabled: !!leagueId && !!periodId,
  })
  const leaguePicks = (leaguePicksQuery.data ?? []).filter((p) => p.userId !== user?.id)
  const profiles = useProfilesByIds(leaguePicks.map((p) => p.userId)).data ?? new Map()

  if (gamesQuery.isLoading || picksQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }

  const games = gamesQuery.data ?? []
  const picks = picksQuery.data ?? []
  const picksByGameId = new Map(picks.map((p) => [p.gameId, p]))
  const usedConfidenceValues = new Set(picks.map((p) => p.confidenceValue))

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
    const existing = picksByGameId.get(gameId)
    if (!existing) return
    submitPick.mutate({
      userId: user!.id,
      leagueId: leagueId!,
      periodId: periodId!,
      gameId,
      pickedTeamId: existing.pickedTeamId,
      confidenceValue: value,
    })
  }

  return (
    <div>
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

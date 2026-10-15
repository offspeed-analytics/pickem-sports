import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ConfidenceBreakdownChart } from '../components/reports/ConfidenceBreakdownChart'
import { TeamLeaderboardPanel } from '../components/reports/TeamLeaderboardPanel'
import { WeeklyTrendChart } from '../components/reports/WeeklyTrendChart'
import { dataClient } from '../data'
import { useAuth } from '../hooks/useAuth'
import { usePeriods } from '../hooks/usePeriods'
import { breakdownByConfidence, buildTeamLeaderboards, buildWeeklyTrend, summarizeAccuracy } from '../lib/reports'
import type { LeaderboardMode } from '../lib/reports'

const selectClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none'

// A stable reference for "no data yet" so the useMemo calls below that depend on `periods`/
// `allPicks` don't see a new array identity (and recompute) on every render while loading --
// `queryResult.data ?? []` would otherwise allocate a fresh empty array each time.
const EMPTY: never[] = []

function modeButtonClass(active: boolean) {
  return `rounded px-3 py-1 text-sm font-medium ${active ? 'bg-brand-navy text-white' : 'text-slate-600 hover:bg-slate-100'}`
}

export function ReportsPage() {
  const { user } = useAuth()

  const leaguesQuery = useQuery({
    queryKey: ['leagues', 'mine', user!.id],
    queryFn: () => dataClient.getMyLeagues(user!.id),
  })
  const leagues = leaguesQuery.data ?? []

  const periodsQuery = usePeriods('NFL')
  const periods = periodsQuery.data ?? EMPTY

  const teamsQuery = useQuery({ queryKey: ['data-client-teams', 'NFL'], queryFn: () => dataClient.getTeams('NFL') })
  const teamsById = new Map((teamsQuery.data ?? []).map((t) => [t.id, t]))

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>('all')
  const [selectedSeasonYear, setSelectedSeasonYear] = useState<number | undefined>(undefined)
  const [mode, setMode] = useState<LeaderboardMode>('weighted')

  // Cheap, narrow lookup (backed by a DB view -- see 0012_add_user_pick_seasons_view.sql in
  // supabase mode) so the season filter doesn't require fetching the user's entire pick history
  // just to find out which seasons it spans.
  const seasonsQuery = useQuery({
    queryKey: ['picked-seasons', user!.id, selectedLeagueId],
    queryFn: () =>
      dataClient.getPickedSeasons({
        userId: user!.id,
        leagueId: selectedLeagueId === 'all' ? undefined : selectedLeagueId,
      }),
  })
  const seasonYearsWithPicks = useMemo(
    () => [...new Set(seasonsQuery.data ?? EMPTY)].sort((a, b) => b - a),
    [seasonsQuery.data],
  )

  // Falls back to the default whenever the explicit choice isn't (or is no longer) valid --
  // e.g. the user picked a season, then switched leagues to one without picks in that season.
  const seasonYear =
    selectedSeasonYear !== undefined && seasonYearsWithPicks.includes(selectedSeasonYear)
      ? selectedSeasonYear
      : seasonYearsWithPicks[0]

  const periodsInSeason = useMemo(
    () => periods.filter((p) => p.seasonYear === seasonYear).sort((a, b) => a.periodNumber - b.periodNumber),
    [periods, seasonYear],
  )
  const periodIdsInSeason = useMemo(() => periodsInSeason.map((p) => p.id), [periodsInSeason])

  // Scoped to just the selected season's periods, not the user's entire pick history -- season
  // discovery is handled separately above by seasonsQuery.
  const picksQuery = useQuery({
    queryKey: ['pick-history', user!.id, selectedLeagueId, seasonYear],
    queryFn: () =>
      dataClient.getPicksForPeriods({
        userId: user!.id,
        leagueId: selectedLeagueId === 'all' ? undefined : selectedLeagueId,
        periodIds: periodIdsInSeason,
      }),
    enabled: periodIdsInSeason.length > 0,
  })
  const picks = picksQuery.data ?? EMPTY

  // None of these four depend on `mode` -- the Weighted/Raw toggle only changes which
  // already-computed field gets displayed, so it must never trigger this recompute.
  const summary = useMemo(() => summarizeAccuracy(picks), [picks])
  const confidenceRows = useMemo(() => breakdownByConfidence(picks), [picks])
  const leaderboards = useMemo(() => buildTeamLeaderboards(picks), [picks])
  const trend = useMemo(() => buildWeeklyTrend(picks, periodsInSeason), [picks, periodsInSeason])

  if (
    leaguesQuery.isLoading ||
    periodsQuery.isLoading ||
    teamsQuery.isLoading ||
    seasonsQuery.isLoading ||
    picksQuery.isLoading
  ) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }

  const decidedPicks = summary.correctPicks + summary.incorrectPicks
  const displayPct = mode === 'weighted' ? summary.weightedAccuracyPct : summary.accuracyPct

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <div className="flex flex-wrap items-center gap-2">
          {leagues.length > 1 && (
            <select value={selectedLeagueId} onChange={(e) => setSelectedLeagueId(e.target.value)} className={selectClass}>
              <option value="all">All leagues</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          )}
          {seasonYearsWithPicks.length > 1 && (
            <select
              value={seasonYear ?? ''}
              onChange={(e) => setSelectedSeasonYear(Number(e.target.value))}
              className={selectClass}
            >
              {seasonYearsWithPicks.map((year) => (
                <option key={year} value={year}>
                  {year} season
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
            <button type="button" onClick={() => setMode('weighted')} className={modeButtonClass(mode === 'weighted')}>
              Weighted
            </button>
            <button type="button" onClick={() => setMode('raw')} className={modeButtonClass(mode === 'raw')}>
              Raw accuracy
            </button>
          </div>
        </div>
      </div>

      {picks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No picks yet for this season.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-900">{displayPct !== null ? `${displayPct.toFixed(0)}%` : '—'}</span>
              <span className="text-sm text-slate-500">{mode === 'weighted' ? 'weighted accuracy' : 'accuracy'}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {mode === 'weighted'
                ? `${summary.totalPoints}/${summary.confidenceAtStake} confidence points earned`
                : `${summary.correctPicks}/${decidedPicks} decided picks correct`}
            </p>
          </div>

          <WeeklyTrendChart points={trend} mode={mode} />
          <ConfidenceBreakdownChart rows={confidenceRows} />

          <div className="grid gap-4 md:grid-cols-2">
            <TeamLeaderboardPanel title="Your Biggest Winners" rows={leaderboards.right} teamsById={teamsById} tone="good" />
            <TeamLeaderboardPanel title="Your Biggest Losers" rows={leaderboards.wrong} teamsById={teamsById} tone="critical" />
          </div>
        </>
      )}
    </div>
  )
}

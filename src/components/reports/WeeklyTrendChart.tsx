import type { LeaderboardMode, WeeklyTrendPoint } from '../../lib/reports'
import { LineChart, type LineChartPoint } from '../charts/LineChart'

interface WeeklyTrendChartProps {
  points: WeeklyTrendPoint[]
  mode: LeaderboardMode
}

export function WeeklyTrendChart({ points, mode }: WeeklyTrendChartProps) {
  const chartPoints: LineChartPoint[] = points.map((p) => {
    const x = p.seasonType === 'postseason' ? `Playoffs Wk ${p.periodNumber}` : `Wk ${p.periodNumber}`
    const pct = mode === 'weighted' ? p.weightedAccuracyPct : p.accuracyPct
    const pendingPicks = p.totalPicks - p.decidedPicks

    let tooltip: string[]
    if (pct !== null) {
      tooltip =
        mode === 'weighted'
          ? [`${pct.toFixed(0)}% weighted accuracy`, `${p.totalPoints}/${p.confidenceAtStake} confidence points earned`]
          : [`${pct.toFixed(0)}% accuracy`, `${p.correctPicks}/${p.decidedPicks} correct`]
    } else if (pendingPicks > 0) {
      // Picks exist for this week, they're just not graded yet -- distinct from a week with no
      // picks at all, which LineChart's default "No picks yet" tooltip text covers correctly.
      tooltip = [`${pendingPicks} pick${pendingPicks === 1 ? '' : 's'} pending`]
    } else {
      tooltip = []
    }

    return { x, y: pct, valueLabel: pct === null ? undefined : `${pct.toFixed(0)}%`, tooltip }
  })

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">
        {mode === 'weighted' ? 'Weighted accuracy by week' : 'Accuracy by week'}
      </h2>
      {chartPoints.length === 0 ? <p className="text-sm text-slate-500">No weeks yet.</p> : <LineChart points={chartPoints} />}
    </div>
  )
}

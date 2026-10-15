import type { LeaderboardMode, WeeklyTrendPoint } from '../../lib/reports'
import { LineChart, type LineChartPoint } from '../charts/LineChart'

interface WeeklyTrendChartProps {
  points: WeeklyTrendPoint[]
  mode: LeaderboardMode
}

export function WeeklyTrendChart({ points, mode }: WeeklyTrendChartProps) {
  // A week with nothing graded yet (no picks, or picks that are all still pending) has nothing
  // to plot -- skip it entirely rather than showing a gap or an empty-looking week on the axis.
  const chartPoints: LineChartPoint[] = points
    .filter((p) => p.decidedPicks > 0)
    .flatMap((p) => {
      const pct = mode === 'weighted' ? p.weightedAccuracyPct : p.accuracyPct
      if (pct === null) return [] // decidedPicks > 0 always implies a non-null pct; defensive only
      const x = p.seasonType === 'postseason' ? `Playoffs Wk ${p.periodNumber}` : `Wk ${p.periodNumber}`
      const tooltip =
        mode === 'weighted'
          ? [`${pct.toFixed(0)}% weighted accuracy`, `${p.totalPoints}/${p.confidenceAtStake} confidence points earned`]
          : [`${pct.toFixed(0)}% accuracy`, `${p.correctPicks}/${p.decidedPicks} correct`]
      return [{ x, y: pct, valueLabel: `${pct.toFixed(0)}%`, tooltip }]
    })

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">
        {mode === 'weighted' ? 'Weighted accuracy by week' : 'Accuracy by week'}
      </h2>
      {chartPoints.length === 0 ? (
        <p className="text-sm text-slate-500">No graded picks yet.</p>
      ) : (
        <LineChart points={chartPoints} />
      )}
    </div>
  )
}

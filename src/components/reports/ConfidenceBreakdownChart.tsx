import { BarChart, type BarChartDatum } from '../charts/BarChart'
import type { ConfidenceLevelRow } from '../../lib/reports'

interface ConfidenceBreakdownChartProps {
  rows: ConfidenceLevelRow[]
}

export function ConfidenceBreakdownChart({ rows }: ConfidenceBreakdownChartProps) {
  const data: BarChartDatum[] = rows.map((row) => {
    const decided = row.correctPicks + row.incorrectPicks
    const tooltip =
      row.accuracyPct === null
        ? ['No graded picks yet']
        : [`${row.correctPicks}/${decided} correct (${row.accuracyPct.toFixed(0)}%)`]
    const valueLabel = row.accuracyPct === null ? '–' : `${row.accuracyPct.toFixed(0)}%`
    return { label: String(row.confidenceValue), value: row.accuracyPct ?? 0, valueLabel, tooltip }
  })

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">Accuracy by confidence level</h2>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">No picks yet.</p>
      ) : (
        <BarChart data={data} />
      )}
    </div>
  )
}

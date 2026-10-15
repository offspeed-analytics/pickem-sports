import type { Team } from '../../types/domain'
import type { TeamLeaderboardRow } from '../../lib/reports'
import { HorizontalBarChart, type HorizontalBarChartRow } from '../charts/HorizontalBarChart'

interface TeamLeaderboardPanelProps {
  title: string
  rows: TeamLeaderboardRow[]
  teamsById: Map<string, Team>
  tone: 'good' | 'critical'
}

export function TeamLeaderboardPanel({ title, rows, teamsById, tone }: TeamLeaderboardPanelProps) {
  const chartRows: HorizontalBarChartRow[] = rows.map((row) => {
    const team = teamsById.get(row.teamId)
    const valueLabel = `${row.score} pts ${tone === 'good' ? 'earned' : 'lost'}`
    // row.avgConfidenceForScore is already scoped to exactly the outcome this panel is about
    // (buildTeamLeaderboards computed it that way); row.avgConfidence is the broader figure --
    // average confidence across every decided pick of this team, win or lose -- a different,
    // complementary number, not just a restatement.
    const detailLines = [
      `${row.correctPicks}/${row.decidedPicks} correct${row.accuracyPct !== null ? ` (${row.accuracyPct.toFixed(0)}%)` : ''}`,
      `Avg confidence when ${tone === 'good' ? 'right' : 'wrong'}: ${row.avgConfidenceForScore.toFixed(1)}`,
      `Overall avg confidence: ${row.avgConfidence.toFixed(1)}`,
    ]
    return {
      id: row.teamId,
      label: team?.abbreviation ?? '??',
      logoUrl: team?.logoUrl,
      value: row.score,
      valueLabel,
      detailLines,
    }
  })

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
      <HorizontalBarChart rows={chartRows} tone={tone} />
    </div>
  )
}

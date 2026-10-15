import type { Period, Pick } from '../types/domain'

export interface AccuracySummary {
  totalPicks: number
  correctPicks: number
  incorrectPicks: number
  pendingPicks: number
  accuracyPct: number | null
  totalPoints: number
  confidenceAtStake: number
  weightedAccuracyPct: number | null
}

/** Pending picks never enter the numerator or denominator of accuracyPct -- only
 * correct/incorrect (decided) picks do. Null means no decided picks yet, not 0%. */
function accuracyPct(correctPicks: number, incorrectPicks: number): number | null {
  const decided = correctPicks + incorrectPicks
  return decided === 0 ? null : (correctPicks / decided) * 100
}

/** A plain correct/total ratio treats every pick the same, so a confidence-16 pick counts no
 * more than a confidence-1 pick. Weighting by confidence instead -- points actually earned
 * divided by points that were on the line (confidenceAtStake, decided picks only) -- keeps the
 * result a true 0-100% "accuracy" while letting bigger picks move it proportionally more. */
function weightedAccuracyPct(totalPoints: number, confidenceAtStake: number): number | null {
  return confidenceAtStake === 0 ? null : (totalPoints / confidenceAtStake) * 100
}

export function summarizeAccuracy(picks: Pick[]): AccuracySummary {
  const correctPicks = picks.filter((p) => p.outcome === 'correct').length
  const incorrectPicks = picks.filter((p) => p.outcome === 'incorrect').length
  const pendingPicks = picks.filter((p) => p.outcome === 'pending').length
  const totalPoints = picks.reduce((sum, p) => sum + (p.pointsEarned ?? 0), 0)
  const confidenceAtStake = picks
    .filter((p) => p.outcome !== 'pending')
    .reduce((sum, p) => sum + p.confidenceValue, 0)
  return {
    totalPicks: picks.length,
    correctPicks,
    incorrectPicks,
    pendingPicks,
    accuracyPct: accuracyPct(correctPicks, incorrectPicks),
    totalPoints,
    confidenceAtStake,
    weightedAccuracyPct: weightedAccuracyPct(totalPoints, confidenceAtStake),
  }
}

export interface ConfidenceLevelRow {
  confidenceValue: number
  totalPicks: number
  correctPicks: number
  incorrectPicks: number
  pendingPicks: number
  accuracyPct: number | null
}

/** One row per distinct confidenceValue present, sorted ascending (lowest confidence first). */
export function breakdownByConfidence(picks: Pick[]): ConfidenceLevelRow[] {
  const byValue = new Map<number, Pick[]>()
  for (const pick of picks) {
    const bucket = byValue.get(pick.confidenceValue)
    if (bucket) bucket.push(pick)
    else byValue.set(pick.confidenceValue, [pick])
  }
  return [...byValue.entries()]
    .map(([confidenceValue, rows]) => {
      const summary = summarizeAccuracy(rows)
      return {
        confidenceValue,
        totalPicks: summary.totalPicks,
        correctPicks: summary.correctPicks,
        incorrectPicks: summary.incorrectPicks,
        pendingPicks: summary.pendingPicks,
        accuracyPct: summary.accuracyPct,
      }
    })
    .sort((a, b) => a.confidenceValue - b.confidenceValue)
}

export type LeaderboardMode = 'weighted' | 'raw'

export interface TeamLeaderboardRow {
  teamId: string
  decidedPicks: number
  correctPicks: number
  incorrectPicks: number
  accuracyPct: number | null
  score: number
  /** Average confidenceValue across exactly the picks `score` was summed from (correct picks
   * for the "right" list, incorrect for the "wrong" list) -- precomputed here so callers never
   * have to re-derive it from `score` and guess which pick count to divide by. */
  avgConfidenceForScore: number
  /** Average confidenceValue across every decided pick of this team, win or lose -- distinct
   * from score (which is scoped to only the correct or only the incorrect picks). */
  avgConfidence: number
}

interface TeamTally {
  teamId: string
  correctPicks: number
  incorrectPicks: number
  correctConfidenceSum: number
  incorrectConfidenceSum: number
}

function tallyByTeam(picks: Pick[]): Map<string, TeamTally> {
  const byTeam = new Map<string, TeamTally>()
  for (const pick of picks) {
    if (pick.outcome === 'pending') continue
    let tally = byTeam.get(pick.pickedTeamId)
    if (!tally) {
      tally = {
        teamId: pick.pickedTeamId,
        correctPicks: 0,
        incorrectPicks: 0,
        correctConfidenceSum: 0,
        incorrectConfidenceSum: 0,
      }
      byTeam.set(pick.pickedTeamId, tally)
    }
    if (pick.outcome === 'correct') {
      tally.correctPicks += 1
      tally.correctConfidenceSum += pick.confidenceValue
    } else {
      tally.incorrectPicks += 1
      tally.incorrectConfidenceSum += pick.confidenceValue
    }
  }
  return byTeam
}

function toRow(tally: TeamTally, score: number, scopedPicks: number): TeamLeaderboardRow {
  const decidedPicks = tally.correctPicks + tally.incorrectPicks
  const totalConfidence = tally.correctConfidenceSum + tally.incorrectConfidenceSum
  return {
    teamId: tally.teamId,
    decidedPicks,
    correctPicks: tally.correctPicks,
    incorrectPicks: tally.incorrectPicks,
    accuracyPct: accuracyPct(tally.correctPicks, tally.incorrectPicks),
    score,
    avgConfidenceForScore: scopedPicks > 0 ? score / scopedPicks : 0,
    avgConfidence: decidedPicks > 0 ? totalConfidence / decidedPicks : 0,
  }
}

/**
 * Always points-based, regardless of the page's weighted/raw accuracy toggle -- these panels
 * show "X pts earned/lost" and a bar length must represent the same number it's labeled with, so
 * they can't switch to ranking by a percentage the bar wouldn't visually match.
 * right.score = confidence spent on correct picks of that team (= points earned, since a correct
 * pick's pointsEarned IS its confidenceValue); wrong.score = confidence spent and lost on
 * incorrect picks of that team. Both ranked desc (biggest first), top 5.
 */
export function buildTeamLeaderboards(picks: Pick[]): {
  right: TeamLeaderboardRow[]
  wrong: TeamLeaderboardRow[]
} {
  const tallies = [...tallyByTeam(picks).values()]
  const right = tallies
    .map((t) => toRow(t, t.correctConfidenceSum, t.correctPicks))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  const wrong = tallies
    .map((t) => toRow(t, t.incorrectConfidenceSum, t.incorrectPicks))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  return { right, wrong }
}

export interface WeeklyTrendPoint {
  periodId: string
  periodNumber: number
  seasonType: Period['seasonType']
  totalPicks: number
  totalPoints: number
  confidenceAtStake: number
  decidedPicks: number
  correctPicks: number
  accuracyPct: number | null
  weightedAccuracyPct: number | null
}

/** One point per period passed in, regular season first (chronological), then postseason --
 * periodNumber alone isn't enough to order these since postseason restarts numbering at 1 and
 * would otherwise collide/interleave with the regular season's own week 1. Pass only the periods
 * belonging to the selected season -- this doesn't filter by season itself. */
export function buildWeeklyTrend(picks: Pick[], periods: Period[]): WeeklyTrendPoint[] {
  const picksByPeriod = new Map<string, Pick[]>()
  for (const pick of picks) {
    const bucket = picksByPeriod.get(pick.periodId)
    if (bucket) bucket.push(pick)
    else picksByPeriod.set(pick.periodId, [pick])
  }

  return [...periods]
    .sort((a, b) => {
      if (a.seasonType !== b.seasonType) return a.seasonType === 'regular' ? -1 : 1
      return a.periodNumber - b.periodNumber
    })
    .map((period) => {
      const periodPicks = picksByPeriod.get(period.id) ?? []
      const summary = summarizeAccuracy(periodPicks)
      return {
        periodId: period.id,
        periodNumber: period.periodNumber,
        seasonType: period.seasonType,
        totalPicks: summary.totalPicks,
        totalPoints: summary.totalPoints,
        confidenceAtStake: summary.confidenceAtStake,
        decidedPicks: summary.correctPicks + summary.incorrectPicks,
        correctPicks: summary.correctPicks,
        accuracyPct: summary.accuracyPct,
        weightedAccuracyPct: summary.weightedAccuracyPct,
      }
    })
}


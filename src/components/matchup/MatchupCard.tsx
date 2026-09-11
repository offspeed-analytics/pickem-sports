import { ConfidenceSelect } from './ConfidenceSelect'
import { isGameLocked } from '../../lib/time'
import type { Game, Pick, Team } from '../../types/domain'

interface MatchupCardProps {
  game: Game
  homeTeam: Team
  awayTeam: Team
  gameCount: number
  myPick: Pick | undefined
  usedConfidenceValues: Map<number, string>
  onPickTeam: (teamId: string) => void
  onSetConfidence: (value: number) => void
}

function TeamButton({
  team,
  record,
  selected,
  disabled,
  resultIcon,
  onClick,
}: {
  team: Team
  record: string | null
  selected: boolean
  disabled: boolean
  resultIcon?: 'correct' | 'incorrect' | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md border-2 p-3 text-center transition-colors ${
        selected
          ? 'border-brand-navy bg-brand-navy/5'
          : 'border-transparent hover:border-slate-200'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {resultIcon && (
        <span
          className={`absolute right-1.5 top-1.5 text-base font-bold ${
            resultIcon === 'correct' ? 'text-green-600' : 'text-red-600'
          }`}
          aria-label={resultIcon === 'correct' ? 'Correct' : 'Incorrect'}
        >
          {resultIcon === 'correct' ? '✓' : '✗'}
        </span>
      )}
      <img src={team.logoUrl} alt="" className="h-12 w-12 object-contain" />
      <span className="text-sm font-medium text-slate-900">{team.name}</span>
      <span className="text-xs text-slate-500">{record ?? '—'}</span>
    </button>
  )
}

export function MatchupCard({
  game,
  homeTeam,
  awayTeam,
  gameCount,
  myPick,
  usedConfidenceValues,
  onPickTeam,
  onSetConfidence,
}: MatchupCardProps) {
  const locked = isGameLocked(game)
  const kickoff = new Date(game.kickoffTime)
  const resultIcon: 'correct' | 'incorrect' | null =
    game.status === 'final' && myPick?.pointsEarned != null
      ? myPick.pointsEarned > 0
        ? 'correct'
        : 'incorrect'
      : null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <TeamButton
          team={awayTeam}
          record={game.awayRecord}
          selected={myPick?.pickedTeamId === awayTeam.id}
          disabled={locked}
          resultIcon={myPick?.pickedTeamId === awayTeam.id ? resultIcon : null}
          onClick={() => onPickTeam(awayTeam.id)}
        />

        <div className="flex w-32 shrink-0 flex-col items-center gap-1 text-center text-xs text-slate-500">
          <span className="font-medium text-slate-700">
            {kickoff.toLocaleString(undefined, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {game.oddsSpread && <span>{game.oddsSpread}</span>}
          {game.oddsOverUnder && <span>O/U {game.oddsOverUnder}</span>}
          {game.status === 'final' && game.homeScore !== null && game.awayScore !== null ? (
            <span className="mt-1 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
              Final {game.awayScore}-{game.homeScore}
            </span>
          ) : (
            locked && (
              <span className="mt-1 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                Locked
              </span>
            )
          )}
        </div>

        <TeamButton
          team={homeTeam}
          record={game.homeRecord}
          selected={myPick?.pickedTeamId === homeTeam.id}
          disabled={locked}
          resultIcon={myPick?.pickedTeamId === homeTeam.id ? resultIcon : null}
          onClick={() => onPickTeam(homeTeam.id)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-500">Confidence</span>
        <ConfidenceSelect
          gameCount={gameCount}
          value={myPick?.confidenceValue ?? null}
          usedValues={usedConfidenceValues}
          disabled={locked || !myPick}
          onChange={onSetConfidence}
        />
      </div>
    </div>
  )
}

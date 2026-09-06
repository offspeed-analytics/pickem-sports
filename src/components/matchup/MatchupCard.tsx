import { ConfidenceSelect } from './ConfidenceSelect'
import { isGameLocked } from '../../lib/time'
import type { Game, Pick, Team } from '../../types/domain'

interface MatchupCardProps {
  game: Game
  homeTeam: Team
  awayTeam: Team
  gameCount: number
  myPick: Pick | undefined
  usedConfidenceValues: Set<number>
  onPickTeam: (teamId: string) => void
  onSetConfidence: (value: number) => void
}

function TeamButton({
  team,
  selected,
  disabled,
  onClick,
}: {
  team: Team
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md border-2 p-3 text-center transition-colors ${
        selected
          ? 'border-brand-navy bg-brand-navy/5'
          : 'border-transparent hover:border-slate-200'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <img src={team.logoUrl} alt="" className="h-12 w-12 object-contain" />
      <span className="text-sm font-medium text-slate-900">{team.name}</span>
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

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <TeamButton
          team={awayTeam}
          selected={myPick?.pickedTeamId === awayTeam.id}
          disabled={locked}
          onClick={() => onPickTeam(awayTeam.id)}
        />

        <div className="flex w-32 shrink-0 flex-col items-center gap-1 text-center text-xs text-slate-500">
          <span>{game.awayRecord ?? '—'}</span>
          <span className="font-medium text-slate-700">
            {kickoff.toLocaleString(undefined, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {game.oddsSpread && <span>{game.oddsSpread}</span>}
          {game.oddsOverUnder && <span>O/U {game.oddsOverUnder}</span>}
          <span>{game.homeRecord ?? '—'}</span>
          {locked && (
            <span className="mt-1 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
              Locked
            </span>
          )}
        </div>

        <TeamButton
          team={homeTeam}
          selected={myPick?.pickedTeamId === homeTeam.id}
          disabled={locked}
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

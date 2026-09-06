import type { Game } from '../types/domain'

export function isGameLocked(game: Pick<Game, 'kickoffTime'>, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(game.kickoffTime).getTime()
}

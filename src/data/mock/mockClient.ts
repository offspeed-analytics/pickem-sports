import type { DataClient } from '../client'
import type { Game, League, Period, Pick, Standing } from '../../types/domain'
import gamesFixture from './fixtures/games.json'
import periodsFixture from './fixtures/periods.json'

const STORAGE_KEY = 'pickem_mock_v1'
const LATENCY_MS = 150

interface LeagueMembership {
  leagueId: string
  userId: string
}

interface PersistedState {
  leagues: League[]
  leagueMembers: LeagueMembership[]
  picks: Pick[]
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedState
  } catch {
    // fall through to empty state
  }
  return { leagues: [], leagueMembers: [], picks: [] }
}

function saveState(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

function generateId(): string {
  return crypto.randomUUID()
}

function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
    '',
  )
}

const games = gamesFixture as Game[]
const periods = periodsFixture as Period[]

function winningTeamId(game: Game): string | null {
  if (game.status !== 'final' || game.homeScore === null || game.awayScore === null) return null
  if (game.homeScore === game.awayScore) return null
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId
}

function pointsForPick(pick: Pick, game: Game): number | null {
  const winner = winningTeamId(game)
  if (winner === null) return game.status === 'final' ? 0 : null
  return pick.pickedTeamId === winner ? pick.confidenceValue : 0
}

export const mockClient: DataClient = {
  async getMyLeagues(userId) {
    const state = loadState()
    const leagueIds = new Set(state.leagueMembers.filter((m) => m.userId === userId).map((m) => m.leagueId))
    return delay(state.leagues.filter((l) => leagueIds.has(l.id)))
  },

  async createLeague({ name, ownerId }) {
    const state = loadState()
    const league: League = {
      id: generateId(),
      name,
      sport: 'NFL',
      gameplayMode: 'confidence_pickem',
      inviteCode: generateInviteCode(),
      ownerId,
    }
    state.leagues.push(league)
    state.leagueMembers.push({ leagueId: league.id, userId: ownerId })
    saveState(state)
    return delay(league)
  },

  async joinLeagueByCode({ code, userId }) {
    const state = loadState()
    const league = state.leagues.find((l) => l.inviteCode === code.toUpperCase())
    if (!league) throw new Error('Invalid invite code')
    const alreadyMember = state.leagueMembers.some(
      (m) => m.leagueId === league.id && m.userId === userId,
    )
    if (!alreadyMember) {
      state.leagueMembers.push({ leagueId: league.id, userId })
      saveState(state)
    }
    return delay(league)
  },

  async getLeagueMemberIds(leagueId) {
    const state = loadState()
    return delay(state.leagueMembers.filter((m) => m.leagueId === leagueId).map((m) => m.userId))
  },

  async getPeriods(sport) {
    return delay(periods.filter((p) => p.sport === sport))
  },

  async getGamesForPeriod(periodId) {
    return delay(games.filter((g) => g.periodId === periodId))
  },

  async getMyPicksForPeriod({ leagueId, periodId, userId }) {
    const state = loadState()
    return delay(
      state.picks.filter(
        (p) => p.leagueId === leagueId && p.periodId === periodId && p.userId === userId,
      ),
    )
  },

  async getLeaguePicksForPeriod({ leagueId, periodId }) {
    const state = loadState()
    const now = Date.now()
    return delay(
      state.picks
        .filter((p) => p.leagueId === leagueId && p.periodId === periodId)
        .filter((p) => {
          const game = games.find((g) => g.id === p.gameId)
          return game ? new Date(game.kickoffTime).getTime() <= now : false
        }),
    )
  },

  async submitPick({ userId, leagueId, periodId, gameId, pickedTeamId, confidenceValue }) {
    const state = loadState()
    const game = games.find((g) => g.id === gameId)
    if (!game) throw new Error('Unknown game')
    if (new Date(game.kickoffTime).getTime() <= Date.now()) {
      throw new Error('This game has already kicked off')
    }
    const conflictingValue = state.picks.find(
      (p) =>
        p.userId === userId &&
        p.leagueId === leagueId &&
        p.periodId === periodId &&
        p.confidenceValue === confidenceValue &&
        p.gameId !== gameId,
    )
    if (conflictingValue) throw new Error('That confidence value is already used this period')

    const existingIndex = state.picks.findIndex(
      (p) => p.userId === userId && p.leagueId === leagueId && p.gameId === gameId,
    )
    const pick: Pick = {
      id: existingIndex >= 0 ? state.picks[existingIndex].id : generateId(),
      userId,
      leagueId,
      periodId,
      gameId,
      pickedTeamId,
      confidenceValue,
      isAutoAssigned: false,
      pointsEarned: null,
    }
    if (existingIndex >= 0) {
      state.picks[existingIndex] = pick
    } else {
      state.picks.push(pick)
    }
    saveState(state)
    return delay(pick)
  },

  async getStandings(leagueId) {
    const state = loadState()
    return delay(computeStandings(state, leagueId, () => true))
  },

  async getMnfStandings(leagueId) {
    const state = loadState()
    return delay(
      computeStandings(state, leagueId, (game) => game.broadcastWindow === 'monday_night'),
    )
  },
}

function computeStandings(
  state: PersistedState,
  leagueId: string,
  gameFilter: (game: Game) => boolean,
): Standing[] {
  const members = state.leagueMembers.filter((m) => m.leagueId === leagueId)
  return members
    .map((member): Standing => {
      const totalPoints = state.picks
        .filter((p) => p.leagueId === leagueId && p.userId === member.userId)
        .reduce((sum, pick) => {
          const game = games.find((g) => g.id === pick.gameId)
          if (!game || !gameFilter(game)) return sum
          return sum + (pointsForPick(pick, game) ?? 0)
        }, 0)
      return { userId: member.userId, totalPoints }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}

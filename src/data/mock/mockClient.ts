import type { DataClient } from '../client'
import type { Game, League, Period, Pick, Standing, Team } from '../../types/domain'
import { generateInviteCode } from '../../lib/inviteCode'
import { pickCurrentPeriod } from '../../lib/periods'
import gamesFixture from './fixtures/games.json'
import periodsFixture from './fixtures/periods.json'
import teamsFixture from './fixtures/teams.json'

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


/**
 * The synced fixture's "current" period always has every kickoff in the future relative to
 * whenever it was captured (accurate to the real schedule at sync time), which means mock mode
 * would otherwise never have a locked game to test scoring or the league-picks comparison
 * against until the real season actually starts. Re-time that period's games relative to
 * whenever the app is actually run instead: the first half already kicked off and finished
 * (deterministic scores, so a test run is reproducible), the rest stay upcoming so picking an
 * open game is still testable too.
 */
const TESTABLE_CURRENT_PERIOD_ID = 'p-2026-reg-1'

function buildGames(): Game[] {
  const raw = gamesFixture as Game[]
  const currentPeriodGames = raw.filter((g) => g.periodId === TESTABLE_CURRENT_PERIOD_ID)
  const lockedCount = Math.ceil(currentPeriodGames.length / 2)
  return raw.map((game) => {
    if (game.periodId !== TESTABLE_CURRENT_PERIOD_ID) return game
    const position = currentPeriodGames.findIndex((g) => g.id === game.id)
    const isLocked = position < lockedCount
    const hoursFromNow = (isLocked ? position - lockedCount : position - lockedCount + 1) * 3
    const kickoffTime = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
    if (!isLocked) return { ...game, kickoffTime }
    return {
      ...game,
      kickoffTime,
      status: 'final',
      homeScore: 14 + ((position * 7) % 21),
      awayScore: 10 + ((position * 11) % 24),
    }
  })
}

/**
 * A handful of fake members auto-seeded into every league created in mock mode, with a full
 * set of picks for the current period. Without this there'd be no way to test the league-picks
 * comparison or standings locally — a fresh mock league otherwise only ever has the one real
 * (signed-in) member. See the matching special-case in useProfilesByIds for how their names
 * resolve without a real Supabase profiles row.
 */
export const MOCK_TEST_PROFILES: Record<string, { username: string; favoriteTeamLogoUrl: string | null }> = {
  'mock-test-member-1': { username: 'Ashley (test)', favoriteTeamLogoUrl: null },
  'mock-test-member-2': { username: 'Jordan (test)', favoriteTeamLogoUrl: null },
  'mock-test-member-3': { username: 'Sam (test)', favoriteTeamLogoUrl: null },
}

function seedTestMembers(state: PersistedState, leagueId: string) {
  const periodGames = games.filter((g) => g.periodId === TESTABLE_CURRENT_PERIOD_ID)
  Object.keys(MOCK_TEST_PROFILES).forEach((userId, memberIndex) => {
    state.leagueMembers.push({ leagueId, userId })
    periodGames.forEach((game, gameIndex) => {
      const pickHome = (gameIndex + memberIndex) % 2 === 0
      state.picks.push({
        id: generateId(),
        userId,
        leagueId,
        periodId: TESTABLE_CURRENT_PERIOD_ID,
        gameId: game.id,
        pickedTeamId: pickHome ? game.homeTeamId : game.awayTeamId,
        confidenceValue: ((gameIndex + memberIndex * 5) % periodGames.length) + 1,
        isAutoAssigned: false,
        pointsEarned: null,
      })
    })
  })
}

const games = buildGames()
const periods = periodsFixture as Period[]
const periodsById = new Map(periods.map((p) => [p.id, p]))
const teams = teamsFixture as Team[]

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

/**
 * The real backend scores a pick via a DB trigger the moment its game goes final, so
 * `pointsEarned` is always up to date by the time a client reads it. The mock only ever writes
 * `pointsEarned: null` at submit time, so picks are scored on the way out here instead — same
 * result, just computed on read rather than persisted on write.
 */
function withComputedPoints(pick: Pick): Pick {
  const game = games.find((g) => g.id === pick.gameId)
  if (!game) return pick
  return { ...pick, pointsEarned: pointsForPick(pick, game) }
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
    seedTestMembers(state, league.id)
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

  async getCurrentPeriod(sport) {
    const sportPeriods = periods.filter((p) => p.sport === sport)
    const lastKickoffByPeriodId = new Map<string, string>()
    for (const game of games) {
      const existing = lastKickoffByPeriodId.get(game.periodId)
      if (!existing || game.kickoffTime > existing) {
        lastKickoffByPeriodId.set(game.periodId, game.kickoffTime)
      }
    }
    return delay(pickCurrentPeriod(sportPeriods, lastKickoffByPeriodId))
  },

  async getTeams(sport) {
    return delay(teams.filter((t) => t.sport === sport))
  },

  async getGamesForPeriod(periodId) {
    return delay(games.filter((g) => g.periodId === periodId))
  },

  async getMyPicksForPeriod({ leagueId, periodId, userId }) {
    const state = loadState()
    return delay(
      state.picks
        .filter((p) => p.leagueId === leagueId && p.periodId === periodId && p.userId === userId)
        .map(withComputedPoints),
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
        })
        .map(withComputedPoints),
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

  async swapConfidence({ userId, leagueId, periodId, gameId, confidenceValue }) {
    const state = loadState()
    const pick = state.picks.find(
      (p) => p.userId === userId && p.leagueId === leagueId && p.periodId === periodId && p.gameId === gameId,
    )
    if (!pick) throw new Error('No existing pick for this game')
    if (pick.confidenceValue === confidenceValue) return delay(undefined)

    const otherPick = state.picks.find(
      (p) =>
        p.userId === userId &&
        p.leagueId === leagueId &&
        p.periodId === periodId &&
        p.confidenceValue === confidenceValue &&
        p.gameId !== gameId,
    )
    if (otherPick) {
      const otherGame = games.find((g) => g.id === otherPick.gameId)
      if (otherGame && new Date(otherGame.kickoffTime).getTime() <= Date.now()) {
        throw new Error('That value belongs to a game that has already locked and cannot be swapped')
      }
      otherPick.confidenceValue = pick.confidenceValue
    }
    pick.confidenceValue = confidenceValue
    saveState(state)
    return delay(undefined)
  },

  async getStandings(leagueId, seasonYear) {
    const state = loadState()
    return delay(computeStandings(state, leagueId, seasonYear, () => true))
  },

  async getMnfStandings(leagueId, seasonYear) {
    const state = loadState()
    return delay(
      computeStandings(
        state,
        leagueId,
        seasonYear,
        (game) => game.broadcastWindow === 'monday_night',
      ),
    )
  },
}

// Leagues persist across seasons, so standings are scored per season, not as a lifetime total.
function computeStandings(
  state: PersistedState,
  leagueId: string,
  seasonYear: number,
  gameFilter: (game: Game) => boolean,
): Standing[] {
  const members = state.leagueMembers.filter((m) => m.leagueId === leagueId)
  return members
    .map((member): Standing => {
      const totalPoints = state.picks
        .filter(
          (p) =>
            p.leagueId === leagueId &&
            p.userId === member.userId &&
            periodsById.get(p.periodId)?.seasonYear === seasonYear,
        )
        .reduce((sum, pick) => {
          const game = games.find((g) => g.id === pick.gameId)
          if (!game || !gameFilter(game)) return sum
          return sum + (pointsForPick(pick, game) ?? 0)
        }, 0)
      return { userId: member.userId, totalPoints }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}

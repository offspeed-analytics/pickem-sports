import type { Game, League, Period, Pick, Standing } from '../types/domain'

/**
 * Everything except auth (auth is real Supabase from Phase 2 onward; see hooks/useAuth.ts).
 * Callers pass userId explicitly rather than this client owning session state. Membership deals
 * only in userId — never a denormalized username — since profile data (including username) is
 * always real Supabase regardless of VITE_DATA_SOURCE; resolving userId -> username for display
 * is a separate profiles lookup, not this client's concern.
 */
export interface DataClient {
  getMyLeagues(userId: string): Promise<League[]>
  createLeague(input: { name: string; ownerId: string }): Promise<League>
  joinLeagueByCode(input: { code: string; userId: string }): Promise<League>
  getLeagueMemberIds(leagueId: string): Promise<string[]>

  getPeriods(sport: 'NFL'): Promise<Period[]>
  getGamesForPeriod(periodId: string): Promise<Game[]>

  /** The requesting user's own picks for a period, regardless of lock state. */
  getMyPicksForPeriod(input: { leagueId: string; periodId: string; userId: string }): Promise<Pick[]>
  /** All league members' picks for a period, with unlocked-game picks omitted server-side. */
  getLeaguePicksForPeriod(input: { leagueId: string; periodId: string }): Promise<Pick[]>
  submitPick(input: {
    userId: string
    leagueId: string
    periodId: string
    gameId: string
    pickedTeamId: string
    confidenceValue: number
  }): Promise<Pick>

  getStandings(leagueId: string): Promise<Standing[]>
  getMnfStandings(leagueId: string): Promise<Standing[]>
}

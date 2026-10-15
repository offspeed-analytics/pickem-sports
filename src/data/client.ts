import type { Game, League, Period, Pick, Standing, Team } from '../types/domain'

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
  /** The period a user should currently be picking — not just "the latest one in the DB",
   * since a full season's schedule can be synced far in advance. */
  getCurrentPeriod(sport: 'NFL'): Promise<Period | undefined>
  /** Teams as referenced by this client's own games/picks — a game's team ids only resolve
   * against the matching source's teams (mock fixture ids vs. real Supabase UUIDs differ). */
  getTeams(sport: 'NFL'): Promise<Team[]>
  getGamesForPeriod(periodId: string): Promise<Game[]>

  /** The requesting user's own picks for a period, regardless of lock state. */
  getMyPicksForPeriod(input: { leagueId: string; periodId: string; userId: string }): Promise<Pick[]>
  /** The signed-in user's own picks across a set of periods (typically "every period in a
   * season"), optionally scoped to one league. Batched the same way getCurrentPeriod already
   * batches game lookups via .in('period_id', ...) -- avoids one request per week. */
  getPicksForPeriods(input: { userId: string; leagueId?: string; periodIds: string[] }): Promise<Pick[]>
  /** Distinct season years the user has any pick in, optionally scoped to one league -- cheap
   * and narrow, for populating a season filter without fetching full pick history just to
   * derive which seasons it spans. */
  getPickedSeasons(input: { userId: string; leagueId?: string }): Promise<number[]>
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
  /** Reassigns gameId's confidence value, swapping with whichever game currently holds it (if any)
   * so every value from 1..gameCount stays used exactly once — never leaves a game unranked. */
  swapConfidence(input: {
    userId: string
    leagueId: string
    periodId: string
    gameId: string
    confidenceValue: number
  }): Promise<void>

  /** Scored per season — a league persists across years, so standings must not be a lifetime total. */
  getStandings(leagueId: string, seasonYear: number): Promise<Standing[]>
  getMnfStandings(leagueId: string, seasonYear: number): Promise<Standing[]>
}

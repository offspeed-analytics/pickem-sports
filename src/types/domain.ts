export interface Team {
  id: string
  sport: 'NFL'
  externalId: string
  name: string
  abbreviation: string
  logoUrl: string
  conference?: string
  division?: string
}

export interface Profile {
  id: string
  username: string
  avatarUrl: string | null
}

/** One favorite team per sport per user. */
export interface FavoriteTeam {
  userId: string
  sport: 'NFL'
  teamId: string
}

export interface League {
  id: string
  name: string
  sport: 'NFL'
  gameplayMode: 'confidence_pickem'
  inviteCode: string
  ownerId: string
}

export type SeasonType = 'regular' | 'postseason'

/** A batch of games a user picks together (NFL "Week 5", or a postseason round). */
export interface Period {
  id: string
  sport: 'NFL'
  seasonYear: number
  seasonType: SeasonType
  periodNumber: number
}

export type GameStatus = 'scheduled' | 'in_progress' | 'final'

/** Derived from kickoff day/time during sync, not provided directly by ESPN. */
export type BroadcastWindow = 'thursday_night' | 'sunday_night' | 'monday_night'

export interface Game {
  id: string
  periodId: string
  homeTeamId: string
  awayTeamId: string
  kickoffTime: string
  broadcastWindow: BroadcastWindow | null
  isNeutralSite: boolean
  homeRecord: string | null
  awayRecord: string | null
  oddsSpread: string | null
  oddsOverUnder: number | null
  status: GameStatus
  homeScore: number | null
  awayScore: number | null
}

export interface Pick {
  id: string
  userId: string
  leagueId: string
  periodId: string
  gameId: string
  pickedTeamId: string
  confidenceValue: number
  isAutoAssigned: boolean
  pointsEarned: number | null
}

/** username is resolved separately via a profiles lookup, not stored here. */
export interface Standing {
  userId: string
  totalPoints: number
}

import type { DataClient } from '../client'
import type { BroadcastWindow, Game, League, Period, Pick, SeasonType, Standing, Team } from '../../types/domain'
import { pickCurrentPeriod } from '../../lib/periods'
import { supabase } from './supabaseClient'

interface TeamRow {
  id: string
  sport: 'NFL'
  external_id: string
  name: string
  abbreviation: string
  logo_url: string
  conference: string | null
  division: string | null
}

interface LeagueRow {
  id: string
  name: string
  sport: 'NFL'
  gameplay_mode: string
  invite_code: string
  owner_id: string
}

interface PeriodRow {
  id: string
  sport: 'NFL'
  season_year: number
  season_type: SeasonType
  period_number: number
}

interface GameRow {
  id: string
  period_id: string
  home_team_id: string
  away_team_id: string
  kickoff_time: string
  broadcast_window: BroadcastWindow | null
  is_neutral_site: boolean
  home_record: string | null
  away_record: string | null
  odds_spread: string | null
  odds_over_under: number | null
  status: Game['status']
  home_score: number | null
  away_score: number | null
}

interface PickRow {
  id: string
  user_id: string
  league_id: string
  period_id: string
  game_id: string
  picked_team_id: string
  confidence_value: number
  is_auto_assigned: boolean
  points_earned: number | null
}

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    sport: row.sport,
    externalId: row.external_id,
    name: row.name,
    abbreviation: row.abbreviation,
    logoUrl: row.logo_url,
    conference: row.conference ?? undefined,
    division: row.division ?? undefined,
  }
}

function toLeague(row: LeagueRow): League {
  return {
    id: row.id,
    name: row.name,
    sport: row.sport,
    gameplayMode: row.gameplay_mode as League['gameplayMode'],
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
  }
}

function toPeriod(row: PeriodRow): Period {
  return {
    id: row.id,
    sport: row.sport,
    seasonYear: row.season_year,
    seasonType: row.season_type,
    periodNumber: row.period_number,
  }
}

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    periodId: row.period_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    kickoffTime: row.kickoff_time,
    broadcastWindow: row.broadcast_window,
    isNeutralSite: row.is_neutral_site,
    homeRecord: row.home_record,
    awayRecord: row.away_record,
    oddsSpread: row.odds_spread,
    oddsOverUnder: row.odds_over_under,
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
  }
}

function toPick(row: PickRow): Pick {
  return {
    id: row.id,
    userId: row.user_id,
    leagueId: row.league_id,
    periodId: row.period_id,
    gameId: row.game_id,
    pickedTeamId: row.picked_team_id,
    confidenceValue: row.confidence_value,
    isAutoAssigned: row.is_auto_assigned,
    pointsEarned: row.points_earned,
  }
}

const PICK_COLUMNS =
  'id, user_id, league_id, period_id, game_id, picked_team_id, confidence_value, is_auto_assigned, points_earned'

export const supabaseDataClient: DataClient = {
  async getMyLeagues() {
    // RLS already scopes this to leagues the authenticated user is a member of.
    const { data, error } = await supabase.from('leagues').select('*')
    if (error) throw error
    return data.map(toLeague)
  },

  async createLeague({ name }) {
    // create_league sets owner_id from auth.uid() server-side and adds the owner as a member
    // atomically — see 0005_create_league_rpc.sql for why this can't be two plain client inserts.
    const { data, error } = await supabase.rpc('create_league', { p_name: name })
    if (error) throw error
    return toLeague(data)
  },

  async joinLeagueByCode({ code }) {
    const { data, error } = await supabase.rpc('join_league_with_code', {
      p_code: code.toUpperCase(),
    })
    if (error) throw error
    if (!data) throw new Error('Invalid invite code')
    return toLeague(data)
  },

  async getLeagueMemberIds(leagueId) {
    const { data, error } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
    if (error) throw error
    return data.map((row) => row.user_id)
  },

  async getPeriods(sport) {
    const { data, error } = await supabase.from('periods').select('*').eq('sport', sport)
    if (error) throw error
    return data.map(toPeriod)
  },

  async getCurrentPeriod(sport) {
    const { data: periodRows, error: periodsError } = await supabase
      .from('periods')
      .select('*')
      .eq('sport', sport)
    if (periodsError) throw periodsError
    const periods = periodRows.map(toPeriod)
    if (periods.length === 0) return undefined

    const { data: kickoffRows, error: gamesError } = await supabase
      .from('games')
      .select('period_id, kickoff_time')
      .in(
        'period_id',
        periods.map((p) => p.id),
      )
    if (gamesError) throw gamesError

    const lastKickoffByPeriodId = new Map<string, string>()
    for (const row of kickoffRows) {
      const existing = lastKickoffByPeriodId.get(row.period_id)
      if (!existing || row.kickoff_time > existing) {
        lastKickoffByPeriodId.set(row.period_id, row.kickoff_time)
      }
    }
    return pickCurrentPeriod(periods, lastKickoffByPeriodId)
  },

  async getTeams(sport) {
    const { data, error } = await supabase.from('teams').select('*').eq('sport', sport)
    if (error) throw error
    return data.map(toTeam)
  },

  async getGamesForPeriod(periodId) {
    const { data, error } = await supabase.from('games').select('*').eq('period_id', periodId)
    if (error) throw error
    return data.map(toGame)
  },

  async getMyPicksForPeriod({ leagueId, periodId, userId }) {
    const { data, error } = await supabase
      .from('picks')
      .select(PICK_COLUMNS)
      .eq('league_id', leagueId)
      .eq('period_id', periodId)
      .eq('user_id', userId)
    if (error) throw error
    return data.map(toPick)
  },

  async getLeaguePicksForPeriod({ leagueId, periodId }) {
    // RLS already limits this to the caller's own picks plus other members' picks on locked games.
    const { data, error } = await supabase
      .from('picks')
      .select(PICK_COLUMNS)
      .eq('league_id', leagueId)
      .eq('period_id', periodId)
    if (error) throw error
    return data.map(toPick)
  },

  async submitPick({ userId, leagueId, periodId, gameId, pickedTeamId, confidenceValue }) {
    const { data, error } = await supabase
      .from('picks')
      .upsert(
        {
          user_id: userId,
          league_id: leagueId,
          period_id: periodId,
          game_id: gameId,
          picked_team_id: pickedTeamId,
          confidence_value: confidenceValue,
        },
        { onConflict: 'user_id,league_id,game_id' },
      )
      .select(PICK_COLUMNS)
      .single()
    if (error) throw error
    return toPick(data)
  },

  async swapConfidence({ leagueId, periodId, gameId, confidenceValue }) {
    const { error } = await supabase.rpc('swap_pick_confidence', {
      p_league_id: leagueId,
      p_period_id: periodId,
      p_game_id: gameId,
      p_new_value: confidenceValue,
    })
    if (error) throw error
  },

  async getStandings(leagueId, seasonYear) {
    const { data, error } = await supabase
      .from('league_standings')
      .select('user_id, total_points')
      .eq('league_id', leagueId)
      .eq('season_year', seasonYear)
      .order('total_points', { ascending: false })
    if (error) throw error
    return data.map((row): Standing => ({ userId: row.user_id, totalPoints: row.total_points }))
  },

  async getMnfStandings(leagueId, seasonYear) {
    const { data, error } = await supabase
      .from('mnf_standings')
      .select('user_id, total_points')
      .eq('league_id', leagueId)
      .eq('season_year', seasonYear)
      .order('total_points', { ascending: false })
    if (error) throw error
    return data.map((row): Standing => ({ userId: row.user_id, totalPoints: row.total_points }))
  },
}

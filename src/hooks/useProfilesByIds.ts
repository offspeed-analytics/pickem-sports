import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase/supabaseClient'

export interface ProfileInfo {
  username: string
  favoriteTeamLogoUrl: string | null
}

interface ProfileRow {
  id: string
  username: string
  profile_favorite_teams: { sport: string; team: { logo_url: string } | null }[]
}

/** Resolves userId -> profile info. Profiles are always real Supabase, independent of VITE_DATA_SOURCE. */
export function useProfilesByIds(userIds: string[]) {
  const sortedIds = [...new Set(userIds)].sort()
  return useQuery({
    queryKey: ['profiles', sortedIds],
    queryFn: async (): Promise<Map<string, ProfileInfo>> => {
      if (sortedIds.length === 0) return new Map()
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, profile_favorite_teams(sport, team:teams(logo_url))')
        .in('id', sortedIds)
      if (error) throw error
      return new Map(
        (data as unknown as ProfileRow[]).map((row) => [
          row.id,
          {
            username: row.username,
            favoriteTeamLogoUrl:
              row.profile_favorite_teams.find((f) => f.sport === 'NFL')?.team?.logo_url ?? null,
          },
        ]),
      )
    },
    enabled: sortedIds.length > 0,
  })
}

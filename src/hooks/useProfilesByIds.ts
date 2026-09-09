import { useQuery } from '@tanstack/react-query'
import { MOCK_TEST_PROFILES } from '../data/mock/mockClient'
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

/**
 * Resolves userId -> profile info. Profiles are otherwise always real Supabase, independent of
 * VITE_DATA_SOURCE — the one exception is the fake members mockClient seeds into local leagues,
 * which have no real profiles row, so their names are resolved from a local map instead.
 */
export function useProfilesByIds(userIds: string[]) {
  const sortedIds = [...new Set(userIds)].sort()
  return useQuery({
    queryKey: ['profiles', sortedIds],
    queryFn: async (): Promise<Map<string, ProfileInfo>> => {
      const result = new Map<string, ProfileInfo>()
      const remainingIds = sortedIds.filter((id) => {
        const mockProfile = MOCK_TEST_PROFILES[id]
        if (!mockProfile) return true
        result.set(id, mockProfile)
        return false
      })
      if (remainingIds.length === 0) return result

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, profile_favorite_teams(sport, team:teams(logo_url))')
        .in('id', remainingIds)
      if (error) throw error
      for (const row of data as unknown as ProfileRow[]) {
        result.set(row.id, {
          username: row.username,
          favoriteTeamLogoUrl:
            row.profile_favorite_teams.find((f) => f.sport === 'NFL')?.team?.logo_url ?? null,
        })
      }
      return result
    },
    enabled: sortedIds.length > 0,
  })
}

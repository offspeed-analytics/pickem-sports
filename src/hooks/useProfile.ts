import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase/supabaseClient'
import type { Profile } from '../types/domain'

function toProfile(row: { id: string; username: string; avatar_url: string | null }): Profile {
  return { id: row.id, username: row.username, avatarUrl: row.avatar_url }
}

/** Returns null (not undefined) once loaded if the user hasn't completed onboarding yet. */
export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data ? toProfile(data) : null
    },
    enabled: userId !== null,
  })
}

export function useInvalidateProfile() {
  const queryClient = useQueryClient()
  return (userId: string) => queryClient.invalidateQueries({ queryKey: ['profile', userId] })
}

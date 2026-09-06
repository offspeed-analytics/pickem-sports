import { useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase/supabaseClient'

export interface TeamOption {
  id: string
  name: string
}

export function useTeams(sport = 'NFL') {
  return useQuery({
    queryKey: ['teams', sport],
    queryFn: async (): Promise<TeamOption[]> => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name')
        .eq('sport', sport)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

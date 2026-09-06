import { useQuery } from '@tanstack/react-query'
import { dataClient } from '../data'
import type { Period } from '../types/domain'

export function usePeriods(sport: Period['sport']) {
  return useQuery({
    queryKey: ['periods', sport],
    queryFn: () => dataClient.getPeriods(sport),
  })
}

import { useQuery } from '@tanstack/react-query'
import { dataClient } from '../data'
import type { Period } from '../types/domain'

export function useCurrentPeriod(sport: Period['sport']) {
  return useQuery({
    queryKey: ['current-period', sport],
    queryFn: () => dataClient.getCurrentPeriod(sport),
  })
}

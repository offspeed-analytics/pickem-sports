import type { DataClient } from './client'
import { mockClient } from './mock/mockClient'

// "supabase" case is added in Phase 6 alongside src/data/supabase/supabaseDataClient.ts.
export const dataClient: DataClient = mockClient

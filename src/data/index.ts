import type { DataClient } from './client'
import { mockClient } from './mock/mockClient'
import { supabaseDataClient } from './supabase/supabaseDataClient'

export const dataClient: DataClient =
  import.meta.env.VITE_DATA_SOURCE === 'supabase' ? supabaseDataClient : mockClient

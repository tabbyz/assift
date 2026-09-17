import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { getSupabasePublicEnv } from './env'

/** ブラウザ用。Realtime など Client Component から直接 Supabase を触る必要があるときだけ使う */
export function createClient() {
  const { url, key } = getSupabasePublicEnv()
  return createBrowserClient<Database>(url, key)
}

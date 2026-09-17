import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { getSupabasePublicEnv } from './env'

/**
 * Server Component / Server Action / Route Handler 用（anon + RLS）。
 * cache() でリクエスト内は 1 インスタンスに揃える。
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()
  const { url, key } = getSupabasePublicEnv()

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Component からは cookie を書けない。セッション更新は proxy が担うので無視する
        }
      },
    },
  })
})

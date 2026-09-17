import 'server-only'
import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

export type AuthUser = { id: string; email: string | null }

/**
 * Supabase Auth 上のユーザー（JWT の claims から取得）。
 * アプリ側の profiles を含む currentUser() は 004 で追加する。認可ロールはそちらを信頼する。
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const { sub, email } = data.claims
  return { id: sub, email: typeof email === 'string' ? email : null }
})

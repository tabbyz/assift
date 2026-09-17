import 'server-only'
import { cache } from 'react'
import { getProfile } from '@/lib/queries/profiles'
import { createClient } from '@/utils/supabase/server'

export type AuthUser = { id: string; email: string | null }
export type CurrentUser = AuthUser & { isAdmin: boolean }

/** Supabase Auth 上のユーザー（JWT の claims から取得）。認可ロールは currentUser() を使う */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const { sub, email } = data.claims
  return { id: sub, email: typeof email === 'string' ? email : null }
})

/**
 * アプリ側の profiles を含むログインユーザー。認可ロール（isAdmin）はここを信頼する。
 * profiles の行が無い場合も null にせず isAdmin: false で返す（auth トリガが欠けていても
 * ログインが壊れないように。認可は常に fail-safe 側に倒す）。
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getAuthUser()
  if (!user) return null

  const profile = await getProfile(user.id)
  if (!profile) {
    console.warn(`[auth] profiles に行がありません (id: ${user.id})。isAdmin: false として扱います`)
    return { ...user, isAdmin: false }
  }

  return { id: user.id, email: profile.email ?? user.email, isAdmin: profile.is_admin }
})

import 'server-only'
import { type AuthError, createClient } from '@supabase/supabase-js'
import { getSupabasePublicEnv } from '@/utils/supabase/env'

export type VerifyPasswordResult = { ok: true } | { ok: false; error: AuthError | null }

/**
 * 現在のパスワードが正しいかを確かめる（パスワード変更時。004 §3.4）。
 * cookie を持たない使い捨てクライアントで signInWithPassword し、できたセッションはすぐ閉じる。
 * ブラウザのセッション cookie には触れない。
 *
 * 失敗の理由（パスワード違い / レート制限 / 通信エラー）は呼び出し側で区別する。
 * まとめて「パスワードが違う」と言うと、実際には正しく入力しているユーザーに嘘をつくことになる。
 */
export async function verifyPassword(
  email: string,
  password: string
): Promise<VerifyPasswordResult> {
  const { url, key } = getSupabasePublicEnv()
  const throwaway = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await throwaway.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error }
  if (!data.session) return { ok: false, error: null }
  // 検証用に作ったセッションだけをサーバー側で無効化する（他の端末のログインには影響しない）
  await throwaway.auth.signOut({ scope: 'local' })
  return { ok: true }
}

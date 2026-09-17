import 'server-only'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { GOOGLE_ONLY_MESSAGE } from '@/lib/auth/notices'
import { currentUser, getAuthUser } from '@/utils/auth/current'
import { createClient } from '@/utils/supabase/server'
import { ActionError } from './error'

/** ログイン必須。未ログインなら ActionError を投げる */
export async function requireUser() {
  const user = await getAuthUser()
  if (!user) throw new ActionError('ログインが必要です')
  return user
}

/** 管理者必須。auth.users.user_metadata ではなく profiles.is_admin を信頼する */
export async function requireAdmin() {
  const user = await currentUser()
  if (!user?.isAdmin) throw new ActionError('権限がありません')
  return user
}

/**
 * メール + パスワードで登録したアカウントであることを要求する（004 §3.13）。
 *
 * Google だけで登録したアカウントにパスワードやメールアドレスを持たせると、Google 側の値と
 * 食い違ったまま画面からは直せなくなる。フォームを隠すだけでは Action を直接叩けるので
 * サーバー側でも断る。`providers` は claims に無いので getUser() で読む。
 * 読めなかったときは「Google 専用」と決めつけず、一時的な失敗として扱う。
 */
export async function requireEmailProviderAccount(message = GOOGLE_ONLY_MESSAGE) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new ActionError(authErrorMessage(error))

  const providers = (data.user.app_metadata.providers as string[] | undefined) ?? []
  if (!providers.includes('email')) throw new ActionError(message)
  return data.user
}

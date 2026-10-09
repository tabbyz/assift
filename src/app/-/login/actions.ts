'use server'

import { fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { isAdminRequest } from '@/lib/admin/guard'
import { ADMIN_USERS_PATH } from '@/lib/admin/paths'
import { authErrorMessage, INVALID_CREDENTIALS_MESSAGE } from '@/lib/auth/authErrorMessage'
import { getProfile } from '@/lib/queries/profiles'
import { loginSchema } from '@/lib/validation/auth'
import { createClient } from '@/utils/supabase/server'

/**
 * 管理画面のログイン（020 §5）。メール + パスワードだけ。遷移はクライアントが行う（004 §3.2）。
 *
 * 管理者でなければセッションを残さず、パスワード違いと同じ文言で断る（管理者かどうかを漏らさない）。
 * 管理者の判定は戻り値の user.id で profiles を読む。currentUser() は getAuthUser() が cache() されていて、
 * 同じリクエストで先に呼ばれているとログイン前の値を返す
 */
export async function adminLogin(input: {
  email: string
  password: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { email, password } = loginSchema.parse(input)
    if (!(await isAdminRequest())) fail('権限がありません')

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) fail(authErrorMessage(error))

    const profile = await getProfile(data.user.id)
    if (!profile?.is_admin) {
      await supabase.auth.signOut({ scope: 'local' })
      fail(INVALID_CREDENTIALS_MESSAGE)
    }
    return { redirectTo: ADMIN_USERS_PATH }
  })
}

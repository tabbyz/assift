'use server'

import { fail } from '@/lib/actions/error'
import { requireEmailProviderAccount, requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { clearRecoverySession, hasRecoverySession } from '@/lib/auth/recoveryFlow'
import { DEFAULT_AFTER_LOGIN } from '@/lib/auth/safeNext'
import { resetPasswordSchema } from '@/lib/validation/auth'
import { createClient } from '@/utils/supabase/server'

/**
 * 再設定リンクから来たセッションで新しいパスワードを保存する。
 *
 * セッションがあるだけでは通さない（004 §3.11）。再設定リンクは通常のセッションを張るので、
 * 印が無いまま許すと、盗まれた cookie や離席中の端末から現在のパスワードなしに変更できてしまう。
 */
export async function resetPassword(input: {
  password: string
  passwordConfirmation: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { password } = resetPasswordSchema.parse(input)
    await requireUser()
    if (!(await hasRecoverySession())) {
      fail('パスワード再設定の有効期限が切れています。再設定メールの送信からやり直してください')
    }

    // Google だけで登録したアカウントにパスワードを持たせない（アカウント画面の表示と食い違うため）
    await requireEmailProviderAccount()

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) fail(authErrorMessage(error))

    await clearRecoverySession()
    return { redirectTo: DEFAULT_AFTER_LOGIN }
  })
}

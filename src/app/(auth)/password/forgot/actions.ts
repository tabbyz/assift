'use server'

import { fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { forgotPasswordSchema } from '@/lib/validation/auth'
import { createClient } from '@/utils/supabase/server'

/** 再設定メールを送る。リンク先はテンプレート側で /auth/callback?type=recovery&next=/password/reset に固定 */
export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = forgotPasswordSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) fail(authErrorMessage(error))
  })
}

'use server'

import { fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { resendConfirmationSchema, signupSchema } from '@/lib/validation/auth'
import { createClient } from '@/utils/supabase/server'

/**
 * メール + パスワードで登録し、確認メールを送る（enable_confirmations = true）。
 *
 * 確認済みの既存メールに対して GoTrue は `user_already_exists` を返すので、この Action も
 * 「既に登録されています」と答える = アカウントの存在が分かる。ログイン失敗はあえて区別しない
 * （§3.10）が、登録は v1 と同じく伝える方を採る。隠すと、既に登録済みの人が永遠に届かない
 * 確認メールを待つことになるため（004 §3.12）。
 */
export async function signup(input: {
  email: string
  password: string
  agreed: boolean
}): Promise<ActionResult> {
  return runAction(async () => {
    const { email, password } = signupSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) fail(authErrorMessage(error))
  })
}

/** 確認メールの再送。未確認のアドレスにだけ届く */
export async function resendConfirmation(input: { email: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = resendConfirmationSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) fail(authErrorMessage(error))
  })
}

'use server'

import { fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { requestOrigin } from '@/lib/auth/requestOrigin'
import { safeNext } from '@/lib/auth/safeNext'
import { googleLoginSchema, loginSchema } from '@/lib/validation/auth'
import { createClient } from '@/utils/supabase/server'

/** メール + パスワードでログインし、遷移先を返す。遷移はクライアントが行う（004 §3.2） */
export async function login(input: {
  email: string
  password: string
  next?: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { email, password, next } = loginSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // 未登録かパスワード違いかは区別しない文言になる（authErrorMessage の invalid_credentials）
    if (error) fail(authErrorMessage(error))
    return { redirectTo: safeNext(next) }
  })
}

/** Google の認可 URL を返す。クライアントが window.location で遷移し、/auth/callback に戻ってくる */
export async function loginWithGoogle(input: {
  next?: string
}): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const { next } = googleLoginSchema.parse(input)
    const callback = new URL('/auth/callback', await requestOrigin())
    callback.searchParams.set('next', safeNext(next))

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    })
    if (error || !data.url) fail(authErrorMessage(error))
    return { url: data.url }
  })
}

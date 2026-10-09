'use server'

import { fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { ADMIN_LOGIN_PATH } from '@/lib/admin/paths'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { createClient } from '@/utils/supabase/server'

/** 管理画面のログアウト（この端末のこのホストのセッションだけ。本体のセッションは別） */
export async function adminLogout(): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) fail(authErrorMessage(error))
    return { redirectTo: ADMIN_LOGIN_PATH }
  })
}

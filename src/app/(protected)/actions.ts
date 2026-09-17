'use server'

import { fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { createClient } from '@/utils/supabase/server'

/**
 * ログアウト（この端末のセッションだけ）。遷移はクライアントが行う（004 §3.2）。
 *
 * ヘッダーのアカウントメニューとアカウント画面の両方から呼ぶので、
 * ルート個別ではなく (protected) グループ共通の Action として置く。
 */
export async function logout(): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) fail(authErrorMessage(error))
    return { redirectTo: '/login' }
  })
}

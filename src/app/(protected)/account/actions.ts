'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireEmailProviderAccount, requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { authErrorMessage, currentPasswordErrorMessage } from '@/lib/auth/authErrorMessage'
import { GOOGLE_ONLY_ACCOUNT_MESSAGE } from '@/lib/auth/notices'
import { verifyPassword } from '@/lib/auth/verifyPassword'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import { updateEmailSchema, updatePasswordSchema } from '@/lib/validation/auth'
import { createClient } from '@/utils/supabase/server'

/** メールアドレス変更。旧・新の両方に確認メールが届き、両方のリンクを開くと切り替わる（004 §3.5） */
export async function updateEmail(input: { email: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = updateEmailSchema.parse(input)
    const user = await requireUser()
    if (user.email && email.toLowerCase() === user.email.toLowerCase()) {
      fail('現在のメールアドレスと同じです')
    }
    // 画面ではフォームを隠しているが、Action は直接呼べるのでここでも断る
    await requireEmailProviderAccount(GOOGLE_ONLY_ACCOUNT_MESSAGE)

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ email })
    if (error) fail(authErrorMessage(error))
    revalidatePath('/account')
  })
}

/** パスワード変更。現在のパスワードを確認してから更新する（004 §3.4） */
export async function updatePassword(input: {
  currentPassword: string
  password: string
  passwordConfirmation: string
}): Promise<ActionResult> {
  return runAction(async () => {
    const { currentPassword, password } = updatePasswordSchema.parse(input)
    const user = await requireUser()
    if (!user.email) fail('このアカウントはパスワードを変更できません')
    await requireEmailProviderAccount(GOOGLE_ONLY_ACCOUNT_MESSAGE)

    // パスワード違い以外（レート制限・通信エラー等）を「パスワードが違う」と言わない
    const verified = await verifyPassword(user.email, currentPassword)
    if (!verified.ok) fail(currentPasswordErrorMessage(verified.error))

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) fail(authErrorMessage(error))
  })
}

/** ログアウト（この端末のセッションだけ）。遷移はクライアントが行う */
export async function logout(): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) fail(authErrorMessage(error))
    return { redirectTo: '/login' }
  })
}

/**
 * アカウント削除。auth.users の削除が profiles → tenants → 全データへ cascade する（001 §4.3）。
 * service_role を使う唯一のユーザー文脈の操作（AGENTS.md の例外。004 §3.6）。
 * 渡す id は requireUser() で得た自分のものだけで、入力からは受け取らない。
 */
export async function deleteAccount(): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const user = await requireUser()
    const { error } = await createPrivilegedClient().auth.admin.deleteUser(user.id)
    if (error) fail(authErrorMessage(error, 'アカウントの削除に失敗しました'))

    // cookie を消すのが目的。@supabase/ssr に cookie だけ捨てる API は無いので signOut を通す。
    // ユーザーは既に居ないので API 側は 404 になるが、auth-js はそれを無視してローカルを消す
    const supabase = await createClient()
    await supabase.auth.signOut({ scope: 'local' })
    return { redirectTo: '/' }
  })
}

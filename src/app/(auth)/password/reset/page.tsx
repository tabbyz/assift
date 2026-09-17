import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { hasRecoverySession } from '@/lib/auth/recoveryFlow'
import { getAuthUser } from '@/utils/auth/current'
import { ResetPasswordForm } from './_components/ResetPasswordForm'

export const metadata: Metadata = { title: '新しいパスワードを設定' }

/**
 * 再設定メールのリンク → /auth/callback(type=recovery) で
 * セッション + 再設定フローの印が付いてからここに来る（004 §3.11）。
 * ログイン中でも印が無ければ開けない（現在のパスワードを知らずに変更できてしまうため）。
 */
export default async function ResetPasswordPage() {
  const user = await getAuthUser()
  if (!user || !(await hasRecoverySession())) redirect('/password/forgot?error=expired')
  return <ResetPasswordForm />
}

import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ActionError } from '@/lib/actions/error'
import { requireAdmin } from '@/lib/actions/guards'
import { currentUser } from '@/utils/auth/current'
import { adminHostEnv, isAdminHost } from './host'
import { ADMIN_LOGIN_PATH } from './paths'

/**
 * 管理画面の確認（020 §5）。管理者の判定（`profiles.is_admin`）に加えて**ホストも見る**。
 *
 * Server Action はどのページからでも呼べる（Next は Action の ID が今のページに無ければ、持っているページへ転送する）。
 * ホストを見ないと、本体のホストのページから管理画面の Action を本体のセッションで呼べてしまう。
 * 管理専用のアカウントを本体で使わない決まり（§5.1）が破られたときの備え
 */

/** 管理画面を開いてよいホストからのリクエストか */
export async function isAdminRequest(): Promise<boolean> {
  const host = (await headers()).get('host')
  return isAdminHost(host, adminHostEnv())
}

/**
 * page / layout 用。ホストが違う・管理者でなければ 404（存在を漏らさない）、未ログインはログインへ。
 * layout はクライアント遷移で描き直されないので、page でも呼ぶ
 */
export async function requireAdminPage() {
  if (!(await isAdminRequest())) notFound()
  const user = await currentUser()
  if (!user) redirect(ADMIN_LOGIN_PATH)
  if (!user.isAdmin) notFound()
  return user
}

/** Action と `createAdminClient()` 用。失敗は ActionError（文言は requireAdmin と同じ） */
export async function requireAdminAction() {
  if (!(await isAdminRequest())) throw new ActionError('権限がありません')
  return requireAdmin()
}

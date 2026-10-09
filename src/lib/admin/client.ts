import 'server-only'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import { requireAdminAction } from './guard'

/**
 * 管理画面の service_role のクライアント（020 §5）。`requireAdminAction()`（ホスト + `is_admin`）を通らないと手に入らない。
 * 中のクエリは対象の 1 人に絞る（`.eq('id' / 'user_id' / 'owner_id', …)`。`publicShare.ts`・`lib/billing/` と同じ規律）。
 *
 * page は先に `requireAdminPage()` を呼ぶので、ここで落ちるのは確認の書き忘れだけ（そのときは 500 になる）
 */
export async function createAdminClient() {
  await requireAdminAction()
  return createPrivilegedClient()
}

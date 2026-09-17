import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * service_role（RLS を通らない）クライアントの唯一の入口。
 * 用途は公開共有ページの読み取り、ジョブ、管理操作に限る。ユーザー文脈の Server Action では使わない。
 *
 * 例外は `account/actions.ts` の `deleteAccount()`。`auth.admin.deleteUser` は service_role でしか
 * 呼べず、ユーザーが自分のアカウントを消す唯一の手段のため。渡す id は `requireUser()` で得た
 * 自分のものだけで、入力からは受け取らない。同種の例外を足すときは AGENTS.md にも書く。
 */
export function createPrivilegedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください')
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

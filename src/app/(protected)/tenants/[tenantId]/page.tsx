import { notFound, redirect } from 'next/navigation'
import { getTenant } from '@/lib/queries/tenants'
import { isUuid } from '@/utils/uuid'

/**
 * 店舗トップ。初期設定を終えていればシフト表、途中なら初期設定の続きへ（014 §5.6）。
 * 完了は `setup_completed_at` で決める（勤務やスタッフを全部消しても初期設定には戻さない）。
 * `redirect()` には常に `/` 始まりの絶対パスを渡す（相対だと現在 URL 基準で解決されるため）。
 */
export default async function TenantPage({ params }: PageProps<'/tenants/[tenantId]'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を throw する（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const tenant = await getTenant(tenantId)
  if (!tenant) notFound()
  redirect(tenant.setup_completed_at ? `/tenants/${tenantId}/shifts` : `/tenants/${tenantId}/setup`)
}

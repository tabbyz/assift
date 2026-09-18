import { notFound, redirect } from 'next/navigation'
import { getTutorialStatus } from '@/lib/queries/tenants'
import { isUuid } from '@/utils/uuid'

/**
 * 店舗トップ。チュートリアル完了ならシフト表、未完了なら初期設定へ（v1 の TenantsController#show）。
 * `redirect()` には常に `/` 始まりの絶対パスを渡す（相対だと現在 URL 基準で解決されるため）。
 */
export default async function TenantPage({ params }: PageProps<'/tenants/[tenantId]'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を throw する（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const { completed } = await getTutorialStatus(tenantId)
  redirect(completed ? `/tenants/${tenantId}/shifts` : `/tenants/${tenantId}/tutorial/intro`)
}

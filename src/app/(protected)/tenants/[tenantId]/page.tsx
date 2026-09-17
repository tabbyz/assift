import { redirect } from 'next/navigation'
import { getTutorialStatus } from '@/lib/queries/tenants'

/**
 * 店舗トップ。チュートリアル完了ならシフト表、未完了なら初期設定へ（v1 の TenantsController#show）。
 * `redirect()` には常に `/` 始まりの絶対パスを渡す（相対だと現在 URL 基準で解決されるため）。
 */
export default async function TenantPage({ params }: PageProps<'/tenants/[tenantId]'>) {
  const { tenantId } = await params
  const { completed } = await getTutorialStatus(tenantId)
  redirect(completed ? `/tenants/${tenantId}/shifts` : `/tenants/${tenantId}/tutorial/intro`)
}

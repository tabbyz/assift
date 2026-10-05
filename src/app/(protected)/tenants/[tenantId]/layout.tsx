import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TenantShell } from '@/components/TenantShell'
import { getTenant, listTenants } from '@/lib/queries/tenants'
import { getAuthUser } from '@/utils/auth/current'
import { isUuid } from '@/utils/uuid'

export async function generateMetadata({
  params,
}: LayoutProps<'/tenants/[tenantId]'>): Promise<Metadata> {
  const { tenantId } = await params
  if (!isUuid(tenantId)) return {}

  const tenant = await getTenant(tenantId)
  // 配下のページは `店舗情報 | ひまわり保育園` のようになる（v1 は `assift | 店舗名`）
  return tenant ? { title: { default: tenant.name, template: `%s | ${tenant.name}` } } : {}
}

export default async function TenantLayout({
  children,
  params,
}: LayoutProps<'/tenants/[tenantId]'>) {
  const { tenantId } = await params
  // Postgres の 22P02（invalid input syntax for type uuid）を投げさせない
  if (!isUuid(tenantId)) notFound()

  const [tenant, tenants, user] = await Promise.all([
    getTenant(tenantId),
    listTenants(),
    getAuthUser(),
  ])
  // RLS で他人の店舗も存在しない id も null になる（存在を漏らさない）
  if (!tenant) notFound()

  // 準備中の店舗で描かれるのは初期設定（/setup）だけ（ほかは redirect）。ヘッダーはウィザードが持つので枠を描かない。
  // layout はパスもウィザードの状態も知れず、「あとで続ける」を出し分けられないため（014 §3.7）
  if (!tenant.setup_completed_at) return children

  return (
    <TenantShell
      tenant={{ id: tenant.id, name: tenant.name }}
      tenants={tenants}
      email={user?.email ?? ''}
    >
      {children}
    </TenantShell>
  )
}

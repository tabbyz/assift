import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SetupWizard } from '@/components/setup/SetupWizard'
import { todayJst } from '@/lib/calendar/today'
import { getSetupState, getTenant, listTenants } from '@/lib/queries/tenants'
import { getAuthUser } from '@/utils/auth/current'
import { isUuid } from '@/utils/uuid'
import { deleteTenant } from '../actions'
import { completeSetup, saveSetupPatterns, updateSetupTenant } from './actions'

export const metadata: Metadata = { title: '初期設定' }

/**
 * 初期設定のステップ 2・3（014 §4.2・§4.3）。どのステップから始めるかはデータから決める（保存しない。§3.6）。
 * 完了済みの店舗はシフト表へ（古いタブ・ブックマーク）
 */
export default async function SetupPage({ params }: PageProps<'/tenants/[tenantId]/setup'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない（006 §3.11）
  if (!isUuid(tenantId)) notFound()

  const [tenant, tenants, user] = await Promise.all([
    getTenant(tenantId),
    listTenants(),
    getAuthUser(),
  ])
  if (!tenant) notFound()
  if (tenant.setup_completed_at) redirect(`/tenants/${tenantId}/shifts`)

  const { step, patterns } = await getSetupState(tenantId)

  return (
    <SetupWizard
      mode="resume"
      tenants={tenants}
      email={user?.email ?? ''}
      today={todayJst()}
      tenant={{
        id: tenant.id,
        name: tenant.name,
        shiftCycle: tenant.shift_cycle,
        startOfWeek: tenant.start_of_week,
      }}
      initialStep={step}
      savedPatterns={patterns}
      updateSetupTenant={updateSetupTenant}
      saveSetupPatterns={saveSetupPatterns}
      completeSetup={completeSetup}
      deleteTenant={deleteTenant}
    />
  )
}

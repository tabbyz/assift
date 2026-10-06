import type { Metadata } from 'next'
import { SetupWizard } from '@/components/setup/SetupWizard'
import { todayJst } from '@/lib/calendar/today'
import { listTenants } from '@/lib/queries/tenants'
import { getAuthUser } from '@/utils/auth/current'
import { createTenant } from './actions'

export const metadata: Metadata = { title: '店舗を作成' }

/**
 * 初期設定のステップ 1（014 §4.1）。初めての店舗も追加の店舗も同じ画面。
 * 店舗を作ったら `/tenants/<id>/setup` へ移り、ステップ 2 から続ける
 */
export default async function NewTenantPage() {
  const [tenants, user] = await Promise.all([listTenants(), getAuthUser()])

  return (
    <SetupWizard
      mode="new"
      tenants={tenants}
      email={user?.email ?? ''}
      today={todayJst()}
      // 初回（店舗なし）は戻り先が無い
      canCancel={tenants.length > 0}
      createTenant={createTenant}
    />
  )
}

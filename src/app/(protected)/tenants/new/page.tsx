import type { Metadata } from 'next'
import { SimpleShell } from '@/components/SimpleShell'
import { listTenants } from '@/lib/queries/tenants'
import { NewTenantForm } from './_components/NewTenantForm'

export const metadata: Metadata = { title: '店舗を作成' }

export default async function NewTenantPage() {
  // 初回（店舗なし）は歓迎の文言にし、戻り先が無いのでヘッダーの「店舗へ戻る」も出さない
  const isFirst = (await listTenants()).length === 0

  return (
    <SimpleShell showBackToTenants={!isFirst}>
      <NewTenantForm isFirst={isFirst} />
    </SimpleShell>
  )
}

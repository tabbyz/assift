import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/queries/tenants'
import { isUuid } from '@/utils/uuid'
import { GeneralSettingsClient } from './_components/GeneralSettingsClient'

export const metadata: Metadata = { title: '店舗情報' }

export default async function GeneralSettingsPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/general'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const tenant = await getTenant(tenantId)
  if (!tenant) notFound()

  return (
    <GeneralSettingsClient
      tenantId={tenant.id}
      name={tenant.name}
      shiftCycle={tenant.shift_cycle}
      startOfWeek={tenant.start_of_week}
    />
  )
}

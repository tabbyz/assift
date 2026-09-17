import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/queries/tenants'
import { GeneralSettingsClient } from './_components/GeneralSettingsClient'

export const metadata: Metadata = { title: '店舗情報' }

export default async function GeneralSettingsPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/general'>) {
  const { tenantId } = await params
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

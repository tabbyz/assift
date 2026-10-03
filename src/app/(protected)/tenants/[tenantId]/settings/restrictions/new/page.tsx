import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { listActiveStaffs } from '@/lib/queries/staffs'
import { getTenant } from '@/lib/queries/tenants'
import { restrictionPatternOptions } from '@/lib/restrictions/kinds'
import { isUuid } from '@/utils/uuid'
import { RestrictionForm } from '../_components/RestrictionForm'
import { loadRestrictionFormSearchParams } from '../searchParams'

export const metadata: Metadata = { title: '制約の登録' }

export default async function NewRestrictionPage({
  params,
  searchParams,
}: PageProps<'/tenants/[tenantId]/settings/restrictions/new'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const { staffId, from } = await loadRestrictionFormSearchParams(searchParams)
  const [tenant, patterns, staffs] = await Promise.all([
    getTenant(tenantId),
    listPatterns(tenantId),
    listActiveStaffs(tenantId),
  ])
  if (!tenant) notFound()
  // 制約が対象にできるのは出勤日のパターンだけ（v1 の @tenant.patterns.workday）
  // 新規なので参照中の id は無い = 出勤日のパターンだけ
  const options = restrictionPatternOptions(patterns, null)
  // 在籍でないスタッフ（退職・他店舗・壊れた値）は未選択に落とす
  const initialStaff = staffs.find((staff) => staff.id === staffId) ?? null
  const returnTo = from === 'staff' && initialStaff ? 'staff' : 'list'

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={
          returnTo === 'staff' && initialStaff
            ? {
                href: `/tenants/${tenantId}/settings/staffs/${initialStaff.id}`,
                label: initialStaff.name,
              }
            : { href: `/tenants/${tenantId}/settings/restrictions`, label: '自動アサイン制約' }
        }
        current="制約の登録"
      />
      <Title order={2}>制約の登録</Title>

      <RestrictionForm
        tenantId={tenantId}
        cycle={tenant.shift_cycle}
        staffs={staffs}
        pattern1Options={options}
        pattern2Options={options}
        returnTo={returnTo}
        initialStaffId={initialStaff?.id ?? null}
      />
    </Stack>
  )
}

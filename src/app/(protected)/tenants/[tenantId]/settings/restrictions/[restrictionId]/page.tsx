import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { getRestriction } from '@/lib/queries/restrictions'
import { getStaff, listActiveStaffs } from '@/lib/queries/staffs'
import { getTenant } from '@/lib/queries/tenants'
import { RESTRICTION_DAYS_DEFAULT, restrictionPatternOptions } from '@/lib/restrictions/kinds'
import { isUuid } from '@/utils/uuid'
import { RestrictionEditClient } from '../_components/RestrictionEditClient'
import { RestrictionForm } from '../_components/RestrictionForm'
import { loadRestrictionFormSearchParams } from '../searchParams'

export const metadata: Metadata = { title: '制約の編集' }

export default async function EditRestrictionPage({
  params,
  searchParams,
}: PageProps<'/tenants/[tenantId]/settings/restrictions/[restrictionId]'>) {
  const { tenantId, restrictionId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  if (!isUuid(restrictionId)) notFound()
  const { from } = await loadRestrictionFormSearchParams(searchParams)

  const [tenant, restriction, patterns, staffs] = await Promise.all([
    getTenant(tenantId),
    getRestriction(tenantId, restrictionId),
    listPatterns(tenantId),
    listActiveStaffs(tenantId),
  ])
  if (!tenant || !restriction) notFound()
  // 退職したスタッフの規則は、その人を選択肢の末尾に残す（空欄に見えるのに保存すると退職者のまま、を避ける）。
  // 在籍でないときだけ 1 件引く（退職者を全員は読まない）
  const activeOwner = staffs.find((staff) => staff.id === restriction.staff_id) ?? null
  const retiredOwner =
    restriction.staff_id && !activeOwner ? await getStaff(tenantId, restriction.staff_id) : null
  const staffOptions = retiredOwner
    ? [...staffs, { ...retiredOwner, name: `${retiredOwner.name}（退職済み）` }]
    : staffs

  // 参照中のパターンは「休み」に変えられていても選択肢に残す（残さないと保存できなくなる）。
  // 欄ごとに作る: まとめると片方の休みパターンをもう片方でも新たに選べてしまう
  const pattern1Options = restrictionPatternOptions(patterns, restriction.pattern1_id)
  const pattern2Options = restrictionPatternOptions(patterns, restriction.pattern2_id)
  // 退職したスタッフの規則も、その人の編集画面から開いたらそこへ戻す（編集・削除はできる）
  const owner = activeOwner ?? retiredOwner
  const returnTo = from === 'staff' && owner ? 'staff' : 'list'

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={
          returnTo === 'staff' && owner
            ? { href: `/tenants/${tenantId}/settings/staffs/${owner.id}`, label: owner.name }
            : { href: `/tenants/${tenantId}/settings/restrictions`, label: '自動アサイン制約' }
        }
        current="制約の編集"
      />
      <Title order={2}>制約の編集</Title>

      <RestrictionForm
        tenantId={tenantId}
        cycle={tenant.shift_cycle}
        staffs={staffOptions}
        pattern1Options={pattern1Options}
        pattern2Options={pattern2Options}
        returnTo={returnTo}
        initial={{
          restrictionId: restriction.id,
          kind: restriction.kind,
          hard: restriction.hard,
          staffId: restriction.staff_id,
          pattern1Id: restriction.pattern1_id,
          pattern2Id: restriction.pattern2_id,
          days: restriction.days ?? RESTRICTION_DAYS_DEFAULT,
          wdays: restriction.wdays ?? [],
        }}
      />

      <RestrictionEditClient
        tenantId={tenantId}
        restrictionId={restriction.id}
        returnStaffId={returnTo === 'staff' && owner ? owner.id : null}
      />
    </Stack>
  )
}

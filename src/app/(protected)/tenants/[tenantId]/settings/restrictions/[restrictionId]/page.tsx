import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { getRestriction } from '@/lib/queries/restrictions'
import { RESTRICTION_DAYS_DEFAULT, restrictionPatternOptions } from '@/lib/restrictions/kinds'
import { isUuid } from '@/utils/uuid'
import { RestrictionEditClient } from '../_components/RestrictionEditClient'
import { RestrictionForm } from '../_components/RestrictionForm'

export const metadata: Metadata = { title: '制約の編集' }

export default async function EditRestrictionPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/restrictions/[restrictionId]'>) {
  const { tenantId, restrictionId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  if (!isUuid(restrictionId)) notFound()

  const [restriction, patterns] = await Promise.all([
    getRestriction(tenantId, restrictionId),
    listPatterns(tenantId),
  ])
  if (!restriction) notFound()

  // 参照中のパターンは「休み」に変えられていても選択肢に残す（残さないと保存できなくなる）。
  // 欄ごとに作る: まとめると片方の休みパターンをもう片方でも新たに選べてしまう
  const pattern1Options = restrictionPatternOptions(patterns, restriction.pattern1_id)
  const pattern2Options = restrictionPatternOptions(patterns, restriction.pattern2_id)

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={{ href: `/tenants/${tenantId}/settings/restrictions`, label: '制約一覧' }}
        current="制約の編集"
      />
      <Title order={2}>制約の編集</Title>

      <RestrictionForm
        tenantId={tenantId}
        kind={restriction.kind}
        pattern1Options={pattern1Options}
        pattern2Options={pattern2Options}
        initial={{
          restrictionId: restriction.id,
          pattern1Id: restriction.pattern1_id,
          pattern2Id: restriction.pattern2_id,
          days: restriction.days ?? RESTRICTION_DAYS_DEFAULT,
        }}
      />

      <RestrictionEditClient tenantId={tenantId} restrictionId={restriction.id} />
    </Stack>
  )
}

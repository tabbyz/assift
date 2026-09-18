import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { restrictionPatternOptions } from '@/lib/restrictions/kinds'
import { isUuid } from '@/utils/uuid'
import { KindSelector } from '../_components/KindSelector'
import { RestrictionForm } from '../_components/RestrictionForm'
import { loadNewRestrictionSearchParams } from './searchParams'

export const metadata: Metadata = { title: '制約の登録' }

export default async function NewRestrictionPage({
  params,
  searchParams,
}: PageProps<'/tenants/[tenantId]/settings/restrictions/new'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const { kind } = await loadNewRestrictionSearchParams(searchParams)
  const patterns = await listPatterns(tenantId)
  // 制約が対象にできるのは出勤日のパターンだけ（v1 の @tenant.patterns.workday）
  // 新規なので参照中の id は無い = 出勤日のパターンだけ
  const options = restrictionPatternOptions(patterns, null)

  const listHref = `/tenants/${tenantId}/settings/restrictions`

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={{ href: listHref, label: '制約一覧' }}
        current={kind ? '制約の登録' : '制約タイプを選択'}
      />
      <Title order={2}>{kind ? '制約の登録' : '制約タイプを選択'}</Title>

      {kind ? (
        <RestrictionForm
          tenantId={tenantId}
          kind={kind}
          pattern1Options={options}
          pattern2Options={options}
        />
      ) : (
        <KindSelector tenantId={tenantId} workdayPatternCount={options.length} />
      )}
    </Stack>
  )
}

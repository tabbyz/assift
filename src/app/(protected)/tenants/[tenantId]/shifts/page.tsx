import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container, Stack, Text, Title } from '@mantine/core'
import { getTenant } from '@/lib/queries/tenants'
import { isUuid } from '@/utils/uuid'

export const metadata: Metadata = { title: 'シフト表' }

// 仮ページ。007 で本実装（期間計算・カレンダー・アサイン）に置き換える
export default async function ShiftsPage({ params }: PageProps<'/tenants/[tenantId]/shifts'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を throw する（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const tenant = await getTenant(tenantId)
  if (!tenant) notFound()

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={2}>シフト表</Title>
        <Text c="dimmed">{tenant.name} のシフト表はマイルストーン 007 で実装します。</Text>
      </Stack>
    </Container>
  )
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { RestrictionRows } from '@/components/restrictions/RestrictionRows'
import { listPatterns } from '@/lib/queries/patterns'
import { listRestrictions } from '@/lib/queries/restrictions'
import { listActiveStaffs, listRetiredStaffs } from '@/lib/queries/staffs'
import { getTenant } from '@/lib/queries/tenants'
import { toRestrictionRowView } from '@/lib/restrictions/rowView'
import { isUuid } from '@/utils/uuid'
import { groupRestrictions } from './_lib/groupRestrictions'

export const metadata: Metadata = { title: '自動アサイン制約' }

export default async function RestrictionsPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/restrictions'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const [tenant, restrictions, patterns, activeStaffs, retiredStaffs] = await Promise.all([
    getTenant(tenantId),
    listRestrictions(tenantId),
    listPatterns(tenantId),
    listActiveStaffs(tenantId),
    listRetiredStaffs(tenantId),
  ])
  if (!tenant) notFound()

  const options = {
    tenantId,
    patternNames: new Map(patterns.map((pattern) => [pattern.id, pattern.name])),
    cycle: tenant.shift_cycle,
    activeStaffs,
  }
  const grouped = groupRestrictions(restrictions, activeStaffs, retiredStaffs)

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={2}>自動アサイン制約</Title>
          <LinkButton
            href={`/tenants/${tenantId}/settings/restrictions/new`}
            size="sm"
            leftSection={<IconPlus size={16} />}
          >
            制約を追加
          </LinkButton>
        </Group>
        <Text size="sm" c="dimmed">
          「必須」は必ず守ります。「なるべく」は守れないときは破ります。
        </Text>
      </Stack>

      <Stack gap="xs">
        <GroupHeading title="店舗全体" count={`${grouped.tenantWide.length} 件 · 全員に適用`} />
        <Paper withBorder>
          {grouped.tenantWide.length === 0 ? (
            <EmptyRow />
          ) : (
            <RestrictionRows
              rows={grouped.tenantWide.map((row) => toRestrictionRowView(row, options))}
            />
          )}
        </Paper>
      </Stack>

      <Stack gap="xs">
        <GroupHeading
          title="スタッフ別"
          count={`${grouped.byStaffCount} 件 · ${grouped.byStaff.length} 人`}
        />
        <Paper withBorder>
          {grouped.byStaff.length === 0 ? (
            <EmptyRow />
          ) : (
            <Stack gap={0}>
              {grouped.byStaff.map((group, index) => (
                <Stack key={group.staff.id} gap={0}>
                  <Group
                    gap="xs"
                    px="md"
                    pt="sm"
                    pb={4}
                    bg="gray.0"
                    style={
                      index > 0
                        ? { borderTop: '1px solid var(--mantine-color-default-border)' }
                        : undefined
                    }
                  >
                    <Text size="xs" fw={700} c="dimmed">
                      {group.staff.name}
                    </Text>
                    {group.retired && (
                      <Badge variant="light" color="gray" size="xs">
                        退職済み
                      </Badge>
                    )}
                  </Group>
                  <RestrictionRows
                    rows={group.restrictions.map((row) => toRestrictionRowView(row, options))}
                  />
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>

      <Text size="xs" c="dimmed">
        勤務できる曜日・選択可能な勤務パターン・週の最大勤務日数は、各スタッフの編集画面で設定します（常に必須）。
      </Text>
    </Stack>
  )
}

function GroupHeading({ title, count }: { title: string; count: string }) {
  return (
    <Group gap="xs" align="baseline">
      <Title order={4}>{title}</Title>
      <Text size="xs" c="dimmed">
        {count}
      </Text>
    </Group>
  )
}

function EmptyRow() {
  return (
    <Text size="sm" c="dimmed" px="md" py="sm">
      まだありません
    </Text>
  )
}

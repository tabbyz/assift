import { Group, Paper, Stack, Text, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { LinkAnchor } from '@/components/LinkAnchor'
import { LinkButton } from '@/components/LinkButton'
import { RestrictionRows } from '@/components/restrictions/RestrictionRows'
import type { RestrictionRowView } from '@/lib/restrictions/rowView'

type Props = {
  tenantId: string
  staffId: string
  rows: RestrictionRowView[]
  /** 店舗全体の規則の件数（この人にも効く） */
  tenantWideCount: number
  /**
   * 退職済み。規則の追加を出さない: 登録画面は在籍スタッフしか対象に選べないので、開くと「店舗全体」のまま保存されうる。
   * 既存の規則の編集・削除はできる（編集画面は退職者を選択肢に残す）
   */
  retired: boolean
}

/**
 * スタッフの編集画面の「この人の規則」（013 §4.3）。
 *
 * フォームの外に置く（013 §3.6）: フォームの中に置くと、入力途中で「規則を追加」を押したときに未保存の入力が遷移で消える。
 * 追加・編集は制約の登録画面へ飛び、保存したらここへ戻る（`?from=staff`）。
 */
export function StaffRestrictionsPanel({
  tenantId,
  staffId,
  rows,
  tenantWideCount,
  retired,
}: Props) {
  return (
    <Paper withBorder>
      <Stack gap={0}>
        <Group justify="space-between" px="lg" pt="md" pb="sm">
          <Stack gap={2}>
            <Title order={4}>この人の規則</Title>
            <Text size="xs" c="dimmed">
              {retired
                ? '退職済みのため自動アサインでは使われません。在籍中に戻すと、また効きます。'
                : '自動アサインで、この人にだけ効く規則です。'}
            </Text>
          </Stack>
          {!retired && (
            <LinkButton
              href={`/tenants/${tenantId}/settings/restrictions/new?staffId=${staffId}&from=staff`}
              size="xs"
              variant="default"
              leftSection={<IconPlus size={14} />}
            >
              規則を追加
            </LinkButton>
          )}
        </Group>

        {rows.length === 0 ? (
          <Text size="sm" c="dimmed" px="lg" pb="md">
            まだありません
          </Text>
        ) : (
          <RestrictionRows rows={rows} />
        )}

        {tenantWideCount > 0 && (
          <Text size="xs" c="dimmed" px="lg" py="sm" bg="gray.0">
            店舗全体の制約（{tenantWideCount} 件）もこの人に適用されます。
            <LinkAnchor href={`/tenants/${tenantId}/settings/restrictions`} size="xs" ml={4}>
              一覧を見る
            </LinkAnchor>
          </Text>
        )}
      </Stack>
    </Paper>
  )
}

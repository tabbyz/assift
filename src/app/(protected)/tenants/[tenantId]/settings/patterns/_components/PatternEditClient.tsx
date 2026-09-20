'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { deletePattern } from '../actions'

/** 編集画面の下に置く削除パネル（v1 の「勤務パターンを削除」） */
export function PatternEditClient({
  tenantId,
  patternId,
}: {
  tenantId: string
  patternId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: '勤務パターンを削除',
      children: (
        <Stack gap="xs">
          <Text size="sm">本当に削除しますか？この操作は取り消せません。</Text>
          <Text size="sm" c="dimmed">
            このパターンのシフト・必要人数・自動アサイン制約も削除されます。
          </Text>
        </Stack>
      ),
      labels: { confirm: '削除する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        startTransition(async () => {
          const result = await deletePattern({ tenantId, patternId })
          if (!result.ok) {
            notifications.show({ message: result.error, color: 'red' })
            return
          }
          notifications.show({ message: '削除しました', color: 'green' })
          router.push(result.data.redirectTo)
        }),
    })

  return (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={4}>勤務パターンを削除</Title>
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            削除すると、この勤務パターンに関連するすべてのデータが削除されます。
          </Text>
          <Text size="sm" c="red">
            この操作は元には戻せません。
          </Text>
        </Stack>
        <Group>
          <Button color="red" variant="outline" onClick={confirmDelete} loading={isPending}>
            削除する
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}

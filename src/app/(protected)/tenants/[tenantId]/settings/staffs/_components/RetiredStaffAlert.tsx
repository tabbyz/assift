'use client'

import { useTransition } from 'react'
import { Alert, Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { restoreStaff } from '../actions'

/** 退職者の編集画面の上に出す帯（v1 の notification.is-warning） */
export function RetiredStaffAlert({ tenantId, staffId }: { tenantId: string; staffId: string }) {
  const [isPending, startTransition] = useTransition()

  const restore = () =>
    startTransition(async () => {
      const result = await restoreStaff({ tenantId, staffId })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      notifications.show({ message: '在籍中に戻しました', color: 'green' })
    })

  return (
    <Alert color="yellow" variant="light">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm">このスタッフは退職済みです。</Text>
        <Button size="xs" variant="white" color="yellow" onClick={restore} loading={isPending}>
          在籍中に戻す
        </Button>
      </Group>
    </Alert>
  )
}

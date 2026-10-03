'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { deleteRestriction } from '../actions'

/** v1 は編集画面の左下に「制約を削除」のテキストリンクを置いていた */
export function RestrictionEditClient({
  tenantId,
  restrictionId,
  returnStaffId,
}: {
  tenantId: string
  restrictionId: string
  /** 開いた元のスタッフの画面（null = 制約ページ） */
  returnStaffId: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: '制約を削除',
      children: <Text size="sm">本当に削除しますか？この操作は取り消せません。</Text>,
      labels: { confirm: '削除する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        startTransition(async () => {
          const result = await deleteRestriction({ tenantId, restrictionId, returnStaffId })
          if (!result.ok) {
            notifications.show({ message: result.error, color: 'red' })
            return
          }
          notifications.show({ message: '削除しました', color: 'green' })
          router.push(result.data.redirectTo)
        }),
    })

  return (
    <Group>
      <Button variant="subtle" color="red" onClick={confirmDelete} loading={isPending}>
        制約を削除
      </Button>
    </Group>
  )
}

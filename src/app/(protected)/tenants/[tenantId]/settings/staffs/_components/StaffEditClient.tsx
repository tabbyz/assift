'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Divider, Group, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { SettingsSection } from '@/components/SettingsSection'
import { deleteStaff, restoreStaff, retireStaff } from '../actions'

type Props = {
  tenantId: string
  staffId: string
  retired: boolean
}

/** 編集画面の下に置く「退職処理」パネル（v1 と同じ構成） */
export function StaffEditClient({ tenantId, staffId, retired }: Props) {
  const router = useRouter()
  const [isRetiring, startRetire] = useTransition()
  const [isDeleting, startDelete] = useTransition()

  // 退職・復帰は取り消せるので確認モーダルなし（v1 も無し。006 §3.6）
  const toggleRetired = () =>
    startRetire(async () => {
      const result = retired
        ? await restoreStaff({ tenantId, staffId })
        : await retireStaff({ tenantId, staffId })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      notifications.show({
        message: retired ? '在籍中に戻しました' : '退職済みにしました',
        color: 'green',
      })
    })

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'スタッフを削除',
      children: (
        <Stack gap="xs">
          <Text size="sm">本当に削除しますか？この操作は取り消せません。</Text>
          <Text size="sm" c="dimmed">
            このスタッフのシフトと規則も削除されます。
          </Text>
        </Stack>
      ),
      labels: { confirm: '削除する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        startDelete(async () => {
          const result = await deleteStaff({ tenantId, staffId })
          if (!result.ok) {
            notifications.show({ message: result.error, color: 'red' })
            return
          }
          notifications.show({ message: '削除しました', color: 'green' })
          router.push(result.data.redirectTo)
        }),
    })

  return (
    <SettingsSection title="退職処理">
      <Stack gap="md">
        {!retired && (
          <>
            <Stack gap={4}>
              <Text size="sm" fw={700}>
                スタッフを退職済みにする
              </Text>
              <Text size="sm" c="dimmed">
                退職済みにすると、シフト表に表示されなくなります。
                <br />
                この操作はいつでも元に戻せます。
              </Text>
            </Stack>
            <Group>
              <Button color="dark" variant="outline" onClick={toggleRetired} loading={isRetiring}>
                退職済みにする
              </Button>
            </Group>
            <Divider />
          </>
        )}

        <Stack gap={4}>
          <Text size="sm" fw={700}>
            スタッフを削除
          </Text>
          <Text size="sm" c="dimmed">
            削除すると、このスタッフに関連するすべてのデータが削除されます。
          </Text>
          <Text size="sm" c="red">
            この操作は元には戻せません。
          </Text>
        </Stack>
        <Group>
          <Button color="red" variant="outline" onClick={confirmDelete} loading={isDeleting}>
            削除する
          </Button>
        </Group>
      </Stack>
    </SettingsSection>
  )
}

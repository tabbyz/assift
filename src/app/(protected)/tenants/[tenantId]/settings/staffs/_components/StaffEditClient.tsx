'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Button, Collapse, Divider, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconChevronDown } from '@tabler/icons-react'
import { SettingsSection } from '@/components/SettingsSection'
import { openStaffLimitModal } from '@/components/billing/StaffLimitModal'
import { deleteStaff, restoreStaff, retireStaff } from '../actions'

type Props = {
  tenantId: string
  staffId: string
  retired: boolean
}

/** 編集画面の下に置く「退職処理」パネル（v1 と同じ構成） */
export function StaffEditClient({ tenantId, staffId, retired }: Props) {
  const router = useRouter()
  // めったに使わない取り消せない操作なので、毎回たたんだ状態で始める（開いた状態は覚えない）
  const [opened, { toggle }] = useDisclosure(false)
  const [isRetiring, startRetire] = useTransition()
  const [isDeleting, startDelete] = useTransition()

  // 退職・復帰は取り消せるので確認モーダルなし（v1 も無し。006 §3.6）
  const toggleRetired = () =>
    startRetire(async () => {
      const result = retired
        ? await restoreStaff({ tenantId, staffId })
        : await retireStaff({ tenantId, staffId })
      if (!result.ok) {
        // 在籍の上限（019 §5.3）。トライアルを始めたらそのまま復帰をやり直す
        if (result.code === 'staff_limit')
          return openStaffLimitModal({ onTrialStarted: toggleRetired })
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

  // 開いたら、開閉の行が最初の項目の見出しを兼ねる（同じ見出しを 2 行続けて出さない）
  const toggleLabel = opened
    ? retired
      ? 'スタッフを削除'
      : 'スタッフを退職済みにする'
    : retired
      ? 'スタッフを削除する'
      : '退職済みにする・削除する'

  return (
    <SettingsSection title="退職処理" padded={false}>
      <UnstyledButton
        onClick={toggle}
        aria-expanded={opened}
        aria-controls="staff-retire-panel"
        w="100%"
        px="lg"
        pt="md"
        // 開いたときは見出しの直下に説明文が続くので、見出しと説明の間隔（4px）に詰める
        pb={opened ? 4 : 'md'}
      >
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={opened ? 700 : undefined}>
            {toggleLabel}
          </Text>
          <IconChevronDown
            size={16}
            style={{
              transform: opened ? 'rotate(180deg)' : undefined,
              transition: 'transform 150ms ease',
            }}
          />
        </Group>
      </UnstyledButton>
      <Collapse expanded={opened}>
        <Box id="staff-retire-panel" px="lg" pb="lg">
          <Stack gap="md">
            {!retired && (
              <>
                <Text size="sm" c="dimmed">
                  退職済みにすると、シフト表に表示されなくなります。
                  <br />
                  この操作はいつでも元に戻せます。
                </Text>
                <Group>
                  <Button
                    color="dark"
                    variant="outline"
                    onClick={toggleRetired}
                    loading={isRetiring}
                  >
                    退職済みにする
                  </Button>
                </Group>
                <Divider />
              </>
            )}

            <Stack gap={4}>
              {/* 退職済みのときは開閉の行が「スタッフを削除」の見出しを兼ねる */}
              {!retired && (
                <Text size="sm" fw={700}>
                  スタッフを削除
                </Text>
              )}
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
        </Box>
      </Collapse>
    </SettingsSection>
  )
}

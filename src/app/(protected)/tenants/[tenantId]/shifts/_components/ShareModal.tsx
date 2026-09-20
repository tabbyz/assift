'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  CopyButton,
  Group,
  List,
  ListItem,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { formatMonthDay, formatYearMonthDay } from '@/lib/calendar/dateString'
import { formatJstDateTime } from '@/lib/calendar/datetime'
import type { DateRange } from '@/lib/calendar/dateRange'
import { isShareEnabled, SHARE_GRACE_DAYS } from '@/lib/shares/expiry'
import { SHARE_EXPIRED_MESSAGE } from '@/lib/validation/shares'
import { createShare, deleteShare } from '../actions'
import { failure } from '../_lib/notices'

/** 一覧の 1 行。URL は Server（`page.tsx`）が `requestOrigin()` で組んだ絶対 URL */
export type ShareItem = {
  id: string
  url: string
  startDate: string
  endDate: string
  createdAt: string
}

type Props = {
  tenantId: string
  range: DateRange
  /** JST の今日（Server から渡す。端末の TZ で判定しない。009 §3.2） */
  today: string
  shares: { enabled: ShareItem[]; expired: ShareItem[] }
  onClose: () => void
}

function term(startDate: string, endDate: string): string {
  return `${formatYearMonthDay(startDate)}〜${formatMonthDay(endDate)}`
}

/**
 * URL 共有（v1 `shares/_index.html.slim`）。発行・一覧・解除をこのモーダルで完結させる。
 *
 * 一覧は Server が読んで props で渡す（009 §3.1）。発行・解除は `refresh()` なので、
 * モーダルを開いたまま props が入れ替わって一覧が更新される。
 */
export function ShareModal({ tenantId, range, today, shares, onClose }: Props) {
  const router = useRouter()
  const [isCreating, startCreate] = useTransition()
  const [isDeleting, startDelete] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const expired = !isShareEnabled(range.end, today)

  const create = () =>
    startCreate(async () => {
      const result = await createShare({ tenantId, start: range.start, end: range.end })
      if (!result.ok) {
        notifications.show(failure(result.error))
        // 失敗の主因はこの画面が古いこと（別タブでの削除、日付が変わって期限切れになった）。
        // 読み直せば一覧と発行ボタンの可否が現在の状態に戻る（007 / 008 と同じ作法）
        router.refresh()
        return
      }
      notifications.show({ message: '共有用URLを取得しました', color: 'green' })
    })

  const remove = (share: ShareItem) =>
    modals.openConfirmModal({
      title: '共有解除',
      children: <Text size="sm">シフト表の共有を解除しますか？</Text>,
      labels: { confirm: '解除する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        setDeletingId(share.id)
        startDelete(async () => {
          // finally で必ず解く: Action の呼び出し自体が失敗（オフライン、デプロイ跨ぎ）すると
          // await が投げるので、成功パスだけで解くとその行が永久に loading のままになる
          try {
            const result = await deleteShare({ tenantId, shareId: share.id })
            if (!result.ok) {
              notifications.show(failure(result.error))
              // 別タブで解除済みの行が一覧に残っている状態。読み直して消す
              router.refresh()
              return
            }
            notifications.show({ message: '共有を解除しました', color: 'green' })
          } finally {
            setDeletingId(null)
          }
        })
      },
    })

  const row = (share: ShareItem, onRemove?: () => void) => (
    <Paper key={share.id} withBorder p="xs">
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {term(share.startDate, share.endDate)}
        </Text>
        <Group gap={4} wrap="nowrap" align="center">
          {/* スマホ幅でも URL が全文見えるように折り返す。コピーが効かない環境では選択して渡せる */}
          <Anchor
            href={share.url}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            style={{ wordBreak: 'break-all' }}
          >
            {share.url}
          </Anchor>
          <CopyButton value={share.url} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'コピーしました' : 'URLをコピー'} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  aria-label="URLをコピー"
                  onClick={copy}
                >
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed">
            {formatJstDateTime(share.createdAt)} に取得
          </Text>
          {onRemove && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              loading={isDeleting && deletingId === share.id}
              // 1 件ずつ解除する。実行中に別の行を押すと deletingId が移り、
              // 先の行が押せる見た目に戻って二重に解除してしまう（2 回目は「共有が見つかりません」）
              disabled={isDeleting}
              onClick={onRemove}
            >
              共有解除
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  )

  return (
    <Modal opened onClose={onClose} title="URLでシフト表を共有" size="md">
      <Stack gap="md">
        <Stack gap="xs">
          <Text size="sm">シフト期間：{term(range.start, range.end)}</Text>
          <Button onClick={create} loading={isCreating} disabled={expired} fullWidth>
            {expired ? SHARE_EXPIRED_MESSAGE : '共有用URLを取得'}
          </Button>
        </Stack>

        <Alert variant="light" color="teal" p="xs">
          <List size="xs" spacing={4}>
            <ListItem>URLを知っている人は誰でもアクセスできます（assiftアカウントも不要）</ListItem>
            <ListItem>URL共有後に変更したシフトの内容もリアルタイムに反映されます</ListItem>
            <ListItem>
              URLはシフト期間終了日の{SHARE_GRACE_DAYS + 1}日後に自動で無効になります
            </ListItem>
          </List>
        </Alert>

        <Stack gap="xs">
          <Title order={2} size="h6">
            共有中のシフト表
          </Title>
          {shares.enabled.length === 0 ? (
            <Text size="sm" c="dimmed">
              共有中のシフト表はありません
            </Text>
          ) : (
            shares.enabled.map((share) => row(share, () => remove(share)))
          )}
        </Stack>

        {shares.expired.length > 0 && (
          <Stack gap="xs">
            <Title order={2} size="h6">
              公開期限が過ぎたシフト表
            </Title>
            {/* 期限切れは解除できない（v1 と同じ。URL は既に無効） */}
            {shares.expired.map((share) => row(share))}
          </Stack>
        )}
      </Stack>
    </Modal>
  )
}

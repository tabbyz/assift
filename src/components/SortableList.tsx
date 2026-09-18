'use client'

import { type ReactNode, useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionIcon, Group, Table, TableTbody, TableTd, TableTr, Text, Paper } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react'
import type { ActionResult } from '@/lib/actions/result'
import { moveItem } from '@/lib/ordering/move'

type Props<T> = {
  items: T[]
  getId: (item: T) => string
  /** 行の中身（名前・説明など）。上下ボタンと編集リンクの列はこのコンポーネントが描く */
  renderItem: (item: T) => ReactNode
  /** 行の右端（「編集」リンクなど） */
  renderActions?: (item: T) => ReactNode
  /** 並べ替えできる一覧のときだけ渡す。省略すると上下ボタンを出さない（退職タブなど） */
  onReorder?: (ids: string[]) => Promise<ActionResult>
  /** 0 件のときの文言 */
  emptyMessage: string
}

/**
 * 上下ボタンで並べ替えられる一覧（v1 の acts_as_list + sort ボタン）。
 * スタッフ / 勤務パターン / 自動アサイン制約の 3 画面で使う。
 *
 * 並びは `useOptimistic` で即時に動かす。Action が失敗しても transition が終われば
 * Server から渡った props（変わっていない並び）に戻るので、通知だけ出す（006 §5.4）。
 */
export function SortableList<T>({
  items,
  getId,
  renderItem,
  renderActions,
  onReorder,
  emptyMessage,
}: Props<T>) {
  const router = useRouter()
  const [optimisticItems, setOptimisticItems] = useOptimistic(items)
  const [isPending, startTransition] = useTransition()

  if (items.length === 0) {
    return (
      <Paper withBorder p="lg">
        <Text c="dimmed">{emptyMessage}</Text>
      </Paper>
    )
  }

  const move = (index: number, delta: number) => {
    if (!onReorder) return
    const next = moveItem(optimisticItems, index, delta)
    startTransition(async () => {
      setOptimisticItems(next)
      const result = await onReorder(next.map(getId))
      if (!result.ok) {
        notifications.show({ message: '並び順を変更できませんでした', color: 'red' })
        // 失敗の主因は「別タブで消された行を送った」= この画面が古いこと。
        // 楽観更新は transition 終了で戻るが、消えた行は残ったままなので読み直す
        router.refresh()
      }
    })
  }

  const last = optimisticItems.length - 1
  // 1 件だけのときは動かしようがないので、ボタン自体を出さない（v1 と同じ）
  const sortable = Boolean(onReorder) && optimisticItems.length > 1

  return (
    <Paper withBorder>
      <Table>
        <TableTbody>
          {optimisticItems.map((item, index) => (
            <TableTr key={getId(item)}>
              <TableTd>{renderItem(item)}</TableTd>
              {/* w={1} で内容ぴったりに縮める。折り返すと「編集」が 2 行になるので nowrap */}
              <TableTd w={1} style={{ whiteSpace: 'nowrap' }}>
                <Group gap="xs" wrap="nowrap" justify="flex-end">
                  {sortable && (
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon
                        variant="default"
                        aria-label="上へ"
                        disabled={index === 0 || isPending}
                        onClick={() => move(index, -1)}
                      >
                        <IconArrowUp size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="default"
                        aria-label="下へ"
                        disabled={index === last || isPending}
                        onClick={() => move(index, 1)}
                      >
                        <IconArrowDown size={16} />
                      </ActionIcon>
                    </Group>
                  )}
                  {renderActions?.(item)}
                </Group>
              </TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>
    </Paper>
  )
}

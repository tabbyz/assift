'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconInfoCircle } from '@tabler/icons-react'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { formatMonthDay, wday } from '@/lib/calendar/dateString'
import { REQUIRED_NUM_MAX, REQUIRED_NUM_MIN } from '@/lib/patterns/requiredNums'
import type { RequiredNum } from '@/lib/shifts/requiredNums'
import { saveRequiredNums } from '../actions'

/** 出勤日のパターン 1 件分。モーダルが必要とする値だけ */
export type RequiredNumRowInput = {
  patternId: string
  name: string
  /** 解決後の必要人数。`null` は「まだ決めていない」（015 §3.2） */
  required: RequiredNum
  /** その曜日 / 祝日の基本の人数。`null` なら基本も決まっていない */
  defaultNum: RequiredNum
  /** この日だけ変えてある（`required_nums` に行がある）か */
  overridden: boolean
  /** アサイン済み人数 */
  assigned: number
}

type Props = {
  tenantId: string
  date: string
  rows: RequiredNumRowInput[]
  onClose: () => void
}

/** 日別の必要人数（v1 `required_nums/_edit.html.slim`） */
export function RequiredNumModal({ tenantId, date, rows, onClose }: Props) {
  const router = useRouter()
  // 入力値だけを持つ。**どのパターンを送るかは `rows`（Server の props）が決める**。
  // こうしておくと、別タブでパターンが削除されて読み直したあとの再保存で、
  // 消えたパターンを送り続けずに他の入力値を保てる
  const [nums, setNums] = useState<Record<string, number | ''>>({})
  const [isPending, startTransition] = useTransition()

  const valueOf = (row: RequiredNumRowInput): number | '' =>
    nums[row.patternId] ?? row.required ?? ''

  /** 「基本に戻す」= この日の上書きを消す。空欄で保存すると行が消える（015 §3.2） */
  const clear = (patternId: string) => setNums((current) => ({ ...current, [patternId]: '' }))

  const submit = () =>
    startTransition(async () => {
      const payload = Object.fromEntries(rows.map((row) => [row.patternId, valueOf(row)]))
      const result = await saveRequiredNums({ tenantId, date, nums: payload })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        // 失敗の主因は「別タブで勤務パターンが消された」= この画面が古いこと（006 §10.8 と同じ）。
        // 読み直すと消えたパターンの行が落ち、もう一度保存すれば通る
        router.refresh()
        return
      }
      notifications.show({ message: '更新しました', color: 'green' })
      onClose()
    })

  return (
    <Modal
      opened
      onClose={onClose}
      title={`${formatMonthDay(date)} (${WEEKDAY_LABELS[wday(date)]})`}
      size="sm"
    >
      <Stack gap="md">
        <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} p="xs">
          <Text size="xs">
            ここで入れた数は<strong>この日だけ</strong>に効きます。空欄にすると基本の人数に戻ります。基本の人数は
            <Anchor component={Link} href={`/tenants/${tenantId}/settings/patterns`} size="xs">
              勤務パターン設定画面
            </Anchor>
            で変えられます
          </Text>
        </Alert>

        {rows.length === 0 ? (
          <Text c="dimmed" size="sm">
            勤務日のパターンが登録されていません
          </Text>
        ) : (
          <Table withTableBorder withColumnBorders>
            <TableThead>
              <TableTr>
                <TableTh />
                <TableTh ta="center" w="30%">
                  必要人数
                </TableTh>
                <TableTh ta="center" w="30%">
                  アサイン済
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {rows.map((row) => (
                <TableTr key={row.patternId}>
                  <TableTd ta="right">
                    <Stack gap={2} align="flex-end">
                      <Text size="sm">{row.name}</Text>
                      {row.overridden && (
                        <Group gap={4} wrap="nowrap">
                          <Badge size="xs" variant="light" color="yellow">
                            この日だけ変更
                          </Badge>
                          <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            onClick={() => clear(row.patternId)}
                            disabled={isPending}
                          >
                            基本{row.defaultNum === null ? '' : ` ${row.defaultNum} 人`}に戻す
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  </TableTd>
                  <TableTd p={4}>
                    <NumberInput
                      aria-label={`${row.name} の必要人数`}
                      value={valueOf(row)}
                      placeholder={row.defaultNum === null ? '—' : String(row.defaultNum)}
                      onChange={(value) =>
                        setNums((current) => ({
                          ...current,
                          [row.patternId]: value === '' ? '' : Number(value),
                        }))
                      }
                      min={REQUIRED_NUM_MIN}
                      max={REQUIRED_NUM_MAX}
                      clampBehavior="strict"
                      allowDecimal={false}
                      allowNegative={false}
                      hideControls
                      size="sm"
                      styles={{ input: { textAlign: 'center', paddingInline: 4 } }}
                    />
                  </TableTd>
                  <TableTd ta="center">{row.assigned}</TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={isPending}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={isPending} disabled={rows.length === 0}>
            必要人数を保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

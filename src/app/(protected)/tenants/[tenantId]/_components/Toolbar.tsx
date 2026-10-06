'use client'

import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Popover,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { IconChevronLeft, IconChevronRight, IconSparkles } from '@tabler/icons-react'
import type { BulkKind } from '../_lib/bulkOperations'
import { ShareMenu } from './ShareMenu'
import { ToolsMenu, type AssistUndo } from './ToolsMenu'
import { ToolbarButton } from './ToolbarButton'
import { SHIFT_CYCLE_LABELS, type ShiftCycle } from '@/lib/calendar/shiftCycle'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { formatPeriodTitle } from '@/lib/calendar/periodTitle'
import type { DateRange } from '@/lib/calendar/dateRange'

type Props = {
  tenantId: string
  cycle: ShiftCycle
  startOfWeek: number
  range: DateRange
  onPrev: () => void
  onNext: () => void
  onPickStart: (start: string) => void
  onOpenShare: () => void
  onBulk: (kind: BulkKind) => void
  onSetDefaultPatterns: () => void
  onResetRequiredNums: () => void
  resetRequiredNumsCount: number
  onOpenCopy: () => void
  /** 自動アサイン（012 §4.1）。キーが無ければ「現在利用できません」 */
  assistAvailable: boolean
  onOpenAssist: () => void
  assistUndo: AssistUndo | null
  disabled: boolean
}

/**
 * 期間はタイトル。見える動詞は AI で作成・共有・操作。操作は一括 → デフォルト → コピー。集計は表の左上。
 * 面は日付ヘッダーと同じ gray-0。店舗ヘッダー（白）との段差が、店とこの表の境目になる。
 */
export function Toolbar({
  tenantId,
  cycle,
  startOfWeek,
  range,
  onPrev,
  onNext,
  onPickStart,
  onOpenShare,
  onBulk,
  onSetDefaultPatterns,
  onResetRequiredNums,
  resetRequiredNumsCount,
  onOpenCopy,
  assistAvailable,
  onOpenAssist,
  assistUndo,
  disabled,
}: Props) {
  const [opened, setOpened] = useState(false)
  const [draft, setDraft] = useState<string | null>(range.start)

  const apply = () => {
    if (draft) onPickStart(draft)
    setOpened(false)
  }

  return (
    <Group justify="space-between" wrap="nowrap" p={8} bg="gray.0">
      <Group gap={4} wrap="nowrap">
        <ActionIcon
          variant="default"
          size={28}
          aria-label="前の期間"
          onClick={onPrev}
          disabled={disabled}
        >
          <IconChevronLeft size={16} />
        </ActionIcon>

        <Popover
          opened={opened}
          onChange={setOpened}
          position="bottom-start"
          shadow="md"
          width={300}
        >
          <Popover.Target>
            <UnstyledButton
              px={6}
              py={4}
              onClick={() => {
                setDraft(range.start)
                setOpened((current) => !current)
              }}
              aria-label="表示期間を変更"
              disabled={disabled}
            >
              <Text fw={650} size="md" lh={1.2}>
                {formatPeriodTitle(cycle, range)}
              </Text>
            </UnstyledButton>
          </Popover.Target>

          <Popover.Dropdown>
            <Stack gap="sm">
              <div>
                <Text size="xs" c="dimmed">
                  シフト表の作成周期
                </Text>
                <Group gap="xs">
                  <Text size="sm">{SHIFT_CYCLE_LABELS[cycle]}</Text>
                  {(cycle === 'week' || cycle === 'two_week') && (
                    <Text size="sm" c="dimmed">
                      ({WEEKDAY_LABELS[startOfWeek]}曜日始まり)
                    </Text>
                  )}
                  <Anchor component={Link} href={`/tenants/${tenantId}/settings/general`} size="sm">
                    変更
                  </Anchor>
                </Group>
              </div>

              <Group align="flex-end" gap="xs" wrap="nowrap">
                <DateInput
                  label="開始日"
                  value={draft}
                  onChange={setDraft}
                  popoverProps={{ withinPortal: false }}
                  clearable={false}
                  flex={1}
                />
                <Button onClick={apply} disabled={!draft}>
                  更新
                </Button>
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>

        <ActionIcon
          variant="default"
          size={28}
          aria-label="次の期間"
          onClick={onNext}
          disabled={disabled}
        >
          <IconChevronRight size={16} />
        </ActionIcon>
      </Group>

      <Group gap={6} wrap="nowrap">
        <AssistButton available={assistAvailable} onOpen={onOpenAssist} disabled={disabled} />

        <ShareMenu
          tenantId={tenantId}
          start={range.start}
          onOpenShare={onOpenShare}
          disabled={disabled}
        />

        <ToolsMenu
          onBulk={onBulk}
          onSetDefaultPatterns={onSetDefaultPatterns}
          onResetRequiredNums={onResetRequiredNums}
          resetRequiredNumsCount={resetRequiredNumsCount}
          onOpenCopy={onOpenCopy}
          assistUndo={assistUndo}
          disabled={disabled}
        />
      </Group>
    </Group>
  )
}

/**
 * 「AI で作成」（012 §3.7）。共有・操作と並ぶ 3 つ目の動詞。狭い画面でアイコンが消えるのは
 * 共有・操作と同じ（`ToolbarButton`）。文字は常に出す（アイコンだけでは何のボタンか分からない）。
 * キーが無い環境ではツールチップ「現在利用できません」で押せない
 * （`disabled` の button は mouse イベントを出さずツールチップが出ないので、`data-disabled` で見た目だけ無効にする。Mantine の指針）。
 */
function AssistButton({
  available,
  onOpen,
  disabled,
}: {
  available: boolean
  onOpen: () => void
  disabled: boolean
}) {
  const unavailable = !available
  const props = unavailable
    ? { 'data-disabled': true, onClick: (event: MouseEvent) => event.preventDefault() }
    : { disabled, onClick: onOpen }

  const button = (
    <ToolbarButton leftSection={<IconSparkles size={16} />} {...props}>
      AI で作成
    </ToolbarButton>
  )

  if (!unavailable) return button
  return (
    <Tooltip label="現在利用できません" withinPortal>
      <span>{button}</span>
    </Tooltip>
  )
}

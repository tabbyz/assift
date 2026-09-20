'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ActionIcon, Anchor, Button, Group, Popover, Stack, Text, Tooltip } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import {
  IconCalculator,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react'
import type { BulkKind } from '../_lib/bulkOperations'
import { ShareMenu } from './ShareMenu'
import { ToolsMenu } from './ToolsMenu'
import { SHIFT_CYCLE_LABELS, type ShiftCycle } from '@/lib/calendar/shiftCycle'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { formatMonthDay } from '@/lib/calendar/dateString'
import type { DateRange } from '@/lib/calendar/dateRange'

type Props = {
  tenantId: string
  cycle: ShiftCycle
  startOfWeek: number
  range: DateRange
  onPrev: () => void
  onNext: () => void
  onPickStart: (start: string) => void
  onOpenCount: () => void
  onOpenShare: () => void
  onBulk: (kind: BulkKind) => void
  onSetDefaultPatterns: () => void
  onOpenCopy: () => void
  disabled: boolean
}

/**
 * ツールバー（v1 `_toolbar.html.slim`）。
 * 左が期間ナビ（007）、右が 集計 / 共有（009。PDF / CSV も含む。010）/ ツール（008）。
 */
export function Toolbar({
  tenantId,
  cycle,
  startOfWeek,
  range,
  onPrev,
  onNext,
  onPickStart,
  onOpenCount,
  onOpenShare,
  onBulk,
  onSetDefaultPatterns,
  onOpenCopy,
  disabled,
}: Props) {
  const [opened, setOpened] = useState(false)
  const [draft, setDraft] = useState<string | null>(range.start)

  const apply = () => {
    if (draft) onPickStart(draft)
    setOpened(false)
  }

  return (
    <Group justify="space-between" wrap="nowrap" pb="sm">
      <Group gap={4} wrap="nowrap">
        <Tooltip label="前の期間">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="前の期間"
            onClick={onPrev}
            disabled={disabled}
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
        </Tooltip>

        <Popover
          opened={opened}
          onChange={setOpened}
          position="bottom-start"
          shadow="md"
          width={300}
        >
          <Popover.Target>
            <Button
              variant="default"
              leftSection={<IconCalendar size={16} />}
              onClick={() => {
                setDraft(range.start)
                setOpened((current) => !current)
              }}
              aria-label="表示期間を変更"
            >
              {formatMonthDay(range.start)} 〜 {formatMonthDay(range.end)}
            </Button>
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

              {/*
                入力欄と「更新」を同じ行に並べる。カレンダーは入力欄の下に開くので、
                縦に積むと「更新」を覆ってしまい押せなくなる（Portal に出しても浮いて重なる）。

                `withinPortal: false` はカレンダーをこの Popover の DOM 内に描くため。
                Portal に出すと、日付を押した瞬間に外側クリック扱いでドロップダウンごと閉じる（007 §5.7）。
              */}
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

        <Tooltip label="次の期間">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="次の期間"
            onClick={onNext}
            disabled={disabled}
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group gap={4} wrap="nowrap">
        <Tooltip label="集計">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="集計"
            onClick={onOpenCount}
            disabled={disabled}
          >
            <IconCalculator size={18} />
          </ActionIcon>
        </Tooltip>

        {/* エクスポートには正規化後の開始日を渡す（`dateRange()` は冪等なので表と必ず一致する。010 §3.1） */}
        <ShareMenu
          tenantId={tenantId}
          start={range.start}
          onOpenShare={onOpenShare}
          disabled={disabled}
        />

        <ToolsMenu
          onBulk={onBulk}
          onSetDefaultPatterns={onSetDefaultPatterns}
          onOpenCopy={onOpenCopy}
          disabled={disabled}
        />
      </Group>
    </Group>
  )
}

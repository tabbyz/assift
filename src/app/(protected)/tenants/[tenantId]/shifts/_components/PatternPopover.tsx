'use client'

import {
  ActionIcon,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  UnstyledButton,
} from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import classes from './PatternPopover.module.css'

export type PopoverPattern = { id: string; name: string; colorHex: string }

type Props = {
  patterns: PopoverPattern[]
  fixed: boolean
  onFixedChange: (fixed: boolean) => void
  onAssign: (patternId: string | null) => void
  onClose: () => void
}

/**
 * セルのアサインを選ぶポップオーバー（v1 `_pattern_popover.html.slim`）。
 *
 * 候補は「そのスタッフが選択可能なパターン + 現在アサイン中のパターン」（007 §3.7）。
 * 先頭は「空」（アサイン解除）。下書き / 確定は SegmentedControl で、
 * アサイン済みのセルで切り替えると同じパターンで押し直す（呼び出し側が行う）。
 */
export function PatternPopover({ patterns, fixed, onFixedChange, onAssign, onClose }: Props) {
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <SegmentedControl
          size="xs"
          value={fixed ? 'fixed' : 'draft'}
          onChange={(value) => onFixedChange(value === 'fixed')}
          data={[
            { value: 'draft', label: '下書き' },
            { value: 'fixed', label: '確定' },
          ]}
        />
        <ActionIcon variant="subtle" color="gray" aria-label="閉じる" onClick={onClose}>
          <IconX size={18} />
        </ActionIcon>
      </Group>

      <SimpleGrid cols={5} spacing={4} verticalSpacing={4}>
        <UnstyledButton
          className={`${classes.patternButton} ${classes.emptyButton}`}
          onClick={() => onAssign(null)}
          aria-label="空にする"
        />
        {patterns.map((pattern) => (
          <UnstyledButton
            key={pattern.id}
            className={classes.patternButton}
            // 白いパターンは枠線の色をそのまま当てるとボタンごと見えなくなる（v1 も同じだった）。
            // ここでは枠線が唯一の手がかりなので、白のときだけ既定の枠線色に落とす
            style={
              pattern.colorHex.toUpperCase() === '#FFFFFF'
                ? undefined
                : { borderColor: pattern.colorHex }
            }
            onClick={() => onAssign(pattern.id)}
          >
            {pattern.name}
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  )
}

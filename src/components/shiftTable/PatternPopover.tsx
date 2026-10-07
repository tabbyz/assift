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
import { choiceStyle } from './cellStyle'
import classes from './PatternPopover.module.css'

export type PopoverPattern = { id: string; name: string; colorHex: string }

type Props = {
  patterns: PopoverPattern[]
  /** このセルに入っているパターン。空なら null（「空」が選択中） */
  selectedPatternId: string | null
  fixed: boolean
  onFixedChange: (fixed: boolean) => void
  onAssign: (patternId: string | null) => void
  onClose: () => void
}

/**
 * セルのアサインを選ぶポップオーバー（v1 `_pattern_popover.html.slim`）。
 *
 * 候補は「そのスタッフが選択可能なパターン + 現在アサイン中のパターン」（007 §3.7）。
 * 先頭は「空」（アサイン解除）。入っているパターンは輪で示す。
 * 下書き / 確定は SegmentedControl で、候補の塗りもそれに合わせる
 * （下書きは淡塗り、確定はベタ塗り + 太字）。
 * アサイン済みのセルで切り替えると同じパターンで押し直す（呼び出し側が行う）。
 */
export function PatternPopover({
  patterns,
  selectedPatternId,
  fixed,
  onFixedChange,
  onAssign,
  onClose,
}: Props) {
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
          aria-pressed={selectedPatternId === null}
          onClick={() => onAssign(null)}
          aria-label="空にする"
        />
        {patterns.map((pattern) => (
          <UnstyledButton
            key={pattern.id}
            className={classes.patternButton}
            data-fixed={fixed || undefined}
            aria-pressed={pattern.id === selectedPatternId}
            style={choiceStyle(pattern.colorHex, fixed)}
            onClick={() => onAssign(pattern.id)}
          >
            {pattern.name}
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  )
}

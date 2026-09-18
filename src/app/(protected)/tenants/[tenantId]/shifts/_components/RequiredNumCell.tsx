'use client'

import { UnstyledButton } from '@mantine/core'
import { IconAlertTriangleFilled, IconCheck } from '@tabler/icons-react'
import classes from './CalendarTable.module.css'

type Props = { date: string; satisfied: boolean; onClick: () => void }

/**
 * 人数行のセル（v1 `tr.count-area .count-button`）。
 * 出勤日パターンすべてで 必要 = アサイン済 なら ✓、1 つでも違えば ! を出す。
 */
export function RequiredNumCell({ date, satisfied, onClick }: Props) {
  return (
    <UnstyledButton
      className={classes.countButton}
      onClick={onClick}
      aria-label={`${date} の必要人数（${satisfied ? '充足' : '未充足'}）`}
    >
      {satisfied ? (
        <IconCheck size={16} />
      ) : (
        <IconAlertTriangleFilled size={14} color="var(--mantine-color-red-6)" />
      )}
    </UnstyledButton>
  )
}

'use client'

import { UnstyledButton } from '@mantine/core'
import { IconPencil } from '@tabler/icons-react'
import classes from '@/components/shiftTable/ShiftTable.module.css'

type Props = { date: string; note?: string; onClick: () => void }

/** メモ行のセル（v1 `tr.event-area`）。メモが無ければペンのアイコン */
export function DateNoteCell({ date, note, onClick }: Props) {
  return (
    <UnstyledButton
      className={classes.noteCell}
      onClick={onClick}
      aria-label={note ? `${date} のメモ: ${note}` : `${date} のメモを追加`}
    >
      {note ?? <IconPencil size={12} className={classes.notePlaceholder} />}
    </UnstyledButton>
  )
}

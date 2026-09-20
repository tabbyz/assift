import { IconPencil } from '@tabler/icons-react'
import classes from '@/components/shiftTable/ShiftTable.module.css'

/**
 * 日付ヘッダーのメモ行（v1 `tr.event-area`）。
 *
 * **押せる要素ではない。** ヘッダーセル全体が 1 つのボタン（日付メモを開く）なので、
 * ここは中身だけを描く。メモがある日だけ文字を出し、空の日のペンはヘッダーのホバー /
 * フォーカスのときだけ見せる（14 列ぶん常時並べると、内容ゼロのアイコンが視線を取る）。
 */
export function DateNoteCell({ note }: { note?: string }) {
  return (
    <div className={classes.noteCell}>
      {note ?? <IconPencil size={14} className={classes.notePlaceholder} />}
    </div>
  )
}

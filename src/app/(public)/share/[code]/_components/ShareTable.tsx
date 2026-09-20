import { cellStyle, type CellPattern } from '@/components/shiftTable/cellStyle'
import { DateHeaderCell } from '@/components/shiftTable/DateHeaderCell'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import classes from '@/components/shiftTable/ShiftTable.module.css'

type Props = {
  dates: string[]
  holidays: Set<string>
  staffs: { id: string; name: string }[]
  patternsById: Map<string, CellPattern>
  shifts: ShiftMap
  notesByDate: Map<string, string>
}

/**
 * 公開シフト表（v1 `shares/show.html.slim`）。**操作が無いので Client JS を持たない**（009 §3.5）。
 *
 * 保護ルートの `CalendarTable` とは別物にする: あちらは Popover / Menu / onClick を持つ Client Component で、
 * セルも `<button>`。共有するのは見た目（`ShiftTable.module.css` / `DateHeaderCell` / `cellStyle`）までにとどめる。
 *
 * v1 と同じく **必要人数行は出さない**し、「担当可（グレー）」も出さない（`data-enabled` を付けない）。
 * 下書きも確定と同じ位置に、上辺の色帯付きで出る。
 */
export function ShareTable({ dates, holidays, staffs, patternsById, shifts, notesByDate }: Props) {
  return (
    <table className={classes.table}>
      <thead>
        <tr className={classes.dateRow}>
          <th />
          {dates.map((date) => (
            // scope: 支援技術がセルと日付・スタッフ名を結べるようにする（保護側と同じ）
            <th key={date} scope="col">
              <DateHeaderCell date={date} isHoliday={holidays.has(date)} />
            </th>
          ))}
        </tr>

        {/* メモ行は期間内にメモがあるときだけ出す（v1 と同じ） */}
        {notesByDate.size > 0 && (
          <tr className={classes.noteRow}>
            <th />
            {dates.map((date) => (
              <th key={date} scope="col">
                <div className={classes.noteCell}>{notesByDate.get(date)}</div>
              </th>
            ))}
          </tr>
        )}
      </thead>

      <tbody>
        {staffs.map((staff) => (
          <tr key={staff.id}>
            <th scope="row">
              <div className={classes.staffName}>{staff.name}</div>
            </th>
            {dates.map((date) => {
              const shift = shifts.get(cellKey(staff.id, date))
              const pattern = shift ? patternsById.get(shift.patternId) : undefined
              const fixed = shift?.fixed ?? false

              return (
                <td key={date}>
                  <div
                    className={classes.cell}
                    data-assigned={Boolean(pattern)}
                    data-fixed={fixed}
                    style={cellStyle(pattern, fixed)}
                  >
                    {pattern?.name}
                  </div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

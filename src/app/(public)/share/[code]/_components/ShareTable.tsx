import { cellStyle, type CellPattern } from '@/components/shiftTable/cellStyle'
import { DateHeaderCell, dateToneClass } from '@/components/shiftTable/DateHeaderCell'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import classes from '@/components/shiftTable/ShiftTable.module.css'

type Props = {
  dates: string[]
  today: string
  holidays: Set<string>
  staffs: { id: string; name: string }[]
  patternsById: Map<string, CellPattern>
  shifts: ShiftMap
  notesByDate: Map<string, string>
}

/**
 * 公開シフト表。操作が無いので Client JS を持たない。
 * 必要人数は出さないので、保護ルートにある充足のフッターもここには置かない。
 * メモは日付セル内。下書きは淡塗り、確定はベタ塗りで、どちらも保護ルートと同じ見た目になる。
 */
export function ShareTable({
  dates,
  today,
  holidays,
  staffs,
  patternsById,
  shifts,
  notesByDate,
}: Props) {
  const showNotes = notesByDate.size > 0

  return (
    <table className={classes.table}>
      <thead>
        <tr className={classes.dateRow}>
          <th className={classes.staffHeader} scope="col" aria-label="スタッフ" />
          {dates.map((date) => (
            <th key={date} scope="col">
              <div
                className={[classes.dateHead, dateToneClass(date, holidays.has(date))]
                  .filter(Boolean)
                  .join(' ')}
                data-today={date === today || undefined}
              >
                <div className={classes.dateMain}>
                  <DateHeaderCell date={date} />
                </div>
                {showNotes && <div className={classes.noteCell}>{notesByDate.get(date)}</div>}
              </div>
            </th>
          ))}
        </tr>
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

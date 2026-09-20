import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { dayOfMonth, wday } from '@/lib/calendar/dateString'
import classes from './ShiftTable.module.css'

/** 日付行のセル（v1 `tr.date-area`）。日曜と祝日は赤、土曜は青 */
export function DateHeaderCell({ date, isHoliday }: { date: string; isHoliday: boolean }) {
  const day = wday(date)
  const toneClass =
    isHoliday || day === 0 ? classes.holiday : day === 6 ? classes.saturday : undefined

  return (
    <div className={toneClass}>
      <div className={classes.wday}>{WEEKDAY_LABELS[day]}</div>
      <div className={classes.day}>{dayOfMonth(date)}</div>
    </div>
  )
}

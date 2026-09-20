import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { dayOfMonth, wday } from '@/lib/calendar/dateString'
import classes from './ShiftTable.module.css'

/**
 * 日付列の色味（日曜と祝日は赤、土曜は青）。
 *
 * **ヘッダーセルの面を塗るのは `.dateHead`** なので、クラスは呼び出し側がそこに当てる。
 * 文字色は CSS の子孫セレクタ（`.holiday .day` など）が引き受ける。
 */
export function dateToneClass(date: string, isHoliday: boolean): string | undefined {
  const day = wday(date)
  if (isHoliday || day === 0) return classes.holiday
  if (day === 6) return classes.saturday
  return undefined
}

/**
 * 日付列の見出し（曜日・日）。
 *
 * 充足（配置 / 必要人数）はここには出さない。列の集計なので表の下のフッターに置く（011）。
 * 祝日も「祝」とは書かない。赤くなっていることが合図で足りる。
 */
export function DateHeaderCell({ date }: { date: string }) {
  return (
    <>
      <div className={classes.wday}>{WEEKDAY_LABELS[wday(date)]}</div>
      <div className={classes.day}>{dayOfMonth(date)}</div>
    </>
  )
}

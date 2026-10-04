import { dateRange, defaultStart } from '@/lib/calendar/dateRange'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { addDays } from '@/lib/calendar/dateString'

/**
 * 初期設定の完成イメージ（014 §4.6）。本物のシフト表と同じ期間の決め方（`dateRange`）で日付を並べ、
 * マスには見本の勤務を入れる（保存はしない）。
 */

/** 完成イメージに並べる日付。表示期間の先頭から最大 `limit` 日（1ヶ月を全部並べると入らない） */
export function previewDates(
  cycle: ShiftCycle,
  startOfWeek: number | null,
  today: string,
  limit: number
): { dates: string[]; start: string; end: string } {
  const range = dateRange(cycle, startOfWeek ?? 0, defaultStart(today))
  // 週・2 週は「今月 1 日を含む週」から始まるので、先月の日が混ざる。見本としては今日に近い期間でよい
  return { dates: range.dates.slice(0, limit), start: range.start, end: range.end }
}

/**
 * 見本のマス。スタッフごとにずらして、働く日の勤務を順に、ときどきお休みを入れる。
 * 勤務が無ければ空。決まった並びなので、描き直しても見本が跳ねない
 */
export function samplePattern<T>(
  staffIndex: number,
  dayIndex: number,
  workdays: readonly T[],
  dayoffs: readonly T[]
): T | null {
  if (workdays.length === 0) return null
  const k = (staffIndex * 3 + dayIndex) % (workdays.length + 2)
  if (k < workdays.length) return workdays[k]
  return dayoffs.length > 0 ? dayoffs[(staffIndex + dayIndex) % dayoffs.length] : null
}

/** 期間の見出し（「10月1日〜31日」「9月28日〜10月11日」） */
export function previewRangeLabel(start: string, end: string): string {
  const [, sm, sd] = start.split('-').map(Number)
  const [, em, ed] = end.split('-').map(Number)
  return sm === em ? `${sm}月${sd}日〜${ed}日` : `${sm}月${sd}日〜${em}月${ed}日`
}

/** 半月・1ヶ月の表示期間の日数（見出しに「14 日目まで表示」と添えるため） */
export function periodLength(start: string, end: string): number {
  let n = 1
  for (let date = start; date !== end; date = addDays(date, 1)) n++
  return n
}

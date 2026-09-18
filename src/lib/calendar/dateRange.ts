import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import {
  addDays,
  addMonths,
  datesBetween,
  dayOfMonth,
  endOfMonth,
  startOfMonth,
  wday,
  withDayOfMonth,
} from './dateString'

/** シフト表の表示期間。`dates` は両端を含む（v1 の `Calendar#dates`） */
export type DateRange = { start: string; end: string; dates: string[] }

/**
 * v1 の `Calendar.date_range` の移植（007 §5.1）。
 *
 * 渡された `start` は周期に合わせて正規化する（週初へ丸める / 月の前半・後半にそろえる）。
 * URL の `?start=` は書き換えない。前後移動は正規化後の範囲から計算する。
 */
export function dateRange(cycle: ShiftCycle, startOfWeek: number, start: string): DateRange {
  const range = (from: string, to: string): DateRange => ({
    start: from,
    end: to,
    dates: datesBetween(from, to),
  })

  switch (cycle) {
    case 'week':
    case 'two_week': {
      // 週の始まり（店舗設定）まで戻す
      const back = (wday(start) - startOfWeek + 7) % 7
      const from = addDays(start, -back)
      return range(from, addDays(from, cycle === 'week' ? 6 : 13))
    }
    case 'half_month':
      return dayOfMonth(start) <= 15
        ? range(startOfMonth(start), withDayOfMonth(start, 15))
        : range(withDayOfMonth(start, 16), endOfMonth(start))
    case 'month':
      // v1 と同じく 1 日固定にはしない（開始日をそのまま使い、翌月同日の前日まで）
      return range(start, addDays(addMonths(start, 1), -1))
  }
}

/** 前の期間の開始日（007 §3.3） */
export function prevStart(cycle: ShiftCycle, range: DateRange): string {
  switch (cycle) {
    case 'week':
      return addDays(range.start, -7)
    case 'two_week':
      return addDays(range.start, -14)
    case 'half_month':
      // 前半 ↔ 後半で行き来する（v1 の −13 日という固定値の言い換え）
      return dayOfMonth(range.start) <= 15
        ? withDayOfMonth(addMonths(startOfMonth(range.start), -1), 16)
        : startOfMonth(range.start)
    case 'month':
      return addMonths(range.start, -1)
  }
}

/** 次の期間の開始日（007 §3.3） */
export function nextStart(cycle: ShiftCycle, range: DateRange): string {
  switch (cycle) {
    case 'week':
      return addDays(range.start, 7)
    case 'two_week':
      return addDays(range.start, 14)
    case 'half_month':
      return dayOfMonth(range.start) <= 15
        ? withDayOfMonth(range.start, 16)
        : startOfMonth(addMonths(startOfMonth(range.start), 1))
    case 'month':
      return addMonths(range.start, 1)
  }
}

/** `?start=` が無いときの開始日。JST 今日の月初（v1 の `Date.current.beginning_of_month`） */
export function defaultStart(today: string): string {
  return startOfMonth(today)
}

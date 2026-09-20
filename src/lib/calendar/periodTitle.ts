import type { DateRange } from './dateRange'
import { dayOfMonth, endOfMonth, formatMonthDay } from './dateString'
import type { ShiftCycle } from './shiftCycle'

/** `YYYY-MM-DD` の年月を `2026年9月` にする。dayjs をここへ広げない */
function formatYearMonth(date: string): string {
  return `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`
}

/**
 * ツールバーの期間タイトル。表の作成周期が紙のサイズなので、レンジ表記より周期の言葉を先にする。
 *
 * - 1 か月で月初〜月末: `2026年9月`
 * - 半月: `2026年9月 前半` / `後半`
 * - 週・2 週間、または月初以外から始まる 1 か月: `9/14 〜 9/20`
 */
export function formatPeriodTitle(cycle: ShiftCycle, range: DateRange): string {
  switch (cycle) {
    case 'month':
      return dayOfMonth(range.start) === 1 && range.end === endOfMonth(range.start)
        ? formatYearMonth(range.start)
        : `${formatMonthDay(range.start)} 〜 ${formatMonthDay(range.end)}`
    case 'half_month':
      return `${formatYearMonth(range.start)} ${dayOfMonth(range.start) <= 15 ? '前半' : '後半'}`
    case 'week':
    case 'two_week':
      return `${formatMonthDay(range.start)} 〜 ${formatMonthDay(range.end)}`
  }
}

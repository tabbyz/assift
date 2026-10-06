import { dateRange, nextStart, prevStart } from '@/lib/calendar/dateRange'
import { diffDays, formatMonthDay, wday } from '@/lib/calendar/dateString'
import { formatPeriodTitle } from '@/lib/calendar/periodTitle'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { termIssue } from '@/lib/validation/date'
import type { CopyConditions } from '@/lib/validation/shifts'

/**
 * シフトコピーのモーダル（011 §8）が表示の判断に使う純関数。
 * コピーの規則そのもの（RPC `copy_shifts`、`copyShiftsSchema`）はここでは変えない。
 */

/** 両端を含む期間 */
export type Term = { start: string; end: string }

export function weekdayLabel(date: string): string {
  return WEEKDAY_LABELS[wday(date)]
}

/** 周期の 1 期間そのものか（「期間で選ぶ」で表せるか） */
export function isPeriod(cycle: ShiftCycle, startOfWeek: number, term: Term): boolean {
  const range = dateRange(cycle, startOfWeek, term.start)
  return range.start === term.start && range.end === term.end
}

/** `2026年9月` / `9/14 〜 9/20`。期間でなければ範囲をそのまま書く */
export function termTitle(cycle: ShiftCycle, startOfWeek: number, term: Term): string {
  return isPeriod(cycle, startOfWeek, term)
    ? formatPeriodTitle(cycle, dateRange(cycle, startOfWeek, term.start))
    : `${formatMonthDay(term.start)} 〜 ${formatMonthDay(term.end)}`
}

/**
 * 期間名がそのまま範囲表記か（週・2 週間、月初以外から始まる 1 か月）。
 * そのときは下の行に日付を繰り返さず、曜日だけを出す。
 */
export function titleIsRange(title: string, term: Term): boolean {
  return title === `${formatMonthDay(term.start)} 〜 ${formatMonthDay(term.end)}`
}

/** 1 つ前 / 次の期間 */
export function stepPeriod(
  cycle: ShiftCycle,
  startOfWeek: number,
  term: Term,
  direction: -1 | 1
): Term {
  const current = dateRange(cycle, startOfWeek, term.start)
  const start = direction < 0 ? prevStart(cycle, current) : nextStart(cycle, current)
  const { end } = dateRange(cycle, startOfWeek, start)
  return { start, end }
}

/** 曜日がずれるか。ずらす日数が 7 の倍数ならそろう */
export function weekdayNote(fromStart: string, toStart: string): string {
  if (diffDays(fromStart, toStart) % 7 === 0) {
    return `曜日もそろいます（${weekdayLabel(fromStart)} → ${weekdayLabel(toStart)}）`
  }
  const side = (date: string) => `${formatMonthDay(date)} ${weekdayLabel(date)}`
  return `曜日がずれます（${side(fromStart)} → ${side(toStart)}）`
}

/**
 * 前回のコピー元を提案するか（011 §8.2 の 3）。
 *
 * コピー先は常に表示中の期間から始めるので、前回条件の日付はそのまま戻さない。
 * 前回のコピー元が「前回のコピー先の 1 つ前の期間」なら既定どおりに使っただけなので提案しない。
 * それ以外（テンプレートの週など、わざわざ選んだコピー元）で、今の既定と違うときだけ返す。
 */
export function lastSourceSuggestion(
  stored: CopyConditions | null,
  cycle: ShiftCycle,
  startOfWeek: number,
  current: Term
): Term | null {
  if (!stored || termIssue(stored.fromStart, stored.fromEnd) !== null) return null
  const source = { start: stored.fromStart, end: stored.fromEnd }
  if (source.start === current.start && source.end === current.end) return null

  const storedTo = dateRange(cycle, startOfWeek, stored.toStart)
  const previous = stepPeriod(cycle, startOfWeek, storedTo, -1)
  if (previous.start === source.start && previous.end === source.end) return null
  return source
}

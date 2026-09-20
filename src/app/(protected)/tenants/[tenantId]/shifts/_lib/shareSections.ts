import type { DateRange } from '@/lib/calendar/dateRange'

type Term = { startDate: string; endDate: string }

/**
 * 共有中の一覧を「表示中の期間の URL」と「ほか」に分ける（011 §6.2）。
 *
 * 一覧は作成日時の降順（`listShares()`）なので、期間が完全に一致する最初の行が最新になる。
 * 同じ期間の 2 本目は禁止していないので、古いほうは `others` に残す（黙って隠すと停止できなくなる）。
 * 期間が重なるだけの行（週の途中から始まる共有など）は、表示中の期間の URL とは見なさない。
 */
export function splitCurrentShare<T extends Term>(
  enabled: T[],
  range: Pick<DateRange, 'start' | 'end'>
): { current: T | null; others: T[] } {
  const index = enabled.findIndex(
    (share) => share.startDate === range.start && share.endDate === range.end
  )
  if (index === -1) return { current: null, others: enabled }
  return { current: enabled[index], others: enabled.filter((_, i) => i !== index) }
}

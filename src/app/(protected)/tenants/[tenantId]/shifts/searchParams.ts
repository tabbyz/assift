import { createLoader, createParser } from 'nuqs/server'
import { isDateString } from '@/lib/calendar/dateString'

/**
 * シフト表の表示開始日（v1 の `?start_date=`）。URL に残す状態はこれだけ（007 §3.1）。
 *
 * 実在しない日付（`2026-02-30` など）は null にして、page 側で JST 今日の月初に落とす。
 * 既定値を parser に埋め込まないのは、既定が「今日」に依存して毎日変わるため。
 */
export const shiftsParsers = {
  start: createParser({
    parse: (value: string) => (isDateString(value) ? value : null),
    serialize: (value: string) => value,
  }),
}

export const loadShiftsSearchParams = createLoader(shiftsParsers)

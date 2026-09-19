import { z } from 'zod'
import { daysBetween, isDateString } from '@/lib/calendar/dateString'

const DATE_ERROR = { error: '日付が正しくありません' }

/**
 * カレンダー日付（`YYYY-MM-DD`）。
 * `isDateString` が実在しない日付（`2026-02-30` など）も弾く（007 §5.5）。
 */
export const dateStringSchema = z.string(DATE_ERROR).refine(isDateString, DATE_ERROR)

/** v1 の共有・コピーと同じ上限（001 §7.4）。`dateRange()` が返す表示期間は最長 31 日 */
export const MAX_TERM_DAYS = 31

export type TermIssue = 'order' | 'too_long'

/**
 * 期間の規則を 1 か所に置く（008 §10.11）。`end >= start` かつ 両端を含めて `MAX_TERM_DAYS` 日以内。
 *
 * Zod のスキーマ（サーバー）と、送信前にその場で理由を見せる UI（コピーモーダル）が同じ関数を使う。
 * 文言は呼び出し側が場面に合わせて選ぶ（「期間が正しくありません」「開始日より後の日付を選んでください」）。
 */
export function termIssue(start: string, end: string): TermIssue | null {
  if (end < start) return 'order' // `YYYY-MM-DD` は辞書順 = 日付順
  if (daysBetween(start, end) > MAX_TERM_DAYS) return 'too_long'
  return null
}

const TERM_ERROR = { error: '期間が正しくありません' }

/** 期間の 2 列。各スキーマはこれを spread して自分の列順で object を組み、最後に `refineTerm` を掛ける */
export const dateTermShape = { start: dateStringSchema, end: dateStringSchema }

/**
 * 期間の規則をスキーマに掛ける（008 §10.15）。
 *
 * refine を先に掛けた object は `.omit()` / `.pick()` が使えず（Zod 4 は例外を投げる）、`safeExtend` で足す方向にしか
 * 組めない。規則だけを共有して object は各スキーマが持てば、列順もその場で決まり、部分取り出しも自由になる。
 */
export function refineTerm<T extends { start: string; end: string }>(schema: z.ZodType<T>) {
  return schema.refine((v) => termIssue(v.start, v.end) === null, TERM_ERROR)
}

/** 表示期間そのもの（両端を含めて最長 31 日） */
export const dateTermSchema = refineTerm(z.object(dateTermShape))

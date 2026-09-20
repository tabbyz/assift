import { addDays, isDateString } from '@/lib/calendar/dateString'

/**
 * 公開期限の規則（v1 `Share::DATE_LIMIT = 6`）。終了日の 6 日後まで有効で、7 日後に無効になる。
 *
 * 判定が要るのは 3 か所（一覧の分類 / 発行ボタンの可否 / 公開ページの 404）で、
 * どれか 1 つだけ境界がずれても気付けないのでここに集約する（009 §3.2）。
 *
 * **「今日」は必ず `todayJst()` を渡す。** v1 は `Date.current`（サーバー TZ）に依存していて、
 * TZ 設定が変われば境界がずれた。Client も端末の `new Date()` を見ず、Server が渡した値を使う。
 */
export const SHARE_GRACE_DAYS = 6

/**
 * その共有がまだ公開されているか（`YYYY-MM-DD` は辞書順 = 日付順）。
 *
 * **想定外の値は「公開しない」に倒す。** これは未ログインで開けるページの唯一の期限判定で、
 * `YYYY-MM-DD` でない文字列を比較すると `'Invalid Date' >= '2026-09-20'` が真になり
 * （`'I'` は `'2'` より後ろ）、期限切れの共有が全部生き返る向きに壊れる。
 */
export function isShareEnabled(endDate: string, today: string): boolean {
  if (!isDateString(endDate) || !isDateString(today)) return false
  return addDays(endDate, SHARE_GRACE_DAYS) >= today
}

/** SQL の絞り込み用。`end_date >= minEnabledEndDate(today)` が有効な共有 */
export function minEnabledEndDate(today: string): string {
  return addDays(today, -SHARE_GRACE_DAYS)
}

import 'server-only'
import holiday_jp from '@holiday-jp/holiday_jp'

/**
 * 日本の祝日（v1 は `config/business_time.yml` に 2017〜2026 年をハードコードしていた。
 * ライブラリのデータは 1970〜2050 年）。
 *
 * **Server だけで使う**（007 §3.8）: 祝日データは 1.4MB あるのでクライアントには送らず、
 * page.tsx が表示期間分の日付配列にしてから Client に渡す。
 *
 * 判定は `YYYY-MM-DD` の文字列キーで引く。`isHoliday(Date)` は実行環境の TZ で日付が
 * 1 日ずれうるうえ、文字列を渡しても内部で `Object.keys().includes()` の線形探索になる。
 */
const holidays: Record<string, unknown> = holiday_jp.holidays

export function isHolidayDate(date: string): boolean {
  return Object.hasOwn(holidays, date)
}

/** 渡した日付のうち祝日だけを返す（順序は入力のまま） */
export function holidaysIn(dates: string[]): string[] {
  return dates.filter(isHolidayDate)
}

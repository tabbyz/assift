import dayjs from 'dayjs'

/**
 * カレンダー日付は `YYYY-MM-DD` の文字列で持ち回る（AGENTS.md の規約）。
 * Date 型にすると TZ でずれるので、変換は表示・計算の直前だけにする。
 *
 * dayjs はこのファイルの中だけで使う。
 */

const FORMAT = 'YYYY-MM-DD'

const SHAPE = /^\d{4}-\d{2}-\d{2}$/

/**
 * `YYYY-MM-DD` として実在する日付か。
 *
 * **`dayjs(v).isValid()` だけでは足りない**: dayjs は存在しない日付を黙って繰り上げるので
 * `2026-02-30`（→ 3/2）も `2026-13-01`（→ 2027/1/1）も valid になる。
 * 整形し直して元の文字列に戻るかどうかで判定する（`customParseFormat` プラグインを足さずに済む）。
 */
export function isDateString(value: string): boolean {
  if (!SHAPE.test(value)) return false
  const parsed = dayjs(value)
  return parsed.isValid() && parsed.format(FORMAT) === value
}

export function addDays(date: string, days: number): string {
  return dayjs(date).add(days, 'day').format(FORMAT)
}

/** 月をまたぐ加算。月末は丸める（`1/31` + 1 か月 = `2/28`。Ruby の `+ 1.month` と同じ） */
export function addMonths(date: string, months: number): string {
  return dayjs(date).add(months, 'month').format(FORMAT)
}

export function startOfMonth(date: string): string {
  return dayjs(date).startOf('month').format(FORMAT)
}

export function endOfMonth(date: string): string {
  return dayjs(date).endOf('month').format(FORMAT)
}

/** 日（1..31） */
export function dayOfMonth(date: string): number {
  return dayjs(date).date()
}

/** 同じ月の指定日。`withDayOfMonth('2026-09-18', 16)` = `'2026-09-16'` */
export function withDayOfMonth(date: string, day: number): string {
  return dayjs(date).date(day).format(FORMAT)
}

/** 曜日。0 = 日曜（`staffs.available_wdays` と `tenants.start_of_week` に合わせる） */
export function wday(date: string): number {
  return dayjs(date).day()
}

/** start から end まで（両端を含む）の日付。end < start なら空配列 */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = start
  // `YYYY-MM-DD` は辞書順 = 日付順
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

/** 両端を含む日数。`daysBetween('2026-09-01', '2026-09-01')` = 1 */
export function daysBetween(start: string, end: string): number {
  return dayjs(end).diff(dayjs(start), 'day') + 1
}

/**
 * 日付の差（符号付き）。`diffDays('2026-09-01', '2026-09-05')` = 4、逆順は −2 のように負になる。
 *
 * **`daysBetween()` と混同しない**: あちらは両端を含む「日数」なので 1 大きく、負にもならない。
 * コピーのオフセット（008 §5.3）のように「何日ずらすか」が要るときはこちらを使う。
 */
export function diffDays(from: string, to: string): number {
  return dayjs(to).diff(dayjs(from), 'day')
}

/**
 * `fromStart..fromEnd` と同じ日数の期間を `toStart` から始めたときの終了日（シフトコピーのコピー先の終了日）。
 * `daysBetween()`（両端を含む日数）を足すと 1 日ずれるので `diffDays()` を使う。From が 1 日なら `toStart` そのもの。
 */
export function copyEnd(fromStart: string, fromEnd: string, toStart: string): string {
  return addDays(toStart, diffDays(fromStart, fromEnd))
}

/** `9/18`（v1 の `%-m/%-d`） */
export function formatMonthDay(date: string): string {
  const d = dayjs(date)
  return `${d.month() + 1}/${d.date()}`
}

/** `2026/9/1`（v1 の `%Y/%-m/%-d`）。共有の期間表示のように年まで見せたいときに使う */
export function formatYearMonthDay(date: string): string {
  const d = dayjs(date)
  return `${d.year()}/${d.month() + 1}/${d.date()}`
}

/** `9月18日`（v1 のメモモーダルの見出し） */
export function formatJapaneseMonthDay(date: string): string {
  const d = dayjs(date)
  return `${d.month() + 1}月${d.date()}日`
}

/** `2026年9月18日`（料金・トライアルの日付のように年をまたぎうるもの） */
export function formatJapaneseYearMonthDay(date: string): string {
  const d = dayjs(date)
  return `${d.year()}年${d.month() + 1}月${d.date()}日`
}

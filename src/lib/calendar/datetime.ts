/**
 * 日時（`created_at` などの timestamptz）を JST の表示用文字列にする。
 *
 * カレンダー日付は `YYYY-MM-DD` の文字列で扱う（`dateString.ts`）が、こちらは時刻まで持つ値なので
 * 別ファイルにする。dayjs の timezone プラグインを足さずに `todayJst()` と同じく Intl で解く。
 */
const JST_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // 0 時を 24 時と書くロケールがあるので明示する
  hourCycle: 'h23',
})

function jstParts(value: string | Date): Intl.DateTimeFormatPart[] {
  return JST_FORMATTER.formatToParts(new Date(value))
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? ''
}

/** `2026/09/01 10:30`。UTC 深夜は JST の翌日になる */
export function formatJstDateTime(value: string | Date): string {
  const parts = jstParts(value)
  const year = part(parts, 'year')
  const month = part(parts, 'month')
  const day = part(parts, 'day')
  const hour = part(parts, 'hour')
  const minute = part(parts, 'minute')
  return `${year}/${month}/${day} ${hour}:${minute}`
}

/** `9/16 9:41`。月日と時は詰めない。分は 2 桁。年は含めない（共有一覧の発行時刻） */
export function formatJstMonthDayTime(value: string | Date): string {
  const parts = jstParts(value)
  const month = Number(part(parts, 'month'))
  const day = Number(part(parts, 'day'))
  const hour = Number(part(parts, 'hour'))
  const minute = part(parts, 'minute')
  return `${month}/${day} ${hour}:${minute}`
}

/** JST の年。`2026` */
export function formatJstYear(value: string | Date): string {
  return part(jstParts(value), 'year')
}

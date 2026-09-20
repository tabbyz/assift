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

/** `2026/09/01 10:30`（v1 の共有一覧の「◯◯に取得」）。UTC 深夜は JST の翌日になる */
export function formatJstDateTime(value: string | Date): string {
  const parts = JST_FORMATTER.formatToParts(new Date(value))
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${at('year')}/${at('month')}/${at('day')} ${at('hour')}:${at('minute')}`
}

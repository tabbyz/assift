/**
 * JST の「今日」を `YYYY-MM-DD` で返す。
 *
 * dayjs の timezone プラグインを足さずに Intl で解く。`sv-SE` ロケールの日付書式が
 * ちょうど `YYYY-MM-DD`（ISO と同じ）なので、整形結果をそのまま使える。
 */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now)
}

import { formatMonthDay, formatYearMonthDay } from '@/lib/calendar/dateString'

type Term = { start: string; end: string }

/**
 * 共有期間の表記（`2026/10/1 〜 10/31`）。終了日は開始日と年が同じなら月日だけにする。
 *
 * `baseYear` を渡すと、開始日がその年のときは開始日の年も落とす（`9/1 〜 9/30`）。
 * 共有モーダルの一覧は、タイトルの期間と同じ年の行が大半なので、年を毎行に書くと数字の壁になる（011 §7）。
 */
export function sharePeriodLabel(term: Term, baseYear?: string): string {
  const sameYear = term.start.slice(0, 4) === term.end.slice(0, 4)
  const end = sameYear ? formatMonthDay(term.end) : formatYearMonthDay(term.end)
  const start =
    sameYear && term.start.slice(0, 4) === baseYear
      ? formatMonthDay(term.start)
      : formatYearMonthDay(term.start)
  return `${start} 〜 ${end}`
}

/**
 * 共有 URL を「前半（オリジン + `/share/`）」と「コード」に分ける。
 * 画面では前半を薄く、コードを濃く出す。コピーされる文字列は分けずに全体のまま。
 */
export function splitShareUrl(url: string): { prefix: string; code: string } {
  const index = url.lastIndexOf('/') + 1
  return { prefix: url.slice(0, index), code: url.slice(index) }
}

/** `2026年10月` を `2026年` と `10月` に分ける。年で始まらない表記（`9/14 〜 9/20`）は year を空にする */
export function splitYearPrefix(title: string): { year: string; rest: string } {
  const match = /^(\d{4}年)(.*)$/.exec(title)
  return match ? { year: match[1], rest: match[2] } : { year: '', rest: title }
}

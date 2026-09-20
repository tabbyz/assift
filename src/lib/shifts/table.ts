import type { ShiftCell } from './key'

/**
 * PDF / CSV が共有するシフト表の形（010 §3.3）。
 *
 * **`server-only` を付けない。** `toShiftCsv()` は純関数として Vitest の対象にしたいので、
 * この型を `lib/queries/`（`import 'server-only'`）から引くと依存の向きが濁る。
 *
 * 009 の `SharedShiftTable` とは統合しない（010 §8.6）。形は近いが、公開ページは
 * `holidays` も `dates` も自前で組んでいて、統合すると 009 のコードを触ることになる。
 */
export type ShiftTable = {
  tenantName: string
  start: string
  end: string
  /** 表示期間の日付（両端を含む。`dateRange()` の `dates` そのもの） */
  dates: string[]
  /** `dates` のうち祝日だけ。祝日データは Server にしか無いので読み取り時に解決する */
  holidays: string[]
  staffs: { id: string; name: string }[]
  patterns: { id: string; name: string; description: string | null; colorHex: string }[]
  shifts: ShiftCell[]
  notes: { date: string; note: string }[]
}

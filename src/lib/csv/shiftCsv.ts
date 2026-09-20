import { cellKey, toShiftMap } from '@/lib/shifts/key'
import type { ShiftTable } from '@/lib/shifts/table'

/**
 * CSV の 1 フィールド。Ruby の `CSV` と同じ規則で引用する:
 * **`,` `"` CR LF のいずれかを含むときだけ** `"` で囲み、中の `"` を `""` にする。
 *
 * スタッフ名（10 文字）・パターン名（6 文字）・メモ（12 文字）のいずれにも `,` と `"` は入りうる。
 */
export function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

/**
 * v1 `index.csv.ruby` の移植（010 §5.4）。**文字コードは扱わない**（`encodeCsv()` が受け持つ）。
 *
 * 1. 1 行目: 空 + 日付（**`YYYY-MM-DD` のまま**。画面の `9/1` にしない。012 のバイト比較の基準になる）
 * 2. 2 行目: 空 + 各日のメモ。**メモが 1 件も無くても出す**（v1 と同じ。列構造が安定する）
 * 3. 以降: スタッフ名 + 各日のパターン名（未アサインは空文字）
 *
 * 改行は LF（Ruby `CSV.generate` の既定 `row_sep`）。CRLF にすると 012 の
 * 「v1 と v2 の CSV を突き合わせる」が全行差分になる（010 §3.6）。
 */
export function toShiftCsv(table: ShiftTable): string {
  const shifts = toShiftMap(table.shifts)
  const patternNames = new Map(table.patterns.map((pattern) => [pattern.id, pattern.name]))
  const notes = new Map(table.notes.map((note) => [note.date, note.note]))

  const rows: string[][] = [
    ['', ...table.dates],
    ['', ...table.dates.map((date) => notes.get(date) ?? '')],
    ...table.staffs.map((staff) => [
      staff.name,
      ...table.dates.map((date) => {
        const shift = shifts.get(cellKey(staff.id, date))
        return (shift && patternNames.get(shift.patternId)) ?? ''
      }),
    ]),
  ]

  return rows.map((row) => row.map(csvField).join(',')).join('\n') + '\n'
}

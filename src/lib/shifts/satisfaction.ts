import type { ShiftMap } from './key'

/** 日付 → パターン → 人数 */
export type CountsByDate = Map<string, Map<string, number>>

export type RequiredNumRow = { patternId: string; date: string; num: number }

/**
 * 日付 × パターンのアサイン済み人数（v1 の `Calendar#assigned_count`）。
 *
 * 母集団は **表示中の在籍スタッフ**のシフト（007 §3.11）。v1 は Ruby 側が退職者まで数え、
 * JS 側は在籍者だけ数えていて食い違っていた。
 */
export function assignedCounts(shifts: ShiftMap): CountsByDate {
  const counts: CountsByDate = new Map()
  for (const shift of shifts.values()) {
    const byPattern = counts.get(shift.date) ?? new Map<string, number>()
    byPattern.set(shift.patternId, (byPattern.get(shift.patternId) ?? 0) + 1)
    counts.set(shift.date, byPattern)
  }
  return counts
}

/** 必要人数の行を 日付 → パターン → 人数 に畳む。行が無い組み合わせは 0 として扱う */
export function requiredCounts(rows: RequiredNumRow[]): CountsByDate {
  const counts: CountsByDate = new Map()
  for (const row of rows) {
    const byPattern = counts.get(row.date) ?? new Map<string, number>()
    byPattern.set(row.patternId, row.num)
    counts.set(row.date, byPattern)
  }
  return counts
}

export function countAt(counts: CountsByDate, date: string, patternId: string): number {
  return counts.get(date)?.get(patternId) ?? 0
}

/**
 * その日の必要人数を満たしているか（v1 の `isSatisfy`）。
 *
 * 出勤日（`workday`）のパターンだけを見る（006 §10.6 の申し送り。休みに変えたパターンの
 * `required_nums` 行は残っているが、判定には使わない）。
 * v1 と同じく **不足も過剰も `!`**（`requiredNum != assignedCount`）。
 */
export function isSatisfied(
  date: string,
  workdayPatternIds: string[],
  required: CountsByDate,
  assigned: CountsByDate
): boolean {
  return workdayPatternIds.every(
    (patternId) => countAt(required, date, patternId) === countAt(assigned, date, patternId)
  )
}

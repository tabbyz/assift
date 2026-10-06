import type { ShiftMap } from './key'
import type { RequiredByDate, RequiredNum } from './requiredNums'

/** 日付 → パターン → 人数 */
export type CountsByDate = Map<string, Map<string, number>>

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

export function countAt(counts: CountsByDate, date: string, patternId: string): number {
  return counts.get(date)?.get(patternId) ?? 0
}

/**
 * その日・その勤務の必要人数。`null` は「まだ決めていない」（015 §3.2）。
 * 期間の外や、組み立てていない勤務も `null`（0 ではない）。
 */
export function requiredAt(required: RequiredByDate, date: string, patternId: string): RequiredNum {
  return required.get(date)?.get(patternId) ?? null
}

/**
 * その日の必要人数を満たしているか（v1 の `isSatisfy`）。
 *
 * 出勤日（`workday`）のパターンだけを見る（006 §10.6 の申し送り。休みに変えたパターンの
 * `required_nums` 行は残っているが、判定には使わない）。
 * v1 と同じく **不足も過剰も満たさない**（`requiredNum != assignedCount`）。
 * **必要人数が未設定（`null`）の組は判定から外す**（015 §3.2）。
 */
export function isSatisfied(
  date: string,
  workdayPatternIds: string[],
  required: RequiredByDate,
  assigned: CountsByDate
): boolean {
  return workdayPatternIds.every((patternId) => {
    const num = requiredAt(required, date, patternId)
    return num === null || num === countAt(assigned, date, patternId)
  })
}

/** フッターのマスの状態（015 §3.7）。`none` は何も出さない日（011 の 0/0 非表示） */
export type CoverageState = 'none' | 'unset' | 'ok' | 'short' | 'over'

/**
 * 日付ヘッダーではなく表の下のフッターに出す充足（011）。
 * `required` は出勤日パターンの合計。**すべて未設定なら `null`**（一部だけ未設定なら、決まっている分の合計）。
 */
export type DateCoverage = { assigned: number; required: RequiredNum; state: CoverageState }

export function coverageAt(
  date: string,
  workdayPatternIds: string[],
  required: RequiredByDate,
  assigned: CountsByDate
): DateCoverage {
  let assignedTotal = 0
  let requiredTotal = 0
  let anyRequired = false
  for (const patternId of workdayPatternIds) {
    assignedTotal += countAt(assigned, date, patternId)
    const num = requiredAt(required, date, patternId)
    if (num !== null) {
      requiredTotal += num
      anyRequired = true
    }
  }
  const requiredNum = anyRequired ? requiredTotal : null
  return {
    assigned: assignedTotal,
    required: requiredNum,
    state: coverageState(assignedTotal, requiredNum),
  }
}

function coverageState(assigned: number, required: RequiredNum): CoverageState {
  if (required === null) return assigned === 0 ? 'none' : 'unset'
  if (assigned === 0 && required === 0) return 'none'
  if (assigned < required) return 'short'
  if (assigned > required) return 'over'
  return 'ok'
}

/** フッターに数字を出す日か（011: 配置も必要人数も無い日は出さない） */
export function hasCoverage(coverage: DateCoverage | undefined): coverage is DateCoverage {
  return coverage !== undefined && coverage.state !== 'none'
}

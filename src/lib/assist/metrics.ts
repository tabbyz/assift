import { cellKey } from '@/lib/shifts/key'
import { isWeekendOrHoliday, isWorkday, type PlanRow, type Problem } from './problem'
import { filledCount } from './reasons'

/**
 * 充足率と偏りの指標（012 §5.2）。評価スクリプトと結果の説明（LLM に渡す材料）が共有する。
 * 数えるのは P の中の既存 + 計画（月全体の偏りを見る。目的関数の公平性の項と同じ母集団）。
 */

export type StaffMetrics = {
  staffId: string
  workdays: number
  weekends: number
  maxWorkWeek: number
  /** 勤務日数 / 期間中の上限（`max_work_week × 日数 / 7`） */
  utilization: number
}

export type AssistMetrics = {
  requested: number
  filled: number
  /** 0〜1。不足枠が 0 のときは 1 */
  fillRate: number
  utilization: { min: number; max: number; stdev: number }
  weekends: { min: number; max: number }
  staffs: StaffMetrics[]
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

export function computeMetrics(problem: Problem, plan: PlanRow[]): AssistMetrics {
  const cells = new Map(problem.existing)
  for (const row of plan) cells.set(cellKey(row.staffId, row.date), row.patternId)

  const weeks = problem.dates.length / 7
  const staffs: StaffMetrics[] = problem.staffs.map((staff) => {
    let workdays = 0
    let weekends = 0
    for (const date of problem.dates) {
      if (!isWorkday(problem, cells.get(cellKey(staff.id, date)))) continue
      workdays++
      if (isWeekendOrHoliday(problem, date)) weekends++
    }
    const capacity = staff.maxWorkWeek * weeks
    return {
      staffId: staff.id,
      workdays,
      weekends,
      maxWorkWeek: staff.maxWorkWeek,
      utilization: capacity > 0 ? round(workdays / capacity) : 0,
    }
  })

  // 上限 0 の人（勤務しない人）は偏りの母集団から外す
  const counted = staffs.filter((staff) => staff.maxWorkWeek > 0)
  const ratios = counted.map((staff) => staff.utilization)
  const mean = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0
  const variance =
    ratios.length > 0 ? ratios.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ratios.length : 0
  const weekendCounts = counted.map((staff) => staff.weekends)

  const filled = filledCount(problem, plan)
  return {
    requested: problem.requested,
    filled,
    fillRate: problem.requested > 0 ? round(filled / problem.requested) : 1,
    utilization: {
      min: ratios.length > 0 ? Math.min(...ratios) : 0,
      max: ratios.length > 0 ? Math.max(...ratios) : 0,
      stdev: round(Math.sqrt(variance)),
    },
    weekends: {
      min: weekendCounts.length > 0 ? Math.min(...weekendCounts) : 0,
      max: weekendCounts.length > 0 ? Math.max(...weekendCounts) : 0,
    },
    staffs,
  }
}

/**
 * 前の案からどれだけ変わったか（§3.10）。前案の `'assign'` 行のうち、新案に同じ `(staff, date, pattern)` が無い行の割合。
 * 前案が空なら null（比べられない）。
 */
export function changedRatio(previous: PlanRow[], next: PlanRow[]): number | null {
  const before = previous.filter((row) => row.source === 'assign')
  if (before.length === 0) return null
  const after = new Set(
    next
      .filter((row) => row.source === 'assign')
      .map((row) => `${row.staffId}|${row.date}|${row.patternId}`)
  )
  const changed = before.filter((row) => !after.has(`${row.staffId}|${row.date}|${row.patternId}`))
  return round(changed.length / before.length)
}

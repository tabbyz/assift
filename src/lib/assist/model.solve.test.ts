import { describe, expect, it } from 'vitest'
import { planAssignments } from './engine'
import { changedRatio } from './metrics'
import { SIMILAR_PLAN_THRESHOLD } from './result'
import { buildProblem, slotKey, staticBlock, type Problem } from './problem'
import { exceedsCapacity, filledCount, unfilledCounts } from './reasons'
import {
  fixtureInput,
  FIXTURE_PATTERNS as P,
  required,
  smallInput,
  type FixtureScale,
} from './testing/fixtures'
import { validatePlan } from './validate'

/**
 * 固定の問題（3 規模 × seed）で、ソルバーの解が検証器を通ること（012 §6.1）。
 * HiGHS を実際に動かす（WASM は Node で動く）。
 */

/** 候補（既存だけで決まる H1〜H4 + ペアの翌日）が枠数に足りない分。不足の下限 */
function shortageLowerBound(problem: Problem): number {
  let bound = 0
  for (const slot of problem.demand) {
    const candidates = problem.staffs.filter(
      (staff) => !staticBlock(problem, staff, slot.date, slot.patternId)
    ).length
    bound += Math.max(0, slot.count - candidates)
  }
  return bound
}

const CASES: [FixtureScale, number][] = [
  ['small', 1],
  ['small', 2],
  ['medium', 1],
  ['medium', 2],
  ['large', 1],
  ['large', 2],
]

describe.each(CASES)('固定の問題 %s（seed %i）', (scale, seed) => {
  it('解は検証器で違反 0・必要人数を超えない・不足の最小性が証明される', async () => {
    const problem = buildProblem(fixtureInput({ scale, seed }))
    const { plan, solver } = await planAssignments(problem)
    expect(validatePlan(problem, plan).rejected).toEqual([])
    expect(exceedsCapacity(problem, plan)).toBe(false)
    expect(solver.shortageOptimal).toBe(true)
    expect(problem.requested - filledCount(problem, plan)).toBeGreaterThanOrEqual(
      shortageLowerBound(problem)
    )
  }, 30_000)
})

describe('不足の最小性', () => {
  // fixture の制約と夜勤（毎日 1 人・明けで翌日が埋まる・選べるのは約 4 割）はそれだけで不足を生むので外す。
  // 候補の数だけで決まる下限に一致すれば、ソルバーが埋められる枠を残していないと言える
  it.each(['small', 'medium'] as const)(
    '余裕のある店舗（%s）では、不足 = 候補の足りない枠の数',
    async (scale) => {
      const input = fixtureInput({ scale, seed: 3, load: 0.35 })
      const problem = buildProblem({
        ...input,
        restrictions: [],
        requiredNums: input.requiredNums.filter((row) => row.patternId !== P.night),
      })
      const { plan } = await planAssignments(problem)
      expect(problem.requested - filledCount(problem, plan)).toBe(shortageLowerBound(problem))
    },
    30_000
  )
})

describe('別の案（§3.10）', () => {
  it('余地のある問題では、前の案と 1 割以上違う案が出る', async () => {
    const problem = buildProblem(fixtureInput({ scale: 'small', seed: 1, load: 0.6 }))
    const first = await planAssignments(problem)
    const second = await planAssignments(problem, { previousPlan: first.plan })
    expect(validatePlan(problem, second.plan).rejected).toEqual([])
    // 充足は犠牲にしない
    expect(filledCount(problem, second.plan)).toBe(filledCount(problem, first.plan))
    expect(changedRatio(first.plan, second.plan)).toBeGreaterThanOrEqual(SIMILAR_PLAN_THRESHOLD)
  }, 30_000)

  it('余地の無い問題では同じ案になり、「ほぼ同じ」と判定できる', async () => {
    // 1 人しか選べないパターンの枠だけ
    const staffs = smallInput().staffs.map((staff, index) => ({
      ...staff,
      patternIds: index === 0 ? [P.early] : [P.day],
    }))
    const problem = buildProblem(
      smallInput({
        staffs,
        requiredNums: required(P.early, ['2026-10-05', '2026-10-06', '2026-10-07'], 1),
      })
    )
    const first = await planAssignments(problem)
    const second = await planAssignments(problem, { previousPlan: first.plan })
    expect(second.plan).toEqual(first.plan)
    expect(changedRatio(first.plan, second.plan)).toBeLessThan(SIMILAR_PLAN_THRESHOLD)
  })

  it('同じ入力からは同じ案（決定的）', async () => {
    const problem = buildProblem(fixtureInput({ scale: 'small', seed: 2 }))
    const a = await planAssignments(problem)
    const b = await planAssignments(problem)
    expect(b.plan).toEqual(a.plan)
  }, 30_000)
})

describe('不足の数え方', () => {
  it('unfilledCounts は P の枠ごとの残り', async () => {
    const problem = buildProblem(
      smallInput({ staffCount: 1, requiredNums: required(P.early, ['2026-10-05'], 3) })
    )
    const { plan } = await planAssignments(problem)
    expect(unfilledCounts(problem, plan).get(slotKey('2026-10-05', P.early))).toBe(2)
  })
})

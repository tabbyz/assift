import { describe, expect, it } from 'vitest'
import { planAssignments } from './engine'
import { buildModel, shortageObjective } from './model'
import { buildProblem } from './problem'
import { exceedsCapacity, filledCount } from './reasons'
import { FIXTURE_PATTERNS as P, required, smallInput } from './testing/fixtures'
import { validatePlan } from './validate'

const WEEK = [
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
]

/** 3 人 × 7 日。seed と同じ制約 4 種と夜勤 → 明け */
const input = smallInput({
  restrictions: [
    { kind: 'deny_pattern_pair', days: null, pattern1Id: P.late, pattern2Id: P.early },
    { kind: 'max_work_week', days: 1, pattern1Id: P.night, pattern2Id: null },
    { kind: 'max_work_consecutive', days: 3, pattern1Id: null, pattern2Id: null },
    { kind: 'sat_or_sun_dayoff', days: null, pattern1Id: null, pattern2Id: null },
  ],
  requiredNums: [
    ...required(P.early, WEEK, 1),
    ...required(P.late, WEEK, 1),
    ...required(P.night, ['2026-10-06'], 1),
  ],
  shifts: [{ staffId: 's2', date: '2026-10-07', patternId: P.off }],
})

describe('buildModel', () => {
  const problem = buildProblem(input)
  const model = buildModel(problem)
  const lp = model.builder.toLp()

  it('変数は候補（空きセル × 選択可能 × 勤務できる曜日）の組だけ', () => {
    // 早番 7 日 × 3 人 + 遅番 7 日 × 3 人 − 既存のある s2 の 10/7（早番・遅番）
    // + 夜勤 10/6 × 2 人（s2 は翌日 10/7 に既存があり、明けを書けない）
    expect(model.cells.size).toBe(7 * 3 + 7 * 3 - 2 + 2)
    expect(
      [...model.cells.values()].some((cell) => cell.staffId === 's2' && cell.date === '2026-10-07')
    ).toBe(false)
  })

  it('不足変数は P の枠ごとに 1 つ', () => {
    expect(model.shortages.size).toBe(7 + 7 + 1)
    expect(shortageObjective(model).size).toBe(15)
  })

  it('LP 形式として読める形（目的関数・制約・Binary）', () => {
    expect(lp.startsWith('Minimize\n obj:')).toBe(true)
    expect(lp).toContain('Subject To')
    expect(lp).toContain('Binary')
    expect(lp.trimEnd().endsWith('End')).toBe(true)
  })

  it('H10 は「配置 + 不足 = 枠数」の等式で書く', () => {
    // 10/6 の夜勤: 候補 2 人の変数 + 不足変数 = 1
    expect(lp).toMatch(/r\d+: \+ 1 x0_2_3 \+ 1 x2_2_3 \+ 1 u2_3 = 1/)
  })

  it('夜勤の明け（休み）は着地日の枠を消費しない', () => {
    // 明け（P5 = index 4）の H10 行は作らない
    expect(lp).not.toMatch(/u\d+_4/)
  })
})

describe('solve → validatePlan', () => {
  it('違反 0・必要人数を超えない', async () => {
    const problem = buildProblem(input)
    const { plan, solver } = await planAssignments(problem)
    const result = validatePlan(problem, plan)
    expect(result.rejected).toEqual([])
    expect(exceedsCapacity(problem, plan)).toBe(false)
    expect(solver.shortageOptimal).toBe(true)
  })

  it('余地があれば全枠を埋める（4 人なら 15 枠に対して上限 20 日）', async () => {
    const problem = buildProblem({ ...input, staffs: smallInput({ staffCount: 4 }).staffs })
    const { plan } = await planAssignments(problem)
    expect(validatePlan(problem, plan).rejected).toEqual([])
    expect(filledCount(problem, plan)).toBe(15)
  })

  it('夜勤にはペアの明けが翌日に付く', async () => {
    const problem = buildProblem(input)
    const { plan } = await planAssignments(problem)
    const night = plan.find((row) => row.patternId === P.night)!
    expect(plan).toContainEqual({
      staffId: night.staffId,
      date: '2026-10-07',
      patternId: P.after,
      source: 'pair',
    })
  })

  it('候補がいなければ解かずに空の計画', async () => {
    const problem = buildProblem(
      smallInput({
        staffs: [
          {
            id: 's1',
            name: 'A',
            availableWdays: [],
            maxWorkWeek: 5,
            patternIds: [P.early],
            defaults: {},
          },
        ],
        requiredNums: required(P.early, WEEK, 1),
      })
    )
    const { plan, solver } = await planAssignments(problem)
    expect(plan).toEqual([])
    expect(solver.stages).toEqual([])
  })

  it('デフォルト勤務パターンを優先する', async () => {
    const staffs = [1, 2].map((n) => ({
      id: `s${n}`,
      name: `S${n}`,
      availableWdays: [0, 1, 2, 3, 4, 5, 6],
      maxWorkWeek: 5,
      patternIds: [P.early, P.day],
      defaults: n === 2 ? { '1': P.early } : {},
    }))
    const problem = buildProblem(
      smallInput({ staffs, requiredNums: required(P.early, ['2026-10-05'], 1) })
    )
    const { plan } = await planAssignments(problem)
    expect(plan).toEqual([
      { staffId: 's2', date: '2026-10-05', patternId: P.early, source: 'assign' },
    ])
  })
})

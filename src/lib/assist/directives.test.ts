import { describe, expect, it } from 'vitest'
import {
  describeDirective,
  evaluateDirective,
  resolveDirectives,
  type Directive,
  type InterpretOutput,
  type RawDirective,
} from './directives'
import { planAssignments } from './engine'
import { buildProblem } from './problem'
import { unfilledCounts } from './reasons'
import { FIXTURE_PATTERNS as P, required, smallInput } from './testing/fixtures'
import { stateOf, validatePlan } from './validate'

const WEEK = [
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
]

const raw = (overrides: Partial<RawDirective>): RawDirective => ({
  type: 'prefer_work',
  staff: 'S1',
  staffB: null,
  pattern: null,
  wdays: null,
  dates: null,
  count: null,
  scope: null,
  strength: 3,
  hard: false,
  ...overrides,
})

const output = (
  directives: RawDirective[],
  interpretations?: InterpretOutput['interpretations']
): InterpretOutput => ({
  directives,
  interpretations:
    interpretations ??
    directives.map((_, index) => ({ text: `指示${index}`, directive: index, note: null })),
})

describe('resolveDirectives', () => {
  const problem = buildProblem(smallInput())

  it('コードを id に、曜日を P の中の日付に解決する', () => {
    const { directives } = resolveDirectives(
      problem,
      output([raw({ type: 'prefer_work', staff: 'S2', wdays: [0, 6] })])
    )
    expect(directives).toEqual([
      {
        type: 'prefer_work',
        staffId: 's2',
        dates: ['2026-10-04', '2026-10-10'],
        strength: 3,
        hard: false,
        daysLabel: '土日',
      },
    ])
  })

  it('期間外・実在しない日付は捨て、曜日と日付はどちらかに当たる日', () => {
    const { directives } = resolveDirectives(
      problem,
      output([raw({ wdays: [1], dates: ['2026-10-07', '2026-10-20', '2026-02-30'] })])
    )
    expect(directives[0]).toMatchObject({
      dates: ['2026-10-05', '2026-10-07'],
      daysLabel: '月曜・10/7',
    })
  })

  it('知らないスタッフ・休みのパターン・期間内に当たらない指示は捨て、解釈に理由を残す', () => {
    const result = resolveDirectives(
      problem,
      output([
        raw({ staff: 'S9' }),
        raw({ type: 'prefer_pattern', pattern: 'P6' }),
        raw({ dates: ['2026-11-01'] }),
        raw({ type: 'limit_workdays', count: null }),
        raw({ type: 'same_days', staffB: 'S1' }),
      ])
    )
    expect(result.directives).toEqual([])
    expect(result.interpretations.map((item) => item.note)).toEqual([
      'スタッフが分かりませんでした',
      '休みのパターンは指定できません',
      '期間内に当たる日がありません',
      '日数が分かりませんでした',
      '同じスタッフどうしは指定できません',
    ])
    expect(result.interpretations.every((item) => item.directive === null)).toBe(true)
  })

  it('解釈の添字を解決後の並びに付け替え、解釈から漏れた条件も一覧に足す', () => {
    const result = resolveDirectives(
      problem,
      output(
        [raw({ staff: 'S9' }), raw({ staff: 'S1' }), raw({ staff: 'S2' })],
        [
          { text: 'a', directive: 0, note: null },
          { text: 'b', directive: 1, note: null },
          { text: '元気がない人の負荷を軽く', directive: null, note: '条件にできませんでした' },
        ]
      )
    )
    expect(result.directives.map((d) => ('staffId' in d ? d.staffId : null))).toEqual(['s1', 's2'])
    expect(result.interpretations).toEqual([
      { text: 'a', directive: null, note: 'スタッフが分かりませんでした' },
      { text: 'b', directive: 0, note: null },
      { text: '元気がない人の負荷を軽く', directive: null, note: '条件にできませんでした' },
      { text: '', directive: 1, note: null },
    ])
  })

  it('「必ず」でも日の指定が無い「優先」はソフト（強さ 5）に落とす', () => {
    const { directives } = resolveDirectives(
      problem,
      output([raw({ type: 'prefer_pattern', pattern: 'P1', hard: true })])
    )
    expect(directives[0]).toMatchObject({ hard: false, strength: 5 })
  })

  it('強さは 1〜5 に丸める', () => {
    const { directives } = resolveDirectives(
      problem,
      output([raw({ strength: 9 }), raw({ strength: 0.2 })])
    )
    expect(directives.map((d) => d.strength)).toEqual([5, 1])
  })

  it('describeDirective: 名前は TS が引く', () => {
    const { directives } = resolveDirectives(
      problem,
      output([
        raw({ type: 'prefer_work', wdays: [0, 6] }),
        raw({ type: 'same_days', staff: 'S2', staffB: 'S1', hard: true }),
        raw({ type: 'limit_workdays', count: 3, scope: 'week' }),
        raw({ type: 'fill_first', staff: null, pattern: 'P1', dates: ['2026-10-05'] }),
      ])
    )
    expect(directives.map((d) => describeDirective(problem, d))).toEqual([
      'スタッフ1 → 土日の勤務を優先（できれば）',
      'スタッフ2 → スタッフ1と同じ日に（必ず）',
      'スタッフ1 → 週 3日まで（できれば）',
      '10/5の早番を優先して埋める',
    ])
  })
})

/** 3 人・毎日 早番 1 枠 */
const base = smallInput({ requiredNums: required(P.early, WEEK, 1) })

async function solveWith(directives: Directive[], input = base) {
  const problem = buildProblem(input)
  const result = await planAssignments(problem, { directives })
  expect(validatePlan(problem, result.plan).rejected).toEqual([])
  return { problem, ...result }
}

const workdaysOf = (plan: { staffId: string; date: string }[], staffId: string, dates = WEEK) =>
  plan.filter((row) => row.staffId === staffId && dates.includes(row.date)).length

describe('MILP への変換', () => {
  it('prefer_work（ソフト）: 土日は S1 に寄る', async () => {
    const { plan } = await solveWith([
      {
        type: 'prefer_work',
        staffId: 's1',
        dates: ['2026-10-04', '2026-10-10'],
        strength: 3,
        hard: false,
        daysLabel: '土日',
      },
    ])
    expect(workdaysOf(plan, 's1', ['2026-10-04', '2026-10-10'])).toBe(2)
  })

  it('avoid_pattern（ハード）: 指定の人は入らない', async () => {
    const { plan } = await solveWith([
      {
        type: 'avoid_pattern',
        staffId: 's1',
        patternId: P.early,
        dates: WEEK,
        strength: 3,
        hard: true,
        daysLabel: '',
      },
    ])
    expect(workdaysOf(plan, 's1')).toBe(0)
  })

  it('same_days（ハード）: A が勤務する日は B も勤務', async () => {
    const input = smallInput({
      requiredNums: [...required(P.early, WEEK, 1), ...required(P.day, WEEK, 1)],
    })
    const { plan } = await solveWith(
      [
        {
          type: 'same_days',
          staffId: 's3',
          staffBId: 's1',
          strength: 3,
          hard: true,
          daysLabel: '',
        },
      ],
      input
    )
    const s1Days = new Set(plan.filter((row) => row.staffId === 's1').map((row) => row.date))
    for (const row of plan.filter((row) => row.staffId === 's3'))
      expect(s1Days.has(row.date)).toBe(true)
  })

  it('different_days（ハード）: 同じ日に入らない', async () => {
    const input = smallInput({
      requiredNums: [...required(P.early, WEEK, 1), ...required(P.day, WEEK, 1)],
    })
    const { plan } = await solveWith(
      [
        {
          type: 'different_days',
          staffId: 's1',
          staffBId: 's2',
          strength: 3,
          hard: true,
          daysLabel: '',
        },
      ],
      input
    )
    const s1Days = new Set(plan.filter((row) => row.staffId === 's1').map((row) => row.date))
    expect(plan.filter((row) => row.staffId === 's2' && s1Days.has(row.date))).toEqual([])
  })

  it('limit_workdays（ハード・期間）/ min_workdays（ハード・期間）', async () => {
    const limited = await solveWith([
      {
        type: 'limit_workdays',
        staffId: 's1',
        count: 1,
        scope: 'period',
        strength: 3,
        hard: true,
        daysLabel: '',
      },
    ])
    expect(workdaysOf(limited.plan, 's1')).toBeLessThanOrEqual(1)
    const minimum = await solveWith([
      {
        type: 'min_workdays',
        staffId: 's3',
        count: 5,
        scope: 'period',
        strength: 3,
        hard: true,
        daysLabel: '',
      },
    ])
    expect(workdaysOf(minimum.plan, 's3')).toBeGreaterThanOrEqual(5)
  })

  it('fill_first: 埋めきれないとき、指定の日を優先して埋める', async () => {
    const input = smallInput({
      staffCount: 1,
      requiredNums: required(P.early, ['2026-10-05', '2026-10-06'], 1),
    })
    const directives: Directive[] = [
      {
        type: 'limit_workdays',
        staffId: 's1',
        count: 1,
        scope: 'period',
        strength: 3,
        hard: true,
        daysLabel: '',
      },
      {
        type: 'fill_first',
        dates: ['2026-10-06'],
        patternId: null,
        strength: 3,
        hard: false,
        daysLabel: '10/6',
      },
    ]
    const { plan } = await solveWith(directives, input)
    expect(plan.map((row) => row.date)).toEqual(['2026-10-06'])
  })

  it('ハードな指示で解が無くなったら、ソフトに落として 1 回だけ解き直す', async () => {
    // S1 は日曜に勤務できない。「必ず日曜に勤務」は守れない
    const staffs = smallInput().staffs.map((staff) =>
      staff.id === 's1' ? { ...staff, availableWdays: [1, 2, 3, 4, 5, 6] } : staff
    )
    const { plan, solver } = await solveWith(
      [
        {
          type: 'prefer_work',
          staffId: 's1',
          dates: ['2026-10-04'],
          strength: 3,
          hard: true,
          daysLabel: '日曜',
        },
        {
          type: 'avoid_pattern',
          staffId: 's2',
          patternId: P.early,
          dates: WEEK,
          strength: 3,
          hard: true,
          daysLabel: '',
        },
      ],
      smallInput({ staffs, requiredNums: required(P.early, WEEK, 1) })
    )
    expect(solver.relaxed).toBe(true)
    // 緩めたあとも、もう一方の指示は強さ 5 のソフトとして効く
    expect(workdaysOf(plan, 's2')).toBe(0)
  })

  it('min_workdays（ハード）が枠数を超えると解が無く、緩めて解く', async () => {
    const { solver } = await solveWith([
      {
        type: 'min_workdays',
        staffId: 's1',
        count: 9,
        scope: 'period',
        strength: 3,
        hard: true,
        daysLabel: '',
      },
    ])
    expect(solver.relaxed).toBe(true)
  })
})

describe('evaluateDirective', () => {
  it('守れたかを保存する計画で数える（既存を含む）', () => {
    const problem = buildProblem(
      smallInput({ shifts: [{ staffId: 's1', date: '2026-10-05', patternId: P.day }] })
    )
    const state = stateOf(problem, [
      { staffId: 's1', date: '2026-10-06', patternId: P.early, source: 'assign' },
    ])
    const unfilledAt = () => 0
    expect(
      evaluateDirective(
        problem,
        state,
        {
          type: 'limit_workdays',
          staffId: 's1',
          count: 1,
          scope: 'period',
          strength: 3,
          hard: false,
          daysLabel: '',
        },
        unfilledAt
      )
    ).toEqual({ kept: false, detail: '期間中最大 2日' })
    expect(
      evaluateDirective(
        problem,
        state,
        {
          type: 'prefer_work',
          staffId: 's1',
          dates: ['2026-10-04', '2026-10-05'],
          strength: 3,
          hard: false,
          daysLabel: '',
        },
        unfilledAt
      )
    ).toEqual({ kept: true, detail: '2日中 1日' })
    expect(
      evaluateDirective(
        problem,
        state,
        {
          type: 'prefer_off',
          staffId: 's1',
          dates: ['2026-10-06'],
          strength: 3,
          hard: true,
          daysLabel: '',
        },
        unfilledAt
      )
    ).toEqual({ kept: false, detail: '1日入っています' })
  })

  it('fill_first は指定の枠が残っていれば守れていない', () => {
    const problem = buildProblem(
      smallInput({ staffCount: 0, requiredNums: required(P.early, ['2026-10-05'], 2) })
    )
    const left = unfilledCounts(problem, [])
    const outcome = evaluateDirective(
      problem,
      stateOf(problem, []),
      {
        type: 'fill_first',
        dates: ['2026-10-05'],
        patternId: P.early,
        strength: 3,
        hard: false,
        daysLabel: '',
      },
      (date, patternId) => left.get(`${date}|${patternId}`) ?? 0
    )
    expect(outcome).toEqual({ kept: false, detail: '2枠が残りました' })
  })
})

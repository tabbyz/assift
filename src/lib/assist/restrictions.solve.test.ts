import { describe, expect, it } from 'vitest'
import { datesBetween } from '@/lib/calendar/dateString'
import type { Directive } from './directives'
import { planAssignments } from './engine'
import { evaluateLevers, leverCandidates } from './levers'
import { buildProblem, type PlanRow, type Problem } from './problem'
import { explainUnfilled, filledCount } from './reasons'
import { restrictionOutcomes } from './restrictionOutcomes'
import { FIXTURE_PATTERNS as P, required, restrictionRow, smallInput } from './testing/fixtures'
import { restrictionLabel, validatePlan } from './validate'

/**
 * スタッフ別の制約と「必須 / なるべく」（013 §5.4）。HiGHS を実際に動かす。
 * smallInput の期間は日曜 10/4〜土曜 10/10 の 1 週間（週の始まり = 日曜）。
 */

const WEEK = datesBetween('2026-10-04', '2026-10-10')
const WEDNESDAY = '2026-10-07'

const workdays = (plan: PlanRow[], staffId: string) =>
  plan.filter((row) => row.staffId === staffId && row.patternId !== P.after).length

async function solve(problem: Problem, directives: Directive[] = []) {
  const solved = await planAssignments(problem, { directives })
  expect(validatePlan(problem, solved.plan).rejected).toEqual([])
  return solved
}

describe('スタッフ別の制約', () => {
  it('その人にだけ効く（店舗全体なら 2 枠しか埋まらない問題で 6 枠）', async () => {
    const problem = buildProblem(
      smallInput({
        staffCount: 2,
        requiredNums: required(P.early, WEEK, 1),
        restrictions: [
          restrictionRow({ kind: 'max_work_week', days: 1, pattern1Id: P.early, staffId: 's1' }),
        ],
      })
    )
    const { plan } = await solve(problem)
    expect(workdays(plan, 's1')).toBe(1)
    expect(filledCount(problem, plan)).toBe(6)
  })

  it('検証器は他の人の行を落とさない', () => {
    const problem = buildProblem(
      smallInput({
        staffCount: 2,
        requiredNums: required(P.early, WEEK, 2),
        restrictions: [
          restrictionRow({ kind: 'max_work_week', days: 1, pattern1Id: P.early, staffId: 's1' }),
        ],
      })
    )
    const plan: PlanRow[] = ['2026-10-05', '2026-10-06'].flatMap((date) => [
      { staffId: 's1', date, patternId: P.early, source: 'assign' as const },
      { staffId: 's2', date, patternId: P.early, source: 'assign' as const },
    ])
    const { accepted, rejected } = validatePlan(problem, plan)
    expect(accepted.filter((row) => row.staffId === 's2')).toHaveLength(2)
    expect(rejected.map((unit) => unit.rows[0].staffId)).toEqual(['s1'])
  })

  it('ラベルにスタッフ名が付く。店舗全体の文言は変わらない', () => {
    const problem = buildProblem(
      smallInput({
        restrictions: [
          restrictionRow({ kind: 'max_work_week', days: 2, pattern1Id: P.early, staffId: 's1' }),
          restrictionRow({ kind: 'max_work_week', days: 2, pattern1Id: P.early }),
        ],
      })
    )
    expect(problem.restrictions.map((r) => restrictionLabel(problem, r))).toEqual([
      'スタッフ1 · 早番は1週間に2日まで',
      '早番は1週間に2日まで',
    ])
  })

  it('在籍でないスタッフの規則は捨てる。なるべく休みの曜日は必須でもソフト', () => {
    const problem = buildProblem(
      smallInput({
        restrictions: [
          restrictionRow({ kind: 'min_work_week', days: 3, staffId: 'retired' }),
          restrictionRow({ kind: 'prefer_dayoff_wdays', wdays: [3], staffId: 's1', hard: true }),
        ],
      })
    )
    expect(problem.restrictions).toHaveLength(1)
    expect(problem.restrictions[0]).toMatchObject({ kind: 'prefer_dayoff_wdays', hard: false })
  })
})

describe('なるべく（ソフト）', () => {
  it('上限は破れる。不足は増やさず、守れなかったことが残る', async () => {
    const problem = buildProblem(
      smallInput({
        staffCount: 2,
        requiredNums: required(P.early, WEEK, 1),
        restrictions: [
          restrictionRow({
            kind: 'max_work_week',
            days: 1,
            pattern1Id: P.early,
            staffId: 's1',
            hard: false,
          }),
        ],
      })
    )
    const { plan } = await solve(problem)
    expect(filledCount(problem, plan)).toBe(7)
    expect(restrictionOutcomes(problem, plan)).toEqual([
      {
        restrictionId: problem.restrictions[0].id,
        label: 'スタッフ1 · 早番は1週間に1日まで',
        hard: false,
        detail: '週最大 2日',
      },
    ])
  })

  it('なるべく休みの曜日は、代わりがいれば空ける。いなければ入れて残す', async () => {
    const restrictions = [
      restrictionRow({ kind: 'prefer_dayoff_wdays', wdays: [3], staffId: 's1', hard: false }),
    ]
    const two = buildProblem(
      smallInput({ staffCount: 2, requiredNums: required(P.early, [WEDNESDAY], 1), restrictions })
    )
    const { plan } = await solve(two)
    expect(plan.map((row) => row.staffId)).toEqual(['s2'])
    expect(restrictionOutcomes(two, plan)).toEqual([])

    const one = buildProblem(
      smallInput({ staffCount: 1, requiredNums: required(P.early, [WEDNESDAY], 1), restrictions })
    )
    const alone = await solve(one)
    expect(filledCount(one, alone.plan)).toBe(1)
    expect(restrictionOutcomes(one, alone.plan)[0].detail).toBe('1日入っています')
  })
})

describe('週の最低勤務日数', () => {
  it('なるべくでも偏りの項より強く効く', async () => {
    const problem = buildProblem(
      smallInput({
        requiredNums: required(P.early, WEEK, 1),
        restrictions: [
          restrictionRow({ kind: 'min_work_week', days: 4, staffId: 's3', hard: false }),
        ],
      })
    )
    const { plan } = await solve(problem)
    expect(workdays(plan, 's3')).toBeGreaterThanOrEqual(4)
    expect(restrictionOutcomes(problem, plan)).toEqual([])
  })

  it('同じ意味の指示（min_workdays・強さ 3）と同じ結果になる（④ で指示から保存しても変わらない）', async () => {
    const input = smallInput({ requiredNums: required(P.early, WEEK, 1) })
    const byRestriction = buildProblem({
      ...input,
      restrictions: [
        restrictionRow({ kind: 'min_work_week', days: 4, staffId: 's3', hard: false }),
      ],
    })
    const byDirective = buildProblem(input)
    const directive: Directive = {
      type: 'min_workdays',
      staffId: 's3',
      count: 4,
      scope: 'week',
      strength: 3,
      hard: false,
      daysLabel: '',
    }
    const a = await solve(byRestriction)
    const b = await solve(byDirective, [directive])
    expect(workdays(a.plan, 's3')).toBe(workdays(b.plan, 's3'))
    expect(filledCount(byRestriction, a.plan)).toBe(filledCount(byDirective, b.plan))
  })

  it('必須で解が無くなったら、緩めて 1 回だけ解き直し、守れなかったことを残す', async () => {
    // 4 枠を 2 人が 3 日ずつ取り合う
    const problem = buildProblem(
      smallInput({
        staffCount: 2,
        requiredNums: required(P.early, WEEK.slice(1, 5), 1),
        restrictions: [restrictionRow({ kind: 'min_work_week', days: 3 })],
      })
    )
    const { plan, solver } = await solve(problem)
    // 規則だけを緩めた（指示は無いので「『必ず』の指示を守れなかった」は出さない）
    expect(solver.relaxedRestrictions).toBe(true)
    expect(solver.relaxed).toBe(false)
    expect(filledCount(problem, plan)).toBe(4)
    const outcomes = restrictionOutcomes(problem, plan)
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({ hard: true, label: '週に3日以上は入れる' })
    // 緩めたあとは公平性の項で 2 日ずつに分かれる（足りない日数の合計はどう分けても 2 日）
    expect(outcomes[0].detail).toBe('スタッフ1 週最少 2日 · スタッフ2 週最少 2日')
  })

  it('その週に入れる日数が足りない人は、緩めて解き直さずにその人だけソフトにする', async () => {
    const staffs = smallInput({ staffCount: 2 }).staffs.map((staff) =>
      staff.id === 's1' ? { ...staff, maxWorkWeek: 2 } : staff
    )
    const problem = buildProblem(
      smallInput({
        staffs,
        requiredNums: required(P.early, WEEK, 1),
        restrictions: [restrictionRow({ kind: 'min_work_week', days: 3 })],
      })
    )
    const { plan, solver } = await solve(problem)
    expect(solver.relaxed).toBe(false)
    expect(solver.relaxedRestrictions).toBe(false)
    // s2 には必須のまま効いている
    expect(workdays(plan, 's2')).toBeGreaterThanOrEqual(3)
    expect(restrictionOutcomes(problem, plan).map((o) => o.detail)).toEqual([
      'スタッフ1 週最少 2日',
    ])
  })
})

describe('緩め方は 2 段（013 §3.5）', () => {
  it('規則を緩めれば解けるなら、店長の「必ず」の指示は緩めない', async () => {
    // 4 枠を 2 人が 3 日ずつ取り合う（規則だけで解なし）。指示「s1 は水曜に必ず勤務」はそれだけなら守れる
    const problem = buildProblem(
      smallInput({
        staffCount: 2,
        requiredNums: required(P.early, WEEK.slice(1, 5), 1),
        restrictions: [restrictionRow({ kind: 'min_work_week', days: 3 })],
      })
    )
    const directive: Directive = {
      type: 'prefer_work',
      staffId: 's1',
      dates: [WEDNESDAY],
      strength: 3,
      hard: true,
      daysLabel: '水曜',
    }
    const { plan, solver } = await solve(problem, [directive])
    expect(solver.relaxedRestrictions).toBe(true)
    expect(solver.relaxed).toBe(false)
    expect(plan.some((row) => row.staffId === 's1' && row.date === WEDNESDAY)).toBe(true)
  })

  it('指示だけが原因なら、指示だけを緩める（規則は必須のまま）', async () => {
    // 指示「s1 は水曜に必ず勤務」だが、水曜に枠が無い
    const problem = buildProblem(
      smallInput({
        staffCount: 2,
        requiredNums: required(P.early, ['2026-10-05'], 1),
        restrictions: [restrictionRow({ kind: 'min_work_week', days: 1, staffId: 's2' })],
      })
    )
    const directive: Directive = {
      type: 'prefer_work',
      staffId: 's1',
      dates: [WEDNESDAY],
      strength: 3,
      hard: true,
      daysLabel: '水曜',
    }
    const { plan, solver } = await solve(problem, [directive])
    expect(solver.relaxed).toBe(true)
    expect(solver.relaxedRestrictions).toBe(false)
    // s2 の「週 1 日以上」は必須のまま守られている
    expect(workdays(plan, 's2')).toBeGreaterThanOrEqual(1)
  })

  it('規則だけ・指示だけのどちらでも解けなければ、両方を緩める', async () => {
    // 1 枠を 2 人が「週 1 日以上（必須）」で取り合い、さらに「s1 は水曜に必ず勤務」（水曜に枠が無い）
    const problem = buildProblem(
      smallInput({
        staffCount: 2,
        requiredNums: required(P.early, ['2026-10-05'], 1),
        restrictions: [restrictionRow({ kind: 'min_work_week', days: 1 })],
      })
    )
    const directive: Directive = {
      type: 'prefer_work',
      staffId: 's1',
      dates: [WEDNESDAY],
      strength: 3,
      hard: true,
      daysLabel: '水曜',
    }
    const { solver } = await solve(problem, [directive])
    expect(solver.relaxed).toBe(true)
    expect(solver.relaxedRestrictions).toBe(true)
  })
})

describe('緩める必要の無い規則では解き直さない', () => {
  it('必須の下限がどの週もソフトになっているなら、指示の緩めだけで解き直す', async () => {
    // s1 は週 2 日まで → 週 3 日以上は最初からソフト。解が無いのは「水曜に必ず勤務」（水曜に枠が無い）だけ
    const staffs = smallInput({ staffCount: 1 }).staffs.map((staff) => ({
      ...staff,
      maxWorkWeek: 2,
    }))
    const problem = buildProblem(
      smallInput({
        staffs,
        requiredNums: required(P.early, ['2026-10-05'], 1),
        restrictions: [restrictionRow({ kind: 'min_work_week', days: 3 })],
      })
    )
    const directive: Directive = {
      type: 'prefer_work',
      staffId: 's1',
      dates: [WEDNESDAY],
      strength: 3,
      hard: true,
      daysLabel: '水曜',
    }
    const { solver } = await solve(problem, [directive])
    expect(solver.relaxed).toBe(true)
    expect(solver.relaxedRestrictions).toBe(false)
    // 1 回目 + 指示を緩めた 1 回（規則だけ緩める同じ問題を解いていない）。各回は 1 段で infeasible か 2 段
    expect(solver.stages.filter((stage) => stage.status === 'Infeasible')).toHaveLength(1)
  })
})

describe('守れなかった制約の数え方', () => {
  it('期間の前日の行との組み合わせも数える（model のソフト項と同じ範囲）', () => {
    const problem = buildProblem(
      smallInput({
        staffCount: 1,
        requiredNums: required(P.early, ['2026-10-04'], 1),
        shifts: [{ staffId: 's1', date: '2026-10-03', patternId: P.late }],
        restrictions: [
          restrictionRow({
            kind: 'deny_pattern_pair',
            pattern1Id: P.late,
            pattern2Id: P.early,
            hard: false,
          }),
        ],
      })
    )
    const plan: PlanRow[] = [
      { staffId: 's1', date: '2026-10-04', patternId: P.early, source: 'assign' },
    ]
    expect(restrictionOutcomes(problem, plan).map((o) => o.detail)).toEqual(['スタッフ1 1回'])
  })

  it('なるべく休みの曜日の文言は設定画面と同じ並び', () => {
    const problem = buildProblem(
      smallInput({
        restrictions: [
          restrictionRow({
            kind: 'prefer_dayoff_wdays',
            wdays: [5, 3],
            staffId: 's1',
            hard: false,
          }),
        ],
      })
    )
    expect(restrictionLabel(problem, problem.restrictions[0])).toBe(
      'スタッフ1 · 水・金曜はなるべく休み'
    )
  })
})

describe('土日祝の上限', () => {
  const input = smallInput({
    staffCount: 1,
    requiredNums: required(P.early, ['2026-10-04', '2026-10-10'], 1),
    restrictions: [restrictionRow({ kind: 'max_weekend_days', days: 1, staffId: 's1' })],
  })

  it('必須なら守り、理由と効く一手に名前が出る', async () => {
    const problem = buildProblem(input)
    const { plan, solver } = await solve(problem)
    expect(filledCount(problem, plan)).toBe(1)

    const unfilled = explainUnfilled(problem, plan, {
      shortageOptimal: solver.shortageOptimal,
      hardDirectives: false,
    })
    expect(unfilled[0].breakdown).toEqual([
      { label: '「スタッフ1 · 土日祝は期間中1日まで」', count: 1 },
    ])
    expect(leverCandidates(problem, [], new Set(), false, unfilled)).toEqual([
      { kind: 'restriction', restrictionIndex: 0, action: 'relax' },
    ])

    const levers = await evaluateLevers({
      input,
      saved: plan,
      directives: [],
      disabled: new Set(),
      relaxed: false,
      unfilled,
    })
    expect(levers).toHaveLength(1)
    expect(levers[0]).toMatchObject({
      kind: 'restriction',
      relaxedTo: 2,
      gain: 1,
      restrictionId: problem.restrictions[0].id,
    })
  })

  it('祝日も数える', async () => {
    const problem = buildProblem({
      ...input,
      holidays: ['2026-10-05'],
      requiredNums: required(P.early, ['2026-10-05', '2026-10-06'], 1),
    })
    const { plan } = await solve(problem)
    // 10/5（祝）と 10/6（平日）。上限 1 日でも平日は入る
    expect(filledCount(problem, plan)).toBe(2)
  })
})

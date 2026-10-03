import { describe, expect, it } from 'vitest'
import type { Directive } from './directives'
import { planAssignments } from './engine'
import {
  evaluateLevers,
  leverCandidates,
  matchRestrictionIndex,
  relaxedRestrictionList,
  restrictionsForLever,
  whatIfBase,
} from './levers'
import { buildProblem, type AssistInput } from './problem'
import { explainUnfilled } from './reasons'
import { FIXTURE_PATTERNS as P, required, restrictionRow, smallInput } from './testing/fixtures'
import { validatePlan } from './validate'

/** 2026-10-04（日）〜 10-10（土）の毎日 */
const WEEK = ['04', '05', '06', '07', '08', '09', '10'].map((day) => `2026-10-${day}`)

/** スタッフ 1 は期間中 0 日（必ず） */
const NO_S1: Directive = {
  type: 'limit_workdays',
  staffId: 's1',
  count: 0,
  scope: 'period',
  strength: 5,
  hard: true,
  daysLabel: '',
}

/** 実行と同じ手順で、保存までを再現する */
async function runOnce(input: AssistInput, directives: Directive[]) {
  const problem = buildProblem(input)
  const solved = await planAssignments(problem, { directives })
  const saved = validatePlan(problem, solved.plan).accepted
  const unfilled = explainUnfilled(problem, saved, {
    shortageOptimal: solved.solver.shortageOptimal,
    hardDirectives: directives.some((directive) => directive.hard),
  })
  return { problem, solved, saved, unfilled }
}

describe('evaluateLevers', () => {
  // 早番 1 人 × 7 日。スタッフ 2・3 は週 2 日まで。スタッフ 1 が入れないと 4 枠で止まり、残りの 3 日は別々の日になる
  const base = smallInput()
  const input = smallInput({
    requiredNums: required(P.early, WEEK, 1),
    staffs: base.staffs.map((staff, index) => (index === 0 ? staff : { ...staff, maxWorkWeek: 2 })),
  })

  it('ハードな指示を外すと埋まる枠を数え、入る行はその人の行だけ', async () => {
    const { problem, saved, unfilled, solved } = await runOnce(input, [NO_S1])
    expect(problem.requested - saved.length).toBe(3)

    const levers = await evaluateLevers({
      input,
      saved,
      directives: [NO_S1],
      disabled: new Set(),
      relaxed: solved.solver.relaxed,
      unfilled,
    })
    expect(levers).toHaveLength(1)
    expect(levers[0]).toMatchObject({
      kind: 'directive',
      label: 'スタッフ1 → 期間中 0日まで（必ず）',
      action: 'remove',
      directiveIndex: 0,
      gain: 3,
      byPattern: [{ patternId: P.early, count: 3 }],
    })
    expect(levers[0].rows.every((row) => row.staffId === 's1')).toBe(true)
  }, 30_000)

  it('試算の行は、同じ表で指示を外して解き直した結果と一致する（「作り直す」が点線どおりに入る）', async () => {
    const { saved, unfilled } = await runOnce(input, [NO_S1])
    const [lever] = await evaluateLevers({
      input,
      saved,
      directives: [NO_S1],
      disabled: new Set(),
      relaxed: false,
      unfilled,
    })

    // applyAssistLever は「前の下書きを含むいまの表」で問題を組み、外した指示を除いて解く
    const table = whatIfBase(input, saved)
    const applied = await planAssignments(table, { directives: [] })
    const key = (row: { staffId: string; date: string; patternId: string }) =>
      `${row.staffId}|${row.date}|${row.patternId}`
    expect(validatePlan(table, applied.plan).accepted.map(key).sort()).toEqual(
      lever.rows.map(key).sort()
    )
  }, 30_000)

  it('外した指示は候補にしない', async () => {
    const { saved, unfilled } = await runOnce(input, [])
    const levers = await evaluateLevers({
      input,
      saved,
      directives: [NO_S1],
      disabled: new Set([0]),
      relaxed: false,
      unfilled,
    })
    expect(levers).toEqual([])
  }, 30_000)

  it('制約は日数を 1 増やして試算する', async () => {
    // 早番は週 1 日まで。3 人で 3 枠しか埋まらない。2 日にすると 6 枠
    const restricted = smallInput({
      requiredNums: required(P.early, WEEK, 1),
      restrictions: [
        restrictionRow({ kind: 'max_work_week', days: 1, pattern1Id: P.early, pattern2Id: null }),
      ],
    })
    const { saved, unfilled } = await runOnce(restricted, [])
    expect(saved).toHaveLength(3)

    const levers = await evaluateLevers({
      input: restricted,
      saved,
      directives: [],
      disabled: new Set(),
      relaxed: false,
      unfilled,
    })
    expect(levers).toHaveLength(1)
    expect(levers[0]).toMatchObject({
      kind: 'restriction',
      label: '「早番は1週間に1日まで」',
      action: 'relax',
      relaxedTo: 2,
      directiveIndex: null,
      restrictionIndex: 0,
      gain: 3,
    })
  }, 30_000)

  it('不足が無ければ試算しない', async () => {
    const { saved, unfilled } = await runOnce(
      smallInput({ requiredNums: required(P.early, WEEK, 1) }),
      []
    )
    expect(unfilled).toEqual([])
    const levers = await evaluateLevers({
      input: smallInput({ requiredNums: required(P.early, WEEK, 1) }),
      saved,
      directives: [NO_S1],
      disabled: new Set(),
      relaxed: false,
      unfilled,
    })
    expect(levers).toEqual([])
  }, 30_000)
})

describe('leverCandidates', () => {
  const problem = buildProblem(
    smallInput({
      restrictions: [
        restrictionRow({ kind: 'max_work_week', days: 1, pattern1Id: P.early, pattern2Id: null }),
        restrictionRow({
          kind: 'sat_or_sun_dayoff',
          days: null,
          pattern1Id: null,
          pattern2Id: null,
        }),
      ],
    })
  )
  const soft: Directive = { ...NO_S1, hard: false }

  it('ハードな指示だけ。緩めて解き直した実行では指示を候補にしない', () => {
    expect(leverCandidates(problem, [soft, NO_S1], new Set(), false, [])).toEqual([
      { kind: 'directive', directiveIndex: 1 },
    ])
    expect(leverCandidates(problem, [NO_S1], new Set(), true, [])).toEqual([])
  })

  it('制約は理由に名前が出たものだけ、出た回数の多い順。外すか 1 日増やすか', () => {
    const unfilled = [
      { breakdown: [{ label: '「土日のどちらかは休み」', count: 1 }] },
      {
        breakdown: [
          { label: '「早番は1週間に1日まで」', count: 1 },
          { label: '「土日のどちらかは休み」', count: 2 },
        ],
      },
    ]
    expect(leverCandidates(problem, [], new Set(), false, unfilled)).toEqual([
      { kind: 'restriction', restrictionIndex: 1, action: 'remove' },
      { kind: 'restriction', restrictionIndex: 0, action: 'relax' },
    ])
  })
})

describe('matchRestrictionIndex', () => {
  const problem = buildProblem(
    smallInput({
      restrictions: [
        restrictionRow({ kind: 'max_work_week', days: 1, pattern1Id: P.early, pattern2Id: null }),
        restrictionRow({
          kind: 'sat_or_sun_dayoff',
          days: null,
          pattern1Id: null,
          pattern2Id: null,
        }),
      ],
    })
  )
  const weekLabel = '「早番 は1週間に 1日 まで」'

  it('添字がまだ同じ制約ならそれを使う', () => {
    expect(matchRestrictionIndex(problem, { restrictionIndex: 0, label: weekLabel })).toBe(0)
  })

  it('添字の先が別の制約になっていたら、ラベルで引き直す', () => {
    expect(matchRestrictionIndex(problem, { restrictionIndex: 1, label: weekLabel })).toBe(0)
    expect(matchRestrictionIndex(problem, { restrictionIndex: null, label: weekLabel })).toBe(0)
  })

  it('見つからなければ null。日数の制約は 1 日増やし、それ以外は外す', () => {
    expect(matchRestrictionIndex(problem, { restrictionIndex: 0, label: '「無い」' })).toBeNull()
    expect(relaxedRestrictionList(problem, 0)).toEqual([
      { ...problem.restrictions[0], days: 2 },
      problem.restrictions[1],
    ])
    expect(relaxedRestrictionList(problem, 1)).toEqual([problem.restrictions[0]])
    expect(relaxedRestrictionList(problem, 9)).toBeNull()
  })
})

describe('restrictionsForLever', () => {
  const problem = buildProblem(
    smallInput({
      restrictions: [
        restrictionRow({ kind: 'max_work_week', days: 2, pattern1Id: P.early, pattern2Id: null }),
        restrictionRow({
          kind: 'sat_or_sun_dayoff',
          days: null,
          pattern1Id: null,
          pattern2Id: null,
        }),
      ],
    })
  )

  it('試算の日数まで緩める。店舗がまだ前の日数でも、続けて緩めた試算の日数にする', () => {
    expect(
      restrictionsForLever(problem, {
        restrictionIndex: 0,
        label: '「早番 は1週間に 2日 まで」',
        action: 'relax',
        relaxedTo: 3,
      })
    ).toEqual([{ ...problem.restrictions[0], days: 3 }, problem.restrictions[1]])
    // 一度 3 日で解いたあとの次の一手。店舗の行は 2 日のまま
    expect(
      restrictionsForLever(problem, {
        restrictionIndex: 0,
        label: '「早番 は1週間に 3日 まで」',
        action: 'relax',
        relaxedTo: 4,
      })
    ).toEqual([{ ...problem.restrictions[0], days: 4 }, problem.restrictions[1]])
  })

  it('id が同じでも、中身を書き換えた制約には当てない（013）', () => {
    const edited = buildProblem(
      smallInput({
        restrictions: [
          restrictionRow({ id: 'r1', kind: 'max_work_week', days: 1, pattern1Id: P.night }),
        ],
      })
    )
    const lever = {
      restrictionIndex: 0,
      restrictionId: 'r1',
      label: '「早番は1週間に2日まで」',
      relaxedTo: 3,
    }
    expect(restrictionsForLever(edited, { ...lever, action: 'relax' })).toBeNull()
    expect(restrictionsForLever(edited, { ...lever, action: 'remove' })).toBeNull()
  })

  it('同じ文言の制約が 2 つあるときは id の方を緩める（013）', () => {
    const twins = buildProblem(
      smallInput({
        restrictions: [
          restrictionRow({ id: 'a', kind: 'max_work_week', days: 2, pattern1Id: P.early }),
          restrictionRow({ id: 'b', kind: 'max_work_week', days: 2, pattern1Id: P.early }),
        ],
      })
    )
    const relaxed = restrictionsForLever(twins, {
      restrictionIndex: null,
      restrictionId: 'b',
      label: '「早番は1週間に2日まで」',
      action: 'relax',
      relaxedTo: 3,
    })
    expect(relaxed?.map((r) => ('days' in r ? r.days : null))).toEqual([2, 3])
  })

  it('すでにその日数以上なら緩めたことにならない。外す一手はその制約だけ除く', () => {
    expect(
      restrictionsForLever(problem, {
        restrictionIndex: 0,
        label: '「早番 は1週間に 2日 まで」',
        action: 'relax',
        relaxedTo: 2,
      })
    ).toBeNull()
    expect(
      restrictionsForLever(problem, {
        restrictionIndex: 1,
        label: '「土日のどちらかは休み」',
        action: 'remove',
        relaxedTo: null,
      })
    ).toEqual([problem.restrictions[0]])
  })
})

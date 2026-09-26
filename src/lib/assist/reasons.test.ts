import { describe, expect, it } from 'vitest'
import { buildProblem, type AssistInput, type PlanRow } from './problem'
import { explainUnfilled, filledCount, OTHER_SLOT } from './reasons'
import { FIXTURE_PATTERNS as P, required, smallInput } from './testing/fixtures'

const OPTIMAL = { shortageOptimal: true, hardDirectives: false }

const assign = (staffId: string, date: string, patternId: string): PlanRow => ({
  staffId,
  date,
  patternId,
  source: 'assign',
})

function reasons(input: AssistInput, plan: PlanRow[], options = OPTIMAL) {
  return explainUnfilled(buildProblem(input), plan, options).map((slot) => slot.reason)
}

describe('explainUnfilled', () => {
  it('候補なし: そのパターンを選べる人がいない / その曜日に勤務できる人がいない / 全員埋まっている', () => {
    const staffs = [
      {
        id: 's1',
        name: 'A',
        availableWdays: [1, 2, 3, 4, 5],
        maxWorkWeek: 5,
        patternIds: [P.early],
        defaults: {},
      },
    ]
    expect(
      reasons(smallInput({ staffs, requiredNums: required(P.late, ['2026-10-05'], 1) }), [])
    ).toEqual(['「遅番」を選択できるスタッフがいません'])
    expect(
      reasons(smallInput({ staffs, requiredNums: required(P.early, ['2026-10-10'], 1) }), [])
    ).toEqual(['土曜日に「早番」を担当できるスタッフがいません'])
    expect(
      reasons(
        smallInput({
          staffs,
          requiredNums: required(P.early, ['2026-10-05'], 1),
          shifts: [{ staffId: 's1', date: '2026-10-05', patternId: P.off }],
        }),
        []
      )
    ).toEqual(['候補のスタッフはすでにシフトが入っています'])
  })

  it('候補が週上限で全滅したときは「とも」でまとめる', () => {
    const input = smallInput({
      staffCount: 2,
      requiredNums: required(P.early, ['2026-10-10'], 1),
      shifts: ['s1', 's2'].flatMap((staffId) =>
        ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((date) => ({
          staffId,
          date,
          patternId: P.day,
        }))
      ),
    })
    expect(reasons(input, [])).toEqual(['候補 2 人とも 週上限（5日）'])
  })

  it('理由が分かれるときは内訳を並べる（同じ日に別の枠へ置いた人を含む）', () => {
    const input = smallInput({
      staffCount: 3,
      restrictions: [
        { kind: 'deny_pattern_pair', days: null, pattern1Id: P.late, pattern2Id: P.early },
      ],
      requiredNums: [
        ...required(P.early, ['2026-10-06'], 3),
        ...required(P.day, ['2026-10-06'], 1),
      ],
      shifts: [{ staffId: 's1', date: '2026-10-05', patternId: P.late }],
    })
    const plan = [assign('s2', '2026-10-06', P.day)]
    expect(reasons(input, plan)).toEqual([
      '候補 3 人: 「遅番の翌日は早番にしない」 1 · 他の枠との兼ね合い 1 · 別の枠に配置済み 1',
    ])
  })

  it('最適で解けていないときは「別の枠に配置済み」と言い切らない', () => {
    const input = smallInput({
      staffCount: 1,
      requiredNums: [
        ...required(P.early, ['2026-10-06'], 1),
        ...required(P.day, ['2026-10-06'], 1),
      ],
    })
    expect(
      reasons(input, [assign('s1', '2026-10-06', P.day)], {
        shortageOptimal: false,
        hardDirectives: false,
      })
    ).toEqual(['候補 1 人: 他の枠との兼ね合い'])
  })

  it('ペア先が埋まっている候補', () => {
    const input = smallInput({
      staffCount: 1,
      requiredNums: required(P.night, ['2026-10-06'], 1),
      shifts: [{ staffId: 's1', date: '2026-10-07', patternId: P.off }],
    })
    expect(reasons(input, [])).toEqual(['候補 1 人: ペア先が埋まっている'])
  })

  it('埋まった枠は出さず、残りの人数を数える', () => {
    const input = smallInput({ staffCount: 3, requiredNums: required(P.early, ['2026-10-06'], 3) })
    const plan = [assign('s1', '2026-10-06', P.early)]
    const problem = buildProblem(input)
    const slots = explainUnfilled(problem, plan, OPTIMAL)
    expect(slots).toHaveLength(1)
    expect(slots[0].count).toBe(2)
    expect(filledCount(problem, plan)).toBe(1)
  })
})

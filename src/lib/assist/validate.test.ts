import { describe, expect, it } from 'vitest'
import type { AssistInput, PlanRow } from './problem'
import { buildProblem } from './problem'
import { FIXTURE_PATTERNS as P, required, restrictionRow, smallInput } from './testing/fixtures'
import { validatePlan } from './validate'

// 2026-10-04（日）〜 10-10（土）の 1 週間。週の始まりは日曜
const WEEK = [
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
]

const assign = (staffId: string, date: string, patternId: string): PlanRow => ({
  staffId,
  date,
  patternId,
  source: 'assign',
})
const pair = (staffId: string, date: string, patternId: string): PlanRow => ({
  staffId,
  date,
  patternId,
  source: 'pair',
})

/** 違反コードだけを取り出す（受理されたら空） */
function codes(input: AssistInput, plan: PlanRow[]): string[][] {
  return validatePlan(buildProblem(input), plan).rejected.map((unit) =>
    unit.violations.map((violation) => violation.code)
  )
}

const everyDay = (patternId: string, num = 3) => required(patternId, WEEK, num)

describe('H1: 空きセル・1 日 1 枠', () => {
  it('既存のあるセルには入れない（下書きも確定も）', () => {
    const input = smallInput({
      requiredNums: everyDay(P.early),
      shifts: [{ staffId: 's1', date: '2026-10-05', patternId: P.off }],
    })
    expect(codes(input, [assign('s1', '2026-10-05', P.early)])).toEqual([['H1']])
  })

  it('同じセルに新規 2 件は、2 件目を落とす', () => {
    const input = smallInput({ requiredNums: [...everyDay(P.early), ...everyDay(P.day)] })
    const result = validatePlan(buildProblem(input), [
      assign('s1', '2026-10-05', P.early),
      assign('s1', '2026-10-05', P.day),
    ])
    expect(result.accepted).toEqual([assign('s1', '2026-10-05', P.early)])
    expect(result.rejected[0].violations[0].code).toBe('H1')
  })
})

describe('H2: ペアの翌日', () => {
  it('翌日が埋まっていれば親ごと落とす', () => {
    const input = smallInput({
      requiredNums: everyDay(P.night),
      shifts: [{ staffId: 's1', date: '2026-10-06', patternId: P.day }],
    })
    expect(
      codes(input, [assign('s1', '2026-10-05', P.night), pair('s1', '2026-10-06', P.after)])
    ).toEqual([['H2']])
  })

  it('翌日が期間の外でも書く（着地日）', () => {
    const input = smallInput({ requiredNums: everyDay(P.night) })
    const result = validatePlan(buildProblem(input), [
      assign('s1', '2026-10-10', P.night),
      pair('s1', '2026-10-11', P.after),
    ])
    expect(result.accepted).toHaveLength(2)
  })

  it('新規の親のペアが、別の新規の行と同じセルなら後の単位を落とす', () => {
    const input = smallInput({ requiredNums: [...everyDay(P.night), ...everyDay(P.early)] })
    const result = validatePlan(buildProblem(input), [
      assign('s1', '2026-10-05', P.night),
      pair('s1', '2026-10-06', P.after),
      assign('s1', '2026-10-06', P.early),
    ])
    expect(result.accepted.map((row) => row.date)).toEqual(['2026-10-05', '2026-10-06'])
    expect(result.rejected[0].rows[0]).toEqual(assign('s1', '2026-10-06', P.early))
  })
})

describe('H3 / H4', () => {
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
  it('勤務できない曜日（10/4 は日曜）', () => {
    expect(
      codes(smallInput({ staffs, requiredNums: everyDay(P.early) }), [
        assign('s1', '2026-10-04', P.early),
      ])
    ).toEqual([['H3']])
  })
  it('選択できないパターン', () => {
    expect(
      codes(smallInput({ staffs, requiredNums: everyDay(P.day) }), [
        assign('s1', '2026-10-05', P.day),
      ])
    ).toEqual([['H4']])
  })
})

describe('H5: 週上限', () => {
  it('同じ週に 6 件来たら 5 件目まで（逐次受理）', () => {
    const input = smallInput({ requiredNums: everyDay(P.early) })
    const plan = WEEK.slice(0, 6).map((date) => assign('s1', date, P.early))
    const result = validatePlan(buildProblem(input), plan)
    expect(result.accepted).toHaveLength(5)
    expect(result.rejected.map((unit) => unit.violations[0].code)).toEqual(['H5'])
  })

  it('期間の外の既存シフトも同じ週なら数える（週の境目）', () => {
    // 期間を水曜から始める。同じ週の日〜火に既存 3 日
    const input = smallInput({
      period: { start: '2026-10-07', end: '2026-10-13' },
      requiredNums: required(P.early, ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'], 3),
      shifts: ['2026-10-04', '2026-10-05', '2026-10-06'].map((date) => ({
        staffId: 's1',
        date,
        patternId: P.day,
      })),
    })
    const plan = ['2026-10-07', '2026-10-08', '2026-10-09'].map((date) =>
      assign('s1', date, P.early)
    )
    expect(validatePlan(buildProblem(input), plan).accepted).toHaveLength(2)
  })

  it('次の週は別に数える', () => {
    const input = smallInput({
      period: { start: '2026-10-08', end: '2026-10-14' },
      requiredNums: required(
        P.early,
        ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'],
        3
      ),
      shifts: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-04'].map((date) => ({
        staffId: 's1',
        date,
        patternId: P.day,
      })),
    })
    const plan = ['2026-10-08', '2026-10-09', '2026-10-11'].map((date) =>
      assign('s1', date, P.early)
    )
    const result = validatePlan(buildProblem(input), plan)
    // 10/4〜10/10 の週は既存 4 + 1 = 5 で 10/9 が落ちる。10/11 は次の週
    expect(result.accepted.map((row) => row.date)).toEqual(['2026-10-08', '2026-10-11'])
  })

  it('出勤日のペアも勤務日数に数える', () => {
    const input = smallInput({
      patterns: [
        { id: 'n', name: '夜', kind: 'workday', pairPatternId: 'm' },
        { id: 'm', name: '朝', kind: 'workday', pairPatternId: null },
      ],
      staffs: [
        {
          id: 's1',
          name: 'A',
          availableWdays: [0, 1, 2, 3, 4, 5, 6],
          maxWorkWeek: 1,
          patternIds: ['n', 'm'],
          defaults: {},
        },
      ],
      requiredNums: [...required('n', WEEK, 1), ...required('m', WEEK, 1)],
    })
    expect(codes(input, [assign('s1', '2026-10-05', 'n'), pair('s1', '2026-10-06', 'm')])).toEqual([
      ['H5'],
    ])
  })
})

describe('H6: 遷移禁止', () => {
  const restrictions: AssistInput['restrictions'] = [
    restrictionRow({
      kind: 'deny_pattern_pair',
      days: null,
      pattern1Id: P.late,
      pattern2Id: P.early,
    }),
  ]
  it('新規どうし', () => {
    const input = smallInput({
      restrictions,
      requiredNums: [...everyDay(P.late), ...everyDay(P.early)],
    })
    expect(
      codes(input, [assign('s1', '2026-10-05', P.late), assign('s1', '2026-10-06', P.early)])
    ).toEqual([['H6']])
  })
  it('前日の既存（期間の前）との組み合わせ', () => {
    const input = smallInput({
      restrictions,
      requiredNums: everyDay(P.early),
      shifts: [{ staffId: 's1', date: '2026-10-03', patternId: P.late }],
    })
    expect(codes(input, [assign('s1', '2026-10-04', P.early)])).toEqual([['H6']])
  })
  it('翌日の既存との組み合わせ', () => {
    const input = smallInput({
      restrictions,
      requiredNums: everyDay(P.late),
      shifts: [{ staffId: 's1', date: '2026-10-06', patternId: P.early }],
    })
    expect(codes(input, [assign('s1', '2026-10-05', P.late)])).toEqual([['H6']])
  })
})

describe('H7: パターンの週上限', () => {
  it('夜勤は週 1 日まで', () => {
    const input = smallInput({
      restrictions: [
        restrictionRow({ kind: 'max_work_week', days: 1, pattern1Id: P.night, pattern2Id: null }),
      ],
      requiredNums: everyDay(P.night),
    })
    const plan = [
      assign('s1', '2026-10-05', P.night),
      pair('s1', '2026-10-06', P.after),
      assign('s1', '2026-10-07', P.night),
      pair('s1', '2026-10-08', P.after),
    ]
    expect(codes(input, plan)).toEqual([['H7']])
  })
})

describe('H8: 連続勤務', () => {
  const restriction = (patternId: string | null, days: number): AssistInput['restrictions'] => [
    restrictionRow({ kind: 'max_work_consecutive', days, pattern1Id: patternId, pattern2Id: null }),
  ]

  it('勤務日全体: 期間の前から続く連勤も数える', () => {
    const input = smallInput({
      restrictions: restriction(null, 3),
      requiredNums: everyDay(P.early),
      shifts: ['2026-10-02', '2026-10-03'].map((date) => ({
        staffId: 's1',
        date,
        patternId: P.day,
      })),
    })
    const result = validatePlan(buildProblem(input), [
      assign('s1', '2026-10-04', P.early),
      assign('s1', '2026-10-05', P.early),
    ])
    expect(result.accepted.map((row) => row.date)).toEqual(['2026-10-04'])
  })

  it('期間の後ろの既存とつながる連勤', () => {
    const input = smallInput({
      restrictions: restriction(null, 2),
      requiredNums: everyDay(P.early),
      shifts: ['2026-10-11', '2026-10-12'].map((date) => ({
        staffId: 's1',
        date,
        patternId: P.day,
      })),
    })
    expect(codes(input, [assign('s1', '2026-10-10', P.early)])).toEqual([['H8']])
  })

  it('パターン指定: 別のパターンで途切れる', () => {
    const input = smallInput({
      restrictions: restriction(P.early, 2),
      requiredNums: [...everyDay(P.early), ...everyDay(P.day)],
    })
    const plan = [
      assign('s1', '2026-10-04', P.early),
      assign('s1', '2026-10-05', P.early),
      assign('s1', '2026-10-06', P.day),
      assign('s1', '2026-10-07', P.early),
    ]
    expect(validatePlan(buildProblem(input), plan).rejected).toEqual([])
    expect(codes(input, [...plan.slice(0, 2), assign('s1', '2026-10-06', P.early)])).toEqual([
      ['H8'],
    ])
  })

  it('休みのペアは勤務日の連勤を途切れさせる', () => {
    const input = smallInput({
      restrictions: restriction(null, 2),
      requiredNums: [...everyDay(P.night), ...everyDay(P.early)],
    })
    const plan = [
      assign('s1', '2026-10-04', P.early),
      assign('s1', '2026-10-05', P.night),
      pair('s1', '2026-10-06', P.after),
      assign('s1', '2026-10-07', P.early),
    ]
    expect(validatePlan(buildProblem(input), plan).rejected).toEqual([])
  })
})

describe('H9: 土日のどちらかは休み', () => {
  const restrictions: AssistInput['restrictions'] = [
    restrictionRow({ kind: 'sat_or_sun_dayoff', days: null, pattern1Id: null, pattern2Id: null }),
  ]
  it('土曜と翌日曜の両方には入れない（日曜が期間の外の既存）', () => {
    const input = smallInput({
      restrictions,
      requiredNums: everyDay(P.early),
      shifts: [{ staffId: 's1', date: '2026-10-11', patternId: P.day }],
    })
    expect(codes(input, [assign('s1', '2026-10-10', P.early)])).toEqual([['H9']])
  })
  it('日曜と前日の土曜（期間の前）', () => {
    const input = smallInput({
      restrictions,
      requiredNums: everyDay(P.early),
      shifts: [{ staffId: 's1', date: '2026-10-03', patternId: P.day }],
    })
    expect(codes(input, [assign('s1', '2026-10-04', P.early)])).toEqual([['H9']])
  })
  it('日曜と翌月曜は関係ない', () => {
    const input = smallInput({ restrictions, requiredNums: everyDay(P.early) })
    expect(
      codes(input, [assign('s1', '2026-10-04', P.early), assign('s1', '2026-10-05', P.early)])
    ).toEqual([])
  })
  it('休みのパターンは勤務に数えない', () => {
    const input = smallInput({
      restrictions,
      requiredNums: everyDay(P.early),
      shifts: [{ staffId: 's1', date: '2026-10-11', patternId: P.off }],
    })
    expect(codes(input, [assign('s1', '2026-10-10', P.early)])).toEqual([])
  })
})

describe('H10: 必要人数を超えない', () => {
  it('残りの枠を超えた分を落とす', () => {
    const input = smallInput({ requiredNums: required(P.early, ['2026-10-05'], 1) })
    const result = validatePlan(buildProblem(input), [
      assign('s1', '2026-10-05', P.early),
      assign('s2', '2026-10-05', P.early),
    ])
    expect(result.accepted).toEqual([assign('s1', '2026-10-05', P.early)])
    expect(result.rejected[0].violations[0].code).toBe('H10')
  })

  it('既存の配置済みを引いた残りで数える', () => {
    const input = smallInput({
      requiredNums: required(P.early, ['2026-10-05'], 1),
      shifts: [{ staffId: 's3', date: '2026-10-05', patternId: P.early }],
    })
    expect(codes(input, [assign('s1', '2026-10-05', P.early)])).toEqual([['H10']])
  })

  const workPair = {
    patterns: [
      { id: 'n', name: '夜', kind: 'workday' as const, pairPatternId: 'm' },
      { id: 'm', name: '朝', kind: 'workday' as const, pairPatternId: null },
    ],
  }

  it('出勤日のペアは枠を消費する（ペア先の枠を超えない）', () => {
    const input = smallInput({
      ...workPair,
      requiredNums: [...required('n', WEEK, 2), ...required('m', ['2026-10-06'], 1)],
    })
    const result = validatePlan(buildProblem(input), [
      assign('s1', '2026-10-05', 'n'),
      pair('s1', '2026-10-06', 'm'),
      assign('s2', '2026-10-05', 'n'),
      pair('s2', '2026-10-06', 'm'),
    ])
    expect(result.accepted).toHaveLength(2)
    expect(result.rejected[0].violations.map((v) => v.message)).toEqual(['ペア先に枠がありません'])
  })

  it('親とペアは 1 単位: ペアが通らなければ親も入らない', () => {
    const input = smallInput({ ...workPair, requiredNums: required('n', WEEK, 2) })
    const result = validatePlan(buildProblem(input), [
      assign('s1', '2026-10-05', 'n'),
      pair('s1', '2026-10-06', 'm'),
    ])
    expect(result.accepted).toEqual([])
  })
})

describe('H11: 参照の妥当性', () => {
  const input = smallInput({ requiredNums: [...everyDay(P.early), ...everyDay(P.night)] })

  it('在籍でないスタッフ・知らないパターン・休みのパターン・期間外の日付', () => {
    expect(
      codes(input, [
        assign('ghost', '2026-10-05', P.early),
        assign('s1', '2026-10-05', 'nope'),
        assign('s1', '2026-10-06', P.off),
        assign('s1', '2026-10-11', P.early),
      ])
    ).toEqual([['H11'], ['H11'], ['H11'], ['H11']])
  })

  it('ペアのあるパターンにペアの行が無い / 親の無いペア / 親と合わないペア', () => {
    expect(codes(input, [assign('s1', '2026-10-05', P.night)])).toEqual([['H11']])
    expect(codes(input, [pair('s1', '2026-10-06', P.after)])).toEqual([['H11']])
    expect(
      codes(input, [assign('s1', '2026-10-05', P.night), pair('s1', '2026-10-07', P.after)])
    ).toEqual([['H11'], ['H11']])
  })
})

describe('逐次受理', () => {
  it('(date, pattern, 入力順) で見る。受理された集合はどの順で見直しても違反 0', () => {
    const input = smallInput({
      restrictions: [
        restrictionRow({
          kind: 'max_work_consecutive',
          days: 2,
          pattern1Id: null,
          pattern2Id: null,
        }),
      ],
      requiredNums: everyDay(P.early),
    })
    const plan = [...WEEK].reverse().map((date) => assign('s1', date, P.early))
    const first = validatePlan(buildProblem(input), plan)
    expect(first.accepted.map((row) => row.date)).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-07',
      '2026-10-08',
      '2026-10-10',
    ])
    const again = validatePlan(buildProblem(input), [...first.accepted].reverse())
    expect(again.rejected).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { cellKey } from '@/lib/shifts/key'
import {
  buildProblem,
  contextRange,
  requiredNumsRange,
  slotKey,
  staticBlock,
  weekStart,
  withPair,
} from './problem'
import { FIXTURE_PATTERNS as P, required, smallInput } from './testing/fixtures'

describe('buildProblem: 不足枠', () => {
  it('required − assigned を枠にし、0 以下は枠にしない', () => {
    const problem = buildProblem(
      smallInput({
        requiredNums: [
          ...required(P.early, ['2026-10-05'], 2),
          ...required(P.day, ['2026-10-05'], 1),
        ],
        shifts: [
          { staffId: 's1', date: '2026-10-05', patternId: P.early },
          { staffId: 's2', date: '2026-10-05', patternId: P.day },
        ],
      })
    )
    expect(problem.demand).toEqual([{ date: '2026-10-05', patternId: P.early, count: 1 }])
    expect(problem.requested).toBe(1)
  })

  it('休みのパターンは必要人数があっても枠にしない', () => {
    const problem = buildProblem(smallInput({ requiredNums: required(P.off, ['2026-10-05'], 3) }))
    expect(problem.demand).toEqual([])
  })

  it('期間外の必要人数は枠にしない。着地日（P.end + 1）は capacity にだけ入る', () => {
    const problem = buildProblem(
      smallInput({ requiredNums: required(P.early, ['2026-10-03', '2026-10-10', '2026-10-11'], 1) })
    )
    expect(problem.demand.map((slot) => slot.date)).toEqual(['2026-10-10'])
    expect(problem.capacity.get(slotKey('2026-10-11', P.early))).toBe(1)
    expect(problem.capacity.has(slotKey('2026-10-03', P.early))).toBe(false)
  })

  it('在籍でないスタッフの既存シフトは配置済みに数えない', () => {
    const problem = buildProblem(
      smallInput({
        requiredNums: required(P.early, ['2026-10-05'], 1),
        shifts: [{ staffId: 'retired', date: '2026-10-05', patternId: P.early }],
      })
    )
    expect(problem.requested).toBe(1)
  })

  it('スタッフ・パターンにコードを振る（表示順）', () => {
    const problem = buildProblem(smallInput())
    expect(problem.staffs.map((staff) => staff.code)).toEqual(['S1', 'S2', 'S3'])
    expect(problem.patterns[0].code).toBe('P1')
  })

  it('存在しないパターンを指すペア・制約は捨てる', () => {
    const problem = buildProblem(
      smallInput({
        patterns: [{ id: 'a', name: 'A', kind: 'workday', pairPatternId: 'gone' }],
        restrictions: [
          { kind: 'max_work_week', days: 1, pattern1Id: 'gone', pattern2Id: null },
          { kind: 'max_work_consecutive', days: 3, pattern1Id: null, pattern2Id: null },
          { kind: 'max_work_week', days: null, pattern1Id: 'a', pattern2Id: null },
        ],
      })
    )
    expect(problem.patternById.get('a')?.pairPatternId).toBeNull()
    expect(problem.restrictions).toEqual([
      { kind: 'max_work_consecutive', patternId: null, days: 3, hard: true },
    ])
  })
})

describe('期間の境界', () => {
  it('文脈期間 C は P.start − 7 〜 P.end + 8（連勤の窓が着地日を含んでも読める）', () => {
    expect(contextRange({ start: '2026-10-01', end: '2026-10-31' })).toEqual({
      start: '2026-09-24',
      end: '2026-11-08',
    })
  })

  it('必要人数は P + 1 日を読む', () => {
    expect(requiredNumsRange({ start: '2026-10-01', end: '2026-10-31' })).toEqual({
      start: '2026-10-01',
      end: '2026-11-01',
    })
  })

  it.each([
    [0, '2026-10-04'],
    [1, '2026-10-05'],
    [3, '2026-10-07'],
    [4, '2026-10-01'],
    [6, '2026-10-03'],
  ])('週の始まり %i: 2026-10-07（水）の週は %s から', (startOfWeek, expected) => {
    expect(weekStart('2026-10-07', startOfWeek)).toBe(expected)
  })
})

describe('staticBlock: 候補（H1〜H4 とペアの翌日）', () => {
  const base = smallInput({
    staffs: [
      {
        id: 's1',
        name: 'A',
        availableWdays: [1, 2, 3, 4, 5],
        maxWorkWeek: 5,
        patternIds: [P.early, P.night, P.after],
        defaults: {},
      },
    ],
    requiredNums: [
      ...required(P.early, ['2026-10-05', '2026-10-06'], 1),
      ...required(P.day, ['2026-10-05'], 1),
    ],
    shifts: [{ staffId: 's1', date: '2026-10-06', patternId: P.off }],
  })
  const problem = buildProblem(base)
  const staff = problem.staffs[0]

  it('既存のあるセルは occupied', () => {
    expect(staticBlock(problem, staff, '2026-10-06', P.early)).toBe('occupied')
  })
  it('勤務できない曜日は wday（10/4 は日曜）', () => {
    expect(staticBlock(problem, staff, '2026-10-04', P.early)).toBe('wday')
  })
  it('選択できないパターンは pattern', () => {
    expect(staticBlock(problem, staff, '2026-10-05', P.day)).toBe('pattern')
  })
  it('ペアの翌日が埋まっていれば pair_occupied', () => {
    expect(staticBlock(problem, staff, '2026-10-05', P.night)).toBe('pair_occupied')
  })
  it('置けるなら null', () => {
    expect(staticBlock(problem, staff, '2026-10-05', P.early)).toBeNull()
  })

  it('出勤日のペア先に枠が無い日は pair_no_slot', () => {
    const pairWork = buildProblem(
      smallInput({
        patterns: [
          { id: 'n', name: '夜', kind: 'workday', pairPatternId: 'm' },
          { id: 'm', name: '朝', kind: 'workday', pairPatternId: null },
        ],
        requiredNums: required('n', ['2026-10-05'], 1),
      })
    )
    expect(staticBlock(pairWork, pairWork.staffs[0], '2026-10-05', 'n')).toBe('pair_no_slot')
  })
})

describe('withPair', () => {
  it('ペアのあるパターンは翌日の行を足す（期間の外でも書く）', () => {
    const problem = buildProblem(smallInput())
    expect(withPair(problem, { staffId: 's1', date: '2026-10-10', patternId: P.night })).toEqual([
      { staffId: 's1', date: '2026-10-10', patternId: P.night, source: 'assign' },
      { staffId: 's1', date: '2026-10-11', patternId: P.after, source: 'pair' },
    ])
  })

  it('既存は cellKey で引ける', () => {
    const problem = buildProblem(
      smallInput({ shifts: [{ staffId: 's1', date: '2026-10-05', patternId: P.day }] })
    )
    expect(problem.existing.get(cellKey('s1', '2026-10-05'))).toBe(P.day)
  })
})

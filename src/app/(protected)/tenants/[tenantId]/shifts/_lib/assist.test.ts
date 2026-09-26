import { describe, expect, it } from 'vitest'
import { requiredCounts } from '@/lib/shifts/satisfaction'
import { toShiftMap } from '@/lib/shifts/key'
import {
  currentStage,
  formatElapsed,
  ghostCells,
  hasRequiredNums,
  leverEffect,
  leverSlots,
  previewCoverage,
  shortageByPattern,
  gridSpan,
  unfilledGrid,
} from './assist'

describe('shortageByPattern', () => {
  const patterns = [
    { id: 'e', name: '早番' },
    { id: 'l', name: '遅番' },
  ]
  const required = requiredCounts([
    { patternId: 'e', date: '2026-10-01', num: 2 },
    { patternId: 'e', date: '2026-10-02', num: 1 },
    { patternId: 'l', date: '2026-10-01', num: 1 },
  ])

  it('必要人数 − 配置済み を足し、超過は負にしない。不足 0 のパターンは出さない', () => {
    const assigned = requiredCounts([
      { patternId: 'e', date: '2026-10-01', num: 1 },
      { patternId: 'l', date: '2026-10-01', num: 3 },
    ])
    expect(shortageByPattern(['2026-10-01', '2026-10-02'], patterns, required, assigned)).toEqual({
      total: 2,
      byPattern: [{ patternId: 'e', name: '早番', count: 2 }],
    })
  })
})

describe('hasRequiredNums', () => {
  it('出勤日パターンの 1 以上の行があるか', () => {
    const workday = new Set(['e'])
    expect(hasRequiredNums([{ patternId: 'e', date: '2026-10-01', num: 0 }], workday)).toBe(false)
    expect(hasRequiredNums([{ patternId: 'off', date: '2026-10-01', num: 2 }], workday)).toBe(false)
    expect(hasRequiredNums([{ patternId: 'e', date: '2026-10-01', num: 1 }], workday)).toBe(true)
  })
})

describe('currentStage', () => {
  it('経過時間で進み、最後の段階で止まる', () => {
    expect(currentStage(0, true)).toBe(0)
    expect(currentStage(2_000, true)).toBe(1)
    expect(currentStage(11_000, true)).toBe(2)
    expect(currentStage(15_000, true)).toBe(3)
    expect(currentStage(600_000, true)).toBe(4)
  })

  it('指示が無ければ「指示を解釈」を飛ばす', () => {
    expect(currentStage(2_000, false)).toBe(2)
  })
})

describe('formatElapsed', () => {
  it('分:秒', () => {
    expect(formatElapsed(7_900)).toBe('0:07')
    expect(formatElapsed(65_000)).toBe('1:05')
  })
})

describe('gridSpan', () => {
  const label = 56
  const gap = 2
  const minDay = 22

  it('パネルの幅では 10 日と、次の日の半分', () => {
    expect(gridSpan(320, 30, label, gap, minDay)).toEqual({ visibleDays: 10.5, visibleGaps: 11 })
  })

  it('スマホのシートは幅があるので、同じ下限で日数を増やす', () => {
    expect(gridSpan(358, 30, label, gap, minDay)).toEqual({ visibleDays: 12.5, visibleGaps: 13 })
    expect(gridSpan(288, 30, label, gap, minDay)).toEqual({ visibleDays: 9.5, visibleGaps: 10 })
  })

  it('期間が下限の幅で収まるときは、はみ出させずに全部', () => {
    expect(gridSpan(320, 7, label, gap, minDay)).toEqual({ visibleDays: 7, visibleGaps: 8 })
  })
})

describe('unfilledGrid', () => {
  it('不足のあるパターンだけ、表示順で、日付の並びに数を置く', () => {
    const patterns = [
      { id: 'e', name: '早番' },
      { id: 'd', name: '日勤' },
      { id: 'n', name: '夜勤' },
    ]
    const unfilled = [
      { date: '2026-10-02', patternId: 'n', count: 1 },
      { date: '2026-10-01', patternId: 'e', count: 2 },
      { date: '2026-10-03', patternId: 'e', count: 1 },
    ]
    expect(unfilledGrid(unfilled, patterns, ['2026-10-01', '2026-10-02', '2026-10-03'])).toEqual([
      { patternId: 'e', name: '早番', total: 3, counts: [2, 0, 1] },
      { patternId: 'n', name: '夜勤', total: 1, counts: [0, 1, 0] },
    ])
  })
})

describe('効く一手の表示', () => {
  const lever = {
    action: 'remove' as const,
    relaxedTo: null,
    byPattern: [
      { patternId: 'e', count: 2 },
      { patternId: 'n', count: 1 },
    ],
    rows: [
      { staffId: 's1', date: '2026-10-01', patternId: 'e', source: 'assign' as const },
      { staffId: 's1', date: '2026-10-03', patternId: 'n', source: 'assign' as const },
      { staffId: 's1', date: '2026-10-04', patternId: 'a', source: 'pair' as const },
    ],
  }
  const names = new Map([
    ['e', '早番'],
    ['n', '夜勤'],
  ])

  it('条件と、埋まる枠のパターンごとの数', () => {
    expect(leverEffect(lever, names)).toBe('外すと早番 2 枠・夜勤 1 枠が埋まります')
    expect(leverEffect({ ...lever, action: 'relax', relaxedTo: 3 }, names)).toBe(
      '3日にすると早番 2 枠・夜勤 1 枠が埋まります'
    )
  })

  it('点線はいま空いているセルだけ。小さな表の枠は日 × パターン', () => {
    const shifts = toShiftMap([{ staffId: 's1', date: '2026-10-01', patternId: 'd', fixed: true }])
    expect([...ghostCells(lever, shifts)]).toEqual([
      ['s1:2026-10-03', 'n'],
      ['s1:2026-10-04', 'a'],
    ])
    expect(leverSlots(lever).has('2026-10-03|n')).toBe(true)
  })
})

describe('previewCoverage', () => {
  it('点線のセル（空いているセル）を足した充足を、変わる日だけ返す。休みのパターン（明け）は数えない', () => {
    const lever = {
      rows: [
        { staffId: 's1', date: '2026-10-01', patternId: 'e', source: 'assign' as const },
        { staffId: 's2', date: '2026-10-02', patternId: 'n', source: 'assign' as const },
        { staffId: 's2', date: '2026-10-03', patternId: 'a', source: 'pair' as const },
      ],
    }
    // s1 の 10/1 は手で埋めたあと（点線にならない）
    const shifts = toShiftMap([{ staffId: 's1', date: '2026-10-01', patternId: 'd', fixed: false }])
    const required = requiredCounts([
      { patternId: 'e', date: '2026-10-01', num: 1 },
      { patternId: 'n', date: '2026-10-02', num: 2 },
    ])
    const assigned = requiredCounts([{ patternId: 'n', date: '2026-10-02', num: 1 }])
    expect([...previewCoverage(lever, shifts, ['e', 'n'], required, assigned)]).toEqual([
      ['2026-10-02', { assigned: 2, required: 2, satisfied: true }],
    ])
  })
})

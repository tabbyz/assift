import { describe, expect, it } from 'vitest'
import { toShiftMap } from './key'
import type { RequiredByDate, RequiredNum } from './requiredNums'
import { assignedCounts, countAt, coverageAt, isSatisfied, requiredAt } from './satisfaction'

const EARLY = 'ptn-early'
const LATE = 'ptn-late'
const DAYOFF = 'ptn-dayoff'
const WORKDAYS = [EARLY, LATE]

/** 解決済みの必要人数（`buildRequiredByDate()` の出力と同じ形）をテスト用に組む */
function required(rows: { patternId: string; date: string; num: RequiredNum }[]): RequiredByDate {
  const result: RequiredByDate = new Map()
  for (const row of rows) {
    const byPattern = result.get(row.date) ?? new Map<string, RequiredNum>()
    byPattern.set(row.patternId, row.num)
    result.set(row.date, byPattern)
  }
  return result
}

const shifts = toShiftMap([
  { staffId: 's1', date: '2026-09-17', patternId: EARLY, fixed: false },
  { staffId: 's2', date: '2026-09-17', patternId: EARLY, fixed: true },
  { staffId: 's3', date: '2026-09-17', patternId: LATE, fixed: false },
  { staffId: 's1', date: '2026-09-18', patternId: DAYOFF, fixed: false },
])

describe('assignedCounts', () => {
  it('日付 × パターンで数える', () => {
    const counts = assignedCounts(shifts)
    expect(countAt(counts, '2026-09-17', EARLY)).toBe(2)
    expect(countAt(counts, '2026-09-17', LATE)).toBe(1)
    expect(countAt(counts, '2026-09-18', DAYOFF)).toBe(1)
  })

  it('行が無い組み合わせは 0', () => {
    const counts = assignedCounts(shifts)
    expect(countAt(counts, '2026-09-18', EARLY)).toBe(0)
    expect(countAt(counts, '2026-12-31', EARLY)).toBe(0)
  })

  it('確定 / 下書きの区別なく数える（v1 と同じ）', () => {
    expect(countAt(assignedCounts(shifts), '2026-09-17', EARLY)).toBe(2)
  })
})

describe('requiredAt', () => {
  it('組み立てていない組み合わせは null（0 ではない）', () => {
    const r = required([{ patternId: EARLY, date: '2026-09-17', num: 2 }])
    expect(requiredAt(r, '2026-09-17', EARLY)).toBe(2)
    expect(requiredAt(r, '2026-09-17', LATE)).toBeNull()
    expect(requiredAt(r, '2026-12-31', EARLY)).toBeNull()
  })
})

describe('isSatisfied', () => {
  it('出勤日パターンすべてで一致していれば満たす', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-17', num: 2 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(isSatisfied('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toBe(true)
  })

  it('不足していれば満たさない', () => {
    const r = required([{ patternId: EARLY, date: '2026-09-17', num: 3 }])
    expect(isSatisfied('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toBe(false)
  })

  it('過剰でも満たさない（v1 は != で判定していた）', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-17', num: 1 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(isSatisfied('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toBe(false)
  })

  it('未設定（null）の組は判定から外す（015 §3.2）', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-17', num: null },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(isSatisfied('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toBe(true)
  })

  it('必要人数が 0 でアサインも 0 なら満たす', () => {
    const r = required([{ patternId: EARLY, date: '2026-12-31', num: 0 }])
    expect(isSatisfied('2026-12-31', WORKDAYS, r, assignedCounts(shifts))).toBe(true)
  })

  it('休みパターンの必要人数は見ない（006 §10.6）', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-18', num: 0 },
      { patternId: LATE, date: '2026-09-18', num: 0 },
      { patternId: DAYOFF, date: '2026-09-18', num: 5 },
    ])
    expect(isSatisfied('2026-09-18', WORKDAYS, r, assignedCounts(shifts))).toBe(true)
  })

  it('出勤日パターンが 0 件なら常に満たす', () => {
    const r = required([{ patternId: EARLY, date: '2026-09-17', num: 9 }])
    expect(isSatisfied('2026-09-17', [], r, assignedCounts(shifts))).toBe(true)
  })
})

describe('coverageAt', () => {
  it('出勤日パターンの合計を assigned/required で返す', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-17', num: 3 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(coverageAt('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toEqual({
      assigned: 3,
      required: 4,
      state: 'short',
    })
  })

  it('満たしていれば ok', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-17', num: 2 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(coverageAt('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toEqual({
      assigned: 3,
      required: 3,
      state: 'ok',
    })
  })

  it('多く入っていれば over', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-17', num: 1 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(coverageAt('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toEqual({
      assigned: 3,
      required: 2,
      state: 'over',
    })
  })

  it('すべて未設定なら required は null で unset', () => {
    expect(coverageAt('2026-09-17', WORKDAYS, required([]), assignedCounts(shifts))).toEqual({
      assigned: 3,
      required: null,
      state: 'unset',
    })
  })

  it('一部だけ未設定なら、決まっている分の合計で判定する', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-17', num: 2 },
      { patternId: LATE, date: '2026-09-17', num: null },
    ])
    expect(coverageAt('2026-09-17', WORKDAYS, r, assignedCounts(shifts))).toEqual({
      assigned: 3,
      required: 2,
      state: 'over',
    })
  })

  it('配置も必要人数も無い日は none（フッターに出さない）', () => {
    expect(coverageAt('2026-12-31', WORKDAYS, required([]), assignedCounts(shifts))).toEqual({
      assigned: 0,
      required: null,
      state: 'none',
    })
  })

  it('休みパターンは合計に入れない', () => {
    const r = required([
      { patternId: EARLY, date: '2026-09-18', num: 0 },
      { patternId: LATE, date: '2026-09-18', num: 0 },
      { patternId: DAYOFF, date: '2026-09-18', num: 5 },
    ])
    expect(coverageAt('2026-09-18', WORKDAYS, r, assignedCounts(shifts))).toEqual({
      assigned: 0,
      required: 0,
      state: 'none',
    })
  })
})

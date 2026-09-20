import { describe, expect, it } from 'vitest'
import { toShiftMap } from './key'
import { assignedCounts, countAt, coverageAt, isSatisfied, requiredCounts } from './satisfaction'

const EARLY = 'ptn-early'
const LATE = 'ptn-late'
const DAYOFF = 'ptn-dayoff'
const WORKDAYS = [EARLY, LATE]

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

describe('isSatisfied', () => {
  it('出勤日パターンすべてで一致していれば満たす', () => {
    const required = requiredCounts([
      { patternId: EARLY, date: '2026-09-17', num: 2 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(isSatisfied('2026-09-17', WORKDAYS, required, assignedCounts(shifts))).toBe(true)
  })

  it('不足していれば満たさない', () => {
    const required = requiredCounts([{ patternId: EARLY, date: '2026-09-17', num: 3 }])
    expect(isSatisfied('2026-09-17', WORKDAYS, required, assignedCounts(shifts))).toBe(false)
  })

  it('過剰でも満たさない（v1 は != で判定していた）', () => {
    const required = requiredCounts([
      { patternId: EARLY, date: '2026-09-17', num: 1 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(isSatisfied('2026-09-17', WORKDAYS, required, assignedCounts(shifts))).toBe(false)
  })

  it('必要人数が 0 でアサインも 0 なら満たす', () => {
    expect(isSatisfied('2026-12-31', WORKDAYS, requiredCounts([]), assignedCounts(shifts))).toBe(
      true
    )
  })

  it('休みパターンの必要人数は見ない（006 §10.6）', () => {
    const required = requiredCounts([
      { patternId: EARLY, date: '2026-09-18', num: 0 },
      { patternId: LATE, date: '2026-09-18', num: 0 },
      { patternId: DAYOFF, date: '2026-09-18', num: 5 },
    ])
    expect(isSatisfied('2026-09-18', WORKDAYS, required, assignedCounts(shifts))).toBe(true)
  })

  it('出勤日パターンが 0 件なら常に満たす', () => {
    const required = requiredCounts([{ patternId: EARLY, date: '2026-09-17', num: 9 }])
    expect(isSatisfied('2026-09-17', [], required, assignedCounts(shifts))).toBe(true)
  })
})

describe('coverageAt', () => {
  it('出勤日パターンの合計を assigned/required で返す', () => {
    const required = requiredCounts([
      { patternId: EARLY, date: '2026-09-17', num: 3 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(coverageAt('2026-09-17', WORKDAYS, required, assignedCounts(shifts))).toEqual({
      assigned: 3,
      required: 4,
      satisfied: false,
    })
  })

  it('満たしていれば satisfied', () => {
    const required = requiredCounts([
      { patternId: EARLY, date: '2026-09-17', num: 2 },
      { patternId: LATE, date: '2026-09-17', num: 1 },
    ])
    expect(coverageAt('2026-09-17', WORKDAYS, required, assignedCounts(shifts))).toEqual({
      assigned: 3,
      required: 3,
      satisfied: true,
    })
  })

  it('休みパターンは合計に入れない', () => {
    const required = requiredCounts([
      { patternId: EARLY, date: '2026-09-18', num: 0 },
      { patternId: LATE, date: '2026-09-18', num: 0 },
      { patternId: DAYOFF, date: '2026-09-18', num: 5 },
    ])
    expect(coverageAt('2026-09-18', WORKDAYS, required, assignedCounts(shifts))).toEqual({
      assigned: 0,
      required: 0,
      satisfied: true,
    })
  })
})

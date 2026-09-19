import { describe, expect, it } from 'vitest'
import { countShifts } from './count'
import { toShiftMap, type ShiftCell } from './key'

const STAFF_A = 'aaaa'
const STAFF_B = 'bbbb'
const EARLY = 'early'
const NIGHT = 'night'
const OFF = 'off'

const WORKDAYS = new Set([EARLY, NIGHT])

/** 2026-09-01 〜 09-30（30 日） */
const SEPTEMBER = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)

const cell = (staffId: string, date: string, patternId: string): ShiftCell => ({
  staffId,
  date,
  patternId,
  fixed: false,
})

describe('countShifts', () => {
  it('勤務日とパターン別を数える。休みは表示側が 日数 − 勤務日 で出す', () => {
    const shifts = toShiftMap([
      cell(STAFF_A, '2026-09-01', EARLY),
      cell(STAFF_A, '2026-09-02', EARLY),
      cell(STAFF_A, '2026-09-03', NIGHT),
      cell(STAFF_A, '2026-09-04', OFF),
    ])

    const [a] = countShifts(shifts, [{ id: STAFF_A }], WORKDAYS, SEPTEMBER)

    expect(a?.staff.id).toBe(STAFF_A)
    expect(a?.workdays).toBe(3)
    expect(a?.byPattern.get(EARLY)).toBe(2)
    expect(a?.byPattern.get(NIGHT)).toBe(1)
    expect(a?.byPattern.get(OFF)).toBe(1)
  })

  it('staffs と同じ順・同じ長さで返し、0 件のスタッフも行を持つ', () => {
    const rows = countShifts(
      toShiftMap([]),
      [{ id: STAFF_B }, { id: STAFF_A }],
      WORKDAYS,
      SEPTEMBER
    )

    expect(rows.map((row) => row.staff.id)).toEqual([STAFF_B, STAFF_A])
    expect(rows[0]).toEqual({ staff: { id: STAFF_B }, workdays: 0, byPattern: new Map() })
  })

  it('0 件のパターンはキーを持たない（表示は空欄。v1 と同じ）', () => {
    const [a] = countShifts(
      toShiftMap([cell(STAFF_A, '2026-09-01', EARLY)]),
      [{ id: STAFF_A }],
      WORKDAYS,
      SEPTEMBER
    )

    expect(a?.byPattern.has(NIGHT)).toBe(false)
  })

  it('staffs に無いスタッフの行は数えない', () => {
    const shifts = toShiftMap([
      cell(STAFF_A, '2026-09-01', EARLY),
      cell(STAFF_B, '2026-09-01', EARLY),
    ])

    const rows = countShifts(shifts, [{ id: STAFF_A }], WORKDAYS, SEPTEMBER)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.workdays).toBe(1)
  })

  it('期間外のシフトは数えない（楽観更新のペアが翌日に入るため）', () => {
    // 期間の最終日に夜勤を置くと、applyAssign は翌日（10/1 = 期間外）に明けを足す
    const shifts = toShiftMap([
      cell(STAFF_A, '2026-09-30', NIGHT),
      cell(STAFF_A, '2026-10-01', EARLY),
    ])

    const [a] = countShifts(shifts, [{ id: STAFF_A }], WORKDAYS, SEPTEMBER)

    expect(a?.workdays).toBe(1)
    expect(a?.byPattern.get(EARLY)).toBeUndefined()
  })

  it('スタッフが 0 人なら空', () => {
    expect(countShifts(toShiftMap([]), [], WORKDAYS, SEPTEMBER)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { planDefaultPatterns, type StaffDefaults } from './planDefaultPatterns'

const STAFF_A = 'aaaa'
const STAFF_B = 'bbbb'
const EARLY = 'early'
const OFF = 'off'

// 2026-09-21（月・敬老の日）〜 2026-09-23（水・秋分の日）。祝日は 21 と 22 を渡す
const DATES = ['2026-09-21', '2026-09-22', '2026-09-23']

describe('planDefaultPatterns', () => {
  it('曜日のデフォルトを期間分に広げる', () => {
    const staffs: StaffDefaults[] = [{ id: STAFF_A, defaults: { '1': EARLY, '3': OFF } }]

    // 祝日なしで見ると 21 = 月(1)、22 = 火(2)、23 = 水(3)
    expect(planDefaultPatterns(staffs, DATES, new Set())).toEqual([
      { staffId: STAFF_A, date: '2026-09-21', patternId: EARLY },
      { staffId: STAFF_A, date: '2026-09-23', patternId: OFF },
    ])
  })

  it('祝日は曜日より優先する（v1 と同じ）', () => {
    const staffs: StaffDefaults[] = [{ id: STAFF_A, defaults: { '1': EARLY, holiday: OFF } }]
    const holidays = new Set(['2026-09-21', '2026-09-22'])

    // 月曜だが祝日なので holiday のパターンが勝つ
    expect(planDefaultPatterns(staffs, DATES, holidays)).toEqual([
      { staffId: STAFF_A, date: '2026-09-21', patternId: OFF },
      { staffId: STAFF_A, date: '2026-09-22', patternId: OFF },
    ])
  })

  it('holiday キーだけ設定していて祝日が無い期間なら 0 行', () => {
    const staffs: StaffDefaults[] = [{ id: STAFF_A, defaults: { holiday: OFF } }]

    expect(planDefaultPatterns(staffs, DATES, new Set())).toEqual([])
  })

  it('デフォルトが空のスタッフは行を作らない', () => {
    const staffs: StaffDefaults[] = [
      { id: STAFF_A, defaults: {} },
      { id: STAFF_B, defaults: { '1': EARLY } },
    ]

    expect(planDefaultPatterns(staffs, DATES, new Set())).toEqual([
      { staffId: STAFF_B, date: '2026-09-21', patternId: EARLY },
    ])
  })

  it('スタッフ → 日付 の順に並ぶ', () => {
    const staffs: StaffDefaults[] = [
      { id: STAFF_A, defaults: { '1': EARLY, '2': EARLY } },
      { id: STAFF_B, defaults: { '1': OFF } },
    ]

    expect(planDefaultPatterns(staffs, DATES, new Set()).map((row) => row.staffId)).toEqual([
      STAFF_A,
      STAFF_A,
      STAFF_B,
    ])
  })

  it('スタッフ 0 人 / 日付 0 件なら空', () => {
    expect(planDefaultPatterns([], DATES, new Set())).toEqual([])
    expect(planDefaultPatterns([{ id: STAFF_A, defaults: { '1': EARLY } }], [], new Set())).toEqual(
      []
    )
  })
})

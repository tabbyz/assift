import { describe, expect, it } from 'vitest'
import { lowerBoundWarning } from './warnings'

const staff = (id: string, max: number, wdays: number[]) => ({
  id,
  max_work_week: max,
  available_wdays: wdays,
})
const ALL = [0, 1, 2, 3, 4, 5, 6]

describe('lowerBoundWarning', () => {
  it('週の最低勤務日数だけ', () => {
    expect(
      lowerBoundWarning({ kind: 'max_work_week', days: 9, staff_id: 's1' }, [staff('s1', 2, ALL)])
    ).toBeNull()
  })

  it('スタッフ別: 週の最大 → 勤務できる曜日の順に見る', () => {
    const rule = { kind: 'min_work_week' as const, days: 3, staff_id: 's1' }
    expect(lowerBoundWarning(rule, [staff('s1', 2, ALL)])).toBe(
      '週の最大勤務日数（2日）より多いため守れません'
    )
    expect(lowerBoundWarning(rule, [staff('s1', 5, [1, 3])])).toBe(
      '勤務できる曜日（2日）より多いため守れません'
    )
    expect(lowerBoundWarning(rule, [staff('s1', 5, ALL)])).toBeNull()
  })

  it('スタッフ別で在籍していない人は出さない', () => {
    expect(lowerBoundWarning({ kind: 'min_work_week', days: 3, staff_id: 'gone' }, [])).toBeNull()
  })

  it('店舗全体: 当てはまる人数', () => {
    const rule = { kind: 'min_work_week' as const, days: 3, staff_id: null }
    expect(
      lowerBoundWarning(rule, [staff('a', 2, ALL), staff('b', 5, [0, 6]), staff('c', 5, ALL)])
    ).toBe('週の最大勤務日数か勤務できる曜日が足りない 2 人には守れません')
    expect(lowerBoundWarning(rule, [staff('c', 5, ALL)])).toBeNull()
  })
})

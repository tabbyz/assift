import { describe, expect, it } from 'vitest'
import { describeRestriction } from './describe'

const names = new Map([
  ['p1', '遅番'],
  ['p2', '早番'],
  ['p3', '夜勤'],
])

const base = { days: null, pattern1_id: null, pattern2_id: null }

describe('describeRestriction', () => {
  it('deny_pattern_pair', () => {
    const r = { ...base, kind: 'deny_pattern_pair' as const, pattern1_id: 'p1', pattern2_id: 'p2' }
    expect(describeRestriction(r, names)).toBe('遅番の翌日は早番にはしない')
  })

  it('max_work_week', () => {
    const r = { ...base, kind: 'max_work_week' as const, pattern1_id: 'p3', days: 1 }
    expect(describeRestriction(r, names)).toBe('夜勤は1週間に1日まで')
  })

  it('max_work_consecutive（パターン指定あり）', () => {
    const r = { ...base, kind: 'max_work_consecutive' as const, pattern1_id: 'p2', days: 2 }
    expect(describeRestriction(r, names)).toBe('早番は連続で2日まで')
  })

  it('max_work_consecutive（パターン未指定は「勤務日」）', () => {
    const r = { ...base, kind: 'max_work_consecutive' as const, days: 5 }
    expect(describeRestriction(r, names)).toBe('勤務日は連続で5日まで')
  })

  it('sat_or_sun_dayoff', () => {
    expect(describeRestriction({ ...base, kind: 'sat_or_sun_dayoff' as const }, names)).toBe(
      '土日のどちらかは必ず休みにする'
    )
  })

  it('days が null の行は ? にする（Action 経由では起きないが 012 の移行データにはありうる）', () => {
    const week = { ...base, kind: 'max_work_week' as const, pattern1_id: 'p3', days: null }
    expect(describeRestriction(week, names)).toBe('夜勤は1週間に?日まで')
    const consecutive = { ...base, kind: 'max_work_consecutive' as const, days: null }
    expect(describeRestriction(consecutive, names)).toBe('勤務日は連続で?日まで')
  })

  it('解決できないパターンは ? にする', () => {
    const r = { ...base, kind: 'max_work_week' as const, pattern1_id: 'missing', days: 3 }
    expect(describeRestriction(r, names)).toBe('?は1週間に3日まで')
  })
})

import { describe, expect, it } from 'vitest'
import { describeRestriction, tightenRestrictionDays, wdaysLabel } from './describe'

const names = new Map([
  ['p1', '遅番'],
  ['p2', '早番'],
  ['p3', '夜勤'],
])

const base = { days: null, pattern1_id: null, pattern2_id: null, wdays: null }

describe('describeRestriction', () => {
  it('deny_pattern_pair', () => {
    const r = { ...base, kind: 'deny_pattern_pair' as const, pattern1_id: 'p1', pattern2_id: 'p2' }
    expect(describeRestriction(r, names, 'month')).toBe('遅番の翌日は早番にはしない')
  })

  it('max_work_week', () => {
    const r = { ...base, kind: 'max_work_week' as const, pattern1_id: 'p3', days: 1 }
    expect(describeRestriction(r, names, 'month')).toBe('夜勤は1週間に1日まで')
  })

  it('max_work_consecutive（パターン指定あり）', () => {
    const r = { ...base, kind: 'max_work_consecutive' as const, pattern1_id: 'p2', days: 2 }
    expect(describeRestriction(r, names, 'month')).toBe('早番は連続で2日まで')
  })

  it('max_work_consecutive（パターン未指定は「勤務日」）', () => {
    const r = { ...base, kind: 'max_work_consecutive' as const, days: 5 }
    expect(describeRestriction(r, names, 'month')).toBe('勤務日は連続で5日まで')
  })

  it('sat_or_sun_dayoff', () => {
    expect(
      describeRestriction({ ...base, kind: 'sat_or_sun_dayoff' as const }, names, 'month')
    ).toBe('土日のどちらかは休みにする')
  })

  it('days が null の行は ? にする（Action 経由では起きないが 012 の移行データにはありうる）', () => {
    const week = { ...base, kind: 'max_work_week' as const, pattern1_id: 'p3', days: null }
    expect(describeRestriction(week, names, 'month')).toBe('夜勤は1週間に?日まで')
    const consecutive = { ...base, kind: 'max_work_consecutive' as const, days: null }
    expect(describeRestriction(consecutive, names, 'month')).toBe('勤務日は連続で?日まで')
  })

  it('解決できないパターンは ? にする', () => {
    const r = { ...base, kind: 'max_work_week' as const, pattern1_id: 'missing', days: 3 }
    expect(describeRestriction(r, names, 'month')).toBe('?は1週間に3日まで')
  })

  it('min_work_week', () => {
    const r = { ...base, kind: 'min_work_week' as const, days: 3 }
    expect(describeRestriction(r, names, 'month')).toBe('週に3日以上は入れる')
  })

  it('max_weekend_days は表示期間で言い換える', () => {
    const r = { ...base, kind: 'max_weekend_days' as const, days: 2 }
    expect(describeRestriction(r, names, 'month')).toBe('土日祝の勤務は1ヶ月に2日まで')
    expect(describeRestriction(r, names, 'half_month')).toBe('土日祝の勤務は半月に2日まで')
    expect(describeRestriction(r, names, 'two_week')).toBe('土日祝の勤務は2週間に2日まで')
    expect(describeRestriction(r, names, 'week')).toBe('土日祝の勤務は1週間に2日まで')
  })

  it('prefer_dayoff_wdays', () => {
    const r = { ...base, kind: 'prefer_dayoff_wdays' as const, wdays: [5, 3] }
    expect(describeRestriction(r, names, 'month')).toBe('水・金曜はなるべく休み')
  })
})

describe('wdaysLabel', () => {
  it('日曜始まりの順・重複なし', () => {
    expect(wdaysLabel([6, 0, 6])).toBe('日・土曜')
  })

  it('空・範囲外は ?', () => {
    expect(wdaysLabel(null)).toBe('?曜')
    expect(wdaysLabel([9])).toBe('?曜')
  })
})

describe('tightenRestrictionDays', () => {
  it('日数とパターン名の直後の空白を落とす', () => {
    expect(tightenRestrictionDays('「早番 は1週間に 2日 まで」')).toBe('「早番は1週間に2日まで」')
  })

  it('スタッフ名の空白は残す', () => {
    expect(tightenRestrictionDays('「中村 はるか · 早番 は1週間に 2日 まで」')).toBe(
      '「中村 はるか · 早番は1週間に2日まで」'
    )
    expect(tightenRestrictionDays('中村 はるか → 期間中 0日まで（必ず）')).toBe(
      '中村 はるか → 期間中 0日まで（必ず）'
    )
  })
})

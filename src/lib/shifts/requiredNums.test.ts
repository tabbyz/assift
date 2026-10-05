import { describe, expect, it } from 'vitest'
import {
  buildRequiredByDate,
  overriddenDates,
  overrideKey,
  resolveRequiredNum,
  toOverrideMap,
} from './requiredNums'

const LUNCH = 'ptn-lunch'
const DINNER = 'ptn-dinner'

/** 2026-10-12 は月曜（祝日: スポーツの日）、10-10 は土曜、10-11 は日曜 */
const DEFAULTS = { '1': 2, '6': 3, '0': 3, holiday: 5 }

describe('resolveRequiredNum', () => {
  const overrides = toOverrideMap([{ patternId: LUNCH, date: '2026-10-12', num: 4 }])

  it('上書きがあればそれを使う', () => {
    expect(resolveRequiredNum(overrides, DEFAULTS, LUNCH, '2026-10-12', 'holiday')).toEqual({
      num: 4,
      source: 'override',
    })
  })

  it('上書きが無ければ基本の人数', () => {
    expect(resolveRequiredNum(overrides, DEFAULTS, DINNER, '2026-10-12', 'holiday')).toEqual({
      num: 5,
      source: 'default',
    })
  })

  it('どちらも無ければ未設定（null）', () => {
    expect(resolveRequiredNum(overrides, {}, LUNCH, '2026-10-05', '1')).toEqual({
      num: null,
      source: 'unset',
    })
    expect(resolveRequiredNum(overrides, DEFAULTS, LUNCH, '2026-10-07', '3')).toEqual({
      num: null,
      source: 'unset',
    })
  })

  it('上書きの 0 は 0（基本に落ちない）', () => {
    const zero = toOverrideMap([{ patternId: LUNCH, date: '2026-10-05', num: 0 }])
    expect(resolveRequiredNum(zero, DEFAULTS, LUNCH, '2026-10-05', '1')).toEqual({
      num: 0,
      source: 'override',
    })
  })

  it('基本の 0 も 0（未設定にしない）', () => {
    expect(resolveRequiredNum(new Map(), { '1': 0 }, LUNCH, '2026-10-05', '1')).toEqual({
      num: 0,
      source: 'default',
    })
  })
})

describe('buildRequiredByDate', () => {
  const patterns = [
    { id: LUNCH, defaultRequiredNums: DEFAULTS },
    { id: DINNER, defaultRequiredNums: {} },
  ]

  it('祝日は holiday の列を優先する', () => {
    const required = buildRequiredByDate({
      dates: ['2026-10-12'],
      patterns,
      overrides: new Map(),
      holidays: new Set(['2026-10-12']),
    })
    // 10-12 は月曜（基本 2）だが、祝日なので 5
    expect(required.get('2026-10-12')?.get(LUNCH)).toBe(5)
  })

  it('祝日でなければ曜日の列', () => {
    const required = buildRequiredByDate({
      dates: ['2026-10-12'],
      patterns,
      overrides: new Map(),
      holidays: new Set(),
    })
    expect(required.get('2026-10-12')?.get(LUNCH)).toBe(2)
  })

  it('上書きは曜日より強い', () => {
    const required = buildRequiredByDate({
      dates: ['2026-10-10', '2026-10-11'],
      patterns,
      overrides: toOverrideMap([{ patternId: LUNCH, date: '2026-10-10', num: 1 }]),
      holidays: new Set(),
    })
    expect(required.get('2026-10-10')?.get(LUNCH)).toBe(1)
    expect(required.get('2026-10-11')?.get(LUNCH)).toBe(3)
  })

  it('基本も上書きも無い勤務は null', () => {
    const required = buildRequiredByDate({
      dates: ['2026-10-10'],
      patterns,
      overrides: new Map(),
      holidays: new Set(),
    })
    expect(required.get('2026-10-10')?.get(DINNER)).toBeNull()
  })
})

describe('overriddenDates', () => {
  const dates = ['2026-10-10', '2026-10-11', '2026-10-12']

  it('上書きのある日だけを期間の順で返す', () => {
    const overrides = toOverrideMap([
      { patternId: DINNER, date: '2026-10-12', num: 4 },
      { patternId: LUNCH, date: '2026-10-10', num: 1 },
    ])
    expect(overriddenDates(dates, [LUNCH, DINNER], overrides)).toEqual(['2026-10-10', '2026-10-12'])
  })

  it('基本と同じ値の上書きも数える（戻せることを示すため）', () => {
    const overrides = toOverrideMap([{ patternId: LUNCH, date: '2026-10-11', num: 3 }])
    expect(overriddenDates(dates, [LUNCH], overrides)).toEqual(['2026-10-11'])
  })

  it('対象の勤務に上書きが無ければ空', () => {
    const overrides = toOverrideMap([{ patternId: DINNER, date: '2026-10-11', num: 1 }])
    expect(overriddenDates(dates, [LUNCH], overrides)).toEqual([])
  })
})

describe('overrideKey', () => {
  it('勤務と日付で引ける', () => {
    expect(overrideKey(LUNCH, '2026-10-12')).toBe(`${LUNCH}:2026-10-12`)
  })
})

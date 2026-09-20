import { describe, expect, it } from 'vitest'
import {
  isPeriod,
  lastSourceSuggestion,
  stepPeriod,
  termTitle,
  titleIsRange,
  weekdayNote,
} from './copyPlan'

const conditions = (fromStart: string, fromEnd: string, toStart: string) => ({
  fromStart,
  fromEnd,
  toStart,
  patternIds: ['p1'],
})

describe('isPeriod', () => {
  it('月初から月末は 1 か月の期間', () => {
    expect(isPeriod('month', 0, { start: '2026-09-01', end: '2026-09-30' })).toBe(true)
  })

  it('月の途中で切れた範囲は期間ではない', () => {
    expect(isPeriod('month', 0, { start: '2026-09-01', end: '2026-09-20' })).toBe(false)
  })

  it('週は週の始まりからの 7 日だけ', () => {
    // 2026-09-14 は月曜
    expect(isPeriod('week', 1, { start: '2026-09-14', end: '2026-09-20' })).toBe(true)
    expect(isPeriod('week', 0, { start: '2026-09-14', end: '2026-09-20' })).toBe(false)
  })
})

describe('termTitle / titleIsRange', () => {
  it('期間はツールバーと同じ名前', () => {
    expect(termTitle('month', 0, { start: '2026-09-01', end: '2026-09-30' })).toBe('2026年9月')
    expect(termTitle('half_month', 0, { start: '2026-09-16', end: '2026-09-30' })).toBe(
      '2026年9月 後半'
    )
  })

  it('期間でなければ範囲', () => {
    expect(termTitle('month', 0, { start: '2026-06-01', end: '2026-06-07' })).toBe('6/1 〜 6/7')
  })

  it('週の期間名は範囲表記なので、下の行を曜日だけにする', () => {
    const term = { start: '2026-09-14', end: '2026-09-20' }
    expect(titleIsRange(termTitle('week', 1, term), term)).toBe(true)
    const month = { start: '2026-09-01', end: '2026-09-30' }
    expect(titleIsRange(termTitle('month', 0, month), month)).toBe(false)
  })
})

describe('stepPeriod', () => {
  it('月の前後', () => {
    const sep = { start: '2026-09-01', end: '2026-09-30' }
    expect(stepPeriod('month', 0, sep, -1)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(stepPeriod('month', 0, sep, 1)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('半月は前半と後半を行き来する', () => {
    const early = { start: '2026-10-01', end: '2026-10-15' }
    expect(stepPeriod('half_month', 0, early, -1)).toEqual({
      start: '2026-09-16',
      end: '2026-09-30',
    })
  })
})

describe('weekdayNote', () => {
  it('9/1 火 → 10/1 木 はずれる', () => {
    expect(weekdayNote('2026-09-01', '2026-10-01')).toBe('曜日がずれます（9/1 火 → 10/1 木）')
  })

  it('7 の倍数ならそろう（過去へのコピーでも）', () => {
    expect(weekdayNote('2026-09-21', '2026-09-28')).toBe('曜日もそろいます（月 → 月）')
    expect(weekdayNote('2026-09-28', '2026-09-21')).toBe('曜日もそろいます（月 → 月）')
  })
})

describe('lastSourceSuggestion', () => {
  const current = { start: '2026-09-01', end: '2026-09-30' }

  it('前回条件が無ければ提案しない', () => {
    expect(lastSourceSuggestion(null, 'month', 0, current)).toBeNull()
  })

  it('前回が既定どおり（コピー先の 1 つ前の期間）なら提案しない', () => {
    const stored = conditions('2026-05-01', '2026-05-31', '2026-06-01')
    expect(lastSourceSuggestion(stored, 'month', 0, current)).toBeNull()
  })

  it('わざわざ選んだコピー元（テンプレートの週）は提案する', () => {
    const stored = conditions('2026-06-01', '2026-06-07', '2026-09-21')
    expect(
      lastSourceSuggestion(stored, 'week', 1, { start: '2026-09-21', end: '2026-09-27' })
    ).toEqual({ start: '2026-06-01', end: '2026-06-07' })
  })

  it('今の既定と同じなら提案しない', () => {
    const stored = conditions('2026-09-01', '2026-09-30', '2026-12-01')
    expect(lastSourceSuggestion(stored, 'month', 0, current)).toBeNull()
  })

  it('壊れた期間（終了日が先 / 31 日超）は提案しない', () => {
    expect(
      lastSourceSuggestion(
        conditions('2026-06-10', '2026-06-01', '2026-09-01'),
        'month',
        0,
        current
      )
    ).toBeNull()
    expect(
      lastSourceSuggestion(
        conditions('2026-06-01', '2026-07-15', '2026-09-01'),
        'month',
        0,
        current
      )
    ).toBeNull()
  })
})

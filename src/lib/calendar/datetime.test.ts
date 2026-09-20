import { describe, expect, it } from 'vitest'
import { formatJstDateTime, formatJstMonthDayTime, formatJstYear } from './datetime'

describe('formatJstDateTime', () => {
  it('UTC の timestamptz を JST で整形する', () => {
    expect(formatJstDateTime('2026-09-01T01:30:00Z')).toBe('2026/09/01 10:30')
  })

  // UTC の深夜は JST では翌日。ここがずれると一覧の「◯◯に取得」が 1 日前に見える
  it('UTC 深夜は JST の翌日になる', () => {
    expect(formatJstDateTime('2026-09-01T15:30:00Z')).toBe('2026/09/02 00:30')
  })

  it('JST の 0 時を 24 時と書かない', () => {
    expect(formatJstDateTime('2026-09-01T15:00:00Z')).toBe('2026/09/02 00:00')
  })

  it('月日・時分は 0 詰めする', () => {
    expect(formatJstDateTime('2026-01-02T00:05:00Z')).toBe('2026/01/02 09:05')
  })

  it('Date でも文字列でも同じ結果', () => {
    expect(formatJstDateTime(new Date('2026-09-01T01:30:00Z'))).toBe(
      formatJstDateTime('2026-09-01T01:30:00Z')
    )
  })
})

describe('formatJstMonthDayTime', () => {
  it('月日と時は詰めず、分だけ 2 桁にする', () => {
    expect(formatJstMonthDayTime('2026-09-01T01:30:00Z')).toBe('9/1 10:30')
    expect(formatJstMonthDayTime('2026-01-02T00:05:00Z')).toBe('1/2 9:05')
  })

  it('UTC 深夜は JST の翌日で、0 時は 0 と書く', () => {
    expect(formatJstMonthDayTime('2026-09-01T15:00:00Z')).toBe('9/2 0:00')
  })

  it('年は formatJstYear が別に返す', () => {
    expect(formatJstYear('2026-01-02T00:05:00Z')).toBe('2026')
  })
})

import { describe, expect, it } from 'vitest'
import type { CountsByDate } from '@/lib/shifts/satisfaction'
import type { RequiredByDate } from '@/lib/shifts/requiredNums'
import { countShortSlots, describeShortages } from './demoStatus'

const names: Record<string, string> = { early: '早番', late: '遅番' }
const patternName = (id: string) => names[id]

describe('countShortSlots', () => {
  it('勤務パターンごとの不足を足す。多すぎる枠で別の不足を打ち消さない', () => {
    const dates = ['2026-10-12', '2026-10-13']
    const required: RequiredByDate = new Map([
      [
        '2026-10-12',
        new Map([
          ['early', 2],
          ['late', 1],
        ]),
      ],
      [
        '2026-10-13',
        new Map([
          ['early', 1],
          ['late', 2],
        ]),
      ],
    ])
    const counts: CountsByDate = new Map([
      ['2026-10-12', new Map([['early', 3]])],
      ['2026-10-13', new Map([['late', 1]])],
    ])
    // 12日: 早番は 1 人多いが遅番が 1 足りない / 13日: 早番 1・遅番 1 足りない
    expect(countShortSlots(dates, ['early', 'late'], required, counts)).toBe(3)
  })
})

describe('describeShortages', () => {
  it('1 つの勤務なら名前を付け、曜日を日付の順に並べる', () => {
    expect(
      describeShortages(
        [
          { date: '2026-10-18', patternId: 'late', count: 1 },
          { date: '2026-10-17', patternId: 'late', count: 2 },
        ],
        patternName
      )
    ).toBe('遅番3枠は、条件に合う人がいません（土・日）')
  })

  it('勤務が混ざるときは枠数だけ。同じ日は 1 回だけ書く', () => {
    expect(
      describeShortages(
        [
          { date: '2026-10-18', patternId: 'early', count: 1 },
          { date: '2026-10-18', patternId: 'late', count: 1 },
        ],
        patternName
      )
    ).toBe('2枠は、条件に合う人がいません（日）')
  })
})

import { describe, expect, it } from 'vitest'
import { meterIdentifier, meterTimestamp } from './usage'

describe('meterIdentifier', () => {
  it('Subscription・期間の開始・人数で決まる（100 文字以内）', () => {
    const id = meterIdentifier('sub_1QabcDEF', new Date('2026-10-31T15:00:00Z'), 15)
    expect(id).toBe(`sub_1QabcDEF:${Date.UTC(2026, 9, 31, 15) / 1000}:15`)
    expect(id.length).toBeLessThanOrEqual(100)
  })
})

describe('meterTimestamp', () => {
  const periodEnd = new Date('2026-11-30T14:59:59Z')

  it('期間の途中は今', () => {
    const now = new Date('2026-11-20T14:30:00Z')
    expect(meterTimestamp(now, periodEnd)).toBe(Math.floor(now.getTime() / 1000))
  })

  it('期間の終わりの 1 分前より後にしない', () => {
    expect(meterTimestamp(new Date('2026-11-30T14:59:30Z'), periodEnd)).toBe(
      Math.floor(periodEnd.getTime() / 1000) - 60
    )
  })
})

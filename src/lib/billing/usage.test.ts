import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { isDuplicateMeterEvent, meterIdentifier, meterTimestamp } from './usage'

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

describe('isDuplicateMeterEvent', () => {
  const invalid = (message: string) =>
    new Stripe.errors.StripeInvalidRequestError({ type: 'invalid_request_error', message })

  it('同じ identifier の 2 回目の断りは送れたものとして扱う', () => {
    expect(
      isDuplicateMeterEvent(invalid('An event already exists with identifier sub_1:1791420391:11.'))
    ).toBe(true)
  })

  it('ほかの失敗は失敗のまま', () => {
    expect(isDuplicateMeterEvent(invalid('No such customer: cus_x'))).toBe(false)
    expect(isDuplicateMeterEvent(new Error('An event already exists with identifier x'))).toBe(
      false
    )
  })
})

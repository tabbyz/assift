import { describe, expect, it } from 'vitest'
import { checkoutSessionParams } from './checkout'

const params = checkoutSessionParams({
  customerId: 'cus_1',
  priceId: 'price_1',
  userId: 'user-1',
  successUrl: 'https://example.test/account/billing?checkout=success',
  cancelUrl: 'https://example.test/account/billing/subscribe',
  now: new Date('2026-10-15T03:00:00Z'),
})

describe('checkoutSessionParams', () => {
  it('毎月末日 15:00 UTC（= 翌月 1 日 0:00 JST）に期間を切り替える', () => {
    expect(params.subscription_data?.billing_cycle_anchor_config).toEqual({
      day_of_month: 31,
      hour: 15,
      minute: 0,
      second: 0,
    })
  })

  it('トライアル・クーポンを Stripe に持たせない', () => {
    expect(params.subscription_data).not.toHaveProperty('trial_end')
    expect(params.subscription_data).not.toHaveProperty('trial_period_days')
    expect(params).not.toHaveProperty('discounts')
    expect(params).not.toHaveProperty('allow_promotion_codes')
  })

  it('従量の price は quantity を付けない。カードだけ', () => {
    expect(params.line_items).toEqual([{ price: 'price_1' }])
    expect(params.allowed_payment_method_types).toEqual(['card'])
    expect(params).not.toHaveProperty('payment_method_types')
  })

  it('円だけで請求する（Adaptive Pricing を切る）', () => {
    expect(params.adaptive_pricing).toEqual({ enabled: false })
  })

  it('有効期限は 30 分より少し先（Stripe の下限は 30 分）', () => {
    const now = Math.floor(new Date('2026-10-15T03:00:00Z').getTime() / 1000)
    expect(params.expires_at! - now).toBeGreaterThanOrEqual(30 * 60)
    expect(params.expires_at! - now).toBeLessThan(35 * 60)
  })
})

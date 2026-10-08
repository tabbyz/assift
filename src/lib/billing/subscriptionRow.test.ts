import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { chooseSubscription, subscriptionRow } from './subscriptionRow'

const now = new Date('2026-11-10T03:00:00Z')
const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

/** テストに要る項目だけを持つ Subscription */
function sub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    status: 'active',
    created: sec('2026-10-15T00:00:00Z'),
    start_date: sec('2026-10-15T00:00:00Z'),
    cancel_at: null,
    cancel_at_period_end: false,
    discounts: [],
    schedule: null,
    items: {
      data: [
        {
          price: { id: 'price_1', lookup_key: 'assift_monthly' },
          current_period_start: sec('2026-10-31T15:00:00Z'),
          current_period_end: sec('2026-11-30T15:00:00Z'),
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

describe('subscriptionRow', () => {
  it('期間は subscription item の値を写す', () => {
    const row = subscriptionRow('user-1', sub(), now)
    expect(row).toMatchObject({
      user_id: 'user-1',
      stripe_subscription_id: 'sub_1',
      status: 'active',
      price_lookup_key: 'assift_monthly',
      discount_percent: null,
      cancel_at: null,
      current_period_start: '2026-10-31T15:00:00.000Z',
      current_period_end: '2026-11-30T15:00:00.000Z',
      has_schedule: false,
    })
  })

  it('lookup_key の無い v1 の price は id を写す', () => {
    const row = subscriptionRow(
      'user-1',
      sub({
        items: {
          data: [
            {
              price: { id: 'freemium-monthly', lookup_key: null },
              current_period_start: 1,
              current_period_end: 2,
            },
          ],
        },
      }),
      now
    )
    expect(row.price_lookup_key).toBe('freemium-monthly')
  })

  it('期間の終わりで解約予定なら cancel_at に期間の終わり', () => {
    expect(subscriptionRow('user-1', sub({ cancel_at_period_end: true }), now).cancel_at).toBe(
      '2026-11-30T15:00:00.000Z'
    )
  })

  it('旧料金のクーポン（適用中）', () => {
    const discounts = [{ id: 'di_1', source: { type: 'coupon', coupon: 'assift_v1_legacy' } }]
    expect(subscriptionRow('user-1', sub({ discounts }), now).discount_percent).toBe(50)
  })

  it('切り替え待ちは schedule の次の phase の割引を写す', () => {
    const schedule = {
      id: 'sub_sched_1',
      status: 'active',
      phases: [
        { start_date: sec('2026-10-31T14:59:59Z'), discounts: [] },
        { start_date: sec('2026-11-30T14:59:59Z'), discounts: [{ coupon: 'assift_v1_legacy' }] },
      ],
    }
    const row = subscriptionRow('user-1', sub({ schedule }), now)
    expect(row.has_schedule).toBe(true)
    expect(row.discount_percent).toBe(50)
  })

  it('切り替え待ちの間に解約した（end_behavior: cancel）なら、最後の phase の終わりが cancel_at', () => {
    const schedule = {
      id: 'sub_sched_1',
      status: 'active',
      end_behavior: 'cancel',
      phases: [
        {
          start_date: sec('2026-10-31T14:59:59Z'),
          end_date: sec('2026-11-30T14:59:59Z'),
          discounts: [],
        },
      ],
    }
    const row = subscriptionRow('user-1', sub({ schedule }), now)
    expect(row.cancel_at).toBe('2026-11-30T14:59:59.000Z')
    expect(row.discount_percent).toBeNull()
  })

  it('切り替えの予約（end_behavior: release）は解約予定ではない', () => {
    const schedule = {
      id: 'sub_sched_1',
      status: 'active',
      end_behavior: 'release',
      phases: [
        {
          start_date: sec('2026-10-31T14:59:59Z'),
          end_date: sec('2026-11-30T14:59:59Z'),
          discounts: [],
        },
      ],
    }
    expect(subscriptionRow('user-1', sub({ schedule }), now).cancel_at).toBeNull()
  })

  it('release された schedule は切り替え待ちではない', () => {
    const schedule = { id: 'sub_sched_1', status: 'released', phases: [] }
    expect(subscriptionRow('user-1', sub({ schedule }), now).has_schedule).toBe(false)
  })
})

describe('chooseSubscription', () => {
  it('有効な契約が 2 件なら古いほうを残し、新しいほうを解約の対象にする（旧料金を守る）', () => {
    const older = sub({ id: 'sub_old', created: 100 })
    const newer = sub({ id: 'sub_new', created: 200 })
    const { keep, duplicates } = chooseSubscription([newer, older])
    expect(keep?.id).toBe('sub_old')
    expect(duplicates.map((s) => s.id)).toEqual(['sub_new'])
  })

  it('同じ契約が 2 回渡されても（新旧両方の price の一覧）自分を解約の対象にしない', () => {
    const only = sub({ id: 'sub_only', created: 100 })
    const { keep, duplicates } = chooseSubscription([only, { ...only }])
    expect(keep?.id).toBe('sub_only')
    expect(duplicates).toEqual([])
  })

  it('有効な契約が無ければ、いちばん新しい契約を写す', () => {
    const { keep, duplicates } = chooseSubscription([
      sub({ id: 'sub_a', status: 'canceled', created: 100 }),
      sub({ id: 'sub_b', status: 'canceled', created: 200 }),
    ])
    expect(keep?.id).toBe('sub_b')
    expect(duplicates).toEqual([])
  })

  it('契約が無ければ null', () => {
    expect(chooseSubscription([]).keep).toBeNull()
  })
})

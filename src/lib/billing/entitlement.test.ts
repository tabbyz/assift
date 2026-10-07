import { describe, expect, it } from 'vitest'
import { entitlement, isOverLimit, staffLimit } from './entitlement'

const now = new Date('2026-11-10T12:00:00+09:00')
const future = new Date('2027-01-01T00:00:00+09:00')
const past = new Date('2026-10-01T00:00:00+09:00')
const base = { subscriptionStatus: null, trialEnd: null, manualLimit: null, now }

describe('entitlement', () => {
  it('active / trialing / past_due のサブスクリプションは上限なし', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      const value = entitlement({ ...base, subscriptionStatus: status })
      expect(value.kind).toBe('subscription')
      expect(staffLimit(value)).toBeNull()
    }
  })

  it('unpaid / canceled / incomplete は無料に戻る', () => {
    for (const status of ['unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(staffLimit(entitlement({ ...base, subscriptionStatus: status }))).toBe(10)
    }
  })

  it('トライアル中は上限なし。終わったら無料', () => {
    expect(entitlement({ ...base, trialEnd: future })).toEqual({ kind: 'trial', trialEnd: future })
    expect(staffLimit(entitlement({ ...base, trialEnd: past }))).toBe(10)
  })

  it('サブスクリプションはトライアルより先に当てはめる', () => {
    expect(entitlement({ ...base, subscriptionStatus: 'active', trialEnd: future }).kind).toBe(
      'subscription'
    )
  })

  it('個別契約は 10 より大きいときだけ', () => {
    expect(entitlement({ ...base, manualLimit: 30 })).toEqual({ kind: 'manual', limit: 30 })
    expect(entitlement({ ...base, manualLimit: 10 })).toEqual({ kind: 'free', limit: 10 })
    expect(entitlement({ ...base, manualLimit: 5 })).toEqual({ kind: 'free', limit: 10 })
  })
})

describe('isOverLimit', () => {
  it('上限を超えたときだけロック', () => {
    const free = entitlement(base)
    expect(isOverLimit(free, 10)).toBe(false)
    expect(isOverLimit(free, 11)).toBe(true)
    expect(isOverLimit(entitlement({ ...base, subscriptionStatus: 'active' }), 100)).toBe(false)
  })
})

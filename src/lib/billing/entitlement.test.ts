import { describe, expect, it } from 'vitest'
import { blocksAccountDeletion, entitlement, isOverLimit, staffLimit } from './entitlement'

const now = new Date('2026-11-10T12:00:00+09:00')
const future = new Date('2027-01-01T00:00:00+09:00')
const past = new Date('2026-10-01T00:00:00+09:00')
const base = { subscriptionStatus: null, trialEnd: null, manualLimit: null, staffCap: null, now }

describe('entitlement', () => {
  it('active / trialing / past_due のサブスクリプションは上限人数（staff_cap）', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      const value = entitlement({ ...base, subscriptionStatus: status, staffCap: 20 })
      expect(value).toEqual({ kind: 'subscription', cap: 20 })
      expect(staffLimit(value)).toBe(20)
    }
  })

  it('上限人数が未定（同期が埋める前）なら上限なし', () => {
    expect(staffLimit(entitlement({ ...base, subscriptionStatus: 'active' }))).toBeNull()
  })

  it('上限人数は有料プランのときだけ効く', () => {
    expect(staffLimit(entitlement({ ...base, subscriptionStatus: 'canceled', staffCap: 20 }))).toBe(
      10
    )
    expect(staffLimit(entitlement({ ...base, trialEnd: future, staffCap: 20 }))).toBeNull()
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

  it('有料プランは上限人数を超えていてもロックしない', () => {
    expect(
      isOverLimit(entitlement({ ...base, subscriptionStatus: 'active', staffCap: 20 }), 30)
    ).toBe(false)
  })
})

describe('blocksAccountDeletion', () => {
  it('有料プランを解約していなければ削除できない（支払い失敗のリトライ中も）', () => {
    for (const status of ['active', 'trialing', 'past_due'])
      expect(blocksAccountDeletion({ status, cancel_at: null })).toBe(true)
  })

  it('解約済みで期間の終わりを待っている・終わった・契約が無いなら削除できる', () => {
    expect(blocksAccountDeletion({ status: 'active', cancel_at: '2026-10-31T15:00:00Z' })).toBe(
      false
    )
    expect(blocksAccountDeletion({ status: 'canceled', cancel_at: null })).toBe(false)
    expect(blocksAccountDeletion(null)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { Entitlement } from './entitlement'
import {
  checkStaffAddition,
  priceIncreaseQuote,
  raisesPrice,
  unchangedHeadroom,
  unchangedHeadroomMessage,
} from './staffAddition'

const paid = (cap: number | null): Entitlement => ({ kind: 'subscription', cap })
const base = { entitlement: paid(30), activeStaffCount: 20, adding: 1, periodPeak: 20 }

describe('checkStaffAddition', () => {
  it('有料プランでなければ何も止めない（門番とトライアルに任せる）', () => {
    expect(checkStaffAddition({ ...base, entitlement: { kind: 'free', limit: 10 } })).toBe('ok')
    expect(
      checkStaffAddition({ ...base, entitlement: { kind: 'trial', trialEnd: new Date() } })
    ).toBe('ok')
  })

  it('最大人数ちょうどまでは料金が変わらないので確認しない', () => {
    expect(checkStaffAddition({ ...base, periodPeak: 25, adding: 5 })).toBe('ok')
  })

  it('最大人数を超えるときは確認する', () => {
    expect(checkStaffAddition(base)).toBe('price_increase')
  })

  it('確認した人数までは通す。確認のあとにほかで増えていればもう一度確認', () => {
    expect(checkStaffAddition({ ...base, acknowledgedPeak: 21 })).toBe('ok')
    expect(checkStaffAddition({ ...base, activeStaffCount: 21, acknowledgedPeak: 21 })).toBe(
      'price_increase'
    )
  })

  it('最大人数を超えても、無料の 10 人以内なら料金が上がらないので確認しない', () => {
    expect(checkStaffAddition({ ...base, activeStaffCount: 8, periodPeak: 8, adding: 2 })).toBe(
      'ok'
    )
    expect(checkStaffAddition({ ...base, activeStaffCount: 8, periodPeak: 8, adding: 3 })).toBe(
      'price_increase'
    )
  })

  it('区間の前・切り替え待ち（periodPeak が null）は確認しない', () => {
    expect(checkStaffAddition({ ...base, periodPeak: null })).toBe('ok')
  })

  it('上限人数を超えるときは料金より先に staff_limit', () => {
    expect(checkStaffAddition({ ...base, adding: 11 })).toBe('staff_limit')
    expect(checkStaffAddition({ ...base, adding: 11, acknowledgedPeak: 100 })).toBe('staff_limit')
    expect(checkStaffAddition({ ...base, adding: 10, acknowledgedPeak: 30 })).toBe('ok')
  })

  it('上限人数が未定（同期が埋める前）なら上限では止めない', () => {
    expect(
      checkStaffAddition({ ...base, entitlement: paid(null), adding: 100, periodPeak: null })
    ).toBe('ok')
  })
})

describe('priceIncreaseQuote', () => {
  it('最大人数から足したあとの人数へ（旧料金の割引も効かせる）', () => {
    expect(priceIncreaseQuote({ periodPeak: 12, after: 112, discountPercent: 0 })).toEqual({
      currentYen: 200,
      nextYen: 10200,
    })
    expect(priceIncreaseQuote({ periodPeak: 25, after: 37, discountPercent: 50 })).toEqual({
      currentYen: 750,
      nextYen: 1350,
    })
  })

  it('最大人数より下なら変わらない', () => {
    expect(priceIncreaseQuote({ periodPeak: 25, after: 22, discountPercent: 0 })).toEqual({
      currentYen: 1500,
      nextYen: 1500,
    })
  })
})

describe('raisesPrice', () => {
  it('料金のかかる人数（11 人目から）で比べる', () => {
    expect(raisesPrice(8, 10)).toBe(false)
    expect(raisesPrice(8, 11)).toBe(true)
    expect(raisesPrice(25, 25)).toBe(false)
    expect(raisesPrice(25, 26)).toBe(true)
  })
})

describe('unchangedHeadroom', () => {
  it('最大人数か 10 人の大きいほうまで', () => {
    expect(unchangedHeadroom(8, 8)).toBe(2)
    expect(unchangedHeadroom(20, 25)).toBe(5)
    expect(unchangedHeadroom(25, 25)).toBe(0)
    expect(unchangedHeadroom(30, 25)).toBe(0)
  })
})

describe('unchangedHeadroomMessage', () => {
  it('最大人数が 10 人を超えていればその人数分の料金、以下なら無料の範囲として書く', () => {
    expect(unchangedHeadroomMessage(20, 25)).toContain('すでに 25 人分の料金なので、あと 5 人')
    expect(unchangedHeadroomMessage(8, 8)).toContain('あと 2 人までは無料の範囲')
    expect(unchangedHeadroomMessage(25, 25)).toBeNull()
  })
})

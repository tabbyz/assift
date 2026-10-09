import { describe, expect, it } from 'vitest'
import { canEditTrial, canEndTrialNow } from './trial'

const now = new Date('2026-10-09T03:00:00Z')
const future = new Date('2026-12-31T15:00:00Z')
const past = new Date('2026-09-30T15:00:00Z')

describe('canEditTrial', () => {
  it('有料プランを契約中（active / trialing / past_due）なら変えられない', () => {
    expect(canEditTrial('active')).toBe(false)
    expect(canEditTrial('trialing')).toBe(false)
    expect(canEditTrial('past_due')).toBe(false)
  })

  it('active に戻りうる契約（unpaid / incomplete / paused）も変えられない', () => {
    expect(canEditTrial('unpaid')).toBe(false)
    expect(canEditTrial('incomplete')).toBe(false)
    expect(canEditTrial('paused')).toBe(false)
  })

  it('契約が無い・終わったなら変えられる', () => {
    expect(canEditTrial(null)).toBe(true)
    expect(canEditTrial('canceled')).toBe(true)
    expect(canEditTrial('incomplete_expired')).toBe(true)
  })
})

describe('canEndTrialNow', () => {
  it('トライアル中で契約が無いときだけ', () => {
    expect(canEndTrialNow(null, future, now)).toBe(true)
    expect(canEndTrialNow(null, past, now)).toBe(false)
    expect(canEndTrialNow(null, null, now)).toBe(false)
    expect(canEndTrialNow('active', future, now)).toBe(false)
  })
})

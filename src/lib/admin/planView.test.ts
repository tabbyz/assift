import { describe, expect, it } from 'vitest'
import { adminPlanView } from './planView'

const now = new Date('2026-10-09T03:00:00Z')
const base = {
  subscriptionStatus: null,
  trialEnd: null,
  manualLimit: null,
  staffCap: null,
  activeStaffCount: 5,
}

describe('adminPlanView', () => {
  it('無料: 10 人まで。超えていればロック中', () => {
    expect(adminPlanView(base, now)).toMatchObject({
      label: '無料',
      limitLabel: '10人まで',
      locked: false,
    })
    expect(adminPlanView({ ...base, activeStaffCount: 11 }, now).locked).toBe(true)
  })

  it('トライアル中: 最終日を出し、上限なし', () => {
    const view = adminPlanView(
      { ...base, trialEnd: '2026-12-31T15:00:00Z', activeStaffCount: 30 },
      now
    )
    expect(view).toMatchObject({
      label: 'トライアル（2026/12/31まで）',
      limitLabel: '上限なし',
      locked: false,
    })
  })

  it('トライアルが終わっていれば無料に戻る', () => {
    expect(adminPlanView({ ...base, trialEnd: '2026-09-30T15:00:00Z' }, now).label).toBe('無料')
  })

  it('個別契約: その値まで', () => {
    expect(adminPlanView({ ...base, manualLimit: 20, activeStaffCount: 21 }, now)).toMatchObject({
      label: '個別契約',
      limitLabel: '20人まで',
      locked: true,
    })
  })

  it('有料プラン: 上限人数まで。上限人数を超えていてもロックしない', () => {
    const view = adminPlanView(
      { ...base, subscriptionStatus: 'active', staffCap: 15, activeStaffCount: 16 },
      now
    )
    expect(view).toMatchObject({ label: '有料プラン', limitLabel: '15人まで', locked: false })
  })

  it('有料プランで上限人数が未設定なら上限なし', () => {
    expect(adminPlanView({ ...base, subscriptionStatus: 'past_due' }, now).limitLabel).toBe(
      '上限なし'
    )
  })
})

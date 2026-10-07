import { describe, expect, it } from 'vitest'
import { billableStaffPeak, type StaffCountPoint } from './peak'

const jst = (value: string) => new Date(`${value}+09:00`)
const point = (at: string, count: number): StaffCountPoint => ({ at: jst(at), count })

const periodStart = jst('2026-11-01T00:00:00')
const periodEnd = jst('2026-12-01T00:00:00')

describe('billableStaffPeak', () => {
  it('期間の前の行が開始時点の人数になる', () => {
    expect(
      billableStaffPeak({
        history: [point('2026-10-05T10:00:00', 12)],
        periodStart,
        periodEnd,
        trialEnd: null,
      })
    ).toBe(12)
  })

  it('期間内の増減の最大（12 → 15 → 11 なら 15）', () => {
    const history = [
      point('2026-10-05T10:00:00', 12),
      point('2026-11-09T10:00:00', 15),
      point('2026-11-20T10:00:00', 11),
    ]
    expect(billableStaffPeak({ history, periodStart, periodEnd, trialEnd: null })).toBe(15)
  })

  it('期間の後の行は数えない', () => {
    const history = [point('2026-11-03T10:00:00', 12), point('2026-12-01T00:00:00', 20)]
    expect(billableStaffPeak({ history, periodStart, periodEnd, trialEnd: null })).toBe(12)
  })

  it('履歴が無ければ 0', () => {
    expect(billableStaffPeak({ history: [], periodStart, periodEnd, trialEnd: null })).toBe(0)
  })

  it('トライアルが期間の途中で終わったら、その後だけを数える', () => {
    const history = [
      point('2026-10-20T10:00:00', 25),
      point('2026-11-10T10:00:00', 18),
      point('2026-11-25T10:00:00', 14),
    ]
    const trialEnd = jst('2026-11-15T00:00:00')
    expect(billableStaffPeak({ history, periodStart, periodEnd, trialEnd })).toBe(18)
  })

  it('期間がまるごとトライアルなら 0', () => {
    const history = [point('2026-11-10T10:00:00', 30)]
    expect(
      billableStaffPeak({ history, periodStart, periodEnd, trialEnd: jst('2027-01-01T00:00:00') })
    ).toBe(0)
  })

  it('until までを数える（それより後の行は入れない）', () => {
    const history = [point('2026-11-02T10:00:00', 12), point('2026-11-20T10:00:00', 16)]
    expect(
      billableStaffPeak({
        history,
        periodStart,
        periodEnd,
        trialEnd: null,
        until: jst('2026-11-10T00:00:00'),
      })
    ).toBe(12)
  })

  it('順不同の履歴でも同じ', () => {
    const history = [
      point('2026-11-20T10:00:00', 11),
      point('2026-10-05T10:00:00', 12),
      point('2026-11-09T10:00:00', 15),
    ]
    expect(billableStaffPeak({ history, periodStart, periodEnd, trialEnd: null })).toBe(15)
  })
})

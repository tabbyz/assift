import { describe, expect, it } from 'vitest'
import { splitCurrentShare } from './shareSections'

const range = { start: '2026-10-01', end: '2026-10-31' }
const share = (id: string, startDate: string, endDate: string) => ({ id, startDate, endDate })

describe('splitCurrentShare', () => {
  it('期間が一致する行を current にし、残りは順序を保って others', () => {
    const enabled = [
      share('sep-new', '2026-09-01', '2026-09-30'),
      share('oct', '2026-10-01', '2026-10-31'),
      share('sep-old', '2026-09-01', '2026-09-30'),
    ]
    const { current, others } = splitCurrentShare(enabled, range)
    expect(current?.id).toBe('oct')
    expect(others.map((s) => s.id)).toEqual(['sep-new', 'sep-old'])
  })

  it('同じ期間が 2 本あれば最新（先頭側）を current にし、古いほうは others に残す', () => {
    const enabled = [
      share('oct-new', '2026-10-01', '2026-10-31'),
      share('oct-old', '2026-10-01', '2026-10-31'),
    ]
    const { current, others } = splitCurrentShare(enabled, range)
    expect(current?.id).toBe('oct-new')
    expect(others.map((s) => s.id)).toEqual(['oct-old'])
  })

  it('期間が重なるだけの行は current にしない', () => {
    const enabled = [share('part', '2026-10-01', '2026-10-15')]
    const { current, others } = splitCurrentShare(enabled, range)
    expect(current).toBeNull()
    expect(others.map((s) => s.id)).toEqual(['part'])
  })

  it('空の一覧', () => {
    expect(splitCurrentShare([], range)).toEqual({ current: null, others: [] })
  })
})

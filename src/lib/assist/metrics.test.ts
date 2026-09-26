import { describe, expect, it } from 'vitest'
import { changedRatio, computeMetrics } from './metrics'
import { buildProblem, type PlanRow } from './problem'
import { FIXTURE_PATTERNS as P, required, smallInput } from './testing/fixtures'

const row = (
  staffId: string,
  date: string,
  patternId: string,
  source: PlanRow['source'] = 'assign'
): PlanRow => ({
  staffId,
  date,
  patternId,
  source,
})

describe('computeMetrics', () => {
  const problem = buildProblem(
    smallInput({
      staffCount: 2,
      requiredNums: required(P.early, ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'], 1),
      shifts: [{ staffId: 's2', date: '2026-10-09', patternId: P.day }],
    })
  )

  it('充足率と勤務日数（既存を含む）・土日祝の日数', () => {
    const metrics = computeMetrics(problem, [
      row('s1', '2026-10-04', P.early),
      row('s1', '2026-10-05', P.early),
      row('s2', '2026-10-06', P.early),
    ])
    expect(metrics.requested).toBe(4)
    expect(metrics.filled).toBe(3)
    expect(metrics.fillRate).toBe(0.75)
    expect(metrics.staffs).toEqual([
      { staffId: 's1', workdays: 2, weekends: 1, maxWorkWeek: 5, utilization: 0.4 },
      { staffId: 's2', workdays: 2, weekends: 0, maxWorkWeek: 5, utilization: 0.4 },
    ])
    expect(metrics.utilization).toEqual({ min: 0.4, max: 0.4, stdev: 0 })
    expect(metrics.weekends).toEqual({ min: 0, max: 1 })
  })

  it('不足枠が 0 なら充足率 1', () => {
    expect(computeMetrics(buildProblem(smallInput()), []).fillRate).toBe(1)
  })

  it('休みのペアは勤務日に数えない', () => {
    const metrics = computeMetrics(problem, [
      row('s1', '2026-10-05', P.night),
      row('s1', '2026-10-06', P.after, 'pair'),
    ])
    expect(metrics.staffs[0].workdays).toBe(1)
  })
})

describe('changedRatio', () => {
  const before = [
    row('s1', '2026-10-05', P.early),
    row('s2', '2026-10-06', P.early),
    row('s1', '2026-10-07', P.night),
    row('s1', '2026-10-08', P.after, 'pair'),
  ]

  it('前案の assign 行のうち、新案に同じ (staff, date, pattern) が無い割合（ペアは数えない）', () => {
    expect(
      changedRatio(before, [row('s1', '2026-10-05', P.early), row('s2', '2026-10-07', P.night)])
    ).toBe(0.667)
    expect(changedRatio(before, before)).toBe(0)
  })

  it('前案が空なら比べられない', () => {
    expect(changedRatio([], before)).toBeNull()
  })
})

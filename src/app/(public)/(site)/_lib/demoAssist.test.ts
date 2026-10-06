import { describe, expect, it } from 'vitest'
import { addDays, datesBetween, wday } from '@/lib/calendar/dateString'
import { holidaysIn } from '@/lib/calendar/holidays'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import { requiredAt } from '@/lib/shifts/satisfaction'
import { planDemoAssist } from './demoAssist'
import { DEMO_PATTERNS, DEMO_RULES, DEMO_STAFFS, demoInitialShifts, demoRequired } from './demoData'

const isWorkday = (patternId: string) =>
  DEMO_PATTERNS.find((p) => p.id === patternId)?.kind === 'workday'

function setup(monday: string) {
  const dates = datesBetween(monday, addDays(monday, 6))
  const holidays = new Set(holidaysIn(dates))
  const shifts = demoInitialShifts(dates)
  const required = demoRequired(dates, holidays)
  const plan = planDemoAssist({
    dates,
    staffs: DEMO_STAFFS,
    shifts,
    required,
    patternIds: DEMO_RULES.patternIds,
    isWorkday,
    rest: DEMO_RULES.rest,
    maxConsecutive: DEMO_RULES.maxConsecutive,
  })
  const after: ShiftMap = new Map(shifts)
  for (const cell of plan.adds) after.set(cellKey(cell.staffId, cell.date), cell)
  return { dates, shifts, required, plan, after }
}

/** 条件をすべて守っているか（週ごとに確かめる） */
function expectRulesHold({ dates, shifts, plan, after }: ReturnType<typeof setup>) {
  for (const cell of plan.adds) {
    // 既にあるマスは上書きしない
    expect(shifts.has(cellKey(cell.staffId, cell.date))).toBe(false)
    expect(cell.fixed).toBe(false)
    const staff = DEMO_STAFFS.find((s) => s.id === cell.staffId)!
    expect(staff.availableWdays).toContain(wday(cell.date))
  }
  for (const staff of DEMO_STAFFS) {
    const row = dates.map((date) => after.get(cellKey(staff.id, date))?.patternId)
    const worked = row.map((p) => p !== undefined && isWorkday(p))
    // AI が入れた人は週の上限を超えない（最初から上限まで入っている人には足さない）
    if (plan.adds.some((c) => c.staffId === staff.id)) {
      expect(worked.filter(Boolean).length).toBeLessThanOrEqual(staff.maxPerWeek)
    }
    let streak = 0
    row.forEach((patternId, i) => {
      streak = worked[i] ? streak + 1 : 0
      if (plan.adds.some((c) => c.staffId === staff.id && c.date === dates[i])) {
        expect(streak).toBeLessThanOrEqual(DEMO_RULES.maxConsecutive)
        if (patternId === 'early') expect(row[i - 1]).not.toBe('late')
        if (patternId === 'late') expect(row[i + 1]).not.toBe('early')
      }
    })
  }
}

describe('planDemoAssist', () => {
  it('祝日の月曜がある週: 20 枠のうち 19 枠を入れ、日曜の遅番が 1 枠残る', () => {
    // 2026-10-12 はスポーツの日
    const week = setup('2026-10-12')
    expect(week.plan.adds).toHaveLength(19)
    expect(week.plan.shortages).toEqual([{ date: '2026-10-18', patternId: 'late', count: 1 }])
    expectRulesHold(week)
  })

  it('埋めた枠と残った枠を足すと、もともと足りなかった枠の数になる', () => {
    const week = setup('2026-10-12')
    let missing = 0
    for (const date of week.dates) {
      for (const patternId of DEMO_RULES.patternIds) {
        const num = requiredAt(week.required, date, patternId) ?? 0
        const have = DEMO_STAFFS.filter(
          (s) => week.shifts.get(cellKey(s.id, date))?.patternId === patternId
        ).length
        missing += Math.max(0, num - have)
      }
    }
    const left = week.plan.shortages.reduce((n, s) => n + s.count, 0)
    expect(week.plan.adds.length + left).toBe(missing)
  })

  it('1 年分のどの週でも条件を守る（祝日の有無で必要人数が変わる）', () => {
    let monday = '2026-10-12'
    for (let i = 0; i < 52; i++) {
      expectRulesHold(setup(monday))
      monday = addDays(monday, 7)
    }
  })
})

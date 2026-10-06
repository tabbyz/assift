import { wday } from '@/lib/calendar/dateString'
import { cellKey, type ShiftCell, type ShiftMap } from '@/lib/shifts/key'
import { requiredAt } from '@/lib/shifts/satisfaction'
import type { RequiredByDate } from '@/lib/shifts/requiredNums'
import type { DemoStaff } from './demoData'

/**
 * LP のデモの「AIで作成」（016 §3.3）。
 *
 * **実物ではない**。実物はソルバーが期間全体を解き、検証器を通したものだけを書く（012）。
 * ここは日付の順に不足の枠を埋める貪欲法で、LP で説明している条件だけを守る:
 * 出られない曜日・週の上限・遅番の翌日に早番を入れない・続けて入れる日数の上限。
 * 既に入っているマス（下書き・確定とも）は動かさない。
 */

export type DemoAssistInput = {
  dates: string[]
  staffs: DemoStaff[]
  shifts: ShiftMap
  required: RequiredByDate
  /** 割り当てる勤務と順番 */
  patternIds: readonly string[]
  /** 勤務日に数えるパターンか（公休・有給は数えない） */
  isWorkday: (patternId: string) => boolean
  /** `after` の翌日に `before` を入れない */
  rest: { readonly after: string; readonly before: string }
  maxConsecutive: number
}

export type DemoShortage = { date: string; patternId: string; count: number }

export type DemoAssistPlan = {
  /** 入れる順に並ぶ（画面はこの順に 1 マスずつ出す） */
  adds: ShiftCell[]
  /** 条件に合うスタッフがいなくて埋まらなかった枠 */
  shortages: DemoShortage[]
}

export function planDemoAssist(input: DemoAssistInput): DemoAssistPlan {
  const { dates, staffs, required, patternIds, isWorkday, rest, maxConsecutive } = input
  const sim = new Map<string, string>()
  for (const [key, cell] of input.shifts) sim.set(key, cell.patternId)

  const at = (staffId: string, index: number): string | undefined => {
    const date = dates[index]
    return date ? sim.get(cellKey(staffId, date)) : undefined
  }
  const works = (staffId: string, index: number): boolean => {
    const patternId = at(staffId, index)
    return patternId !== undefined && isWorkday(patternId)
  }
  const workdays = (staffId: string): number =>
    dates.reduce((n, _, index) => n + (works(staffId, index) ? 1 : 0), 0)
  /** この日に入れたとすると何日続くか */
  const streakIfWorks = (staffId: string, index: number): number => {
    let n = 1
    for (let i = index - 1; i >= 0 && works(staffId, i); i--) n++
    for (let i = index + 1; i < dates.length && works(staffId, i); i++) n++
    return n
  }

  const adds: ShiftCell[] = []
  const shortages: DemoShortage[] = []

  dates.forEach((date, index) => {
    for (const patternId of patternIds) {
      const num = requiredAt(required, date, patternId)
      if (num === null) continue
      let need = num - staffs.filter((s) => at(s.id, index) === patternId).length

      while (need > 0) {
        const candidates = staffs
          .filter((staff) => {
            if (at(staff.id, index) !== undefined) return false
            if (!staff.availableWdays.includes(wday(date))) return false
            if (workdays(staff.id) >= staff.maxPerWeek) return false
            if (patternId === rest.before && at(staff.id, index - 1) === rest.after) return false
            if (patternId === rest.after && at(staff.id, index + 1) === rest.before) return false
            if (streakIfWorks(staff.id, index) > maxConsecutive) return false
            return true
          })
          // 上限に対してまだ余裕のある人から。同じなら並び順
          .sort((a, b) => workdays(a.id) / a.maxPerWeek - workdays(b.id) / b.maxPerWeek)

        const pick = candidates[0]
        if (!pick) {
          shortages.push({ date, patternId, count: need })
          break
        }
        sim.set(cellKey(pick.id, date), patternId)
        adds.push({ staffId: pick.id, date, patternId, fixed: false })
        need--
      }
    }
  })

  return { adds, shortages }
}

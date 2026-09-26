import { wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import {
  capacityAt,
  isWorkday,
  slotKey,
  staticBlock,
  withPair,
  type PlanRow,
  type Problem,
} from './problem'
import { stateOf, unitViolations } from './validate'

/**
 * 埋まらなかった枠の理由（012 §5.6）。純関数。
 *
 * 各不足枠について、H1〜H4 を満たす候補ごとに「最終の解に入れたら何が壊れるか」を求めて集計する。
 * 文章化は LLM（`llm/explain.ts`）に任せるが、**理由そのものは TS が決める**（LLM に数えさせない）。
 */

export type UnfilledSlot = {
  date: string
  patternId: string
  /** 埋まらなかった人数 */
  count: number
  /** 画面に出す 1 行（例: 「候補 2 人とも 週上限（5日）」「土曜日に「遅番」を担当できるスタッフがいません」） */
  reason: string
  candidates: number
  breakdown: { label: string; count: number }[]
}

export type ReasonOptions = {
  /** 不足の最小性がソルバーの最適性で言えるとき（1 段目が Optimal）だけ「別の枠に配置」と書く */
  shortageOptimal: boolean
  /** ハードな指示が効いていたか（緩めずに解けた場合）。どの制約にも掛からない候補の理由になる */
  hardDirectives: boolean
}

export const OTHER_SLOT = '別の枠に配置済み'
const TRADE_OFF = '他の枠との兼ね合い'

/** (date, pattern) ごとに、計画で入った出勤日の行の数（ペアで入った行も数える） */
export function placedCounts(problem: Problem, plan: PlanRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of plan) {
    if (!isWorkday(problem, row.patternId)) continue
    const key = slotKey(row.date, row.patternId)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** 枠ごとの残り（P の不足枠だけ） */
export function unfilledCounts(problem: Problem, plan: PlanRow[]): Map<string, number> {
  const placed = placedCounts(problem, plan)
  const left = new Map<string, number>()
  for (const slot of problem.demand) {
    const key = slotKey(slot.date, slot.patternId)
    const remaining = slot.count - Math.min(slot.count, placed.get(key) ?? 0)
    if (remaining > 0) left.set(key, remaining)
  }
  return left
}

/** 「n / m 枠」の分子。P の不足枠に入った行の数（枠数を超えて数えない） */
export function filledCount(problem: Problem, plan: PlanRow[]): number {
  const left = unfilledCounts(problem, plan)
  let unfilled = 0
  for (const count of left.values()) unfilled += count
  return problem.requested - unfilled
}

function noCandidateReason(problem: Problem, date: string, patternId: string): string {
  const pattern = problem.patternById.get(patternId)
  const selectable = problem.staffs.filter((staff) => staff.patternIds.has(patternId))
  if (selectable.length === 0) return `「${pattern?.name ?? '?'}」を選択できるスタッフがいません`
  const day = wday(date)
  if (!selectable.some((staff) => staff.availableWdays.has(day))) {
    return `${WEEKDAY_LABELS[day]}曜日に「${pattern?.name ?? '?'}」を担当できるスタッフがいません`
  }
  return '候補のスタッフはすでにシフトが入っています'
}

/** `候補 2 人とも 週上限（5日）` / `候補 3 人: 連勤 1 · 別の枠に配置済み 2` */
function summarize(candidates: number, breakdown: { label: string; count: number }[]): string {
  if (breakdown.length === 1) {
    return candidates === 1
      ? `候補 1 人: ${breakdown[0].label}`
      : `候補 ${candidates} 人とも ${breakdown[0].label}`
  }
  return `候補 ${candidates} 人: ${breakdown.map((item) => `${item.label} ${item.count}`).join(' · ')}`
}

export function explainUnfilled(
  problem: Problem,
  plan: PlanRow[],
  options: ReasonOptions
): UnfilledSlot[] {
  const left = unfilledCounts(problem, plan)
  const state = stateOf(problem, plan)
  const result: UnfilledSlot[] = []

  for (const slot of problem.demand) {
    const count = left.get(slotKey(slot.date, slot.patternId)) ?? 0
    if (count === 0) continue

    const labels = new Map<string, number>()
    let candidates = 0
    for (const staff of problem.staffs) {
      const block = staticBlock(problem, staff, slot.date, slot.patternId)
      // H1〜H4 を既存シフトで満たさない人は候補に数えない
      if (block === 'occupied' || block === 'wday' || block === 'pattern') continue
      candidates++

      let label: string
      if (block === 'pair_occupied') label = 'ペア先が埋まっている'
      else if (block === 'pair_no_slot') label = 'ペア先に枠が無い'
      else if (state.occupant(staff.id, slot.date) !== undefined) {
        // 同じ日に別の枠へ置いた。その人を動かしても不足の合計が減らないことは 1 段目の最適性から言える
        label = options.shortageOptimal ? OTHER_SLOT : TRADE_OFF
      } else {
        const [parent, pair] = withPair(problem, {
          staffId: staff.id,
          date: slot.date,
          patternId: slot.patternId,
        })
        const violations = unitViolations(problem, state, { parent, pair: pair ?? null })
        const first = violations[0]
        if (!first) label = options.hardDirectives ? '指示（必ず）との兼ね合い' : TRADE_OFF
        else if (first.code === 'H2') label = 'ペア先が埋まっている'
        else if (first.code === 'H10') label = 'ペア先に枠が無い'
        else label = first.rule ?? first.message
      }
      labels.set(label, (labels.get(label) ?? 0) + 1)
    }

    const breakdown = [...labels]
      .map(([label, n]) => ({ label, count: n }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    result.push({
      date: slot.date,
      patternId: slot.patternId,
      count,
      reason:
        candidates === 0
          ? noCandidateReason(problem, slot.date, slot.patternId)
          : summarize(candidates, breakdown),
      candidates,
      breakdown,
    })
  }

  return result
}

/** 着地日を含め、計画の出勤日の行が枠を超えていないか（テスト・評価用の二重確認） */
export function exceedsCapacity(problem: Problem, plan: PlanRow[]): boolean {
  for (const [key, count] of placedCounts(problem, plan)) {
    const [date, patternId] = key.split('|')
    if (count > capacityAt(problem, date, patternId)) return true
  }
  return false
}

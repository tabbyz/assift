import { addDays } from '@/lib/calendar/dateString'
import { cellKey, type ShiftCell, type ShiftMap } from './key'

/** ペアの解決に必要な最小限（`patterns` の全列は要らない） */
export type PairLookup = (patternId: string) => string | null

export type AssignInput = {
  staffId: string
  date: string
  /** null は「空」（アサイン解除） */
  patternId: string | null
  fixed: boolean
}

/**
 * アサインを楽観更新で反映する純関数（007 §3.10 / §5.3）。
 *
 * **`public.assign_shift`（SQL）と同じ規則**を TS で書いたもの。SQL と 2 か所に同じ規則を
 * 持つことは避けられないので、テストケースを pgTAP と同じ並びにして突き合わせられるようにしている。
 *
 * 1. 既存があれば、そのパターンのペアが翌日に入っているときだけ翌日も消す
 * 2. 既存を消す
 * 3. patternId が null なら終わり
 * 4. 当日を入れ、ペアがあれば翌日を上書きする（連鎖はしない）
 */
export function applyAssign(shifts: ShiftMap, pairOf: PairLookup, input: AssignInput): ShiftMap {
  const { staffId, date, patternId, fixed } = input
  const next = new Map(shifts)
  const tomorrow = addDays(date, 1)

  const current = next.get(cellKey(staffId, date))
  if (current) {
    const oldPair = pairOf(current.patternId)
    if (oldPair && next.get(cellKey(staffId, tomorrow))?.patternId === oldPair) {
      next.delete(cellKey(staffId, tomorrow))
    }
    next.delete(cellKey(staffId, date))
  }

  if (!patternId) return next

  const assigned: ShiftCell = { staffId, date, patternId, fixed }
  next.set(cellKey(staffId, date), assigned)

  const newPair = pairOf(patternId)
  if (newPair) {
    next.set(cellKey(staffId, tomorrow), { staffId, date: tomorrow, patternId: newPair, fixed })
  }

  return next
}

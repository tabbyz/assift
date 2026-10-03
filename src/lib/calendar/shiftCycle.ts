import { Constants } from '@/types/database'
import type { Enums } from '@/types/database'

/** シフト表の作成周期。DB の enum（生成型）を正にする */
export type ShiftCycle = Enums<'shift_cycle'>

export const SHIFT_CYCLES = Constants.public.Enums.shift_cycle

/** v1 の ja.yml（tenant.shift_cycle）と同じ表記 */
export const SHIFT_CYCLE_LABELS: Record<ShiftCycle, string> = {
  month: '1ヶ月ごと',
  half_month: '半月ごと',
  two_week: '2週間ごと',
  week: '1週間ごと',
}

/** 「1ヶ月に 2日まで」のように、表示期間 1 回ぶんを言うときの言葉（013 §3.3） */
export const SHIFT_CYCLE_UNITS: Record<ShiftCycle, string> = {
  month: '1ヶ月',
  half_month: '半月',
  two_week: '2週間',
  week: '1週間',
}

/** Mantine の Select に渡す形 */
export const SHIFT_CYCLE_OPTIONS = SHIFT_CYCLES.map((value) => ({
  value,
  label: SHIFT_CYCLE_LABELS[value],
}))

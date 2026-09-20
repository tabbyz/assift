import { Constants } from '@/types/database'
import type { Enums } from '@/types/database'

/** 勤務パターンの種別。DB の enum（生成型）を正にする */
export type PatternKind = Enums<'pattern_kind'>

export const PATTERN_KINDS = Constants.public.Enums.pattern_kind

/** 画面上の呼び方。v1 は「出勤日」だが、勤務日数の集計と同じ「勤務日」に揃える */
export const PATTERN_KIND_LABELS: Record<PatternKind, string> = {
  workday: '勤務日',
  dayoff: '休み',
}

/** Mantine の SegmentedControl / Select に渡す形 */
export const PATTERN_KIND_OPTIONS = PATTERN_KINDS.map((value) => ({
  value,
  label: PATTERN_KIND_LABELS[value],
}))

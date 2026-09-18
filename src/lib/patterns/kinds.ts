import { Constants } from '@/types/database'
import type { Enums } from '@/types/database'

/** 勤務パターンの種別。DB の enum（生成型）を正にする */
export type PatternKind = Enums<'pattern_kind'>

export const PATTERN_KINDS = Constants.public.Enums.pattern_kind

/** v1 の ja.yml（enums.pattern.kind）と同じ表記 */
export const PATTERN_KIND_LABELS: Record<PatternKind, string> = {
  workday: '出勤日',
  dayoff: '休み',
}

/** Mantine の SegmentedControl / Select に渡す形 */
export const PATTERN_KIND_OPTIONS = PATTERN_KINDS.map((value) => ({
  value,
  label: PATTERN_KIND_LABELS[value],
}))

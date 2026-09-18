import { Constants } from '@/types/database'
import type { Enums } from '@/types/database'
import type { PatternKind } from '@/lib/patterns/kinds'

/** 自動アサイン制約の種別。DB の enum（生成型）を正にする */
export type RestrictionKind = Enums<'restriction_kind'>

export const RESTRICTION_KINDS = Constants.public.Enums.restriction_kind

/** v1 の Restriction::KINDS */
export const RESTRICTION_KIND_LABELS: Record<RestrictionKind, string> = {
  deny_pattern_pair: '勤務パターンの組み合わせを拒否',
  max_work_week: '勤務パターンの [週間] 最大勤務日数',
  max_work_consecutive: '連続勤務可能な日数',
  sat_or_sun_dayoff: '土日のどちらかは休み',
}

/** 種別選択カードの説明（v1 settings/restrictions/select_kind） */
export const RESTRICTION_KIND_DESCRIPTIONS: Record<RestrictionKind, string> = {
  deny_pattern_pair: '特定のシフトの翌日に割り当てられる勤務パターンを制限します。',
  max_work_week: '勤務パターンごとに1週間の最大勤務日数を設定します。',
  max_work_consecutive: '連続して勤務可能な日数を設定します。パターン毎に設定することも出来ます。',
  sat_or_sun_dayoff: '土日のどちらかは必ず休みになるように割り当てます。',
}

/** 同じくカードの例示（v1 は `※例えば「…」` の小さい文字） */
export const RESTRICTION_KIND_EXAMPLES: Record<RestrictionKind, string | null> = {
  deny_pattern_pair: '※例えば「遅番の翌日は早番にはしない」',
  max_work_week: '※例えば「夜勤は1週間に1日まで」',
  max_work_consecutive: '※例えば「早番は連続で2日まで」',
  sat_or_sun_dayoff: null,
}

/** 出勤日の勤務パターンを選ばせる種別（0 件のときカードを disabled にする） */
export function requiresWorkdayPattern(kind: RestrictionKind): boolean {
  return kind !== 'sat_or_sun_dayoff'
}

/** 日数（days）を使う種別。DB の CHECK（`days between 1 and 7`）と同じ範囲にする */
export const RESTRICTION_DAYS_MIN = 1
export const RESTRICTION_DAYS_MAX = 7
export const RESTRICTION_DAYS_DEFAULT = 5

/**
 * 制約フォームの勤務パターン選択肢（**1 つの入力欄ぶん**）。
 *
 * 基本は出勤日のパターンだけ（v1 と同じ）。ただし**その欄がすでに参照している id は
 * kind が変わっても残す**。残さないと、制約が指すパターンを「休み」に変えたあと編集画面の
 * Select が空になり、その欄が required なので保存できず、画面からは直せなくなる。
 *
 * 欄ごとに呼ぶこと。2 つの欄の参照 id をまとめて渡すと、片方が参照している休みパターンを
 * もう片方でも**新たに**選べてしまい、「出勤日だけ」という v1 の制限が崩れる。
 */
export function restrictionPatternOptions(
  patterns: readonly { id: string; name: string; kind: PatternKind }[],
  referencedId: string | null
): { value: string; label: string }[] {
  return patterns
    .filter((pattern) => pattern.kind === 'workday' || pattern.id === referencedId)
    .map((pattern) => ({ value: pattern.id, label: pattern.name }))
}

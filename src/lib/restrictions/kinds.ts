import { Constants } from '@/types/database'
import type { Enums } from '@/types/database'
import type { PatternKind } from '@/lib/patterns/kinds'

/** 自動アサイン制約の種別。DB の enum（生成型）を正にする */
export type RestrictionKind = Enums<'restriction_kind'>

export const RESTRICTION_KINDS = Constants.public.Enums.restriction_kind

/** 上の 4 つは v1 の Restriction::KINDS、下の 3 つは 013（指示の min_workdays / limit_weekends / prefer_off と 1:1） */
export const RESTRICTION_KIND_LABELS: Record<RestrictionKind, string> = {
  deny_pattern_pair: '勤務パターンの組み合わせを拒否',
  max_work_week: '勤務パターンの [週間] 最大勤務日数',
  max_work_consecutive: '連続勤務可能な日数',
  sat_or_sun_dayoff: '土日のどちらかは休み',
  min_work_week: '週の最低勤務日数',
  max_weekend_days: '土日祝の上限',
  prefer_dayoff_wdays: 'なるべく休みの曜日',
}

/** 登録画面の種類カードの例示（短い 1 行。013 §4.2） */
export const RESTRICTION_KIND_EXAMPLES: Record<RestrictionKind, string> = {
  deny_pattern_pair: '遅番の翌日は早番にしない',
  max_work_week: '夜勤は1週間に1日まで',
  max_work_consecutive: '勤務日は連続で5日まで',
  sat_or_sun_dayoff: '設定項目なし',
  min_work_week: '週に3日以上は入れる',
  max_weekend_days: '土日祝の勤務は1ヶ月に2日まで',
  prefer_dayoff_wdays: '水曜はなるべく休み',
}

/** 出勤日の勤務パターンを選ばせる種別（0 件のときカードを disabled にする） */
export function requiresWorkdayPattern(kind: RestrictionKind): boolean {
  return kind === 'deny_pattern_pair' || kind === 'max_work_week' || kind === 'max_work_consecutive'
}

/**
 * 強さ（必須 / なるべく）を選べる種別。なるべく休みの曜日は常になるべく:
 * 「必ず休み」はスタッフの「勤務できる曜日」と同じ意味になり、置き場所が 2 つになる（013 §3.3。DB の CHECK も同じ）
 */
export function hasStrengthChoice(kind: RestrictionKind): boolean {
  return kind !== 'prefer_dayoff_wdays'
}

/** 種別を選んだときの強さの既定（013 §3.4）。`true` = 必須 */
export function defaultHard(kind: RestrictionKind): boolean {
  return hasStrengthChoice(kind)
}

/** 強さの表示名。DB の `hard` 列 */
export function strengthLabel(hard: boolean): string {
  return hard ? '必須' : 'なるべく'
}

/**
 * 曜日の並びをそろえる（0..6 だけ・重複なし・日曜始まりの順）。設定画面の文言・エンジンの正規化・Zod が同じ関数を使う:
 * 一手と結果の文言は文字列で突き合わせるので、並びがずれると一致しなくなる
 */
export function normalizeWdays(wdays: readonly number[] | null): number[] {
  return [...new Set(wdays ?? [])]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
}

/** なるべく休みの曜日で選べる数（DB の CHECK と同じ。全曜日をなるべく休みにする意味は無い） */
export const PREFER_DAYOFF_WDAYS_MAX = 6

/** 日数（days）を使う種別。DB の CHECK（`days between 1 and 7`）と同じ範囲にする */
export const RESTRICTION_DAYS_MIN = 1
export const RESTRICTION_DAYS_MAX = 7
/** 土日祝の上限だけは表示期間（最長 31 日）で数えるので広い。1 か月の土日祝は 9〜12 日（DB の CHECK と同じ） */
export const RESTRICTION_WEEKEND_DAYS_MAX = 15

/** 日数の上限（種類ごと）。NumberInput・Zod・DB の CHECK で同じ値 */
export function restrictionDaysMax(kind: RestrictionKind): number {
  return kind === 'max_weekend_days' ? RESTRICTION_WEEKEND_DAYS_MAX : RESTRICTION_DAYS_MAX
}
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

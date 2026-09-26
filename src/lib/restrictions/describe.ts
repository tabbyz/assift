import type { Tables } from '@/types/database'
import type { RestrictionKind } from './kinds'

/** 説明文の生成に必要な列だけ（Client にも渡すので絞る） */
export type RestrictionForDescription = Pick<
  Tables<'restrictions'>,
  'kind' | 'days' | 'pattern1_id' | 'pattern2_id'
>

/** 解決できない値の代わりに出す文字（パターン名・日数で共通） */
const UNKNOWN = '?'

/** days は種別によっては null。Action は必ず入れるが、012 の移行データには欠けた行がありうる */
const days = (value: number | null) => value ?? UNKNOWN

/** 日数とパターン名の直後の空白を落とす。以前の見出しも同じ形にする */
export function tightenRestrictionDays(text: string): string {
  return text.replace(/(に|で) ([0-9?]+日) まで/g, '$1$2まで').replace(/ ([はのに])/g, '$1')
}

function patternName(id: string | null, names: ReadonlyMap<string, string>): string {
  if (!id) return UNKNOWN
  return names.get(id) ?? UNKNOWN
}

/**
 * 一覧に出す 1 行の説明（v1 の `Restriction#description`）。
 * 例: 「遅番の翌日は早番にはしない」「夜勤は1週間に1日まで」「勤務日は連続で5日まで」
 */
export function describeRestriction(
  restriction: RestrictionForDescription,
  patternNames: ReadonlyMap<string, string>
): string {
  const kind: RestrictionKind = restriction.kind

  switch (kind) {
    case 'deny_pattern_pair':
      return `${patternName(restriction.pattern1_id, patternNames)}の翌日は${patternName(restriction.pattern2_id, patternNames)}にはしない`
    case 'max_work_week':
      return `${patternName(restriction.pattern1_id, patternNames)}は1週間に${days(restriction.days)}日まで`
    case 'max_work_consecutive':
      // pattern1 は任意。未指定なら「勤務日」全体が対象（v1 と同じ）
      return restriction.pattern1_id
        ? `${patternName(restriction.pattern1_id, patternNames)}は連続で${days(restriction.days)}日まで`
        : `勤務日は連続で${days(restriction.days)}日まで`
    case 'sat_or_sun_dayoff':
      return '土日のどちらかは必ず休みにする'
  }
}

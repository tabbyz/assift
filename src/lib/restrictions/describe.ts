import { SHIFT_CYCLE_UNITS, type ShiftCycle } from '@/lib/calendar/shiftCycle'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import type { Tables } from '@/types/database'
import { normalizeWdays, type RestrictionKind } from './kinds'

/** 説明文の生成に必要な列だけ（Client にも渡すので絞る） */
export type RestrictionForDescription = Pick<
  Tables<'restrictions'>,
  'kind' | 'days' | 'pattern1_id' | 'pattern2_id' | 'wdays'
>

/** 曜日の並び（`水曜` / `水・金曜`）。日曜始まりの順に並べる */
export function wdaysLabel(wdays: readonly number[] | null): string {
  const sorted = normalizeWdays(wdays)
  if (sorted.length === 0) return `${UNKNOWN}曜`
  return `${sorted.map((day) => WEEKDAY_LABELS[day]).join('・')}曜`
}

/** 解決できない値の代わりに出す文字（パターン名・日数で共通） */
const UNKNOWN = '?'

/** days は種別によっては null。Action は必ず入れるが、012 の移行データには欠けた行がありうる */
const days = (value: number | null) => value ?? UNKNOWN

/**
 * 日数とパターン名の直後の空白を落とす。以前の見出しも同じ形にする。
 * 名前の付いた見出し（制約の `中村 はるか · 早番は…`・指示の `中村 はるか → …`）は名前の部分に触れない
 * （名前の空白まで詰めて「中村はるか」になる）。区切りはどちらも 3 文字
 */
export function tightenRestrictionDays(text: string): string {
  const separator = Math.max(text.lastIndexOf(' · '), text.lastIndexOf(' → '))
  const head = separator === -1 ? '' : text.slice(0, separator + 3)
  const body = separator === -1 ? text : text.slice(separator + 3)
  return head + body.replace(/(に|で) ([0-9?]+日) まで/g, '$1$2まで').replace(/ ([はのに])/g, '$1')
}

function patternName(id: string | null, names: ReadonlyMap<string, string>): string {
  if (!id) return UNKNOWN
  return names.get(id) ?? UNKNOWN
}

/**
 * 一覧に出す 1 行の説明（v1 の `Restriction#description`）。スタッフ名は含めない（一覧はスタッフ名を見出しに出す）。
 * 例: 「遅番の翌日は早番にはしない」「夜勤は1週間に1日まで」「週に3日以上は入れる」
 *
 * 土日祝の上限は表示期間 1 回ぶんで数える（自動アサインは表示期間を 1 回で解く。013 §3.3）ので、`cycle` で言い換える。
 */
export function describeRestriction(
  restriction: RestrictionForDescription,
  patternNames: ReadonlyMap<string, string>,
  cycle: ShiftCycle
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
      // v1 は「必ず休みにする」。013 でなるべくにもできるようになったので、強さは札に任せる
      return '土日のどちらかは休みにする'
    case 'min_work_week':
      return `週に${days(restriction.days)}日以上は入れる`
    case 'max_weekend_days':
      return `土日祝の勤務は${SHIFT_CYCLE_UNITS[cycle]}に${days(restriction.days)}日まで`
    case 'prefer_dayoff_wdays':
      return `${wdaysLabel(restriction.wdays)}はなるべく休み`
  }
}

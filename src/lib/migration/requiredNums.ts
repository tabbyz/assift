import { dayKeyFor } from '@/lib/calendar/weekdays'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'

/**
 * v1 の `required_nums` のうち「デフォルト人数をセット」で期間ぶん焼き付けられた行の判定（021 §7.7・§3-4）。
 *
 * v2 の `required_nums` は「この日だけの上書き」だけを持ち、行が無ければ基本の人数
 * （`patterns.default_required_nums`）に落ちる（015）。焼き付けられた行をそのまま入れると、
 * 基本を直しても既存の期間に届かないという 015 が直したことが v1 の店舗だけに残る。
 *
 * 判定は 015 の migration（`20261005150000_resolve_required_nums.sql`）と同じ `resolveRequiredNum()` の逆向き:
 * その日の基本の人数（祝日は `holiday`。無ければ 0。v1 の `set_default` が `num ||= 0` で焼いた値）と同じなら焼き付け。
 * 015 の SQL は祝日を見られなかったが、ここは `lib/calendar/holidays.ts` の判定を呼び出し側から受けるので、
 * 祝日は `holiday` キーで比べる（v1 の焼き付けと同じ）。
 *
 * `defaults` は `parseRequiredNums()` で数値化した後の値（§7.4。v1 の文字列のまま比べない）。
 */
export type BakedJudgement =
  /** 基本の人数と同じ → 焼き付け（捨てる） */
  | { baked: true; base: number; unset: boolean }
  /** 基本と違う → この日だけの上書き（残す） */
  | { baked: false }

export function judgeBakedRequiredNum(
  num: number,
  defaults: RequiredNumsByDay,
  date: string,
  isHoliday: boolean
): BakedJudgement {
  const key = dayKeyFor(date, isHoliday)
  const base = defaults[key]
  // 基本が未設定の曜日は v1 が 0 を焼いていた。0 の行は「0 人」→「未設定」になる（015 §9.2。表では n/0 が n/— に）
  const expected = base ?? 0
  if (num !== expected) return { baked: false }
  return { baked: true, base: expected, unset: base === undefined }
}

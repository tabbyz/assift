import { z } from 'zod'
import { DAY_KEYS, type DayKey } from '@/lib/calendar/weekdays'

/** 勤務パターンのデフォルト必要人数。曜日キー → 人数（未設定のキーは持たない） */
export type RequiredNumsByDay = Partial<Record<DayKey, number>>

export const REQUIRED_NUM_MIN = 0
export const REQUIRED_NUM_MAX = 99

/**
 * `patterns.default_required_nums`（jsonb → 生成型は `Json`）をアプリ層の型に読む。
 *
 * v1 から移行した行は YAML 由来で数値が文字列になっていることがあるので、数値に寄せてから検査する。
 * 壊れた値・範囲外のキーは捨てる（画面が落ちるより空で描くほうがよい）。
 */
export function parseRequiredNums(value: unknown): RequiredNumsByDay {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const result: RequiredNumsByDay = {}
  for (const key of DAY_KEYS) {
    const raw = (value as Record<string, unknown>)[key]
    if (raw === null || raw === undefined || raw === '') continue
    const num = typeof raw === 'string' ? Number(raw) : raw
    if (typeof num !== 'number' || !Number.isInteger(num)) continue
    if (num < REQUIRED_NUM_MIN || num > REQUIRED_NUM_MAX) continue
    result[key] = num
  }
  return result
}

/** 保存する形。0 は「0 人必要」と「未設定」を区別しないので v1 と同じくそのまま持つ */
export const requiredNumsSchema = z.partialRecord(
  z.enum(DAY_KEYS),
  z
    .int({ error: '必要人数を入力してください' })
    .min(REQUIRED_NUM_MIN, {
      error: `必要人数は${REQUIRED_NUM_MIN}〜${REQUIRED_NUM_MAX}で入力してください`,
    })
    .max(REQUIRED_NUM_MAX, {
      error: `必要人数は${REQUIRED_NUM_MIN}〜${REQUIRED_NUM_MAX}で入力してください`,
    })
)

/**
 * その曜日 / 祝日のデフォルト必要人数。設定が無ければ 0（v1 の `nums[key] || 0`）。
 * シフト表の「デフォルト人数をセット」（007 §3.6）と日別モーダルが使う。
 */
export function defaultRequiredNum(value: RequiredNumsByDay, key: DayKey): number {
  return value[key] ?? 0
}

/** 全曜日・祝日が同じ人数（自動作成のときに勤務ごとに 1 つだけ聞いた値。014 §3.8） */
export function uniformRequiredNums(num: number): RequiredNumsByDay {
  return Object.fromEntries(DAY_KEYS.map((key) => [key, num])) as RequiredNumsByDay
}

/**
 * ある曜日の人数を、表の右にある曜日へコピーする。
 * 空欄なら右も空欄にする。祝日列には右が無いので、渡しても変えない。
 */
export function fillRequiredNumsForward(value: RequiredNumsByDay, key: DayKey): RequiredNumsByDay {
  const index = DAY_KEYS.indexOf(key)
  if (index < 0 || index >= DAY_KEYS.length - 1) return value

  const next: RequiredNumsByDay = { ...value }
  const source = value[key]
  for (const later of DAY_KEYS.slice(index + 1)) {
    if (source === undefined) delete next[later]
    else next[later] = source
  }
  return next
}

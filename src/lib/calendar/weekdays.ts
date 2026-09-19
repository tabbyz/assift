import { wday } from './dateString'

/** 曜日。0 = 日曜（v1 の `start_of_week` と `available_wdays` の値に合わせる） */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

export const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const

/** カレンダーの週の始まり（店舗設定）。Mantine の Select に渡す形 */
export const START_OF_WEEK_OPTIONS = WEEKDAY_VALUES.map((value) => ({
  value: String(value),
  label: `${WEEKDAY_LABELS[value]}曜日`,
}))

/**
 * 曜日別の設定のキー（v1 の `{"0".."6","holiday"}`）。
 * 勤務パターンのデフォルト必要人数とスタッフのデフォルト勤務パターンが共有する。
 */
export const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6', 'holiday'] as const

export type DayKey = (typeof DAY_KEYS)[number]

/** 表の見出し。祝日列は v1 と同じく「祝」 */
export const DAY_KEY_LABELS: Record<DayKey, string> = {
  '0': '日',
  '1': '月',
  '2': '火',
  '3': '水',
  '4': '木',
  '5': '金',
  '6': '土',
  holiday: '祝',
}

/** 日曜・祝日は赤、土曜は青（v1 の色分け） */
export function dayKeyColor(key: DayKey): string | undefined {
  if (key === '0' || key === 'holiday') return 'red'
  if (key === '6') return 'blue'
  return undefined
}

/**
 * その日に使う曜日別設定のキー。祝日は曜日より優先する（v1 の
 * `date.holiday? ? "holiday" : date.wday.to_s`）。
 *
 * 勤務パターンのデフォルト必要人数とスタッフのデフォルト勤務パターンが共有する。
 * 祝日かどうかの判定は呼び出し側から渡す（祝日データは Server だけが持つ。007 §3.8）。
 */
export function dayKeyFor(date: string, isHoliday: boolean): DayKey {
  if (isHoliday) return 'holiday'
  const key = String(wday(date))
  // wday() は 0..6 しか返さないが、型の上で DayKey に絞る
  return isDayKey(key) ? key : '0'
}

/** `day_key` 列など、外から来た文字列を DayKey に絞る */
export function isDayKey(value: string): value is DayKey {
  return (DAY_KEYS as readonly string[]).includes(value)
}

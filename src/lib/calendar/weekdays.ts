/** 曜日。0 = 日曜（v1 の `start_of_week` と `available_wdays` の値に合わせる） */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

export const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const

/** カレンダーの週の始まり（店舗設定）。Mantine の Select に渡す形 */
export const START_OF_WEEK_OPTIONS = WEEKDAY_VALUES.map((value) => ({
  value: String(value),
  label: `${WEEKDAY_LABELS[value]}曜日`,
}))

/**
 * 請求の対象になる区間の最大在籍人数（019 §4.2）。
 * Stripe の Meter に max が無いので、履歴から計算して「ここまでの最大値」を `last` で送る。
 */

export type StaffCountPoint = { at: Date; count: number }

export type PeakInput = {
  /** staff_count_history（順不同でよい） */
  history: StaffCountPoint[]
  periodStart: Date
  periodEnd: Date
  /** profiles.trial_end。トライアルの終わりまでは請求しない */
  trialEnd: Date | null
  /** ここまでを数える（cron は今。省略時は期間の終わりまで） */
  until?: Date
}

/**
 * 区間 = [max(期間の開始, トライアルの終わり), min(期間の終わり, until))。
 * 最大人数 = max(区間の開始時点の人数, 区間内の履歴の人数)。区間が空なら 0
 */
export function billableStaffPeak(input: PeakInput): number {
  const start = Math.max(input.periodStart.getTime(), input.trialEnd?.getTime() ?? -Infinity)
  const end = Math.min(input.periodEnd.getTime(), input.until?.getTime() ?? Infinity)
  if (start >= end) return 0

  const sorted = [...input.history].sort((a, b) => a.at.getTime() - b.at.getTime())
  let atStart = 0
  let peak = 0
  for (const point of sorted) {
    const at = point.at.getTime()
    if (at <= start) atStart = point.count
    else if (at < end) peak = Math.max(peak, point.count)
  }
  return Math.max(atStart, peak)
}

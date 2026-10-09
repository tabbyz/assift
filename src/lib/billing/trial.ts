import { addDays, addMonths, diffDays, startOfMonth } from '@/lib/calendar/dateString'
import { todayJst } from '@/lib/calendar/today'

/** JST のその日の 0:00 */
export function jstMidnight(date: string): Date {
  return new Date(`${date}T00:00:00+09:00`)
}

/**
 * トライアルの終わり（019 §7）: 始めた日（JST）から 2 か月後の月末まで。返すのはその次の瞬間（翌月 1 日 0:00 JST）。
 * DB の `private.trial_end_from()` と同じ計算（start_trial が実際に書く値はそちら）
 */
export function trialEndFrom(now: Date): Date {
  return jstMidnight(addMonths(startOfMonth(todayJst(now)), 3))
}

/**
 * トライアルの最終日（JST の `YYYY-MM-DD`）。画面の「◯月◯日まで」に使う。
 * v1 から移した `trial_end`（月末 23:59:59 JST）にも、v2 の値（翌月 1 日 0:00 JST）にも合うよう、1 ミリ秒前の日付にする
 */
export function trialLastDay(trialEnd: Date): string {
  return lastDayBefore(trialEnd)
}

/**
 * 終わりの瞬間（含まない）の直前の日付（JST）。請求期間の終わり（翌月 1 日 0:00 JST。v1 の契約は月末 23:59:59）を
 * 「◯月◯日まで」と書くときに使う
 */
export function lastDayBefore(end: Date): string {
  return todayJst(new Date(end.getTime() - 1))
}

/** トライアル中か */
export function isTrialActive(trialEnd: Date | null, now: Date): boolean {
  return trialEnd !== null && trialEnd.getTime() > now.getTime()
}

/** 残り日数（今日を含めない。最終日なら 0） */
export function trialDaysLeft(trialEnd: Date, now: Date): number {
  const last = trialLastDay(trialEnd)
  const today = todayJst(now)
  let days = 0
  for (let date = today; date < last; date = addDays(date, 1)) days += 1
  return days
}

/**
 * 始まりの瞬間の日付（JST）。v1 の契約の期間は月末 23:59:59 JST に始まるので、1 秒後の日付にして翌月 1 日と読む
 */
export function firstDayFrom(start: Date): string {
  return todayJst(new Date(start.getTime() + 1000))
}

/**
 * トライアルの進み（0〜1。画面のバー）。始めた日は持っていないので、始めた月の 1 日（最終日の 2 か月前の月初）から数える。
 * 月の途中で始めた人は少し進んで見えるが、最終日に 1 になることは変わらない
 */
export function trialProgress(trialEnd: Date, now: Date): number {
  const last = trialLastDay(trialEnd)
  const start = addMonths(startOfMonth(last), -2)
  const total = diffDays(start, last)
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, diffDays(start, todayJst(now)) / total))
}

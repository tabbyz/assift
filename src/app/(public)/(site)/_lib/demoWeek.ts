import { addDays, wday } from '@/lib/calendar/dateString'

/**
 * デモの表の開始日。**来週の月曜**（今日が月曜でも翌週）。
 * 「次の週を埋める」場面にするため、今週ではなく来週を見せる。
 */
export function demoWeekStart(today: string): string {
  // 今週の月曜まで戻る日数（日曜は 6 日戻る）
  const sinceMonday = (wday(today) + 6) % 7
  return addDays(today, 7 - sinceMonday)
}

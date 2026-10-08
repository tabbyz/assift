import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pageAll } from '@/lib/queries/pageAll'
import type { Database } from '@/types/database'
import type { StaffCountPoint } from './peak'

/**
 * 請求の区間の最大人数に要る履歴だけを読む（019 §4.2）。区間の開始以前の最後の 1 行 + 区間内の行。
 * 全部を読むと年単位で行が増え、`max_rows`（1000）で黙って切られるため。
 *
 * クライアントを引数で受ける（画面は RLS、定期実行と退会は service_role。lib/assist と同じ）。
 * したがってクエリは必ず `.eq('user_id', …)` で 1 人に絞る
 */
export async function readStaffCountHistory(
  db: SupabaseClient<Database>,
  userId: string,
  window: { start: Date; end: Date }
): Promise<StaffCountPoint[]> {
  const [before, within] = await Promise.all([
    db
      .from('staff_count_history')
      .select('active_count, changed_at')
      .eq('user_id', userId)
      .lte('changed_at', window.start.toISOString())
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1),
    // 1 期間でも初期設定の一括追加や退職・復帰の繰り返しで行が増えうる。切られると最大人数を少なく請求するので pageAll を通す
    pageAll((from, to, withCount) =>
      db
        .from('staff_count_history')
        .select('active_count, changed_at', withCount ? { count: 'exact' } : undefined)
        .eq('user_id', userId)
        .gt('changed_at', window.start.toISOString())
        .lt('changed_at', window.end.toISOString())
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ])
  if (before.error) throw before.error
  return [...(before.data ?? []), ...within].map((row) => ({
    at: new Date(row.changed_at),
    count: row.active_count,
  }))
}

/** 区間の開始 = max(期間の開始, トライアルの終わり)（`billableStaffPeak` と同じ） */
export function peakWindow(periodStart: Date, periodEnd: Date, trialEnd: Date | null, until: Date) {
  const start = new Date(Math.max(periodStart.getTime(), trialEnd?.getTime() ?? -Infinity))
  const end = new Date(Math.min(periodEnd.getTime(), until.getTime()))
  return { start, end }
}

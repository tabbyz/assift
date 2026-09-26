import 'server-only'
import { toAssistRunView, type AssistRunView } from '@/lib/assist/result'
import { cellKey } from '@/lib/shifts/key'
import { createClient } from '@/utils/supabase/server'
import { pageAll } from './pageAll'

/** シフト表が使う直近の自動アサイン（012 §4.5） */
export type LatestAssistRun = {
  view: AssistRunView
  /** 結果モーダルを閉じたか。閉じていなければ表に点を出し、ページを開いたときに結果を開き直す */
  acknowledged: boolean
  /** その run の下書きが残っている件数。0 なら操作メニューの「元に戻す」を出さない */
  draftCount: number
  /** 点を出すセル（`cellKey`）。閉じた run では空 */
  cellKeys: string[]
}

/**
 * 表示期間にかかる、直近の成功した（元に戻していない）run。
 *
 * 点と自動の再表示の条件はどちらも「acknowledged_at と rolled_back_at が共に null」（§4.5）。
 * 元に戻した run は対象にしないので、再訪時にモーダルが開き直したり、確定に変えて残ったセルの点が消せなくなったりしない。
 * 失敗した run・実行中の run は見ない（実行中に開いたページでは何も出さない）。
 */
export async function getLatestAssistRun(
  tenantId: string,
  start: string,
  end: string
): Promise<LatestAssistRun | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assist_runs')
    .select('id, start_date, end_date, created_at, instructions, result, acknowledged_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'succeeded')
    .is('rolled_back_at', null)
    .lte('start_date', end)
    .gte('end_date', start)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const view = toAssistRunView(data)
  if (!view) return null
  const acknowledged = data.acknowledged_at !== null

  const [drafts, cells] = await Promise.all([
    supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('assist_run_id', data.id)
      .eq('fixed', false),
    acknowledged
      ? Promise.resolve([])
      : pageAll((from, to, withCount) =>
          supabase
            .from('shifts')
            .select('staff_id, date', withCount ? { count: 'exact' } : undefined)
            .eq('tenant_id', tenantId)
            .eq('assist_run_id', data.id)
            .gte('date', start)
            .lte('date', end)
            .order('date', { ascending: true })
            .order('staff_id', { ascending: true })
            .range(from, to)
        ),
  ])
  if (drafts.error) throw drafts.error

  return {
    view,
    acknowledged,
    draftCount: drafts.count ?? 0,
    cellKeys: cells.map((row) => cellKey(row.staff_id, row.date)),
  }
}

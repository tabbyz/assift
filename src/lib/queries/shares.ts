import 'server-only'
import { minEnabledEndDate } from '@/lib/shares/expiry'
import { createClient } from '@/utils/supabase/server'
import { pageAll } from './pageAll'

export type ShareRow = {
  id: string
  code: string
  startDate: string
  endDate: string
  createdAt: string
}

/**
 * 期限切れ一覧の上限（009 §3.8）。v1 は全件だったが、週次で共有する店舗だと数年で数百行になる。
 * `page.tsx` で毎回読む以上は上限が要る（URL は既に死んでいるので情報としての価値も低い）。
 */
export const EXPIRED_SHARES_LIMIT = 20

const COLUMNS = 'id, code, start_date, end_date, created_at'

type Row = { id: string; code: string; start_date: string; end_date: string; created_at: string }

function toShareRow(row: Row): ShareRow {
  return {
    id: row.id,
    code: row.code,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  }
}

/**
 * 共有の一覧（共有中 / 公開期限が過ぎた）。どちらも作成日時の降順で `shares_tenant_created_idx` に乗る。
 *
 * 境界は `minEnabledEndDate(today)`（= `isShareEnabled` と同じ規則。009 §3.2）。
 *
 * **共有中は `pageAll()` で全件読む。** 未来の期間を先に共有していくと期限切れ側へ移らないまま溜まり、
 * 素の GET では `max_rows`（1000）で黙って切られる（AGENTS.md）。切られた行は一覧に出ないぶん
 * 画面から解除できず、生きた公開 URL だけが残る。期限切れ側は URL が既に死んでいるので
 * `EXPIRED_SHARES_LIMIT` 件で足りる。
 *
 * URL はここでは組まない（クエリは DB の列だけを返す）。`page.tsx` が `requestOrigin()` で組む。
 */
export async function listShares(
  tenantId: string,
  today: string
): Promise<{ enabled: ShareRow[]; expired: ShareRow[] }> {
  const supabase = await createClient()
  const boundary = minEnabledEndDate(today)

  const [enabled, expired] = await Promise.all([
    pageAll<Row>((from, to, withCount) =>
      supabase
        .from('shares')
        .select(COLUMNS, withCount ? { count: 'exact' } : undefined)
        .eq('tenant_id', tenantId)
        .gte('end_date', boundary)
        .order('created_at', { ascending: false })
        // created_at は unique ではないので、ページの境界を安定させる第 2 キーを足す
        .order('id', { ascending: false })
        .range(from, to)
    ),
    supabase
      .from('shares')
      .select(COLUMNS)
      .eq('tenant_id', tenantId)
      .lt('end_date', boundary)
      .order('created_at', { ascending: false })
      .limit(EXPIRED_SHARES_LIMIT),
  ])
  if (expired.error) throw expired.error

  return { enabled: enabled.map(toShareRow), expired: expired.data.map(toShareRow) }
}

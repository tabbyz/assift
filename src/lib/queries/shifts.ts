import 'server-only'
import type { ShiftCell } from '@/lib/shifts/key'
import { createClient } from '@/utils/supabase/server'
import { pageAll } from './pageAll'

/**
 * 表示期間のシフト。
 *
 * 在籍スタッフでの絞り込みはここでは行わない（007 §5.8）。`.in('staff_id', ids)` は
 * PostgREST の GET の URL に uuid を並べるので、在籍者が多い店舗で URL が長くなりすぎる。
 * 退職者の行は呼び出し側（page.tsx）が在籍スタッフの id で落とす。
 *
 * **必ず `pageAll` で読む（008 §10.9）。** 1 回の GET だと `max_rows` に黙って切られ、
 * 31 日 × 33 人あたりからシフト表が歯抜けになる。
 */
export async function listShifts(
  tenantId: string,
  start: string,
  end: string
): Promise<ShiftCell[]> {
  const supabase = await createClient()

  const rows = await pageAll((from, to, withCount) => {
    // (date, staff_id) は unique (staff_id, date) により全順序。索引 (tenant_id, date, staff_id) がこの並びを賄う
    return supabase
      .from('shifts')
      .select('staff_id, pattern_id, date, fixed', withCount ? { count: 'exact' } : undefined)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('staff_id', { ascending: true })
      .range(from, to)
  })

  return rows.map((row) => ({
    staffId: row.staff_id,
    date: row.date,
    patternId: row.pattern_id,
    fixed: row.fixed,
  }))
}

import 'server-only'
import type { ShiftCell } from '@/lib/shifts/key'
import { createClient } from '@/utils/supabase/server'

/**
 * 表示期間のシフト。
 *
 * 在籍スタッフでの絞り込みはここでは行わない（007 §5.8）。`.in('staff_id', ids)` は
 * PostgREST の GET の URL に uuid を並べるので、在籍者が多い店舗で URL が長くなりすぎる。
 * 退職者の行は呼び出し側（page.tsx）が在籍スタッフの id で落とす。
 */
export async function listShifts(
  tenantId: string,
  start: string,
  end: string
): Promise<ShiftCell[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shifts')
    .select('staff_id, pattern_id, date, fixed')
    .eq('tenant_id', tenantId)
    .gte('date', start)
    .lte('date', end)
  if (error) throw error

  return data.map((row) => ({
    staffId: row.staff_id,
    date: row.date,
    patternId: row.pattern_id,
    fixed: row.fixed,
  }))
}

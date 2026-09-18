import 'server-only'
import type { RequiredNumRow } from '@/lib/shifts/satisfaction'
import { createClient } from '@/utils/supabase/server'

/** 表示期間の必要人数。行が無い（日付, パターン）は 0 として扱う（v1 と同じ） */
export async function listRequiredNums(
  tenantId: string,
  start: string,
  end: string
): Promise<RequiredNumRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('required_nums')
    .select('pattern_id, date, num')
    .eq('tenant_id', tenantId)
    .gte('date', start)
    .lte('date', end)
  if (error) throw error

  return data.map((row) => ({ patternId: row.pattern_id, date: row.date, num: row.num }))
}

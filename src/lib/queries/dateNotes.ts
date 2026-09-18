import 'server-only'
import { createClient } from '@/utils/supabase/server'

export type DateNote = { date: string; note: string }

/** 表示期間の日付メモ（v1 events）。1 日 1 件（`unique (tenant_id, date)`） */
export async function listDateNotes(
  tenantId: string,
  start: string,
  end: string
): Promise<DateNote[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('date_notes')
    .select('date, note')
    .eq('tenant_id', tenantId)
    .gte('date', start)
    .lte('date', end)
  if (error) throw error
  return data
}

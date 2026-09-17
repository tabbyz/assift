import 'server-only'
import type { Tables } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

export type Staff = Tables<'staffs'>

/** 在籍スタッフ一覧（表示順）。退職者（retired_at あり）は含めない */
export async function listActiveStaffs(tenantId: string): Promise<Staff[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('retired_at', null)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

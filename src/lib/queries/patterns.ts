import 'server-only'
import type { Tables } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

export type Pattern = Tables<'patterns'>

/** 勤務パターン一覧（表示順）。RLS に加えてクライアント側でも tenant_id を重ねる */
export async function listPatterns(tenantId: string): Promise<Pattern[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

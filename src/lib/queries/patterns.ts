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

/**
 * 勤務パターンを 1 件読む。RLS があるので「他店舗の id」も「存在しない id」も同じ null になり、
 * 呼び出し側は区別せず notFound() にできる。
 */
export async function getPattern(tenantId: string, patternId: string): Promise<Pattern | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', patternId)
    .maybeSingle()
  if (error) throw error
  return data
}

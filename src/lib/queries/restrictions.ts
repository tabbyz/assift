import 'server-only'
import type { Tables } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

export type Restriction = Tables<'restrictions'>

/**
 * 自動アサイン制約の一覧（表示順）。
 * パターン名は `listPatterns` の結果から TS 側で引くので、ここでは埋め込まない（006 §5.3）。
 */
export async function listRestrictions(tenantId: string): Promise<Restriction[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('restrictions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

/** 制約を 1 件読む。他店舗・存在しない id は null */
export async function getRestriction(
  tenantId: string,
  restrictionId: string
): Promise<Restriction | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('restrictions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', restrictionId)
    .maybeSingle()
  if (error) throw error
  return data
}

import 'server-only'
import type { Tables } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

export type Restriction = Tables<'restrictions'>

/**
 * 自動アサイン制約の一覧（登録順。013 で並べ替えをやめたので position は登録順）。
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

/** そのスタッフの規則（登録順）。スタッフの編集画面の「この人の規則」（013 §4.3） */
export async function listStaffRestrictions(
  tenantId: string,
  staffId: string
): Promise<Restriction[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('restrictions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('staff_id', staffId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

/** 店舗全体の規則の件数（スタッフの編集画面の「店舗全体の制約（n 件）もこの人に適用されます」） */
export async function countTenantWideRestrictions(tenantId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('restrictions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('staff_id', null)
  if (error) throw error
  return count ?? 0
}

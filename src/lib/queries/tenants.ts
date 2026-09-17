import 'server-only'
import { cache } from 'react'
import type { Tables } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

export type Tenant = Tables<'tenants'>
/** ヘッダーの切替メニューに渡す最小限（Client に渡すので列を絞る） */
export type TenantSummary = Pick<Tenant, 'id' | 'name'>

/**
 * 自分がオーナーの店舗一覧。RLS（tenants_owner_all）で自分の行しか返らない。
 * 並びは作成順（v1 の navbar と同じ）。`/tenants` のフォールバックはこの末尾を使う。
 */
export const listTenants = cache(async (): Promise<TenantSummary[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
})

/**
 * 店舗を 1 件読む。RLS があるので「他人の店舗」も「存在しない id」も同じ null になり、
 * 呼び出し側は区別せず notFound() にできる（存在を漏らさない）。
 */
export const getTenant = cache(async (tenantId: string): Promise<Tenant | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data
})

export type TutorialStatus = { hasPattern: boolean; hasActiveStaff: boolean; completed: boolean }

/** v1 の `tutorial_completed?`（勤務パターン 1 件以上 かつ 在籍スタッフ 1 件以上） */
export const getTutorialStatus = cache(async (tenantId: string): Promise<TutorialStatus> => {
  const supabase = await createClient()
  const [patterns, staffs] = await Promise.all([
    supabase.from('patterns').select('id').eq('tenant_id', tenantId).limit(1),
    supabase.from('staffs').select('id').eq('tenant_id', tenantId).is('retired_at', null).limit(1),
  ])
  if (patterns.error) throw patterns.error
  if (staffs.error) throw staffs.error

  const hasPattern = patterns.data.length > 0
  const hasActiveStaff = staffs.data.length > 0
  return { hasPattern, hasActiveStaff, completed: hasPattern && hasActiveStaff }
})

import 'server-only'
import { cache } from 'react'
import type { Tables } from '@/types/database'
import { type Pattern, listPatterns } from '@/lib/queries/patterns'
import { resumeStep } from '@/lib/setup/patternsState'
import { createClient } from '@/utils/supabase/server'

export type Tenant = Tables<'tenants'>
/** ヘッダーに渡す最小限（Client に渡すので列を絞る） */
export type TenantSummary = Pick<Tenant, 'id' | 'name'>
/** 店舗一覧の 1 件。`ready` = 初期設定を終えた（切替メニューの「準備中」。014 §5.6） */
export type TenantListItem = TenantSummary & { ready: boolean }

/**
 * 自分がオーナーの店舗一覧。RLS（tenants_owner_all）で自分の行しか返らない。
 * 並びは作成順（v1 の navbar と同じ）。`/tenants` のフォールバックはこの末尾を使う。
 */
export const listTenants = cache(async (): Promise<TenantListItem[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, setup_completed_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    ready: tenant.setup_completed_at !== null,
  }))
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

/**
 * 初期設定の状態（014 §5.6）。完了は `setup_completed_at` で決める（勤務やスタッフの有無ではない。
 * 運用中に全員退職させても初期設定に戻さないため）。続きのステップは勤務の有無から決め、保存しない。
 *
 * 呼び出し側は `getTenant` で店舗が見えることを確かめてから呼ぶ（ここでは店舗を読まない）。
 */
export const getSetupState = cache(
  async (tenantId: string): Promise<{ step: 2 | 3; patterns: Pattern[] }> => {
    const patterns = await listPatterns(tenantId)
    return { step: resumeStep(patterns.length), patterns }
  }
)

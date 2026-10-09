import 'server-only'
import { pageAll } from '@/lib/queries/pageAll'
import { createAdminClient } from './client'

/** 管理画面の読み取り（020 §6）。すべて `createAdminClient()`（service_role）を通し、対象の 1 人に絞る */

export const ADMIN_USERS_PAGE_SIZE = 50
/** ページ番号の上限。URL の `?page=` は任意の数を受けるので、オフセットが int4 を超えて RPC が落ちないよう丸める */
export const ADMIN_USERS_MAX_PAGE = 10_000

/** 一覧の 1 行。生成された型は RETURNS TABLE の列を非 null にするので、null になりうる列をここで直す */
export type AdminUserRow = {
  id: string
  email: string | null
  createdAt: string
  lastSignInAt: string | null
  providers: string[]
  trialEnd: string | null
  manualLimit: number | null
  staffCap: number | null
  subscriptionStatus: string | null
  tenantCount: number
  activeStaffCount: number
}

/**
 * ユーザー一覧（RPC `admin_list_users`）。total は範囲外のページ（0 行）では分からないので null
 */
export async function listAdminUsers(input: {
  q: string
  page: number
}): Promise<{ rows: AdminUserRow[]; total: number | null }> {
  const db = await createAdminClient()
  const page = Math.min(Math.max(1, Math.trunc(input.page)), ADMIN_USERS_MAX_PAGE)
  const { data, error } = await db.rpc('admin_list_users', {
    p_search: input.q || undefined,
    p_limit: ADMIN_USERS_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_USERS_PAGE_SIZE,
  })
  if (error) throw error

  const rows = data.map((row): AdminUserRow => ({
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
    providers: row.providers,
    trialEnd: row.trial_end,
    manualLimit: row.max_staffs_count,
    staffCap: row.staff_cap,
    subscriptionStatus: row.subscription_status,
    tenantCount: row.tenant_count,
    activeStaffCount: row.active_staff_count,
  }))
  return { rows, total: data[0]?.total_count ?? null }
}

export type AdminStaff = { id: string; name: string; retiredAt: string | null }

export type AdminTenant = {
  id: string
  name: string
  createdAt: string
  setupCompletedAt: string | null
  staffs: AdminStaff[]
  patternCount: number
  assistRunCount: number
  lastAssistRunAt: string | null
}

export type AdminUserDetail = {
  id: string
  email: string | null
  createdAt: string
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  providers: string[]
  trialEnd: string | null
  manualLimit: number | null
  staffCap: number | null
  subscription: {
    status: string
    currentPeriodStart: string
    currentPeriodEnd: string
    cancelAt: string | null
    discountPercent: number | null
    hasSchedule: boolean
  } | null
  tenants: AdminTenant[]
}

/** ユーザーの詳細。`profiles` に行が無ければ null */
export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const db = await createAdminClient()
  const [profileRes, subscriptionRes, tenantsRes, authRes] = await Promise.all([
    db
      .from('profiles')
      .select('id, email, created_at, trial_end, max_staffs_count, staff_cap')
      .eq('id', userId)
      .maybeSingle(),
    db
      .from('billing_subscriptions')
      .select(
        'status, current_period_start, current_period_end, cancel_at, discount_percent, has_schedule'
      )
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('tenants')
      .select('id, name, created_at, setup_completed_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true }),
    db.auth.admin.getUserById(userId),
  ])
  if (profileRes.error) throw profileRes.error
  if (subscriptionRes.error) throw subscriptionRes.error
  if (tenantsRes.error) throw tenantsRes.error
  const profile = profileRes.data
  if (!profile) return null
  // profiles は auth.users の FK を持つので、profiles があれば auth のユーザーもある
  if (authRes.error) throw authRes.error
  const authUser = authRes.data.user
  const providers = [...new Set((authUser.identities ?? []).map((i) => i.provider))].sort()

  const tenants = tenantsRes.data
  const tenantIds = tenants.map((t) => t.id)
  // その人の店舗（高々数件）なので .in() の URL に載せてよい。0 件なら呼ばない
  const [staffs, counts] = await Promise.all([
    tenantIds.length === 0
      ? Promise.resolve([])
      : pageAll((from, to, withCount) =>
          db
            .from('staffs')
            .select('id, tenant_id, name, retired_at', withCount ? { count: 'exact' } : undefined)
            .in('tenant_id', tenantIds)
            .order('tenant_id', { ascending: true })
            .order('position', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        ),
    Promise.all(tenantIds.map((tenantId) => readTenantCounts(db, tenantId))),
  ])

  return {
    id: profile.id,
    email: profile.email,
    createdAt: profile.created_at,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    emailConfirmedAt: authUser.email_confirmed_at ?? null,
    providers,
    trialEnd: profile.trial_end,
    manualLimit: profile.max_staffs_count,
    staffCap: profile.staff_cap,
    subscription: subscriptionRes.data
      ? {
          status: subscriptionRes.data.status,
          currentPeriodStart: subscriptionRes.data.current_period_start,
          currentPeriodEnd: subscriptionRes.data.current_period_end,
          cancelAt: subscriptionRes.data.cancel_at,
          discountPercent: subscriptionRes.data.discount_percent,
          hasSchedule: subscriptionRes.data.has_schedule,
        }
      : null,
    tenants: tenants.map((tenant, i) => ({
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.created_at,
      setupCompletedAt: tenant.setup_completed_at,
      staffs: staffs
        .filter((s) => s.tenant_id === tenant.id)
        .map((s) => ({ id: s.id, name: s.name, retiredAt: s.retired_at })),
      ...counts[i],
    })),
  }
}

type AdminDb = Awaited<ReturnType<typeof createAdminClient>>

/** 店舗ごとの勤務パターン数・自動アサインの回数と最後の日時 */
async function readTenantCounts(db: AdminDb, tenantId: string) {
  const [patterns, runs] = await Promise.all([
    db.from('patterns').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    db
      .from('assist_runs')
      .select('created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  if (patterns.error) throw patterns.error
  if (runs.error) throw runs.error
  return {
    patternCount: patterns.count ?? 0,
    assistRunCount: runs.count ?? 0,
    lastAssistRunAt: runs.data[0]?.created_at ?? null,
  }
}

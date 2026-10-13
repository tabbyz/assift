import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'
import {
  activeStaffCountByUser,
  buildProfiles,
  transformEvents,
  transformPatterns,
  transformRequiredNums,
  transformRestrictions,
  transformShares,
  transformShifts,
  transformStaffs,
  transformTenants,
  transformUsers,
  type AuthIdentityRow,
  type AuthUserRow,
  type DateNoteRow,
  type Dropped,
  type Fixed,
  type MigratedUser,
  type Overrides,
  type PatternPairUpdate,
  type PatternRow,
  type ProfileUpdate,
  type RequiredNumRow,
  type RestrictionRow,
  type ShareRow,
  type ShiftRow,
  type StaffCountHistoryRow,
  type StaffDefaultPatternRow,
  type StaffPatternRow,
  type StaffRow,
  type TenantRow,
} from './transform'
import type { V1Export, V1ExportTable } from './v1Types'
import { V1_EXPORT_TABLE_NAMES } from './v1Types'

/**
 * エクスポート全体 → v2 の行 + レポートの材料（021 §6）。`import.ts` は「読む → これ → 書く」の配線だけ。
 * fixtures を通す Vitest（`convert.test.ts`）がこの関数を固定する（§12-4）。
 */

export type ConvertOptions = {
  overrides?: Overrides
  /** 祝日の判定（`lib/calendar/holidays.ts` は server-only なので呼び出し側が渡す） */
  isHoliday: (date: string) => boolean
}

/** v1 のテーブルごとの集計（`読んだ − 捨てた = 入れた` の材料。§8.1） */
export type SourceStats = {
  read: number
  migrated: number
  dropped: Record<string, number>
  fixed: Record<string, number>
}

/** 019 §8.2 の引き継ぎスクリプトの入力の 1 行 */
export type StripeCsvRow = {
  v1_user_id: number
  email: string
  stripe_customer_id: string | null
  stripe_subscription_id: string
  max_staffs_count: number
  last_edited_at: string | null
}

export const STRIPE_CSV_HEADER = [
  'v1_user_id',
  'email',
  'stripe_customer_id',
  'stripe_subscription_id',
  'max_staffs_count',
  'last_edited_at',
]

export type OverLimitUser = {
  v1Id: number
  email: string
  active: number
  maxStaffsCount: number
  hasSubscription: boolean
}

export type Converted = {
  authUsers: AuthUserRow[]
  identities: AuthIdentityRow[]
  tenants: TenantRow[]
  patterns: PatternRow[]
  pairs: PatternPairUpdate[]
  staffs: StaffRow[]
  staffPatterns: StaffPatternRow[]
  staffDefaultPatterns: StaffDefaultPatternRow[]
  shifts: ShiftRow[]
  requiredNums: RequiredNumRow[]
  restrictions: RestrictionRow[]
  dateNotes: DateNoteRow[]
  shares: ShareRow[]
  profiles: ProfileUpdate[]
  history: StaffCountHistoryRow[]
  migratedUsers: MigratedUser[]
  source: Record<V1ExportTable, SourceStats>
  dropped: Dropped[]
  fixed: Fixed[]
  /** 移行しないのに店舗（スタッフかシフトのあるもの）を持つ人（§7.1 の保険。想定 0 件） */
  notMigratedUsersWithTenants: { v1Id: number; email: string; tenantV1Ids: number[] }[]
  /** v1 の over_limit?（在籍 > 上限）と、個別契約でなく在籍 > 10 の人（§8.1） */
  overLimit: { v1OverLimit: OverLimitUser[]; freeOverLimit: OverLimitUser[] }
  /** スタッフ 0 人（準備中）の店舗のうち、勤務パターン・制約・必要人数を持つ店舗の v2 id（§8.1） */
  tenantsPendingWithData: string[]
  stripeCsv: { migrated: StripeCsvRow[]; notMigrated: (StripeCsvRow & { reason: string })[] }
}

function countBy<T extends { reason: string }>(items: T[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) counts[item.reason] = (counts[item.reason] ?? 0) + 1
  return counts
}

/** `shifts.updated_at` の最大を pattern → tenant → user でたどる（§6.1。捨てる前の全行から） */
function lastEditedAtByUser(input: V1Export): Map<number, string> {
  const tenantOwner = new Map<number, number>()
  for (const t of input.tenants) if (t.user_id !== null) tenantOwner.set(t.id, t.user_id)
  const patternOwner = new Map<number, number>()
  for (const p of input.patterns) {
    const owner = p.tenant_id === null ? undefined : tenantOwner.get(p.tenant_id)
    if (owner !== undefined) patternOwner.set(p.id, owner)
  }
  const result = new Map<number, string>()
  for (const s of input.shifts) {
    const owner = s.pattern_id === null ? undefined : patternOwner.get(s.pattern_id)
    if (owner === undefined) continue
    const current = result.get(owner)
    if (current === undefined || s.updated_at > current) result.set(owner, s.updated_at)
  }
  return result
}

export function convertExport(input: V1Export, options: ConvertOptions): Converted {
  const overrides = options.overrides ?? {}

  const users = transformUsers(input.users, overrides)

  const staffCountByTenant = new Map<number, number>()
  for (const s of input.staffs) {
    if (s.tenant_id !== null)
      staffCountByTenant.set(s.tenant_id, (staffCountByTenant.get(s.tenant_id) ?? 0) + 1)
  }
  const tenants = transformTenants(input.tenants, { users: users.users, staffCountByTenant })
  const patterns = transformPatterns(input.patterns, { tenants: tenants.tenants })
  const staffs = transformStaffs(input.staffs, {
    tenants: tenants.tenants,
    patterns: patterns.patterns,
  })
  const shifts = transformShifts(input.shifts, {
    staffs: staffs.staffs,
    patterns: patterns.patterns,
  })
  const requiredNums = transformRequiredNums(input.required_nums, {
    patterns: patterns.patterns,
    isHoliday: options.isHoliday,
  })
  const restrictions = transformRestrictions(input.restrictions, {
    tenants: tenants.tenants,
    patterns: patterns.patterns,
  })
  const events = transformEvents(input.events, { tenants: tenants.tenants })
  const shares = transformShares(input.shares, { tenants: tenants.tenants })

  const activeCounts = activeStaffCountByUser(staffs.staffs)
  const profiles = buildProfiles(users.users, activeCounts)
  const migratedUsers = [...users.users.values()].filter((u): u is MigratedUser => u !== null)

  const results = {
    users,
    tenants,
    staffs,
    patterns,
    shifts,
    required_nums: requiredNums,
    restrictions,
    events,
    shares,
  }
  const dropped: Dropped[] = []
  const fixed: Fixed[] = [...profiles.fixed]
  const source = {} as Record<V1ExportTable, SourceStats>
  for (const table of V1_EXPORT_TABLE_NAMES) {
    const r = results[table]
    // push(...xs) は引数を積むので、数十万件（本物の shifts は 129 万件を捨てる）で
    // Maximum call stack size exceeded になる（リハーサル 2026-10-13。§15）
    for (const d of r.dropped) dropped.push(d)
    for (const f of r.fixed) fixed.push(f)
    const read = input[table].length
    source[table] = {
      read,
      migrated: r.rows.length,
      dropped: countBy(r.dropped),
      fixed: countBy(table === 'users' ? [...r.fixed, ...profiles.fixed] : r.fixed),
    }
    if (read - r.dropped.length !== r.rows.length) {
      throw new Error(
        `${table}: 読んだ ${read} − 捨てた ${r.dropped.length} ≠ 入れる ${r.rows.length}`
      )
    }
  }

  // 移行しないのに店舗（スタッフかシフトのあるもの）を持つ人
  const tenantsWithData = new Set<number>()
  for (const t of staffCountByTenant.keys()) tenantsWithData.add(t)
  const patternTenant = new Map<number, number>()
  for (const p of input.patterns) if (p.tenant_id !== null) patternTenant.set(p.id, p.tenant_id)
  for (const s of input.shifts) {
    const t = s.pattern_id === null ? undefined : patternTenant.get(s.pattern_id)
    if (t !== undefined) tenantsWithData.add(t)
  }
  const tenantsByUser = new Map<number, number[]>()
  for (const t of input.tenants) {
    if (t.user_id === null || !tenantsWithData.has(t.id)) continue
    const list = tenantsByUser.get(t.user_id)
    if (list) list.push(t.id)
    else tenantsByUser.set(t.user_id, [t.id])
  }
  const notMigratedUsersWithTenants = input.users
    .filter((u) => users.users.get(u.id) === null && tenantsByUser.has(u.id))
    .map((u) => ({ v1Id: u.id, email: u.email, tenantV1Ids: tenantsByUser.get(u.id)! }))

  // 上限超過（§8.1）
  const v1OverLimit: OverLimitUser[] = []
  const freeOverLimit: OverLimitUser[] = []
  for (const u of migratedUsers) {
    const active = activeCounts.get(u.v1Id) ?? 0
    const row: OverLimitUser = {
      v1Id: u.v1Id,
      email: u.email,
      active,
      maxStaffsCount: u.maxStaffsCount,
      hasSubscription: u.stripeSubscriptionId !== null,
    }
    if (active > u.maxStaffsCount) v1OverLimit.push(row)
    const manual = u.stripeSubscriptionId === null && u.maxStaffsCount > FREE_STAFF_LIMIT
    if (!manual && active > FREE_STAFF_LIMIT) freeOverLimit.push(row)
  }

  // 準備中の店舗のうちデータを持つもの
  const pending = new Set(
    tenants.rows.filter((t) => t.setup_completed_at === null).map((t) => t.id)
  )
  const withData = new Set<string>()
  for (const p of patterns.rows) if (pending.has(p.tenant_id)) withData.add(p.tenant_id)
  for (const r of restrictions.rows) if (pending.has(r.tenant_id)) withData.add(r.tenant_id)
  for (const r of requiredNums.rows) if (pending.has(r.tenant_id)) withData.add(r.tenant_id)

  // Stripe の引き継ぎ用 CSV（§6.1）
  const lastEdited = lastEditedAtByUser(input)
  const csvRow = (u: {
    v1Id: number
    email: string
    stripeCustomerId: string | null
    stripeSubscriptionId: string
    maxStaffsCount: number
  }): StripeCsvRow => ({
    v1_user_id: u.v1Id,
    email: u.email,
    stripe_customer_id: u.stripeCustomerId,
    stripe_subscription_id: u.stripeSubscriptionId,
    max_staffs_count: u.maxStaffsCount,
    last_edited_at: lastEdited.get(u.v1Id) ?? null,
  })
  const stripeMigrated: StripeCsvRow[] = []
  const stripeNotMigrated: (StripeCsvRow & { reason: string })[] = []
  for (const u of input.users) {
    const sub = u.stripe_subscription_id?.trim()
    if (!sub) continue
    const migrated = users.users.get(u.id)
    if (!migrated) {
      stripeNotMigrated.push({
        ...csvRow({
          v1Id: u.id,
          email: u.email.toLowerCase().trim(),
          stripeCustomerId: u.stripe_customer_id?.trim() || null,
          stripeSubscriptionId: sub,
          maxStaffsCount: u.max_staffs_count,
        }),
        reason: 'not_migrated',
      })
    } else if (migrated.customerLost) {
      stripeNotMigrated.push({
        ...csvRow({ ...migrated, stripeSubscriptionId: sub }),
        reason: 'stripe_customer_duplicate',
      })
    } else {
      stripeMigrated.push(csvRow({ ...migrated, stripeSubscriptionId: sub }))
    }
  }

  return {
    authUsers: users.rows,
    identities: users.identities,
    tenants: tenants.rows,
    patterns: patterns.rows,
    pairs: patterns.pairs,
    staffs: staffs.rows,
    staffPatterns: staffs.staffPatterns,
    staffDefaultPatterns: staffs.staffDefaultPatterns,
    shifts: shifts.rows,
    requiredNums: requiredNums.rows,
    restrictions: restrictions.rows,
    dateNotes: events.rows,
    shares: shares.rows,
    profiles: profiles.profiles,
    history: profiles.history,
    migratedUsers,
    source,
    dropped,
    fixed,
    notMigratedUsersWithTenants,
    overLimit: { v1OverLimit, freeOverLimit },
    tenantsPendingWithData: [...withData],
    stripeCsv: { migrated: stripeMigrated, notMigrated: stripeNotMigrated },
  }
}

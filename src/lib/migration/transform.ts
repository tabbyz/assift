import { addDays, daysBetween, isDateString } from '@/lib/calendar/dateString'
import { isDayKey, type DayKey } from '@/lib/calendar/weekdays'
import { parseRequiredNums, type RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import { PATTERN_DESCRIPTION_MAX_LENGTH, PATTERN_NAME_MAX_LENGTH } from '@/lib/validation/patterns'
import { STAFF_NAME_MAX_LENGTH } from '@/lib/validation/staffs'
import { TENANT_NAME_MAX_LENGTH } from '@/lib/validation/tenants'
import { DATE_NOTE_MAX_LENGTH } from '@/lib/validation/dateNotes'
import { STAFF_CAP_MAX } from '@/lib/validation/billing'
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'
import { judgeBakedRequiredNum } from './requiredNums'
import { truncate } from './truncate'
import { v1Uuid, type V1Table } from './v1Ids'
import type {
  V1Event,
  V1Pattern,
  V1RequiredNum,
  V1Restriction,
  V1Share,
  V1Shift,
  V1Staff,
  V1Tenant,
  V1User,
} from './v1Types'

/**
 * v1 の行 → v2 の行（021 §7）。テーブルごとの純関数。判断はすべてここに置き、スクリプトは配線だけにする（§6.2）。
 *
 * 各関数は `{ rows, dropped, fixed, ... }` を返す。`dropped` は捨てた行の id と理由、`fixed` は直した値の id と理由。
 * 切り詰めは前後の文字数だけを残し、値そのものは書かない（§6.1）。
 *
 * 親テーブルの変換結果は `Map<v1 id, 変換後 | null>` で受ける（null = v1 にはあったが捨てた）。
 * `has()` が false なら `parent_missing`（v1 にも無い）、null なら `parent_dropped`（連鎖して捨てる）。
 */

export type DropReason =
  | 'not_migrated'
  | 'inactive'
  | 'parent_missing'
  | 'parent_dropped'
  | 'unassigned'
  | 'tenant_mismatch'
  | 'duplicate'
  | 'dayoff_pattern'
  | 'invalid_date'
  | 'out_of_range'
  | 'baked'
  | 'unknown_kind'
  | 'missing_column'
  | 'empty_note'
  | 'invalid_code'
  | 'invalid_range'

export type FixReason =
  | 'truncated'
  | 'empty_name'
  | 'password_is_email'
  | 'empty_password'
  | 'unlocked'
  | 'empty_stripe_id'
  | 'stripe_customer_duplicate'
  | 'start_of_week'
  | 'max_work_week'
  | 'available_wdays'
  | 'available_pattern_dropped'
  | 'default_pattern_dropped'
  | 'color_hex'
  | 'pair_pattern'
  | 'staff_cap_clipped'
  | 'end_date_clipped'
  | 'legacy_url_unmatched'

export type Dropped = { table: V1Table; id: number; reason: DropReason; detail?: string }
export type Fixed = {
  table: V1Table
  id: number
  column: string
  reason: FixReason
  detail?: string
  /** 切り詰めの前後の文字数（値は書かない） */
  before?: number
  after?: number
}

/** 変換の規則の外で手で決めたことを渡す口（§6.1 の `--overrides`） */
export type Overrides = {
  /** `stripe_customer_id` → 持ち主の v1 user id（§7.1.1） */
  customerOwner?: Record<string, number>
  /** 移行しない判定だが確認済みで入れる v1 user id（§7.1 の保険） */
  forceMigrateUsers?: number[]
}

/** 規則の前提が崩れていて続けられないとき（メールの重複など）。インポートはこれで止まる */
export class MigrationError extends Error {}

class Recorder {
  dropped: Dropped[] = []
  fixed: Fixed[] = []
  constructor(private table: V1Table) {}
  drop(id: number, reason: DropReason, detail?: string) {
    this.dropped.push(
      detail ? { table: this.table, id, reason, detail } : { table: this.table, id, reason }
    )
  }
  fix(
    id: number,
    column: string,
    reason: FixReason,
    extra?: Pick<Fixed, 'detail' | 'before' | 'after'>
  ) {
    this.fixed.push({ table: this.table, id, column, reason, ...extra })
  }
  /** trim → 切り詰め → 空なら代替。切り詰めと代替を記録する */
  text(id: number, column: string, value: string | null, max: number, fallback: string): string {
    const t = truncate(value ?? '', max)
    if (t.truncated) this.fix(id, column, 'truncated', { before: t.before, after: t.after })
    if (t.value === '') {
      this.fix(id, column, 'empty_name')
      return fallback
    }
    return t.value
  }
}

type ParentLookup<T> =
  { ok: true; parent: T } | { ok: false; reason: 'parent_missing' | 'parent_dropped' }

function parent<T>(map: ReadonlyMap<number, T | null>, id: number | null): ParentLookup<T> {
  if (id === null || !map.has(id)) return { ok: false, reason: 'parent_missing' }
  const found = map.get(id)
  if (found === null || found === undefined) return { ok: false, reason: 'parent_dropped' }
  return { ok: true, parent: found }
}

/** v1 の `(position, id)` 順に 0 から振り直す（§7 共通。null の position は末尾） */
function renumber<T extends { id: number; position: number | null }>(
  rows: T[],
  groupOf: (row: T) => string
): Map<number, number> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = groupOf(row)
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  const result = new Map<number, number>()
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.position === null && b.position === null) return a.id - b.id
      if (a.position === null) return 1
      if (b.position === null) return -1
      return a.position - b.position || a.id - b.id
    })
    list.forEach((row, index) => result.set(row.id, index))
  }
  return result
}

/** 同じ時刻なら id が大きいほう（§7.6・§7.9・§7.10） */
function newer<T extends { id: number }>(a: T, b: T, at: (row: T) => string): T {
  const x = at(a)
  const y = at(b)
  if (x !== y) return x > y ? a : b
  return a.id > b.id ? a : b
}

/** 配列の要素を整数に寄せる（YAML 由来の `"3"` を 3 に。寄せられない値は捨てる） */
function toInts(values: readonly unknown[]): number[] {
  const result: number[] = []
  for (const value of values) {
    const n = typeof value === 'string' ? Number(value) : value
    if (typeof n === 'number' && Number.isInteger(n)) result.push(n)
  }
  return result
}

function toInt(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) ? n : null
}

function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value.trim()
}

// ---------------------------------------------------------------------------
// §7.1 users → auth.users / auth.identities / profiles
//
// 全員を email のアカウントとして入れる（identity は email だけ、providers = ["email"]）。v1 の Google の人
// （provider = 'google_oauth2'）も同じ。v2 で初めて Google ログインしたとき、GoTrue が確認済みの同じメールの
// ユーザーに google の identity を自動で結び付ける（supabase/auth の DetermineAccountLinking）。
// v1 の uid から identity を先に作ることはしない（利点が「Google 側のメールが後で変わった人」だけで、
// auth.identities の行を自分で組む複雑さに見合わない。2026-10-11 に決定）
// ---------------------------------------------------------------------------

export type AuthUserRow = {
  id: string
  email: string
  encrypted_password: string | null
  email_confirmed_at: string
  raw_app_meta_data: { provider: 'email'; providers: ['email'] }
  last_sign_in_at: string | null
  created_at: string
  updated_at: string
}

/** email の identity だけ（seed と同じ形）。Google は GoTrue の自動リンクに任せる（§7.1） */
export type AuthIdentityRow = {
  user_id: string
  provider: 'email'
  provider_id: string
  identity_data: { sub: string; email: string; email_verified: true }
  /** last_sign_in_at / created_at / updated_at に同じ値を入れる（v1 の created_at。§7.1） */
  created_at: string
}

/** 後続の変換と CSV・profiles の UPDATE が使う、移行するユーザーの情報 */
export type MigratedUser = {
  v1Id: number
  id: string
  email: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  /** 重複で Customer を失った（§7.1.1。Subscription があれば not-migrated の CSV へ） */
  customerLost: boolean
  maxStaffsCount: number
  trialEnd: string | null
  createdAt: string
  updatedAt: string
  /** `password_is_email` か `''` で null にした */
  passwordNull: boolean
}

export type UsersResult = {
  rows: AuthUserRow[]
  identities: AuthIdentityRow[]
  /** v1 id → 移行するユーザー（null = 移行しない） */
  users: Map<number, MigratedUser | null>
  dropped: Dropped[]
  fixed: Fixed[]
}

/**
 * 店舗を持たない人は、最後の利用がこれより前なら移さない（§7.1。決定 2026-10-20）。
 * 切り替えの日（2026-10-30）の 1 年前。v1 の規約 第 7 条（1 年以上利用のないアカウントは削除できる）に合わせる。
 * v1 の時刻は UTC なので UTC の 0 時。告知の宛先の SQL（030 §6.5）と同じ境目
 */
export const INACTIVE_CUTOFF = '2025-10-30T00:00:00Z'

/** 最後の利用。ログインしていない人（確認しただけ）は確認した日、それも無ければ登録した日 */
function lastUsedAt(user: V1User): string {
  return user.current_sign_in_at ?? user.confirmed_at ?? user.created_at
}

/**
 * 移さない理由（§7.1）。移すなら null。
 * v1 でログインできた人（決定 2026-10-10）のうち、店舗を持つ人と、最後の利用が 1 年以内の人（決定 2026-10-20）を移す
 */
export function userDropReason(
  user: V1User,
  ownsTenant: boolean,
  overrides: Overrides = {}
): 'not_migrated' | 'inactive' | null {
  if (overrides.forceMigrateUsers?.includes(user.id)) return null
  if (user.confirmed_at === null && user.sign_in_count === 0) return 'not_migrated'
  if (ownsTenant) return null
  return Date.parse(lastUsedAt(user)) >= Date.parse(INACTIVE_CUTOFF) ? null : 'inactive'
}

export function transformUsers(
  users: V1User[],
  ctx: { tenantOwners: ReadonlySet<number> },
  overrides: Overrides = {}
): UsersResult {
  const rec = new Recorder('users')
  const result = new Map<number, MigratedUser | null>()
  const rows: AuthUserRow[] = []
  const identities: AuthIdentityRow[] = []
  const seenEmails = new Map<string, number>()

  for (const user of users) {
    const dropReason = userDropReason(user, ctx.tenantOwners.has(user.id), overrides)
    if (dropReason !== null) {
      rec.drop(user.id, dropReason)
      result.set(user.id, null)
      continue
    }

    const email = user.email.toLowerCase().trim()
    const dup = seenEmails.get(email)
    if (dup !== undefined) {
      throw new MigrationError(`users: メールが重複しています（v1 id ${dup} と ${user.id}）`)
    }
    seenEmails.set(email, user.id)

    const id = v1Uuid('users', user.id)

    // パスワード: 代理承認の初期パスワードは null。空文字も null。Google の人も残す（§7.1。v1 は Google ログインが壊れていてパスワードで入っている）
    let encryptedPassword: string | null = user.encrypted_password
    if (user.password_is_email) {
      encryptedPassword = null
      rec.fix(user.id, 'encrypted_password', 'password_is_email')
    } else if (user.encrypted_password === '') {
      encryptedPassword = null
      rec.fix(user.id, 'encrypted_password', 'empty_password')
    }

    if (user.locked_at !== null) rec.fix(user.id, 'locked_at', 'unlocked')

    const stripeCustomerId = blankToNull(user.stripe_customer_id)
    const stripeSubscriptionId = blankToNull(user.stripe_subscription_id)
    if (user.stripe_customer_id !== null && stripeCustomerId === null) {
      rec.fix(user.id, 'stripe_customer_id', 'empty_stripe_id')
    }
    if (user.stripe_subscription_id !== null && stripeSubscriptionId === null) {
      rec.fix(user.id, 'stripe_subscription_id', 'empty_stripe_id')
    }

    rows.push({
      id,
      email,
      encrypted_password: encryptedPassword,
      email_confirmed_at: user.confirmed_at ?? user.invitation_accepted_at ?? user.created_at,
      raw_app_meta_data: { provider: 'email', providers: ['email'] },
      last_sign_in_at: user.current_sign_in_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
    })
    identities.push({
      user_id: id,
      provider: 'email',
      provider_id: id,
      identity_data: { sub: id, email, email_verified: true },
      created_at: user.created_at,
    })
    result.set(user.id, {
      v1Id: user.id,
      id,
      email,
      stripeCustomerId,
      stripeSubscriptionId,
      customerLost: false,
      maxStaffsCount: user.max_staffs_count,
      trialEnd: user.trial_end,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      passwordNull: encryptedPassword === null,
    })
  }

  resolveSharedCustomers(result, overrides, rec)

  return { rows, identities, users: result, dropped: rec.dropped, fixed: rec.fixed }
}

/** §7.1.1: 同じ Customer を複数人が持てば 1 人に残す（Subscription を持つ人 → 古い人 → overrides） */
function resolveSharedCustomers(
  users: Map<number, MigratedUser | null>,
  overrides: Overrides,
  rec: Recorder
) {
  const groups = new Map<string, MigratedUser[]>()
  for (const user of users.values()) {
    if (!user?.stripeCustomerId) continue
    const list = groups.get(user.stripeCustomerId)
    if (list) list.push(user)
    else groups.set(user.stripeCustomerId, [user])
  }

  for (const [customerId, group] of groups) {
    if (group.length < 2) continue
    const forced = overrides.customerOwner?.[customerId]
    let owner: MigratedUser | undefined
    if (forced !== undefined) {
      owner = group.find((u) => u.v1Id === forced)
      if (!owner) {
        throw new MigrationError(
          `overrides.customerOwner: ${customerId} の持ち主 ${forced} はその Customer を持つ移行対象のユーザーではありません`
        )
      }
    } else {
      const candidates = group.some((u) => u.stripeSubscriptionId !== null)
        ? group.filter((u) => u.stripeSubscriptionId !== null)
        : group
      owner = candidates.reduce((a, b) =>
        a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? a : b) : a.v1Id < b.v1Id ? a : b
      )
    }
    for (const user of group) {
      if (user === owner) continue
      user.stripeCustomerId = null
      user.customerLost = true
      rec.fix(user.v1Id, 'stripe_customer_id', 'stripe_customer_duplicate', {
        detail: `${customerId} → user ${owner.v1Id}`,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// §7.2 tenants
// ---------------------------------------------------------------------------

export type TenantRow = {
  id: string
  owner_id: string
  name: string
  shift_cycle: V1Tenant['shift_cycle']
  start_of_week: number
  setup_completed_at: string | null
  created_at: string
  updated_at: string
}

export type MigratedTenant = { v1Id: number; id: string; ownerV1Id: number; ownerId: string }

export type TenantsResult = {
  rows: TenantRow[]
  tenants: Map<number, MigratedTenant | null>
  dropped: Dropped[]
  fixed: Fixed[]
}

/** `SecureRandom.urlsafe_base64`（16 バイト）の 22 文字。`lib/tenants/legacyUrl.ts` の `LEGACY_TENANT_PATH` と同じ */
const LEGACY_TOKEN = /^[A-Za-z0-9_-]{22}$/

export function transformTenants(
  tenants: V1Tenant[],
  ctx: {
    users: ReadonlyMap<number, MigratedUser | null>
    /** v1 tenant id → スタッフの数（退職者を含む。`setup_completed_at` の判定。§7.2） */
    staffCountByTenant: ReadonlyMap<number, number>
  }
): TenantsResult {
  const rec = new Recorder('tenants')
  const rows: TenantRow[] = []
  const result = new Map<number, MigratedTenant | null>()

  for (const tenant of tenants) {
    const owner = parent(ctx.users, tenant.user_id)
    if (!owner.ok) {
      rec.drop(tenant.id, owner.reason)
      result.set(tenant.id, null)
      continue
    }
    const id = v1Uuid('tenants', tenant.uuid)
    // 旧 URL の 308（lib/tenants/legacyUrl.ts）は 22 文字のトークンだけを見る。それ以外の uuid は id は導出できるが旧 URL が効かない
    if (!LEGACY_TOKEN.test(tenant.uuid)) rec.fix(tenant.id, 'uuid', 'legacy_url_unmatched')
    const name = rec.text(tenant.id, 'name', tenant.name, TENANT_NAME_MAX_LENGTH, '店舗')

    let startOfWeek = tenant.start_of_week
    if (startOfWeek < 0 || startOfWeek > 6) {
      rec.fix(tenant.id, 'start_of_week', 'start_of_week', { detail: String(startOfWeek) })
      startOfWeek = 0
    }

    rows.push({
      id,
      owner_id: owner.parent.id,
      name,
      shift_cycle: tenant.shift_cycle,
      start_of_week: startOfWeek,
      setup_completed_at:
        (ctx.staffCountByTenant.get(tenant.id) ?? 0) > 0 ? tenant.created_at : null,
      created_at: tenant.created_at,
      updated_at: tenant.updated_at,
    })
    result.set(tenant.id, {
      v1Id: tenant.id,
      id,
      ownerV1Id: owner.parent.v1Id,
      ownerId: owner.parent.id,
    })
  }

  return { rows, tenants: result, dropped: rec.dropped, fixed: rec.fixed }
}

// ---------------------------------------------------------------------------
// §7.4 patterns
// ---------------------------------------------------------------------------

export type PatternRow = {
  id: string
  tenant_id: string
  name: string
  description: string | null
  color_hex: string
  kind: V1Pattern['kind']
  position: number
  default_required_nums: RequiredNumsByDay
  created_at: string
  updated_at: string
}

/** 全パターンを入れた後の UPDATE（複合 FK の参照先が要る。§7.4） */
export type PatternPairUpdate = { id: string; pair_pattern_id: string }

export type MigratedPattern = {
  v1Id: number
  id: string
  tenantV1Id: number
  tenantId: string
  kind: V1Pattern['kind']
  /** 数値化した後の基本の人数（§7.7 の判定に使う） */
  defaults: RequiredNumsByDay
}

export type PatternsResult = {
  rows: PatternRow[]
  pairs: PatternPairUpdate[]
  patterns: Map<number, MigratedPattern | null>
  dropped: Dropped[]
  fixed: Fixed[]
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/
const HEX6_BARE = /^[0-9A-Fa-f]{6}$/
const HEX3 = /^#?([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/

/** `color_hex` を CHECK（`^#[0-9A-Fa-f]{6}$`）に合わせる。`fixed` は直した・既定にしたとき */
export function normalizeColorHex(value: string | null): { value: string; fixed: boolean } {
  const v = value?.trim() ?? ''
  if (v === '') return { value: '#FFFFFF', fixed: false }
  if (HEX6.test(v)) return { value: v, fixed: false }
  if (HEX6_BARE.test(v)) return { value: `#${v}`, fixed: true }
  const short = HEX3.exec(v)
  if (short)
    return {
      value: `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`,
      fixed: true,
    }
  return { value: '#FFFFFF', fixed: true }
}

export function transformPatterns(
  patterns: V1Pattern[],
  ctx: { tenants: ReadonlyMap<number, MigratedTenant | null> }
): PatternsResult {
  const rec = new Recorder('patterns')
  const rows: PatternRow[] = []
  const result = new Map<number, MigratedPattern | null>()
  const kept: V1Pattern[] = []

  for (const pattern of patterns) {
    const tenant = parent(ctx.tenants, pattern.tenant_id)
    if (!tenant.ok) {
      rec.drop(pattern.id, tenant.reason)
      result.set(pattern.id, null)
      continue
    }
    kept.push(pattern)
    const id = v1Uuid('patterns', pattern.id)
    const name = rec.text(pattern.id, 'name', pattern.name, PATTERN_NAME_MAX_LENGTH, '勤務')
    const description = truncate(pattern.description ?? '', PATTERN_DESCRIPTION_MAX_LENGTH)
    if (description.truncated) {
      rec.fix(pattern.id, 'description', 'truncated', {
        before: description.before,
        after: description.after,
      })
    }
    const color = normalizeColorHex(pattern.color_hex)
    if (color.fixed)
      rec.fix(pattern.id, 'color_hex', 'color_hex', { detail: pattern.color_hex ?? '' })

    // dayoff は空（v2 は休みに変えたら空にする。015 §3.4）
    const defaults =
      pattern.kind === 'dayoff' ? {} : parseRequiredNums(pattern.default_required_nums)

    rows.push({
      id,
      tenant_id: tenant.parent.id,
      name,
      description: description.value === '' ? null : description.value,
      color_hex: color.value,
      kind: pattern.kind,
      position: 0,
      default_required_nums: defaults,
      created_at: pattern.created_at,
      updated_at: pattern.updated_at,
    })
    result.set(pattern.id, {
      v1Id: pattern.id,
      id,
      tenantV1Id: tenant.parent.v1Id,
      tenantId: tenant.parent.id,
      kind: pattern.kind,
      defaults,
    })
  }

  const positions = renumber(kept, (p) => String(p.tenant_id))
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const pattern of kept) {
    byId.get(v1Uuid('patterns', pattern.id))!.position = positions.get(pattern.id)!
  }

  // ペア: 自分自身・他店舗・存在しない（捨てた） → null にして記録
  const pairs: PatternPairUpdate[] = []
  for (const pattern of kept) {
    if (pattern.pair_pattern_id === null) continue
    const self = result.get(pattern.id)!
    const pair = result.get(pattern.pair_pattern_id)
    const reason =
      pattern.pair_pattern_id === pattern.id
        ? 'self'
        : !pair
          ? 'missing'
          : pair.tenantV1Id !== self.tenantV1Id
            ? 'other_tenant'
            : null
    if (reason) {
      rec.fix(pattern.id, 'pair_pattern_id', 'pair_pattern', { detail: reason })
      continue
    }
    pairs.push({ id: self.id, pair_pattern_id: pair!.id })
  }

  return { rows, pairs, patterns: result, dropped: rec.dropped, fixed: rec.fixed }
}

// ---------------------------------------------------------------------------
// §7.3 / §7.5 staffs → staffs / staff_patterns / staff_default_patterns
// ---------------------------------------------------------------------------

export type StaffRow = {
  id: string
  tenant_id: string
  name: string
  position: number
  retired_at: string | null
  available_wdays: number[]
  max_work_week: number
  created_at: string
  updated_at: string
}

export type StaffPatternRow = { tenant_id: string; staff_id: string; pattern_id: string }
export type StaffDefaultPatternRow = {
  tenant_id: string
  staff_id: string
  day_key: DayKey
  pattern_id: string
}

export type MigratedStaff = {
  v1Id: number
  id: string
  tenantV1Id: number
  tenantId: string
  ownerV1Id: number
  active: boolean
}

export type StaffsResult = {
  rows: StaffRow[]
  staffPatterns: StaffPatternRow[]
  staffDefaultPatterns: StaffDefaultPatternRow[]
  staffs: Map<number, MigratedStaff | null>
  dropped: Dropped[]
  fixed: Fixed[]
}

export function transformStaffs(
  staffs: V1Staff[],
  ctx: {
    tenants: ReadonlyMap<number, MigratedTenant | null>
    patterns: ReadonlyMap<number, MigratedPattern | null>
  }
): StaffsResult {
  const rec = new Recorder('staffs')
  const rows: StaffRow[] = []
  const staffPatterns: StaffPatternRow[] = []
  const staffDefaultPatterns: StaffDefaultPatternRow[] = []
  const result = new Map<number, MigratedStaff | null>()
  const kept: V1Staff[] = []

  for (const staff of staffs) {
    const tenant = parent(ctx.tenants, staff.tenant_id)
    if (!tenant.ok) {
      rec.drop(staff.id, tenant.reason)
      result.set(staff.id, null)
      continue
    }
    kept.push(staff)
    const id = v1Uuid('staffs', staff.id)
    const tenantId = tenant.parent.id
    const name = rec.text(staff.id, 'name', staff.name, STAFF_NAME_MAX_LENGTH, 'スタッフ')

    let maxWorkWeek = staff.max_work_week
    if (maxWorkWeek < 0 || maxWorkWeek > 7) {
      rec.fix(staff.id, 'max_work_week', 'max_work_week', { detail: String(maxWorkWeek) })
      maxWorkWeek = 5
    }

    const wdays = [...new Set(toInts(staff.available_wdays).filter((w) => w >= 0 && w <= 6))].sort(
      (a, b) => a - b
    )
    if (wdays.length !== staff.available_wdays.length) {
      rec.fix(staff.id, 'available_wdays', 'available_wdays', {
        detail: JSON.stringify(staff.available_wdays),
      })
    }

    // available_patterns → staff_patterns（同じ店舗に存在するパターンだけ。重複は除く）
    for (const patternV1Id of new Set(toInts(staff.available_patterns))) {
      const pattern = ctx.patterns.get(patternV1Id)
      if (!pattern || pattern.tenantV1Id !== tenant.parent.v1Id) {
        rec.fix(staff.id, 'available_patterns', 'available_pattern_dropped', {
          detail: String(patternV1Id),
        })
        continue
      }
      staffPatterns.push({ tenant_id: tenantId, staff_id: id, pattern_id: pattern.id })
    }

    // default_patterns → staff_default_patterns（キーは '0'..'6' / 'holiday' だけ。空・0・存在しない・他店舗は捨てる）
    for (const [key, raw] of Object.entries(staff.default_patterns)) {
      const patternV1Id = toInt(raw)
      if (!isDayKey(key)) {
        rec.fix(staff.id, 'default_patterns', 'default_pattern_dropped', { detail: `${key}` })
        continue
      }
      if (patternV1Id === null || patternV1Id === 0) continue // 未設定（v1 の画面の空欄は 0）
      const pattern = ctx.patterns.get(patternV1Id)
      if (!pattern || pattern.tenantV1Id !== tenant.parent.v1Id) {
        rec.fix(staff.id, 'default_patterns', 'default_pattern_dropped', {
          detail: `${key}=${patternV1Id}`,
        })
        continue
      }
      staffDefaultPatterns.push({
        tenant_id: tenantId,
        staff_id: id,
        day_key: key,
        pattern_id: pattern.id,
      })
    }

    rows.push({
      id,
      tenant_id: tenantId,
      name,
      position: 0,
      retired_at: staff.disabled ? staff.updated_at : null,
      available_wdays: wdays,
      max_work_week: maxWorkWeek,
      created_at: staff.created_at,
      updated_at: staff.updated_at,
    })
    result.set(staff.id, {
      v1Id: staff.id,
      id,
      tenantV1Id: tenant.parent.v1Id,
      tenantId,
      ownerV1Id: tenant.parent.ownerV1Id,
      active: !staff.disabled,
    })
  }

  const positions = renumber(kept, (s) => String(s.tenant_id))
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const staff of kept) {
    byId.get(v1Uuid('staffs', staff.id))!.position = positions.get(staff.id)!
  }

  return {
    rows,
    staffPatterns,
    staffDefaultPatterns,
    staffs: result,
    dropped: rec.dropped,
    fixed: rec.fixed,
  }
}

// ---------------------------------------------------------------------------
// §7.6 shifts
// ---------------------------------------------------------------------------

export type ShiftRow = {
  id: string
  tenant_id: string
  staff_id: string
  pattern_id: string
  date: string
  fixed: boolean
  created_at: string
  updated_at: string
}

export type ShiftsResult = { rows: ShiftRow[]; dropped: Dropped[]; fixed: Fixed[] }

export function transformShifts(
  shifts: V1Shift[],
  ctx: {
    staffs: ReadonlyMap<number, MigratedStaff | null>
    patterns: ReadonlyMap<number, MigratedPattern | null>
  }
): ShiftsResult {
  const rec = new Recorder('shifts')
  // (staff_id, date) → 残す候補
  const winners = new Map<string, V1Shift>()
  const resolved = new Map<number, { staff: MigratedStaff; pattern: MigratedPattern }>()

  for (const shift of shifts) {
    if (shift.staff_id === null) {
      rec.drop(shift.id, 'unassigned')
      continue
    }
    const staff = parent(ctx.staffs, shift.staff_id)
    if (!staff.ok) {
      rec.drop(shift.id, staff.reason, 'staff')
      continue
    }
    const pattern = parent(ctx.patterns, shift.pattern_id)
    if (!pattern.ok) {
      rec.drop(shift.id, pattern.reason, 'pattern')
      continue
    }
    if (staff.parent.tenantV1Id !== pattern.parent.tenantV1Id) {
      rec.drop(shift.id, 'tenant_mismatch')
      continue
    }
    if (!isDateString(shift.date)) {
      rec.drop(shift.id, 'invalid_date', shift.date)
      continue
    }
    resolved.set(shift.id, { staff: staff.parent, pattern: pattern.parent })

    const key = `${shift.staff_id}:${shift.date}`
    const current = winners.get(key)
    if (!current) {
      winners.set(key, shift)
      continue
    }
    const keep = newer(current, shift, (s) => s.updated_at)
    const lose = keep === current ? shift : current
    winners.set(key, keep)
    rec.drop(lose.id, 'duplicate', `kept ${keep.id}`)
  }

  const rows: ShiftRow[] = []
  for (const shift of shifts) {
    const key = `${shift.staff_id}:${shift.date}`
    if (winners.get(key) !== shift) continue
    const { staff, pattern } = resolved.get(shift.id)!
    rows.push({
      id: v1Uuid('shifts', shift.id),
      tenant_id: staff.tenantId,
      staff_id: staff.id,
      pattern_id: pattern.id,
      date: shift.date,
      fixed: shift.fixed,
      created_at: shift.created_at,
      updated_at: shift.updated_at,
    })
  }

  return { rows, dropped: rec.dropped, fixed: rec.fixed }
}

// ---------------------------------------------------------------------------
// §7.7 required_nums
// ---------------------------------------------------------------------------

export type RequiredNumRow = {
  id: string
  tenant_id: string
  pattern_id: string
  date: string
  num: number
}

export type RequiredNumsResult = { rows: RequiredNumRow[]; dropped: Dropped[]; fixed: Fixed[] }

const SMALLINT_MAX = 32767

export function transformRequiredNums(
  requiredNums: V1RequiredNum[],
  ctx: {
    patterns: ReadonlyMap<number, MigratedPattern | null>
    /** 祝日の判定（`lib/calendar/holidays.ts` は server-only なので呼び出し側が渡す） */
    isHoliday: (date: string) => boolean
  }
): RequiredNumsResult {
  const rec = new Recorder('required_nums')
  const rows: RequiredNumRow[] = []

  for (const row of requiredNums) {
    const pattern = parent(ctx.patterns, row.pattern_id)
    if (!pattern.ok) {
      rec.drop(row.id, pattern.reason)
      continue
    }
    if (pattern.parent.kind === 'dayoff') {
      rec.drop(row.id, 'dayoff_pattern')
      continue
    }
    if (row.date === null || !isDateString(row.date)) {
      rec.drop(row.id, 'invalid_date', row.date ?? 'null')
      continue
    }
    if (row.num < 0 || row.num > SMALLINT_MAX) {
      rec.drop(row.id, 'out_of_range', String(row.num))
      continue
    }
    const judged = judgeBakedRequiredNum(
      row.num,
      pattern.parent.defaults,
      row.date,
      ctx.isHoliday(row.date)
    )
    if (judged.baked) {
      rec.drop(row.id, 'baked', judged.unset ? 'unset' : undefined)
      continue
    }
    rows.push({
      id: v1Uuid('required_nums', row.id),
      tenant_id: pattern.parent.tenantId,
      pattern_id: pattern.parent.id,
      date: row.date,
      num: row.num,
    })
  }

  return { rows, dropped: rec.dropped, fixed: rec.fixed }
}

// ---------------------------------------------------------------------------
// §7.8 restrictions
// ---------------------------------------------------------------------------

export type RestrictionKindV1 =
  'deny_pattern_pair' | 'max_work_week' | 'max_work_consecutive' | 'sat_or_sun_dayoff'

const RESTRICTION_KINDS: readonly string[] = [
  'deny_pattern_pair',
  'max_work_week',
  'max_work_consecutive',
  'sat_or_sun_dayoff',
]

export type RestrictionRow = {
  id: string
  tenant_id: string
  kind: RestrictionKindV1
  days: number | null
  pattern1_id: string | null
  pattern2_id: string | null
  position: number
  created_at: string
  updated_at: string
}

export type RestrictionsResult = { rows: RestrictionRow[]; dropped: Dropped[]; fixed: Fixed[] }

export function transformRestrictions(
  restrictions: V1Restriction[],
  ctx: {
    tenants: ReadonlyMap<number, MigratedTenant | null>
    patterns: ReadonlyMap<number, MigratedPattern | null>
  }
): RestrictionsResult {
  const rec = new Recorder('restrictions')
  const rows: RestrictionRow[] = []
  const kept: V1Restriction[] = []

  for (const r of restrictions) {
    const tenant = parent(ctx.tenants, r.tenant_id)
    if (!tenant.ok) {
      rec.drop(r.id, tenant.reason)
      continue
    }
    if (!RESTRICTION_KINDS.includes(r.kind)) {
      rec.drop(r.id, 'unknown_kind', r.kind)
      continue
    }
    const kind = r.kind as RestrictionKindV1
    const tenantV1Id = tenant.parent.v1Id

    // 同じ店舗の移行するパターンだけ。他店舗・存在しない → null（= 無い）
    const patternOf = (id: number | null): string | null => {
      if (id === null) return null
      const p = ctx.patterns.get(id)
      return p && p.tenantV1Id === tenantV1Id ? p.id : null
    }
    const pattern1 = patternOf(r.pattern1_id)
    const pattern2 = patternOf(r.pattern2_id)
    const days = r.days !== null && r.days >= 1 && r.days <= 7 ? r.days : null

    // 種別が使う列が無ければ捨てる。使わない列は null（toRestrictionColumns と同じ）
    let columns: Pick<RestrictionRow, 'days' | 'pattern1_id' | 'pattern2_id'> | null = null
    switch (kind) {
      case 'deny_pattern_pair':
        if (pattern1 && pattern2)
          columns = { days: null, pattern1_id: pattern1, pattern2_id: pattern2 }
        break
      case 'max_work_week':
        if (pattern1 && days !== null) columns = { days, pattern1_id: pattern1, pattern2_id: null }
        break
      case 'max_work_consecutive':
        // pattern1 は任意（null = 勤務日全体）。ただし v1 で指していたパターンが壊れていれば捨てる（§7.8）
        if (days !== null && (r.pattern1_id === null || pattern1)) {
          columns = { days, pattern1_id: pattern1, pattern2_id: null }
        }
        break
      case 'sat_or_sun_dayoff':
        columns = { days: null, pattern1_id: null, pattern2_id: null }
        break
    }
    if (!columns) {
      const missing = [
        r.pattern1_id !== null && !pattern1 ? 'pattern1' : null,
        r.pattern1_id === null && kind !== 'max_work_consecutive' ? 'pattern1' : null,
        r.pattern2_id !== null && !pattern2 ? 'pattern2' : null,
        r.pattern2_id === null && kind === 'deny_pattern_pair' ? 'pattern2' : null,
        days === null && kind !== 'deny_pattern_pair' ? `days=${r.days}` : null,
      ].filter((v): v is string => v !== null)
      rec.drop(r.id, 'missing_column', missing.join(','))
      continue
    }

    kept.push(r)
    rows.push({
      id: v1Uuid('restrictions', r.id),
      tenant_id: tenant.parent.id,
      kind,
      ...columns,
      position: 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })
  }

  const positions = renumber(kept, (r) => String(r.tenant_id))
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const r of kept) {
    byId.get(v1Uuid('restrictions', r.id))!.position = positions.get(r.id)!
  }

  return { rows, dropped: rec.dropped, fixed: rec.fixed }
}

// ---------------------------------------------------------------------------
// §7.9 events → date_notes
// ---------------------------------------------------------------------------

export type DateNoteRow = {
  id: string
  tenant_id: string
  date: string
  note: string
  created_at: string
  updated_at: string
}

export type EventsResult = { rows: DateNoteRow[]; dropped: Dropped[]; fixed: Fixed[] }

export function transformEvents(
  events: V1Event[],
  ctx: { tenants: ReadonlyMap<number, MigratedTenant | null> }
): EventsResult {
  const rec = new Recorder('events')
  const winners = new Map<string, V1Event>()
  const notes = new Map<number, string>()

  for (const event of events) {
    const tenant = parent(ctx.tenants, event.tenant_id)
    if (!tenant.ok) {
      rec.drop(event.id, tenant.reason)
      continue
    }
    if (!isDateString(event.date)) {
      rec.drop(event.id, 'invalid_date', event.date)
      continue
    }
    const note = truncate(event.note ?? '', DATE_NOTE_MAX_LENGTH)
    if (note.value === '') {
      rec.drop(event.id, 'empty_note')
      continue
    }
    if (note.truncated)
      rec.fix(event.id, 'note', 'truncated', { before: note.before, after: note.after })
    notes.set(event.id, note.value)

    const key = `${event.tenant_id}:${event.date}`
    const current = winners.get(key)
    if (!current) {
      winners.set(key, event)
      continue
    }
    const keep = newer(current, event, (e) => e.updated_at)
    const lose = keep === current ? event : current
    winners.set(key, keep)
    rec.drop(lose.id, 'duplicate', `kept ${keep.id}`)
  }

  const rows: DateNoteRow[] = []
  for (const event of events) {
    if (winners.get(`${event.tenant_id}:${event.date}`) !== event) continue
    rows.push({
      id: v1Uuid('events', event.id),
      tenant_id: ctx.tenants.get(event.tenant_id!)!.id,
      date: event.date,
      note: notes.get(event.id)!,
      created_at: event.created_at,
      updated_at: event.updated_at,
    })
  }

  return { rows, dropped: rec.dropped, fixed: rec.fixed }
}

// ---------------------------------------------------------------------------
// §7.10 shares
// ---------------------------------------------------------------------------

export type ShareRow = {
  id: string
  tenant_id: string
  code: string
  start_date: string
  end_date: string
  created_at: string
}

export type SharesResult = { rows: ShareRow[]; dropped: Dropped[]; fixed: Fixed[] }

const SHARE_CODE = /^[A-Za-z0-9]{8}$/
/** CHECK は `end_date - start_date <= 31` */
const SHARE_MAX_SPAN = 31

export function transformShares(
  shares: V1Share[],
  ctx: { tenants: ReadonlyMap<number, MigratedTenant | null> }
): SharesResult {
  const rec = new Recorder('shares')
  const winners = new Map<string, V1Share>()

  for (const share of shares) {
    const tenant = parent(ctx.tenants, share.tenant_id)
    if (!tenant.ok) {
      rec.drop(share.id, tenant.reason)
      continue
    }
    if (!SHARE_CODE.test(share.code)) {
      rec.drop(share.id, 'invalid_code')
      continue
    }
    if (!isDateString(share.start_date) || !isDateString(share.end_date)) {
      rec.drop(share.id, 'invalid_date', `${share.start_date}..${share.end_date}`)
      continue
    }
    if (share.end_date < share.start_date) {
      rec.drop(share.id, 'invalid_range', `${share.start_date}..${share.end_date}`)
      continue
    }
    // code は v2 で一意（店舗をまたいで）。新しい 1 件を残す
    const current = winners.get(share.code)
    if (!current) {
      winners.set(share.code, share)
      continue
    }
    const keep = newer(current, share, (s) => s.created_at)
    const lose = keep === current ? share : current
    winners.set(share.code, keep)
    rec.drop(lose.id, 'duplicate', `kept ${keep.id}`)
  }

  const rows: ShareRow[] = []
  for (const share of shares) {
    if (winners.get(share.code) !== share) continue
    let endDate = share.end_date
    if (daysBetween(share.start_date, share.end_date) - 1 > SHARE_MAX_SPAN) {
      endDate = addDays(share.start_date, SHARE_MAX_SPAN)
      rec.fix(share.id, 'end_date', 'end_date_clipped', {
        detail: `${share.end_date} → ${endDate}`,
      })
    }
    rows.push({
      id: v1Uuid('shares', share.id),
      tenant_id: ctx.tenants.get(share.tenant_id!)!.id,
      code: share.code,
      start_date: share.start_date,
      end_date: endDate,
      created_at: share.created_at,
    })
  }

  return { rows, dropped: rec.dropped, fixed: rec.fixed }
}

// ---------------------------------------------------------------------------
// §7.1 profiles（UPDATE）/ §7.11 staff_count_history
// ---------------------------------------------------------------------------

export type ProfileUpdate = {
  id: string
  stripe_customer_id: string | null
  trial_end: string | null
  /** 個別契約（Subscription なしで 11 人以上） */
  max_staffs_count: number | null
  /** 有料プラン（Subscription ありで 11 人以上）: least(greatest(上限, 在籍), 1000)（019 §13.7） */
  staff_cap: number | null
  created_at: string
  updated_at: string
}

export type StaffCountHistoryRow = { user_id: string; active_count: number }

export type ProfilesResult = {
  profiles: ProfileUpdate[]
  history: StaffCountHistoryRow[]
  fixed: Fixed[]
}

/** 在籍数（`retired_at is null`）を利用者ごとに数える。SQL で数え直さない（§7.11。1 か所の数え方） */
export function activeStaffCountByUser(
  staffs: ReadonlyMap<number, MigratedStaff | null>
): Map<number, number> {
  const counts = new Map<number, number>()
  for (const staff of staffs.values()) {
    if (!staff?.active) continue
    counts.set(staff.ownerV1Id, (counts.get(staff.ownerV1Id) ?? 0) + 1)
  }
  return counts
}

export function buildProfiles(
  users: ReadonlyMap<number, MigratedUser | null>,
  activeCounts: ReadonlyMap<number, number>
): ProfilesResult {
  const rec = new Recorder('users')
  const profiles: ProfileUpdate[] = []
  const history: StaffCountHistoryRow[] = []

  for (const user of users.values()) {
    if (!user) continue
    const active = activeCounts.get(user.v1Id) ?? 0
    const paid = user.maxStaffsCount > FREE_STAFF_LIMIT
    let staffCap: number | null = null
    if (paid && user.stripeSubscriptionId !== null) {
      const wanted = Math.max(user.maxStaffsCount, active)
      staffCap = Math.min(wanted, STAFF_CAP_MAX)
      if (wanted > STAFF_CAP_MAX) {
        rec.fix(user.v1Id, 'staff_cap', 'staff_cap_clipped', {
          detail: `${wanted} → ${STAFF_CAP_MAX}`,
        })
      }
    }
    profiles.push({
      id: user.id,
      stripe_customer_id: user.stripeCustomerId,
      trial_end: user.trialEnd,
      max_staffs_count: paid && user.stripeSubscriptionId === null ? user.maxStaffsCount : null,
      staff_cap: staffCap,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    })
    history.push({ user_id: user.id, active_count: active })
  }

  return { profiles, history, fixed: rec.fixed }
}

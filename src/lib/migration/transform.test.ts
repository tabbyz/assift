import { describe, expect, it } from 'vitest'
import { v1Uuid } from './v1Ids'
import {
  activeStaffCountByUser,
  buildProfiles,
  MigrationError,
  normalizeColorHex,
  transformEvents,
  transformPatterns,
  transformRequiredNums,
  transformRestrictions,
  transformShares,
  transformShifts,
  transformStaffs,
  transformTenants,
  transformUsers,
  userDropReason,
  type MigratedPattern,
  type MigratedStaff,
  type MigratedTenant,
  type MigratedUser,
  type Overrides,
} from './transform'
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

const T0 = '2024-01-01T00:00:00.000000Z'
const T1 = '2024-06-01T00:00:00.000000Z'
const T2 = '2025-01-01T00:00:00.000000Z'

const user = (over: Partial<V1User> = {}): V1User => ({
  id: 1,
  email: 'a@example.com',
  encrypted_password: '$2a$11$abc',
  password_is_email: false,
  confirmed_at: T0,
  invitation_accepted_at: null,
  invitation_token: null,
  provider: null,
  uid: null,
  sign_in_count: 3,
  current_sign_in_at: T1,
  locked_at: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  trial_end: null,
  max_staffs_count: 10,
  created_at: T0,
  updated_at: T1,
  ...over,
})

const tenant = (over: Partial<V1Tenant> = {}): V1Tenant => ({
  id: 1,
  uuid: 'JuFZPcSXmXOaVvCmbb1JVw',
  user_id: 1,
  name: '店舗A',
  shift_cycle: 'month',
  start_of_week: 1,
  created_at: T0,
  updated_at: T1,
  ...over,
})

const pattern = (over: Partial<V1Pattern> = {}): V1Pattern => ({
  id: 1,
  tenant_id: 1,
  name: '早番',
  description: null,
  color_hex: '#FF5722',
  kind: 'workday',
  pair_pattern_id: null,
  position: 1,
  default_required_nums: {},
  created_at: T0,
  updated_at: T1,
  ...over,
})

const staff = (over: Partial<V1Staff> = {}): V1Staff => ({
  id: 1,
  tenant_id: 1,
  name: '山田',
  position: 1,
  disabled: false,
  max_work_week: 5,
  available_wdays: [0, 1, 2, 3, 4, 5, 6],
  available_patterns: [],
  default_patterns: {},
  created_at: T0,
  updated_at: T1,
  ...over,
})

const shift = (over: Partial<V1Shift> = {}): V1Shift => ({
  id: 1,
  date: '2026-10-05',
  pattern_id: 1,
  staff_id: 1,
  fixed: false,
  created_at: T0,
  updated_at: T1,
  ...over,
})

const requiredNum = (over: Partial<V1RequiredNum> = {}): V1RequiredNum => ({
  id: 1,
  date: '2026-10-05',
  pattern_id: 1,
  num: 2,
  ...over,
})

const restriction = (over: Partial<V1Restriction> = {}): V1Restriction => ({
  id: 1,
  tenant_id: 1,
  kind: 'sat_or_sun_dayoff',
  days: null,
  pattern1_id: null,
  pattern2_id: null,
  position: 1,
  created_at: T0,
  updated_at: T1,
  ...over,
})

const event = (over: Partial<V1Event> = {}): V1Event => ({
  id: 1,
  tenant_id: 1,
  date: '2026-10-05',
  note: '棚卸し',
  created_at: T0,
  updated_at: T1,
  ...over,
})

const share = (over: Partial<V1Share> = {}): V1Share => ({
  id: 1,
  tenant_id: 1,
  code: 'AbCd2345',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  created_at: T0,
  ...over,
})

// 親の変換結果（Map）を直接組む
const migratedUser = (v1Id: number, over: Partial<MigratedUser> = {}): MigratedUser => ({
  v1Id,
  id: v1Uuid('users', v1Id),
  email: `u${v1Id}@example.com`,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  customerLost: false,
  maxStaffsCount: 10,
  trialEnd: null,
  createdAt: T0,
  updatedAt: T1,
  passwordNull: false,
  ...over,
})

const migratedTenant = (v1Id: number, ownerV1Id = 1): MigratedTenant => ({
  v1Id,
  id: v1Uuid('tenants', `token${v1Id}`),
  ownerV1Id,
  ownerId: v1Uuid('users', ownerV1Id),
})

const migratedPattern = (
  v1Id: number,
  tenantV1Id = 1,
  over: Partial<MigratedPattern> = {}
): MigratedPattern => ({
  v1Id,
  id: v1Uuid('patterns', v1Id),
  tenantV1Id,
  tenantId: v1Uuid('tenants', `token${tenantV1Id}`),
  kind: 'workday',
  defaults: {},
  ...over,
})

const migratedStaff = (
  v1Id: number,
  tenantV1Id = 1,
  over: Partial<MigratedStaff> = {}
): MigratedStaff => ({
  v1Id,
  id: v1Uuid('staffs', v1Id),
  tenantV1Id,
  tenantId: v1Uuid('tenants', `token${tenantV1Id}`),
  ownerV1Id: 1,
  active: true,
  ...over,
})

const tenants = new Map<number, MigratedTenant | null>([
  [1, migratedTenant(1, 1)],
  [2, migratedTenant(2, 2)],
  [9, null], // 捨てた店舗
])

const reasons = (items: { reason: string }[]) => items.map((d) => d.reason)

// ---------------------------------------------------------------------------

describe('userDropReason（§7.1）', () => {
  it('確認済みか、ログイン実績がある人だけ', () => {
    expect(userDropReason(user(), true)).toBeNull()
    expect(userDropReason(user({ confirmed_at: null, sign_in_count: 1 }), true)).toBeNull()
    expect(userDropReason(user({ confirmed_at: null, sign_in_count: 0 }), true)).toBe(
      'not_migrated'
    )
  })

  it('店舗を持つ人は、最後の利用が古くても移す', () => {
    expect(
      userDropReason(user({ current_sign_in_at: '2019-01-01T00:00:00.000000Z' }), true)
    ).toBeNull()
  })

  it('店舗を持たない人は、最後の利用が 2025-10-30（UTC）より前なら移さない', () => {
    const at = (current_sign_in_at: string) => userDropReason(user({ current_sign_in_at }), false)
    expect(at('2025-10-29T23:59:59.999999Z')).toBe('inactive')
    expect(at('2025-10-30T00:00:00.000000Z')).toBeNull()
    expect(at('2026-10-01T00:00:00.000000Z')).toBeNull()
  })

  it('最後の利用は current_sign_in_at → confirmed_at → created_at', () => {
    const recent = '2026-01-01T00:00:00.000000Z'
    const old = '2024-01-01T00:00:00.000000Z'
    const reason = (over: Partial<V1User>) => userDropReason(user(over), false)
    expect(reason({ current_sign_in_at: old, confirmed_at: recent })).toBe('inactive')
    expect(reason({ current_sign_in_at: null, sign_in_count: 0, confirmed_at: recent })).toBeNull()
    expect(reason({ current_sign_in_at: null, sign_in_count: 0, confirmed_at: old })).toBe(
      'inactive'
    )
    expect(
      reason({ current_sign_in_at: null, sign_in_count: 1, confirmed_at: null, created_at: recent })
    ).toBeNull()
  })

  it('overrides.forceMigrateUsers で確認済みとして入れる', () => {
    const u = user({ id: 7, confirmed_at: null, sign_in_count: 0 })
    expect(userDropReason(u, false, { forceMigrateUsers: [7] })).toBeNull()
    const dormant = user({ id: 8 })
    expect(userDropReason(dormant, false, { forceMigrateUsers: [8] })).toBeNull()
  })
})

/** 店舗の有無で落ちないよう、全員を店舗の持ち主として変換する */
const transformOwners = (users: V1User[], overrides?: Overrides) =>
  transformUsers(users, { tenantOwners: new Set(users.map((u) => u.id)) }, overrides)

describe('transformUsers（§7.1）', () => {
  it('通常の人: email の identity・パスワードそのまま・確認済み', () => {
    const r = transformOwners([user()])
    expect(r.rows).toHaveLength(1)
    const row = r.rows[0]
    expect(row.id).toBe(v1Uuid('users', 1))
    expect(row.encrypted_password).toBe('$2a$11$abc')
    expect(row.email_confirmed_at).toBe(T0)
    expect(row.raw_app_meta_data).toEqual({ provider: 'email', providers: ['email'] })
    expect(row.last_sign_in_at).toBe(T1)
    expect(r.identities).toEqual([
      {
        user_id: row.id,
        provider: 'email',
        provider_id: row.id,
        identity_data: { sub: row.id, email: 'a@example.com', email_verified: true },
        created_at: T0,
      },
    ])
    expect(r.dropped).toEqual([])
    expect(r.fixed).toEqual([])
  })

  it('移行しない人は not_migrated で捨て、Map には null', () => {
    const r = transformOwners([user({ id: 2, confirmed_at: null, sign_in_count: 0 })])
    expect(r.rows).toEqual([])
    expect(r.dropped).toEqual([{ table: 'users', id: 2, reason: 'not_migrated' }])
    expect(r.users.get(2)).toBeNull()
  })

  it('店舗を持たず 1 年以上使っていない人は inactive で捨てる', () => {
    const r = transformUsers([user({ id: 1 }), user({ id: 2, email: 'b@example.com' })], {
      tenantOwners: new Set([1]),
    })
    expect(r.rows.map((row) => row.email)).toEqual(['a@example.com'])
    expect(r.dropped).toEqual([{ table: 'users', id: 2, reason: 'inactive' }])
    expect(r.users.get(2)).toBeNull()
  })

  it('email_confirmed_at は confirmed_at → invitation_accepted_at → created_at', () => {
    const r = transformOwners([
      user({ id: 1, confirmed_at: null, invitation_accepted_at: T1, sign_in_count: 1 }),
      user({ id: 2, email: 'b@example.com', confirmed_at: null, sign_in_count: 1 }),
    ])
    expect(r.rows[0].email_confirmed_at).toBe(T1)
    expect(r.rows[1].email_confirmed_at).toBe(T0)
  })

  it('メールは小文字 + trim。重複は止まる', () => {
    expect(transformOwners([user({ email: ' A@Example.com ' })]).rows[0].email).toBe(
      'a@example.com'
    )
    expect(() =>
      transformOwners([
        user({ id: 1, email: 'a@example.com' }),
        user({ id: 2, email: 'A@example.com' }),
      ])
    ).toThrow(MigrationError)
  })

  it('password_is_email は null（Google の人でも）', () => {
    const r = transformOwners([
      user({ password_is_email: true, provider: 'google_oauth2', uid: 'g-1' }),
    ])
    expect(r.rows[0].encrypted_password).toBeNull()
    expect(r.users.get(1)?.passwordNull).toBe(true)
    expect(reasons(r.fixed)).toEqual(['password_is_email'])
  })

  it("encrypted_password = '' は null にして記録", () => {
    const r = transformOwners([user({ encrypted_password: '' })])
    expect(r.rows[0].encrypted_password).toBeNull()
    expect(reasons(r.fixed)).toEqual(['empty_password'])
  })

  it('Google の人も email のアカウント（identity は email だけ・パスワードは残す）。Google は自動リンクに任せる', () => {
    const r = transformOwners([
      user({ id: 1, provider: 'google_oauth2', uid: '1234567890' }),
      user({ id: 2, email: 'b@example.com', provider: 'google_oauth2', uid: '' }),
    ])
    for (const row of r.rows) {
      expect(row.encrypted_password).toBe('$2a$11$abc')
      expect(row.raw_app_meta_data).toEqual({ provider: 'email', providers: ['email'] })
    }
    expect(r.identities.map((i) => i.provider)).toEqual(['email', 'email'])
    expect(r.fixed).toEqual([])
  })

  it('locked_at は無視して記録', () => {
    const r = transformOwners([user({ locked_at: T1 })])
    expect(reasons(r.fixed)).toEqual(['unlocked'])
  })

  it('stripe_* の空文字は null にして記録', () => {
    const r = transformOwners([user({ stripe_customer_id: '', stripe_subscription_id: ' ' })])
    const u = r.users.get(1)!
    expect(u.stripeCustomerId).toBeNull()
    expect(u.stripeSubscriptionId).toBeNull()
    expect(reasons(r.fixed)).toEqual(['empty_stripe_id', 'empty_stripe_id'])
  })

  describe('stripe_customer_id の重複（§7.1.1）', () => {
    it('Subscription を持つ人を優先する', () => {
      const r = transformOwners([
        user({ id: 1, email: 'a@example.com', stripe_customer_id: 'cus_1', created_at: T0 }),
        user({
          id: 2,
          email: 'b@example.com',
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: 'sub_1',
          created_at: T1,
        }),
      ])
      expect(r.users.get(1)?.stripeCustomerId).toBeNull()
      expect(r.users.get(1)?.customerLost).toBe(true)
      expect(r.users.get(2)?.stripeCustomerId).toBe('cus_1')
      expect(r.fixed).toEqual([
        {
          table: 'users',
          id: 1,
          column: 'stripe_customer_id',
          reason: 'stripe_customer_duplicate',
          detail: 'cus_1 → user 2',
        },
      ])
    })

    it('決まらなければ created_at が古い人', () => {
      const r = transformOwners([
        user({ id: 1, email: 'a@example.com', stripe_customer_id: 'cus_1', created_at: T1 }),
        user({ id: 2, email: 'b@example.com', stripe_customer_id: 'cus_1', created_at: T0 }),
      ])
      expect(r.users.get(1)?.stripeCustomerId).toBeNull()
      expect(r.users.get(2)?.stripeCustomerId).toBe('cus_1')
    })

    it('Subscription を失った側は customerLost で CSV の振り分けに使う', () => {
      const r = transformOwners([
        user({
          id: 1,
          email: 'a@example.com',
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: 'sub_old',
          created_at: T1,
        }),
        user({
          id: 2,
          email: 'b@example.com',
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: 'sub_new',
          created_at: T0,
        }),
      ])
      // 両方 Subscription あり → 古い 2 が持ち主
      expect(r.users.get(2)?.stripeCustomerId).toBe('cus_1')
      expect(r.users.get(1)?.customerLost).toBe(true)
      expect(r.users.get(1)?.stripeSubscriptionId).toBe('sub_old')
    })

    it('overrides.customerOwner で持ち主を指定する', () => {
      const rows = [
        user({ id: 1, email: 'a@example.com', stripe_customer_id: 'cus_1', created_at: T0 }),
        user({ id: 2, email: 'b@example.com', stripe_customer_id: 'cus_1', created_at: T1 }),
      ]
      const r = transformOwners(rows, { customerOwner: { cus_1: 2 } })
      expect(r.users.get(2)?.stripeCustomerId).toBe('cus_1')
      expect(r.users.get(1)?.stripeCustomerId).toBeNull()
      // その Customer を持たない人を指定したら止まる
      expect(() => transformOwners(rows, { customerOwner: { cus_1: 3 } })).toThrow(MigrationError)
    })
  })
})

describe('transformTenants（§7.2）', () => {
  const users = new Map<number, MigratedUser | null>([
    [1, migratedUser(1)],
    [2, null],
  ])
  const staffCounts = new Map([[1, 2]])

  it('id はトークンから導出、owner は移行後の id、スタッフがいれば初期設定は完了', () => {
    const r = transformTenants([tenant()], { users, staffCountByTenant: staffCounts })
    expect(r.rows).toEqual([
      {
        id: v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw'),
        owner_id: v1Uuid('users', 1),
        name: '店舗A',
        shift_cycle: 'month',
        start_of_week: 1,
        setup_completed_at: T0,
        created_at: T0,
        updated_at: T1,
      },
    ])
    expect(r.tenants.get(1)).toEqual({
      v1Id: 1,
      id: v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw'),
      ownerV1Id: 1,
      ownerId: v1Uuid('users', 1),
    })
  })

  it('スタッフ 0 人（退職者も無し）なら準備中（setup_completed_at = null）', () => {
    const r = transformTenants([tenant({ id: 5 })], { users, staffCountByTenant: new Map() })
    expect(r.rows[0].setup_completed_at).toBeNull()
  })

  it('持ち主が移行されない → parent_dropped、user_id が null / 無い → parent_missing', () => {
    const r = transformTenants(
      [
        tenant({ id: 1, user_id: 2 }),
        tenant({ id: 2, user_id: null }),
        tenant({ id: 3, user_id: 99 }),
      ],
      { users, staffCountByTenant: staffCounts }
    )
    expect(r.rows).toEqual([])
    expect(r.dropped).toEqual([
      { table: 'tenants', id: 1, reason: 'parent_dropped' },
      { table: 'tenants', id: 2, reason: 'parent_missing' },
      { table: 'tenants', id: 3, reason: 'parent_missing' },
    ])
    expect(r.tenants.get(1)).toBeNull()
  })

  it('名前は trim → 20 文字。空なら 店舗', () => {
    const long = 'あ'.repeat(25)
    const r = transformTenants(
      [
        tenant({ id: 1, name: ` ${long} ` }),
        tenant({ id: 2, name: '  ' }),
        tenant({ id: 3, name: null }),
      ],
      {
        users,
        staffCountByTenant: staffCounts,
      }
    )
    expect(r.rows[0].name).toBe('あ'.repeat(20))
    expect(r.rows[1].name).toBe('店舗')
    expect(r.rows[2].name).toBe('店舗')
    expect(r.fixed).toEqual([
      { table: 'tenants', id: 1, column: 'name', reason: 'truncated', before: 25, after: 20 },
      { table: 'tenants', id: 2, column: 'name', reason: 'empty_name' },
      { table: 'tenants', id: 3, column: 'name', reason: 'empty_name' },
    ])
  })

  it('22 文字のトークンでない uuid は旧 URL が効かないので記録する', () => {
    const r = transformTenants([tenant({ uuid: 'short' })], {
      users,
      staffCountByTenant: staffCounts,
    })
    expect(r.rows[0].id).toBe(v1Uuid('tenants', 'short'))
    expect(reasons(r.fixed)).toEqual(['legacy_url_unmatched'])
  })

  it('start_of_week が 0..6 の外なら 0 にして記録', () => {
    const r = transformTenants([tenant({ start_of_week: 7 })], {
      users,
      staffCountByTenant: staffCounts,
    })
    expect(r.rows[0].start_of_week).toBe(0)
    expect(reasons(r.fixed)).toEqual(['start_of_week'])
  })
})

describe('normalizeColorHex（§7.4）', () => {
  it.each([
    [null, '#FFFFFF', false],
    ['', '#FFFFFF', false],
    ['#FF5722', '#FF5722', false],
    ['#ff5722', '#ff5722', false],
    ['FF5722', '#FF5722', true],
    ['#F52', '#FF5522', true],
    ['F52', '#FF5522', true],
    ['red', '#FFFFFF', true],
    ['#GGGGGG', '#FFFFFF', true],
  ])('%s → %s', (input, value, fixed) => {
    expect(normalizeColorHex(input)).toEqual({ value, fixed })
  })
})

describe('transformPatterns（§7.4）', () => {
  it('名前 6 文字・説明 10 文字・空の説明は null・色・順序', () => {
    const r = transformPatterns(
      [
        pattern({ id: 1, name: '早番', description: ' ', position: 2 }),
        pattern({
          id: 2,
          name: '1234567',
          description: '12345678901',
          position: 1,
          color_hex: 'abc',
        }),
        pattern({ id: 3, name: '', position: null }),
      ],
      { tenants }
    )
    const byV1 = (id: number) => r.rows.find((row) => row.id === v1Uuid('patterns', id))!
    expect(byV1(1).description).toBeNull()
    expect(byV1(2).name).toBe('123456')
    expect(byV1(2).description).toBe('1234567890')
    expect(byV1(2).color_hex).toBe('#aabbcc')
    expect(byV1(3).name).toBe('勤務')
    // position は (position, id) の順に 0 から。null は末尾
    expect(byV1(2).position).toBe(0)
    expect(byV1(1).position).toBe(1)
    expect(byV1(3).position).toBe(2)
    expect(r.fixed).toEqual([
      { table: 'patterns', id: 2, column: 'name', reason: 'truncated', before: 7, after: 6 },
      {
        table: 'patterns',
        id: 2,
        column: 'description',
        reason: 'truncated',
        before: 11,
        after: 10,
      },
      { table: 'patterns', id: 2, column: 'color_hex', reason: 'color_hex', detail: 'abc' },
      { table: 'patterns', id: 3, column: 'name', reason: 'empty_name' },
    ])
  })

  it('position は店舗ごとに振る', () => {
    const r = transformPatterns(
      [
        pattern({ id: 1, tenant_id: 1, position: 5 }),
        pattern({ id: 2, tenant_id: 2, position: 9 }),
      ],
      { tenants }
    )
    expect(r.rows.map((row) => row.position)).toEqual([0, 0])
  })

  it('親の店舗が無い・捨てた → 捨てる', () => {
    const r = transformPatterns(
      [
        pattern({ id: 1, tenant_id: null }),
        pattern({ id: 2, tenant_id: 9 }),
        pattern({ id: 3, tenant_id: 77 }),
      ],
      { tenants }
    )
    expect(reasons(r.dropped)).toEqual(['parent_missing', 'parent_dropped', 'parent_missing'])
    expect(r.patterns.get(2)).toBeNull()
  })

  it('default_required_nums は数値化し、dayoff は空', () => {
    const r = transformPatterns(
      [
        pattern({ id: 1, default_required_nums: { '0': '2', '1': 3, '9': 1, holiday: '', x: 5 } }),
        pattern({ id: 2, kind: 'dayoff', default_required_nums: { '0': 2 } }),
      ],
      { tenants }
    )
    expect(r.rows[0].default_required_nums).toEqual({ '0': 2, '1': 3 })
    expect(r.rows[1].default_required_nums).toEqual({})
    expect(r.patterns.get(1)?.defaults).toEqual({ '0': 2, '1': 3 })
  })

  it('ペアは後から UPDATE。自分自身・他店舗・存在しない・捨てた → null にして記録', () => {
    const r = transformPatterns(
      [
        pattern({ id: 1, tenant_id: 1, pair_pattern_id: 2 }),
        pattern({ id: 2, tenant_id: 1, pair_pattern_id: 2 }), // 自分自身
        pattern({ id: 3, tenant_id: 1, pair_pattern_id: 4 }), // 他店舗
        pattern({ id: 4, tenant_id: 2, pair_pattern_id: 99 }), // 存在しない
        pattern({ id: 5, tenant_id: 1, pair_pattern_id: 6 }), // 捨てたパターン
        pattern({ id: 6, tenant_id: 9 }),
      ],
      { tenants }
    )
    expect(r.pairs).toEqual([{ id: v1Uuid('patterns', 1), pair_pattern_id: v1Uuid('patterns', 2) }])
    expect(r.fixed.filter((f) => f.reason === 'pair_pattern').map((f) => [f.id, f.detail])).toEqual(
      [
        [2, 'self'],
        [3, 'other_tenant'],
        [4, 'missing'],
        [5, 'missing'],
      ]
    )
  })
})

describe('transformStaffs（§7.3 / §7.5）', () => {
  const patterns = new Map<number, MigratedPattern | null>([
    [1, migratedPattern(1, 1)],
    [2, migratedPattern(2, 1)],
    [3, migratedPattern(3, 2)], // 他店舗
    [4, null], // 捨てた
  ])

  it('基本の列: 名前 10 文字・退職は updated_at・曜日・順序', () => {
    const r = transformStaffs(
      [
        staff({ id: 1, name: ' 12345678901 ', position: 2 }),
        staff({ id: 2, name: '', disabled: true, position: 1 }),
      ],
      { tenants, patterns }
    )
    const byV1 = (id: number) => r.rows.find((row) => row.id === v1Uuid('staffs', id))!
    expect(byV1(1).name).toBe('1234567890')
    expect(byV1(1).retired_at).toBeNull()
    expect(byV1(1).available_wdays).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(byV1(1).position).toBe(1)
    expect(byV1(2).name).toBe('スタッフ')
    expect(byV1(2).retired_at).toBe(T1)
    expect(byV1(2).position).toBe(0)
    expect(r.staffs.get(2)).toEqual({
      v1Id: 2,
      id: v1Uuid('staffs', 2),
      tenantV1Id: 1,
      tenantId: tenants.get(1)!.id,
      ownerV1Id: 1,
      active: false,
    })
  })

  it('親の店舗が無い・捨てた → 捨てる', () => {
    const r = transformStaffs([staff({ id: 1, tenant_id: null }), staff({ id: 2, tenant_id: 9 })], {
      tenants,
      patterns,
    })
    expect(reasons(r.dropped)).toEqual(['parent_missing', 'parent_dropped'])
  })

  it('max_work_week が 0..7 の外なら 5 にして記録', () => {
    const r = transformStaffs([staff({ max_work_week: 8 })], { tenants, patterns })
    expect(r.rows[0].max_work_week).toBe(5)
    expect(reasons(r.fixed)).toEqual(['max_work_week'])
  })

  it('available_wdays は整数に寄せ、0..6 だけ残し、重複を除いて昇順', () => {
    const r = transformStaffs([staff({ available_wdays: ['6', 1, 1, 7, -1, 'x', 0] })], {
      tenants,
      patterns,
    })
    expect(r.rows[0].available_wdays).toEqual([0, 1, 6])
    expect(reasons(r.fixed)).toEqual(['available_wdays'])
    // 変化が無ければ記録しない
    expect(
      transformStaffs([staff({ available_wdays: [1, 2] })], { tenants, patterns }).fixed
    ).toEqual([])
  })

  it('available_patterns → staff_patterns（同じ店舗だけ・重複を除く）', () => {
    const r = transformStaffs([staff({ available_patterns: ['1', 1, 2, 3, 4, 99] })], {
      tenants,
      patterns,
    })
    expect(r.staffPatterns).toEqual([
      {
        tenant_id: tenants.get(1)!.id,
        staff_id: v1Uuid('staffs', 1),
        pattern_id: v1Uuid('patterns', 1),
      },
      {
        tenant_id: tenants.get(1)!.id,
        staff_id: v1Uuid('staffs', 1),
        pattern_id: v1Uuid('patterns', 2),
      },
    ])
    expect(r.fixed.map((f) => [f.reason, f.detail])).toEqual([
      ['available_pattern_dropped', '3'],
      ['available_pattern_dropped', '4'],
      ['available_pattern_dropped', '99'],
    ])
  })

  it('default_patterns → staff_default_patterns（キーは曜日と holiday だけ。空・0・他店舗・存在しないは捨てる）', () => {
    const r = transformStaffs(
      [
        staff({
          default_patterns: {
            '0': '1',
            '1': 2,
            '2': 0,
            '3': '',
            '4': null,
            '5': 3,
            '6': 99,
            holiday: 1,
            '7': 1,
            x: 1,
          },
        }),
      ],
      { tenants, patterns }
    )
    expect(r.staffDefaultPatterns.map((d) => [d.day_key, d.pattern_id])).toEqual([
      ['0', v1Uuid('patterns', 1)],
      ['1', v1Uuid('patterns', 2)],
      ['holiday', v1Uuid('patterns', 1)],
    ])
    expect(r.fixed.map((f) => f.detail)).toEqual(['5=3', '6=99', '7', 'x'])
  })
})

describe('transformShifts（§7.6）', () => {
  const staffs = new Map<number, MigratedStaff | null>([
    [1, migratedStaff(1, 1)],
    [2, migratedStaff(2, 2)],
    [3, null],
  ])
  const patterns = new Map<number, MigratedPattern | null>([
    [1, migratedPattern(1, 1)],
    [2, migratedPattern(2, 2)],
    [4, null],
  ])

  it('基本の列（tenant_id はスタッフの店舗）', () => {
    const r = transformShifts([shift({ fixed: true })], { staffs, patterns })
    expect(r.rows).toEqual([
      {
        id: v1Uuid('shifts', 1),
        tenant_id: tenants.get(1)!.id,
        staff_id: v1Uuid('staffs', 1),
        pattern_id: v1Uuid('patterns', 1),
        date: '2026-10-05',
        fixed: true,
        created_at: T0,
        updated_at: T1,
      },
    ])
  })

  it('staff_id が null（一時 Task）・無い・捨てた、pattern が null・無い・捨てた、店舗の不一致 → 捨てる', () => {
    const r = transformShifts(
      [
        shift({ id: 1, staff_id: null }),
        shift({ id: 2, staff_id: 99 }),
        shift({ id: 8, staff_id: 0 }), // v1 の assign は params[:staff_id].to_i をそのまま保存する
        shift({ id: 3, staff_id: 3 }),
        shift({ id: 4, pattern_id: null }),
        shift({ id: 5, pattern_id: 99 }),
        shift({ id: 6, pattern_id: 4 }),
        shift({ id: 7, staff_id: 1, pattern_id: 2 }),
        shift({ id: 9, date: '20223-03-11' }), // v1 の date 列は西暦 5 桁も受ける（リハーサルで実在）
        shift({ id: 10, date: '2026-02-30' }),
      ],
      { staffs, patterns }
    )
    expect(r.rows).toEqual([])
    expect(r.dropped.map((d) => [d.id, d.reason, d.detail])).toEqual([
      [1, 'unassigned', undefined],
      [2, 'parent_missing', 'staff'],
      [8, 'parent_missing', 'staff'],
      [3, 'parent_dropped', 'staff'],
      [4, 'parent_missing', 'pattern'],
      [5, 'parent_missing', 'pattern'],
      [6, 'parent_dropped', 'pattern'],
      [7, 'tenant_mismatch', undefined],
      [9, 'invalid_date', '20223-03-11'],
      [10, 'invalid_date', '2026-02-30'],
    ])
  })

  it('(staff_id, date) の重複は updated_at が最新の 1 件（同時刻なら id が大きいほう）', () => {
    const r = transformShifts(
      [
        shift({ id: 1, updated_at: T2 }),
        shift({ id: 2, updated_at: T1 }),
        shift({ id: 3, updated_at: T2 }),
        shift({ id: 4, date: '2026-10-06' }),
      ],
      { staffs, patterns }
    )
    expect(r.rows.map((row) => row.id)).toEqual([v1Uuid('shifts', 3), v1Uuid('shifts', 4)])
    expect(r.dropped.map((d) => [d.id, d.reason, d.detail])).toEqual([
      [2, 'duplicate', 'kept 1'],
      [1, 'duplicate', 'kept 3'],
    ])
  })
})

describe('transformRequiredNums（§7.7）', () => {
  const patterns = new Map<number, MigratedPattern | null>([
    [1, migratedPattern(1, 1, { defaults: { '1': 2, holiday: 3 } })],
    [2, migratedPattern(2, 1, { kind: 'dayoff' })],
    [3, null],
  ])
  const isHoliday = (date: string) => date === '2026-10-12'

  it('基本と違う値は上書きとして入れる（tenant_id はパターンの店舗）', () => {
    // 2026-10-05 は月曜。基本 2 に対して 3
    const r = transformRequiredNums([requiredNum({ num: 3 })], { patterns, isHoliday })
    expect(r.rows).toEqual([
      {
        id: v1Uuid('required_nums', 1),
        tenant_id: tenants.get(1)!.id,
        pattern_id: v1Uuid('patterns', 1),
        date: '2026-10-05',
        num: 3,
      },
    ])
  })

  it('焼き付けられた行は捨てる（曜日・祝日・未設定の 0）', () => {
    const r = transformRequiredNums(
      [
        requiredNum({ id: 1, date: '2026-10-05', num: 2 }), // 月曜の基本
        requiredNum({ id: 2, date: '2026-10-12', num: 3 }), // 祝日（月曜）の holiday
        requiredNum({ id: 3, date: '2026-10-12', num: 2 }), // 祝日に曜日の値 → 上書きとして残る
        requiredNum({ id: 4, date: '2026-10-06', num: 0 }), // 火曜は未設定 → 0 は焼き付け
        requiredNum({ id: 5, date: '2026-10-06', num: 1 }),
      ],
      { patterns, isHoliday }
    )
    expect(r.rows.map((row) => row.id)).toEqual([
      v1Uuid('required_nums', 3),
      v1Uuid('required_nums', 5),
    ])
    expect(r.dropped.map((d) => [d.id, d.reason, d.detail])).toEqual([
      [1, 'baked', undefined],
      [2, 'baked', undefined],
      [4, 'baked', 'unset'],
    ])
  })

  it('親が無い・捨てた・dayoff・日付が壊れている・範囲外 → 捨てる', () => {
    const r = transformRequiredNums(
      [
        requiredNum({ id: 1, pattern_id: null }),
        requiredNum({ id: 2, pattern_id: 3 }),
        requiredNum({ id: 3, pattern_id: 2 }),
        requiredNum({ id: 4, date: null, num: 5 }),
        requiredNum({ id: 5, date: '2026-02-30', num: 5 }),
        requiredNum({ id: 6, num: -1 }),
        requiredNum({ id: 7, num: 32768 }),
        requiredNum({ id: 8, num: 32767 }), // 入る（画面の上限は超えるが DB には入る）
      ],
      { patterns, isHoliday }
    )
    expect(r.rows.map((row) => row.num)).toEqual([32767])
    expect(reasons(r.dropped)).toEqual([
      'parent_missing',
      'parent_dropped',
      'dayoff_pattern',
      'invalid_date',
      'invalid_date',
      'out_of_range',
      'out_of_range',
    ])
  })
})

describe('transformRestrictions（§7.8）', () => {
  const patterns = new Map<number, MigratedPattern | null>([
    [1, migratedPattern(1, 1)],
    [2, migratedPattern(2, 1)],
    [3, migratedPattern(3, 2)], // 他店舗
    [4, null],
  ])
  const p = (id: number) => v1Uuid('patterns', id)

  it('4 種を enum へ。使わない列は null、追加の列は呼び出し側（staff_id null / hard true / wdays null）', () => {
    const r = transformRestrictions(
      [
        restriction({
          id: 1,
          kind: 'deny_pattern_pair',
          pattern1_id: 1,
          pattern2_id: 2,
          days: 3,
          position: 4,
        }),
        restriction({
          id: 2,
          kind: 'max_work_week',
          pattern1_id: 1,
          pattern2_id: 2,
          days: 3,
          position: 3,
        }),
        restriction({
          id: 3,
          kind: 'max_work_consecutive',
          pattern1_id: null,
          days: 5,
          position: 2,
        }),
        restriction({ id: 4, kind: 'max_work_consecutive', pattern1_id: 2, days: 5, position: 1 }),
        restriction({ id: 5, kind: 'sat_or_sun_dayoff', pattern1_id: 1, days: 2, position: null }),
      ],
      { tenants, patterns }
    )
    expect(
      r.rows.map((row) => [row.kind, row.days, row.pattern1_id, row.pattern2_id, row.position])
    ).toEqual([
      ['deny_pattern_pair', null, p(1), p(2), 3],
      ['max_work_week', 3, p(1), null, 2],
      ['max_work_consecutive', 5, null, null, 1],
      ['max_work_consecutive', 5, p(2), null, 0],
      ['sat_or_sun_dayoff', null, null, null, 4],
    ])
    expect(r.dropped).toEqual([])
  })

  it('種別が使う列が無い・壊れている → 捨てて記録', () => {
    const r = transformRestrictions(
      [
        restriction({ id: 1, kind: 'deny_pattern_pair', pattern1_id: 1, pattern2_id: null }),
        restriction({ id: 2, kind: 'deny_pattern_pair', pattern1_id: 1, pattern2_id: 3 }), // 他店舗
        restriction({ id: 3, kind: 'max_work_week', pattern1_id: 4, days: 3 }), // 捨てたパターン
        restriction({ id: 4, kind: 'max_work_week', pattern1_id: 1, days: null }),
        restriction({ id: 5, kind: 'max_work_week', pattern1_id: 1, days: 8 }), // 1..7 の外
        restriction({ id: 6, kind: 'max_work_consecutive', pattern1_id: 99, days: 3 }), // 壊れた参照は捨てる（null にしない）
        restriction({ id: 7, kind: 'max_work_consecutive', pattern1_id: null, days: 0 }),
        restriction({ id: 8, kind: 'max_work_month', days: 10 }),
        restriction({ id: 9, tenant_id: 9 }),
      ],
      { tenants, patterns }
    )
    expect(r.rows).toEqual([])
    expect(r.dropped.map((d) => [d.id, d.reason, d.detail])).toEqual([
      [1, 'missing_column', 'pattern2'],
      [2, 'missing_column', 'pattern2'],
      [3, 'missing_column', 'pattern1'],
      [4, 'missing_column', 'days=null'],
      [5, 'missing_column', 'days=8'],
      [6, 'missing_column', 'pattern1'],
      [7, 'missing_column', 'days=0'],
      [8, 'unknown_kind', 'max_work_month'],
      [9, 'parent_dropped', undefined],
    ])
  })
})

describe('transformEvents（§7.9）', () => {
  it('note は trim → 12 文字。空は捨てる', () => {
    const r = transformEvents(
      [
        event({ id: 1, note: ' 1234567890123 ' }),
        event({ id: 2, note: '  ', date: '2026-10-06' }),
        event({ id: 3, note: null, date: '2026-10-07' }),
      ],
      { tenants }
    )
    expect(r.rows).toEqual([
      {
        id: v1Uuid('events', 1),
        tenant_id: tenants.get(1)!.id,
        date: '2026-10-05',
        note: '123456789012',
        created_at: T0,
        updated_at: T1,
      },
    ])
    expect(r.fixed).toEqual([
      { table: 'events', id: 1, column: 'note', reason: 'truncated', before: 13, after: 12 },
    ])
    expect(reasons(r.dropped)).toEqual(['empty_note', 'empty_note'])
  })

  it('(tenant_id, date) の重複は updated_at が最新の 1 件', () => {
    const r = transformEvents(
      [
        event({ id: 1, updated_at: T1 }),
        event({ id: 2, updated_at: T2 }),
        event({ id: 3, tenant_id: 2, updated_at: T0 }),
      ],
      { tenants }
    )
    expect(r.rows.map((row) => row.id)).toEqual([v1Uuid('events', 2), v1Uuid('events', 3)])
    expect(r.dropped).toEqual([{ table: 'events', id: 1, reason: 'duplicate', detail: 'kept 2' }])
  })

  it('親が無い・捨てた・日付が壊れている → 捨てる', () => {
    const r = transformEvents(
      [
        event({ tenant_id: null }),
        event({ id: 2, tenant_id: 9 }),
        event({ id: 3, date: '20223-03-11' }),
      ],
      { tenants }
    )
    expect(reasons(r.dropped)).toEqual(['parent_missing', 'parent_dropped', 'invalid_date'])
  })
})

describe('transformShares（§7.10）', () => {
  it('基本の列（期限切れも入れる）', () => {
    const r = transformShares([share()], { tenants })
    expect(r.rows).toEqual([
      {
        id: v1Uuid('shares', 1),
        tenant_id: tenants.get(1)!.id,
        code: 'AbCd2345',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        created_at: T0,
      },
    ])
  })

  it('code が 8 文字の英数字でない・end < start・日付が壊れている → 捨てる', () => {
    const r = transformShares(
      [
        share({ id: 1, code: 'abc' }),
        share({ id: 2, code: 'AbCd-345' }),
        share({ id: 3, start_date: '2026-10-05', end_date: '2026-10-04' }),
        share({ id: 4, code: 'AbCd2346', end_date: '20223-03-11' }),
        share({ id: 5, code: 'AbCd2347', start_date: '2026-02-30' }),
      ],
      { tenants }
    )
    expect(r.rows).toEqual([])
    expect(reasons(r.dropped)).toEqual([
      'invalid_code',
      'invalid_code',
      'invalid_range',
      'invalid_date',
      'invalid_date',
    ])
  })

  it('code の重複は created_at が新しい 1 件（店舗をまたいでも）', () => {
    const r = transformShares(
      [
        share({ id: 1, created_at: T0 }),
        share({ id: 2, tenant_id: 2, created_at: T1 }),
        share({ id: 3, created_at: T1 }),
      ],
      { tenants }
    )
    expect(r.rows.map((row) => row.id)).toEqual([v1Uuid('shares', 3)])
    expect(r.dropped.map((d) => [d.id, d.detail])).toEqual([
      [1, 'kept 2'],
      [2, 'kept 3'],
    ])
  })

  it('31 日を超える期間は start + 31 に切って記録', () => {
    const r = transformShares([share({ start_date: '2026-10-01', end_date: '2026-11-30' })], {
      tenants,
    })
    expect(r.rows[0].end_date).toBe('2026-11-01')
    expect(r.fixed).toEqual([
      {
        table: 'shares',
        id: 1,
        column: 'end_date',
        reason: 'end_date_clipped',
        detail: '2026-11-30 → 2026-11-01',
      },
    ])
    // ちょうど 31 日はそのまま
    expect(
      transformShares([share({ start_date: '2026-10-01', end_date: '2026-11-01' })], { tenants })
        .fixed
    ).toEqual([])
  })
})

describe('buildProfiles（§7.1 / §7.11）', () => {
  it('在籍数は TS で数える（退職者を除く。店舗をまたいで利用者ごと）', () => {
    const staffs = new Map<number, MigratedStaff | null>([
      [1, migratedStaff(1, 1, { ownerV1Id: 1 })],
      [2, migratedStaff(2, 1, { ownerV1Id: 1, active: false })],
      [3, migratedStaff(3, 2, { ownerV1Id: 1 })],
      [4, migratedStaff(4, 3, { ownerV1Id: 2 })],
      [5, null],
    ])
    expect(activeStaffCountByUser(staffs)).toEqual(
      new Map([
        [1, 2],
        [2, 1],
      ])
    )
  })

  it('個別契約（Subscription なしで 11 人以上）は max_staffs_count、有料プランは staff_cap', () => {
    const users = new Map<number, MigratedUser | null>([
      [1, migratedUser(1, { maxStaffsCount: 10 })],
      [2, migratedUser(2, { maxStaffsCount: 30 })],
      [
        3,
        migratedUser(3, {
          maxStaffsCount: 30,
          stripeSubscriptionId: 'sub_3',
          stripeCustomerId: 'cus_3',
          trialEnd: T2,
        }),
      ],
      [4, migratedUser(4, { maxStaffsCount: 20, stripeSubscriptionId: 'sub_4' })],
      [5, migratedUser(5, { maxStaffsCount: 10, stripeSubscriptionId: 'sub_5' })],
      [6, null],
    ])
    const counts = new Map([
      [2, 12],
      [3, 5],
      [4, 25],
    ])
    const r = buildProfiles(users, counts)
    expect(
      r.profiles.map((p) => [
        p.id,
        p.max_staffs_count,
        p.staff_cap,
        p.stripe_customer_id,
        p.trial_end,
      ])
    ).toEqual([
      [v1Uuid('users', 1), null, null, null, null],
      [v1Uuid('users', 2), 30, null, null, null],
      [v1Uuid('users', 3), null, 30, 'cus_3', T2],
      [v1Uuid('users', 4), null, 25, null, null], // 在籍 25 > 上限 20 → 在籍
      [v1Uuid('users', 5), null, null, null, null], // 上限 10 の Subscription は無料扱い
    ])
    expect(r.profiles[0].created_at).toBe(T0)
    expect(r.history).toEqual([
      { user_id: v1Uuid('users', 1), active_count: 0 },
      { user_id: v1Uuid('users', 2), active_count: 12 },
      { user_id: v1Uuid('users', 3), active_count: 5 },
      { user_id: v1Uuid('users', 4), active_count: 25 },
      { user_id: v1Uuid('users', 5), active_count: 0 },
    ])
    expect(r.fixed).toEqual([])
  })

  it('staff_cap は 1000 で切って記録', () => {
    const users = new Map<number, MigratedUser | null>([
      [1, migratedUser(1, { maxStaffsCount: 1500, stripeSubscriptionId: 'sub_1' })],
    ])
    const r = buildProfiles(users, new Map())
    expect(r.profiles[0].staff_cap).toBe(1000)
    expect(r.fixed).toEqual([
      {
        table: 'users',
        id: 1,
        column: 'staff_cap',
        reason: 'staff_cap_clipped',
        detail: '1500 → 1000',
      },
    ])
  })
})

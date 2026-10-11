import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isHolidayDate } from '@/lib/calendar/holidays'
import { convertExport, type Converted } from './convert'
import { readExport } from './readExport'
import { v1Uuid } from './v1Ids'

/**
 * 変換の通し（JSONL → v2 の行 + report の材料）を fixtures で固定する（021 §12-4）。
 * fixtures の中身は `scripts/migrate-v1/fixtures/`（架空の値）。何を含むかはそこの README を見る。
 */
const FIXTURES = fileURLToPath(new URL('../../../scripts/migrate-v1/fixtures', import.meta.url))

const u = (id: number) => v1Uuid('users', id)
const t = (token: string) => v1Uuid('tenants', token)
const p = (id: number) => v1Uuid('patterns', id)
const s = (id: number) => v1Uuid('staffs', id)

const T1 = t('FixtureTenant00000001A')
const T2 = t('FixtureTenant00000002B')
const T4 = t('FixtureTenant00000004D')

let cache: Promise<Converted> | undefined
const converted = () =>
  (cache ??= readExport(FIXTURES).then((input) =>
    convertExport(input, { isHoliday: isHolidayDate })
  ))

describe('readExport', () => {
  it('fixtures を manifest の件数どおりに読む', async () => {
    const input = await readExport(FIXTURES)
    expect(input.users).toHaveLength(input.manifest.counts.users)
    expect(input.shifts).toHaveLength(11)
  })
})

describe('convertExport（fixtures の通し）', () => {
  it('テーブルごとの件数（読んだ − 捨てた = 入れる）', async () => {
    const c = await converted()
    expect(c.source).toEqual({
      users: {
        read: 8,
        migrated: 6,
        dropped: { not_migrated: 2 },
        fixed: {
          password_is_email: 1,
          empty_password: 1,
          unlocked: 1,
          stripe_customer_duplicate: 1,
        },
      },
      tenants: {
        read: 5,
        migrated: 3,
        dropped: { parent_dropped: 1, parent_missing: 1 },
        fixed: { truncated: 1, start_of_week: 1, empty_name: 1 },
      },
      staffs: {
        read: 8,
        migrated: 6,
        dropped: { parent_dropped: 1, parent_missing: 1 },
        fixed: {
          available_pattern_dropped: 2,
          default_pattern_dropped: 1,
          max_work_week: 1,
          truncated: 1,
          empty_name: 1,
        },
      },
      patterns: {
        read: 11,
        migrated: 9,
        dropped: { parent_dropped: 1, parent_missing: 1 },
        fixed: { color_hex: 1, pair_pattern: 2, truncated: 2 },
      },
      shifts: {
        read: 11,
        migrated: 5,
        dropped: {
          duplicate: 1,
          unassigned: 1,
          tenant_mismatch: 1,
          parent_missing: 2,
          parent_dropped: 1,
        },
        fixed: {},
      },
      required_nums: {
        read: 11,
        migrated: 2,
        dropped: {
          baked: 3,
          dayoff_pattern: 1,
          invalid_date: 1,
          out_of_range: 2,
          parent_missing: 1,
          parent_dropped: 1,
        },
        fixed: {},
      },
      restrictions: {
        read: 8,
        migrated: 4,
        dropped: { missing_column: 2, unknown_kind: 1, parent_dropped: 1 },
        fixed: {},
      },
      events: {
        read: 5,
        migrated: 2,
        dropped: { duplicate: 1, empty_note: 1, parent_dropped: 1 },
        fixed: { truncated: 1 },
      },
      shares: {
        read: 6,
        migrated: 2,
        dropped: { duplicate: 1, invalid_code: 1, invalid_range: 1, parent_dropped: 1 },
        fixed: { end_date_clipped: 1 },
      },
    })
    expect(c.identities).toHaveLength(6) // 全員 email だけ
    expect(c.pairs).toEqual([{ id: p(12), pair_pattern_id: p(13) }])
    expect(c.staffPatterns).toHaveLength(3 + 1 + 2 + 2 + 2 + 1)
    expect(c.staffDefaultPatterns).toEqual([
      { tenant_id: T1, staff_id: s(100), day_key: '1', pattern_id: p(10) },
      { tenant_id: T1, staff_id: s(100), day_key: '2', pattern_id: p(11) },
    ])
    expect(c.profiles).toHaveLength(6)
    expect(c.history).toHaveLength(6)
  })

  it('users: 通常 / Google / 代理承認 / 空パスワード / 重複 Customer', async () => {
    const c = await converted()
    const byId = new Map(c.authUsers.map((row) => [row.id, row]))
    expect(byId.get(u(1))?.encrypted_password).toMatch(/^\$2a\$11\$/)
    expect(byId.get(u(2))?.email).toBe('hanako@example.test')
    // Google の人も email のアカウント（パスワードは残る）
    expect(byId.get(u(2))?.raw_app_meta_data).toEqual({ provider: 'email', providers: ['email'] })
    expect(byId.get(u(2))?.encrypted_password).toMatch(/^\$2a\$11\$/)
    expect(byId.get(u(3))?.encrypted_password).toBeNull()
    expect(byId.get(u(8))?.encrypted_password).toBeNull()
    expect(byId.has(u(4))).toBe(false)
    expect(byId.has(u(5))).toBe(false)

    const profile = new Map(c.profiles.map((row) => [row.id, row]))
    expect(profile.get(u(1))).toMatchObject({
      stripe_customer_id: 'cus_fixtureA',
      max_staffs_count: null,
      staff_cap: 20,
      trial_end: '2019-07-31T14:59:59.000000Z',
    })
    expect(profile.get(u(6))).toMatchObject({ max_staffs_count: 30, staff_cap: null })
    expect(profile.get(u(7))).toMatchObject({ stripe_customer_id: null })
  })

  it('tenants: id はトークンから。スタッフのいない店舗は準備中', async () => {
    const c = await converted()
    const byId = new Map(c.tenants.map((row) => [row.id, row]))
    expect(byId.get(T1)).toMatchObject({
      owner_id: u(1),
      name: '小石川ストア',
      setup_completed_at: '2019-05-01T00:00:00.000000Z',
    })
    expect(byId.get(T2)).toMatchObject({
      name: 'とてもとても長い名前の店舗をここに書いて',
      start_of_week: 0,
      shift_cycle: 'half_month',
    })
    expect(byId.get(T4)).toMatchObject({ name: '店舗', setup_completed_at: null })
    expect(c.tenantsPendingWithData).toEqual([T4])
  })

  it('在籍数は退職者を除いて利用者ごと（履歴と staff_cap に同じ数）', async () => {
    const c = await converted()
    expect(new Map(c.history.map((h) => [h.user_id, h.active_count]))).toEqual(
      new Map([
        [u(1), 3],
        [u(2), 2],
        [u(3), 0],
        [u(6), 0],
        [u(7), 0],
        [u(8), 0],
      ])
    )
  })

  it('移行しないのに店舗を持つ人・上限超過を report に出す', async () => {
    const c = await converted()
    expect(c.notMigratedUsersWithTenants).toEqual([
      { v1Id: 5, email: 'ghost@example.test', tenantV1Ids: [3] },
    ])
    expect(c.overLimit.v1OverLimit).toEqual([
      {
        v1Id: 2,
        email: 'hanako@example.test',
        active: 2,
        maxStaffsCount: 1,
        hasSubscription: false,
      },
    ])
    expect(c.overLimit.freeOverLimit).toEqual([])
  })

  it('Stripe の CSV: 移行する人だけ。last_edited_at は捨てる前の全行から', async () => {
    const c = await converted()
    expect(c.stripeCsv.migrated).toEqual([
      {
        v1_user_id: 1,
        email: 'taro@example.test',
        stripe_customer_id: 'cus_fixtureA',
        stripe_subscription_id: 'sub_fixtureA',
        max_staffs_count: 20,
        // staff_id が null の一時行（shift 1003）の updated_at
        last_edited_at: '2026-09-30T23:59:59.000000Z',
      },
    ])
    expect(c.stripeCsv.notMigrated.map((r) => [r.v1_user_id, r.reason])).toEqual([
      [5, 'not_migrated'],
      [7, 'stripe_customer_duplicate'],
    ])
  })

  it('required_nums: 上書きだけ残る', async () => {
    const c = await converted()
    expect(c.requiredNums.map((r) => [r.pattern_id, r.date, r.num])).toEqual([
      [p(10), '2026-10-06', 3],
      [p(11), '2026-10-12', 1],
    ])
  })

  it('捨てた行の一覧は id と理由', async () => {
    const c = await converted()
    const shifts = c.dropped.filter((d) => d.table === 'shifts').map((d) => [d.id, d.reason])
    expect(shifts).toEqual([
      [1001, 'duplicate'],
      [1003, 'unassigned'],
      [1004, 'tenant_mismatch'],
      [1005, 'parent_missing'],
      [1006, 'parent_dropped'],
      [1010, 'parent_missing'],
    ])
    // 切り詰めは値を書かない
    for (const f of c.fixed.filter((f) => f.reason === 'truncated')) {
      expect(f.detail).toBeUndefined()
      expect(typeof f.before).toBe('number')
    }
  })
})

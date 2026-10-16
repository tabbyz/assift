/**
 * v1 データのインポート（021 §6.1）。読む → 変換（`lib/migration/convert.ts`）→ 1 トランザクションで書く → 突合（§8.1）→ COMMIT / ROLLBACK。
 *
 *   MIGRATION_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     npm run migrate:v1 -- --input ~/v1-export/20261025-0100 [--rollback] [--allow-existing] \
 *       [--overrides overrides.json] [--report <path>]
 *
 * - `pg` で Postgres に直接つなぐ（PostgREST では `auth.users` に書けず、トリガも止められず、1 トランザクションにもできない）
 * - `ON CONFLICT` は書かない。重複は PK でうるさく失敗させ、失敗したら全部戻す（§3-1）
 * - `--rollback` は全部入れて最後に ROLLBACK（本番の予行。§9.3）。レポートと CSV は書く
 * - `tenants` が 0 件でなければ `--allow-existing` が無い限り止まる（ローカルは seed が入っているので付ける）
 * - 止めるトリガは 3 つだけ（§3-2）。`on_auth_user_created` は止めない（`profiles` を作らせる）
 * - レポート（`report.json`）と Stripe の引き継ぎ用 CSV は `--input` と同じ場所に書く。メールと id を含むので
 *   エクスポートと同じ扱いで保管する（§10-8）
 */
import { accessSync, constants, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import { z } from 'zod'
import { toCsv } from '@/lib/billing/migration'
import { isHolidayDate } from '@/lib/calendar/holidays'
import { convertExport, STRIPE_CSV_HEADER, type Converted } from '@/lib/migration/convert'
import { readExport } from '@/lib/migration/readExport'
import { MigrationError, type Overrides } from '@/lib/migration/transform'
import { keepDateStrings } from './pg'

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    rollback: { type: 'boolean', default: false },
    'allow-existing': { type: 'boolean', default: false },
    overrides: { type: 'string' },
    report: { type: 'string' },
  },
})

const databaseUrl = process.env.MIGRATION_DATABASE_URL
if (!databaseUrl || !values.input) {
  console.error('MIGRATION_DATABASE_URL と --input <dir> を指定してください')
  process.exit(1)
}
const inputDir = values.input
const reportPath = values.report ?? join(inputDir, 'report.json')

const overridesSchema = z.object({
  customerOwner: z.record(z.string(), z.int().positive()).optional(),
  forceMigrateUsers: z.array(z.int().positive()).optional(),
})

/** 止めるトリガ（§3-2）。履歴（スタッフ 1 行ごとに増える）と、後追い UPDATE で updated_at が now() になる 2 つ */
const DISABLED_TRIGGERS = [
  ['public.staffs', 'staffs_record_staff_count'],
  ['public.patterns', 'patterns_set_updated_at'],
  ['public.profiles', 'profiles_set_updated_at'],
] as const

/** BEGIN 直後と終わりに count(*) を取るテーブル（v2 側）。中止のときの片付け（undo.sql）の最後の件数の出力と同じ並びに保つ（026 §14.3） */
const TARGET_TABLES = [
  'auth.users',
  'auth.identities',
  'public.profiles',
  'public.tenants',
  'public.patterns',
  'public.staffs',
  'public.staff_patterns',
  'public.staff_default_patterns',
  'public.shifts',
  'public.required_nums',
  'public.restrictions',
  'public.date_notes',
  'public.shares',
  'public.staff_count_history',
] as const

type TargetTable = (typeof TARGET_TABLES)[number]

const BATCH = 1000

type Value = string | number | boolean | null | number[] | object

/** 1000 行ずつの複数行 INSERT（`pg` のパラメータ上限 65535 に収まる列数にする。§6.1） */
async function insertRows(
  client: Client,
  table: string,
  columns: string[],
  rows: Record<string, Value>[],
  /** 列ごとの型（jsonb / enum / 配列など。`$1::jsonb` の形で付ける） */
  casts: Record<string, string> = {}
): Promise<number> {
  if (columns.length * BATCH > 65535) throw new Error(`${table}: 列が多すぎます`)
  let inserted = 0
  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const chunk = rows.slice(offset, offset + BATCH)
    const params: Value[] = []
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((column) => {
        const value = row[column]
        params.push(
          value !== null && typeof value === 'object' && !Array.isArray(value)
            ? JSON.stringify(value)
            : value
        )
        const cast = casts[column]
        return cast ? `$${params.length}::${cast}` : `$${params.length}`
      })
      return `(${placeholders.join(',')})`
    })
    const sql = `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`
    const result = await client.query(sql, params)
    inserted += result.rowCount ?? 0
  }
  if (inserted !== rows.length)
    throw new Error(`${table}: ${rows.length} 行のうち ${inserted} 行しか入らなかった`)
  return inserted
}

async function countAll(client: Client): Promise<Record<TargetTable, number>> {
  const counts = {} as Record<TargetTable, number>
  for (const table of TARGET_TABLES) {
    const r = await client.query(`select count(*)::int as n from ${table}`)
    counts[table] = r.rows[0].n
  }
  return counts
}

async function scalar<T = number>(client: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await client.query(sql, params)
  return r.rows[0].n as T
}

type Check = { name: string; expected: number | string; actual: number | string; ok: boolean }

function check(name: string, expected: number | string, actual: number | string): Check {
  return { name, expected, actual, ok: expected === actual }
}

async function main() {
  keepDateStrings()
  const startedAt = new Date()

  let overrides: Overrides = {}
  if (values.overrides) {
    overrides = overridesSchema.parse(JSON.parse(readFileSync(values.overrides, 'utf8')))
  }

  // COMMIT の後に report / CSV を書けないと、verify.ts の基準と Stripe の引き継ぎの入力を失う。先に書けることを確かめる
  for (const dir of new Set([dirname(reportPath), inputDir])) accessSync(dir, constants.W_OK)

  console.log(`読み込み: ${inputDir}`)
  const input = await readExport(inputDir)
  console.log(`変換`)
  const c = convertExport(input, { overrides, isHoliday: isHolidayDate })
  for (const [table, s] of Object.entries(c.source)) {
    const dropped = Object.values(s.dropped).reduce((a, b) => a + b, 0)
    console.log(`  ${table}: 読んだ ${s.read} / 捨てた ${dropped} / 入れる ${s.migrated}`)
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  let committed = false
  let before: Record<TargetTable, number> | undefined
  let after: Record<TargetTable, number> | undefined
  const checks: Check[] = []
  const sample: { shiftId: string; date: string } | null = c.shifts[0]
    ? { shiftId: c.shifts[0].id, date: c.shifts[0].date }
    : null

  try {
    // Supabase の既定で切られないように（自セッションなら superuser でなくても変えられる）
    await client.query('set statement_timeout = 0')
    await client.query('set idle_in_transaction_session_timeout = 0')

    const existingUsers = await scalar(client, 'select count(*)::int as n from auth.users')
    const existingTenants = await scalar(client, 'select count(*)::int as n from public.tenants')
    console.log(`既存: auth.users ${existingUsers} 件 / tenants ${existingTenants} 件`)
    if (existingTenants > 0 && !values['allow-existing']) {
      throw new MigrationError(
        'tenants が 0 件ではありません。seed の入ったローカルなら --allow-existing を付けてください'
      )
    }

    await client.query('begin')
    before = await countAll(client)
    const historyMaxBefore = await scalar<number | null>(
      client,
      'select max(id)::int as n from public.staff_count_history'
    )
    const passwordNullBefore = await scalar(
      client,
      'select count(*)::int as n from auth.users where encrypted_password is null'
    )
    const pendingBefore = await scalar(
      client,
      'select count(*)::int as n from public.tenants where setup_completed_at is null'
    )

    for (const [table, trigger] of DISABLED_TRIGGERS) {
      await client.query(`alter table ${table} disable trigger ${trigger}`)
    }

    const t = (label: string) => console.log(`  ${label}`)
    const INSTANCE_ID = '00000000-0000-0000-0000-000000000000'

    t('auth.users')
    await insertRows(
      client,
      'auth.users',
      [
        'instance_id',
        'id',
        'aud',
        'role',
        'email',
        'encrypted_password',
        'email_confirmed_at',
        'raw_app_meta_data',
        'raw_user_meta_data',
        'last_sign_in_at',
        'created_at',
        'updated_at',
        'confirmation_token',
        'recovery_token',
        'email_change',
        'email_change_token_new',
      ],
      c.authUsers.map((u) => ({
        instance_id: INSTANCE_ID,
        id: u.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: u.email,
        encrypted_password: u.encrypted_password,
        email_confirmed_at: u.email_confirmed_at,
        raw_app_meta_data: u.raw_app_meta_data,
        raw_user_meta_data: {},
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at,
        updated_at: u.updated_at,
        // token 系 4 列は null だと GoTrue が落ちる（seed の注記）
        confirmation_token: '',
        recovery_token: '',
        email_change: '',
        email_change_token_new: '',
      })),
      { raw_app_meta_data: 'jsonb', raw_user_meta_data: 'jsonb' }
    )

    t('auth.identities')
    await insertRows(
      client,
      'auth.identities',
      [
        'id',
        'user_id',
        'provider_id',
        'provider',
        'identity_data',
        'last_sign_in_at',
        'created_at',
        'updated_at',
      ],
      c.identities.map((i) => ({
        id: crypto.randomUUID(),
        user_id: i.user_id,
        provider_id: i.provider_id,
        provider: i.provider,
        identity_data: i.identity_data,
        last_sign_in_at: i.created_at,
        created_at: i.created_at,
        updated_at: i.created_at,
      })),
      { identity_data: 'jsonb' }
    )

    t('tenants')
    await insertRows(
      client,
      'public.tenants',
      [
        'id',
        'owner_id',
        'name',
        'shift_cycle',
        'start_of_week',
        'setup_completed_at',
        'created_at',
        'updated_at',
      ],
      c.tenants,
      { shift_cycle: 'public.shift_cycle' }
    )

    t('patterns')
    await insertRows(
      client,
      'public.patterns',
      [
        'id',
        'tenant_id',
        'name',
        'description',
        'color_hex',
        'kind',
        'position',
        'default_required_nums',
        'created_at',
        'updated_at',
      ],
      c.patterns,
      { kind: 'public.pattern_kind', default_required_nums: 'jsonb' }
    )
    for (const pair of c.pairs) {
      const r = await client.query(
        'update public.patterns set pair_pattern_id = $1 where id = $2',
        [pair.pair_pattern_id, pair.id]
      )
      if (r.rowCount !== 1)
        throw new Error(`patterns: ペアの UPDATE が ${r.rowCount} 行（${pair.id}）`)
    }

    t('staffs')
    await insertRows(
      client,
      'public.staffs',
      [
        'id',
        'tenant_id',
        'name',
        'position',
        'retired_at',
        'available_wdays',
        'max_work_week',
        'created_at',
        'updated_at',
      ],
      c.staffs,
      { available_wdays: 'smallint[]' }
    )

    t('profiles（UPDATE）')
    for (const p of c.profiles) {
      const r = await client.query(
        `update public.profiles
            set stripe_customer_id = $2, trial_end = $3, max_staffs_count = $4, staff_cap = $5,
                created_at = $6, updated_at = $7
          where id = $1`,
        [
          p.id,
          p.stripe_customer_id,
          p.trial_end,
          p.max_staffs_count,
          p.staff_cap,
          p.created_at,
          p.updated_at,
        ]
      )
      if (r.rowCount !== 1)
        throw new Error(
          `profiles: UPDATE が ${r.rowCount} 行（${p.id}。on_auth_user_created が作っていない）`
        )
    }

    t('staff_patterns')
    await insertRows(
      client,
      'public.staff_patterns',
      ['tenant_id', 'staff_id', 'pattern_id'],
      c.staffPatterns
    )
    t('staff_default_patterns')
    await insertRows(
      client,
      'public.staff_default_patterns',
      ['tenant_id', 'staff_id', 'day_key', 'pattern_id'],
      c.staffDefaultPatterns
    )
    t(`shifts（${c.shifts.length}）`)
    await insertRows(
      client,
      'public.shifts',
      ['id', 'tenant_id', 'staff_id', 'pattern_id', 'date', 'fixed', 'created_at', 'updated_at'],
      c.shifts
    )
    t('required_nums')
    await insertRows(
      client,
      'public.required_nums',
      ['id', 'tenant_id', 'pattern_id', 'date', 'num'],
      c.requiredNums
    )
    t('restrictions')
    await insertRows(
      client,
      'public.restrictions',
      [
        'id',
        'tenant_id',
        'kind',
        'days',
        'pattern1_id',
        'pattern2_id',
        'staff_id',
        'hard',
        'wdays',
        'position',
        'created_at',
        'updated_at',
      ],
      c.restrictions.map((r) => ({ ...r, staff_id: null, hard: true, wdays: null })),
      { kind: 'public.restriction_kind', wdays: 'smallint[]' }
    )
    t('date_notes')
    await insertRows(
      client,
      'public.date_notes',
      ['id', 'tenant_id', 'date', 'note', 'created_at', 'updated_at'],
      c.dateNotes
    )
    t('shares')
    await insertRows(
      client,
      'public.shares',
      ['id', 'tenant_id', 'code', 'start_date', 'end_date', 'created_at'],
      c.shares
    )
    t('staff_count_history')
    await insertRows(client, 'public.staff_count_history', ['user_id', 'active_count'], c.history)

    for (const [table, trigger] of DISABLED_TRIGGERS) {
      await client.query(`alter table ${table} enable trigger ${trigger}`)
    }

    // ---------------------------------------------------------------------
    // §8.1 突合（COMMIT の前）。数・等式のある行が合わなければ ROLLBACK
    // ---------------------------------------------------------------------
    console.log('突合')
    after = await countAll(client)
    const inserted: Record<TargetTable, number> = {
      'auth.users': c.authUsers.length,
      'auth.identities': c.identities.length,
      'public.profiles': c.authUsers.length,
      'public.tenants': c.tenants.length,
      'public.patterns': c.patterns.length,
      'public.staffs': c.staffs.length,
      'public.staff_patterns': c.staffPatterns.length,
      'public.staff_default_patterns': c.staffDefaultPatterns.length,
      'public.shifts': c.shifts.length,
      'public.required_nums': c.requiredNums.length,
      'public.restrictions': c.restrictions.length,
      'public.date_notes': c.dateNotes.length,
      'public.shares': c.shares.length,
      'public.staff_count_history': c.history.length,
    }
    for (const table of TARGET_TABLES) {
      checks.push(
        check(
          `${table}: 終わりの count − BEGIN 直後の count = 入れた`,
          inserted[table],
          after[table] - before[table]
        )
      )
    }
    checks.push(
      check(
        'auth.users と profiles の件数の差分が同じ',
        after['auth.users'] - before['auth.users'],
        after['public.profiles'] - before['public.profiles']
      )
    )
    checks.push(
      check(
        'profiles.email = auth.users.email（全員）',
        0,
        await scalar(
          client,
          'select count(*)::int as n from auth.users u join public.profiles p on p.id = u.id where p.email is distinct from u.email'
        )
      )
    )
    checks.push(
      check(
        'staff_count_history.active_count = private.active_staff_count(user_id)（入れた全行）',
        0,
        await scalar(
          client,
          `select count(*)::int as n from public.staff_count_history h
            where h.id > $1 and h.active_count <> private.active_staff_count(h.user_id)`,
          [historyMaxBefore ?? 0]
        )
      )
    )
    checks.push(
      check(
        'encrypted_password is null の件数 = password_is_email と空パスワードの人',
        c.migratedUsers.filter((u) => u.passwordNull).length,
        (await scalar(
          client,
          'select count(*)::int as n from auth.users where encrypted_password is null'
        )) - passwordNullBefore
      )
    )
    checks.push(
      check(
        'tenants の setup_completed_at is null の件数 = スタッフ 0 人の店舗',
        c.tenants.filter((t) => t.setup_completed_at === null).length,
        (await scalar(
          client,
          'select count(*)::int as n from public.tenants where setup_completed_at is null'
        )) - pendingBefore
      )
    )
    if (sample) {
      checks.push(
        check(
          'shifts.date が文字列のまま一致する（型パーサ）',
          sample.date,
          await scalar<string>(client, 'select date as n from public.shifts where id = $1', [
            sample.shiftId,
          ])
        )
      )
    }
    for (const ck of checks) {
      console.log(`  ${ck.ok ? 'OK' : 'NG'} ${ck.name}: 期待 ${ck.expected} / 実際 ${ck.actual}`)
    }
    const failed = checks.filter((ck) => !ck.ok)
    if (failed.length > 0) throw new MigrationError(`突合が ${failed.length} 件合いません`)

    if (values.rollback) {
      await client.query('rollback')
      console.log('ROLLBACK（--rollback）')
    } else {
      await client.query('commit')
      committed = true
      console.log('COMMIT')
      // 書いた表だけ。裸の ANALYZE は postgres が所有しない表（auth.* など）で WARNING を出し、全表のロックを持つ。
      // 失敗しても COMMIT は済んでいるので警告だけ（統計は autovacuum が追いつく）
      for (const table of TARGET_TABLES) {
        if (!table.startsWith('public.')) continue
        await client.query(`analyze ${table}`).catch((error: unknown) => {
          console.warn(`analyze ${table} に失敗: ${error instanceof Error ? error.message : error}`)
        })
      }
    }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await client.end()
  }

  try {
    writeOutputs(c, { startedAt, committed, before, after, checks, overrides, sample })
  } catch (error) {
    console.error(
      `${committed ? 'COMMIT 済みだが' : ''}report / CSV を書けなかった: ${error instanceof Error ? error.message : error}`
    )
    process.exitCode = 1
  }
}

function countByColumn(items: { table: string; column: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const key = `${item.table}.${item.column}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** `report.json` と Stripe の引き継ぎ用 CSV（§6.1） */
function writeOutputs(
  c: Converted,
  meta: {
    startedAt: Date
    committed: boolean
    before?: Record<string, number>
    after?: Record<string, number>
    checks: Check[]
    overrides: Overrides
    sample: { shiftId: string; date: string } | null
  }
) {
  const finishedAt = new Date()
  /**
   * 件数が多い理由は id を並べない（数十万件になりうる。件数は source[table].dropped にある）。
   * shifts の parent_missing は消えたスタッフのシフトで、本物では 129 万件ある（リハーサル 2026-10-13。§15）
   */
  const BULK: Record<string, string[]> = {
    shifts: ['unassigned', 'parent_missing', 'parent_dropped'],
    required_nums: ['baked'],
  }
  const report = {
    input: inputDir,
    started_at: meta.startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - meta.startedAt.getTime(),
    rollback: values.rollback,
    committed: meta.committed,
    overrides: meta.overrides,
    /** BEGIN 直後の count(*)（seed や管理用アカウントの分。verify.ts の基準） */
    before: meta.before ?? null,
    after: meta.after ?? null,
    checks: meta.checks,
    sample: meta.sample,
    source: c.source,
    dropped: c.dropped.filter((d) => !BULK[d.table]?.includes(d.reason)),
    fixed: c.fixed,
    not_migrated_users_with_tenants: c.notMigratedUsersWithTenants,
    over_limit: c.overLimit,
    tenants_pending_with_data: c.tenantsPendingWithData,
    /** 切り詰めた値の件数（列ごと。§8.1） */
    truncated: countByColumn(c.fixed.filter((f) => f.reason === 'truncated')),
    staff_cap_clipped: c.fixed.filter((f) => f.reason === 'staff_cap_clipped').map((f) => f.id),
    manual_limit_over_1000: c.migratedUsers
      .filter((u) => u.stripeSubscriptionId === null && u.maxStaffsCount > 1000)
      .map((u) => u.v1Id),
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(
    join(inputDir, 'v1-subscriptions.csv'),
    toCsv(STRIPE_CSV_HEADER, c.stripeCsv.migrated)
  )
  writeFileSync(
    join(inputDir, 'v1-subscriptions-not-migrated.csv'),
    toCsv([...STRIPE_CSV_HEADER, 'reason'], c.stripeCsv.notMigrated)
  )
  console.log(`report: ${reportPath}`)
  console.log(
    `Stripe 用 CSV: ${c.stripeCsv.migrated.length} 件（移行しない ${c.stripeCsv.notMigrated.length} 件は別ファイル）`
  )
  if (c.notMigratedUsersWithTenants.length > 0) {
    console.warn(
      `注意: 移行しないのに店舗を持つ人が ${c.notMigratedUsersWithTenants.length} 人います（report を見て --overrides で決める）`
    )
  }
}

main().catch((error) => {
  // 読み込み・変換の失敗（JSONL の形・メールの重複・overrides の矛盾）。DB の失敗は main() の中で ROLLBACK 済み
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

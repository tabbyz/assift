/**
 * 移行後の DB と manifest / report の突合（021 §8.2-1）。インポートの外から、別のセッションでもう一度確かめる。
 *
 *   MIGRATION_DATABASE_URL=... npm run migrate:v1:verify -- --input ~/v1-export/20261025-0100 [--report <path>]
 *
 * 基準は `report.json` に残した BEGIN 直後のテーブルごとの `count(*)`（seed や管理用アカウントの分）で、
 * `現在の count − 基準 = 入れた` を見る。manifest の行数と report の「読んだ」も突き合わせる。
 * 合わなければ非 0 で終わる。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import { z } from 'zod'
import { v1ManifestSchema } from '@/lib/migration/v1Types'
import { keepDateStrings } from './pg'

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
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

const reportSchema = z
  .object({
    committed: z.boolean(),
    before: z.record(z.string(), z.int()).nullable(),
    after: z.record(z.string(), z.int()).nullable(),
    sample: z.object({ shiftId: z.string(), date: z.string() }).nullable(),
    source: z.record(
      z.string(),
      z.object({ read: z.int(), migrated: z.int(), dropped: z.record(z.string(), z.int()) })
    ),
  })
  .loose()

/** v1 のテーブル → v2 のテーブル（1:1 のものだけ。users は auth.users と profiles の両方） */
const TABLE_MAP: Record<string, string[]> = {
  users: ['auth.users', 'public.profiles'],
  tenants: ['public.tenants'],
  staffs: ['public.staffs'],
  patterns: ['public.patterns'],
  shifts: ['public.shifts'],
  required_nums: ['public.required_nums'],
  restrictions: ['public.restrictions'],
  events: ['public.date_notes'],
  shares: ['public.shares'],
}

type Check = { name: string; expected: number | string; actual: number | string }

async function main() {
  keepDateStrings()
  const manifest = v1ManifestSchema.parse(
    JSON.parse(readFileSync(join(inputDir, 'manifest.json'), 'utf8'))
  )
  const report = reportSchema.parse(JSON.parse(readFileSync(reportPath, 'utf8')))
  if (!report.committed || !report.before || !report.after) {
    console.error(
      'report.json は COMMIT していない実行のもの（--rollback か失敗）。検証する DB と合いません'
    )
    process.exit(1)
  }

  const checks: Check[] = []
  // manifest の行数 = report の「読んだ」
  for (const [table, stats] of Object.entries(report.source)) {
    const expected = manifest.counts[table]
    if (expected !== undefined)
      checks.push({ name: `manifest.counts.${table} = 読んだ`, expected, actual: stats.read })
    const dropped = Object.values(stats.dropped).reduce((a, b) => a + b, 0)
    checks.push({
      name: `${table}: 読んだ − 捨てた = 入れた`,
      expected: stats.read - dropped,
      actual: stats.migrated,
    })
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    // 現在の count − BEGIN 直後の count = 入れた（report.after − report.before）
    for (const [table, before] of Object.entries(report.before)) {
      const r = await client.query(`select count(*)::int as n from ${table}`)
      const inserted = (report.after[table] ?? 0) - before
      checks.push({
        name: `${table}: 現在の count − 基準 = 入れた`,
        expected: inserted,
        actual: r.rows[0].n - before,
      })
    }
    // v1 のテーブルの「入れた」= v2 のテーブルの差分
    for (const [table, targets] of Object.entries(TABLE_MAP)) {
      for (const target of targets) {
        const inserted = (report.after[target] ?? 0) - (report.before[target] ?? 0)
        checks.push({
          name: `${table} の入れた = ${target} の差分`,
          expected: report.source[table]?.migrated ?? -1,
          actual: inserted,
        })
      }
    }
    // 既知の 1 件の shifts.date が文字列で一致する（型パーサが効いている）
    if (report.sample) {
      const r = await client.query('select date from public.shifts where id = $1', [
        report.sample.shiftId,
      ])
      checks.push({
        name: 'shifts.date（サンプル 1 件）',
        expected: report.sample.date,
        actual: r.rows[0]?.date ?? '(無い)',
      })
    }
  } finally {
    await client.end()
  }

  let failed = 0
  for (const ck of checks) {
    const ok = ck.expected === ck.actual
    if (!ok) failed++
    console.log(`${ok ? 'OK' : 'NG'} ${ck.name}: 期待 ${ck.expected} / 実際 ${ck.actual}`)
  }
  if (failed > 0) {
    console.error(`${failed} 件合いません`)
    process.exit(1)
  }
  console.log('すべて一致')
}

main()

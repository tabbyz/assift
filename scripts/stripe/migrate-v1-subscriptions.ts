/**
 * v1 の Subscription の引き継ぎ（019 §8.2）。カットオーバーで 1 回流す。冪等（途中で止まっても再実行できる）。
 *
 *   STRIPE_SECRET_KEY=... npm run stripe:migrate-v1 -- --input v1-subscriptions.csv                  # dry-run（既定）
 *   STRIPE_SECRET_KEY=... npm run stripe:migrate-v1 -- --input v1-subscriptions.csv --apply --limit 5 # 区分ごとに 5 件だけ
 *   STRIPE_SECRET_KEY=... npm run stripe:migrate-v1 -- --input v1-subscriptions.csv --apply           # 残り全部
 *
 * 入力の CSV は v1 の本番で `rails runner` で出す（列: v1_user_id, email, stripe_customer_id, stripe_subscription_id,
 * max_staffs_count, last_edited_at）:
 *
 *   require 'csv'
 *   puts CSV.generate { |csv|
 *     csv << %w[v1_user_id email stripe_customer_id stripe_subscription_id max_staffs_count last_edited_at]
 *     User.where.not(stripe_subscription_id: nil).find_each { |u|
 *       last = Shift.joins(pattern: :tenant).where(tenants: { user_id: u.id }).maximum(:updated_at)
 *       csv << [u.id, u.email, u.stripe_customer_id, u.stripe_subscription_id, u.max_staffs_count, last&.iso8601]
 *     }
 *   }
 *
 * 結果（区分・するはずの操作・結果）は `--output`（既定 `v1-subscriptions-result.csv`）に書く。v1 のダンプと一緒に保管する（§8.2.3）。
 * 旧 metered の明細を含む Subscription を触るので、**すべての呼び出しを API `2025-02-24.acacia` で行う**（basil 以降は扱えない）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import Stripe from 'stripe'
import { phaseParams } from '@/lib/billing/cancel'
import { LEGACY_API_VERSION, LEGACY_COUPON_ID, PRICE_LOOKUP_KEY } from '@/lib/billing/constants'
import {
  type MigrationCategory,
  migrationCategory,
  parseCsv,
  shouldVoidDrafts,
  toCsv,
} from '@/lib/billing/migration'
import { STRIPE_API_VERSION } from '@/lib/billing/stripe'

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string', default: 'v1-subscriptions-result.csv' },
    apply: { type: 'boolean', default: false },
    limit: { type: 'string' },
  },
})

const key = process.env.STRIPE_SECRET_KEY
if (!key || !values.input) {
  console.error('STRIPE_SECRET_KEY と --input <CSV> を指定してください')
  process.exit(1)
}

const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 })
const LEGACY = { apiVersion: LEGACY_API_VERSION }
const apply = values.apply
const limit = values.limit ? Number(values.limit) : Infinity

/** acacia の Subscription は期間を item ではなく本体に持つ */
type LegacySubscription = Stripe.Subscription & { current_period_end?: number }

type Result = {
  v1_user_id: string
  email: string
  customer: string
  subscription: string
  status: string
  max_staffs_count: string
  period_end: string
  last_edited_at: string
  category: MigrationCategory | ''
  actions: string
  result: string
}

const HEADER: (keyof Result)[] = [
  'v1_user_id',
  'email',
  'customer',
  'subscription',
  'status',
  'max_staffs_count',
  'period_end',
  'last_edited_at',
  'category',
  'actions',
  'result',
]

const iso = (seconds: number | undefined | null) =>
  seconds ? new Date(seconds * 1000).toISOString() : ''
const idOf = (value: string | { id: string }) => (typeof value === 'string' ? value : value.id)

/**
 * 下書きを無効にする。下書きのまま無効にはできないので、自動の確定を止めてから確定し、すぐ無効にする（§8.2.2）。
 * `keepLatest` なら最新の 1 件だけは確定して開いたままにする（無効にしない）。救う契約は、続く `markOpenUncollectible` で
 * それを回収不能にする: Stripe は最新の請求書が支払い済み・回収不能になったときに unpaid を解くので、最新を無効にすると
 * active に戻らない（2026-10-08 にサンドボックスで確認）
 */
async function voidDrafts(subscriptionId: string, keepLatest: boolean): Promise<number> {
  const drafts: Stripe.Invoice[] = []
  for await (const invoice of stripe.invoices.list(
    { subscription: subscriptionId, status: 'draft', limit: 100 },
    LEGACY
  ))
    drafts.push(invoice)
  drafts.sort((a, b) => a.created - b.created)
  const latest = keepLatest ? drafts.pop() : undefined

  for (const invoice of drafts) {
    await stripe.invoices.update(invoice.id!, { auto_advance: false }, LEGACY)
    await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: false }, LEGACY)
    await stripe.invoices.voidInvoice(invoice.id!, {}, LEGACY)
  }
  if (latest) {
    await stripe.invoices.update(latest.id!, { auto_advance: false }, LEGACY)
    await stripe.invoices.finalizeInvoice(latest.id!, { auto_advance: false }, LEGACY)
  }
  return drafts.length
}

/** 未払いの（確定済みの）請求書を回収不能にする。最新の請求書が支払い済み扱いになり、unpaid から active に戻る（§11-10） */
async function markOpenUncollectible(subscriptionId: string): Promise<number> {
  let count = 0
  for await (const invoice of stripe.invoices.list(
    { subscription: subscriptionId, status: 'open', limit: 100 },
    LEGACY
  )) {
    await stripe.invoices.markUncollectible(invoice.id!, {}, LEGACY)
    count += 1
  }
  return count
}

/**
 * 今の期間の終わりで `assift_monthly` + 旧料金のクーポンに切り替える schedule を付ける（§8.2.2）。
 * phase 1 の長さは 1 日にし、その後 release する（release しても明細とクーポンは Subscription に残る）。
 * 1 か月にすると、その間ずっとポータルで解約できない（schedule 付きの契約はポータルで解約できない）
 */
async function scheduleLegacy(subscription: LegacySubscription, priceId: string): Promise<string> {
  let scheduleId = subscription.schedule ? idOf(subscription.schedule) : null
  if (scheduleId) {
    const existing = await stripe.subscriptionSchedules.retrieve(scheduleId, {}, LEGACY)
    const last = existing.phases.at(-1)
    if (existing.status === 'active' && last?.items.some((item) => idOf(item.price) === priceId)) {
      return `schedule 既存 (${scheduleId})`
    }
    if (existing.status === 'active')
      throw new Error(`想定外の schedule があります (${scheduleId})`)
    scheduleId = null
  }
  const created = await stripe.subscriptionSchedules.create(
    { from_subscription: subscription.id },
    LEGACY
  )
  const current = created.phases[0]
  if (!current) throw new Error(`schedule の phase がありません (${created.id})`)
  await stripe.subscriptionSchedules.update(
    created.id,
    {
      end_behavior: 'release',
      proration_behavior: 'none',
      phases: [
        phaseParams(current),
        {
          items: [{ price: priceId }],
          discounts: [{ coupon: LEGACY_COUPON_ID }],
          proration_behavior: 'none',
          end_date: current.end_date + 24 * 60 * 60,
        },
      ],
    },
    LEGACY
  )
  return `schedule 作成 (${created.id})`
}

async function handle(
  row: Record<string, string>,
  priceId: string,
  counts: Map<MigrationCategory, number>
): Promise<Result> {
  const result: Result = {
    v1_user_id: row.v1_user_id ?? '',
    email: row.email ?? '',
    customer: row.stripe_customer_id ?? '',
    subscription: row.stripe_subscription_id ?? '',
    status: '',
    max_staffs_count: row.max_staffs_count ?? '',
    period_end: '',
    last_edited_at: row.last_edited_at ?? '',
    category: '',
    actions: '',
    result: '',
  }

  let subscription: LegacySubscription
  try {
    subscription = (await stripe.subscriptions.retrieve(
      result.subscription,
      {},
      LEGACY
    )) as LegacySubscription
  } catch (error) {
    result.result = `取得できません: ${(error as Error).message}`
    return result
  }
  result.status = subscription.status
  result.period_end = iso(
    subscription.current_period_end ?? subscription.items.data[0]?.current_period_end
  )
  if (idOf(subscription.customer) !== result.customer) {
    result.result = `Customer が一致しません (${idOf(subscription.customer)})`
    return result
  }

  const category = migrationCategory({
    status: subscription.status,
    maxStaffsCount: Number(result.max_staffs_count || 0),
    lastEditedAt: result.last_edited_at ? new Date(result.last_edited_at) : null,
    now: new Date(),
  })
  result.category = category

  const planned: string[] = []
  if (shouldVoidDrafts(category, subscription.status)) planned.push('下書きを無効')
  if (category === 'rescue') planned.push('未払いを回収不能にして active に戻す')
  if (category === 'legacy' || category === 'rescue')
    planned.push('言語を日本語', '旧料金の schedule')
  if (shouldVoidDrafts(category, subscription.status) && category !== 'rescue')
    planned.push('未払いを回収不能')
  if (category === 'cancel_unpaid' || category === 'cancel_free') planned.push('即時解約')
  result.actions = planned.join(' / ')

  if (category === 'skip' || category === 'review') {
    result.result = category === 'skip' ? '対象外' : '要確認（何もしない）'
    return result
  }
  const done = counts.get(category) ?? 0
  if (!apply || done >= limit) {
    result.result = apply ? '未実行（--limit）' : 'dry-run'
    return result
  }
  counts.set(category, done + 1)

  try {
    const log: string[] = []
    if (shouldVoidDrafts(category, subscription.status))
      log.push(`下書き ${await voidDrafts(subscription.id, category === 'rescue')} 件を無効`)
    if (category === 'rescue') {
      log.push(`回収不能 ${await markOpenUncollectible(subscription.id)} 件`)
      const refreshed = await stripe.subscriptions.retrieve(subscription.id, {}, LEGACY)
      if (refreshed.status !== 'active')
        throw new Error(`active に戻りません (${refreshed.status})`)
      subscription = refreshed as LegacySubscription
    }
    if (category === 'legacy' || category === 'rescue') {
      await stripe.customers.update(result.customer, { preferred_locales: ['ja'] }, LEGACY)
      log.push(await scheduleLegacy(subscription, priceId))
    }
    if (category === 'cancel_unpaid' || category === 'cancel_free') {
      // 失敗した請求書を開いたまま解約すると、ポータルに未払いが残り、同じ Customer で申し込み直したときに払えてしまう。
      // 過去分は請求しない（§11-12）ので、救わない契約も回収不能にしてから解約する
      if (shouldVoidDrafts(category, subscription.status))
        log.push(`回収不能 ${await markOpenUncollectible(subscription.id)} 件`)
      await stripe.subscriptions.cancel(
        subscription.id,
        { invoice_now: false, prorate: false },
        LEGACY
      )
      log.push('解約')
    }
    result.result = log.join(' / ')
  } catch (error) {
    result.result = `失敗: ${(error as Error).message}`
  }
  return result
}

async function main() {
  const rows = parseCsv(readFileSync(values.input!, 'utf8'))
  const prices = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  })
  const priceId = prices.data[0]?.id
  if (!priceId)
    throw new Error(
      `price が見つかりません（${PRICE_LOOKUP_KEY}）。先に npm run stripe:setup を流してください`
    )
  await stripe.coupons.retrieve(LEGACY_COUPON_ID)

  console.log(`${rows.length} 件を${apply ? '適用' : '確認（dry-run）'}します`)
  const counts = new Map<MigrationCategory, number>()
  const results: Result[] = []
  // 1 件ずつ順に（Stripe のレート制限と、途中で止めたときの見通しのため）
  for (const row of rows) {
    const result = await handle(row, priceId, counts)
    results.push(result)
    console.log([result.subscription, result.status, result.category, result.result].join('\t'))
  }

  writeFileSync(values.output!, toCsv(HEADER, results))
  const summary = new Map<string, number>()
  for (const result of results)
    summary.set(
      result.category || '(取得失敗)',
      (summary.get(result.category || '(取得失敗)') ?? 0) + 1
    )
  console.log('\n区分ごとの件数:')
  for (const [category, count] of summary) console.log(`  ${category}: ${count}`)
  const failed = results.filter(
    (result) => result.result.startsWith('失敗') || result.result.startsWith('取得できません')
  )
  console.log(`失敗: ${failed.length} 件。結果: ${values.output}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

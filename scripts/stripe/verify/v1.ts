/**
 * v1 の引き継ぎの確認（019 §9.4-5）。サンドボックスに v1 と同じ形の旧 metered の plan（`freemium-monthly`）と、
 * v1 相当の Subscription（テストクロック付き・API `2025-02-24.acacia`）を作り、`stripe:migrate-v1` の入力の CSV を書く
 *
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/stripe/verify/v1.ts setup <CSV>
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/stripe/verify/v1.ts advance <CSV>
 *
 * setup のあと `npm run stripe:migrate-v1` を流し、advance で期間の終わりを 2 回またいで請求書を見る
 */
import { readFileSync, writeFileSync } from 'node:fs'
import Stripe from 'stripe'
import { LEGACY_API_VERSION, LEGACY_PRICE_ID } from '@/lib/billing/constants'
import { parseCsv, toCsv } from '@/lib/billing/migration'
import { reportUsageFor } from '@/lib/billing/report'
import { syncCustomer } from '@/lib/billing/sync'
import {
  advance,
  at,
  attachCard,
  createUser,
  db,
  invoices,
  log,
  row,
  seconds,
  setHistory,
  stripe,
  type Clock,
} from './lib'

const LEGACY = { apiVersion: LEGACY_API_VERSION }

/** v1 の plan（`stripe:create_plan`）と同じ形。10 人まで 0 円、以降 1 人 50 円、期間の最大（max） */
async function ensureLegacyPlan() {
  try {
    await stripe.plans.retrieve(LEGACY_PRICE_ID, {}, LEGACY)
    log('plan', `${LEGACY_PRICE_ID}（既存）`)
    return
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeError && error.statusCode === 404)) throw error
  }
  await stripe.plans.create(
    {
      id: LEGACY_PRICE_ID,
      product: 'assift',
      nickname: 'フリーミアム (月払い)',
      currency: 'jpy',
      interval: 'month',
      usage_type: 'metered',
      aggregate_usage: 'max',
      billing_scheme: 'tiered',
      tiers_mode: 'graduated',
      tiers: [
        { up_to: 10, unit_amount: 0 },
        { up_to: 'inf', unit_amount: 50 },
      ],
    } as Stripe.PlanCreateParams,
    LEGACY
  )
  log('plan', `${LEGACY_PRICE_ID}（作成）`)
}

type Case = {
  label: string
  maxStaffs: number
  lastEditedDaysAgo: number | null
  card?: string
}

/** v1 の契約: 期間の終わりは月末 23:59:59 JST、上限人数を usage record（set）で送ってある */
async function createV1Subscription(item: Case, now: Date) {
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: seconds(now),
    name: `019 v1 ${item.label}`,
  })
  const customer = await stripe.customers.create(
    { test_clock: clock.id, name: `019 v1 ${item.label}`, email: `v1-${item.label}@example.com` },
    LEGACY
  )
  await attachCard(customer.id, item.card ?? 'pm_card_visa')
  const subscription = await stripe.subscriptions.create(
    {
      customer: customer.id,
      items: [{ price: LEGACY_PRICE_ID }],
      billing_cycle_anchor: seconds(at('2026-10-31T14:59:59Z')),
      proration_behavior: 'none',
    },
    LEGACY
  )
  await stripe.rawRequest(
    'POST',
    `/v1/subscription_items/${subscription.items.data[0].id}/usage_records`,
    { quantity: item.maxStaffs, timestamp: seconds(now), action: 'set' },
    LEGACY
  )
  return {
    v1_user_id: item.label,
    email: `v1-${item.label}@example.com`,
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    max_staffs_count: String(item.maxStaffs),
    last_edited_at:
      item.lastEditedDaysAgo === null
        ? ''
        : new Date(now.getTime() - item.lastEditedDaysAgo * 86400_000).toISOString(),
    clock: clock.id,
  }
}

const HEADER = [
  'v1_user_id',
  'email',
  'stripe_customer_id',
  'stripe_subscription_id',
  'max_staffs_count',
  'last_edited_at',
  'clock',
] as const

async function setup(csv: string) {
  await ensureLegacyPlan()
  const now = new Date(Math.ceil(Date.now() / 60_000) * 60_000)
  const cases: Case[] = [
    { label: 'legacy', maxStaffs: 15, lastEditedDaysAgo: 3 },
    { label: 'legacy-cancel', maxStaffs: 15, lastEditedDaysAgo: 3 },
    { label: 'free', maxStaffs: 10, lastEditedDaysAgo: 3 },
  ]
  const rows = []
  for (const item of cases) rows.push(await createV1Subscription(item, now))
  writeFileSync(csv, toCsv([...HEADER], rows))
  log('CSV', csv)
}

/**
 * 移行のあと: v2 の利用者に結び付け（カットオーバーの §8.1 と同じく stripe_customer_id を写す）、
 * 期間の終わりを 2 回またぐ。1 回目は旧料金（v1 の上限 × 50 円）、2 回目は Meter の人数 × 100 円 × 50%
 */
async function advanceAll(csv: string) {
  const rows = parseCsv(readFileSync(csv, 'utf8')).filter((r) => r.v1_user_id !== 'free')
  const clocks: (Clock & { label: string })[] = []
  for (const r of rows) {
    const userId = await createUser(`v1-${r.v1_user_id}`)
    const { error } = await db
      .from('profiles')
      .update({ stripe_customer_id: r.stripe_customer_id, trial_end: '2020-01-31T14:59:59Z' })
      .eq('id', userId)
    if (error) throw error
    await setHistory(userId, [['2026-10-01T00:00:00Z', 15]])
    clocks.push({ id: r.clock, customerId: r.stripe_customer_id, userId, label: r.v1_user_id })
  }

  for (const clock of clocks) {
    const now = new Date(
      (await stripe.testHelpers.testClocks.retrieve(clock.id)).frozen_time * 1000
    )
    await syncCustomer(clock.customerId, now)
    log(`${clock.label} 移行直後`, await row(clock.userId))
  }

  const legacyCancel = clocks.find((clock) => clock.label === 'legacy-cancel')
  if (legacyCancel) {
    // 「プランとお支払い」の解約（cancelDuringMigration）と同じ呼び出し
    const { endScheduleAtCurrentPhase } = await import('@/lib/billing/cancel')
    const subscription = await stripe.subscriptions.retrieve(
      rows.find((r) => r.v1_user_id === 'legacy-cancel')!.stripe_subscription_id,
      {},
      LEGACY
    )
    await endScheduleAtCurrentPhase(stripe, subscription.schedule as string)
    await syncCustomer(legacyCancel.customerId)
    log('legacy-cancel 切り替え待ちの間に解約', await row(legacyCancel.userId))
  }

  for (const clock of clocks) {
    let now = await advance(clock, at('2026-11-01T03:00:00Z'))
    await syncCustomer(clock.customerId, now)
    log(`${clock.label} 11/1`, await row(clock.userId))
    now = await advance(clock, at('2026-11-02T03:00:00Z'))
    await syncCustomer(clock.customerId, now)
    log(`${clock.label} 11/2（phase 1 の終わり = release のあと）`, await row(clock.userId))
    const subscription = await stripe.subscriptions.list({
      customer: clock.customerId,
      status: 'all',
      expand: ['data.discounts'],
    })
    for (const s of subscription.data) {
      log(`${clock.label} Subscription`, {
        status: s.status,
        schedule: s.schedule,
        price: s.items.data.map((item) => item.price.lookup_key ?? item.price.id),
        discounts: s.discounts.map((d) => (typeof d === 'string' ? d : d.source.coupon)),
        period_end: s.items.data[0] && new Date(s.items.data[0].current_period_end * 1000),
      })
    }
    if (clock.label === 'legacy') {
      await reportUsageFor(clock.userId, (now = await advance(clock, at('2026-11-30T14:30:00Z'))))
      now = await advance(clock, at('2026-12-01T03:00:00Z'))
      await syncCustomer(clock.customerId, now)
    }
    console.log(`  ${clock.label} の請求書:`)
    for (const line of await invoices(clock)) console.log(`    ${line}`)
  }
}

/**
 * 11・12（advance のあと）: クーポンは Customer に付いていない（申し込み直しに引き継がれない）/
 * 旧料金の割引を外す（§8.5）→ 次の請求書から新料金
 */
async function dropDiscount(csv: string) {
  const legacy = parseCsv(readFileSync(csv, 'utf8')).find((r) => r.v1_user_id === 'legacy')!
  const customer = await stripe.customers.retrieve(legacy.stripe_customer_id)
  log('Customer の割引（期待: なし）', customer.deleted ? 'deleted' : customer.discount)
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', legacy.stripe_customer_id)
    .single()
  if (error) throw error
  const clock: Clock = { id: legacy.clock, customerId: legacy.stripe_customer_id, userId: data.id }

  await stripe.subscriptions.deleteDiscount(legacy.stripe_subscription_id)
  let now = await advance(clock, at('2026-12-31T14:30:00Z'))
  await syncCustomer(clock.customerId, now)
  log('割引を外したあと', await row(clock.userId))
  await reportUsageFor(clock.userId, now)
  now = await advance(clock, at('2027-01-01T03:00:00Z'))
  console.log('  請求書（期待: 1/1 は 15 人 = 500 円）:')
  for (const line of await invoices(clock)) console.log(`    ${line}`)
}

/** 人数（上限）を今の期間に送る（v1 の rake と同じ usage record の set） */
async function sendUsageRecord(subscriptionId: string, quantity: number, now: Date) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, LEGACY)
  await stripe.rawRequest(
    'POST',
    `/v1/subscription_items/${subscription.items.data[0].id}/usage_records`,
    { quantity, timestamp: seconds(now), action: 'set' },
    LEGACY
  )
}

async function invoiceStates(customerId: string) {
  const list = await stripe.invoices.list({ customer: customerId, limit: 20 }, LEGACY)
  return list.data
    .sort((a, b) => a.created - b.created)
    .map((invoice) => `${invoice.status}:${invoice.total}円:試行${invoice.attempt_count}`)
}

/**
 * 13（前半）: v1 の `unpaid`（期限切れのカード・下書きが溜まった状態）を作る。サンドボックスの「すべての再試行が失敗したら」を
 * 「未払いにする」にしてから流す。10/31 の請求が失敗 → リトライが尽きて unpaid → 11/30・12/31 の請求書が下書きのまま溜まる
 */
async function unpaidSetup(csv: string) {
  await ensureLegacyPlan()
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 120_000)
  // 期限切れのカード（pm_card_chargeDeclinedExpiredCard）は attach の時点で断られるので、請求だけが失敗するカードで代える
  const card = 'pm_card_chargeCustomerFail'
  const cases: Case[] = [
    { label: 'rescue', maxStaffs: 15, lastEditedDaysAgo: 3, card },
    { label: 'unpaid-old', maxStaffs: 15, lastEditedDaysAgo: null, card },
    { label: 'unpaid-free', maxStaffs: 10, lastEditedDaysAgo: 3, card },
  ]
  const rows = []
  for (const item of cases) rows.push(await createV1Subscription(item, now))
  writeFileSync(csv, toCsv([...HEADER], rows))

  await Promise.all(
    rows.map(async (r) => {
      const clock: Clock = { id: r.clock, customerId: r.stripe_customer_id, userId: '' }
      for (const day of [
        '2026-11-01T03:00:00Z',
        '2026-11-15T03:00:00Z',
        '2026-11-29T03:00:00Z',
        '2026-12-01T03:00:00Z',
        '2026-12-31T03:00:00Z',
        '2027-01-01T03:00:00Z',
      ]) {
        const now = await advance(clock, at(day))
        const subscription = await stripe.subscriptions.retrieve(
          r.stripe_subscription_id,
          {},
          LEGACY
        )
        // v1 の rake は状態を見ずに毎日送っていた
        if (subscription.status !== 'canceled')
          await sendUsageRecord(r.stripe_subscription_id, Number(r.max_staffs_count), now)
        log(
          `${r.v1_user_id} ${day}`,
          `${subscription.status} ${(await invoiceStates(r.stripe_customer_id)).join(' ')}`
        )
      }
    })
  )
  log('CSV', csv)
}

/**
 * 13（後半）: `stripe:migrate-v1 --apply` のあと。rescue は下書きが無効・未払いが回収不能で active に戻り、
 * 期間の終わりの請求が期限切れのカードで失敗して past_due → カードを更新して払うと旧料金のまま続く
 */
async function unpaidAfter(csv: string) {
  const rows = parseCsv(readFileSync(csv, 'utf8'))
  for (const r of rows) {
    const subscription = await stripe.subscriptions.retrieve(r.stripe_subscription_id, {}, LEGACY)
    log(
      `${r.v1_user_id} 移行直後`,
      `${subscription.status} schedule:${subscription.schedule ?? 'なし'}`
    )
    log(`${r.v1_user_id} 請求書`, (await invoiceStates(r.stripe_customer_id)).join(' '))
  }

  const rescue = rows.find((r) => r.v1_user_id === 'rescue')!
  const userId = await createUser('v1-rescue')
  const { error } = await db
    .from('profiles')
    .update({ stripe_customer_id: rescue.stripe_customer_id, trial_end: '2020-01-31T14:59:59Z' })
    .eq('id', userId)
  if (error) throw error
  await setHistory(userId, [['2026-10-01T00:00:00Z', 15]])
  const clock: Clock = { id: rescue.clock, customerId: rescue.stripe_customer_id, userId }

  let now = await advance(clock, at('2027-01-01T04:00:00Z'))
  await syncCustomer(clock.customerId, now)
  log('rescue 同期', await row(userId))

  now = await advance(clock, at('2027-02-01T03:00:00Z'))
  await syncCustomer(clock.customerId, now)
  log('rescue 2/1（期待: 期限切れのカードで失敗・past_due・旧 price の請求）', await row(userId))
  log('rescue 請求書', (await invoiceStates(clock.customerId)).join(' '))

  await attachCard(clock.customerId, 'pm_card_visa')
  const open = await stripe.invoices.list({ customer: clock.customerId, status: 'open', limit: 10 })
  for (const invoice of open.data) await stripe.invoices.pay(invoice.id!)
  now = await advance(clock, at('2027-02-02T03:00:00Z'))
  await syncCustomer(clock.customerId, now)
  log('rescue カードを更新して支払い（期待: active・release 後も旧料金）', await row(userId))

  await reportUsageFor(userId, (now = await advance(clock, at('2027-02-28T14:00:00Z'))))
  await syncCustomer(clock.customerId, await advance(clock, at('2027-03-01T03:00:00Z')))
  console.log('  rescue の請求書（期待: 3/1 は 15 人 × 100 円 × 50% = 250 円）:')
  for (const line of await invoices(clock)) console.log(`    ${line}`)
}

const [command, csv] = process.argv.slice(2)
const commands: Record<string, (csv: string) => Promise<void>> = {
  setup,
  advance: advanceAll,
  'drop-discount': dropDiscount,
  'unpaid-setup': unpaidSetup,
  'unpaid-after': unpaidAfter,
}
const run = command ? commands[command] : undefined
if (!run || !csv) {
  console.error(`使い方: v1.ts ${Object.keys(commands).join('|')} <CSV>`)
  process.exit(1)
}
run(csv).catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * 退会の即時解約の確認（2026-10-08）。人数を Meter に送った直後に `invoice_now: true` で解約すると、
 * その人数が最終の請求書に載るか。テストクロックを使わず実時間の Customer で確かめる（Meter の集計の遅れを見るため）
 *
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/stripe/verify/immediate.ts
 */
import { CUSTOMER_USER_ID_KEY } from '@/lib/billing/constants'
import { resolvePriceId } from '@/lib/billing/stripe'
import { sendPeak } from '@/lib/billing/usage'
import { attachCard, log, stripe } from './lib'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function setup(label: string) {
  const customer = await stripe.customers.create({
    name: `019 immediate ${label}`,
    preferred_locales: ['ja'],
    metadata: { [CUSTOMER_USER_ID_KEY]: `verify-${label}` },
  })
  await attachCard(customer.id, 'pm_card_visa')
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: await resolvePriceId(stripe) }],
    billing_cycle_anchor_config: { day_of_month: 31, hour: 15, minute: 0, second: 0 },
  })
  const item = subscription.items.data[0]
  return {
    customerId: customer.id,
    subscriptionId: subscription.id,
    periodStart: new Date(item.current_period_start * 1000),
    periodEnd: new Date(item.current_period_end * 1000),
  }
}

async function send(target: Awaited<ReturnType<typeof setup>>, peak: number) {
  await sendPeak(stripe, { ...target, peak, now: new Date() })
}

async function cancelNow(target: Awaited<ReturnType<typeof setup>>) {
  const canceled = await stripe.subscriptions.cancel(target.subscriptionId, { invoice_now: true })
  const invoiceId =
    typeof canceled.latest_invoice === 'string'
      ? canceled.latest_invoice
      : canceled.latest_invoice?.id
  return invoiceId!
}

async function describe(invoiceId: string) {
  const invoice = await stripe.invoices.retrieve(invoiceId)
  return {
    status: invoice.status,
    total: invoice.total,
    lines: invoice.lines.data.map((line) => `${line.description} ${line.amount}円`),
  }
}

/**
 * 下書きのまま金額が取り直されるか。A は 3 分後に手で確定、B は自動の確定（約 1 時間後）を待つ。
 * `check <invoice id>` で後から見る（B の確認用）
 */
async function main() {
  const command = process.argv[2]
  if (command === 'check') {
    log(process.argv[3], await describe(process.argv[3]))
    return
  }
  const [a, b] = await Promise.all([setup('A'), setup('B')])
  await Promise.all([send(a, 13), send(b, 13)])
  const [invoiceA, invoiceB] = await Promise.all([cancelNow(a), cancelNow(b)])
  log('A 解約直後', await describe(invoiceA))
  log('B 解約直後（あとで check で見る）', { invoice: invoiceB, ...(await describe(invoiceB)) })
  await sleep(180_000)
  log('A 3 分後（下書き）', await describe(invoiceA))
  await stripe.invoices.finalizeInvoice(invoiceA)
  log('A 手で確定したあと（期待: 13 人 = 300 円）', await describe(invoiceA))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

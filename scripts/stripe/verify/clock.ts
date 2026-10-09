/**
 * テストクロックの筋書き（019 §9.3）。1 回の実行で 1 つ。結果は標準出力に出し、§12 に書き写す
 *
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/stripe/verify/clock.ts monthly
 */
import { cancelSubscriptionsForAccountDeletion, PlanStillActiveError } from '@/lib/billing/cancel'
import { entitlement } from '@/lib/billing/entitlement'
import { reportUsageFor } from '@/lib/billing/report'
import { syncCustomer } from '@/lib/billing/sync'
import {
  advance,
  at,
  attachCard,
  createClockCustomer,
  createUser,
  db,
  fromSeconds,
  invoices,
  log,
  profile,
  row,
  setHistory,
  setTrialEnd,
  stripe,
  subscribe,
  type Clock,
} from './lib'

/** cron と同じ順（同期 → 送信）をクロックの時刻で */
async function cron(clock: Clock, now: Date) {
  await syncCustomer(clock.customerId, now)
  await reportUsageFor(clock.userId, now)
}

async function report(label: string, clock: Clock) {
  console.log(`\n## ${label}`)
  log('billing_subscriptions', await row(clock.userId))
  log('profiles', await profile(clock.userId))
  for (const line of await invoices(clock)) console.log(`  ${line}`)
}

/** 1・2: 10/15 に申し込む → 初回の請求書に端数期間が載るか / 11 月に 12 → 15 → 11 人 → 12/1 に 15 人分 */
async function monthly() {
  const start = at('2026-10-15T03:00:00Z')
  const userId = await createUser('monthly')
  await setHistory(userId, [['2026-10-01T00:00:00Z', 12]])
  const clock = await createClockCustomer(userId, 'monthly', start)
  log('clock', clock)
  const subscription = await subscribe(clock)
  log('subscription', { id: subscription.id, status: subscription.status })
  await cron(clock, start)
  await report('申し込み直後（10/15 12:00 JST）', clock)

  let now = await advance(clock, at('2026-10-31T14:30:00Z'))
  await cron(clock, now)
  now = await advance(clock, at('2026-11-01T03:00:00Z'))
  await syncCustomer(clock.customerId, now)
  await report('初回の請求（11/1 12:00 JST）。期待: 10/15〜10/31 の 12 人 = 200 円', clock)

  await setHistory(userId, [
    ['2026-11-05T03:00:00Z', 15],
    ['2026-11-20T03:00:00Z', 11],
  ])
  now = await advance(clock, at('2026-11-10T14:30:00Z'))
  await cron(clock, now)
  now = await advance(clock, at('2026-11-30T14:30:00Z'))
  await cron(clock, now)
  now = await advance(clock, at('2026-12-01T03:00:00Z'))
  await syncCustomer(clock.customerId, now)
  await report('2 回目の請求（12/1 12:00 JST）。期待: 11 月の最大 15 人 = 500 円', clock)
}

/**
 * 4・3: 10/10 にトライアル（〜12/31）、11/10 に申し込む → 12/1・1/1 は 0 円、2/1 に 1 月の最大人数。
 * 2 月の期間の終わりが 2/28 15:00 UTC（月末に寄る）
 */
async function trial() {
  const start = at('2026-11-10T03:00:00Z')
  const userId = await createUser('trial')
  await setHistory(userId, [['2026-10-10T03:00:00Z', 12]])
  await setTrialEnd(userId, '2026-12-31T15:00:00Z')
  const clock = await createClockCustomer(userId, 'trial', start)
  await subscribe(clock)
  await cron(clock, start)
  await report('申し込み直後（11/10。トライアル中）', clock)

  for (const [cronAt, after] of [
    ['2026-11-30T14:30:00Z', '2026-12-01T03:00:00Z'],
    ['2026-12-31T14:30:00Z', '2027-01-01T03:00:00Z'],
  ]) {
    await cron(clock, await advance(clock, at(cronAt)))
    await syncCustomer(clock.customerId, await advance(clock, at(after)))
  }
  await report('1/1 まで。期待: 12/1・1/1 とも 0 円', clock)

  await setHistory(userId, [['2027-01-15T03:00:00Z', 14]])
  await cron(clock, await advance(clock, at('2027-01-31T14:30:00Z')))
  await syncCustomer(clock.customerId, await advance(clock, at('2027-02-01T03:00:00Z')))
  await report('2/1。期待: 1 月の最大 14 人 = 400 円・次の期間の終わりが 2/28 15:00 UTC', clock)

  await cron(clock, await advance(clock, at('2027-02-28T14:30:00Z')))
  await syncCustomer(clock.customerId, await advance(clock, at('2027-03-01T03:00:00Z')))
  await report('3/1。期待: 2 月の 14 人 = 400 円・次の期間の終わりが 3/31 15:00 UTC', clock)
}

/** 5・15: 月の途中にポータルと同じ形（`cancel_at` = 期間の終わり）で解約 → 翌月 1 日に最大人数 → 以降なし */
async function cancel() {
  const start = at('2026-10-15T03:00:00Z')
  const userId = await createUser('cancel')
  await setHistory(userId, [['2026-10-01T00:00:00Z', 12]])
  const clock = await createClockCustomer(userId, 'cancel', start)
  const subscription = await subscribe(clock)
  await cron(clock, start)
  await syncCustomer(clock.customerId, await advance(clock, at('2026-11-01T03:00:00Z')))

  let now = await advance(clock, at('2026-11-10T03:00:00Z'))
  const current = await stripe.subscriptions.retrieve(subscription.id)
  await stripe.subscriptions.update(subscription.id, {
    cancel_at: current.items.data[0].current_period_end,
  })
  await syncCustomer(clock.customerId, now)
  await setHistory(userId, [['2026-11-15T03:00:00Z', 13]])
  await report('11/10 に解約（ポータルと同じ cancel_at）', clock)

  await cron(clock, await advance(clock, at('2026-11-30T14:30:00Z')))
  now = await advance(clock, at('2026-12-01T03:00:00Z'))
  await syncCustomer(clock.customerId, now)
  await report('12/1。期待: 11 月の最大 13 人 = 300 円・canceled', clock)

  now = await advance(clock, at('2027-01-01T03:00:00Z'))
  await syncCustomer(clock.customerId, now)
  await report('1/1。期待: 請求書が増えない', clock)
  const value = entitlement({
    subscriptionStatus: (await row(userId))?.status ?? null,
    trialEnd: new Date((await profile(userId)).trial_end!),
    manualLimit: null,
    staffCap: null,
    now,
  })
  log('権利（期待: free・10 人。トライアルは使用済み）', value)
}

/** 6: 2 回目の請求からカードが失敗 → past_due → リトライが尽きて canceled */
async function failure() {
  const start = at('2026-10-15T03:00:00Z')
  const userId = await createUser('failure')
  await setHistory(userId, [['2026-10-01T00:00:00Z', 12]])
  const clock = await createClockCustomer(userId, 'failure', start)
  await subscribe(clock)
  await cron(clock, start)
  await cron(clock, await advance(clock, at('2026-10-31T14:30:00Z')))
  await attachCard(clock.customerId, 'pm_card_chargeCustomerFail')
  let now = await advance(clock, at('2026-11-01T03:00:00Z'))
  await syncCustomer(clock.customerId, now)
  await report('11/1。期待: 200 円の請求が失敗・past_due', clock)

  for (const day of ['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']) {
    now = await advance(clock, at(`${day}T03:00:00Z`))
    await syncCustomer(clock.customerId, now)
    log(`${day} の状態`, (await row(userId))?.status)
  }
  await report('11/29。期待: リトライが尽きて canceled', clock)
}

/** 7: 3D セキュアを求めるカードで月次の請求（オフセッション） */
async function sca() {
  const start = at('2026-10-15T03:00:00Z')
  const userId = await createUser('sca')
  await setHistory(userId, [['2026-10-01T00:00:00Z', 12]])
  const clock = await createClockCustomer(userId, 'sca', start, 'pm_card_authenticationRequired')
  const subscription = await subscribe(clock)
  log('申し込み直後の status', subscription.status)
  await cron(clock, start)
  await cron(clock, await advance(clock, at('2026-10-31T14:30:00Z')))
  await syncCustomer(clock.customerId, await advance(clock, at('2026-11-01T03:00:00Z')))
  await report(
    '11/1。3DS を求められて支払えない（期待: past_due・invoice.payment_action_required）',
    clock
  )
}

/**
 * 8: 退会（`cancelSubscriptionsForAccountDeletion`）→ 期間の終わりにその人数で請求。
 * 退会は実時間で送るので、クロックは今に合わせる。`portal` を付けると、先にポータルの形で解約してから退会する
 */
async function deletion(afterPortalCancel: boolean) {
  const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 120_000)
  const label = afterPortalCancel ? 'deletion-portal' : 'deletion'
  const userId = await createUser(label)
  await setHistory(userId, [[new Date(start.getTime() - 86400_000).toISOString(), 13]])
  const clock = await createClockCustomer(userId, label, start)
  const subscription = await subscribe(clock)
  await syncCustomer(clock.customerId, start)
  if (afterPortalCancel) {
    await stripe.subscriptions.update(subscription.id, {
      cancel_at: subscription.items.data[0].current_period_end,
    })
  }
  await cancelSubscriptionsForAccountDeletion(userId)
  const { error } = await db.auth.admin.deleteUser(userId)
  if (error) throw error
  const after = await stripe.subscriptions.retrieve(subscription.id)
  log('退会直後の Subscription', {
    status: after.status,
    cancel_at: after.cancel_at && fromSeconds(after.cancel_at).toISOString(),
    cancel_at_period_end: after.cancel_at_period_end,
  })
  const end = fromSeconds(after.items.data[0].current_period_end)
  await advance(clock, new Date(end.getTime() + 12 * 3600_000))
  const final = await stripe.subscriptions.retrieve(subscription.id)
  log('期間の終わりのあと', final.status)
  for (const line of await invoices(clock)) console.log(`  ${line}`)
  console.log('  期待: 13 人 = 300 円')
}

/** Stripe で Customer を消す（Subscription は即時に解約される）→ 同期で写しが消え、有料のまま残らない */
async function deletedCustomer() {
  const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 120_000)
  const userId = await createUser('deleted-customer')
  const clock = await createClockCustomer(userId, 'deleted-customer', start)
  await subscribe(clock)
  await syncCustomer(clock.customerId, start)
  log('申し込み後', await row(userId))
  await stripe.customers.del(clock.customerId)
  await syncCustomer(clock.customerId, start)
  log('Customer を消したあと（期待: null）', await row(userId))
}

/** 有料プランを解約していなければ退会を断り、解約したあとなら退会できる */
async function deletionBlocked() {
  const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 120_000)
  const userId = await createUser('deletion-blocked')
  await setHistory(userId, [[new Date(start.getTime() - 86400_000).toISOString(), 12]])
  const clock = await createClockCustomer(userId, 'deletion-blocked', start)
  const subscription = await subscribe(clock)
  await syncCustomer(clock.customerId, start)
  const first = await cancelSubscriptionsForAccountDeletion(userId).then(
    () => '通った',
    (error: unknown) => (error instanceof PlanStillActiveError ? '断られた' : String(error))
  )
  log('解約前の退会（期待: 断られた）', first)
  // ポータルでの解約と同じ形（cancel_at = 期間の終わり）。Webhook が届く前に退会しても、取り直して判定する
  await stripe.subscriptions.update(subscription.id, {
    cancel_at: subscription.items.data[0].current_period_end,
  })
  const second = await cancelSubscriptionsForAccountDeletion(userId).then(
    () => '通った',
    (error: unknown) => (error instanceof PlanStillActiveError ? '断られた' : String(error))
  )
  log('解約後の退会（期待: 通った）', second)
}

const scenarios: Record<string, () => Promise<void>> = {
  'deletion-blocked': deletionBlocked,
  'deleted-customer': deletedCustomer,
  monthly,
  trial,
  cancel,
  failure,
  sca,
  deletion: () => deletion(false),
  'deletion-portal': () => deletion(true),
}

const name = process.argv[2]
const scenario = name ? scenarios[name] : undefined
if (!scenario) {
  console.error(`シナリオ: ${Object.keys(scenarios).join(' / ')}`)
  process.exit(1)
}
scenario().catch((error) => {
  console.error(error)
  process.exit(1)
})

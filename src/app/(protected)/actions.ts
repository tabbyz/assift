'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { authErrorMessage } from '@/lib/auth/authErrorMessage'
import { requestOrigin } from '@/lib/auth/requestOrigin'
import { throwIfStaffCapError } from '@/lib/billing/limit'
import { priceIncreaseQuote, raisesPrice } from '@/lib/billing/staffAddition'
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe'
import { lastDayBefore, trialEndFrom, trialLastDay } from '@/lib/billing/trial'
import {
  getBillingOverview,
  getConfirmablePeriodPeak,
  getStripeCustomerId,
} from '@/lib/queries/billing'
import { addingSchema, staffCapSchema } from '@/lib/validation/billing'
import { createClient } from '@/utils/supabase/server'

/**
 * ログアウト（この端末のセッションだけ）。遷移はクライアントが行う（004 §3.2）。
 *
 * ヘッダーのアカウントメニューとアカウント画面の両方から呼ぶので、
 * ルート個別ではなく (protected) グループ共通の Action として置く。
 */
export async function logout(): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) fail(authErrorMessage(error))
    return { redirectTo: '/login' }
  })
}

/*
 * 以下は課金（019）。在籍スタッフの上限の案内（§5.3・§5.4）とカードの更新（支払い失敗の帯）は
 * 店舗の画面・スタッフの設定・初期設定・プランの画面から呼ぶので、(protected) グループ共通の Action として置く。
 * Stripe の Customer は入力から受け取らず、ログイン中の利用者の `profiles.stripe_customer_id` だけを使う
 */

const TRIAL_MESSAGES: { match: string; message: string }[] = [
  { match: 'start_trial: already used', message: '無料トライアルはすでにご利用済みです' },
  { match: 'start_trial: subscribed', message: '有料プランをご利用中です' },
]

export type UpgradeOffer = {
  /** 上限で止まったときの上限（null = 上限なし。別タブでトライアルを始めた後など）。有料プランは上限人数（019 §13） */
  limit: number | null
  kind: 'subscription' | 'trial' | 'manual' | 'free'
  trialAvailable: boolean
  /** いまトライアルを始めた場合の最終日（`YYYY-MM-DD`） */
  trialLastDay: string
  /** 申し込みを受け付けられるか（Stripe が未設定なら false） */
  billingAvailable: boolean
  /** 全店舗の在籍スタッフの合計（足す前） */
  activeStaffCount: number
  /** 旧料金のクーポン（50）。0 = なし。「最大 ◯円」に効かせる */
  discountPercent: number
  /**
   * 足すと今の請求期間の料金が上がるときの見込み（019 §13.5）。上がらない・見込みを出せない（トライアル中・切り替え待ち）なら null
   */
  priceQuote: { currentYen: number; nextYen: number; periodLastDay: string } | null
}

/**
 * 上限で止まったとき・料金が上がる追加の確認のモーダルの中身（どの画面からでも開けるよう Action で読む）。
 * `adding` は何人足そうとしたか（初期設定は名前の数、1 人ずつの追加・復帰は 1）
 */
export async function getUpgradeOffer(
  input: { adding?: number } = {}
): Promise<ActionResult<UpgradeOffer>> {
  return runAction(async () => {
    const adding = addingSchema.parse(input.adding ?? 1)
    const user = await requireUser()
    const overview = await getBillingOverview(user.id)
    const discountPercent = overview.subscription?.discount_percent ?? 0
    const periodPeak = await getConfirmablePeriodPeak(user.id, overview)
    const after = overview.activeStaffCount + adding
    const priceQuote =
      periodPeak !== null && overview.subscription && raisesPrice(periodPeak, after)
        ? {
            ...priceIncreaseQuote({ periodPeak, after, discountPercent }),
            periodLastDay: lastDayBefore(new Date(overview.subscription.current_period_end)),
          }
        : null
    return {
      limit: overview.limit,
      kind: overview.entitlement.kind,
      trialAvailable: overview.trialAvailable,
      trialLastDay: trialLastDay(trialEndFrom(new Date())),
      billingAvailable: isStripeConfigured(),
      activeStaffCount: overview.activeStaffCount,
      discountPercent,
      priceQuote,
    }
  })
}

/**
 * 有料プランの在籍スタッフの上限を変える（019 §13.4）。在籍数より下にはできない（RPC が断る）。
 * 請求には使わない（請求は実人数の最大）。上限で止まったときの引き上げと「プランとお支払い」の変更が呼ぶ
 */
export async function setStaffCap(input: {
  staffCap: number | ''
}): Promise<ActionResult<{ staffCap: number }>> {
  return runAction(async () => {
    const staffCap = staffCapSchema.parse(input.staffCap)
    await requireUser()
    const supabase = await createClient()
    const { error } = await supabase.rpc('set_staff_cap', { p_cap: staffCap })
    if (error) {
      throwIfStaffCapError(error)
      throw error
    }
    revalidatePath('/', 'layout')
    return { staffCap }
  })
}

/** トライアルを始める（§7）。1 アカウント 1 回。期間は DB が決める（`private.trial_end_from()`） */
export async function startTrial(): Promise<ActionResult<{ trialLastDay: string }>> {
  return runAction(async () => {
    await requireUser()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('start_trial')
    if (error) {
      const known = TRIAL_MESSAGES.find((entry) => error.message.includes(entry.match))
      if (known) fail(known.message)
      throw error
    }
    revalidatePath('/', 'layout')
    return { trialLastDay: trialLastDay(new Date(data)) }
  })
}

/** カスタマーポータル（お支払い方法・請求書・解約）を開く */
export async function openPortal(): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const user = await requireUser()
    if (!isStripeConfigured())
      fail('現在お支払いの管理画面を開けません。時間をおいてお試しください')
    const customerId = await getStripeCustomerId(user.id)
    if (!customerId) fail('お支払いの情報がありません')

    const origin = await requestOrigin()
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      locale: 'ja',
      return_url: `${origin}/account/billing`,
    })
    return { redirectTo: session.url }
  })
}

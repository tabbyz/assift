import { isTrialActive } from '@/lib/billing/trial'

/**
 * 終わった（もう請求に戻らない）サブスクリプションの状態。`unpaid` / `incomplete` / `paused` は
 * 無料プラン扱いでも、支払われれば `active` に戻る（019 §8.2 の救済）ので含めない
 */
const ENDED_STATUSES = ['canceled', 'incomplete_expired'] as const

/**
 * 管理画面からトライアル（`profiles.trial_end`）を変えてよいか（020 §7）。画面のボタンと Action の両方が使う。
 *
 * 請求に戻りうる契約がある人は変えない。`trial_end` は請求の区間の始まりに使われ（`peakWindow`）、
 * null にすると次の同期が入れ直す（`sync.ts`）ので、触ると請求額が変わる。
 * 有料プランとして使える状態（active / trialing / past_due）だけでなく、`active` に戻りうる状態も止める
 */
export function canEditTrial(subscriptionStatus: string | null): boolean {
  return (
    subscriptionStatus === null ||
    (ENDED_STATUSES as readonly string[]).includes(subscriptionStatus)
  )
}

/** 「今すぐ終える」を出すか。トライアル中のときだけ */
export function canEndTrialNow(
  subscriptionStatus: string | null,
  trialEnd: Date | null,
  now: Date
): boolean {
  return canEditTrial(subscriptionStatus) && isTrialActive(trialEnd, now)
}

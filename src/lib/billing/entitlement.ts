import { FREE_STAFF_LIMIT } from './pricing'
import { isTrialActive } from './trial'

/**
 * 在籍スタッフの上限を決める権利（019 §5.1）。SQL の `private.staff_limit()` と同じ規則を、上から順に当てはめる。
 * 画面（プランの表示・上限の案内・ロック）が使う。書き込みを止めるのは DB の門番（§5.3）
 */

/** 上限なしで使えるサブスクリプションの状態。past_due（支払いのリトライ中）も使えるまま */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'] as const

export type Entitlement =
  | { kind: 'subscription' }
  | { kind: 'trial'; trialEnd: Date }
  | { kind: 'manual'; limit: number }
  | { kind: 'free'; limit: number }

export type EntitlementInput = {
  /** billing_subscriptions.status。行が無ければ null */
  subscriptionStatus: string | null
  /** profiles.trial_end */
  trialEnd: Date | null
  /** profiles.max_staffs_count（個別契約） */
  manualLimit: number | null
  now: Date
}

export function isEntitledStatus(status: string | null): boolean {
  return status !== null && (ENTITLED_STATUSES as readonly string[]).includes(status)
}

export function entitlement(input: EntitlementInput): Entitlement {
  if (isEntitledStatus(input.subscriptionStatus)) return { kind: 'subscription' }
  if (input.trialEnd && isTrialActive(input.trialEnd, input.now)) {
    return { kind: 'trial', trialEnd: input.trialEnd }
  }
  if (input.manualLimit !== null && input.manualLimit > FREE_STAFF_LIMIT) {
    return { kind: 'manual', limit: input.manualLimit }
  }
  return { kind: 'free', limit: FREE_STAFF_LIMIT }
}

/** 在籍スタッフの上限。null = 上限なし */
export function staffLimit(value: Entitlement): number | null {
  return value.kind === 'manual' || value.kind === 'free' ? value.limit : null
}

/** 在籍が上限を超えているか（ロックの条件。019 §5.4） */
export function isOverLimit(value: Entitlement, activeStaffCount: number): boolean {
  const limit = staffLimit(value)
  return limit !== null && activeStaffCount > limit
}

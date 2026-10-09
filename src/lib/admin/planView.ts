import { entitlement, isOverLimit, staffLimit } from '@/lib/billing/entitlement'
import { trialLastDay } from '@/lib/billing/trial'
import { formatYearMonthDay } from '@/lib/calendar/dateString'

/**
 * 管理画面に出す「契約の状態」と「今の上限とその理由」（020 §6.1・§8）。
 * 規則は `entitlement()`（SQL の `private.staff_limit` と同じ）をそのまま使い、ここでは文にするだけ
 */
export type AdminPlanInput = {
  subscriptionStatus: string | null
  trialEnd: string | null
  manualLimit: number | null
  staffCap: number | null
  activeStaffCount: number
}

export type AdminPlanView = {
  /** 一覧の列（有料プラン / トライアル / 個別契約 / 無料） */
  label: string
  /** 「上限なし」「10人まで」 */
  limitLabel: string
  /** 上限の理由（詳細） */
  reason: string
  /** 在籍が上限を超えてロック中か（isOverLimit。有料プランの上限人数ではロックしない） */
  locked: boolean
}

export function adminPlanView(input: AdminPlanInput, now: Date): AdminPlanView {
  const value = entitlement({
    subscriptionStatus: input.subscriptionStatus,
    trialEnd: input.trialEnd ? new Date(input.trialEnd) : null,
    manualLimit: input.manualLimit,
    staffCap: input.staffCap,
    now,
  })
  const limit = staffLimit(value)
  const limitLabel = limit === null ? '上限なし' : `${limit}人まで`
  const locked = isOverLimit(value, input.activeStaffCount)

  switch (value.kind) {
    case 'subscription':
      return {
        label: '有料プラン',
        limitLabel,
        reason:
          value.cap === null
            ? `有料プランを契約中（${input.subscriptionStatus}）。上限人数がまだ無いので、同期が埋めるまで上限なし`
            : `有料プランを契約中（${input.subscriptionStatus}）。上限は利用者が選んだ上限人数`,
        locked,
      }
    case 'trial': {
      const lastDay = formatYearMonthDay(trialLastDay(value.trialEnd))
      return {
        label: `トライアル（${lastDay}まで）`,
        limitLabel,
        reason: `トライアル中（${lastDay}まで）は上限なし`,
        locked,
      }
    }
    case 'manual':
      return { label: '個別契約', limitLabel, reason: '個別契約の上限', locked }
    case 'free':
      return { label: '無料', limitLabel, reason: '無料プランの上限', locked }
  }
}

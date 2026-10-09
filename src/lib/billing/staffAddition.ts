import type { Entitlement } from './entitlement'
import { FREE_STAFF_LIMIT, billableStaffCount, monthlyPriceYen } from './pricing'

/**
 * スタッフを増やす操作（追加・復帰・初期設定）を書き込む前に見る判定（019 §13.5）。純関数。
 * 有料プランだけが対象（無料・個別契約の上限は DB の門番が止め、トライアルは上限も請求も無い）。
 * **上限人数を料金より先に見る**: 逆だと「料金を確認 → やり直したら上限で止まる → また確認」と 2 回続く
 */
export type StaffAdditionInput = {
  entitlement: Entitlement
  activeStaffCount: number
  adding: number
  /** 今の請求期間の最大人数（ここまで）。null = 足しても今の期間の請求が変わらない（トライアル中・切り替え待ち） */
  periodPeak: number | null
  /** 利用者が料金の確認で受け入れた「足したあとの人数」 */
  acknowledgedPeak?: number
}

export type StaffAdditionCheck = 'ok' | 'staff_limit' | 'price_increase'

export function checkStaffAddition(input: StaffAdditionInput): StaffAdditionCheck {
  if (input.entitlement.kind !== 'subscription') return 'ok'
  const after = input.activeStaffCount + input.adding
  const { cap } = input.entitlement
  if (cap !== null && after > cap) return 'staff_limit'
  if (input.periodPeak === null || !raisesPrice(input.periodPeak, after)) return 'ok'
  if (input.acknowledgedPeak !== undefined && after <= input.acknowledgedPeak) return 'ok'
  return 'price_increase'
}

/**
 * 足したあとの人数で今の期間の料金が上がるか。最大人数を超えても、無料の 10 人以内なら上がらない
 * （人数ではなく料金のかかる人数で比べる。割引は 1 人あたりの額を変えるだけなので比べ方は同じ）
 */
export function raisesPrice(periodPeak: number, after: number): boolean {
  return billableStaffCount(after) > billableStaffCount(periodPeak)
}

/**
 * 今の期間の料金を変えずに、あと何人足せるか（スタッフの設定・プランの画面の案内）。
 * 最大人数か無料の人数の大きいほうまでは料金が変わらない
 */
export function unchangedHeadroom(activeStaffCount: number, periodPeak: number): number {
  return Math.max(0, Math.max(periodPeak, FREE_STAFF_LIMIT) - activeStaffCount)
}

/** 料金の見込み（今 → 足したあと）。最大人数で請求するので、最大人数を超えた分だけ上がる */
export function priceIncreaseQuote(input: {
  periodPeak: number
  after: number
  discountPercent: number
}): { currentYen: number; nextYen: number } {
  return {
    currentYen: monthlyPriceYen(input.periodPeak, input.discountPercent),
    nextYen: monthlyPriceYen(Math.max(input.periodPeak, input.after), input.discountPercent),
  }
}

/** 料金を変えずに足せる人数の案内。足せる余地が無ければ null */
export function unchangedHeadroomMessage(
  activeStaffCount: number,
  periodPeak: number
): string | null {
  const headroom = unchangedHeadroom(activeStaffCount, periodPeak)
  if (headroom === 0) return null
  return periodPeak > FREE_STAFF_LIMIT
    ? `今の請求期間はすでに ${periodPeak} 人分の料金なので、あと ${headroom} 人までは追加しても料金は変わりません。`
    : `あと ${headroom} 人までは無料の範囲です（${FREE_STAFF_LIMIT + 1} 人目から料金がかかります）。`
}

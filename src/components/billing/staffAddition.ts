import type { ActionFailure } from '@/lib/actions/result'
import { openPriceIncreaseModal } from './PriceIncreaseModal'
import { openStaffLimitModal } from './StaffLimitModal'

/** モーダルで決めたあとに、元の操作（追加・復帰・初期設定の完了）をやり直す。確認した人数を Action に渡す */
export type StaffAdditionRetry = (options: { acknowledgedPeak?: number }) => void

/**
 * スタッフを増やす Action の失敗のうち、モーダルで続けられるものを開く（019 §5.3・§13）。開いたら true。
 * - `staff_limit`: 上限で止まった（無料ならトライアル・申し込み、有料なら上限の引き上げ）
 * - `price_increase`: 今の請求期間の料金が上がるので確認する
 */
export function openStaffAdditionModal(
  result: ActionFailure,
  options: { adding: number; retry: StaffAdditionRetry }
): boolean {
  if (result.code === 'staff_limit') {
    openStaffLimitModal(options)
    return true
  }
  if (result.code === 'price_increase') {
    openPriceIncreaseModal(options)
    return true
  }
  return false
}

import 'server-only'
import { getBillingOverview, getConfirmablePeriodPeak } from '@/lib/queries/billing'
import { priceIncreaseError, staffLimitError } from './limit'
import { checkStaffAddition } from './staffAddition'

/**
 * スタッフを増やす Action（追加・復帰・初期設定）が書き込む前に呼ぶ（019 §13.5）。有料プランのときだけ、
 * 上限人数を超えるなら `code: 'staff_limit'`、今の期間の料金が上がるなら `code: 'price_increase'` で止める。
 * 無料・トライアルは課金の状態を読むだけで返す（無料の上限は DB の門番が止める。読み取りは 3 本を並行に 1 往復）。
 * 門番は同時の追加への守りとしてそのまま残る（ここは画面の親切で、上限の最後の守りではない）
 */
export async function ensureStaffAddition(
  userId: string,
  input: { adding: number; acknowledgedPeak?: number }
): Promise<void> {
  const overview = await getBillingOverview(userId)
  if (overview.entitlement.kind !== 'subscription') return

  const check = checkStaffAddition({
    entitlement: overview.entitlement,
    activeStaffCount: overview.activeStaffCount,
    adding: input.adding,
    periodPeak: await getConfirmablePeriodPeak(userId, overview),
    acknowledgedPeak: input.acknowledgedPeak,
  })
  if (check === 'staff_limit') throw staffLimitError()
  if (check === 'price_increase') throw priceIncreaseError()
}

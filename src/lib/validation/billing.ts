import { z } from 'zod'
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'

/**
 * 有料プランの在籍スタッフの上限（019 §13.4）。SQL の `profiles.staff_cap` の check と `public.set_staff_cap()` と同じ。
 * 下限は無料の人数 + 1（10 人以下なら無料で足りる）、上限は桁の打ち間違いを止めるため
 */
export const STAFF_CAP_MIN = FREE_STAFF_LIMIT + 1
export const STAFF_CAP_MAX = 1000

const STAFF_CAP_RANGE_ERROR = `上限は${STAFF_CAP_MIN}〜${STAFF_CAP_MAX}人で入力してください`

/** `NumberInput` の空欄（`''`）が届くので leaf に `{ error }` を付ける（AGENTS.md） */
export const staffCapSchema = z
  .int({ error: '上限の人数を入力してください' })
  .min(STAFF_CAP_MIN, { error: STAFF_CAP_RANGE_ERROR })
  .max(STAFF_CAP_MAX, { error: STAFF_CAP_RANGE_ERROR })

/** 料金が上がる追加を確かめた「足したあとの人数」（019 §13.5）。省略 = まだ確かめていない */
export const acknowledgedPeakSchema = z
  .int({ error: '入力内容が正しくありません' })
  .min(0, { error: '入力内容が正しくありません' })
  .optional()

/** 上限で止まったとき・料金の確認のモーダルが渡す「何人足そうとしたか」 */
export const addingSchema = z
  .int({ error: '入力内容が正しくありません' })
  .min(1, { error: '入力内容が正しくありません' })
  .max(STAFF_CAP_MAX, { error: '入力内容が正しくありません' })

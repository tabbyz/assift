import { z } from 'zod'
import { requiredNumsSchema, REQUIRED_NUM_MAX, REQUIRED_NUM_MIN } from '@/lib/patterns/requiredNums'
import { dateStringSchema, dateTermShape, refineTerm } from './date'
import { patternIdSchema } from './patterns'
import { tenantIdSchema } from './tenants'

const RANGE_ERROR = {
  error: `必要人数は${REQUIRED_NUM_MIN}〜${REQUIRED_NUM_MAX}で入力してください`,
}

/**
 * 日別モーダルの 1 マス。**空欄（`''`）は「この日の上書きを消す」**（= 基本の人数に戻す。015 §3.2）。
 * 0 人にしたいときは `0` を入れる。`null` を混ぜず `''` のままにするのは、`NumberInput` が空欄で返す値だから。
 */
const numSchema = z.union(
  [
    z.literal(''),
    z
      .int({ error: '必要人数を入力してください' })
      .min(REQUIRED_NUM_MIN, RANGE_ERROR)
      .max(REQUIRED_NUM_MAX, RANGE_ERROR),
  ],
  // union は枝のエラーをまとめてしまうので、ここで日本語を付ける（`toActionError` は先頭 issue を出す）
  RANGE_ERROR
)

/** 日別の必要人数。キーは勤務パターンの id */
export const saveRequiredNumsSchema = z.object({
  tenantId: tenantIdSchema,
  date: dateStringSchema,
  nums: z.record(patternIdSchema, numSchema),
})

/**
 * 表示期間の「この日だけ変えた」分を元に戻す（015 §3.6）。
 * 期間の規則（両端を含めて 31 日以内）は `refineTerm` が持つ（008 §3.8）。
 */
export const resetRequiredNumsSchema = refineTerm(
  z.object({ tenantId: tenantIdSchema, ...dateTermShape })
)

/**
 * `設定 > 必要人数` の行列 1 枚（015 §3.4）。勤務 id → 曜日 → 人数。
 * **キーが無い曜日は「まだ決めていない」**（空欄）。各マスの検査は `requiredNumsSchema` が持つ。
 */
export const saveDefaultRequiredNumsSchema = z.object({
  tenantId: tenantIdSchema,
  nums: z
    .record(patternIdSchema, requiredNumsSchema)
    .refine((nums) => Object.keys(nums).length > 0, { error: '勤務が見つかりません' }),
})

import { z } from 'zod'
import { REQUIRED_NUM_MAX, REQUIRED_NUM_MIN } from '@/lib/patterns/requiredNums'
import { dateStringSchema, dateTermShape, refineTerm } from './date'
import { patternIdSchema } from './patterns'
import { tenantIdSchema } from './tenants'

const RANGE_ERROR = {
  error: `必要人数は${REQUIRED_NUM_MIN}〜${REQUIRED_NUM_MAX}で入力してください`,
}

/**
 * 日別モーダルの 1 マス。`NumberInput` の空欄（`''`）は v1 と同じく 0 として扱う。
 * `z.preprocess` で 0 に寄せてから整数として検査する（leaf の `{ error }` は 006 §3.12 の規約）。
 */
const numSchema = z.preprocess(
  (value) => (value === '' ? 0 : value),
  z
    .int({ error: '必要人数を入力してください' })
    .min(REQUIRED_NUM_MIN, RANGE_ERROR)
    .max(REQUIRED_NUM_MAX, RANGE_ERROR)
)

/** 日別の必要人数。キーは勤務パターンの id */
export const saveRequiredNumsSchema = z.object({
  tenantId: tenantIdSchema,
  date: dateStringSchema,
  nums: z.record(patternIdSchema, numSchema),
})

/**
 * 表示期間に一括でデフォルト人数をセットする（007 §3.6）。
 * 期間の規則（両端を含めて 31 日以内）は `refineTerm` が持つ（008 §3.8）。
 */
export const setDefaultRequiredNumsSchema = refineTerm(
  z.object({ tenantId: tenantIdSchema, ...dateTermShape })
)

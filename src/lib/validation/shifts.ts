import { z } from 'zod'
import { patternIdSchema } from './patterns'
import { staffIdSchema } from './staffs'
import {
  dateStringSchema,
  dateTermShape,
  MAX_TERM_DAYS,
  refineTerm,
  termIssue,
  type TermIssue,
} from './date'
import { tenantIdSchema } from './tenants'

/**
 * セルのアサイン（007 §5.5）。`patternId` が null なら「空」（アサイン解除）。
 * 選択可能なパターンかは検査しない（v1 と同じ。テナント境界は RLS と RPC が見る）。
 */
export const assignShiftSchema = z.object({
  tenantId: tenantIdSchema,
  staffId: staffIdSchema,
  date: dateStringSchema,
  patternId: patternIdSchema.nullable(),
  fixed: z.boolean({ error: '下書き / 確定の指定が正しくありません' }),
})

/**
 * 一括操作の対象範囲（008 §5.5）。`staffId` を渡すとそのスタッフだけ、省略すると表示期間の全員。
 * 期間の規則は `refineTerm`（両端を含めて 31 日以内）。
 */
export const clearDraftShiftsSchema = refineTerm(
  z.object({ tenantId: tenantIdSchema, ...dateTermShape, staffId: staffIdSchema.nullish() })
)

/** すべて確定 / すべて下書きに戻す */
export const bulkShiftsSchema = refineTerm(
  z.object({
    tenantId: tenantIdSchema,
    ...dateTermShape,
    staffId: staffIdSchema.nullish(),
    fixed: z.boolean({ error: '下書き / 確定の指定が正しくありません' }),
  })
)

/** デフォルト勤務パターンを表示期間にセットする（008 §3.5） */
export const setDefaultPatternsSchema = refineTerm(
  z.object({ tenantId: tenantIdSchema, ...dateTermShape })
)

/**
 * コピー元の期間の規則の文言。UI（送信前の表示）とサーバー（Zod）で同じものを使う。
 * `termIssue` の判定は共通、文言だけこの場面のもの。
 */
export const COPY_TERM_MESSAGES: Record<TermIssue, string> = {
  order: 'コピー元の終了日は開始日以降にしてください',
  too_long: `コピー元の期間は最大${MAX_TERM_DAYS}日間です`,
}

/**
 * シフトコピー（008 §3.6）。コピー元の上限は表示期間と同じ「両端を含めて 31 日」。
 * v1 は 31 日を超えると黙って切っていたが、v2 は拒否する。
 */
export const copyShiftsSchema = z
  .object({
    tenantId: tenantIdSchema,
    fromStart: dateStringSchema,
    fromEnd: dateStringSchema,
    toStart: dateStringSchema,
    patternIds: z
      .array(patternIdSchema, { error: 'コピー対象の勤務パターンを選択してください' })
      .min(1, { error: 'コピー対象の勤務パターンを選択してください' }),
  })
  .check((ctx) => {
    const issue = termIssue(ctx.value.fromStart, ctx.value.fromEnd)
    if (issue) {
      ctx.issues.push({ code: 'custom', message: COPY_TERM_MESSAGES[issue], input: ctx.value })
    }
  })

/**
 * コピーモーダルの前回条件（localStorage）。
 * 壊れていれば既定値に戻すだけなので、`patternIds` は uuid かどうかまでは見ない
 * （消えたパターン / 他店舗のパターンは表示時に現在のパターン一覧で絞る）。
 */
export const copyConditionsSchema = z.object({
  fromStart: dateStringSchema,
  fromEnd: dateStringSchema,
  toStart: dateStringSchema,
  patternIds: z.array(z.string()),
})

export type CopyConditions = z.infer<typeof copyConditionsSchema>

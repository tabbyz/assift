import { z } from 'zod'
import { dateStringSchema } from './date'
import { tenantIdSchema } from './tenants'

/** v1 の Event::NOTE_MAX_LENGTH。DB の CHECK 制約と同じ */
export const DATE_NOTE_MAX_LENGTH = 12

/** 日付メモ（v1 events）。空文字は削除の意味なので min は付けない */
export const saveDateNoteSchema = z.object({
  tenantId: tenantIdSchema,
  date: dateStringSchema,
  note: z
    .string({ error: 'メモの形式が正しくありません' })
    .trim()
    .max(DATE_NOTE_MAX_LENGTH, {
      error: `メモは${DATE_NOTE_MAX_LENGTH}文字以下で入力してください`,
    }),
})

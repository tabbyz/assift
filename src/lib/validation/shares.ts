import { z } from 'zod'
import { dateTermShape, refineTerm } from './date'
import { tenantIdSchema } from './tenants'

export const SHARE_NOT_FOUND_MESSAGE = '共有が見つかりません'

/** 発行ボタンの disabled 文言と Action の失敗文言に同じ文字列を使う（009 §5.5） */
export const SHARE_EXPIRED_MESSAGE = '過去のシフト表は共有できません'

/** 共有 id。`z.uuid()` ではなく `z.guid()`（AGENTS.md。seed / pgTAP の id を弾かせない） */
export const shareIdSchema = z.guid({ error: SHARE_NOT_FOUND_MESSAGE })

/**
 * 共有の発行（009 §5.6）。期間は表示中のもの（両端を含めて最長 31 日）。
 * v1 は 31 日を超えると黙って切っていたが、v2 は `refineTerm` で拒否する。
 */
export const createShareSchema = refineTerm(
  z.object({ tenantId: tenantIdSchema, ...dateTermShape })
)

export const deleteShareSchema = z.object({ tenantId: tenantIdSchema, shareId: shareIdSchema })

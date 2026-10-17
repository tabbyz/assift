/**
 * サイト共通のメタデータの文言（028）。root layout（`description` → `og:description`）・manifest・公開シフト表（page と not-found）が読む。
 * 人数は LP の料金の欄と同じ定数から埋める
 */
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'

export const SITE_NAME = 'assift'

export const SITE_DESCRIPTION = `アルバイト・パートのシフト表を、スマホでもパソコンでも。スタッフの都合や勤務の上限を守ってAIが下書きを作り、できた表はURLでスタッフに共有できます。スタッフ${FREE_STAFF_LIMIT}人まで無料。`

/**
 * 公開シフト表の説明。店長が LINE のグループに共有 URL を貼ったとき、スタッフに LP の宣伝文を出さない（028 §2.3-3）。
 * 店舗名は入れない（009 §3）
 */
export const SHARE_DESCRIPTION = `${SITE_NAME} で作ったシフト表です。`

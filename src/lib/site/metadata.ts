/**
 * サイト共通のメタデータの文言（028）。root layout（`description` → `og:description`）と manifest が読む。
 * 人数は LP の料金の欄と同じ定数から埋める
 */
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'

export const SITE_NAME = 'assift'

export const SITE_DESCRIPTION = `アルバイト・パートのシフト表を、スマホでもパソコンでも。スタッフの都合や勤務の上限を守ってAIが下書きを作り、できた表はURLでスタッフに共有できます。スタッフ${FREE_STAFF_LIMIT}人まで無料。`

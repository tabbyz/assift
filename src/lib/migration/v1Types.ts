import { z } from 'zod'
import { isDateString } from '@/lib/calendar/dateString'

/**
 * v1 のエクスポート（`scripts/migrate-v1/v1/v2_export.rake`）が書く JSONL の 1 行の形（021 §5.1・§6.2）。
 *
 * rake と **形を 1 つに決める**: ここの 1 型 = JSONL の 1 行。インポートは読み込み時に 1 行ずつ parse し、
 * 形が違えばその場で止まる（変換の途中で undefined に出会うより先に、どの行がどう違うかが分かる）。
 *
 * - v1 で nullable の列は `nullable()` で受ける（§7 共通。v1 の列はほぼすべて nullable で、FK があっても NULL は通る）
 * - 日付は `YYYY-MM-DD`、時刻は ISO 8601 の UTC（Ruby の `utc.iso8601(6)`）
 * - `shift_cycle` / `kind` は enum の名前（整数を v2 で読み替えない）
 * - YAML 列（`staffs.*` / `patterns.default_required_nums`）は Ruby が復元した配列 / Hash。中身の型は
 *   v1 が `to_i` していないので `unknown` で受け、変換（`transform.ts`）が数値に寄せる
 */

const id = z.int().positive()
/**
 * 親を指す列。v1 では nullable（§7 共通の `parent_missing`）。
 * 0 や負も受ける: `shifts_controller#assign` は `params[:staff_id].to_i` をそのまま保存し（FK も無い）、
 * 無い id は変換が `parent_missing` で捨てる。ここで弾くと 1 行でインポートが止まる
 */
const parentId = z.int().nullable()

const dateString = z
  .string()
  .refine(isDateString, { error: 'YYYY-MM-DD の実在する日付ではありません' })
/** `date` が NULL の列（`required_nums.date`）は、形が壊れていても止めずに変換で捨てる（§7.7） */
const dateOrInvalid = z.string().nullable()
const timestamp = z.iso.datetime({ error: 'ISO 8601（UTC）の時刻ではありません' })
const timestampOrNull = timestamp.nullable()

export const v1UserSchema = z.object({
  id,
  email: z.string(),
  encrypted_password: z.string(),
  /** `user.valid_password?(user.email)`。代理承認の初期パスワード（§7.1） */
  password_is_email: z.boolean(),
  confirmed_at: timestampOrNull,
  invitation_accepted_at: timestampOrNull,
  invitation_token: z.string().nullable(),
  provider: z.string().nullable(),
  uid: z.string().nullable(),
  sign_in_count: z.int().min(0),
  current_sign_in_at: timestampOrNull,
  locked_at: timestampOrNull,
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  trial_end: timestampOrNull,
  max_staffs_count: z.int(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const v1TenantSchema = z.object({
  id,
  /** 22 文字のトークン。v2 の id はこれから導出する（001 §3.1） */
  uuid: z.string().min(1),
  user_id: parentId,
  name: z.string().nullable(),
  shift_cycle: z.enum(['month', 'half_month', 'two_week', 'week']),
  start_of_week: z.int(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const v1StaffSchema = z.object({
  id,
  tenant_id: parentId,
  name: z.string().nullable(),
  position: z.int().nullable(),
  disabled: z.boolean(),
  max_work_week: z.int(),
  /** NULL はモデルが `[]` にしている（§5.1・§13-3） */
  available_wdays: z.array(z.unknown()),
  available_patterns: z.array(z.unknown()),
  default_patterns: z.record(z.string(), z.unknown()),
  created_at: timestamp,
  updated_at: timestamp,
})

export const v1PatternSchema = z.object({
  id,
  tenant_id: parentId,
  name: z.string().nullable(),
  description: z.string().nullable(),
  color_hex: z.string().nullable(),
  kind: z.enum(['workday', 'dayoff']),
  pair_pattern_id: parentId,
  position: z.int().nullable(),
  default_required_nums: z.record(z.string(), z.unknown()),
  created_at: timestamp,
  updated_at: timestamp,
})

export const v1ShiftSchema = z.object({
  id,
  date: dateString,
  pattern_id: parentId,
  /** NULL は自動アサインの一時 Task（§7.6） */
  staff_id: parentId,
  fixed: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const v1RequiredNumSchema = z.object({
  id,
  date: dateOrInvalid,
  pattern_id: parentId,
  num: z.int(),
})

export const v1RestrictionSchema = z.object({
  id,
  tenant_id: parentId,
  /** v1 は string 列。4 種以外は変換で捨てる（§7.8） */
  kind: z.string(),
  days: z.int().nullable(),
  pattern1_id: parentId,
  pattern2_id: parentId,
  position: z.int().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const v1EventSchema = z.object({
  id,
  tenant_id: parentId,
  date: dateString,
  note: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const v1ShareSchema = z.object({
  id,
  tenant_id: parentId,
  code: z.string(),
  start_date: dateString,
  end_date: dateString,
  created_at: timestamp,
})

export type V1User = z.infer<typeof v1UserSchema>
export type V1Tenant = z.infer<typeof v1TenantSchema>
export type V1Staff = z.infer<typeof v1StaffSchema>
export type V1Pattern = z.infer<typeof v1PatternSchema>
export type V1Shift = z.infer<typeof v1ShiftSchema>
export type V1RequiredNum = z.infer<typeof v1RequiredNumSchema>
export type V1Restriction = z.infer<typeof v1RestrictionSchema>
export type V1Event = z.infer<typeof v1EventSchema>
export type V1Share = z.infer<typeof v1ShareSchema>

/** JSONL のファイル名（拡張子なし）→ 行の Zod。rake が書くテーブルの一覧でもある */
export const V1_EXPORT_TABLES = {
  users: v1UserSchema,
  tenants: v1TenantSchema,
  staffs: v1StaffSchema,
  patterns: v1PatternSchema,
  shifts: v1ShiftSchema,
  required_nums: v1RequiredNumSchema,
  restrictions: v1RestrictionSchema,
  events: v1EventSchema,
  shares: v1ShareSchema,
} as const

export type V1ExportTable = keyof typeof V1_EXPORT_TABLES

export const V1_EXPORT_TABLE_NAMES = Object.keys(V1_EXPORT_TABLES) as V1ExportTable[]

/**
 * `manifest.json`。行数は突合に使う。集計（§5.2）は v1 の実態を見るためのもので、形は rake に任せる
 * （足しても止まらないように passthrough）
 */
export const v1ManifestSchema = z
  .object({
    exported_at: timestamp,
    v1_commit: z.string(),
    rails_env: z.string(),
    counts: z.record(z.string(), z.int().min(0)),
    stats: z.record(z.string(), z.unknown()),
  })
  .loose()

export type V1Manifest = z.infer<typeof v1ManifestSchema>

export type V1Export = {
  manifest: V1Manifest
  users: V1User[]
  tenants: V1Tenant[]
  staffs: V1Staff[]
  patterns: V1Pattern[]
  shifts: V1Shift[]
  required_nums: V1RequiredNum[]
  restrictions: V1Restriction[]
  events: V1Event[]
  shares: V1Share[]
}

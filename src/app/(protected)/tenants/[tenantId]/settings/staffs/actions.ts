'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import { reorderRows } from '@/lib/actions/reorder'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { ensureStaffAddition } from '@/lib/billing/addition'
import { throwIfStaffLimit } from '@/lib/billing/limit'
import type { DayKey } from '@/lib/calendar/weekdays'
import { nextPosition } from '@/lib/queries/positions'
import {
  createStaffSchema,
  staffRefSchema,
  updateStaffConditionsSchema,
  updateStaffNameSchema,
  STAFF_NOT_FOUND_MESSAGE,
} from '@/lib/validation/staffs'
import { acknowledgedPeakSchema } from '@/lib/validation/billing'
import type { Database } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
type DefaultPatternRow = Database['public']['Tables']['staff_default_patterns']['Insert']

/**
 * フォームから届く未検証の入力。
 * `maxWorkWeek` に `''` が入りうるのは NumberInput の空欄がそのまま来るため（Zod が日本語で弾く）。
 * 型を `number` に狭めると呼び出し側で嘘の as が要るので、送れる形をそのまま書く。
 */
export type StaffInput = {
  tenantId: string
  name: string
  availableWdays: number[]
  maxWorkWeek: number | ''
  availablePatternIds: string[]
  defaultPatterns: Partial<Record<DayKey, string>>
}

/**
 * スタッフを増やす操作の 2 つ目の引数（019 §13.5）。料金が上がる追加は `code: 'price_increase'` で一度止め、
 * 画面が確認したら「足したあとの人数」を載せてやり直す
 */
export type StaffAdditionOptions = { acknowledgedPeak?: number }

function toConditionColumns(parsed: { availableWdays: number[]; maxWorkWeek: number }) {
  return {
    // 画面のチェック順に依存させない（カレンダーの曜日判定は集合として使う）
    available_wdays: [...parsed.availableWdays].sort((a, b) => a - b),
    max_work_week: parsed.maxWorkWeek,
  }
}

function toDefaultPatternRows(
  tenantId: string,
  staffId: string,
  defaultPatterns: Partial<Record<DayKey, string>>
): DefaultPatternRow[] {
  return Object.entries(defaultPatterns)
    .filter((entry): entry is [DayKey, string] => Boolean(entry[1]))
    .map(([dayKey, patternId]) => ({
      tenant_id: tenantId,
      staff_id: staffId,
      day_key: dayKey,
      pattern_id: patternId,
    }))
}

/**
 * スタッフの関連（選択可能パターン / デフォルト）を入力に合わせる。
 *
 * 差分で書くので、変わっていない行は触らない。トランザクションではないが、途中で失敗しても
 * 同じフォームをもう一度保存すれば収束する（006 §3.4 / §5.2）。
 */
async function syncStaffRelations(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    staffId: string
    currentPatternIds: string[]
    currentDayKeys: string[]
    availablePatternIds: string[]
    defaultPatterns: Partial<Record<DayKey, string>>
  }
) {
  const { tenantId, staffId } = args

  const nextPatternIds = new Set(args.availablePatternIds)
  const currentPatternIds = new Set(args.currentPatternIds)

  const removedPatternIds = args.currentPatternIds.filter((id) => !nextPatternIds.has(id))
  const addedPatternIds = args.availablePatternIds.filter((id) => !currentPatternIds.has(id))

  if (removedPatternIds.length > 0) {
    const { error } = await supabase
      .from('staff_patterns')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('staff_id', staffId)
      .in('pattern_id', removedPatternIds)
    if (error) throw error
  }
  if (addedPatternIds.length > 0) {
    const { error } = await supabase.from('staff_patterns').insert(
      addedPatternIds.map((patternId) => ({
        tenant_id: tenantId,
        staff_id: staffId,
        pattern_id: patternId,
      }))
    )
    if (error) throw error
  }

  const rows = toDefaultPatternRows(tenantId, staffId, args.defaultPatterns)
  const nextDayKeys = new Set(rows.map((row) => row.day_key))
  const removedDayKeys = args.currentDayKeys.filter((key) => !nextDayKeys.has(key))

  if (removedDayKeys.length > 0) {
    const { error } = await supabase
      .from('staff_default_patterns')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('staff_id', staffId)
      .in('day_key', removedDayKeys)
    if (error) throw error
  }
  if (rows.length > 0) {
    const { error } = await supabase
      .from('staff_default_patterns')
      .upsert(rows, { onConflict: 'staff_id,day_key' })
    if (error) throw error
  }
}

/**
 * スタッフを作成する。v1 の新規フォームは全パターンにチェックが入った状態なので、
 * 画面から渡ってくる `availablePatternIds` をそのまま結び付ける。
 */
export async function createStaff(
  input: StaffInput,
  options: StaffAdditionOptions = {}
): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const parsed = createStaffSchema.parse(input)
    const acknowledgedPeak = acknowledgedPeakSchema.parse(options.acknowledgedPeak)
    const { tenantId } = parsed
    const user = await requireUser()
    // 有料プランの上限人数と、料金が上がる追加の確認（019 §13.5）。無料の上限は下の INSERT で門番が止める
    await ensureStaffAddition(user.id, { adding: 1, acknowledgedPeak })

    const supabase = await createClient()
    const position = await nextPosition(supabase, 'staffs', tenantId)

    const { data: staff, error } = await supabase
      .from('staffs')
      .insert({ tenant_id: tenantId, position, name: parsed.name, ...toConditionColumns(parsed) })
      .select('id')
      .single()
    if (error) {
      // 在籍の上限は DB の門番が止める（019 §5.3）。画面は code を見て案内のモーダルを開く
      throwIfStaffLimit(error)
      throw error
    }

    await syncStaffRelations(supabase, {
      tenantId,
      staffId: staff.id,
      currentPatternIds: [],
      currentDayKeys: [],
      availablePatternIds: parsed.availablePatternIds,
      defaultPatterns: parsed.defaultPatterns,
    })

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { name: parsed.name }
  })
}

/** 編集画面の「基本情報」の保存 */
export async function updateStaffName(input: {
  tenantId: string
  staffId: string
  name: string
}): Promise<ActionResult> {
  return runAction(async () => {
    const { tenantId, staffId, name } = updateStaffNameSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('staffs')
      .update({ name })
      .eq('id', staffId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) fail(STAFF_NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
  })
}

/** 編集画面の「勤務条件」の保存（勤務できる曜日・週の上限・選択可能なパターン・デフォルトのパターン） */
export async function updateStaffConditions(
  input: Omit<StaffInput, 'name'> & { staffId: string }
): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = updateStaffConditionsSchema.parse(input)
    const { tenantId, staffId } = parsed
    await requireUser()

    const supabase = await createClient()
    // 現在の関連を読む。存在確認も兼ねる（他店舗・存在しない id はここで null になる）
    const { data: current, error: currentError } = await supabase
      .from('staffs')
      .select('id, staff_patterns(pattern_id), staff_default_patterns(day_key)')
      .eq('id', staffId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (currentError) throw currentError
    if (!current) fail(STAFF_NOT_FOUND_MESSAGE)

    const { data, error } = await supabase
      .from('staffs')
      .update(toConditionColumns(parsed))
      .eq('id', staffId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) fail(STAFF_NOT_FOUND_MESSAGE)

    await syncStaffRelations(supabase, {
      tenantId,
      staffId,
      currentPatternIds: current.staff_patterns.map((row) => row.pattern_id),
      currentDayKeys: current.staff_default_patterns.map((row) => row.day_key),
      availablePatternIds: parsed.availablePatternIds,
      defaultPatterns: parsed.defaultPatterns,
    })

    revalidatePath(`/tenants/${tenantId}`, 'layout')
  })
}

/** 退職 / 復帰は `retired_at` の切り替えだけ（v1 の disabled）。データは消さない */
async function setRetiredAt(
  input: { tenantId: string; staffId: string },
  value: string | null,
  options: StaffAdditionOptions = {}
) {
  const { tenantId, staffId } = staffRefSchema.parse(input)
  const acknowledgedPeak = acknowledgedPeakSchema.parse(options.acknowledgedPeak)
  const user = await requireUser()
  // 復帰は在籍が 1 人増える（019 §13.5）
  if (value === null) await ensureStaffAddition(user.id, { adding: 1, acknowledgedPeak })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .update({ retired_at: value })
    .eq('id', staffId)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle()
  if (error) {
    // 復帰で在籍の上限を超えるときは DB の門番が止める（019 §5.3）
    throwIfStaffLimit(error)
    throw error
  }
  if (!data) fail(STAFF_NOT_FOUND_MESSAGE)

  revalidatePath(`/tenants/${tenantId}`, 'layout')
}

export async function retireStaff(input: {
  tenantId: string
  staffId: string
}): Promise<ActionResult> {
  return runAction(() => setRetiredAt(input, new Date().toISOString()))
}

export async function restoreStaff(
  input: {
    tenantId: string
    staffId: string
  },
  options: StaffAdditionOptions = {}
): Promise<ActionResult> {
  return runAction(() => setRetiredAt(input, null, options))
}

/** 削除。このスタッフのシフトと関連は FK の cascade で消える */
export async function deleteStaff(input: {
  tenantId: string
  staffId: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { tenantId, staffId } = staffRefSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('staffs')
      .delete()
      .eq('id', staffId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) fail(STAFF_NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: `/tenants/${tenantId}/settings/staffs` }
  })
}

export async function reorderStaffs(input: {
  tenantId: string
  ids: string[]
}): Promise<ActionResult> {
  return runAction(() => reorderRows('staffs', input))
}

import 'server-only'
import { isDayKey, type DayKey } from '@/lib/calendar/weekdays'
import type { StaffDefaults } from '@/lib/shifts/planDefaultPatterns'
import type { Tables } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

export type Staff = Tables<'staffs'>

/** 編集フォームが必要とする関連（選択可能な勤務パターン / デフォルト勤務パターン）を含むスタッフ */
export type StaffWithRelations = Staff & {
  patternIds: string[]
  defaultPatterns: Partial<Record<DayKey, string>>
}

/** 在籍スタッフ一覧（表示順）。退職者（retired_at あり）は含めない */
export async function listActiveStaffs(tenantId: string): Promise<Staff[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('retired_at', null)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

/** 退職スタッフ一覧。並びは在籍と同じ position 順（v1 と同じ。retired_at 順にはしない） */
export async function listRetiredStaffs(tenantId: string): Promise<Staff[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('*')
    .eq('tenant_id', tenantId)
    .not('retired_at', 'is', null)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

/** `staff_default_patterns` の行を `{ day_key → pattern_id }` に畳む。知らないキーは捨てる */
function toDefaultPatterns(
  rows: { day_key: string; pattern_id: string }[]
): Partial<Record<DayKey, string>> {
  const defaults: Partial<Record<DayKey, string>> = {}
  for (const row of rows) {
    if (isDayKey(row.day_key)) defaults[row.day_key] = row.pattern_id
  }
  return defaults
}

/**
 * 編集フォーム用に 1 件 + 関連を読む。複合 FK でも PostgREST の埋め込みが解決できるので 1 往復（006 §5.3）。
 * 他店舗・存在しない id は RLS と tenant_id の重ねがけで null になる。
 */
export async function getStaffWithRelations(
  tenantId: string,
  staffId: string
): Promise<StaffWithRelations | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('*, staff_patterns(pattern_id), staff_default_patterns(day_key, pattern_id)')
    .eq('tenant_id', tenantId)
    .eq('id', staffId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { staff_patterns, staff_default_patterns, ...staff } = data
  return {
    ...staff,
    patternIds: staff_patterns.map((row) => row.pattern_id),
    defaultPatterns: toDefaultPatterns(staff_default_patterns),
  }
}

/** シフト表が使う在籍スタッフ（選択可能なパターン付き）。ポップオーバーの絞り込みに使う */
export type StaffWithPatternIds = Staff & { patternIds: string[] }

/**
 * 在籍スタッフ + 選択可能な勤務パターンの id（表示順）。
 * 複合 FK でも PostgREST の埋め込みが解決できるので 1 往復（006 §5.3 と同じ）。
 */
export async function listActiveStaffsWithPatternIds(
  tenantId: string
): Promise<StaffWithPatternIds[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('*, staff_patterns(pattern_id)')
    .eq('tenant_id', tenantId)
    .is('retired_at', null)
    .order('position', { ascending: true })
  if (error) throw error

  return data.map(({ staff_patterns, ...staff }) => ({
    ...staff,
    patternIds: staff_patterns.map((row) => row.pattern_id),
  }))
}

/**
 * 在籍スタッフの id だけ。順序は保証しない（パターン作成時の紐付けなど、集合として使う）。
 * 名前や勤務曜日は要らないので `select('*')` にしない。
 */
export async function listActiveStaffIds(tenantId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('retired_at', null)
  if (error) throw error
  return data.map((staff) => staff.id)
}

/**
 * デフォルト勤務パターンを 1 つ以上持つ在籍スタッフ（008 §5.1）。
 *
 * `!inner` で「設定のあるスタッフだけ」を DB 側で絞る（100 人の店舗で設定が数人なら、空の配列 90 個を運ばない）。
 * `planDefaultPatterns()` が使う列だけを読む。複合 FK でも PostgREST の埋め込みが解決できるので 1 往復（006 §5.3 と同じ）。
 */
export async function listActiveStaffsWithDefaultPatterns(
  tenantId: string
): Promise<StaffDefaults[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('id, staff_default_patterns!inner(day_key, pattern_id)')
    .eq('tenant_id', tenantId)
    .is('retired_at', null)
    .order('position', { ascending: true })
  if (error) throw error

  return data.map((staff) => ({
    id: staff.id,
    defaults: toDefaultPatterns(staff.staff_default_patterns),
  }))
}

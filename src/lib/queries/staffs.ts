import 'server-only'
import type { DayKey } from '@/lib/calendar/weekdays'
import { DAY_KEYS } from '@/lib/calendar/weekdays'
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

const isDayKey = (value: string): value is DayKey => (DAY_KEYS as readonly string[]).includes(value)

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

  const defaultPatterns: Partial<Record<DayKey, string>> = {}
  for (const row of staff_default_patterns) {
    if (isDayKey(row.day_key)) defaultPatterns[row.day_key] = row.pattern_id
  }

  return {
    ...staff,
    patternIds: staff_patterns.map((row) => row.pattern_id),
    defaultPatterns,
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

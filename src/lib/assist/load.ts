import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { datesBetween } from '@/lib/calendar/dateString'
import { holidaysIn } from '@/lib/calendar/holidays'
import { isDayKey, type DayKey } from '@/lib/calendar/weekdays'
import { pageAll } from '@/lib/queries/pageAll'
import type { Database } from '@/types/database'
import { contextRange, requiredNumsRange, type AssistInput } from './problem'

type Client = SupabaseClient<Database>

/**
 * 自動アサインの入力を読む（012 §5.1 の 1）。
 *
 * **クライアントは引数で受ける**（§3.4: `runAssist()` をリクエスト文脈に依存させない）。同期版は Server Action が
 * ユーザーのクライアント（anon + RLS）を渡す。将来ジョブ基盤へ移すときは service_role のクライアントが入りうるので、
 * **すべてのクエリに `.eq('tenant_id', …)` を書く**（RLS に頼らない。`publicShare.ts` と同じ規律）。
 * `lib/queries/` の汎用関数には渡さない（service_role を差し込める口を作らない）。
 */
export async function loadAssistInput(
  supabase: Client,
  tenantId: string,
  period: { start: string; end: string },
  startOfWeek: number
): Promise<AssistInput> {
  const context = contextRange(period)
  const requiredRange = requiredNumsRange(period)

  const [staffs, patterns, restrictions, requiredNums, shifts] = await Promise.all([
    supabase
      .from('staffs')
      .select(
        'id, name, available_wdays, max_work_week, staff_patterns(pattern_id), staff_default_patterns(day_key, pattern_id)'
      )
      .eq('tenant_id', tenantId)
      .is('retired_at', null)
      .order('position', { ascending: true }),
    supabase
      .from('patterns')
      .select('id, name, kind, pair_pattern_id')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true }),
    supabase
      .from('restrictions')
      .select('id, kind, days, pattern1_id, pattern2_id, staff_id, hard, wdays')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true }),
    // パターン数 × 32 日。パターンが多い店舗で max_rows を超えうるので pageAll（AGENTS.md）
    pageAll((from, to, withCount) =>
      supabase
        .from('required_nums')
        .select('pattern_id, date, num', withCount ? { count: 'exact' } : undefined)
        .eq('tenant_id', tenantId)
        .gte('date', requiredRange.start)
        .lte('date', requiredRange.end)
        .order('date', { ascending: true })
        .order('pattern_id', { ascending: true })
        .range(from, to)
    ),
    pageAll((from, to, withCount) =>
      supabase
        .from('shifts')
        .select('staff_id, pattern_id, date', withCount ? { count: 'exact' } : undefined)
        .eq('tenant_id', tenantId)
        .gte('date', context.start)
        .lte('date', context.end)
        .order('date', { ascending: true })
        .order('staff_id', { ascending: true })
        .range(from, to)
    ),
  ])
  if (staffs.error) throw staffs.error
  if (patterns.error) throw patterns.error
  if (restrictions.error) throw restrictions.error

  return {
    period,
    startOfWeek,
    holidays: holidaysIn(datesBetween(context.start, context.end)),
    staffs: staffs.data.map((staff) => {
      const defaults: Partial<Record<DayKey, string>> = {}
      for (const row of staff.staff_default_patterns) {
        if (isDayKey(row.day_key)) defaults[row.day_key] = row.pattern_id
      }
      return {
        id: staff.id,
        name: staff.name,
        availableWdays: staff.available_wdays,
        maxWorkWeek: staff.max_work_week,
        patternIds: staff.staff_patterns.map((row) => row.pattern_id),
        defaults,
      }
    }),
    patterns: patterns.data.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      kind: pattern.kind,
      pairPatternId: pattern.pair_pattern_id,
    })),
    // 退職者の規則は buildProblem が在籍スタッフで落とす（013 §3.8）
    restrictions: restrictions.data.map((row) => ({
      id: row.id,
      kind: row.kind,
      days: row.days,
      pattern1Id: row.pattern1_id,
      pattern2Id: row.pattern2_id,
      staffId: row.staff_id,
      hard: row.hard,
      wdays: row.wdays,
    })),
    requiredNums: requiredNums.map((row) => ({
      patternId: row.pattern_id,
      date: row.date,
      num: row.num,
    })),
    // 退職者の行は buildProblem が在籍スタッフで落とす
    shifts: shifts.map((row) => ({
      staffId: row.staff_id,
      date: row.date,
      patternId: row.pattern_id,
    })),
  }
}

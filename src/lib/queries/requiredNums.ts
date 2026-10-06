import 'server-only'
import type { RequiredNumRow } from '@/lib/shifts/requiredNums'
import { createClient } from '@/utils/supabase/server'
import { pageAll } from './pageAll'

/**
 * 表示期間の必要人数の**上書き**（015 §3.1）。
 *
 * `required_nums` の行は「この日だけ変えた」分だけを持つ。行が無い組み合わせは
 * 基本の人数（`patterns.default_required_nums`）に落ちる（0 ではない）。解決は
 * `lib/shifts/requiredNums.ts` の `buildRequiredByDate()` / `resolveRequiredRows()`。
 *
 * 行数は「手で変えた日」の数で止まるが、長い期間 × 勤務数で増えうるので `pageAll()` を通す（AGENTS.md）。
 */
export async function listRequiredNums(
  tenantId: string,
  start: string,
  end: string
): Promise<RequiredNumRow[]> {
  const supabase = await createClient()
  const rows = await pageAll((from, to, withCount) =>
    supabase
      .from('required_nums')
      .select('pattern_id, date, num', withCount ? { count: 'exact' } : undefined)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('pattern_id', { ascending: true })
      .range(from, to)
  )

  return rows.map((row) => ({ patternId: row.pattern_id, date: row.date, num: row.num }))
}

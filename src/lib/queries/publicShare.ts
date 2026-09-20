import 'server-only'
import { isShareCode } from '@/lib/shares/code'
import { isShareEnabled } from '@/lib/shares/expiry'
import type { ShiftCell } from '@/lib/shifts/key'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import { pageAll } from './pageAll'

export type SharedPattern = {
  id: string
  name: string
  description: string | null
  colorHex: string
}

export type SharedShiftTable = {
  tenantName: string
  start: string
  end: string
  staffs: { id: string; name: string }[]
  patterns: SharedPattern[]
  shifts: ShiftCell[]
  notes: { date: string; note: string }[]
}

/**
 * 公開シフト表の読み取り（009 §3.4）。**`createPrivilegedClient()` を使うのはこの関数だけ**。
 *
 * service_role は RLS を通らないので、テナント境界はここでしか担保できない。したがって:
 *
 * - `shares` を引き当てたあとは、**すべてのクエリに `.eq('tenant_id', share.tenant_id)` を書く**
 * - `shifts` / `date_notes` は**共有の期間でしか読まない**。URL が漏れても、公開されるのはその期間の表だけ
 * - 存在しない / 期限切れ / 解除済みは**すべて `null`**。呼び出し側は理由を出し分けず 404 にする（店舗の存在を漏らさない）
 */
export async function getSharedShiftTable(
  code: string,
  today: string
): Promise<SharedShiftTable | null> {
  // 形式が違うものは DB を引く前に落とす（`code` は URL から来る）
  if (!isShareCode(code)) return null

  const supabase = createPrivilegedClient()

  // 店舗名は FK（shares.tenant_id → tenants.id）の埋め込みで同じ往復に載せる
  const { data: share, error } = await supabase
    .from('shares')
    .select('tenant_id, start_date, end_date, tenants(name)')
    .eq('code', code)
    .maybeSingle()
  if (error) throw error
  if (!share || !isShareEnabled(share.end_date, today)) return null

  const tenantId = share.tenant_id
  const { start_date: start, end_date: end } = share

  const [staffs, patterns, shifts, notes] = await Promise.all([
    // 在籍スタッフだけ（v1 と同じ。共有後に退職したスタッフは公開ページから消える）
    supabase
      .from('staffs')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .is('retired_at', null)
      .order('position', { ascending: true }),
    supabase
      .from('patterns')
      .select('id, name, description, color_hex')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true }),
    // スタッフ数 × 日数で増えるので max_rows に切られないよう pageAll を通す（AGENTS.md）
    pageAll((from, to, withCount) =>
      supabase
        .from('shifts')
        .select('staff_id, pattern_id, date, fixed', withCount ? { count: 'exact' } : undefined)
        .eq('tenant_id', tenantId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .order('staff_id', { ascending: true })
        .range(from, to)
    ),
    supabase
      .from('date_notes')
      .select('date, note')
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end),
  ])
  if (staffs.error) throw staffs.error
  if (patterns.error) throw patterns.error
  if (notes.error) throw notes.error

  // 退職者の行はクエリではなくここで落とす（保護側の page.tsx と同じ。007 §5.8）
  const activeStaffIds = new Set(staffs.data.map((staff) => staff.id))

  return {
    tenantName: share.tenants.name,
    start,
    end,
    staffs: staffs.data,
    patterns: patterns.data.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      colorHex: pattern.color_hex,
    })),
    shifts: shifts
      .filter((shift) => activeStaffIds.has(shift.staff_id))
      .map((shift) => ({
        staffId: shift.staff_id,
        date: shift.date,
        patternId: shift.pattern_id,
        fixed: shift.fixed,
      })),
    notes: notes.data,
  }
}

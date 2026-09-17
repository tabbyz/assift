import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/** `position` を持つテナント配下のテーブル（v1 の acts_as_list 相当） */
type OrderedTable = 'patterns' | 'staffs' | 'restrictions'

/**
 * 末尾に追加するときの `position`。既存の最大 + 1（無ければ 0）。
 *
 * v1 の acts_as_list と違い採番はアプリ側で行う。同時追加が競合しても `position` が重複するだけで、
 * 表示順が不定になるのみ（一意制約は無い）。006 の並べ替えでも使う。
 */
export async function nextPosition(
  supabase: SupabaseClient<Database>,
  table: OrderedTable,
  tenantId: string
): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .select('position')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? data.position + 1 : 0
}

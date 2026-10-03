import 'server-only'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/actions/guards'
import { reorderSchema } from '@/lib/validation/ordering'
import { createClient } from '@/utils/supabase/server'

/** `reorder_positions` RPC が受け付けるテーブル（SQL 側のホワイトリストと合わせる） */
type ReorderableTable = 'staffs' | 'patterns'

/**
 * 表示中の id 配列の順で `position` を 0..n-1 に振り直す（006 §3.3 / §5.1）。
 *
 * テーブル名は呼び出し側の Action が定数で渡す（クライアントからは受け取らない）。
 * RPC は security invoker なので RLS がそのまま効き、他店舗の行は更新対象から外れて
 * 件数不一致の例外になる（= ロールバックされ、1 行も変わらない）。
 */
export async function reorderRows(
  table: ReorderableTable,
  input: { tenantId: string; ids: string[] }
): Promise<void> {
  const { tenantId, ids } = reorderSchema.parse(input)
  await requireUser()

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_positions', {
    p_table: table,
    p_tenant_id: tenantId,
    p_ids: ids,
  })
  if (error) throw error

  revalidatePath(`/tenants/${tenantId}`, 'layout')
}

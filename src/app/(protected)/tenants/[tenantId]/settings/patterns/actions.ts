'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { nextPosition } from '@/lib/queries/positions'
import { createPatternSchema } from '@/lib/validation/patterns'
import { createClient } from '@/utils/supabase/server'

/**
 * 勤務パターンを作成する（005 は名前だけ。色・種別・ペア・必要人数は 006 で足す）。
 *
 * v1 の `Pattern#after_create :associated_staffs!` と同じく、作成と同時に在籍スタッフ全員の
 * 「選択可能な勤務パターン」に追加する。2 回の呼び出しでトランザクションではないが、
 * 2 回目が失敗しても 006 のスタッフ編集で結び直せる（005 §3.4）。
 */
export async function createPattern(input: {
  tenantId: string
  name: string
}): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const { tenantId, name } = createPatternSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const position = await nextPosition(supabase, 'patterns', tenantId)

    const { data: pattern, error } = await supabase
      .from('patterns')
      .insert({ tenant_id: tenantId, name, position })
      .select('id')
      .single()
    if (error) throw error

    const { data: staffs, error: staffsError } = await supabase
      .from('staffs')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('retired_at', null)
    if (staffsError) throw staffsError

    if (staffs.length > 0) {
      const { error: linkError } = await supabase.from('staff_patterns').insert(
        staffs.map((staff) => ({
          tenant_id: tenantId,
          staff_id: staff.id,
          pattern_id: pattern.id,
        }))
      )
      if (linkError) throw linkError
    }

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { name }
  })
}

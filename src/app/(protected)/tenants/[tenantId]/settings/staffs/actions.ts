'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { nextPosition } from '@/lib/queries/positions'
import { createStaffSchema } from '@/lib/validation/staffs'
import { createClient } from '@/utils/supabase/server'

/**
 * スタッフを作成する（005 は名前だけ。勤務曜日・週上限などは 006 で足す）。
 *
 * v1 の新規スタッフフォームは全パターンにチェックが入った状態なので、
 * 作成と同時に店舗の全勤務パターンを「選択可能」にする（005 §3.4）。
 * `available_wdays` / `max_work_week` は DB の default（全曜日 / 5）に任せる。
 */
export async function createStaff(input: {
  tenantId: string
  name: string
}): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const { tenantId, name } = createStaffSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const position = await nextPosition(supabase, 'staffs', tenantId)

    const { data: staff, error } = await supabase
      .from('staffs')
      .insert({ tenant_id: tenantId, name, position })
      .select('id')
      .single()
    if (error) throw error

    const { data: patterns, error: patternsError } = await supabase
      .from('patterns')
      .select('id')
      .eq('tenant_id', tenantId)
    if (patternsError) throw patternsError

    if (patterns.length > 0) {
      const { error: linkError } = await supabase.from('staff_patterns').insert(
        patterns.map((pattern) => ({
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

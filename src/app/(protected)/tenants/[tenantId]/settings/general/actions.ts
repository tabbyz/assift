'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { updateTenantSchema, TENANT_NOT_FOUND_MESSAGE } from '@/lib/validation/tenants'
import { createClient } from '@/utils/supabase/server'

/** 店舗情報を更新する。ヘッダーの店舗名も変わるので layout ごと再検証する */
export async function updateTenant(input: {
  tenantId: string
  name: string
  shiftCycle: ShiftCycle
  startOfWeek: number
}): Promise<ActionResult> {
  return runAction(async () => {
    const { tenantId, name, shiftCycle, startOfWeek } = updateTenantSchema.parse(input)
    const user = await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .update({ name, shift_cycle: shiftCycle, start_of_week: startOfWeek })
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    // RLS で見えない行の UPDATE はエラーにならず 0 行で終わる。成功と区別する
    if (!data) fail(TENANT_NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
  })
}

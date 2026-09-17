'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { createTenantSchema } from '@/lib/validation/tenants'
import { createClient } from '@/utils/supabase/server'

/** 店舗を作成して、その店舗の URL を返す（遷移はクライアントが行う） */
export async function createTenant(input: {
  name: string
  shiftCycle: ShiftCycle
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { name, shiftCycle } = createTenantSchema.parse(input)
    await requireUser()

    // owner_id は tenants.owner_id の default auth.uid() が埋める（003 §3.4）
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .insert({ name, shift_cycle: shiftCycle })
      .select('id')
      .single()
    if (error) throw error

    revalidatePath('/tenants', 'layout')
    return { redirectTo: `/tenants/${data.id}` }
  })
}

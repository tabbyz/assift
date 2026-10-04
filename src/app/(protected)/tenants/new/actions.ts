'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { createSetupTenantSchema } from '@/lib/validation/setup'
import { createClient } from '@/utils/supabase/server'

/**
 * 初期設定のステップ 1: 店舗を作って、続き（`/setup`）の URL を返す（014 §4.1）。
 * 遷移はクライアントが `router.replace` で行う（push だと「戻る」でこのフォームに戻り、店舗が二重にできる）。
 * 週の始まりは週・2 週のときだけ受け、1ヶ月・半月は日曜にする（Zod の transform）。
 */
export async function createTenant(input: {
  name: string
  shiftCycle: ShiftCycle
  startOfWeek: number | null
}): Promise<ActionResult<{ tenantId: string; redirectTo: string }>> {
  return runAction(async () => {
    const { name, shiftCycle, startOfWeek } = createSetupTenantSchema.parse(input)
    await requireUser()

    // owner_id は tenants.owner_id の default auth.uid() が埋める（003 §3.4）
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .insert({ name, shift_cycle: shiftCycle, start_of_week: startOfWeek })
      .select('id')
      .single()
    if (error) throw error

    revalidatePath('/tenants', 'layout')
    return { tenantId: data.id, redirectTo: `/tenants/${data.id}/setup` }
  })
}

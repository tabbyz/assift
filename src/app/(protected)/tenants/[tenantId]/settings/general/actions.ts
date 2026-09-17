'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { CURRENT_TENANT_COOKIE } from '@/lib/tenants/currentTenant'
import { deleteTenantSchema, updateTenantSchema } from '@/lib/validation/tenants'
import { createClient } from '@/utils/supabase/server'

const NOT_FOUND_MESSAGE = '店舗が見つかりません'

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
    if (!data) fail(NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
  })
}

/** 店舗を削除する。配下のデータは FK の cascade で消える */
export async function deleteTenant(input: {
  tenantId: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { tenantId } = deleteTenantSchema.parse(input)
    const user = await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) fail(NOT_FOUND_MESSAGE)

    // 消した店舗を「直近」に残さない（残っても /tenants が一覧と突き合わせて落とす）
    const cookieStore = await cookies()
    if (cookieStore.get(CURRENT_TENANT_COOKIE)?.value === tenantId) {
      cookieStore.delete(CURRENT_TENANT_COOKIE)
    }

    revalidatePath('/tenants', 'layout')
    return { redirectTo: '/tenants' }
  })
}

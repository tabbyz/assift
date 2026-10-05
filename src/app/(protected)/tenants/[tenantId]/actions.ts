'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { CURRENT_TENANT_COOKIE } from '@/lib/tenants/currentTenant'
import { deleteTenantSchema, TENANT_NOT_FOUND_MESSAGE } from '@/lib/validation/tenants'
import { createClient } from '@/utils/supabase/server'

// 店舗の配下でルートをまたいで使う Action（設定の店舗情報と初期設定の両方から呼ぶ。014 §5.5）

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
    if (!data) fail(TENANT_NOT_FOUND_MESSAGE)

    // 消した店舗を「直近」に残さない（残っても /tenants が一覧と突き合わせて落とす）
    const cookieStore = await cookies()
    if (cookieStore.get(CURRENT_TENANT_COOKIE)?.value === tenantId) {
      cookieStore.delete(CURRENT_TENANT_COOKIE)
    }

    revalidatePath('/tenants', 'layout')
    return { redirectTo: '/tenants' }
  })
}

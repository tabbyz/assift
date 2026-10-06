'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { fail } from '@/lib/actions/error'
import { requireTenant, requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import { CURRENT_TENANT_COOKIE } from '@/lib/tenants/currentTenant'
import { PATTERN_NOT_FOUND_MESSAGE } from '@/lib/validation/patterns'
import { saveDefaultRequiredNumsSchema } from '@/lib/validation/requiredNums'
import { deleteTenantSchema, TENANT_NOT_FOUND_MESSAGE } from '@/lib/validation/tenants'
import { createClient } from '@/utils/supabase/server'

// 店舗の配下でルートをまたいで使う Action（設定の店舗情報と初期設定の両方から呼ぶ。014 §5.5。
// 基本の必要人数は `設定 > 必要人数` と AI シフト作成のモーダルの両方から呼ぶ。015 §3.5）

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

/**
 * 基本の人数（勤務 × 曜日）をまとめて保存する（015 §3.4）。
 *
 * 日付の行（`required_nums`）には触れない。**この値はシフト表を開いたときに解決される**ので、
 * 保存した時点で期間へ焼き付ける必要が無く、手で変えた日（上書き）もそのまま残る。
 *
 * 勤務ごとの update は 1 トランザクションにならないが RPC にしない: 途中で止まっても、
 * 入った勤務の基本が正しい値で残るだけで、もう一度保存すれば全部そろう（矛盾した状態が残らない）。
 * 設定の変更はシフト表の描画にも効くので `revalidatePath(..., 'layout')`（007 §3.5）。
 */
export async function saveDefaultRequiredNums(input: {
  tenantId: string
  nums: Record<string, RequiredNumsByDay>
}): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = saveDefaultRequiredNumsSchema.parse(input)
    await requireUser()
    await requireTenant(parsed.tenantId)

    const supabase = await createClient()
    const results = await Promise.all(
      Object.entries(parsed.nums).map(([patternId, nums]) =>
        supabase
          .from('patterns')
          .update({ default_required_nums: nums })
          .eq('tenant_id', parsed.tenantId)
          .eq('id', patternId)
          // 休みの勤務は必要人数を持たない（006 §3.9）
          .eq('kind', 'workday')
          .select('id')
          .maybeSingle()
      )
    )
    for (const { data, error } of results) {
      if (error) throw error
      // RLS で見えない行の UPDATE はエラーにならず 0 行で終わる。成功と区別する
      if (!data) fail(PATTERN_NOT_FOUND_MESSAGE)
    }

    revalidatePath(`/tenants/${parsed.tenantId}`, 'layout')
  })
}

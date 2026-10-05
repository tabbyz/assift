'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireTenant, requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import { PATTERN_NOT_FOUND_MESSAGE } from '@/lib/validation/patterns'
import { saveDefaultRequiredNumsSchema } from '@/lib/validation/requiredNums'
import { createClient } from '@/utils/supabase/server'

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

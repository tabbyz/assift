'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import type { Industry } from '@/lib/setup/templates'
import {
  normalizeIndustry,
  updateTenantSchema,
  TENANT_NOT_FOUND_MESSAGE,
} from '@/lib/validation/tenants'
import { createClient } from '@/utils/supabase/server'

/** 店舗情報を更新する。ヘッダーの店舗名も変わるので layout ごと再検証する */
export async function updateTenant(input: {
  tenantId: string
  name: string
  shiftCycle: ShiftCycle
  startOfWeek: number
  /** 業種（034 §4.3）。undefined なら業種と一言に触らない（画面は変えたときだけ送る） */
  industry?: Industry | null
  industryNote?: string | null
}): Promise<ActionResult> {
  return runAction(async () => {
    const { tenantId, name, shiftCycle, startOfWeek, industry, industryNote } =
      updateTenantSchema.parse(input)
    const user = await requireUser()

    const normalized = industry !== undefined ? normalizeIndustry({ industry, industryNote }) : null
    const industryColumns = normalized
      ? { industry: normalized.industry, industry_note: normalized.industryNote }
      : {}

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .update({ name, shift_cycle: shiftCycle, start_of_week: startOfWeek, ...industryColumns })
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

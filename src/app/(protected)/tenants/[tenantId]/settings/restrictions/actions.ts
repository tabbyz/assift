'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import { reorderRows } from '@/lib/actions/reorder'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { nextPosition } from '@/lib/queries/positions'
import {
  createRestrictionSchema,
  deleteRestrictionSchema,
  type RawRestrictionInput,
  toRestrictionColumns,
  updateRestrictionSchema,
} from '@/lib/validation/restrictions'
import { createClient } from '@/utils/supabase/server'

const NOT_FOUND_MESSAGE = '制約が見つかりません'

export async function createRestriction(input: {
  tenantId: string
  input: RawRestrictionInput
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = createRestrictionSchema.parse(input)
    const { tenantId } = parsed
    await requireUser()

    const supabase = await createClient()
    const position = await nextPosition(supabase, 'restrictions', tenantId)

    // 他店舗のパターン id を混ぜても複合 FK（pattern_id, tenant_id）が 23503 で弾く
    const { error } = await supabase
      .from('restrictions')
      .insert({ tenant_id: tenantId, position, ...toRestrictionColumns(parsed.input) })
    if (error) throw error

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: `/tenants/${tenantId}/settings/restrictions` }
  })
}

export async function updateRestriction(input: {
  tenantId: string
  restrictionId: string
  input: RawRestrictionInput
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = updateRestrictionSchema.parse(input)
    const { tenantId, restrictionId } = parsed
    await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('restrictions')
      .update(toRestrictionColumns(parsed.input))
      .eq('id', restrictionId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) fail(NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: `/tenants/${tenantId}/settings/restrictions` }
  })
}

export async function deleteRestriction(input: {
  tenantId: string
  restrictionId: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { tenantId, restrictionId } = deleteRestrictionSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('restrictions')
      .delete()
      .eq('id', restrictionId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) fail(NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: `/tenants/${tenantId}/settings/restrictions` }
  })
}

export async function reorderRestrictions(input: {
  tenantId: string
  ids: string[]
}): Promise<ActionResult> {
  return runAction(() => reorderRows('restrictions', input))
}

'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import { reorderRows } from '@/lib/actions/reorder'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import type { PatternKind } from '@/lib/patterns/kinds'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import { nextPosition } from '@/lib/queries/positions'
import {
  createPatternSchema,
  deletePatternSchema,
  updatePatternSchema,
  PATTERN_NOT_FOUND_MESSAGE,
} from '@/lib/validation/patterns'
import { listActiveStaffIds } from '@/lib/queries/staffs'
import { createClient } from '@/utils/supabase/server'

export type PatternInput = {
  tenantId: string
  name: string
  description: string
  colorHex: string
  kind: PatternKind
  pairPatternId: string | null
  defaultRequiredNums: RequiredNumsByDay
}

/** 説明は空欄を null で持つ（DB の CHECK は null を通す）。休みパターンに必要人数は持たせない（006 §3.9） */
function toColumns(parsed: {
  name: string
  description: string
  colorHex: string
  kind: PatternKind
  pairPatternId: string | null
  defaultRequiredNums: RequiredNumsByDay
}) {
  return {
    name: parsed.name,
    description: parsed.description === '' ? null : parsed.description,
    color_hex: parsed.colorHex,
    kind: parsed.kind,
    pair_pattern_id: parsed.pairPatternId,
    default_required_nums: parsed.kind === 'dayoff' ? {} : parsed.defaultRequiredNums,
  }
}

/**
 * 勤務パターンを作成する。
 *
 * v1 の `Pattern#after_create :associated_staffs!` と同じく、作成と同時に在籍スタッフ全員の
 * 「選択可能な勤務パターン」に追加する。2 回の呼び出しでトランザクションではないが、
 * 2 回目が失敗しても親は正しく、スタッフ編集で結び直せる（006 §3.4）。
 */
export async function createPattern(input: PatternInput): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const parsed = createPatternSchema.parse(input)
    const { tenantId } = parsed
    await requireUser()

    const supabase = await createClient()
    const [position, staffIds] = await Promise.all([
      nextPosition(supabase, 'patterns', tenantId),
      listActiveStaffIds(tenantId),
    ])

    const { data: pattern, error } = await supabase
      .from('patterns')
      .insert({ tenant_id: tenantId, position, ...toColumns(parsed) })
      .select('id')
      .single()
    if (error) throw error

    if (staffIds.length > 0) {
      const { error: linkError } = await supabase.from('staff_patterns').insert(
        staffIds.map((staffId) => ({
          tenant_id: tenantId,
          staff_id: staffId,
          pattern_id: pattern.id,
        }))
      )
      if (linkError) throw linkError
    }

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { name: parsed.name }
  })
}

export async function updatePattern(
  input: PatternInput & { patternId: string }
): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = updatePatternSchema.parse(input)
    const { tenantId, patternId } = parsed
    await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('patterns')
      .update(toColumns(parsed))
      .eq('id', patternId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    // RLS で見えない行の UPDATE はエラーにならず 0 行で終わる。成功と区別する
    if (!data) fail(PATTERN_NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
  })
}

/** 削除。関連するシフト・必要人数・制約は FK の cascade、ペアに指す側は set null で DB が処理する */
export async function deletePattern(input: {
  tenantId: string
  patternId: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { tenantId, patternId } = deletePatternSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('patterns')
      .delete()
      .eq('id', patternId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) fail(PATTERN_NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: `/tenants/${tenantId}/settings/patterns` }
  })
}

export async function reorderPatterns(input: {
  tenantId: string
  ids: string[]
}): Promise<ActionResult> {
  return runAction(() => reorderRows('patterns', input))
}

'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireTenant, requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { nextPosition } from '@/lib/queries/positions'
import {
  createRestrictionSchema,
  deleteRestrictionSchema,
  type RawRestrictionInput,
  resolveHard,
  toRestrictionColumns,
  updateRestrictionSchema,
} from '@/lib/validation/restrictions'
import { createClient } from '@/utils/supabase/server'

const NOT_FOUND_MESSAGE = '制約が見つかりません'
const RETIRED_STAFF_MESSAGE = '退職済みのスタッフは対象にできません'
const KIND_CHANGE_MESSAGE = '制約の種類は変えられません。削除してから登録し直してください'
const REFERENCE_MESSAGE =
  'スタッフか勤務パターンが見つかりません。画面を再読み込みしてからやり直してください'

/** 保存・削除のあとは制約ページへ戻る */
function listPath(tenantId: string): string {
  return `/tenants/${tenantId}/settings/restrictions`
}

type Client = Awaited<ReturnType<typeof createClient>>

/**
 * 対象のスタッフが在籍しているか。複合 FK は店舗しか見ないので、退職者を対象にした規則も保存できてしまう
 * （自動アサインは在籍スタッフだけを読むので、黙って効かない規則になる）。
 * `keep` は編集前の対象。退職者の既存の規則は、対象を変えずに内容だけ直すことを許す（編集画面は選択肢に残している）
 */
async function assertActiveStaff(
  supabase: Client,
  tenantId: string,
  staffId: string | null,
  keep: string | null = null
): Promise<void> {
  if (staffId === null || staffId === keep) return
  const { data, error } = await supabase
    .from('staffs')
    .select('retired_at')
    .eq('tenant_id', tenantId)
    .eq('id', staffId)
    .maybeSingle()
  if (error) throw error
  // 見えない id は insert / update の複合 FK（23503）に任せる
  if (data?.retired_at) fail(RETIRED_STAFF_MESSAGE)
}

/** 複合 FK（他店舗・消えたスタッフやパターン）の 23503 を文言にする */
function throwWriteError(error: { code?: string }): never {
  if (error.code === '23503') fail(REFERENCE_MESSAGE)
  throw error
}

export async function createRestriction(input: {
  tenantId: string
  staffId: string | null
  hard: boolean
  input: RawRestrictionInput
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = createRestrictionSchema.parse(input)
    const { tenantId, staffId } = parsed
    await requireUser()
    await requireTenant(tenantId)

    const supabase = await createClient()
    await assertActiveStaff(supabase, tenantId, staffId)
    const position = await nextPosition(supabase, 'restrictions', tenantId)

    // 他店舗のパターン・スタッフの id を混ぜても複合 FK（…, tenant_id）が 23503 で弾く
    const { error } = await supabase.from('restrictions').insert({
      tenant_id: tenantId,
      position,
      staff_id: staffId,
      hard: resolveHard(parsed.input, parsed.hard),
      ...toRestrictionColumns(parsed.input),
    })
    if (error) throwWriteError(error)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: listPath(tenantId) }
  })
}

export async function updateRestriction(input: {
  tenantId: string
  restrictionId: string
  staffId: string | null
  hard: boolean
  input: RawRestrictionInput
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = updateRestrictionSchema.parse(input)
    const { tenantId, restrictionId, staffId } = parsed
    await requireUser()
    await requireTenant(tenantId)

    const supabase = await createClient()
    const { data: current, error: currentError } = await supabase
      .from('restrictions')
      .select('staff_id, kind')
      .eq('id', restrictionId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (currentError) throw currentError
    if (!current) fail(NOT_FOUND_MESSAGE)
    // 編集画面は種類を変えさせない（006 と同じ）。Action を直接呼んでも変えない: 一手は id と文言で制約を引き直すので、
    // 種類が変わると別の制約になる
    if (current.kind !== parsed.input.kind) fail(KIND_CHANGE_MESSAGE)
    await assertActiveStaff(supabase, tenantId, staffId, current.staff_id)

    const { data, error } = await supabase
      .from('restrictions')
      .update({
        staff_id: staffId,
        hard: resolveHard(parsed.input, parsed.hard),
        ...toRestrictionColumns(parsed.input),
      })
      .eq('id', restrictionId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()
    if (error) throwWriteError(error)
    if (!data) fail(NOT_FOUND_MESSAGE)

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: listPath(tenantId) }
  })
}

export async function deleteRestriction(input: {
  tenantId: string
  restrictionId: string
}): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { tenantId, restrictionId } = deleteRestrictionSchema.parse(input)
    await requireUser()
    await requireTenant(tenantId)

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
    return { redirectTo: listPath(tenantId) }
  })
}

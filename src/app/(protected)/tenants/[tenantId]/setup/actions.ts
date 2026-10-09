'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireTenant, requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { ensureStaffAddition } from '@/lib/billing/addition'
import { throwIfStaffLimit } from '@/lib/billing/limit'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { type SetupPatternsInput, toRpcPatterns } from '@/lib/setup/patternsState'
import { shiftsHref } from '@/lib/tenants/navigation'
import {
  completeSetupSchema,
  saveSetupPatternsSchema,
  updateSetupTenantSchema,
} from '@/lib/validation/setup'
import { acknowledgedPeakSchema } from '@/lib/validation/billing'
import { TENANT_NOT_FOUND_MESSAGE } from '@/lib/validation/tenants'
import { createClient } from '@/utils/supabase/server'

/**
 * 初期設定の書き込み（014 §5.5）。
 *
 * 店舗がすでに完了していたら（二度押し・別のタブで完成させたあとの古いタブ）、エラーにせず
 * `{ redirectTo }` でシフト表へ送る。`redirectTo: null` のときは次のステップへ進んでよい。
 */
type SetupResult = ActionResult<{ redirectTo: string | null }>

const shiftsPath = (tenantId: string) => shiftsHref(tenantId)

/**
 * RPC の `raise exception` を画面の文言に写す（`shifts/actions.ts` の `RPC_MESSAGES` と同じ形）。
 * `toActionError` は Zod と `ActionError` しか訳さないので、ここで写さないと「処理に失敗しました」になる。
 * `setup completed` はここに入れず、呼び出し側で redirectTo にする。
 */
const RPC_MESSAGES: { match: string; message: string }[] = [
  { match: 'tenant not found', message: TENANT_NOT_FOUND_MESSAGE },
  { match: 'no patterns', message: '勤務を 1 つ以上残してください' },
  { match: 'no staffs', message: '名前を 1 人以上入れてください' },
  // 通常の流れでは起きない（準備中の店舗にはスタッフがいない。014 §5.2）
  { match: 'has staffs', message: 'この店舗はすでに使われているため、初期設定では変更できません' },
]

const SETUP_COMPLETED = 'setup completed'

function failFromRpc(error: { message: string }): never {
  // 在籍の上限（019 §5.3）。画面は code を見て案内のモーダルを開く
  throwIfStaffLimit(error)
  const known = RPC_MESSAGES.find((entry) => error.message.includes(entry.match))
  if (known) fail(known.message)
  throw error
}

/** ステップ 1 に戻って店名・周期・週の始まりを直す。1ヶ月・半月は週の始まりを日曜に戻す（Zod の transform） */
export async function updateSetupTenant(input: {
  tenantId: string
  name: string
  shiftCycle: ShiftCycle
  startOfWeek: number | null
}): Promise<SetupResult> {
  return runAction(async () => {
    const { tenantId, name, shiftCycle, startOfWeek } = updateSetupTenantSchema.parse(input)
    const user = await requireUser()
    const tenant = await requireTenant(tenantId)
    // 完了済みの店舗の週の始まりを、古いタブから日曜に戻さない
    if (tenant.setup_completed_at) return { redirectTo: shiftsPath(tenantId) }

    const supabase = await createClient()
    const { error } = await supabase
      .from('tenants')
      .update({ name, shift_cycle: shiftCycle, start_of_week: startOfWeek })
      .eq('id', tenantId)
      .eq('owner_id', user.id)
    if (error) throw error

    revalidatePath(`/tenants/${tenantId}`, 'layout')
    return { redirectTo: null }
  })
}

/** ステップ 2: 勤務をまとめて保存する（置き換え）。id はここで振る（ペアを id で書くため） */
export async function saveSetupPatterns(
  input: SetupPatternsInput & { tenantId: string }
): Promise<SetupResult> {
  return runAction(async () => {
    const { tenantId, patterns, pair } = saveSetupPatternsSchema.parse(input)
    await requireUser()

    // RPC が先頭で tenant not found を投げるので requireTenant() は呼ばない（往復を 1 回にする）
    const supabase = await createClient()
    const { error } = await supabase.rpc('save_setup_patterns', {
      p_tenant_id: tenantId,
      p_patterns: toRpcPatterns({ patterns, pair }, randomUUID),
    })
    if (error) {
      if (error.message.includes(SETUP_COMPLETED)) return { redirectTo: shiftsPath(tenantId) }
      failFromRpc(error)
    }

    // 再検証しない: 画面の状態はウィザードが持っていて、/setup は動的なので次に開けば読み直す
    return { redirectTo: null }
  })
}

/** ステップ 3: スタッフを作って完了を記録する。次はシフト表 */
export async function completeSetup(
  input: {
    tenantId: string
    names: string[]
  },
  options: { acknowledgedPeak?: number } = {}
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { tenantId, names } = completeSetupSchema.parse(input)
    const acknowledgedPeak = acknowledgedPeakSchema.parse(options.acknowledgedPeak)
    const user = await requireUser()

    const supabase = await createClient()
    // 二度押しの 2 回目・古いタブは、店舗がもう完了している。名前の数だけ増えるとして判定すると、
    // 完了済みなのに上限・料金のモーダルが出るので、完了済みなら判定を飛ばしてシフト表へ送る
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('setup_completed_at')
      .eq('id', tenantId)
      .maybeSingle()
    if (tenantError) throw tenantError
    if (tenant?.setup_completed_at) return { redirectTo: shiftsPath(tenantId) }
    // 有料プランの上限人数と、料金が上がる追加の確認（019 §13.5）。まとめて貼ったときに一番効く。
    // 見えない店舗（tenant が null）は RPC が tenant not found で断る
    if (tenant) await ensureStaffAddition(user.id, { adding: names.length, acknowledgedPeak })

    const { error } = await supabase.rpc('complete_setup', {
      p_tenant_id: tenantId,
      p_staff_names: names,
    })
    // 二度押しの 2 回目は、1 回目で完了している
    if (error && !error.message.includes(SETUP_COMPLETED)) failFromRpc(error)

    // revalidatePath しない。Server Action の revalidatePath は表示中のページ（/setup）をその場で描き直し、
    // 完了済みの /setup はシフト表へ redirect するので、完成の画面を飛ばしてしまう。
    // シフト表へはクライアントが全体の読み込みで移る（店舗の枠が「準備中 → TenantShell」に変わるため。014 実装ログ）
    return { redirectTo: shiftsPath(tenantId) }
  })
}

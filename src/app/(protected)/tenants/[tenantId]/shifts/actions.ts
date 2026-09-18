'use server'

import { refresh } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { datesBetween } from '@/lib/calendar/dateString'
import { isHolidayDate } from '@/lib/calendar/holidays'
import { dayKeyFor } from '@/lib/calendar/weekdays'
import { defaultRequiredNum, parseRequiredNums } from '@/lib/patterns/requiredNums'
import { saveDateNoteSchema } from '@/lib/validation/dateNotes'
import { saveRequiredNumsSchema, setDefaultRequiredNumsSchema } from '@/lib/validation/requiredNums'
import { assignShiftSchema } from '@/lib/validation/shifts'
import type { Database } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

type RequiredNumRow = Database['public']['Tables']['required_nums']['Insert']

/**
 * RPC の `raise exception` を画面の文言に写す（007 §4）。
 * RLS で見えない行も「存在しない」と同じ文言にして、他店舗の存在を漏らさない。
 */
const RPC_MESSAGES: { match: string; message: string }[] = [
  { match: 'staff not found', message: 'スタッフが見つかりません' },
  { match: 'pattern not found', message: '勤務パターンが見つかりません' },
]

function failFromRpc(error: { message: string }): never {
  const known = RPC_MESSAGES.find((entry) => error.message.includes(entry.match))
  if (known) fail(known.message)
  throw error
}

/**
 * RLS 違反（42501）を「店舗が見つかりません」に写す。
 *
 * INSERT / upsert は 006 の UPDATE / DELETE と違い「0 行」ではなく例外になるので、
 * そのままだと汎用の「処理に失敗しました」が出る。他店舗の `tenantId` を渡された場合で、
 * 画面からは起こらないが、`assign_shift` 側（not found）と同じ粒度の文言にそろえる。
 */
function failIfForbidden(error: { code?: string; message: string }): never {
  if (error.code === '42501') fail(TENANT_NOT_FOUND_MESSAGE)
  throw error
}

const TENANT_NOT_FOUND_MESSAGE = '店舗が見つかりません'
const PATTERN_NOT_FOUND_MESSAGE = '勤務パターンが見つかりません'

/**
 * 必要人数の書き込みで出る 2 つのエラーを文言に写す。
 *
 * - 42501: 他店舗の `tenantId`（RLS の WITH CHECK 違反）
 * - 23503: 複合 FK `(pattern_id, tenant_id)` 違反。**別タブで勤務パターンが削除された**ときに
 *   画面が古いまま保存するとここに来る。`assign_shift` と同じ文言にし、呼び出し側が読み直す
 */
function failFromRequiredNumsError(error: { code?: string; message: string }): never {
  if (error.code === '23503') fail(PATTERN_NOT_FOUND_MESSAGE)
  failIfForbidden(error)
}

/**
 * セルのアサイン（007 §3.2）。
 *
 * 既存削除 → ペア処理 → 作成を 1 トランザクションにするため `assign_shift` RPC を呼ぶ。
 * 「空」（patternId が null）のときは `p_pattern_id` を**渡さない**（SQL 側の既定値 null を使う）。
 */
export async function assignShift(input: {
  tenantId: string
  staffId: string
  date: string
  patternId: string | null
  fixed: boolean
}): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = assignShiftSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { error } = await supabase.rpc('assign_shift', {
      p_tenant_id: parsed.tenantId,
      p_staff_id: parsed.staffId,
      p_date: parsed.date,
      p_fixed: parsed.fixed,
      ...(parsed.patternId ? { p_pattern_id: parsed.patternId } : {}),
    })
    if (error) failFromRpc(error)

    // シフト表の中で完結する書き込みなので、現在のルートだけ再描画する（007 §3.5）
    refresh()
  })
}

/** 日別の必要人数。0 も行として保存する（v1 と同じ。「未設定」と区別しない） */
export async function saveRequiredNums(input: {
  tenantId: string
  date: string
  nums: Record<string, number | ''>
}): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = saveRequiredNumsSchema.parse(input)
    await requireUser()

    const rows: RequiredNumRow[] = Object.entries(parsed.nums).map(([patternId, num]) => ({
      tenant_id: parsed.tenantId,
      pattern_id: patternId,
      date: parsed.date,
      num,
    }))
    if (rows.length === 0) return

    const supabase = await createClient()
    // 他店舗のパターン id を混ぜると複合 FK (pattern_id, tenant_id) が 23503 で 1 行も入れない
    const { error } = await supabase
      .from('required_nums')
      .upsert(rows, { onConflict: 'pattern_id,date' })
    if (error) failFromRequiredNumsError(error)

    refresh()
  })
}

/**
 * 表示期間に一括でデフォルト人数をセットする（v1 の `RequiredNumsController#set_default`）。
 *
 * 対象は出勤日のパターンだけ（006 §10.6）。祝日は `holiday` キーを優先する。
 * v1 は「期間の行を全削除 → 再生成」だったが、upsert 1 回にする（007 §3.6）。
 * 休みに変えたパターンの既存行は消さない（判定に使わないので害が無い）。
 */
export async function setDefaultRequiredNums(input: {
  tenantId: string
  start: string
  end: string
}): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = setDefaultRequiredNumsSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data: patterns, error: patternsError } = await supabase
      .from('patterns')
      .select('id, default_required_nums')
      .eq('tenant_id', parsed.tenantId)
      .eq('kind', 'workday')
    if (patternsError) throw patternsError
    if (patterns.length === 0) {
      // 他店舗の id を渡された場合も RLS で 0 行になる。「パターンが無い」と混同しないよう切り分ける
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id')
        .eq('id', parsed.tenantId)
        .maybeSingle()
      if (tenantError) throw tenantError
      fail(tenant ? '出勤日の勤務パターンがありません' : TENANT_NOT_FOUND_MESSAGE)
    }

    const dates = datesBetween(parsed.start, parsed.end)
    const rows: RequiredNumRow[] = []
    for (const pattern of patterns) {
      const defaults = parseRequiredNums(pattern.default_required_nums)
      for (const date of dates) {
        rows.push({
          tenant_id: parsed.tenantId,
          pattern_id: pattern.id,
          date,
          num: defaultRequiredNum(defaults, dayKeyFor(date, isHolidayDate(date))),
        })
      }
    }

    const { error } = await supabase
      .from('required_nums')
      .upsert(rows, { onConflict: 'pattern_id,date' })
    if (error) failFromRequiredNumsError(error)

    refresh()
  })
}

/** 日付メモ。空文字なら削除（v1 の `EventsController#update`） */
export async function saveDateNote(input: {
  tenantId: string
  date: string
  note: string
}): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = saveDateNoteSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    if (parsed.note === '') {
      const { error } = await supabase
        .from('date_notes')
        .delete()
        .eq('tenant_id', parsed.tenantId)
        .eq('date', parsed.date)
      if (error) failIfForbidden(error)
    } else {
      const { error } = await supabase
        .from('date_notes')
        .upsert(
          { tenant_id: parsed.tenantId, date: parsed.date, note: parsed.note },
          { onConflict: 'tenant_id,date' }
        )
      if (error) failIfForbidden(error)
    }

    refresh()
  })
}

'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { refresh } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireTenant, requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { datesBetween } from '@/lib/calendar/dateString'
import { holidaysIn, isHolidayDate } from '@/lib/calendar/holidays'
import { dayKeyFor } from '@/lib/calendar/weekdays'
import { defaultRequiredNum, parseRequiredNums } from '@/lib/patterns/requiredNums'
import { listActiveStaffsWithDefaultPatterns } from '@/lib/queries/staffs'
import { planDefaultPatterns, type PlannedShift } from '@/lib/shifts/planDefaultPatterns'
import { saveDateNoteSchema } from '@/lib/validation/dateNotes'
import { saveRequiredNumsSchema, setDefaultRequiredNumsSchema } from '@/lib/validation/requiredNums'
import {
  assignShiftSchema,
  bulkShiftsSchema,
  clearDraftShiftsSchema,
  copyShiftsSchema,
  setDefaultPatternsSchema,
} from '@/lib/validation/shifts'
import { PATTERN_NOT_FOUND_MESSAGE } from '@/lib/validation/patterns'
import { STAFF_NOT_FOUND_MESSAGE } from '@/lib/validation/staffs'
import { TENANT_NOT_FOUND_MESSAGE } from '@/lib/validation/tenants'
import type { Database } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

type RequiredNumRow = Database['public']['Tables']['required_nums']['Insert']
type ShiftRow = Database['public']['Tables']['shifts']['Insert']
type Client = SupabaseClient<Database>
type DbError = { code?: string; message: string }

/**
 * RPC の `raise exception` を画面の文言に写す（007 §4）。
 * RLS で見えない行も「存在しない」と同じ文言にして、他店舗の存在を漏らさない。
 */
const RPC_MESSAGES: { match: string; message: string }[] = [
  { match: 'tenant not found', message: TENANT_NOT_FOUND_MESSAGE },
  { match: 'staff not found', message: STAFF_NOT_FOUND_MESSAGE },
  { match: 'pattern not found', message: PATTERN_NOT_FOUND_MESSAGE },
  {
    match: 'no source',
    message: 'コピー元に条件に合うシフトがありません（勤務パターンの選択を確認してください）',
  },
]

function failFromRpc(error: { message: string }): never {
  const known = RPC_MESSAGES.find((entry) => error.message.includes(entry.match))
  if (known) fail(known.message)
  throw error
}

/**
 * RLS 違反（42501）を「店舗が見つかりません」に写す。
 *
 * INSERT / upsert は UPDATE / DELETE と違い「0 行」ではなく例外になるので、
 * そのままだと汎用の「処理に失敗しました」が出る。`assign_shift` 側（not found）と同じ粒度の文言にそろえる。
 */
function failIfForbidden(error: DbError): never {
  if (error.code === '42501') fail(TENANT_NOT_FOUND_MESSAGE)
  throw error
}

/**
 * 複合 FK 違反（23503）を文言に写し、それ以外は `failIfForbidden` へ。
 *
 * 23503 は **別タブでスタッフや勤務パターンが削除された**ときに、画面が古いまま書き込むと来る。
 * `assign_shift` と同じ文言にし、呼び出し側（Client）が読み直す。
 */
function failFromFkError(error: DbError, fkMessage: string): never {
  if (error.code === '23503') fail(fkMessage)
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
    if (error) failFromFkError(error, PATTERN_NOT_FOUND_MESSAGE)

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
    // 店舗の確認と読み取りは独立なので並行に。見えない店舗なら読み取りは空で、書き込む前に requireTenant が投げる
    const [, { data: patterns, error: patternsError }] = await Promise.all([
      requireTenant(parsed.tenantId),
      supabase
        .from('patterns')
        .select('id, default_required_nums')
        .eq('tenant_id', parsed.tenantId)
        .eq('kind', 'workday'),
    ])
    if (patternsError) throw patternsError
    if (patterns.length === 0) fail('出勤日の勤務パターンがありません')

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
    if (error) failFromFkError(error, PATTERN_NOT_FOUND_MESSAGE)

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

// ---------------------------------------------------------------------------
// 一括操作（008）
// ---------------------------------------------------------------------------

/**
 * 表示期間（またはそのスタッフ）のシフトをすべて確定 / 下書きにする（v1 `ShiftsController#fixed` / `#unfixed`）。
 *
 * RPC `set_shifts_fixed`（008 §10.13）: 対象は「表に出ている在籍スタッフ」の行だけ。この絞り込みは `staffs` との join なので
 * PostgREST の UPDATE では書けず、RPC にした。1 文で原子的、件数は戻り値。
 * ペアは見ない（v1 と同じ。`fixed` を変えるだけでシフトの構成は変わらない）。
 *
 * 店舗・スタッフの可視性は RPC の中で確かめて not found にする（往復 1 回）。
 */
export async function setShiftsFixed(input: {
  tenantId: string
  start: string
  end: string
  staffId?: string | null
  fixed: boolean
}): Promise<ActionResult<{ affected: number }>> {
  return runAction(async () => {
    const parsed = bulkShiftsSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data: affected, error } = await supabase.rpc('set_shifts_fixed', {
      p_tenant_id: parsed.tenantId,
      p_start: parsed.start,
      p_end: parsed.end,
      p_fixed: parsed.fixed,
      p_staff_id: parsed.staffId ?? undefined,
    })
    if (error) failFromRpc(error)

    refresh()
    return { affected }
  })
}

/**
 * 表示期間（またはそのスタッフ）の下書きシフトを消す（v1 `ShiftsController#clear`）。
 *
 * RPC `clear_draft_shifts`。確定シフトは残す。**ペアは消さない**（v1 も `delete_pair` を呼んでいない。008 §2）:
 * 夜勤が下書きで明けが確定なら、明けだけが残る。
 */
export async function clearDraftShifts(input: {
  tenantId: string
  start: string
  end: string
  staffId?: string | null
}): Promise<ActionResult<{ affected: number }>> {
  return runAction(async () => {
    const parsed = clearDraftShiftsSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data: affected, error } = await supabase.rpc('clear_draft_shifts', {
      p_tenant_id: parsed.tenantId,
      p_start: parsed.start,
      p_end: parsed.end,
      p_staff_id: parsed.staffId ?? undefined,
    })
    if (error) failFromRpc(error)

    refresh()
    return { affected }
  })
}

/**
 * 計画した行を `shifts` に入れる。**アサイン済みのセルは上書きしない**（008 §3.2）。
 *
 * `ignoreDuplicates` = `on conflict (staff_id, date) do nothing`。1 文なので、途中で複合 FK 違反が出ても半端に入らない。
 * `count` は「実際に入った行数」（弾かれた行は含まない。3 件中 1 件が衝突なら 2）なので、
 * 「全部アサイン済みで何も起きなかった」を成功と区別して伝えられる。
 * `count: 'exact'` を付けた POST に PostgREST は必ず Content-Range ヘッダで件数を返すので、無ければ実装の誤り（`pageAll` と同じ扱い）。
 */
async function insertPlannedShifts(
  supabase: Client,
  tenantId: string,
  planned: PlannedShift[]
): Promise<number> {
  const rows: ShiftRow[] = planned.map((row) => ({
    tenant_id: tenantId,
    staff_id: row.staffId,
    pattern_id: row.patternId,
    date: row.date,
    // 一括で入れたものは見直す前提なので下書き（v1 と同じ）
    fixed: false,
  }))

  const { count, error } = await supabase
    .from('shifts')
    .upsert(rows, { onConflict: 'staff_id,date', ignoreDuplicates: true, count: 'exact' })
  // どちらの FK かは区別しないで 1 つの文言にする
  if (error) failFromFkError(error, 'スタッフまたは勤務パターンが見つかりません')
  // null だけでなく NaN も弾く（Content-Range が `*/*` なら parseInt は NaN を返し、=== null をすり抜ける）
  if (count === null || !Number.isFinite(count)) {
    throw new Error('insertPlannedShifts: count が返らなかった')
  }

  return count
}

/**
 * スタッフのデフォルト勤務パターンを表示期間にセットする（v1 `ShiftsController#set_default`）。
 *
 * 未アサインの日だけ埋める。祝日は `holiday` キーを優先する。
 * 選択可能な勤務パターン / 勤務できる曜日では絞らず、ペアも張らない（v1 と同じ。008 §3.5）。
 */
export async function setDefaultPatterns(input: {
  tenantId: string
  start: string
  end: string
}): Promise<ActionResult<{ inserted: number }>> {
  return runAction(async () => {
    const parsed = setDefaultPatternsSchema.parse(input)
    await requireUser()

    // クエリが「設定を 1 つ以上持つ在籍スタッフ」だけを返す（!inner）
    const [, withDefaults] = await Promise.all([
      requireTenant(parsed.tenantId),
      listActiveStaffsWithDefaultPatterns(parsed.tenantId),
    ])
    if (withDefaults.length === 0) fail('デフォルト勤務パターンが設定されたスタッフがいません')

    const dates = datesBetween(parsed.start, parsed.end)
    const planned = planDefaultPatterns(withDefaults, dates, new Set(holidaysIn(dates)))
    // 設定はあるが期間に当たらない（例: `holiday` キーだけ設定していて祝日が無い期間）
    if (planned.length === 0) fail('この期間にセットできるデフォルト勤務パターンがありません')

    const supabase = await createClient()
    const inserted = await insertPlannedShifts(supabase, parsed.tenantId, planned)

    refresh()
    return { inserted }
  })
}

/**
 * シフトコピー（v1 `Shifts::CopyController#create`）。
 *
 * RPC `copy_shifts`（008 §10.15）: コピー元の在籍スタッフの行を、選んだ勤務パターンだけ、コピー先の開始日にずらして
 * `insert ... select` 1 文で写す。行を app に往復させず、在籍の絞り込みは一括操作と同じ SQL の規則、
 * 読み書きが 1 文なのでスナップショットとして一貫する。コピー先が埋まっているセルは上書きしない。
 * `fixed` は引き継がず下書きで入る（v1 と同じ。008 §3.6）。戻り値は実際に入った行数。
 *
 * 店舗の可視性と「コピー元に条件に合う行が無い」は RPC が例外にし、`RPC_MESSAGES` で文言に写す。
 */
export async function copyShifts(input: {
  tenantId: string
  fromStart: string
  fromEnd: string
  toStart: string
  patternIds: string[]
}): Promise<ActionResult<{ inserted: number }>> {
  return runAction(async () => {
    const parsed = copyShiftsSchema.parse(input)
    await requireUser()

    const supabase = await createClient()
    const { data: inserted, error } = await supabase.rpc('copy_shifts', {
      p_tenant_id: parsed.tenantId,
      p_from_start: parsed.fromStart,
      p_from_end: parsed.fromEnd,
      p_to_start: parsed.toStart,
      p_pattern_ids: parsed.patternIds,
    })
    if (error) failFromRpc(error)

    refresh()
    return { inserted }
  })
}

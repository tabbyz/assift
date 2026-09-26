import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fail } from '@/lib/actions/error'
import { ASSIST_RUNNING_MESSAGE } from '@/lib/validation/assist'
import type { Database, Json } from '@/types/database'
import { cellKey } from '@/lib/shifts/key'
import { pageAll } from '@/lib/queries/pageAll'
import type { PlanRow } from './problem'
import { parseAssistRequest, parseAssistResult, type AssistResult } from './result'
import type { StoredDirectives } from './run'

type Client = SupabaseClient<Database>

/**
 * `assist_runs` の出し入れ（012 §5.7 / §5.8）。load.ts と同じくクライアントを引数で受け、すべてに tenant_id を書く。
 */

/** 打ち切られた running（関数のタイムアウト等）を failed にする目安 */
const STALE_MINUTES = 10

/** 店舗ごと 1 日の実行回数（§3.6）。成功・失敗を問わず数える（連打を防ぐ）。ローカル・preview では大きくしてテストする */
export function assistDailyLimit(): number {
  const value = Number.parseInt(process.env.ASSIST_DAILY_LIMIT ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : 10
}

/** JST の今日の 0 時（`created_at` と比べる timestamptz） */
export function jstDayStart(today: string): string {
  return `${today}T00:00:00+09:00`
}

/**
 * 関数が打ち切られると `running` が残り、partial unique で次の実行を永久に弾く。
 * 始める前に、10 分以上更新の無い running を failed（`error = 'timed out'`）にする（§5.7）。
 */
export async function markStaleRuns(
  supabase: Client,
  tenantId: string,
  now = new Date()
): Promise<void> {
  const threshold = new Date(now.getTime() - STALE_MINUTES * 60_000).toISOString()
  const { error } = await supabase
    .from('assist_runs')
    .update({ status: 'failed', error: 'timed out' })
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .lt('updated_at', threshold)
  if (error) throw error
}

export async function countRunsSince(
  supabase: Client,
  tenantId: string,
  since: string
): Promise<number> {
  const { count, error } = await supabase
    .from('assist_runs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
  if (error) throw error
  if (count === null) throw new Error('countRunsSince: count が返らなかった')
  return count
}

/** running の行を 1 つ作る。同じ店舗で実行中なら partial unique の 23505 */
export async function createRunningRun(
  supabase: Client,
  row: { tenantId: string; start: string; end: string; instructions: string; models: Json }
): Promise<string> {
  const { data, error } = await supabase
    .from('assist_runs')
    .insert({
      tenant_id: row.tenantId,
      start_date: row.start,
      end_date: row.end,
      instructions: row.instructions || null,
      models: row.models,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') fail(ASSIST_RUNNING_MESSAGE)
    throw error
  }
  return data.id
}

/** 次の実行が読み直す前の run（「別の案」§3.10 / 一手の実行 §11.3） */
export type PreviousRun = {
  id: string
  period: { start: string; end: string }
  instructions: string
  result: AssistResult
  /** 解決済みの指示。012 §11 より前の run・壊れた request は null（本文を解釈し直す） */
  directives: StoredDirectives | null
}

/**
 * 成功した、元に戻していない run。見えない・成功していない・元に戻した run は null。
 * 「別の案」は rollback で `shifts` から消えるので、先に `result.plan` を読んでおく。
 */
export async function loadPreviousRun(
  supabase: Client,
  tenantId: string,
  runId: string
): Promise<PreviousRun | null> {
  const { data, error } = await supabase
    .from('assist_runs')
    .select('id, start_date, end_date, instructions, request, result')
    .eq('tenant_id', tenantId)
    .eq('id', runId)
    .eq('status', 'succeeded')
    .is('rolled_back_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const result = parseAssistResult(data.result)
  if (!result) return null
  const request = parseAssistRequest(data.request)
  return {
    id: data.id,
    period: { start: data.start_date, end: data.end_date },
    instructions: data.instructions ?? '',
    result,
    directives: request
      ? {
          directives: request.directives,
          interpretations: request.interpretations,
          disabled: request.disabledDirectives,
        }
      : null,
  }
}

/**
 * その run の、いま表に残っている下書き（一手の実行で残す行。§11.3）。
 * 確定に変えた行・手で書き換えた行は run から外れているので含まない。ペアかどうかは `result.plan` から引く
 */
export async function loadRunDrafts(
  supabase: Client,
  tenantId: string,
  run: PreviousRun
): Promise<PlanRow[]> {
  const rows = await pageAll((from, to, withCount) =>
    supabase
      .from('shifts')
      .select('staff_id, date, pattern_id', withCount ? { count: 'exact' } : undefined)
      .eq('tenant_id', tenantId)
      .eq('assist_run_id', run.id)
      .eq('fixed', false)
      .order('date', { ascending: true })
      .order('staff_id', { ascending: true })
      .range(from, to)
  )
  const sources = new Map(
    run.result.plan.map((row) => [`${cellKey(row.staffId, row.date)}|${row.patternId}`, row.source])
  )
  return rows.map((row) => ({
    staffId: row.staff_id,
    date: row.date,
    patternId: row.pattern_id,
    source: sources.get(`${cellKey(row.staff_id, row.date)}|${row.pattern_id}`) ?? 'assign',
  }))
}

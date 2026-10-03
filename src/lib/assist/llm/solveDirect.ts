import 'server-only'
import { z } from 'zod'
import { formatMonthDay, wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { strengthLabel } from '@/lib/restrictions/kinds'
import type { LlmUsage } from '../pricing'
import { withPair, type PlanRow, type Problem } from '../problem'
import { restrictionLabel, validatePlan, type RejectedUnit } from '../validate'
import type { AssistLlm } from './client'
import { callStructured } from './structured'

/**
 * 案 A（LLM が割り当てを直接書く）の比較用ランナー（012 §3.1 / §6.3）。**評価スクリプトだけが使う。本番の経路には入れない。**
 *
 * LLM がセルを書き、同じ検証器（validate.ts）が違反を落とし、違反と残りを返して書き直させる（最大 `rounds` 往復）。
 * `Plan` を返す形にしてあるので、ソルバーと同じ指標・同じ検証で比べられる。
 */

const outputSchema = z.object({
  assignments: z.array(z.object({ staff: z.string(), date: z.string(), pattern: z.string() })),
})

const INSTRUCTIONS = `あなたはシフト表を作ります。入力の「埋める枠」に、条件を満たすスタッフを割り当ててください。
- 1 人 1 日 1 枠。すでにシフトが入っているマスには入れない
- スタッフの勤務できる曜日・選択できるパターン・週の上限日数を守る
- ペアのあるパターン（例: 夜勤 → 明け）は翌日にペアが自動で入る。翌日が埋まっている人には入れない
- 自動アサイン制約の「必須」は守る。「なるべく」はできるだけ守る（行頭の S コードはそのスタッフだけの制約）
- 枠の人数を超えない。埋められない枠は残してよい
assignments には割り当て（staff は S コード、pattern は P コード、date は YYYY-MM-DD）だけを書く。ペアの行は書かない`

function problemText(problem: Problem): string {
  const day = (date: string) => `${date}（${WEEKDAY_LABELS[wday(date)]}）`
  const existing = [...problem.existing]
    .map(([key, patternId]) => {
      const [staffId, date] = key.split(':')
      return `${problem.staffById.get(staffId)?.code} ${date} ${problem.patternById.get(patternId)?.code}`
    })
    .sort()
  return [
    '# スタッフ',
    ...problem.staffs.map(
      (staff) =>
        `${staff.code}: 曜日 ${[...staff.availableWdays].map((d) => WEEKDAY_LABELS[d]).join('')} / 週 ${staff.maxWorkWeek}日まで / パターン ${[...staff.patternIds].map((id) => problem.patternById.get(id)?.code).join(',')}`
    ),
    '# パターン',
    ...problem.patterns.map(
      (pattern) =>
        `${pattern.code} ${pattern.name}（${pattern.kind === 'workday' ? '勤務日' : '休み'}）${pattern.pairPatternId ? ` ペア → ${problem.patternById.get(pattern.pairPatternId)?.code}` : ''}`
    ),
    `# 週の始まり: ${WEEKDAY_LABELS[problem.startOfWeek]}曜日`,
    '# 自動アサイン制約',
    // スタッフ別の制約は名前ではなく S コードで書く（スタッフ一覧が S コードだけなので）
    ...problem.restrictions.map((restriction) => {
      const owner = restriction.staffId ? problem.staffById.get(restriction.staffId)?.code : null
      const body = restrictionLabel(problem, { ...restriction, staffId: null })
      return `- ${owner ? `${owner}: ` : ''}${body}（${strengthLabel(restriction.hard)}）`
    }),
    '# 埋める枠（日付 パターン 人数）',
    ...problem.demand.map(
      (slot) => `${day(slot.date)} ${problem.patternById.get(slot.patternId)?.code} ${slot.count}`
    ),
    '# すでに入っているシフト（スタッフ 日付 パターン）',
    ...existing,
  ].join('\n')
}

function rejectionText(problem: Problem, rejected: RejectedUnit[]): string {
  return rejected
    .slice(0, 80)
    .map((unit) => {
      const row = unit.rows[0]
      return `- ${problem.staffById.get(row.staffId)?.code ?? row.staffId} ${formatMonthDay(row.date)} ${problem.patternById.get(row.patternId)?.code ?? row.patternId}: ${unit.violations.map((v) => v.message).join(' / ')}`
    })
    .join('\n')
}

export async function solveDirect(
  llm: AssistLlm,
  problem: Problem,
  options: { model?: string; rounds?: number } = {}
): Promise<{ plan: PlanRow[]; rounds: number; usages: LlmUsage[] }> {
  const model = options.model ?? llm.models.interpret
  const rounds = options.rounds ?? 3
  const staffByCode = new Map(problem.staffs.map((staff) => [staff.code, staff.id]))
  const patternByCode = new Map(problem.patterns.map((pattern) => [pattern.code, pattern.id]))
  const usages: LlmUsage[] = []

  let input = problemText(problem)
  let accepted: PlanRow[] = []
  let round = 0
  for (; round < rounds; round++) {
    const { parsed, usage } = await callStructured(llm, {
      model,
      instructions: INSTRUCTIONS,
      input,
      schema: outputSchema,
      name: 'assist_direct_plan',
      effort: 'high',
      maxOutputTokens: 64_000,
      // 1 か月分のセルを書くので 60 秒では終わらない。評価専用なので 10 分待ち、再試行はしない
      request: { timeoutMs: 600_000, maxRetries: 0 },
    })
    usages.push(usage)

    const plan = parsed.assignments.flatMap((item) => {
      const staffId = staffByCode.get(item.staff)
      const patternId = patternByCode.get(item.pattern)
      // 知らないコードはそのまま渡して H11 で落とさせる
      return withPair(problem, {
        staffId: staffId ?? item.staff,
        date: item.date,
        patternId: patternId ?? item.pattern,
      })
    })
    const result = validatePlan(problem, plan)
    accepted = result.accepted
    if (result.rejected.length === 0) break
    input = `${problemText(problem)}\n\n# 前回の案で条件を破った割り当て（直して全体を出し直す）\n${rejectionText(problem, result.rejected)}`
  }

  return { plan: accepted, rounds: Math.min(round + 1, rounds), usages }
}

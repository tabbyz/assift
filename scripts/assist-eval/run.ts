/**
 * 自動アサインの評価（012 §6.3）。API を使うので手動実行。CI には入れない。
 *
 *   npm run assist:eval -- --fixture large --engine solver --repeat 3
 *   npm run assist:eval -- --fixture all --engine llm-direct          # 案 A（LLM 直接 + 検証器）との比較
 *   npm run assist:eval -- --interpret                                # 指示の例文 20 本の解釈の正解率
 *   npm run assist:eval -- --fixture small --instructions "青木さんは土日に多め"
 *   npm run assist:eval -- --fixture all --levers                     # 効く一手（012 §11.2）の試算と所要時間
 *
 * `--engine solver` は API キー無しでも動く（指示の解釈だけが LLM）。
 * 出力は Markdown の表。重み（weights.ts）・effort・モデルはこれで決め、結果を 012 の実装ログに残す。
 */
import { parseArgs } from 'node:util'
import type { Directive } from '@/lib/assist/directives'
import { planAssignments } from '@/lib/assist/engine'
import { getAssistLlm, type AssistLlm } from '@/lib/assist/llm/client'
import { interpretInstructions } from '@/lib/assist/llm/interpret'
import { solveDirect } from '@/lib/assist/llm/solveDirect'
import { computeMetrics } from '@/lib/assist/metrics'
import { totalCost, type LlmUsage } from '@/lib/assist/pricing'
import { evaluateLevers } from '@/lib/assist/levers'
import { buildProblem, type PlanRow, type Problem } from '@/lib/assist/problem'
import { explainUnfilled } from '@/lib/assist/reasons'
import { fixtureInput, type FixtureScale } from '@/lib/assist/testing/fixtures'
import { validatePlan } from '@/lib/assist/validate'
import { INSTRUCTION_CASES } from './instructions'

const { values } = parseArgs({
  options: {
    fixture: { type: 'string', default: 'all' },
    engine: { type: 'string', default: 'solver' },
    repeat: { type: 'string', default: '1' },
    seed: { type: 'string', default: '1' },
    instructions: { type: 'string', default: '' },
    interpret: { type: 'boolean', default: false },
    levers: { type: 'boolean', default: false },
  },
  allowPositionals: true,
})

const scales: FixtureScale[] =
  values.fixture === 'all' ? ['small', 'medium', 'large'] : [values.fixture as FixtureScale]
const repeat = Math.max(1, Number(values.repeat))
const baseSeed = Number(values.seed)

function requireLlm(): AssistLlm {
  const llm = getAssistLlm()
  if (!llm) {
    console.error(
      'AI_GATEWAY_API_KEY が無いので LLM を使う評価はできません（--engine solver は動きます）'
    )
    process.exit(1)
  }
  return llm
}

type Row = {
  fixture: string
  seed: number
  engine: string
  requested: number
  filled: number
  rejected: number
  metrics: ReturnType<typeof computeMetrics>
  usages: LlmUsage[]
  ms: Record<string, number>
  note: string
}

async function runOnce(scale: FixtureScale, seed: number): Promise<Row> {
  const problem = buildProblem(fixtureInput({ scale, seed }))
  const usages: LlmUsage[] = []
  const ms: Record<string, number> = {}
  let directives: Directive[] = []
  let note = ''

  if (values.instructions) {
    const at = Date.now()
    const interpreted = await interpretInstructions(requireLlm(), problem, values.instructions)
    ms.interpret = Date.now() - at
    directives = interpreted.directives
    usages.push(interpreted.usage)
    note = `条件 ${directives.length} 件`
  }

  let plan: PlanRow[]
  const at = Date.now()
  if (values.engine === 'llm-direct') {
    const direct = await solveDirect(requireLlm(), problem)
    plan = direct.plan
    usages.push(...direct.usages)
    note = `${direct.rounds} 往復`
  } else {
    const solved = await planAssignments(problem, { directives })
    plan = solved.plan
    note = [note, solved.solver.stages.map((stage) => stage.status).join(' → ')]
      .filter(Boolean)
      .join(' / ')
  }
  ms.solve = Date.now() - at

  const validation = validatePlan(problem, plan)
  const metrics = computeMetrics(problem, validation.accepted)

  if (values.levers) {
    const input = fixtureInput({ scale, seed })
    const unfilled = explainUnfilled(problem, validation.accepted, {
      shortageOptimal: true,
      hardDirectives: directives.some((directive) => directive.hard),
    })
    const leversAt = Date.now()
    const levers = await evaluateLevers({
      input,
      saved: validation.accepted,
      directives,
      disabled: new Set(),
      relaxed: false,
      unfilled,
    })
    ms.levers = Date.now() - leversAt
    console.log(
      `\n[${scale} seed ${seed}] 効く一手 ${levers.length} 件（${ms.levers} ms）\n${levers.map((lever) => `- ${lever.label}: +${lever.gain} 枠`).join('\n')}`
    )
  }

  return {
    fixture: scale,
    seed,
    engine: values.engine ?? 'solver',
    requested: problem.requested,
    filled: metrics.filled,
    rejected: validation.rejected.length,
    metrics,
    usages,
    ms,
    note,
  }
}

function printRows(rows: Row[]) {
  const header = [
    'fixture',
    'seed',
    'engine',
    '充足',
    '充足率',
    '検証で落ちた',
    '稼働率 min–max (σ)',
    '土日祝 min–max',
    'tokens in/out',
    '費用 $',
    '時間 ms',
    '備考',
  ]
  console.log(`| ${header.join(' | ')} |`)
  console.log(`| ${header.map(() => '---').join(' | ')} |`)
  for (const row of rows) {
    const input = row.usages.reduce((sum, usage) => sum + usage.input, 0)
    const output = row.usages.reduce((sum, usage) => sum + usage.output, 0)
    const cost = totalCost(row.usages)
    const time = Object.entries(row.ms)
      .map(([stage, value]) => `${stage} ${value}`)
      .join(' · ')
    console.log(
      `| ${[
        row.fixture,
        row.seed,
        row.engine,
        `${row.filled}/${row.requested}`,
        `${(row.metrics.fillRate * 100).toFixed(1)}%`,
        row.rejected,
        `${row.metrics.utilization.min}–${row.metrics.utilization.max} (${row.metrics.utilization.stdev})`,
        `${row.metrics.weekends.min}–${row.metrics.weekends.max}`,
        row.usages.length > 0 ? `${input}/${output}` : '-',
        cost === null ? '?' : cost.toFixed(4),
        time,
        row.note,
      ].join(' | ')} |`
    )
  }
}

/** 解釈の正解率: 期待する型・人・ハードが全部出たら正解。「条件にしない」は条件 0 件で正解 */
async function evaluateInterpretation() {
  const llm = requireLlm()
  const problem: Problem = buildProblem(fixtureInput({ scale: 'small', seed: 1 }))
  const nameOf = (id: string) => problem.staffById.get(id)?.name ?? ''
  let correct = 0
  const usages: LlmUsage[] = []
  for (const item of INSTRUCTION_CASES) {
    const result = await interpretInstructions(llm, problem, item.text)
    usages.push(result.usage)
    const ok =
      item.expect === 'none'
        ? result.directives.length === 0
        : item.expect.every((expected) =>
            result.directives.some(
              (directive) =>
                [expected.type].flat().includes(directive.type) &&
                (expected.staff === undefined ||
                  ('staffId' in directive && nameOf(directive.staffId) === expected.staff)) &&
                (expected.staffB === undefined ||
                  ('staffBId' in directive && nameOf(directive.staffBId) === expected.staffB)) &&
                (expected.hard === undefined || directive.hard === expected.hard)
            )
          )
    if (ok) correct++
    console.log(
      `${ok ? '✓' : '✗'} ${item.text} → ${JSON.stringify(result.directives.map((d) => ({ ...d, dates: undefined })))}`
    )
  }
  console.log(
    `\n正解 ${correct} / ${INSTRUCTION_CASES.length}（${llm.models.interpret}）費用 $${totalCost(usages)}`
  )
}

async function main() {
  if (values.interpret) {
    await evaluateInterpretation()
    return
  }
  const rows: Row[] = []
  for (const scale of scales) {
    for (let index = 0; index < repeat; index++) rows.push(await runOnce(scale, baseSeed + index))
  }
  printRows(rows)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

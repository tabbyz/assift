import { z } from 'zod'
import type { Directive } from './directives'

/**
 * `assist_runs.result`（jsonb）の形（012 §5.8）。jsonb は生成型の `Json` のまま受け、ここで型を付け直す（AGENTS.md の型の規約）。
 * Client に渡すのは `AssistRunView`（割り当ての全行 `plan` や検証で落ちた行は渡さない）。
 */

const planRowSchema = z.object({
  staffId: z.string(),
  date: z.string(),
  patternId: z.string(),
  source: z.enum(['assign', 'pair']),
})

const unfilledSchema = z.object({
  date: z.string(),
  patternId: z.string(),
  count: z.number(),
  reason: z.string(),
  candidates: z.number(),
  breakdown: z.array(z.object({ label: z.string(), count: z.number() })),
})

/** `removed` は「この指示を外して作り直す」で外した指示（012 §11.3） */
export const INTERPRETATION_STATUSES = ['kept', 'broken', 'unsupported', 'removed'] as const

const interpretationSchema = z.object({
  /** 店長の指示の原文から抜き出した部分（LLM が書く。空のこともある） */
  text: z.string(),
  /** 条件の 1 行（TS が名前を引いて書く）。条件にできなかったものは null */
  label: z.string().nullable(),
  hard: z.boolean().nullable(),
  status: z.enum(INTERPRETATION_STATUSES),
  detail: z.string().nullable(),
})

/** 効く一手（012 §11.2。`levers.ts` の `Lever`） */
const leverSchema = z.object({
  kind: z.enum(['directive', 'restriction']),
  label: z.string(),
  action: z.enum(['remove', 'relax']),
  relaxedTo: z.number().nullable(),
  directiveIndex: z.number().nullable(),
  /** 012 の途中から。無い run は null（適用時にラベルで引き直す） */
  restrictionIndex: z.number().nullable().default(null),
  gain: z.number(),
  byPattern: z.array(z.object({ patternId: z.string(), count: z.number() })),
  rows: z.array(planRowSchema),
})

export const assistResultSchema = z.object({
  requested: z.number(),
  filled: z.number(),
  unfilled: z.array(unfilledSchema),
  rejected: z.array(
    z.object({
      rows: z.array(planRowSchema),
      violations: z.array(z.object({ code: z.string(), message: z.string() })),
    })
  ),
  /** 保存した割り当て（ペア行を含む。読み戻した行から書く）。「別の案を作る」のペナルティと評価が読む */
  plan: z.array(planRowSchema),
  interpretations: z.array(interpretationSchema),
  /** 012 §11 より前の run には無い */
  levers: z.array(leverSchema).default([]),
  metrics: z.object({
    fillRate: z.number(),
    utilization: z.object({ min: z.number(), max: z.number(), stdev: z.number() }),
    weekends: z.object({ min: z.number(), max: z.number() }),
  }),
  solver: z.object({
    solver: z.string(),
    shortageOptimal: z.boolean(),
    relaxed: z.boolean(),
    variables: z.number(),
    constraints: z.number(),
    elapsedMs: z.number(),
    stages: z.array(
      z.object({ status: z.string(), objective: z.number().nullable(), elapsedMs: z.number() })
    ),
  }),
  /** 「別の案を作る」のとき、前の案から変わった割合（§3.10）。初回は null */
  changedRatio: z.number().nullable(),
  retryOfRunId: z.string().nullable(),
})

export type AssistResult = z.infer<typeof assistResultSchema>
export type AssistUnfilled = z.infer<typeof unfilledSchema>
export type AssistInterpretation = z.infer<typeof interpretationSchema>
export type AssistLever = z.infer<typeof leverSchema>

/**
 * `assist_runs.request`（jsonb）のうち、次の実行が読み直すもの（012 §11.3）。
 * 指示は TS が解決した形をそのまま保存しているので、形の確認は最小限にする（中身は MILP と表示が使うだけ）。
 */
export const assistRequestSchema = z.object({
  directives: z.array(
    z.custom<Directive>((value) => typeof value === 'object' && value !== null && 'type' in value)
  ),
  interpretations: z
    .array(
      z.object({ text: z.string(), directive: z.number().nullable(), note: z.string().nullable() })
    )
    .default([]),
  disabledDirectives: z.array(z.number()).default([]),
})

export type AssistRequest = z.infer<typeof assistRequestSchema>

export function parseAssistRequest(value: unknown): AssistRequest | null {
  const parsed = assistRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** 結果モーダルに渡す形（Client に渡すので列を絞る） */
export type AssistRunView = {
  id: string
  startDate: string
  endDate: string
  createdAt: string
  instructions: string
  requested: number
  filled: number
  unfilled: AssistUnfilled[]
  interpretations: AssistInterpretation[]
  levers: AssistLever[]
  /** ハードな指示をソフトに落として解き直した */
  relaxed: boolean
  /** 「別の案を作る」で、前の案と 1 割未満しか変わらなかった */
  similarToPrevious: boolean
}

export type AssistRunRow = {
  id: string
  start_date: string
  end_date: string
  created_at: string
  instructions: string | null
  result: unknown
}

/** 「前回とほぼ同じ案です」を出す境目（1 割。§3.10） */
export const SIMILAR_PLAN_THRESHOLD = 0.1

export function parseAssistResult(value: unknown): AssistResult | null {
  const parsed = assistResultSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** 壊れた result（手で書き換えた行など）は null。呼び出し側は結果を出さない */
export function toAssistRunView(row: AssistRunRow): AssistRunView | null {
  const result = parseAssistResult(row.result)
  if (!result) return null
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    instructions: row.instructions ?? '',
    requested: result.requested,
    filled: result.filled,
    unfilled: result.unfilled,
    interpretations: result.interpretations,
    levers: result.levers,
    relaxed: result.solver.relaxed,
    similarToPrevious: result.changedRatio !== null && result.changedRatio < SIMILAR_PLAN_THRESHOLD,
  }
}

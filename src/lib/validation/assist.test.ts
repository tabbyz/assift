import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { ASSIST_INSTRUCTIONS_MAX_LENGTH, assistRunSchema, startAssistSchema } from './assist'

const tenantId = '22222222-2222-2222-2222-222222222222'

describe('startAssistSchema', () => {
  it('指示は前後の空白を落とし、500 文字まで', () => {
    const parsed = startAssistSchema.parse({
      tenantId,
      start: '2026-10-01',
      instructions: '  田中さんは土日に多め  ',
      saveNotes: false,
    })
    expect(parsed.instructions).toBe('田中さんは土日に多め')

    const result = startAssistSchema.safeParse({
      tenantId,
      start: '2026-10-01',
      instructions: 'あ'.repeat(ASSIST_INSTRUCTIONS_MAX_LENGTH + 1),
      saveNotes: false,
    })
    expect(result.success).toBe(false)
    expect(toActionError(result.error)).toBe('AI への指示は500文字以内で入力してください')
  })

  it('実在しない開始日・壊れた run id は日本語で弾く', () => {
    const base = { tenantId, instructions: '', saveNotes: false }
    expect(toActionError(startAssistSchema.safeParse({ ...base, start: '2026-02-30' }).error)).toBe(
      '日付が正しくありません'
    )
    expect(
      toActionError(
        startAssistSchema.safeParse({ ...base, start: '2026-10-01', retryOfRunId: 'x' }).error
      )
    ).toBe('自動アサインの実行が見つかりません')
  })

  it('seed のような RFC 非準拠の uuid も通す（z.guid）', () => {
    expect(assistRunSchema.safeParse({ tenantId, runId: tenantId }).success).toBe(true)
  })
})

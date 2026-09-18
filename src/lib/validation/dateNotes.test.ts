import { describe, expect, it } from 'vitest'
import { DATE_NOTE_MAX_LENGTH, saveDateNoteSchema } from './dateNotes'

const base = { tenantId: '22222222-2222-2222-2222-222222222222', date: '2026-09-18' }

describe('saveDateNoteSchema', () => {
  it('メモを通す', () => {
    expect(saveDateNoteSchema.parse({ ...base, note: '運動会' }).note).toBe('運動会')
  })

  it('空文字を通す（削除の意味）', () => {
    expect(saveDateNoteSchema.parse({ ...base, note: '' }).note).toBe('')
    expect(saveDateNoteSchema.parse({ ...base, note: '  ' }).note).toBe('')
  })

  it('前後の空白を落とす', () => {
    expect(saveDateNoteSchema.parse({ ...base, note: ' 運動会 ' }).note).toBe('運動会')
  })

  it('上限ちょうどは通す', () => {
    const note = 'あ'.repeat(DATE_NOTE_MAX_LENGTH)
    expect(saveDateNoteSchema.parse({ ...base, note }).note).toBe(note)
  })

  it('超過は日本語で弾く', () => {
    const result = saveDateNoteSchema.safeParse({
      ...base,
      note: 'あ'.repeat(DATE_NOTE_MAX_LENGTH + 1),
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('メモは12文字以下で入力してください')
  })
})

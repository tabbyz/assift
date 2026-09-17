import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ActionError, GENERIC_ERROR_MESSAGE, fail, toActionError } from './error'

describe('toActionError', () => {
  it('ZodError は先頭 issue のメッセージを返す', () => {
    const schema = z.object({
      name: z.string().min(1, '店舗名は入力必須です'),
      cycle: z.enum(['month', 'week'], { message: '作成周期が不正です' }),
    })
    const result = schema.safeParse({ name: '', cycle: 'year' })
    expect(result.success).toBe(false)
    if (!result.success) expect(toActionError(result.error)).toBe('店舗名は入力必須です')
  })

  it('ActionError はそのメッセージを返す', () => {
    expect(toActionError(new ActionError('ログインが必要です'))).toBe('ログインが必要です')
  })

  it('未知のエラーは汎用メッセージを返す', () => {
    expect(toActionError(new Error('db down'))).toBe(GENERIC_ERROR_MESSAGE)
    expect(toActionError('oops')).toBe(GENERIC_ERROR_MESSAGE)
  })
})

describe('fail', () => {
  it('ActionError を投げる', () => {
    expect(() => fail('だめ')).toThrow(ActionError)
  })
})

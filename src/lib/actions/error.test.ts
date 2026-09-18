import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ActionError,
  GENERIC_ERROR_MESSAGE,
  INVALID_INPUT_MESSAGE,
  fail,
  toActionError,
} from './error'

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

describe('toActionError（型不一致の安全網。006 §3.12）', () => {
  it('invalid_type はスキーマの文言ではなく汎用メッセージにする', () => {
    // NumberInput の空欄（''）が z.int() に届いたときの経路
    const schema = z.object({ n: z.int() })
    const error = schema.safeParse({ n: '' }).error!
    expect(error.issues[0].message).toContain('Invalid input')
    expect(toActionError(error)).toBe(INVALID_INPUT_MESSAGE)
  })

  it('日本語を指定した invalid_type はその文言を出す', () => {
    const schema = z.object({ n: z.int({ error: '週の最大勤務日数を入力してください' }) })
    const error = schema.safeParse({ n: '' }).error!
    // leaf に error を付けてあれば invalid_type でも日本語になる（安全網に落ちない）
    expect(error.issues[0].message).toBe('週の最大勤務日数を入力してください')
  })

  it('invalid_union（discriminatedUnion の判別子違い）も汎用メッセージ', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a') }),
      z.object({ kind: z.literal('b') }),
    ])
    const error = schema.safeParse({ kind: 'c' }).error!
    expect(toActionError(error)).toBe(INVALID_INPUT_MESSAGE)
  })

  it('値の検証（too_small など）は各スキーマの日本語をそのまま出す', () => {
    const schema = z.object({ n: z.int().min(1, { error: '1 以上で入力してください' }) })
    const error = schema.safeParse({ n: 0 }).error!
    expect(toActionError(error)).toBe('1 以上で入力してください')
  })
})

describe('toActionError（入力値が埋め込まれる issue。レビュー指摘 2）', () => {
  it('未知キーに日本語が入っていても英語を出さない', () => {
    // z.partialRecord は `Unrecognized key: "あ"` を返す。キーの日本語で判定をすり抜けていた
    const schema = z.object({ m: z.partialRecord(z.enum(['0', '1']), z.string()) })
    const error = schema.safeParse({ m: { あ: 'x' } }).error!
    expect(error.issues[0].message).toContain('Unrecognized key')
    expect(toActionError(error)).toBe(INVALID_INPUT_MESSAGE)
  })
})

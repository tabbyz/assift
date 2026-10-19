import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { CONTACT_BODY_MAX_LENGTH, contactSchema, parseDigest } from './contact'

const valid = {
  topic: 'bug',
  body: '保存できません',
  requestId: '11111111-1111-1111-1111-111111111111',
}

function errorOf(input: Record<string, unknown>): string {
  const r = contactSchema.safeParse(input)
  if (r.success) throw new Error('通ってしまった')
  return toActionError(r.error)
}

describe('contactSchema', () => {
  it('最小の入力が通る。空の任意の欄は無いものとして扱う', () => {
    const r = contactSchema.parse({ ...valid, email: '', tenantId: '', digest: '' })
    expect(r).toEqual({
      ...valid,
      email: undefined,
      tenantId: undefined,
      digest: undefined,
    })
  })

  it('改行は LF に揃えてから数える（multipart で CRLF になっても、画面で入れた長さで通る）', () => {
    const lines = Array.from({ length: 10 }, () => 'あ'.repeat(499)).join('\r\n')
    const r = contactSchema.parse({ ...valid, body: lines })
    expect(r.body).toBe(lines.replace(/\r\n/g, '\n'))
    expect(Array.from(r.body).length).toBe(4999)
  })

  it('本文の前後の空白を落とす', () => {
    expect(contactSchema.parse({ ...valid, body: '  あ  ' }).body).toBe('あ')
  })

  it('種類が無い・知らない値は日本語のエラー', () => {
    expect(errorOf({ ...valid, topic: null })).toBe('お問い合わせの種類を選んでください')
    expect(errorOf({ ...valid, topic: 'x' })).toBe('お問い合わせの種類を選んでください')
  })

  it('本文が空・長すぎるときは日本語のエラー', () => {
    expect(errorOf({ ...valid, body: '   ' })).toBe('お問い合わせの内容を入力してください')
    expect(errorOf({ ...valid, body: null })).toBe('お問い合わせの内容を入力してください')
    expect(errorOf({ ...valid, body: 'あ'.repeat(CONTACT_BODY_MAX_LENGTH + 1) })).toBe(
      'お問い合わせの内容は5,000文字以内で入力してください'
    )
  })

  it('メールアドレスの形が違えば日本語のエラー', () => {
    expect(errorOf({ ...valid, email: 'not-an-email' })).toBe(
      'メールアドレスの形式が正しくありません'
    )
  })

  it('requestId が uuid でなければ失敗する', () => {
    expect(errorOf({ ...valid, requestId: 'x' })).toBe(
      '送信できませんでした。ページを読み込み直してください'
    )
  })

  it('店舗の id が uuid でなければ失敗にせず捨てる', () => {
    expect(contactSchema.parse({ ...valid, tenantId: 'x' }).tenantId).toBeUndefined()
  })

  it('エラー番号の形が違えば失敗にせず捨てる', () => {
    expect(contactSchema.parse({ ...valid, digest: '<script>' }).digest).toBeUndefined()
    expect(contactSchema.parse({ ...valid, digest: '1485408959' }).digest).toBe('1485408959')
  })
})

describe('parseDigest', () => {
  it('英数字・ハイフン・下線の 64 文字までを通す', () => {
    expect(parseDigest('abc_DEF-123')).toBe('abc_DEF-123')
    expect(parseDigest('a'.repeat(64))).toBe('a'.repeat(64))
  })

  it('それ以外・空・null は undefined', () => {
    expect(parseDigest('a'.repeat(65))).toBeUndefined()
    expect(parseDigest('a b')).toBeUndefined()
    expect(parseDigest('')).toBeUndefined()
    expect(parseDigest(null)).toBeUndefined()
  })
})

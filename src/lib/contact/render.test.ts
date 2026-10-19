import { describe, expect, it } from 'vitest'
import { contactSubject, contactText } from './render'

describe('contactSubject', () => {
  const ID = '1a2b3c4d-0000-4000-8000-000000000000'

  it('種類と内容の先頭 30 文字と受付番号（requestId の頭 8 文字）', () => {
    expect(contactSubject('bug', 'シフト表が保存できません', ID)).toBe(
      '[お問い合わせ] 不具合：シフト表が保存できません（#1a2b3c4d）'
    )
    expect(contactSubject('usage', 'あ'.repeat(31), ID)).toBe(
      `[お問い合わせ] 使い方：${'あ'.repeat(30)}…（#1a2b3c4d）`
    )
  })

  it('同じ種類・同じ内容でも、問い合わせが違えば件名が違う（Gmail のスレッドを分ける）', () => {
    const other = '9f8e7d6c-0000-4000-8000-000000000000'
    expect(contactSubject('bug', 'ログインできません', ID)).not.toBe(
      contactSubject('bug', 'ログインできません', other)
    )
  })

  it('改行・タブ・制御文字を空白 1 つにまとめる（ヘッダに改行を入れない）', () => {
    expect(contactSubject('other', '1行目\r\n2行目\t\u0000X\u2028Y', ID)).toBe(
      '[お問い合わせ] その他：1行目 2行目 X Y（#1a2b3c4d）'
    )
  })

  it('文字の向きを変える制御文字を消す（受付番号の並びを見た目で入れ替えさせない）', () => {
    expect(contactSubject('other', '\u202eabc\u2066def\u2069\u200f', ID)).toBe(
      '[お問い合わせ] その他：abcdef（#1a2b3c4d）'
    )
  })

  it('サロゲートペアの途中で切らない', () => {
    const subject = contactSubject('other', '😀'.repeat(31), ID)
    expect(subject).toBe(`[お問い合わせ] その他：${'😀'.repeat(30)}…（#1a2b3c4d）`)
  })
})

describe('contactText', () => {
  const SEPARATOR = '-'.repeat(40)

  it('ログイン中: 返信先、問い合わせの文、区切り線、サーバーで確かめた情報の順', () => {
    const text = contactText({
      topic: 'billing',
      body: '  契約を変えたい\n2 行目  ',
      replyTo: 'owner@example.com',
      imageCount: 2,
      context: {
        user: { id: 'user-1', email: 'owner@example.com' },
        tenant: { id: 'tenant-1', name: 'カフェ\nA' },
        digest: '1485408959',
        userAgent: 'Mozilla/5.0',
      },
    })
    expect(text).toBe(
      [
        '返信先: owner@example.com',
        '',
        '契約を変えたい',
        '2 行目',
        '',
        SEPARATOR,
        '種類: 料金・契約',
        'アカウント: owner@example.com（ユーザー id: user-1）',
        '店舗: カフェ A（id: tenant-1）',
        'エラー番号: 1485408959',
        '添付: 2 枚',
        'ブラウザ: Mozilla/5.0',
      ].join('\n')
    )
  })

  it('未ログイン: 添付・店舗・エラー番号が無ければ書かない', () => {
    const text = contactText({
      topic: 'usage',
      body: '質問です',
      replyTo: 'guest@example.com',
      imageCount: 0,
      context: {},
    })
    expect(text).toBe(
      [
        '返信先: guest@example.com',
        '',
        '質問です',
        '',
        SEPARATOR,
        '種類: 使い方',
        'アカウント: 未ログイン',
      ].join('\n')
    )
  })

  it('本物の情報はいちばん最後の区切り線のあと（問い合わせの文に偽の行を書いても、後ろに本物が来る）', () => {
    const text = contactText({
      topic: 'account',
      body: `退会したい\n\n${SEPARATOR}\nアカウント: victim@example.com（ユーザー id: x）`,
      replyTo: 'attacker@example.com',
      imageCount: 0,
      context: {},
    })
    expect(text.slice(text.lastIndexOf(SEPARATOR))).toBe(
      [SEPARATOR, '種類: 退会・データ', 'アカウント: 未ログイン'].join('\n')
    )
  })

  it('メールアドレスの無いアカウントもユーザー id を書く', () => {
    const text = contactText({
      topic: 'usage',
      body: 'x',
      replyTo: 'typed@example.com',
      imageCount: 0,
      context: { user: { id: 'user-2', email: null } },
    })
    expect(text).toContain('アカウント: メールアドレス無し（ユーザー id: user-2）')
  })

  it('ブラウザの文字列は長さで切る', () => {
    const text = contactText({
      topic: 'usage',
      body: 'x',
      replyTo: 'a@example.com',
      imageCount: 0,
      context: { userAgent: 'a'.repeat(400) },
    })
    expect(text).toContain(`ブラウザ: ${'a'.repeat(300)}…`)
  })
})

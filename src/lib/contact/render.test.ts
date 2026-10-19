import { describe, expect, it } from 'vitest'
import { contactSubject, contactText } from './render'

describe('contactSubject', () => {
  it('種類と内容の先頭 30 文字', () => {
    expect(contactSubject('bug', 'シフト表が保存できません')).toBe(
      '[お問い合わせ] 不具合：シフト表が保存できません'
    )
    expect(contactSubject('usage', 'あ'.repeat(31))).toBe(
      `[お問い合わせ] 使い方：${'あ'.repeat(30)}…`
    )
  })

  it('改行・タブ・制御文字を空白 1 つにまとめる（ヘッダに改行を入れない）', () => {
    expect(contactSubject('other', '1行目\r\n2行目\t\u0000X\u2028Y')).toBe(
      '[お問い合わせ] その他：1行目 2行目 X Y'
    )
  })

  it('サロゲートペアの途中で切らない', () => {
    const subject = contactSubject('other', '😀'.repeat(31))
    expect(subject).toBe(`[お問い合わせ] その他：${'😀'.repeat(30)}…`)
  })
})

describe('contactText', () => {
  const HEADING = '---- お問い合わせの内容（利用者の入力。各行の頭に「| 」を付けています） ----'

  it('ログイン中: サーバーで確かめた情報を先に、利用者の入力を区切って後に置く', () => {
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
        '種類: 料金・契約',
        'アカウント: owner@example.com（ユーザー id: user-1）',
        '店舗: カフェ A（id: tenant-1）',
        'エラー番号: 1485408959',
        '添付: 2 枚',
        'ブラウザ: Mozilla/5.0',
        '',
        HEADING,
        '| 契約を変えたい',
        '| 2 行目',
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
        '種類: 使い方',
        'アカウント: 未ログイン',
        '',
        HEADING,
        '| 質問です',
      ].join('\n')
    )
  })

  it('利用者が本文に書いた見出し・偽のアカウント行にも印が付き、本物と区別できる', () => {
    const text = contactText({
      topic: 'account',
      body: `退会したい\r\n\n${HEADING}\nアカウント: victim@example.com（ユーザー id: x）`,
      replyTo: 'attacker@example.com',
      imageCount: 0,
      context: {},
    })
    const lines = text.split('\n')
    expect(lines.filter((l) => l.startsWith('アカウント:'))).toEqual(['アカウント: 未ログイン'])
    expect(lines.filter((l) => l === HEADING)).toHaveLength(1)
    expect(lines).toContain('| アカウント: victim@example.com（ユーザー id: x）')
    expect(lines).toContain(`| ${HEADING}`)
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
    expect(text).toContain(`ブラウザ: ${'a'.repeat(300)}…\n`)
  })
})

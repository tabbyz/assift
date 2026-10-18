import { describe, expect, it } from 'vitest'
import {
  batchIdempotencyKey,
  buildBatchEmails,
  isSendableEmail,
  messageDigest,
  parseExcludeList,
  parseRecipients,
  planBatches,
  resumePoint,
  toBatches,
  type Recipient,
} from './recipients'

describe('isSendableEmail', () => {
  it('ふつうのアドレスは通す', () => {
    for (const email of [
      'a@example.com',
      'taro.yamada+shift@docomo.ne.jp',
      "o'brien@ex-ample.co.jp",
    ]) {
      expect(isSendableEmail(email)).toBe(true)
    }
  })

  it('RFC から外れる形（携帯のキャリアの古いアドレスなど）は外す', () => {
    for (const email of [
      'taro..yamada@docomo.ne.jp',
      'taro.@ezweb.ne.jp',
      '.taro@i.softbank.jp',
      'ｔａｒｏ@gmail.com',
      'a@gmail.com.',
      'a,b@x.com',
      'a@-x.com',
      'a@x',
      'a@x.c0m',
      'a@@x.com',
      'not-an-email',
    ]) {
      expect(isSendableEmail(email)).toBe(false)
    }
  })
})

describe('parseRecipients', () => {
  it('並びを保ち、小文字にそろえる。RFC から外れる形は別に分け、形でない・除外・同じアドレスの 2 行目を外す', () => {
    const csv = [
      'id,email,current_sign_in_at',
      '3, Recent@Example.com ,2026-10-28 10:00:00',
      '1,old@example.com,',
      '7,taro..yamada@docomo.ne.jp,',
      '8,not-an-email,',
      '9,recent@example.com,2020-01-01 00:00:00',
      '4,bounced@example.com,',
      '',
    ].join('\n')
    const { recipients, irregular, skipped } = parseRecipients(
      csv,
      new Set(['bounced@example.com'])
    )
    expect(recipients).toEqual([
      { v1UserId: '3', email: 'recent@example.com' },
      { v1UserId: '1', email: 'old@example.com' },
    ])
    expect(irregular).toEqual([{ v1UserId: '7', email: 'taro..yamada@docomo.ne.jp' }])
    expect(skipped).toEqual([
      { row: 5, v1UserId: '8', email: 'not-an-email', reason: 'メールアドレスの形ではない' },
      { row: 6, v1UserId: '9', email: 'recent@example.com', reason: '同じアドレスが前の行にある' },
      { row: 7, v1UserId: '4', email: 'bounced@example.com', reason: '除外の一覧にある' },
    ])
  })

  it('id と email の列が無ければ止まる', () => {
    expect(() => parseRecipients('user_id,mail\n1,a@example.com\n')).toThrow('id と email')
  })

  it('データの行が無ければ止まる（heroku の出力が空だったときに気付く）', () => {
    expect(() => parseRecipients('id,email\n')).toThrow('データの行がありません')
    expect(() => parseRecipients('')).toThrow('データの行がありません')
  })
})

describe('parseExcludeList', () => {
  it('email の列を小文字にそろえて集める（結果の CSV もそのまま渡せる）', () => {
    const csv = 'batch,v1_user_id,email,resend_id,sent_at\n1,3,A@Example.com,x,t\n'
    expect(parseExcludeList(csv)).toEqual(new Set(['a@example.com']))
  })
})

describe('toBatches', () => {
  it('100 通ずつに区切る', () => {
    const batches = toBatches(Array.from({ length: 250 }, (_, i) => i))
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50])
    expect(batches[2][0]).toBe(200)
  })
})

describe('planBatches', () => {
  it('RFC の形を 100 通ずつ、そのあとに外れる形を 1 通ずつ', () => {
    const regular = Array.from({ length: 150 }, (_, i) => ({
      v1UserId: String(i),
      email: `u${i}@example.com`,
    }))
    const irregular = [
      { v1UserId: 'a', email: 'a..b@docomo.ne.jp' },
      { v1UserId: 'c', email: '.c@ezweb.ne.jp' },
    ]
    const { batches, singlesFrom } = planBatches(regular, irregular)
    expect(batches.map((batch) => batch.length)).toEqual([100, 50, 1, 1])
    expect(singlesFrom).toBe(3)
    expect(batches[2]).toEqual([irregular[0]])
  })

  it('外れる形が無ければ 1 通ずつのバッチは無い', () => {
    const { batches, singlesFrom } = planBatches([{ v1UserId: '1', email: 'a@example.com' }], [])
    expect(batches).toHaveLength(1)
    expect(singlesFrom).toBe(2)
  })
})

describe('batchIdempotencyKey', () => {
  const digest = messageDigest({ subject: 's', html: 'h', text: 't' })

  it('送信の識別子 + 4 桁の番号 + 宛先と文面の指紋', () => {
    expect(batchIdempotencyKey('announce-20261029', 7, ['a@example.com'], digest)).toMatch(
      /^announce-20261029\/batch-0007-[0-9a-f]{12}$/
    )
  })

  it('同じ中身なら同じ鍵、宛先か文面が違えば別の鍵', () => {
    const key = batchIdempotencyKey('c', 1, ['a@example.com'], digest)
    expect(batchIdempotencyKey('c', 1, ['a@example.com'], digest)).toBe(key)
    expect(batchIdempotencyKey('c', 1, ['b@example.com'], digest)).not.toBe(key)
    const other = messageDigest({ subject: 's', html: 'h2', text: 't' })
    expect(batchIdempotencyKey('c', 1, ['a@example.com'], other)).not.toBe(key)
  })
})

describe('resumePoint', () => {
  const recipients: Recipient[] = Array.from({ length: 5 }, (_, i) => ({
    v1UserId: String(i + 1),
    email: `u${i + 1}@example.com`,
  }))
  const batches = toBatches(recipients, 2)
  const row = (batch: number, n: number) => ({ batch: String(batch), email: `u${n}@example.com` })

  it('記録が無ければ 1 番から', () => {
    expect(resumePoint(batches, [])).toBe(1)
  })

  it('記録したバッチの次から', () => {
    expect(resumePoint(batches, [row(1, 1), row(1, 2), row(2, 3), row(2, 4)])).toBe(3)
  })

  it('宛先の一覧が送り始めたときと違えば止まる（並びが 1 つずれた）', () => {
    const shifted = toBatches([{ v1UserId: '0', email: 'u0@example.com' }, ...recipients], 2)
    expect(() => resumePoint(shifted, [row(1, 1), row(1, 2)])).toThrow(
      '今の宛先の区切りと合いません'
    )
  })

  it('記録が途切れていれば止まる', () => {
    expect(() => resumePoint(batches, [row(2, 3), row(2, 4)])).toThrow('バッチ 1 がありません')
  })
})

describe('buildBatchEmails', () => {
  it('1 通に宛先は 1 人（互いのアドレスを見せない）・告知の tags を付ける', () => {
    const emails = buildBatchEmails(
      [
        { v1UserId: '1', email: 'a@example.com' },
        { v1UserId: '2', email: 'b@example.com' },
      ],
      { from: 'f', replyTo: 'r', subject: 's', html: 'h', text: 't' },
      'announce-20261029'
    )
    expect(emails.map((email) => email.to)).toEqual([['a@example.com'], ['b@example.com']])
    expect(emails[0]).toEqual({
      from: 'f',
      to: ['a@example.com'],
      reply_to: 'r',
      subject: 's',
      html: 'h',
      text: 't',
      tags: [{ name: 'campaign', value: 'announce-20261029' }],
    })
  })
})

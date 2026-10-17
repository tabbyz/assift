import { describe, expect, it } from 'vitest'
import { batchIdempotencyKey, buildBatchEmails, parseRecipients, toBatches } from './recipients'

describe('parseRecipients', () => {
  it('並びを保ち、小文字にそろえ、形の違う行と同じアドレスの 2 行目を外す', () => {
    const csv = [
      'id,email,current_sign_in_at',
      '3, Recent@Example.com ,2026-10-28 10:00:00',
      '1,old@example.com,',
      '7,not-an-email,',
      '9,recent@example.com,2020-01-01 00:00:00',
      '',
    ].join('\n')
    const { recipients, skipped } = parseRecipients(csv)
    expect(recipients).toEqual([
      { v1UserId: '3', email: 'recent@example.com' },
      { v1UserId: '1', email: 'old@example.com' },
    ])
    expect(skipped).toEqual([
      { row: 4, v1UserId: '7', email: 'not-an-email', reason: 'メールアドレスの形ではない' },
      { row: 5, v1UserId: '9', email: 'recent@example.com', reason: '同じアドレスが前の行にある' },
    ])
  })

  it('id と email の列が無ければ止まる', () => {
    expect(() => parseRecipients('user_id,mail\n1,a@example.com\n')).toThrow('id と email')
  })

  it('空の CSV は 0 人', () => {
    expect(parseRecipients('id,email\n')).toEqual({ recipients: [], skipped: [] })
  })
})

describe('toBatches', () => {
  it('100 通ずつに区切る', () => {
    const batches = toBatches(Array.from({ length: 250 }, (_, i) => i))
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50])
    expect(batches[2][0]).toBe(200)
  })
})

describe('batchIdempotencyKey', () => {
  it('送信の識別子 + 4 桁の番号', () => {
    expect(batchIdempotencyKey('announce-20261029', 7)).toBe('announce-20261029/batch-0007')
    expect(batchIdempotencyKey('announce-20261029', 291)).toBe('announce-20261029/batch-0291')
  })
})

describe('buildBatchEmails', () => {
  it('1 通に宛先は 1 人（互いのアドレスを見せない）', () => {
    const emails = buildBatchEmails(
      [
        { v1UserId: '1', email: 'a@example.com' },
        { v1UserId: '2', email: 'b@example.com' },
      ],
      { from: 'f', replyTo: 'r', subject: 's', html: 'h', text: 't' }
    )
    expect(emails.map((email) => email.to)).toEqual([['a@example.com'], ['b@example.com']])
    expect(emails[0]).toEqual({
      from: 'f',
      to: ['a@example.com'],
      reply_to: 'r',
      subject: 's',
      html: 'h',
      text: 't',
    })
  })
})

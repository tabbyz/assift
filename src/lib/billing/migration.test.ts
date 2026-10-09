import { describe, expect, it } from 'vitest'
import { migrationCategory, parseCsv, shouldVoidDrafts, toCsv } from './migration'

const now = new Date('2026-10-25T00:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

describe('migrationCategory', () => {
  it('上限 11 人以上で有効なら旧料金に移す', () => {
    for (const status of ['active', 'past_due', 'trialing']) {
      expect(migrationCategory({ status, maxStaffsCount: 15, lastEditedAt: null, now })).toBe(
        'legacy'
      )
    }
  })

  it('上限 11 人以上の未払いは、90 日以内に編集があれば救い、なければ解約', () => {
    expect(
      migrationCategory({ status: 'unpaid', maxStaffsCount: 11, lastEditedAt: daysAgo(90), now })
    ).toBe('rescue')
    expect(
      migrationCategory({ status: 'unpaid', maxStaffsCount: 11, lastEditedAt: daysAgo(91), now })
    ).toBe('cancel_unpaid')
    expect(
      migrationCategory({ status: 'unpaid', maxStaffsCount: 11, lastEditedAt: null, now })
    ).toBe('cancel_unpaid')
  })

  it('上限 10 人以下（0 円）は状態によらず解約', () => {
    for (const status of ['active', 'past_due', 'trialing', 'unpaid']) {
      expect(migrationCategory({ status, maxStaffsCount: 10, lastEditedAt: daysAgo(1), now })).toBe(
        'cancel_free'
      )
    }
  })

  it('解約済みは飛ばし、想定外の状態は目で見る', () => {
    expect(
      migrationCategory({ status: 'canceled', maxStaffsCount: 20, lastEditedAt: null, now })
    ).toBe('skip')
    expect(
      migrationCategory({
        status: 'incomplete_expired',
        maxStaffsCount: 20,
        lastEditedAt: null,
        now,
      })
    ).toBe('skip')
    expect(
      migrationCategory({ status: 'paused', maxStaffsCount: 20, lastEditedAt: null, now })
    ).toBe('review')
    expect(
      migrationCategory({ status: 'incomplete', maxStaffsCount: 5, lastEditedAt: null, now })
    ).toBe('review')
  })
})

describe('shouldVoidDrafts', () => {
  it('未払いの分だけ無効にする（有効な契約の下書きは今月分なので触らない）', () => {
    expect(shouldVoidDrafts('rescue', 'unpaid')).toBe(true)
    expect(shouldVoidDrafts('cancel_unpaid', 'unpaid')).toBe(true)
    expect(shouldVoidDrafts('cancel_free', 'unpaid')).toBe(true)
    expect(shouldVoidDrafts('cancel_free', 'active')).toBe(false)
    expect(shouldVoidDrafts('legacy', 'past_due')).toBe(false)
  })
})

describe('CSV', () => {
  it('ダブルクォート・カンマ・改行を往復できる', () => {
    const rows = [
      { a: 'x,y', b: 'say "hi"' },
      { a: 'line1\nline2', b: '' },
    ]
    expect(parseCsv(toCsv(['a', 'b'], rows))).toEqual(rows)
  })

  it('CRLF と末尾の空行を読める', () => {
    expect(parseCsv('id,email\r\n1,a@example.com\r\n\r\n')).toEqual([
      { id: '1', email: 'a@example.com' },
    ])
  })
})

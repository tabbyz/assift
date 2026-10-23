import { describe, expect, it } from 'vitest'
import {
  afterFinalize,
  applyCallEstimate,
  migrationCategory,
  parseCsv,
  shouldVoidDrafts,
  toCsv,
} from './migration'

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

describe('afterFinalize', () => {
  it('確定で開いた請求書は無効にする', () => {
    expect(afterFinalize({ status: 'open', total: 1500 })).toBe('void')
  })

  // 2026-10-23 の live の片付けで「You can only pass in open invoices」になった
  it('0 円の下書きは確定で支払い済みになるので、無効にせずそのままにする', () => {
    expect(afterFinalize({ status: 'paid', total: 0 })).toBe('zero')
  })

  it('お金の動く支払い済みやそれ以外の状態は想定外として止める', () => {
    expect(afterFinalize({ status: 'paid', total: 1500 })).toBe('unexpected')
    expect(afterFinalize({ status: 'draft', total: 0 })).toBe('unexpected')
  })
})

describe('applyCallEstimate', () => {
  const estimate = (
    category: Parameters<typeof applyCallEstimate>[0]['category'],
    status: string,
    drafts = 0,
    openInvoices = 0
  ) => applyCallEstimate({ category, status, drafts, openInvoices })

  it('旧料金は言語と schedule の 3 回、0 円の有効な契約は解約の 1 回、対象外は 0 回', () => {
    expect(estimate('legacy', 'active')).toBe(3)
    expect(estimate('cancel_free', 'active')).toBe(1)
    expect(estimate('skip', 'canceled')).toBe(0)
    expect(estimate('review', 'paused')).toBe(0)
  })

  // 2026-10-22 のサンドボックスの結果（035 §9 の手順 7）と同じ回数になる
  it('救う契約: 下書き 2 件・未払い 1 件なら 13 回（最新の下書きは確定だけ）', () => {
    // 下書きの一覧 1 + 無効 3 + 最新の update / finalize 2 + 未払いの一覧 1 + 回収不能 2 + 取り直し 1 + 言語と schedule 3
    expect(estimate('rescue', 'unpaid', 2, 1)).toBe(13)
  })

  it('救わない未払い: 下書き 2 件・未払い 1 件なら 10 回', () => {
    // 下書きの一覧 1 + 無効 6 + 未払いの一覧 1 + 回収不能 1 + 解約 1
    expect(estimate('cancel_unpaid', 'unpaid', 2, 1)).toBe(10)
    expect(estimate('cancel_free', 'unpaid', 2, 1)).toBe(10)
  })

  it('下書きが 100 件を超えると一覧のページが増える', () => {
    expect(estimate('cancel_unpaid', 'unpaid', 150, 0)).toBe(2 + 450 + 1 + 0 + 1)
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

import { describe, expect, it } from 'vitest'
import { datesBetween } from '@/lib/calendar/dateString'
import {
  isShareEnabled,
  minEnabledEndDate,
  SHARE_GRACE_DAYS,
  shareDaysLeft,
  shareLastDay,
} from './expiry'

describe('isShareEnabled', () => {
  it('終了日が今日なら有効', () => {
    expect(isShareEnabled('2026-09-20', '2026-09-20')).toBe(true)
  })

  it('まだ始まっていない未来の期間も有効（v1 と同じく end_date だけで判定する）', () => {
    expect(isShareEnabled('2026-12-31', '2026-09-20')).toBe(true)
  })

  it('終了日の 6 日後までは有効', () => {
    expect(isShareEnabled('2026-09-20', '2026-09-26')).toBe(true)
  })

  it('終了日の 7 日後で無効になる', () => {
    expect(isShareEnabled('2026-09-20', '2026-09-27')).toBe(false)
  })

  it('月をまたいでも 6 日後 / 7 日後で切り替わる', () => {
    expect(isShareEnabled('2026-09-30', '2026-10-06')).toBe(true)
    expect(isShareEnabled('2026-09-30', '2026-10-07')).toBe(false)
  })

  it('うるう日をまたいでも 6 日後 / 7 日後で切り替わる', () => {
    expect(isShareEnabled('2028-02-28', '2028-03-05')).toBe(true)
    expect(isShareEnabled('2028-02-28', '2028-03-06')).toBe(false)
  })

  /*
   * 未ログインで開けるページの唯一の期限判定なので、想定外の値は「公開しない」に倒す。
   * 素の文字列比較だと `'Invalid Date' >= '2026-09-20'` が真になり（`'I'` > `'2'`）、
   * 期限切れの共有が全部生き返る向きに壊れる。
   */
  it('日付でない値は公開しない（fail closed）', () => {
    expect(isShareEnabled('', '2026-09-20')).toBe(false)
    expect(isShareEnabled('not-a-date', '2026-09-20')).toBe(false)
    // dayjs が黙って繰り上げる形（2026-13-01 → 2027/1/1）も弾く
    expect(isShareEnabled('2026-13-01', '2026-09-20')).toBe(false)
    expect(isShareEnabled('2026-02-30', '2026-09-20')).toBe(false)
    expect(isShareEnabled('2026-09-20', 'not-a-date')).toBe(false)
  })
})

describe('minEnabledEndDate', () => {
  it('今日の 6 日前を返す', () => {
    expect(minEnabledEndDate('2026-09-20')).toBe('2026-09-14')
    expect(minEnabledEndDate('2026-10-03')).toBe('2026-09-27')
  })

  // 一覧（SQL の gte / lt）と発行ボタン・公開ページ（isShareEnabled）が同じ境界を使うことを固定する
  it('SQL の絞り込みと isShareEnabled の境界が一致する', () => {
    const today = '2026-09-20'
    const min = minEnabledEndDate(today)
    for (const endDate of datesBetween('2026-09-01', '2026-10-01')) {
      expect(endDate >= min).toBe(isShareEnabled(endDate, today))
    }
  })

  it('猶予の日数は v1 の DATE_LIMIT と同じ', () => {
    expect(SHARE_GRACE_DAYS).toBe(6)
  })
})

describe('shareLastDay', () => {
  it('終了日の 6 日後（月をまたぐ）', () => {
    expect(shareLastDay('2026-09-30')).toBe('2026-10-06')
    expect(shareLastDay('2026-10-31')).toBe('2026-11-06')
  })

  // 画面に出す日付と実際の期限判定がずれないことを固定する
  it('その日までは isShareEnabled が真で、翌日から偽', () => {
    const last = shareLastDay('2026-09-20')
    expect(isShareEnabled('2026-09-20', last)).toBe(true)
    expect(isShareEnabled('2026-09-20', '2026-09-27')).toBe(false)
    expect(last).toBe('2026-09-26')
  })
})

describe('shareDaysLeft', () => {
  it('最後の日までの日数', () => {
    expect(shareDaysLeft('2026-10-31', '2026-09-23')).toBe(44)
    expect(shareDaysLeft('2026-09-30', '2026-09-23')).toBe(13)
  })

  it('最後の日は 0、過ぎると負', () => {
    expect(shareDaysLeft('2026-09-30', '2026-10-06')).toBe(0)
    expect(shareDaysLeft('2026-09-30', '2026-10-07')).toBe(-1)
  })
})

import { describe, expect, it } from 'vitest'
import { setManualLimitSchema, setTrialLastDaySchema } from './admin'

const userId = '11111111-1111-1111-1111-111111111111'

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message
}

describe('setTrialLastDaySchema', () => {
  it('YYYY-MM-DD の日付を受ける', () => {
    expect(setTrialLastDaySchema.safeParse({ userId, lastDay: '2026-12-31' }).success).toBe(true)
  })

  it('存在しない日付・空欄は日本語で断る', () => {
    expect(firstError(setTrialLastDaySchema.safeParse({ userId, lastDay: '2026-02-30' }))).toBe(
      '最終日の日付が正しくありません'
    )
    expect(firstError(setTrialLastDaySchema.safeParse({ userId, lastDay: null }))).toBe(
      '最終日を入力してください'
    )
  })

  it('2099-12-31 より後は断る（9999-12-31 で Date が壊れない）', () => {
    expect(setTrialLastDaySchema.safeParse({ userId, lastDay: '2099-12-31' }).success).toBe(true)
    expect(firstError(setTrialLastDaySchema.safeParse({ userId, lastDay: '9999-12-31' }))).toBe(
      '最終日は2099年12月31日までにしてください'
    )
  })

  it('uuid でない userId は断る（seed のような RFC 非準拠の id は受ける）', () => {
    expect(
      firstError(setTrialLastDaySchema.safeParse({ userId: 'x', lastDay: '2026-12-31' }))
    ).toBe('ユーザーが見つかりません')
  })
})

describe('setManualLimitSchema', () => {
  it('11〜1000 の整数と null（通常に戻す）を受ける', () => {
    expect(setManualLimitSchema.safeParse({ userId, limit: 11 }).success).toBe(true)
    expect(setManualLimitSchema.safeParse({ userId, limit: 1000 }).success).toBe(true)
    expect(setManualLimitSchema.safeParse({ userId, limit: null }).success).toBe(true)
  })

  it('10 以下・1001・空欄・小数は日本語で断る', () => {
    const range = '個別契約の上限は11〜1000人で入力してください'
    expect(firstError(setManualLimitSchema.safeParse({ userId, limit: 10 }))).toBe(range)
    expect(firstError(setManualLimitSchema.safeParse({ userId, limit: 1001 }))).toBe(range)
    expect(firstError(setManualLimitSchema.safeParse({ userId, limit: '' }))).toBe(
      '個別契約の上限を入力してください'
    )
    expect(firstError(setManualLimitSchema.safeParse({ userId, limit: 12.5 }))).toBe(
      '個別契約の上限を入力してください'
    )
  })
})

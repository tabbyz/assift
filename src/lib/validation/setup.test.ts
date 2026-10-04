import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { selectedPatterns } from '@/lib/setup/patternsState'
import { templateState } from '@/lib/setup/templates'
import {
  completeSetupSchema,
  createSetupTenantSchema,
  saveSetupPatternsSchema,
  updateSetupTenantSchema,
} from './setup'

const TENANT = '22222222-2222-2222-2222-222222222222'

const message = (
  schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
  input: unknown
) => {
  const r = schema.safeParse(input)
  return r.success ? null : toActionError(r.error)
}

describe('createSetupTenantSchema', () => {
  it('1ヶ月なら週の始まりは要らず、日曜（0）になる', () => {
    expect(
      createSetupTenantSchema.parse({ name: 'さくら食堂', shiftCycle: 'month', startOfWeek: null })
    ).toEqual({
      name: 'さくら食堂',
      shiftCycle: 'month',
      startOfWeek: 0,
    })
  })

  it('1ヶ月・半月では送られた週の始まりを無視して日曜にする', () => {
    expect(
      createSetupTenantSchema.parse({ name: 'A', shiftCycle: 'month', startOfWeek: 1 }).startOfWeek
    ).toBe(0)
    expect(
      createSetupTenantSchema.parse({ name: 'A', shiftCycle: 'half_month', startOfWeek: 3 })
        .startOfWeek
    ).toBe(0)
  })

  it('週・2 週では週の始まりが必須（日本語のエラー）', () => {
    expect(
      message(createSetupTenantSchema, { name: 'A', shiftCycle: 'two_week', startOfWeek: null })
    ).toBe('何曜日から始まるか選んでください')
    expect(
      createSetupTenantSchema.parse({ name: 'A', shiftCycle: 'week', startOfWeek: 1 }).startOfWeek
    ).toBe(1)
  })

  it('店名は前後の空白を落とし、空と 21 文字を弾く', () => {
    expect(
      createSetupTenantSchema.parse({ name: ' A店 ', shiftCycle: 'month', startOfWeek: null }).name
    ).toBe('A店')
    expect(
      message(createSetupTenantSchema, { name: '  ', shiftCycle: 'month', startOfWeek: null })
    ).toBe('お店の名前を入れてください')
    expect(
      message(createSetupTenantSchema, {
        name: 'あ'.repeat(21),
        shiftCycle: 'month',
        startOfWeek: null,
      })
    ).toBe('お店の名前は20文字以内で入れてください')
  })

  it('更新は tenantId も見る', () => {
    expect(
      updateSetupTenantSchema.parse({
        tenantId: TENANT,
        name: 'A',
        shiftCycle: 'month',
        startOfWeek: 2,
      })
    ).toMatchObject({ tenantId: TENANT, startOfWeek: 0 })
  })
})

describe('saveSetupPatternsSchema', () => {
  const input = (state = templateState('care')) => ({
    tenantId: TENANT,
    ...selectedPatterns(state),
  })

  it('テンプレートからそのまま送った形を通す', () => {
    expect(saveSetupPatternsSchema.safeParse(input()).success).toBe(true)
  })

  it('働く日が 0 件なら弾く', () => {
    const state = templateState('food')
    state.rows = state.rows.map((row) => ({ ...row, on: row.kind === 'dayoff' }))
    expect(message(saveSetupPatternsSchema, input(state))).toBe(
      '働く日の勤務を 1 つ以上残してください'
    )
  })

  it('勤務名の 7 文字は勤務パターンと同じ文言で弾く', () => {
    const state = templateState('other')
    state.rows[0] = { ...state.rows[0], name: 'あいうえおかき' }
    expect(message(saveSetupPatternsSchema, input(state))).toBe(
      '勤務パターン名は6文字以下で入力してください'
    )
  })

  it('ペアの片方が無ければ弾く', () => {
    expect(
      message(saveSetupPatternsSchema, { ...input(), pair: { fromKey: 'night', toKey: 'missing' } })
    ).toBe('明けの設定が正しくありません')
  })
})

describe('completeSetupSchema', () => {
  it('名前を 1 人以上', () => {
    expect(message(completeSetupSchema, { tenantId: TENANT, names: [] })).toBe(
      '名前を 1 人以上入れてください'
    )
    expect(
      completeSetupSchema.safeParse({ tenantId: TENANT, names: ['山田', '山田'] }).success
    ).toBe(true)
  })

  it('11 文字は弾く', () => {
    expect(
      message(completeSetupSchema, { tenantId: TENANT, names: ['あいうえおかきくけこさ'] })
    ).toBe('スタッフ名は10文字以下で入力してください')
  })
})

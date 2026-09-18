import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { REORDER_MAX_ITEMS, reorderSchema } from './ordering'

const TENANT = '22222222-2222-2222-2222-222222222222'
const id = (n: number) => `44444444-4444-4444-4444-${String(n).padStart(12, '0')}`

const message = (input: unknown) => {
  const r = reorderSchema.safeParse(input)
  return r.success ? null : toActionError(r.error)
}

describe('reorderSchema', () => {
  it('正しい入力を通す', () => {
    expect(reorderSchema.safeParse({ tenantId: TENANT, ids: [id(1), id(2)] }).success).toBe(true)
  })

  it('空の配列を弾く', () => {
    expect(message({ tenantId: TENANT, ids: [] })).toBe('並び順が正しくありません')
  })

  it('重複した id を弾く（RPC の件数チェックの前に止める）', () => {
    expect(message({ tenantId: TENANT, ids: [id(1), id(1)] })).toBe('並び順が正しくありません')
  })

  it('上限を超える件数を弾く', () => {
    const ids = Array.from({ length: REORDER_MAX_ITEMS + 1 }, (_, i) => id(i + 1))
    expect(message({ tenantId: TENANT, ids })).toBe('並び順が正しくありません')
  })

  it('uuid でない id を弾く', () => {
    expect(message({ tenantId: TENANT, ids: ['x'] })).toBe('並び順が正しくありません')
  })
})

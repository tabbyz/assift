import { describe, expect, it } from 'vitest'
import { groupRestrictions } from './groupRestrictions'

const r = (id: string, staffId: string | null) => ({ id, staff_id: staffId })

describe('groupRestrictions', () => {
  const active = [
    { id: 'a', name: '青木' },
    { id: 'b', name: '川田' },
  ]
  const retired = [{ id: 'z', name: '佐藤' }]

  it('店舗全体とスタッフ別に分け、人の並びはスタッフ一覧の順・退職済みは末尾', () => {
    const grouped = groupRestrictions(
      [r('1', 'z'), r('2', null), r('3', 'b'), r('4', 'a'), r('5', 'b'), r('6', null)],
      active,
      retired
    )
    expect(grouped.tenantWide.map((row) => row.id)).toEqual(['2', '6'])
    expect(
      grouped.byStaff.map((group) => [
        group.staff.name,
        group.retired,
        group.restrictions.map((row) => row.id),
      ])
    ).toEqual([
      ['青木', false, ['4']],
      ['川田', false, ['3', '5']],
      ['佐藤', true, ['1']],
    ])
    expect(grouped.byStaffCount).toBe(4)
  })

  it('0 件', () => {
    expect(groupRestrictions([], active, retired)).toEqual({
      tenantWide: [],
      byStaff: [],
      byStaffCount: 0,
    })
  })

  it('一覧に無いスタッフの行は出さない（FK があるので通常は起きない）', () => {
    expect(groupRestrictions([r('1', 'x')], active, retired).byStaff).toEqual([])
  })
})

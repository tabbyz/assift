import { describe, expect, it } from 'vitest'
import { isLinkActive, isSettingsPath, isShiftsPath } from './navigation'

describe('isLinkActive', () => {
  const staffs = '/tenants/t/settings/staffs'

  it('一覧そのものと配下の編集を現在地にする', () => {
    expect(isLinkActive(staffs, staffs)).toBe(true)
    expect(isLinkActive(staffs, `${staffs}/abc`)).toBe(true)
    expect(isLinkActive(staffs, `${staffs}/new`)).toBe(true)
  })

  it('兄弟のパスは現在地にしない', () => {
    expect(isLinkActive(staffs, '/tenants/t/settings/patterns')).toBe(false)
    expect(isLinkActive(staffs, '/tenants/t/settings/staff')).toBe(false)
  })
})

describe('path kinds', () => {
  it('シフト表と設定を取り違えない', () => {
    expect(isShiftsPath('/tenants/t')).toBe(true)
    // 旧 URL は redirect されるので、ここでは現在地として扱わない
    expect(isShiftsPath('/tenants/t/shifts')).toBe(false)
    expect(isShiftsPath('/tenants/t/settings/staffs')).toBe(false)
    expect(isSettingsPath('/tenants/t/settings/staffs')).toBe(true)
    expect(isSettingsPath('/tenants/t/shifts')).toBe(false)
  })
})

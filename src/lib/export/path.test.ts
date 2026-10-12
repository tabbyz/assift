import { describe, expect, it } from 'vitest'
import { exportPath, isPdfExportPath } from './path'

const ID = '22222222-2222-2222-2222-222222222222'

describe('exportPath', () => {
  it('Route Handler のパス（app/api/tenants/[tenantId]/shifts/{pdf,csv}）に合う', () => {
    expect(exportPath(ID, 'pdf')).toBe(`/api/tenants/${ID}/shifts/pdf`)
    expect(exportPath(ID, 'csv')).toBe(`/api/tenants/${ID}/shifts/csv`)
  })
})

describe('isPdfExportPath', () => {
  it('exportPath(…, "pdf") が組んだパスだけ', () => {
    expect(isPdfExportPath(exportPath(ID, 'pdf'))).toBe(true)
    expect(isPdfExportPath(exportPath('not-a-uuid', 'pdf'))).toBe(true)
    expect(isPdfExportPath(exportPath(ID, 'csv'))).toBe(false)
  })

  it('完全一致。前後に何か付くと別物（存在しない URL は 404 の HTML なので CSP が要る）', () => {
    expect(isPdfExportPath('/api')).toBe(false)
    expect(isPdfExportPath('/api/tenants/x/shifts')).toBe(false)
    expect(isPdfExportPath('/api/tenants/x/shifts/pdf/extra')).toBe(false)
    expect(isPdfExportPath('/api/tenants/x/y/shifts/pdf')).toBe(false)
    expect(isPdfExportPath('/api/tenants//shifts/pdf')).toBe(false)
  })
})

import { v5 as uuidv5 } from 'uuid'
import { afterEach, describe, expect, it } from 'vitest'
import { getV1UuidNamespace, v1Uuid } from './v1Ids'

/** RFC 9562 付録の名前空間。ライブラリの使い方を確認するためだけに使う */
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const NS = '7f4a1e62-0c1a-4f1e-9a3e-2b7c6d5e4f30'

describe('uuid パッケージの使い方', () => {
  it('RFC 9562 の既知ベクタと一致する（引数の順・namespace の形を間違えていない）', () => {
    // 引数を逆に渡すと例外になるか別の値になるので、これで使い方が固定できる
    expect(uuidv5('python.org', DNS_NAMESPACE)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
    expect(uuidv5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
  })
})

describe('v1Uuid', () => {
  it('他の実装と同じ値になる（Python の uuid.uuid5 で相互確認した値を固定する）', () => {
    // v1 側のエクスポートは Rails、インポートは TypeScript。実装をまたいで一致する必要がある
    expect(v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw', NS)).toBe(
      '2c55690d-afa5-5dc9-b200-e55efef9ca41'
    )
    expect(v1Uuid('staffs', 1, NS)).toBe('d0df4b19-179a-5914-b224-dbfb1f2ccdfb')
  })

  it('同じ入力からは常に同じ uuid を返す', () => {
    const a = v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw', NS)
    const b = v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw', NS)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('テーブル名が違えば別の uuid になる（ID の衝突を避ける）', () => {
    expect(v1Uuid('staffs', 1, NS)).not.toBe(v1Uuid('patterns', 1, NS))
  })

  it('namespace が違えば別の uuid になる', () => {
    expect(v1Uuid('tenants', 'abc', NS)).not.toBe(v1Uuid('tenants', 'abc', DNS_NAMESPACE))
  })

  it('数値の id は文字列として扱う', () => {
    expect(v1Uuid('shifts', 42, NS)).toBe(v1Uuid('shifts', '42', NS))
  })
})

describe('getV1UuidNamespace', () => {
  const original = process.env.V1_UUID_NAMESPACE
  afterEach(() => {
    process.env.V1_UUID_NAMESPACE = original
  })

  it('RFC 準拠の uuid なら返す', () => {
    process.env.V1_UUID_NAMESPACE = NS
    expect(getV1UuidNamespace()).toBe(NS)
  })

  it('未設定なら null', () => {
    delete process.env.V1_UUID_NAMESPACE
    expect(getV1UuidNamespace()).toBeNull()
  })

  it('RFC 非準拠の uuid は null（v5 が例外を投げる値を通さない）', () => {
    process.env.V1_UUID_NAMESPACE = '22222222-2222-2222-2222-222222222222'
    expect(getV1UuidNamespace()).toBeNull()
  })

  it('uuid の形をしていなければ null', () => {
    process.env.V1_UUID_NAMESPACE = 'not-a-uuid'
    expect(getV1UuidNamespace()).toBeNull()
  })
})

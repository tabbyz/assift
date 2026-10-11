import { v5 as uuidv5, validate as isRfcUuid } from 'uuid'
import { describe, expect, it } from 'vitest'
import { V1_UUID_NAMESPACE, v1Uuid, v1UuidIn } from './v1Ids'

/** RFC 9562 付録の名前空間。ライブラリの使い方を確認するためだけに使う */
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

describe('uuid パッケージの使い方', () => {
  it('RFC 9562 の既知ベクタと一致する（引数の順・namespace の形を間違えていない）', () => {
    // 引数を逆に渡すと例外になるか別の値になるので、これで使い方が固定できる
    expect(uuidv5('python.org', DNS_NAMESPACE)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
    expect(uuidv5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
  })
})

describe('V1_UUID_NAMESPACE', () => {
  it('値を固定する（変えると旧 URL と移行した全行の id が変わる。021 §3-6）', () => {
    expect(V1_UUID_NAMESPACE).toBe('4b880c2f-808c-4326-9bbd-3497ab1056e1')
  })

  it('RFC 準拠の uuid（v5 が例外を投げない値）', () => {
    expect(isRfcUuid(V1_UUID_NAMESPACE)).toBe(true)
  })
})

describe('v1Uuid', () => {
  it('他の実装と同じ値になる（Python の uuid.uuid5 で相互確認した値を固定する）', () => {
    // v1 側のエクスポートは Rails、インポートは TypeScript。実装をまたいで一致する必要がある
    expect(v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw')).toBe('57fc1460-3ced-56a9-835b-425638f95e9d')
    expect(v1Uuid('staffs', 1)).toBe('4769128a-a9f8-556d-a5bc-ba0b30a53901')
    expect(v1Uuid('users', 1)).toBe('466f5b25-b0a5-5512-99e2-daf2fadf2de0')
  })

  it('定数の名前空間で導出している', () => {
    expect(v1Uuid('staffs', 1)).toBe(v1UuidIn(V1_UUID_NAMESPACE, 'staffs', 1))
    expect(v1Uuid('staffs', 1)).not.toBe(v1UuidIn(DNS_NAMESPACE, 'staffs', 1))
  })

  it('同じ入力からは常に同じ uuid を返す', () => {
    const a = v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw')
    const b = v1Uuid('tenants', 'JuFZPcSXmXOaVvCmbb1JVw')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('テーブル名が違えば別の uuid になる（ID の衝突を避ける）', () => {
    expect(v1Uuid('staffs', 1)).not.toBe(v1Uuid('patterns', 1))
  })

  it('数値の id は文字列として扱う', () => {
    expect(v1Uuid('shifts', 42)).toBe(v1Uuid('shifts', '42'))
  })
})

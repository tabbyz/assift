import { FREE_STAFF_LIMIT } from './pricing'

/**
 * v1 の Subscription の引き継ぎの区分（019 §8.2.2）。`scripts/stripe/migrate-v1-subscriptions.ts` が使う純関数。
 *
 * | 区分 | 条件 | 扱い |
 * | --- | --- | --- |
 * | legacy | 上限 11 人以上・active / past_due / trialing | 旧料金に移す（schedule） |
 * | rescue | 上限 11 人以上・unpaid・90 日以内に編集あり | 下書きを無効・失敗した請求書を回収不能にして active に戻し、旧料金に移す |
 * | cancel_unpaid | 上限 11 人以上・unpaid・それ以外 | 下書きを無効にして即時解約 |
 * | cancel_free | 上限 10 人以下（0 円） | 下書きを無効にして即時解約 |
 * | skip | 解約済みなど | 何もしない |
 * | review | 想定外の状態（incomplete・paused など） | 何もしない。一覧で目で見る |
 */

export type MigrationCategory =
  'legacy' | 'rescue' | 'cancel_unpaid' | 'cancel_free' | 'skip' | 'review'

/** 救う対象の「最近の編集」の範囲（§11-10） */
export const RESCUE_WINDOW_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

export function migrationCategory(input: {
  status: string
  /** v1 の users.max_staffs_count */
  maxStaffsCount: number
  /** v1 で最後にシフトを編集した時刻。無ければ null */
  lastEditedAt: Date | null
  now: Date
}): MigrationCategory {
  const { status } = input
  if (status === 'canceled' || status === 'incomplete_expired') return 'skip'
  if (input.maxStaffsCount <= FREE_STAFF_LIMIT) {
    return ['active', 'past_due', 'trialing', 'unpaid'].includes(status) ? 'cancel_free' : 'review'
  }
  if (status === 'active' || status === 'past_due' || status === 'trialing') return 'legacy'
  if (status === 'unpaid') {
    const recent =
      input.lastEditedAt !== null &&
      input.now.getTime() - input.lastEditedAt.getTime() <= RESCUE_WINDOW_DAYS * DAY_MS
    return recent ? 'rescue' : 'cancel_unpaid'
  }
  return 'review'
}

/** 下書きを無効にする区分（未払いの分だけ。active の契約の下書きは猶予中の今月分なので触らない） */
export function shouldVoidDrafts(category: MigrationCategory, status: string): boolean {
  if (category === 'rescue' || category === 'cancel_unpaid') return true
  return category === 'cancel_free' && status === 'unpaid'
}

/** 最小限の CSV（v1 の `rails runner` の出力を読む・結果を書く）。ダブルクォートと改行を扱う */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((cells) => cells.some((cell) => cell !== ''))
  if (!header) return []
  return body.map((cells) =>
    Object.fromEntries(header.map((name, index) => [name, cells[index] ?? '']))
  )
}

export function toCsv(header: string[], rows: Record<string, string | number | null>[]): string {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return (
    [
      header.map(cell).join(','),
      ...rows.map((row) => header.map((name) => cell(row[name] ?? null)).join(',')),
    ].join('\n') + '\n'
  )
}

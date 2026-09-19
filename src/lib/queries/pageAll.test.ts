import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, pageAll, type Page } from './pageAll'

/** max_rows が `cap` のサーバーを真似る。total 件の連番を持つ */
function fakeServer(total: number, cap: number) {
  const calls: { from: number; to: number; withCount: boolean }[] = []
  const fetchPage = async (from: number, to: number, withCount: boolean): Promise<Page<number>> => {
    calls.push({ from, to, withCount })
    const requested = to - from + 1
    const data = Array.from(
      { length: Math.min(requested, cap, Math.max(total - from, 0)) },
      (_, i) => from + i
    )
    return { data, error: null, count: withCount ? total : null }
  }
  return { fetchPage, calls }
}

describe('pageAll', () => {
  it('1 ページに収まれば 1 回で終わる', async () => {
    const server = fakeServer(620, PAGE_SIZE)
    const rows = await pageAll(server.fetchPage)
    expect(rows).toHaveLength(620)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0]?.withCount).toBe(true)
  })

  it('max_rows を超える分を読み足し、count は 1 ページ目だけ要求する', async () => {
    const server = fakeServer(3100, PAGE_SIZE)
    const rows = await pageAll(server.fetchPage)
    expect(rows).toHaveLength(3100)
    expect(rows[3099]).toBe(3099)
    expect(server.calls.map((c) => c.withCount)).toEqual([true, false, false, false])
  })

  it('サーバーの max_rows が PAGE_SIZE より小さくても取り切る（歩幅は実際に返った行数）', async () => {
    // 本番のダッシュボードで max_rows = 500 にされている状況。PAGE_SIZE を歩幅にすると 500..999 の次が 1000.. になり
    // 間が抜けるが、返った行数を歩幅にすれば 500, 1000 から読み足して全件になる
    const server = fakeServer(1240, 500)
    const rows = await pageAll(server.fetchPage)
    expect(rows).toHaveLength(1240)
    expect(new Set(rows).size).toBe(1240)
    expect(server.calls.map((c) => c.from)).toEqual([0, 500, 1000])
  })

  it('count を要求し忘れた fetchPage は例外にする（黙って 1 ページで終わらせない）', async () => {
    const fetchPage = async (): Promise<Page<number>> => ({
      data: [1, 2, 3],
      error: null,
      count: null,
    })
    await expect(pageAll(fetchPage)).rejects.toThrow(/count/)
  })

  it('2 ページ目以降が短くても（別セッションの削除）例外にせず読めた分を返す', async () => {
    let n = 0
    const fetchPage = async (
      from: number,
      to: number,
      withCount: boolean
    ): Promise<Page<number>> => {
      n += 1
      const data = n === 1 ? Array.from({ length: 1000 }, (_, i) => i) : []
      return { data, error: null, count: withCount ? 1500 : null }
    }
    await expect(pageAll(fetchPage)).resolves.toHaveLength(1000)
  })

  it('ページのエラーはそのまま投げる', async () => {
    const fetchPage = async (): Promise<Page<number>> => ({
      data: null,
      error: { message: 'boom' },
      count: null,
    })
    await expect(pageAll(fetchPage)).rejects.toEqual({ message: 'boom' })
  })
})

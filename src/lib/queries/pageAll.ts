import 'server-only'

/**
 * 1 回の GET で受け取る行数。PostgREST の `max_rows`（`config.toml` で 1000。Supabase クラウドの既定も同じ）
 * がこれ以上は返さないので、同じ値にして「取り切れたか」を件数で判断する。
 */
export const PAGE_SIZE = 1000

export type Page<T> = {
  data: T[] | null
  error: { message: string } | null
  count: number | null
}

/**
 * `max_rows` に切られずに全件を読む（008 §10.9）。
 *
 * `max_rows` は超えた分を**黙って**切る。31 日 × 33 人あたりからシフト表が何も言わずに歯抜けになり、
 * 気付けるのは件数を数えたときだけなので、行数が増えうるクエリは必ずこれを通す。
 *
 * 1 ページ目だけ `count: 'exact'` を要求して総件数を受け取り、残りのページは並行に読む
 * （count は毎回 `SELECT count(*)` を走らせるので 1 回で足りる）。歩幅は 1 ページ目が実際に返した行数にする。
 * 呼び出し側は `.order()` を付けてページの境界を安定させること。
 *
 * ページの間に別の書き込みが挟まると、境界の行が重複したり抜けたりする（スナップショットではない）。
 * 読み手は Map に畳むなど重複に耐える形で使い、「少し古い表」を許容する（次の描画で直る）。
 * 一貫した読み書きが要る処理（コピー）は RPC で DB 側に置く。
 */
export async function pageAll<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<Page<T>>
): Promise<T[]> {
  const first = await fetchPage(0, PAGE_SIZE - 1, true)
  if (first.error) throw first.error
  // count が無いのは fetchPage が withCount を無視したとき。黙って 1 ページで済ませると、
  // この関数が防ぐはずの「切られたのに気付けない」が再発するので、ここで止める
  const total = first.count
  // null（count を要求していない）だけでなく NaN（Content-Range が `*/*`）も弾く
  if (total === null || !Number.isFinite(total))
    throw new Error('pageAll: fetchPage は 1 ページ目で count を要求すること')

  const rows = first.data ?? []
  if (rows.length >= total) return rows
  if (rows.length === 0) throw new Error(`pageAll: 総件数 ${total} なのに 1 ページ目が空`)

  // 歩幅は「実際に返った行数」。サーバーの max_rows が PAGE_SIZE より小さい環境（本番のダッシュボード設定）
  // で PAGE_SIZE を歩幅にすると、間の行が黙って抜ける
  const pageSize = rows.length
  const starts: number[] = []
  for (let from = pageSize; from < total; from += pageSize) starts.push(from)

  const rest = await Promise.all(starts.map((from) => fetchPage(from, from + pageSize - 1, false)))
  for (const page of rest) {
    if (page.error) throw page.error
    rows.push(...(page.data ?? []))
  }
  // ここで総件数と突き合わせない。歩幅を実測にした時点で max_rows の切り捨ては起きず、
  // 届かないのは 1 ページ目のあとに別セッションが削除したときだけ。それを例外にするとシフト表の描画が落ちる
  return rows
}

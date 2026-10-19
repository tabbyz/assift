import { initBotId } from 'botid/client/core'
import { config } from 'zod/v4/core'

/**
 * ブラウザでアプリのコードより先に走る（Next の `instrumentation-client`）。ここに書くものはブラウザ専用。
 *
 * Zod を `jitless` にする（CSP の `eval` 禁止への対応。022 §8）。Zod 4 はオブジェクトの parse を速くするために
 * `new Function` でコードを組む（JIT）。使えるかどうかは **`z.object()` を作った時点**で `Function("")` を試して探る
 * （`$ZodObject` の init）。CSP の `script-src` は `eval` を許さないので、動きはするものの違反
 * （`securitypolicyviolation` とコンソールのエラー）が出る。`jitless` にすると探らない。
 *
 * schema モジュールが評価される前でなければ間に合わないのでここに置く（root layout の Client では、ページ側の schema のほうが
 * 先に評価されることがある）。サーバーの Zod はそのまま（CSP の外。JIT が効く）。`lib/` に置くとサーバーのモジュールが誤って読めるので置かない。
 * `zod`（classic の `z` 全体）ではなく `zod/v4/core` の `config` だけを読む: このファイルは全ページの最初の chunk に入るので、
 * フォームの無いページ（LP・規約・公開シフト表）に Zod 全体を持ち込まない。`config` が書く `globalConfig` は classic と同じ
 */
config({ jitless: true })

/**
 * Vercel BotID（031 §4.6）。守る送信（お問い合わせの Server Action = `/contact` への POST）に判定のヘッダを付ける。
 * BotID は `fetch` を包み、パスとメソッドが合う同一オリジンの送信のときだけ判定のスクリプトを読む（ほかのページ・送信では何もしない）。
 * スクリプトは自分のドメインから `createElement` で足されるので、`'strict-dynamic'` で通る
 */
// 開発では読まない: サーバーの `checkBotId()` は開発で常に人と答え、判定のスクリプトの読み込みに失敗すると送信そのものが止まる（BotID は
// スクリプトを待ってから `fetch` を通す）。本番でスクリプトが読めないときは送信が失敗の表示になり、フォームはアドレスを案内する（031 §4.3）
if (process.env.NODE_ENV !== 'development') {
  initBotId({ protect: [{ path: '/contact', method: 'POST' }] })
}

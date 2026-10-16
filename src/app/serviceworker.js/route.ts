/**
 * v1 の Service Worker を解除する（026 §8）。
 *
 * v1 は全ページで `/serviceworker.js` を scope `'./'` で登録していた（`serviceworker-rails`）。v2 で 404 にしても登録は消えず、
 * v2 のすべてのリクエストを中継し続け、通信に失敗すると v1 の `offline.html` を出す。ブラウザは画面の遷移ごとにこのスクリプトを
 * 取り直し、中身が違えば新しい Service Worker として install するので、その **install の中で登録を解除し、キャッシュを消す**。
 *
 * - 有効化（`skipWaiting()` → `activate`）を経ない。Chrome は古い Service Worker が中継中のリクエスト（LP のフォントの先読みなど）を
 *   抱えているあいだ有効化を待たせ、その間の画面の移動が止まった（026 §12 2026-10-16。6 回中 3 回、15 秒以上）。
 *   解除は install の時点で効き、以降の移動はその登録に当たらず素のネットワークになる
 * - `unregister()` を `waitUntil` で待たない。解除の処理は install の処理が終わるまで順番待ちになるので、待つと互いに待ち合う
 * - 開いている画面は再読み込みしない（Server Action の途中で画面を飛ばさない）。その画面は閉じるまで古い Service Worker が中継する
 * - `fetch` のハンドラを持たない
 * - scope ごとの登録（`/`・`/share/`・`/tenants/<token>/` など）がそれぞれ取り直し、それぞれ自分を解除する
 * - キャッシュは全部消す（v2 は Cache Storage を使っていない）
 *
 * 2027-10-30 以降に消してよい（026 §6.6）。解除済みの人には何も起きないので、残っても害は無い
 */
const SCRIPT = `// assift: v1 の Service Worker を解除する
self.addEventListener('install', (event) => {
  self.registration.unregister()
  event.waitUntil(caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))))
})
`

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}

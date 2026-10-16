/**
 * v1 の Service Worker を解除する（026 §8）。
 *
 * v1 は全ページで `/serviceworker.js` を scope `'./'` で登録していた（`serviceworker-rails`）。v2 で 404 にしても登録は消えず、
 * v2 のすべてのリクエストを中継し続け、通信に失敗すると v1 の `offline.html` を出す。ブラウザは画面の遷移ごとにこのスクリプトを
 * 取り直し、中身が違えば入れ替えるので、自分を解除してキャッシュを消すだけの Service Worker を返す。
 *
 * - `fetch` のハンドラを持たない（入れ替わった時点で中継をやめる）
 * - 開いている画面は再読み込みしない（Server Action の途中で画面を飛ばさない）。次の遷移から素のネットワークになる
 * - scope ごとの登録（`/`・`/share/`・`/tenants/<token>/` など）がそれぞれ取り直し、それぞれ自分を解除する
 * - キャッシュは全部消す（v2 は Cache Storage を使っていない）
 *
 * 2027-10-30 以降に消してよい（026 §6.6）。解除済みの人には何も起きないので、残っても害は無い
 */
const SCRIPT = `// assift: v1 の Service Worker を解除する
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.registration.unregister())
  )
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

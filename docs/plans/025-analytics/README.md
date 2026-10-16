# 025: アクセス解析（Vercel Web Analytics）

- 前提: 017（プライバシーポリシーは導入済みとして書いている。§5「公開までに入れる」・§7 2026-10-13「10/30 までに入れる」）/
  020 §8（管理画面を対象から外す）/ 022（CSP）/ 024（仮のホスト `v2.assift.com`・`admin-v2.assift.com` は Production のデプロイ）
- 参照: `@vercel/analytics@2.0.1` の `dist/next/index.mjs`（読み込みの仕組み。§4）/
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`（`referrer`）

## 1. 目的と完了条件

ポリシー 7.「Cookieとアクセス解析」と 6. 委託先（Vercel の「アクセス解析」）は導入済みとして書いてあるのに、コードが無い（017 §1 の 3 つ目が閉じない）。
リリース（10/30）までに Vercel Web Analytics を入れ、**ポリシーの文と実装を食い違わせない**。

- [x] 本番（`VERCEL_ENV === 'production'`）の本体のホストだけで読み込む。プレビュー・開発・管理画面のホストでは、描画後の DOM にスクリプトの要素が無く、`/insights/` へのリクエストも出ない（§4.1）
- [x] 送る URL（`url`）にクエリとハッシュが入らない。参照元にメールアドレスが入らない（`/signup?email=…`。§3-2・§4.2・§4.3）
- [x] CSP（022）を変えずに動く: 仮のホストで `securitypolicyviolation` が 0 件、スクリプトと送信が同一オリジンで成功する（§6.2）
- [x] ダッシュボードに閲覧が届く（仮のホスト。§6.2）
- [x] ポリシーを実装に合わせる: 7. の「個人を特定できる形では記録されません」を削り、3. 利用目的に改善の項目を足す（§3-6・§3-9・§4.6）
- [x] 017 §1 の「実装と食い違わない」を §6.2 のあとで閉じ、004 / 017 / 020 / 022 / 024 / AGENTS.md の記述を導入済みにそろえる（§5）
- [x] `lint` / `typecheck` / `test` / `npx supabase test db` が通る

## 2. 範囲

### 作る

- `@vercel/analytics`（`^2.0.1`。2026-03-12 の安定版。`2.1.0-canary` は使わない）
- 読み込むかの判定と、送る URL からクエリ・ハッシュを落とす純関数（`lib/analytics/`）+ Vitest
- `<Analytics />` を包む Client コンポーネント（`beforeSend` は関数なので Server の root layout から渡せない）
- root layout での読み込み（host を見て管理画面のホストを外す）
- `/signup` の `metadata` に `referrer: 'strict-origin'` と、読んだあとに `?email=` を URL から消す処理（nuqs。§4.3）
- ポリシー 3. / 7. の文の修正と、関係するプラン・AGENTS.md の更新（§5）

### 作らない

- **カスタムイベント（`track()`）**: ページの閲覧だけを測る。送る項目が増えるのでポリシー 7. の見直しが要る。使うときに別に決める
- **Speed Insights（`@vercel/speed-insights`）**: ポリシーに書いていない。入れるならポリシーの改定が要る
- **Web Analytics Plus**（月 10 ドル。24 か月の履歴・UTM・カスタムイベントの項目 8 個）: どれも使わない（§3-5）
- **プレビューでの計測**（§3-4）
- **共有コード・uuid を伏せること**（§3-2）
- **proxy の matcher から `/_vercel/insights/...` を外すこと**（§3-7・§4.5）
- **サイト全体の `Referrer-Policy` ヘッダ**: 022 §2 で別のプランに回したもの。クエリに個人情報が載るページは `/signup` だけなので、そのページの `<meta name="referrer">` と `?email=` の削除で足りる（§4.3）

## 3. 決定（2026-10-15）

| # | 項目 | 決定 | 理由 |
| --- | --- | --- | --- |
| 1 | ツール | Vercel Web Analytics（017 §6 の決定のまま） | Cookie を使わない。同一オリジンで CSP を広げずに済む（§4.4） |
| 2 | 送る URL | **クエリとハッシュだけ落とす**。共有コード（`/share/<code>`）・uuid（店舗・スタッフ・勤務パターン・制約）は残す | クエリには `/signup?email=` のメールアドレスが入りうる（ポリシー 7.「メールアドレス…は送信しません」と食い違う）。path は店舗ごとの動きを見るのに要る。ダッシュボードを見るのは運営者だけで、Vercel はもともと委託先でアクセスログも持つ。スタッフの id だけではスタッフの情報とまでは言えない |
| 3 | 対象 | 管理画面のホスト以外のすべて（LP・規約・認証・店舗・アカウント・公開シフト表・404） | 管理画面は 020 §8 で外すと決めた（`?q=` にメールアドレスが載る）。公開シフト表の閲覧者はポリシーの対象者に入っている |
| 4 | 環境 | **本番だけ**（`VERCEL_ENV === 'production'`）。CSP とダッシュボードの実測は仮のホスト `v2.assift.com`（Production のデプロイ）で行う | プレビューのデータを混ぜない |
| 5 | プラン | Vercel の「Web Analytics（Included in your plan）」。超過は 100 万イベントあたり 30 ドル | Plus の追加分（§2）を使わない |
| 6 | ポリシー 7. | 「Cookieは使用せず、個人を特定できる形では記録されません。」→「Cookieは使用しません。」 | path に店舗の uuid が残り、運営者は DB と照らして利用者を特定できる（容易照合性）。Vercel 側の処理を私たちが保証する書き方（「Vercel が特定することはない」）もしない。制定（10/30）の前なので改定にはならない |
| 7 | proxy | `/_vercel/insights/...` を matcher から**外さない** | 外すと「除外は実在するパスに完全一致」（AGENTS.md）を Vercel の中のパスに広げることになる。proxy が走っても害は小さい（§4.5） |
| 8 | 当日の確認 | 024 §10 の「カットオーバーの後」に「`assift.com` でダッシュボードに 1 件届く」を足す | 仮のホストで確かめたあと、ドメインが変わっても届くことだけを見る |
| 9 | ポリシー 3. | **（2026-10-15 決定）**「個人を特定できない形に集計し、assiftを改善するため」は**残し**、その前に「アクセスの記録からassiftの利用状況を分析し、改善するため」を**足す** | §4.6。3. は「これ以外の目的で利用する場合は、あらかじめ同意」と言い切っている。店舗の uuid ごとの閲覧数は 1 店舗の利用状況そのもので「特定できない形の集計」に当たらず、7. の「各ページの利用状況を把握して改善する」が 3. のどの目的にも収まらなくなる。分析に使う元は「アクセスの記録から」（2. 取得する情報の項目。「など」を付けない）に限り、スタッフの情報（「店舗がassiftを利用するために必要な範囲でのみ」）や入力データまで広く分析に使うと読めないようにする。入力データの改善への利用は、既存の「個人を特定できない形に集計し」のまま（規約第 3 条と同じ）なので、置き換えずに残す |

## 4. 設計

### 4.1 読み込むかの判定（Server）

root layout（Server。もう `headers()` を読んでいる）で `host` を読み、純関数で決める。

```ts
// lib/analytics/load.ts
export function shouldLoadAnalytics(host: string | null, env: AdminHostEnv): boolean {
  return env.production && !isAdminHost(host, env)
}
```

- `adminHostEnv()` / `isAdminHost()`（`lib/admin/host.ts`）をそのまま使う。本番の `isAdminHost()` は `ADMIN_HOST` と一致するホストだけ `true`
  （`ADMIN_HOST` が無ければ常に `false` で、そのとき管理画面は 404。020 §4.2）
- **パスではなくホストで外す**: 本番の管理画面は管理画面のホストでしか開かず（proxy の 0 段目）、そのホストの HTML はすべて管理画面（404 を含む）。
  管理画面のホストと本体のホストの間にクライアント遷移は無い（オリジンが違う）
- `false` のときは `<SiteAnalytics />` を描かない。**スクリプトの要素はサーバーの HTML には出ない**（SDK が `useEffect` で足す。§4.2）ので、
  外れていることは描画後の DOM と Network で確かめる（§6）
- プレビュー（`VERCEL_ENV === 'preview'`）・開発・`next start`（`VERCEL_ENV` 無し）では読み込まない。
  したがって開発の `https://va.vercel-scripts.com/v1/script.debug.js`（SDK が開発で読む外部のスクリプト）も読まれない
- root layout は root の `not-found` も描くので、存在しない URL の 404 も計測される。一致するルートが無いと `useParams()` が `{}` を返し、
  SDK はクエリの値で path を置き換えようとする（`useRoute()`）。クエリが無ければ `route` は path のまま（例: `/nope`）。クエリの値が path の部分と一致すると
  `route` にクエリの**キー名**が入りうる（例: `/nope?a=nope` → `/[a]`。値は入らない。`/signup`・`/login` も同じ）。ダッシュボードの Routes に 404 の path が散る

### 4.2 送るもの

`@vercel/analytics/next` の `<Analytics />`（Client）は、`useEffect` で `window.va` のキューを作り、`<script>` を `document.createElement` で `<head>` に足す。
ページの閲覧は SDK が `usePathname()`（クエリ無し）と、`useParams()` で値を `[tenantId]` などに置き換えた `route` を送る（`disableAutoTrack`。スクリプトは履歴を見ない）。
`route` は `beforeSend` を通らないが、値を `[key]` に置き換えるだけで、クエリの値は入らない（§4.1）。
`Suspense` は SDK が内側で張る（`useSearchParams` のため）。全ルートが動的描画（022 §4.2）なので、ビルドの bail-out も起きない。

`beforeSend` で送る直前のイベント（`{ type, url }`）の `url` からクエリとハッシュを落とす。

```ts
// lib/analytics/url.ts
export function stripQueryAndHash(url: string): string

// components/SiteAnalytics.tsx（モジュールの最上位で 1 回だけ作る）
const beforeSend: BeforeSend = (event) => ({ ...event, url: stripQueryAndHash(event.url) })
```

- `event.url` にクエリが付くかは Vercel が配る `script.js` の中なので分からない。**付くと決めて落とす**
- `new URL()` で解釈できない値は、最初の `?` / `#` より前を返す（投げない。`beforeSend` が投げると送信ごと落ちる）
- `beforeSend` は**モジュールの最上位**に置く: SDK は `[props.beforeSend]` を依存にした effect で `window.va('beforeSend', …)` を登録し直すので、
  インラインの関数だと root layout の描き直し（Server Action の `refresh()` など）のたびに登録がやり直される。型は `@vercel/analytics/next` の `BeforeSend`
- `beforeSend` は `null` を返すと送らないが、使わない（対象の絞り込みは §4.1 の Server で済ませる）
- カスタムイベントは使わない（`track()` を import しない）。将来使うときも同じ `beforeSend` を通る

送られる項目（Vercel の説明）はページ・参照元・ブラウザと端末の種類・国で、ポリシー 7. のとおり。Cookie は使わない。

### 4.3 参照元（referrer）

`beforeSend` は参照元を書き換えられない。ブラウザの既定（`strict-origin-when-cross-origin`）では、**同じオリジンの遷移は完全な URL（クエリ込み）**が `document.referrer` に入る。

- クライアント遷移（`next/link`・`router.push`）は `document.referrer` を変えないので、入るのは全体の読み込みのとき（新しいタブ・Cmd / Ctrl / 中クリックを含む）
- クエリに個人情報が載るのは `/signup?email=` だけ（`signup/page.tsx`。いまの LP は付けていないが、ページは受ける）。
  そこから全体の読み込みになる経路は 1 本ではない（同意のリンク `/terms`・`/privacy` の `target="_blank"`（`SignupForm.tsx`）、ロゴの `/`（`(auth)/layout.tsx`）・「ログイン」（`SignupForm.tsx`）の新しいタブ）
- そこで**ページ単位で塞ぐ**: `signup/page.tsx` の `metadata` に `referrer: 'strict-origin'`（`<meta name="referrer" content="strict-origin">`）。
  meta が文書に挿入された時点で、そのタブの方針が `strict-origin` に替わる（クライアント遷移で `/signup` に入った場合も挿入で効く）。
  **要素が外れても方針は戻らない**（HTML 標準。最後に挿入・変更された meta だけが効く）ので、クライアント遷移で別のページへ移っても、全体の読み込みまで
  同一オリジンの参照元もオリジンだけのまま。害は無く安全側（§6.2-2 の結果はこの前提で読む）。
  文書の方針なので、送信のリクエストの `Referer` ヘッダ（同一オリジンの既定はクエリ込み）もオリジンだけになる
- Next 16 はメタデータをストリーミングするので、meta は `<head>` ではなく本文の位置に書き出されることがある（`lib/metadata/metadata.js` の `<div hidden>` + `Suspense`）。
  本文の meta でも方針は効く。確かめるときは位置を問わず探す（§6.1）
- あわせて **`?email=` を URL から消す**: `signup/searchParams.ts`（`email: parseAsString` + `createLoader`）を置き、`page.tsx` は `firstString()` の代わりに
  `loadSignupSearchParams()` で読む。`SignupForm` は `useQueryStates(signupParsers)` で、値があれば effect で `{ email: null }` にする
  （既定の shallow・`history: 'replace'`。`history.replaceState` だけを呼び、RSC は取りに行かず再マウントもしない。URL が書き換わるのは nuqs の flush（`setTimeout` のあと。最初の更新はスロットルの待ちが実質 0）のあと。
  ハッシュは残る）。入力欄の値は `useState(initialEmail)` が持つので消えない。`history.replaceState` も `router.replace` も手で書かない（AGENTS.md の nuqs の節。
  `router.replace` はサーバーへ取りに行く）。004 §7.1 の「`?email=` は 1 度読むだけなので nuqs は使わない」は、URL から消すために nuqs に乗せ替える（004 に追記。§5）。理由:
  - スクリプトがクライアント遷移の 2 回目以降の閲覧で、前のページの URL（`location.href`。クエリ込み）を参照元として送る実装でも、flush が最初の閲覧より先なら漏れない（`script.js` は見えない。先に出た場合は下の「消すまでの窓」）
  - meta の方針の効き方（本文の位置の meta・挿入・外れても戻らない）はブラウザの実装に依る。ローカルの Playwright は Chromium だけ（`/opt/pw-browsers`）で、
    スマホの主な利用者がいる iOS Safari（WebKit）では確かめられない。URL から消せば、消したあとの遷移はブラウザに依らず漏れない
  - 消すまでの窓: SDK はスクリプトの要素を自分の effect で足す。SDK は自分の `Suspense` の中で描くので hydration が後の別パスになりうり、
    nuqs の flush（後のタスク）との**前後は決まらない**。`script.js` の GET は URL を消す前に出ることがあり、スクリプトが早く読めた（HTTP キャッシュなど）ときは閲覧の送信も先に出うる。
    meta が効くブラウザではそれらの `Referer` もオリジンだけ。meta が効かないブラウザでは、**`script.js` の GET と、早く出た送信の `Referer`** に消す前の URL が載りうる。
    Vercel はページのリクエストそのものから同じ URL を受け取っている（委託先のアクセスログ。§3-2）。閲覧のデータ（送信の中身）の URL には入らない（`beforeSend`）ので受け入れる。最初の閲覧が flush より先に出て、スクリプトがその URL を次の閲覧の参照元に使う実装なら参照元に入りうる（§7 の「前の URL を参照元に使うか」で扱う）
- ほかのクエリ（`?start=`・`?tab=`・`?kind=&staffId=`・`?next=`・`?error=` / `?notice=` のキー・`?checkout=success`・`?portal=return`（`account/billing/page.tsx`））は個人情報ではない。
  これらは参照元・送信の `Referer` ヘッダにクエリごと入りうる（同一オリジンの既定）が、ポリシーとは食い違わない
- Vercel のダッシュボードが同じホストの参照元をどう出すか（ホスト名だけか、自分のホストを捨てるか）は §6.2 で見て記録する

### 4.4 CSP（022）を変えない理由

| 経路 | directive | 通る理由 |
| --- | --- | --- |
| `<script src="/_vercel/insights/script.js">` | `script-src 'self' 'nonce-…' 'strict-dynamic'` | `'strict-dynamic'` の下では `'self'` は無視されるが、nonce 付きのスクリプト（Next の chunk）が `createElement('script')` で足した**パーサーを通らない**スクリプトは信頼が引き継がれる。SDK はこの形で足す（`'strict-dynamic'` を知らない古いブラウザは `'self'` で通る） |
| 閲覧の送信（`/_vercel/insights/view` など） | `connect-src 'self'` | 同一オリジン（`fetch` / `sendBeacon` とも `connect-src`） |
| `NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH` があるとき | 同上 | `<basePath>/insights/...` になるが同一オリジン |
| `NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG` があるとき（要確認） | — | SDK はこの JSON の `.analytics`（`scriptSrc` / `viewEndpoint` / `eventEndpoint` / `sessionEndpoint` / `endpoint` / `dsn`）を props に混ぜる。外部の `scriptSrc` は `'strict-dynamic'` の下で止まらず、外部の送信先は `connect-src 'self'` で止まって送信が黙って失敗する。Vercel がこの値を入れるか・入れるなら同一オリジンかは §6.2-7 で Network を見て記録する |

本番で使う外部のオリジンは 0 のまま（022 §3）。`csp.ts` の方針の文字列もテストも変えない。`connect-src` のコメントに「Vercel Web Analytics も同一オリジン（025）」を足す。
**推論なので実測する**（§6.1 はスクリプトに見立てたもので `'strict-dynamic'` の引き継ぎだけ、§6.2 は本物）。

### 4.5 proxy と `/_vercel/insights/...`

Vercel の上でこのパスに proxy（Next の middleware）が走るかは分かっていない（next-intl などが matcher から `_vercel` を外すよう勧めているので、走る前提で考える）。走る場合:

- 本体のホスト: 0 段目は `pass`、1 段目（v1 の 22 文字トークン）・3 段目（`/tenants/<uuid>`）は該当しない。2 段目の `updateSession()` が閲覧の送信ごとに走る
  （`getClaims()`。保護ルートではないので redirect しない）。応答に CSP が付くが、スクリプトと JSON の応答には効かない
- 管理画面のホスト: 0 段目が `redirectToAdmin` にするが、§4.1 で管理画面のホストでは読み込まないので届かない

- セッションの更新: 送信は同一オリジンなので cookie が付く。アクセストークンが切れていれば `getClaims()` が refresh し、送信の応答で `Set-Cookie` を返す。
  クライアント遷移の RSC のリクエストとほぼ同時に起きうるが、Refresh token reuse interval が本番も 10 秒（024 §4.3）なので壊れる見込みは低い
  （AGENTS.md の「prefetch を除外しない」と同じ種類の話）。除外すると、その送信では更新が起きず、次の HTML / RSC のリクエストが proxy で更新するだけ。外す理由（性能）も外さない理由（定石からの逸脱を避ける）も小さい
- タブを隠す・閉じるときの送信: `script.js` が `pagehide` / `visibilitychange` で送る実装（`sessionEndpoint` など）で、かつ proxy が走るなら、長く開いたタブを閉じたときの送信が refresh を起こし、
  その応答の `Set-Cookie` が保存されないと古い refresh token が残って次に開いたときにセッションが失効しうる（主なブラウザは keepalive の応答の cookie も保存するはずで、見込みは低い）。§6.2-7 で記録する

害は小さいので外さない（§3-7）。AGENTS.md の proxy の節と `src/proxy.ts` の matcher のコメントにこの決定を書く（定石に倣って `_vercel` を除外しないように）。
§6.2-7 で送信の応答に `content-security-policy`・`set-cookie` が付くか（= proxy が走ったか）を見て記録する。
送信が 3xx / 4xx になる・目立って遅い・タブを隠す / 閉じるときに送信が出る（上の失効の経路）と分かったら、そのときに完全一致の除外を検討する。

### 4.6 ポリシーとの突き合わせ（017 §4 の Cookie の行・ポリシー 3. / 6. / 7.）

| ポリシーの文 | 実装 |
| --- | --- |
| 3.「個人を特定できない形に集計し、assiftを改善するため」 | **合わない**。店舗の uuid の path ごとの閲覧数は 1 店舗の利用状況になる。→ この項目は残し、「アクセスの記録からassiftの利用状況を分析し、改善するため」を足す（§3-9）。要約（「サービスの改善のために利用します」）は変えない。規約第 3 条の「個人を特定できない形に集計し、サービスの改善に利用」は入力データの話で、アクセス解析は入力データを使わないので変えない |
| 7.「アクセス解析（Vercel Web Analytics）を使用しています」 | 本番の本体のホストで読み込む（§4.1） |
| 7.「閲覧したページ、参照元、ブラウザや端末の種類、国がVercelに送信されます」 | Vercel の送る項目のまま。ページはクエリ・ハッシュを落とした URL（§4.2） |
| 7.「Cookieは使用しません」・「次の目的でCookieとブラウザの保存領域を使用します」（目的の列挙） | Vercel Web Analytics は Cookie を使わない。保存領域（Local Storage / Session Storage）にも書かないことを §6.2-4 で見る（書くと列挙に無い目的になる） |
| 7.「名前やメールアドレス、assiftに入力されたデータは送信しません」 | クエリを落とす（§4.2）・`/signup` の参照元（§4.3）。path に入るのは id とコードだけで、名前・入力の値は入らない。**ページのタイトルには店舗名が入る**（`[tenantId]/layout.tsx` の `template: '%s \| <店舗名>'`）。`script.js` がタイトルを送るかは分からないので §6.2-2 で見る（`beforeSend` では消せない。送っていたら §7）。解析のリクエスト（`/_vercel/insights/*`）は同一オリジンなので、ブラウザが本体の cookie（Supabase のセッション。JWT にメールアドレスが入る）を自動で付ける。ページのリクエストと同じで、委託先の Vercel はもともとページのリクエストで同じ cookie を受けている。解析が読み取って送る項目ではない（§4.3 の `Referer` と同じ整理） |
| 6. 委託先「Vercel（米国）：…アクセス解析」 | 変更なし |

電気通信事業法の外部送信規律（2023）は、017 §7（2026-10-07）の判断どおり assift の業態では対象外と見ている。対象だったとしても規律が求めるのは
送る情報・送り先・目的の通知または公表（止め方の案内は選択肢の 1 つで必須ではない）で、7. に書いてある。017 §7 の「規律が求める項目（…・止め方）は 7. で満たしている」は、
同じ日の後のログで止め方の案内を外したので古い。017 のログで直す（§5）。

## 5. ファイル

| ファイル | 内容 |
| --- | --- |
| `package.json` / `package-lock.json` | `@vercel/analytics` |
| `src/lib/analytics/load.ts` + test | `shouldLoadAnalytics()`（§4.1） |
| `src/lib/analytics/url.ts` + test | `stripQueryAndHash()`（§4.2） |
| `src/components/SiteAnalytics.tsx` | `'use client'`。最上位の `beforeSend` + `<Analytics beforeSend={beforeSend} />`（§4.2） |
| `src/app/layout.tsx` | `host` を読み、`shouldLoadAnalytics()` のときだけ `<SiteAnalytics />` を `<body>` に描く（`AppProviders` の外。Mantine に依らない） |
| `src/app/(auth)/signup/searchParams.ts` | `signupParsers`（`email: parseAsString`）+ `loadSignupSearchParams`（§4.3） |
| `src/app/(auth)/signup/page.tsx` | `metadata` に `referrer: 'strict-origin'`。`firstString()` の代わりに `loadSignupSearchParams()`（§4.3） |
| `src/app/(auth)/signup/_components/SignupForm.tsx` | `useQueryStates(signupParsers)` で、値があれば `?email=` を消す（§4.3） |
| `src/lib/security/csp.ts` | `connect-src` のコメントだけ（§4.4） |
| `src/proxy.ts` | matcher のコメントだけ（`/_vercel/insights/...` を外さない。§4.5） |
| `src/app/(public)/(site)/privacy/_components/sections.tsx` | 7. の一文（§3-6）・3. の改善の項目を足す（§3-9） |
| `docs/plans/017-privacy/README.md` | §1 の 3 つ目は **§6.2 の結果を 025 のログに書くときに閉じる**（PR では閉じない。§6.2 でタイトル・保存領域の食い違いが見つかると、閉じたのに合っていない状態になる）・§4 の「アクセス解析（未実装）」と「共有リンクの閲覧者｜…アクセスログのみ」（閲覧者もアクセス解析の対象。§3-3）・§5 の導入の行・§6 の「導入そのものは別の作業」を 025 に向ける・§7 にログ（3. / 7. の文の変更、外部送信規律の記述の訂正。§4.6） |
| `docs/plans/004-auth/README.md` | §7.1 の `src/utils/searchParams.ts` の行に「`?email=` は 025 で nuqs に移した（URL から消すため）」 |
| `docs/plans/020-admin/README.md` | §8 の末尾に「025 で管理画面のホストを外した」 |
| `docs/plans/022-csp/README.md` | §3 の「外部のオリジンは 0」の下に Vercel Web Analytics の注記（§4.4） |
| `docs/plans/024-production/README.md` | §2「しない」の解析の行を 025 に向ける・§10「カットオーバーの後」に当日の確認（§3-8） |
| `AGENTS.md` | ディレクトリの `lib/analytics/`・`components/SiteAnalytics.tsx`・root layout の説明、CSP の節に「Vercel Web Analytics は同一オリジン（025）」、proxy の節に「`/_vercel/insights/...` は matcher から外さない（025 §3-7・§4.5）」、nuqs の節（とディレクトリの `searchParams.ts` の行）に「URL から値を消すときも nuqs で（`/signup` の `?email=`。025 §4.3）。`history.replaceState` を手で書かない」 |

## 6. 確認

### 6.1 ローカル（`npm run build && npm run start`）

`supabase start`（AGENTS.md「クラウドのセッション」）と `.env.local` を用意する。Playwright で数える（022 §6 と同じやり方）。
スクリプトの要素はクライアントで足されるので、**描画後の DOM**（`page.locator('script[src*="/insights/"]')`）と **Network**（`page.on('request')`）で見る。

1. `VERCEL_ENV` 無し: `/`・`/signup`・ログイン後のシフト表で、DOM にスクリプトの要素が無く、`/insights/` へのリクエストも出ない
2. `VERCEL_ENV=production ADMIN_HOST=admin.localhost:3000`:
   - 本体（`localhost:3000`）の `/`・`/terms`・`/privacy`・`/signup?email=a@example.com#x`・`/share/<存在しないコード>`・ログイン → シフト表 → 設定で、
     スクリプトの要素が `<head>` に 1 つあり、`securitypolicyviolation` が 0 件。`/`・`/login`・`/signup` はログインすると `/tenants` へ redirect される（クエリも落ちる）ので、ログインの前に見る
   - Playwright の `page.route()` で `/_vercel/insights/script.js` を `application/javascript` の小さなスクリプト（`window.__vaLoaded = true`）に差し替え、
     **実行された**こと（`'strict-dynamic'` の引き継ぎ。§4.4）と違反 0 件を見る。差し替えないと 404 の HTML が返るのでスクリプトとしては動かない（CSP の違反ではない）
   - 同じ差し替えのまま `/signup?email=a@example.com#x` で、`window.vaq` に `beforeSend` と `pageview` が積まれていること（`pageview` は 1 件だけ。`?email=` を消しても閲覧は増えない）、
     積まれた `beforeSend` に**固定の文字列** `{ type: 'pageview', url: origin + '/signup?email=a@example.com#x' }` を渡すと `url` からクエリとハッシュが落ちることを見る
     （配線の確認。`location.href` は nuqs が `?email=` を消したあとなので使わない）
   - `/signup` に `<meta name="referrer" content="strict-origin">` がある（位置は問わない。`document.querySelector('meta[name="referrer"]')`。§4.3）。
     挙動も見る: `/signup?email=a@example.com` から同意のリンク（`target="_blank"`）で開いた `/terms` の `document.referrer` が `origin + '/'`。
     `/signup?email=…` からクライアント遷移で `/login` へ移ったあとに `/login` から新しいタブで開いても、オリジンだけのまま（§4.3 の「戻らない」。Chromium での確認）
   - `/signup?email=a@example.com` を開くと、入力欄に `a@example.com` が入り、アドレスバー（`location.search`）から `?email=` が消える。消えたあとも入力欄の値は残る。
     履歴は増えない（`history.length` が変わらない）。サーバーへ取りに行かない（**パスが `/signup` の** RSC の要求（`/signup?_rsc=…`）が出ない。ロゴ・「ログイン」の `next/link` の先読みも `RSC: 1` と `_rsc` を付けるので、パスで絞って数える）
   - 管理画面（`admin.localhost:3000/-/login`・ログイン後の一覧）で、DOM にスクリプトの要素が無く、`/insights/` へのリクエストも出ない
3. `lint` / `typecheck` / `test` / `npx supabase test db`（スキーマは触らないが、AGENTS.md「PR の流れ」の決まり）

### 6.2 仮のホスト（Production）

人間の手順: **merge の前に** Vercel の Project → Analytics で Web Analytics（Included in your plan）を Enable する（有効にしたあとのデプロイで `/_vercel/insights/` が生える。
merge が先になったら、Enable のあとで Production を Redeploy する。そうしないとスクリプトが 404 になり、コンソールに SDK の「Be sure to enable Web Analytics…」が出る）。

試しのアカウント・店舗・共有は 024 §5 と同じ決まりで作る: **v1 に無いメール**で作り（重なると移行が ROLLBACK する。021 §9.3）、**管理用アカウントでは本体にログインしない**（020 §5.1）。
`/`・`/login`・`/signup` は**ログアウトした状態**（別のブラウザのプロファイル）で見る（ログイン済みだと `/tenants` へ redirect され、クエリも落ちる）。
どれも**拡張機能の無いプロファイル**（ゲストなど）で見る（広告ブロッカーが `/_vercel/insights/script.js` を止めると、Enable 漏れと同じ「Be sure to enable…」が出て見分けがつかない）。終わったら 024 §5-14 と同じ片付けと SQL の確認をする
（本番は管理用アカウント 1 件・店舗 0 件の状態で 021 §9.3 に渡す。024 §10）。

| # | 見ること | 期待 |
| --- | --- | --- |
| 1 | `v2.assift.com` の `/`・`/signup?email=test@example.com#x`・`/login?next=/tenants`・`/share/<code>`・ログイン → シフト表（`?start=<日付>` 付きで開く）・設定 | DOM に `script[src*="/insights/"]` がある（5・6 の対照）。Network でスクリプトが 200、送信が 2xx。コンソールに `Refused to …` が無い（`securitypolicyviolation` 0 件） |
| 2 | `/insights/` へのリクエスト**すべて**（閲覧の送信以外も。`sessionEndpoint` など）の Payload の全項目と Request Headers の `Referer` | `example.com`・`?`・`#` を検索して出てこない（`/signup`）。`/signup?email=…` から**クライアント遷移で** `/login` へ移った閲覧と、**新しいタブで** `/login` を開いた閲覧の 2 通りで見る。漏れていたら §4.3 の手当てを見直す |
| 2b | `beforeSend` が効いていること | `/signup` では、nuqs が先に消すことが多く、どちらが効いたか区別できない（§4.3）。クエリが個人情報でないページで見る: `/tenants/<id>?start=<日付>` の閲覧の送信の URL に `?` が無い。`/login?next=/tenants` から**クライアント遷移**した次の閲覧で、参照元の項目に前の URL のクエリが入るかを記録する（§7） |
| 2c | シフト表・設定の閲覧の送信 | 試しの**店舗名・スタッフ名**を検索して出てこない（タイトル。§4.6） |
| 3 | ダッシュボード（数分後） | 閲覧が届く。Pages に `/signup?email=…`・`/tenants/<id>?start=…`・`/login?next=…` が無い。Routes に `/tenants/[tenantId]` などがまとまる。参照元の出方を記録（§4.3） |
| 4 | DevTools の Application → Cookies / Local Storage / Session Storage | アクセス解析のものが増えていない（ポリシー 7. の列挙。§4.6） |
| 5 | `admin-v2.assift.com/-/login`・ログイン後の一覧 | DOM にスクリプトの要素が無く、Network に `/insights/` へのリクエストが無い |
| 6 | プレビュー（このあとの PR のどれか） | 5 と同じ |
| 7 | スクリプトのパスとすべての送信先（Network。2 と同じ範囲）。**送信のリクエスト**の Response Headers | スクリプトも送信先もすべて同一オリジン（§4.4 の `CLIENT_CONFIG`）。パス（`/_vercel/insights/` か basePath か）を記録。送信の応答に `content-security-policy`・`set-cookie` があるか（proxy が走ったか・セッションの更新が起きるか。§4.5）を記録（スクリプトへの `curl -sI` では測らない。HEAD が Next の 404 に落ちると CSP が付いて読み違える）。タブを隠す・閉じるときに `/insights/` への送信が出るか（Network の Preserve log）も記録（§4.5） |

### 6.3 カットオーバーの後

`assift.com` でダッシュボードに 1 件届く（024 §10 に足す。§3-8）。当日の確認は 026 §6.5-9。

## 7. 未確定

- ~~`script.js` がページのタイトル（店舗名が入る）を送るか~~ → 送らない（§8 2026-10-15 本番の確認）
- ~~`script.js` が保存領域を使うか~~ → 使わない（同）
- 404 の path がダッシュボードの Routes に散ること（§4.1）。困ったら §6.2 のあとで `beforeSend` や `not-found` での扱いを考える
- ダッシュボードの Referrers の出方（§4.3）。送信の `r` は `/signup`・店舗のページとも空だった
- ~~proxy が走るか・`CLIENT_CONFIG` を Vercel が入れるか~~ → 走らない。パスはランダムな basePath（同）

## 8. 実装ログ

### 2026-10-15 プランのレビュー 1 回目（13 件。すべて反映）

- 参照元: 同意のリンク 2 本の `noreferrer` ではロゴ・「ログイン」の新しいタブが残る → `/signup` の `metadata.referrer`（§4.3）。クライアント遷移で前の URL を参照元に使う実装の確認と、そのときの手当て（§6.2-2）
- 確認: スクリプトは `useEffect` で足すので「HTML に無い」では何も確かめられない → DOM と Network で見る（§1・§4.1・§6）
- ポリシー 3.「個人を特定できない形に集計し」も uuid の path と合わない → §3-9（要確認）・§4.6
- 仮のホストの試しのデータ（v1 に無いメール・管理用アカウントを使わない・片付け）とログアウトした状態で見るページ（§6.2）
- 404 の `route` は null ではなく path のまま（§4.1）/ `CLIENT_CONFIG` の行（§4.4・§6.2-7）/ `beforeSend` はモジュールの最上位（§4.2）/
  `window.vaq` での配線の確認（§6.1）/ 保存領域も見る（§6.2-4）/ 外部送信規律の古い記述（§4.6・§5）/ Enable と merge の順（§6.2）/ AGENTS.md の proxy の節（§4.5・§5）

### 2026-10-15 プランのレビュー 2 回目（8 件。すべて反映）

- meta referrer は要素が外れても方針が戻らない（全体の読み込みまで `strict-origin`）。送信の `Referer` ヘッダにも効く（§4.3）
- タイトルに店舗名が入る（tenant の layout）。送らないことと `Referer` ヘッダを §6.2-2 で見る。送っていたときの手当ては §7
- Next 16 のメタデータのストリーミングで meta が本文に出ることがある → 位置を問わず探し、参照元の挙動も見る（§6.1）
- ポリシー 3. の案を「アクセスの記録などから…」にして 2. に結び付け、規約第 3 条は変えない理由を書いた（§3-9・§4.6）/ 完了条件の 3. は確認後（§1）
- 017 §4 の「共有リンクの閲覧者」の行・`src/proxy.ts` の matcher のコメント（§5）/ proxy が走ったときのセッション更新（§4.5）/ 拡張機能の無いプロファイルで見る（§6.2）

### 2026-10-15 プランのレビュー 3 回目（8 件。すべて反映）

- ポリシー 3. の案: 「など」があると分析の元が開いたままになる → 既存の「個人を特定できない形に集計し」は残し（規約第 3 条と同じ）、「アクセスの記録から…」を足す形にした（§3-9・§4.6）
- meta referrer の効き方はブラウザに依り、ローカルは Chromium だけで WebKit を確かめられない → 控えにしていた `?email=` の削除を本命にし、nuqs の `useQueryState` で行う（AGENTS.md の nuqs の節）。meta と両方入れる（§4.3・§5・§6.1）
- `sessionEndpoint` を §4.4 に足し、§6.2-2・7 は `/insights/` へのリクエストすべてを見る / 保存領域の手当てを §7 に / 017 §1 は §6.2 のあとで閉じる（§5）/
  `npx supabase test db`（§6.1）/ refresh token の根拠を 024 §4.3 に（§4.5）

### 2026-10-15 プランのレビュー 4 回目（8 件。すべて反映）

- nuqs が `?email=` を先に消すので、`/signup` では `beforeSend` の確認が空振りする → §6.1 は固定の文字列を渡し、§6.2-2・3 はクエリが個人情報でないページ（`?start=`・`?next=`）で見る。参照元に前の URL のクエリが入るかも `/login?next=` からのクライアント遷移で記録する
- nuqs の使い方を AGENTS.md の形に（`signup/searchParams.ts` + `createLoader`、`useQueryStates`）。004 の「nuqs は使わない」に追記（§4.3・§5）
- 完了条件を設計に合わせた（URL はクエリ無し、参照元はメールアドレス無し。§1）/ ほかのクエリに `?checkout=`・`?portal=` を足した（§4.3）/ `§2` の「作らない」の文 /
  消すまでの窓の説明を正確に（`script.js` の GET の `Referer` だけ。§4.3）/ §4.5 の理由の誤りを直し、タブを閉じるときの送信の経路を足した（§4.5・§6.2-7）/ nuqs の確認（RSC を取りに行かない・閲覧が 1 件・値が残る。§6.1）

### 2026-10-15 プランのレビュー 5 回目（5 件。すべて反映）

- §6.1 の「サーバーへ取りに行かない」は、`next/link` の先読みも `RSC: 1` を付けるので必ず失敗する → パスが `/signup` の RSC の要求に絞って数える
- 004 の参照先は §5 ではなく §7.1（成果物の表）/ AGENTS.md の nuqs の節に「URL から値を消すときも nuqs」を足す（§5）/ 完了条件に 004（§1）/
  `route` にクエリのキー名が入りうること（値は入らない。§4.1・§4.2）/ URL の書き換えは flush のあとで、`script.js` の GET はほぼ必ずその前（Safari はさらに遅れうる。§4.3）

### 2026-10-15 プランのレビュー 6 回目（3 件。すべて反映）

- 消すまでの窓: SDK は自分の `Suspense` の中で描くので、nuqs の flush との前後は決まらない。早く出た送信の `Referer` も含めて受け入れる理由を書き直した（§4.3）
- 解析のリクエストに同一オリジンの cookie（JWT にメールアドレス）が付くことを §4.6 に（Vercel はページのリクエストで同じ cookie を受けている）
- proxy が走ったかは、スクリプトへの `curl -sI` ではなく送信の応答ヘッダで見る（§4.5・§6.2-7）

### 2026-10-15 プランのレビュー 7 回目（4 件。すべて反映。ここでレビューを打ち切る）

- §6.2 の表の #2 の行が崩れていた（セルの中の改行）→ 2・2b・2c に分けた
- `/signup` で `beforeSend` が区別できない理由を §4.3 に合わせた / nuqs を使う理由に「flush が最初の閲覧より先なら」の条件を付け、先に出た場合の扱いを §7 に寄せた（§4.3）/
  ログイン済みで飛ばされるのは `/login` も（§6.1・§6.2）
- 指摘は 13 → 8 → 8 → 8 → 5 → 3 → 4（6 回目以降は高なし、7 回目は表の崩れの 1 件だけが中）。ユーザーと決めて、7 回目の反映で打ち切り、実装に入る
- ポリシー 3. の文（§3-9）はユーザーが確認した（2026-10-15）

### 2026-10-15 実装

- §5 のとおり。`@vercel/analytics` は `^2.0.1`。`SiteAnalytics` は root layout の `<body>` の末尾（`AppProviders` の外）
- 017 / 004 / 020 / 022 / 024 / AGENTS.md を更新。017 §1 の「実装と食い違わない」は §6.2 のあとで閉じる（未チェックのまま）

### 確認（§6.1）

`npm run build && npm run start`（ローカルの Supabase・seed）+ Playwright（`playwright-core` + `/opt/pw-browsers` の Chromium）。

- `VERCEL_ENV` 無し: `/`・`/terms`・`/privacy`・`/signup`・`/share/NOPE0000`・`/nope`・ログイン後のシフト表（`?start=`）・設定・アカウントで、DOM にスクリプトの要素が無く、`/insights/` へのリクエストも無い。違反 0 件（10/10）
- `VERCEL_ENV=production ADMIN_HOST=admin.localhost:3000`（22/22）:
  - 本体の上の 9 ページでスクリプトの要素が 1 つ。差し替えたスクリプト（`window.__vaLoaded = true`）が**実行された**（`'strict-dynamic'` の引き継ぎ）。違反 0 件
  - `/signup?email=a@example.com#x`: `vaq` は `beforeSend`・`pageview` の 1 件ずつ。積まれた `beforeSend` に固定の URL を渡すと `/signup` になる。
    `<meta name="referrer" content="strict-origin">` がある。`?email=` が消え、入力欄に値が残り、ハッシュは残る。履歴は増えない。`/signup` の RSC を取りに行かない
  - 参照元: 同意のリンク（新しいタブ）で開いた `/terms` の `document.referrer` がオリジンだけ。クライアント遷移で `/login` へ移ったあとに新しいタブで開いてもオリジンだけ
  - 管理画面のホスト（`/-/login`・ログイン後の `/-/users`）: スクリプトの要素が無く、`/insights/` へのリクエストも無い。違反 0 件
- `lint`（既存の warning 1 件のみ）/ `typecheck` / `test`（924 件）/ `npx supabase test db`（241 件）が通る。`format:check` の警告 3 件は今回触っていない既存のファイル
- 途中で、止め損ねた最初の `next start` がポート 3000 に残り、2 回目以降の起動が `EADDRINUSE` で落ちて古いサーバーを測っていた（`pkill -f "next start"` が自分のシェルにも当たっていた）。止めてからやり直した結果が上

### 残り（§6.2・§6.3）

- 人間: Vercel の Web Analytics を merge の前に Enable（Included in your plan）
- merge のあと仮のホストで §6.2 の 1〜7。結果をここに書き、017 §1 を閉じる。カットオーバーの後に §6.3

### 2026-10-15 本番の確認（§6.2。`v2.assift.com`）

ユーザーが Chrome の DevTools で確かめた（PR #40 を merge したあとの Production）。

- **パス**: スクリプトは `https://v2.assift.com/0c9b77994ea40d88/script.js`、送信は `…/0c9b77994ea40d88/view`（POST）。`/_vercel/insights/` ではなく、Vercel が決めるランダムな basePath。
  どちらも同一オリジンで 200（`application/javascript`・`text/plain`）。§4.4 の `CLIENT_CONFIG` / basePath の行が実際に当たった（同一オリジンなので CSP は変えずに済む）
- **CSP**: コンソールの `Refused` は 0 件（`/`・`/terms`）
- **proxy**: スクリプトと送信の応答に `content-security-policy`・`set-cookie` が無い。Vercel が Next より手前で受けていて、proxy は走らない。§4.5 の心配（送信ごとのセッション更新・タブを閉じるときの失効）は起きない
- **`/signup?email=test@example.com`**: アドレスバーから `?email=` が消え、入力欄に残る。送信のペイロードは `o: "https://v2.assift.com/signup"`・`dp: "/signup"`・`r: ""`（ほかは `sdkn` / `sdkv` / `sv` / `ts`）。
  `Referer` は `https://v2.assift.com/`、参照ポリシーは `strict-origin`
- **店舗のシフト表（`?start=` 付き）**: `o` は `…/tenants/<uuid>`（クエリ無し）、`dp` は `/tenants/[tenantId]`。**タイトル（店舗名）は送らない**（項目に無い）
- **保存領域**: 解析の Cookie / Local Storage / Session Storage は増えない
- **管理画面のホスト**（`admin-v2.assift.com/-/login`）: スクリプトも送信も出ない
- **ダッシュボード**: 閲覧が届き、Pages に `?email=` 付きの URL が無い
- 送信の `Cookie` ヘッダに `_ga` / `_gid` / `_ga_PEWY7F46FH` / `_BEAMER_…` があった。v2 ではなく、v1（`assift.com`）の Google Analytics と Beamer が `.assift.com` に付けたもので、
  サブドメインにも送られている。v2 は読まない（017 §7 2026-10-15（v1 の cookie））
- AGENTS.md・022・`csp.ts`・`proxy.ts` の `/_vercel/insights/` の記述を、実際の形（ランダムな basePath・proxy は走らない）に直した
- 017 §1 の「実装と食い違わない」を閉じた。残りは §6.3（カットオーバーの後に `assift.com` で 1 件届く。024 §10）

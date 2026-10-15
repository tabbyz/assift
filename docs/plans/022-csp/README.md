# 022: CSP（Content Security Policy）

- 前提: 020 §5.1・§12（管理画面の多層防御。XSS を**防ぐ側**の欠けとして「CSP が無い」を運用開始までに入れると決めた）
- 参照: `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`（Next 16 の nonce の仕組み）

## 1. 目的と完了条件

本体の XSS はすべての利用者のセッションに届く（Supabase の cookie は `httpOnly: false`。020 §5.1）。React のエスケープで XSS を起こさないことが第一だが、
依存パッケージの乗っ取りや将来のコードまでは保証できないので、**起きても外から持ち込んだスクリプトが動かない**ようにブラウザ側の門番（CSP）を入れる。

- [x] 本番・プレビューのすべての HTML の応答に `Content-Security-Policy` が付く（`next start` で確認）
- [x] `script-src` は nonce + `'strict-dynamic'`。`'unsafe-inline'` / `'unsafe-eval'` は本番に入れない
- [x] Mantine の `<style>` タグ（CSS 変数・`InlineStyles`・色スキーム切替）と `ColorSchemeScript` に nonce が付く
- [x] 画面が壊れない: 全ルート（LP・規約・認証・店舗・設定・シフト表・初期設定・公開シフト表・アカウント・管理画面・404）を Playwright で開き、`securitypolicyviolation` が 0 件
- [x] Server Action（`refresh()` / `revalidatePath` の描き直し）のあとも違反が 0 件（§4.4 の落とし穴）
- [x] 開発（`next dev`）でも壊れない（React の `eval`・dev overlay のインラインスタイル・HMR の WebSocket）
- [x] 方針の文字列は純関数（Vitest）。`lint` / `typecheck` / `test` が通る
- [x] プレビュー（Vercel）で目で見る。Toolbar が止まる以外に違反が無いこと（§7 の 4）。PDF（CSP 無しの `inline` 応答。§3）が開くこと（2026-10-12。スマホで確認。§8）

## 2. 範囲

### 作る

- `lib/security/csp.ts`: nonce の生成と、環境（本番 / 開発）から方針の文字列を組む純関数
- `src/proxy.ts`: リクエストごとに nonce を作り、**リクエストヘッダ**（`x-nonce` と `Content-Security-Policy`。Next が後者から nonce を拾う）と
  **レスポンスヘッダ**（`Content-Security-Policy`）に載せる
- `src/app/layout.tsx`: `headers()` で nonce を読み、`ColorSchemeScript` と Mantine に渡す（Mantine へは Client の `AppProviders` を 1 枚かませる。§4.3）

### 作らない

- **`Content-Security-Policy-Report-Only` での段階導入・`report-uri`**: 受け口（Route Handler）を作ると誰でも POST できてログが埋まる。
  公開前に全ルートを Playwright で通し、プレビューでも目で見るので、最初から enforce にする。本番で違反が見つかったら、そのときに受け口を検討する
- **他のセキュリティヘッダ**（`X-Content-Type-Options` / `Referrer-Policy` / `Permissions-Policy`）: この番号は CSP だけ。別のプランで（費用は数行）
- **`upgrade-insecure-requests`**: Next のガイドの例には入っているが、URL はすべて相対で混在コンテンツが無く、Vercel が HSTS を付ける。
  ローカルの `next start`（http）で挙動が変わる directive を本番だけに入れるより、無いほうが本番とローカルの差が減る
- **SRI（`experimental.sri`）**: nonce で足りる。静的化の利点は §4.2 のとおり小さい

## 3. 方針（本番）

```
default-src 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
style-src-elem 'self' 'nonce-<nonce>';
style-src-attr 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none'
```

| directive | 値 | 理由 |
| --- | --- | --- |
| `script-src` | `'self' 'nonce-…' 'strict-dynamic'` | Next が自分のインラインスクリプト（`self.__next_f.push`）と chunk の `<script>` に nonce を付ける。`'strict-dynamic'` で、nonce 付きのスクリプトが足す chunk（`document.createElement('script')`）も通る。外部のスクリプトは読んでいない（020 §5.1） |
| `style-src-elem` | `'self' 'nonce-…'` | Mantine の `<style>`（`MantineCssVariables` / `MantineClasses` / `InlineStyles` / 色スキーム切替の transition 無効化）は `MantineProvider` の `getStyleNonce` で nonce が付く。`next/font` の `@font-face` は CSS ファイル |
| `style-src-attr` | `'unsafe-inline'` | Mantine の style props（`gap` → `--stack-gap` など）と `style={{…}}`（34 ファイル）は **`style` 属性**で、属性には nonce を付けられない。属性の注入は HTML の注入（React が防ぐ）が前提で、できることも CSS に限られるので許す |
| `style-src` | `'self' 'unsafe-inline'` | `-elem` / `-attr` を知らないブラウザ（Safari 15.3 以前など）向けのフォールバック。nonce を**書かない**: nonce があると `'unsafe-inline'` が無視され、そのブラウザでは属性が全部止まる。知っているブラウザでは `-elem` / `-attr` が優先される |
| `img-src` | `'self' data:` | `@mantine/dates/styles.css` が `url("data:image/svg+xml…")` を使う。画像は `public/` も `next/image` も無い |
| `font-src` | `'self'` | LP の書体（`next/font/google`）はビルド時に取り込まれ `/_next/static/media/` から配られる |
| `connect-src` | `'self'` | ブラウザから Supabase を呼んでいない（`utils/supabase/client.ts` は未使用。Action 経由）。Stripe は hosted Checkout（遷移） |
| `form-action` | `'self'` | `<form>` はすべて `onSubmit`（JS）。Checkout / ポータル / Google ログインは `window.location.assign` で遷移するので対象外 |
| `frame-ancestors` | `'none'` | 公開シフト表（`/share/[code]`）も含めて埋め込みは想定しない（v1 にも無い） |
| `object-src` / `base-uri` | `'none'` / `'self'` | 定石。`<base>` の注入で相対 URL の chunk をすり替えられない |

本番で使う外部のオリジンは **0**（Supabase も Stripe も AI Gateway もサーバーから呼ぶ）。`default-src 'self'` から広げるのは上の表の分だけ。
Vercel Web Analytics（025）もスクリプト（`/_vercel/insights/script.js`）・送信とも同一オリジンで、方針は変えていない（スクリプトは nonce 付きの chunk が `createElement` で足すので `'strict-dynamic'` で通る。025 §4.4）。

### 開発（`NODE_ENV === 'development'`）だけ緩める

| directive | 足すもの | 理由 |
| --- | --- | --- |
| `script-src` | `'unsafe-eval'` | React が `eval` でサーバーのエラーのスタックを組み直す（Next のガイド） |
| `style-src-elem` | nonce の代わりに `'unsafe-inline'` | dev overlay・React DevTools がインラインの `<style>` を挿す |
| `connect-src` | `ws: wss:` | Turbopack の HMR（`'self'` は ws を含む約束だが、ブラウザ差を避ける） |

本番とプレビュー（`VERCEL_ENV`）は同じ方針にする。**プレビューの Vercel Toolbar は止まる**（§7）。

### 付けない応答

- **proxy を通る応答には、PDF の応答を除いてパスを問わずすべて付ける**（§8 のレビューで 3 回、除外した経路に CSP の無い 404 の HTML が見つかった。proxy は応答の種類を見られない）。
  CSV に付いても害は無い
- PDF の応答（`exportPath(…, 'pdf')` の形。`isPdfExportPath()` で完全一致）だけレスポンスの方針を付けない: このパスは Route Handler にしか届かず
  HTML を描かない（PDF / 401 の text / 本文の無い 404。未ログインは redirect）ので穴にならず、ブラウザのビューアが応答の CSP をどう扱うかを
  実機で確かめられないままリリースしなくて済む（§8 のレビュー 9 回目）。リクエストの nonce はそのまま書く
- Webhook・cron・静的アセット（`/_next/static/`・`/_next/image`）・`favicon.ico`: matcher の外。単一のパスは完全一致（`$`）で書く。
  **存在しない URL は 404 の HTML になるので、前方一致や拡張子では除外しない**

## 4. 仕組み

### 4.1 proxy（`src/proxy.ts`）

0 段目（管理画面のホスト）の前に nonce を作り、`request.headers` に `x-nonce` と `content-security-policy` を書く
（`updateSession()` が `request.cookies.set()` で `request.headers` を書き換えて `NextResponse.next({ request })` に渡しているのと同じ経路。
ヘッダを複製して渡すと cookie の更新と二重管理になる）。Next はレンダリング時に**リクエストヘッダ**の `content-security-policy` から `'nonce-…'` を抜き出す
（`server/app-render/app-render.js`。`script-src` → `default-src` の順）。

返すレスポンス（`NextResponse.next` / `rewrite`。`/404` の rewrite は `{ request }` も渡す）に `Content-Security-Policy` を載せる。redirect には要らないが、
分岐を増やさず全部に付ける。

### 4.2 すべてのページが動的描画になる

nonce はリクエストごとに違うので、**nonce を使うページは動的描画でなければならない**（ビルド時の HTML には nonce が無く、インラインスクリプトが止まる）。
root layout が `headers()` を読むので、全ルートが動的になる。main のビルドで静的（`○`）なのは `/terms` / `/privacy` / `/law` / `/auth/email-change` / `/_not-found` の 5 つだけで、
いずれも軽いページ。LP は既に `getAuthUser()` で動的。CDN キャッシュを失うのはこれらだけなので受け入れる。

### 4.3 Mantine（`src/app/layout.tsx`）

- `ColorSchemeScript` は `React.ComponentProps<'script'>` を spread するので `nonce` を渡せる
- `MantineProvider` の `getStyleNonce: () => string` が `<style>` に nonce を付ける（`useMantineStyleNonce()`）。**関数なので Server Component から渡せない**
  （AGENTS.md「Functions cannot be passed directly to Client Components」）→ `components/AppProviders.tsx`（`'use client'`）に
  `MantineProvider > ModalsProvider > NuqsAdapter > children + Notifications` を移し、`nonce: string | undefined` を props で受けて中で関数にする
- `theme` は `AppProviders` の中で import する（props で渡さない）

### 4.4 落とし穴: Server Action の描き直しで nonce が変わる

`refresh()` / `revalidatePath` のあとの RSC は root layout も描き直す。そのリクエストは proxy を通るので**新しい nonce** が `headers()` から返り、
`AppProviders` の `nonce` props が変わる。しかし文書の CSP の nonce は最初の HTML のままなので、以後 Mantine が足す `<style>`（レスポンシブの `InlineStyles` など）が
新しい nonce を持って**止まる**。`AppProviders` は **`useState(nonce)` で最初の値だけを使う**（文書の寿命の間 nonce は変わらない）。
完了条件の「Action のあとも違反 0 件」はこれを確かめる。

クライアント遷移（`next/link`）は root layout を描き直さないので影響しない。chunk の読み込みは `'strict-dynamic'` で通る。

### 4.5 nonce

`crypto.getRandomValues` の 16 バイトを base64（Next の正規表現 `[A-Za-z0-9+/_-]+={0,2}` に合う）。`Buffer` を使わず proxy の実行環境に依らない。

受け入れたトレードオフ: nonce は `AppProviders` の props として Client に渡るので、RSC の flight データ（HTML の `self.__next_f.push` と Action の応答）に
文字列として入る。ブラウザの nonce hiding（`nonce` 属性は DOM から読めない）はこの経路には効かず、マークアップの注入（dangling markup）が
あれば flight データから nonce を読める。Next のガイドの `<Script nonce>` も同じ形で、SSR で `<style nonce>` を描くには Client に値を渡すしかない。
第一の守りはマークアップの注入そのものを防ぐこと（React のエスケープ）で、CSP はその次の層（§1）。

HTML を描くのに nonce が無い（proxy の matcher から外れた・段が `{ request }` を渡し忘れた）ときは、root layout が開発では例外、本番ではログで名指しする
（`assertNonce()`。§8 のレビュー 10 回目）。「描画側に届いたか」を直接見るので Next の内部のヘッダ名に依らない（proxy 側の同種の確認は 12 回目で消した）。

## 5. ファイル

| ファイル | 役割 |
| --- | --- |
| `src/lib/security/csp.ts` | `generateNonce()` / `buildCsp(nonce, { dev })` / `CSP_HEADER` / `NONCE_HEADER`。純関数 |
| `src/lib/security/csp.test.ts` | 本番に `unsafe-inline` / `unsafe-eval` が無い、nonce が script と style-elem に入る、開発の緩和、fallback の `style-src` に nonce が無い |
| `src/proxy.ts` | nonce の生成・リクエストヘッダ・レスポンスヘッダ（PDF の応答を除いてすべて。末尾で 1 回） |
| `src/lib/export/path.ts` | エクスポートの URL を組む `exportPath()`（共有メニューと旧 URL の書き換えが共有）と、PDF の応答の判定 `isPdfExportPath()`（proxy の例外。§3） |
| `src/components/AppProviders.tsx` | Client。`MantineProvider`（`getStyleNonce`）+ `ModalsProvider` + `NuqsAdapter` + `Notifications` |
| `src/app/layout.tsx` | async にして `headers()` から nonce。`ColorSchemeScript nonce` と `AppProviders nonce` |
| `src/instrumentation-client.ts` | アプリのコードより先に走る（Next の規約）。`z.config({ jitless: true })`（§8。Zod の `Function("")` の探りを止める）。ブラウザ専用なので `lib/` に置かない |
| `AGENTS.md` | 「CSP（022）」の節。proxy の段に「nonce と CSP」を足す。root layout の説明を更新 |

## 6. 実装の順序と確認

1. `csp.ts` + テスト
2. proxy → `next start` + curl でヘッダを見る（proxy を通る応答に付く。PDF の応答だけ付かない。CSV には付く / nonce が毎回違う / HTML の `<script>` に同じ nonce）
3. `AppProviders` + layout → `npm run build` で全ルートが `ƒ`（動的）になることを見る
4. Playwright（`next start`。seed の `dev@example.com` / `admin@example.com`）で全ルートを開き `securitypolicyviolation` を数える。
   ログイン（Action → `redirectTo`）→ シフト表でアサイン（`refresh()`）→ 設定の保存（`revalidatePath`）のあとも数える
5. `next dev` でも LP・ログイン・シフト表を開いて違反 0 件を見る
6. `lint` / `typecheck` / `test`

## 7. 決定と未確定

| # | 項目 | 決定 |
| --- | --- | --- |
| 1 | 導入の仕方 | 最初から enforce（Report-Only の段階を置かない。§2） |
| 2 | `style` 属性 | `style-src-attr 'unsafe-inline'`（Mantine の style props は属性。§3） |
| 3 | 静的ページ | 全ルート動的描画（§4.2） |
| 4 | プレビューの Vercel Toolbar | **本番と同じ方針にし、Toolbar は止まる。** Toolbar は Vercel が HTML に `https://vercel.live/...` の `<script>` を差し込むもので、nonce が無く `'strict-dynamic'` の下では動かない。プレビュー専用に `https://vercel.live` を許すとプレビューが本番の確認にならないので許さない。コンソールの CSP エラーが煩わしければ、Vercel の Project Settings で Toolbar を無効にする（コメント機能は使っていない） |

未確定:

- Toolbar のドキュメント（`vercel.com/docs/vercel-toolbar/managing-toolbar`）はこのセッションのネットワークから読めなかった。プレビューで実際に何が止まるかは最初のプレビューで見る
- `report-uri` の受け口（本番で違反に気付く手段）。いまは入れない（§2）
- `(site)` の `next/font/google` が日本語のグリフ全部（320 本の woff2）を preload し、動的描画では 6KB の `Link` ヘッダにもなる（§8）。CSP とは別の話として、
  `preload: false` か `subsets` の見直しを検討する
- PDF の応答に CSP を付けるか。いまは付けない（§3）。ブラウザのビューアが応答の CSP に縛られないと実機で確かめられたら、付けても害は無い
  （Route Handler 側のヘッダは proxy に負けるので、付ける・付けないは proxy で決める。§8 のレビュー 8 回目で実測）
- `/apple-touch-icon.png` / `/robots.txt` を実在するルート（`src/app/`）として置く。いまは存在しない URL として 404 の HTML を描いている（CSP とは別の仕事）
- **CSP の違反を数える確認をリポジトリに入れるか（ユーザーの判断）。** この実装で本物の壊れが 2 回（Zod の `Function("")`・Modal の `<style>`）、
  Vitest / typecheck / lint では見えず、ブラウザを開いてはじめて分かった。`next start` に対して LP・ログイン・シフト表・モーダル 1 つを開いて
  `securitypolicyviolation` を数える最小の Playwright を `scripts/` に置けば、`<style>` / `<script>` を足すライブラリを入れたときに merge 前に気付ける。
  AGENTS.md の「E2E は必要になってから足す」に照らして、入れるならこの PR とは別に（playwright の devDependency が増える）

## 8. 実装ログ

### 2026-10-11 実装

プランのとおりに実装した。変えた点・プランに無かった点:

- **Zod 4 が本番で `eval` の違反を 1 件出した（プランに無かった）。** フォームのあるページ（`/signup`・シフト表・設定の new など）で
  `script-src` の違反 `blocked: eval` が出た。発生源は Zod の `allowsEval`（`node_modules/zod/v4/core/util.js`）: JIT で parse を速くするために
  `Function("")` を試す。try/catch で動きはするが、ブラウザは違反として報告する。Zod 4 には `z.config({ jitless: true })` がある
  （`util.js` のコメントにも「strict CSP では探りが違反になるので jitless で飛ばす」とある）
- **`jitless` は `AppProviders` では間に合わなかった。** 探りは parse 時ではなく **`z.object()` を作った時点**（`schemas.js` の `$ZodObject` の init で
  `jit && allowsEval.value`）に走る。ページ側の schema モジュールが root layout の Client より先に評価されることがあり、
  `AppProviders` で `z.config()` しても違反が残った。**`src/instrumentation-client.ts`**（Next がアプリのコードより先に走らせる規約。
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`）から `lib/validation/jitless.ts` を読むようにして消えた。
  サーバー側の Zod はそのまま（CSP の外。JIT が効く）
- `ColorSchemeScript` は Action の描き直しで `nonce` **属性**だけが新しい値に変わる（root layout は Server なので `useState` で止められない）。
  実行済みの `<script>` は属性が変わっても再実行されないので害は無い。Mantine の `<style>` 側は `AppProviders` の `useState` で最初の nonce を保ち、
  Action のあとに足された `<style>`（アサインのポップオーバー）も文書の nonce と一致した（下の確認）
- 本番の `next start` で `/terms` の応答に 6KB の `Link: </_next/static/media/….woff2>; rel=preload` ヘッダが付く。これは **`(site)` の `next/font/google` の既存の挙動**
  （main でも動的だった `/` に同じヘッダと、HTML に 320 本の `<link rel="preload" as="font">` がある）で、今回は `/terms` などが静的から動的になった分だけ
  Link ヘッダも付くようになった。CSP とは別の話なので触らない。`(site)/layout.tsx` の「preload は latin だけ」という注記と食い違うので、別途見直す候補（§7 の未確定に足した）

### 確認

`npm run build && npm run start`（本番の方針）で、Playwright（`playwright-core` + 同梱の Chromium）から 33 件を開き、各ページで
`securitypolicyviolation` の件数・`<style>` と インライン `<script>` の nonce が文書の nonce と一致するか・Mantine の CSS 変数が効いているか・
コンソールのエラーを数えた（スクリプトはリポジトリに入れていない）。

| 確かめたこと | 結果 |
| --- | --- |
| 未ログイン: `/` `/terms` `/privacy` `/law` `/login` `/signup` `/password/forgot` `/nope`（404） `/share/<無い code>`（404） `/-/login` `/-/users`（→ login） | 違反 0。`<script>` 19 本・`<style>` 4 本すべてに同じ nonce |
| ログイン（Action → `redirectTo`）→ 店舗・設定 9 ページ・初期設定・`/tenants/new`・アカウント・プラン 3 ページ | 違反 0 |
| シフト表でアサイン → 空に戻す（`refresh()`）、店舗情報の保存（`revalidatePath`） | 違反 0。描き直しのあとに足された `<style>` も文書の nonce |
| クライアント遷移（`next/link`）、PC 幅のシフト表 | 違反 0 |
| 管理画面: ログイン → `/-/users` → `/-/users/<id>` | 違反 0 |
| ヘッダ: `/api/tenants/…/shifts/csv`（→ login の 307）・`/api/stripe/webhook`（405）には CSP が付かない。`/nope`・`/share/…`（404）・`/-/users`（307）には付く。nonce はリクエストごとに違う | ◯ |
| `next dev`（開発の方針: `'unsafe-eval'`・`style-src-elem 'unsafe-inline'`・`ws:`）で同じ 33 件 | 違反 0。dev overlay の `<nextjs-portal>` の入れ物（`<script data-nextjs-dev-overlay>`）と dev の `<style>` には nonce が無いが、開発の方針では許している |
| ビルド後のルート表 | すべて `ƒ`（動的）。main で `○` だった 5 ルートも動的になった（§4.2） |
| `ADMIN_HOST=admin.localhost:3000 VERCEL_ENV=production` で本体のホストの `/-/login`（`/404` への rewrite。020 §4.2） | 404 の HTML に CSP が付き、`<script>` 19 本・`<style>` 2 本がヘッダと同じ nonce（`rewrite(url, { request })` が効いている） |

このセッションのネットワークでは `fonts.gstatic.com` が 404 で、`next dev` は `next/font/google` の取得に失敗して全ページ 500 になった（main でも同じ。CSP とは無関係）。
dev の確認は `(site)/layout.tsx` の `next/font` を**一時的に外して**行い、確認後に戻した（diff 無し）。

`npm run lint`（既存の warning 1 件のみ）/ `npm run typecheck` / `npm test`（93 ファイル・906 件）を通した。
スキーマは触っていないので `supabase test db` と `gen types` は不要。

### 2026-10-12 コードレビュー（指摘 2 件を反映）

- **proxy の matcher が画像・フォントの拡張子で終わるパスを除外していた（002 のテンプレート由来）。** `public/` が無いので、`/foo.png` や `/share/abc.svg` のような
  URL は 404 の HTML（root の not-found）になるが、proxy を通らないので CSP も nonce も付かず、クライアントが送った `x-nonce` ヘッダがそのまま `headers()` に届いていた。
  拡張子の除外を外し、`_next/static` / `_next/image` / `favicon.ico` / Stripe / cron だけを matcher の外にした。
  `next start` で `/foo.png` と `/share/abc.svg` が 404 + CSP、`/tenants/x.png` が login への 307 + CSP、`/favicon.ico` が 200 の `image/x-icon` を確認
- `theme.ts` の「Server（root layout）から読まれるので関数や `DateInput.extend()` を置けない」というコメントが、`AppProviders` へ移したことで事実と食い違っていた。
  「Client からだけ読む。いまは置けるが素のオブジェクトで足りる」に書き換えた

### 2026-10-12 コードレビュー 2 回目（6 件。4 件を反映、2 件は見送り）

- **`isCspExempt` の `/api/` 前方一致も 1 回目と同じ穴だった。** 存在しない `/api/foo` は 404 の HTML なのに CSP が付かなかった。エクスポートのルート
  （`/api/tenants/<id>/shifts/{pdf,csv}`）への完全一致にした。matcher の `favicon.ico`（前方一致・`.` 未エスケープ）と `api/stripe/`・`api/cron/` も同じ理由で
  `favicon\.ico$` / `api/stripe/webhook$` / `api/cron/billing-usage$` の完全一致にした。**除外は実在するパスに完全一致で書く**を AGENTS.md の決まりにした。
  `next start` で `/api/foo`・`/api/stripe/x`・`/favicon.ico/x`・`/favicon.icox` が 404 + CSP、`/favicon.ico` が 200 の icon、Webhook が 405・cron が 401・PDF が 307（いずれも CSP 無し）を確認
- `lib/validation/jitless.ts` をやめ、`z.config({ jitless: true })` を `src/instrumentation-client.ts` に直接書いた。`lib/` に置くとサーバーのモジュールが誤って読んで
  サーバー側の JIT まで切れるが、ファイル名からは分からない。`instrumentation-client` の規約がブラウザ専用を担保する
- AGENTS.md の nuqs の決まり「`NuqsAdapter` は root `layout.tsx` に 1 回だけ」が `AppProviders` へ移したことと食い違っていたので直した
- `AppProviders` の `getStyleNonce` を関数ごと `useState` に持ち、描き直しでも同じ関数を渡すようにした。指摘は「context の値が毎回変わる」だったが、
  `MantineProvider` は context の値をメモ化しておらず（`value: {…}` のリテラル）元から毎回変わるので実害は無い。1 行で済み、意図（最初の値に固定）も読みやすくなるので反映した
- 見送り: 「`/foo` と `/foo/...` の前方一致判定が 4 か所目の写し」は、`isCspExempt` を完全一致にしたことで写しが消えた。残る 3 か所（`isAdminPath` / `isProtectedPath` / `lib/tenants/navigation.ts`）は
  既存のもので、この PR では触らない
- 全 33 件の Playwright の確認を本番ビルドでやり直し、違反 0 件のまま

### 2026-10-12 コードレビュー 3 回目（3 件。すべて反映）

- エクスポートの URL の形（`/api/tenants/<id>/shifts/{pdf,csv}`）が共有メニューのリンク・旧 URL の書き換え（`legacyUrl.ts`）・CSP の除外の 3 か所に写されていた。
  **`lib/export/path.ts`**（`exportPath()` / `isExportPath()`。Vitest）に寄せ、3 か所がそれを使う。ルートを動かすときに CSP の除外だけ古いまま残る事故を防ぐ
- `attachCsp()` の JSDoc が「`/api/**` なら null」のままだった（2 回目で完全一致に変えたのに）。直した
- AGENTS.md のディレクトリ一覧に `instrumentation-client.ts`（ブラウザ専用の置き場である理由）・`components/AppProviders.tsx`・`lib/export/path` を足した

### 2026-10-12 コードレビュー 4 回目（6 件。5 件を反映、1 件は説明で対応）

- **エクスポートの除外をやめ、proxy を通る応答にはすべて CSP を付ける。** 指摘は「エクスポートの Route Handler の `notFound()`（uuid でない id・見えない店舗）が
  root の not-found の HTML を返すので、除外すると CSP の無い HTML が残る」だったが、**実測では Route Handler の `notFound()` は本文の無い 404**
  （`content-type` 無し・0 バイト。ログイン後に `/api/tenants/not-a-uuid/shifts/pdf` と見えない店舗の id で確認）で、HTML は描かれない。
  それでも反映した: proxy は応答の種類を見られないので、パスの形で除外の一覧を保つ（ルートを動かすと黙って外れる）より全部に付けるほうが単純で、
  1〜3 回目の穴と同じ種類の判断を二度としなくて済む。`isCspExempt` / `isExportPath` を消し、`lib/export/path.ts` は `exportPath()`（リンクと旧 URL の共有）だけにした。
  本物の PDF（`application/pdf`・59KB）と CSV にも CSP が付くことを確認。PDF（`inline`）のビューアはブラウザの内部で描き文書の CSP に縛られないはずだが、
  このセッションでは目で見られないので**プレビューで PDF が開くことを確かめる**（§1 の残りに足した）
- root layout が読む `x-nonce` は、proxy が通る応答で**常に上書きする**ので、クライアントが送った値が届かない。proxy を通らないのは静的ファイルと
  Webhook / cron だけで HTML を描かない。layout のコメントに書いた
- `instrumentation-client.ts` の `import { z } from 'zod'` を `import { config } from 'zod/v4/core'` にした。全ページの最初の chunk に入るファイルなので、
  フォームの無いページに Zod 全体を持ち込まない（`config` が書く `globalConfig` は classic と同じ）
- `csp.test.ts` の重複（`isCspExempt` の 6 件 ↔ `path.test.ts`）は除外そのものを消したので無くなった。「1 行」のテストは同じファイルの `directive()` を使うようにした
- matcher のコメント「除外は完全一致で」と `_next/static`（前方一致）の食い違い: `_next/static/` は Next 自身が配るディレクトリなので前方一致、
  `_next/image` はクエリで指定する単一のパスなので完全一致（`$`）、と分けて書いた

### 2026-10-12 コードレビュー 5 回目（5 件。4 件を反映、1 件は見送り）

- 4 回目で除外を消したのに、AGENTS.md のディレクトリ一覧（`security/` の「付けないパス」）とプラン §6 の手順 2（「`/api/**` に付かない」）が古いままだった。直した
- proxy のコメントが「PDF のビューアは CSP に縛られない」と断定していたが実機では未確認。「想定。プレビューで開けなければここを疑う（§1）」に改めた。AGENTS.md も同じ
- `withCsp()` を 3 つの `return` に掛ける形は、段を足したときに付け忘れる。段の合成を `route()` に分け、`proxy()` の末尾で 1 回だけヘッダを載せる形にした（`withCsp` は消えた）
- 見送り: `buildCsp()` の前計算（nonce 以外は固定なのでテンプレートに差し込む）。要素 12 個のオブジェクトを組んで `join` するだけで、prefetch を含めても
  計測に出ない。テンプレートの `replace` は読みにくくなるので、要るようになるまでこのまま

### 2026-10-12 コードレビュー 6 回目（3 件。2 件を反映、1 件は見送り）

- **Modal / Drawer のスクロール固定が nonce 無しの `<style>` を足していた（本物の穴。これまでの Playwright の確認はモーダルを開いていなかった）。**
  Mantine の `ModalBase` → `react-remove-scroll` → `react-style-singleton` が `document.createElement('style')` で `body { overflow: hidden }` を足す。
  nonce は `get-nonce` のモジュール変数（`setNonce()`）か `__webpack_nonce__` からしか読まず、Mantine の `getStyleNonce` は届かない。
  `AppProviders` の最初の描画（`useState` の初期化。モーダルが開く前）で `setNonce(nonce)` を呼ぶようにし、`get-nonce` を直接の依存に足した
  （`@mantine/core` の推移的依存で入っていたもの。1.0.1）。ブラウザだけで呼ぶ（サーバーは `<style>` を足さず、モジュール変数はリクエストをまたぐ）。
  Playwright に共有モーダルと集計モーダルを開く手順を足し、開いた状態で `<style>` が 1 本増えて nonce が文書と一致し、違反 0 件を確認（35 件）
- proxy のコメントと AGENTS.md が「Route Handler の `notFound()` も not-found の HTML になる」と書いていたが、4 回目の実測では本文の無い 404。
  「存在しないパスは 404 の HTML。Route Handler の中の `notFound()` は本文無し」に直した
- 見送り: PDF の応答だけレスポンスの CSP を外す（ビューアへの影響が未確認なので）。パスの形で判定する結合（4 回目で消したもの）を戻すことになるうえ、
  `default-src 'none'; sandbox` を PDF にも付けて配っているサイト（GitHub の raw）が Chrome のビューアで開ける前例があり、ビューアは応答の CSP に縛られないと
  見ている（このセッションでは目で見られない）。プレビューで PDF を開く確認（§1）を完了条件に残し、開けなければそのときに外す

### 2026-10-12 コードレビュー 7 回目（3 件。2 件を反映、1 件は実測で否定）

- 否定: 「ブラウザの nonce hiding（ヘッダ配信の CSP があると parser が挿した要素の `nonce` 属性が空になる）で、Mantine が SSR した `<style nonce>` の
  hydration が dev で属性不一致の `console.error` を出す」。Playwright の確認は `console.error`（React の hydration の警告を含む）を全ページで数えていて、
  dev（33 件）も本番（35 件）も 0 件だった。React は `nonce` 属性の不一致を警告しない。手は入れない
- **段が `{ request }` を渡し忘れたときの検知。** 描画に進む応答（`x-middleware-next` / `x-middleware-rewrite`）で `x-middleware-request-x-nonce` が
  今回の nonce と一致しなければ `proxy()` の末尾で例外にする（`assertNonceForwarded()`）。渡し忘れるとそのページの `<script>` が全部止まるので、
  黙って壊れるより原因を名指しして落とす。全ルート + 管理画面の `/404` rewrite で発火しないことを Playwright と curl で確認
- **`get-nonce` が 1 本であることを固定。** `setNonce()` はモジュール変数に書くだけなので、react-style-singleton と別の実体に分かれると効かない。
  `package.json` の range を react-style-singleton と同じ `^1.0.0` に揃え、`components/AppProviders.test.ts` で両方からの解決が同じファイルであることを Vitest で見る

### 2026-10-12 コードレビュー 8 回目（5 件。3 件を反映、2 件は見送り）

- `assertNonceForwarded()` は Next の内部のヘッダ名に依存するので、本番では例外にせず `console.error` に落とす（Next の更新で名前が変わったときに全ページ 500 にしない）。
  開発・テストでは例外のまま
- `lib/export/path.ts` の JSDoc に、ルートを動かすときに一緒に直す場所（`next.config.ts` の `outputFileTracingIncludes`・`PROTECTED_PREFIXES`）を併記した
- **PDF の逃げ道を実測した。** Route Handler が自分で `Content-Security-Policy` を返しても、**proxy のヘッダが勝つ**（CSV のルートに一時的に
  `'Content-Security-Policy': 'test-from-route'` を足してビルドし、ログイン後に取得すると proxy の方針が返った。ルートは元に戻した）。
  したがってプレビューで PDF が開けなかったときの直し方は、ルート側ではなく **proxy で `exportPath(…, 'pdf')` の形のときだけレスポンスのヘッダを付けない**
  （リクエストの nonce はそのまま。Route Handler の `notFound()` は本文無しなので CSP の無い HTML は生まれない）。§7 の未確定に書いた
- 見送り: `Report-Only` の段階や `report-uri` の受け口。§2「作らない」と §7 の決定 1 のとおり（受け口は誰でも POST でき、公開前の確認は Playwright とプレビューで行う）。
  本番で違反に気付く手段が無いのは承知の上の決定で、必要になったら足す
- 見送り: matcher から拡張子の除外を外したため、`/apple-touch-icon.png` や `/robots.txt` のような存在しない URL が proxy（nonce 生成・`getClaims()`）と
  動的な 404 の描画を通る件。404 の HTML 自体は以前も描いていて（静的だったのが動的になったのは §4.2 で受け入れ済み）、増えたのは proxy の分だけ
  （cookie が無ければ `getClaims()` はネットワークに出ない）。icon / robots を実在するルートとして置くのは別の仕事（§7 の未確定）

### 2026-10-12 コードレビュー 9 回目（3 件。すべて反映）

- **PDF の応答だけレスポンスの CSP を付けない（4 回目の決定を改める）。** 6 回目で根拠にした「GitHub の raw は PDF にも `default-src 'none'; sandbox` を付けて配っている」は、
  raw が PDF をダウンロードさせる経路で、`inline` 表示の前例にならないと指摘された。実機で確かめられない前提に機能を依存させるより、
  HTML を描かない経路（PDF / 401 の text / 本文の無い 404。未ログインは redirect）だけ外すほうが安全で、穴にもならない。
  `lib/export/path.ts` に `isPdfExportPath()`（完全一致。Vitest）を置き、`proxy()` の末尾で見る。リクエストの nonce はそのまま。
  `next start` + ログインで PDF に CSP が無く、CSV と 404 には付くことを確認
- `assertNonceForwarded()` の判定（Next の内部のヘッダ名に依存）を `lib/security/csp.ts` の純関数 `isNonceForwarded()` にし、
  `csp.test.ts` で**本物の `NextResponse`**（`next({ request })` / `rewrite(url, { request })` / `{ request }` 無し / 別の nonce / redirect）を組んで固定した。
  Next の更新で名前が変わればテストが落ちる
- `AppProviders.test.ts` は CJS の `main` を解決していた。パッケージの `package.json` の解決が同じであること（ディレクトリが 1 つ）と、
  ブラウザ向けの入口 `module` が 1 つのファイルであることを見る形に改めた。Playwright の手順をリポジトリに入れる案は、E2E はまだ入れない方針（AGENTS.md）なので見送り

### 2026-10-12 コードレビュー 10 回目（3 件。すべて反映）

- AGENTS.md のディレクトリ一覧（`security/`）が 9 回目の「PDF だけ除外」に追いついていなかった（「パスによる除外は無い」）。直した
- **root layout でも nonce の有無を見る**（`assertNonce()`。開発は例外、本番はログ）。proxy の `isNonceForwarded()` は Next の内部のヘッダ名に依存し、
  proxy が走らなかった経路（matcher の除外）は見られない。描画側で「届いたか」を直接見れば、どちらの壊れ方も名指しできる。二重だが互いに補う
- nonce が Client の props として RSC の flight データに入る（nonce hiding が効かない）ことを、layout のコメントと §4.5 に受け入れたトレードオフとして明記した。
  Next のガイドの `<Script nonce>` と同じ形で、SSR で `<style nonce>` を描くには避けられない

### 2026-10-12 コードレビュー 11 回目（5 件。3 件を反映、2 件は見送り）

- 「開発は例外、本番はログ」の通報が proxy と root layout に 2 回書かれていた。`lib/security/csp.ts` の `reportCspMisconfiguration()` に寄せた
- `package.json` の `get-nonce` を `^1.0.0` にしたあと lock の root の range が `^1.0.1` のままだった。`npm install --package-lock-only` で揃えた（解決される版は 1.0.1 のまま）
- プラン §5（proxy / path.ts / csp.ts の行）と §6 の手順 2 が 9 回目の「PDF だけ付けない」に追いついていなかった。直した
- 見送り: `AppProviders.test.ts` に `setNonce` → `getNonce` の往復や ESM の実ファイルの比較を足す案。Vitest の解決（Node）と Turbopack の解決（`module`）は別物で、
  Vitest で往復が通っても本番の束ね方の証明にならない。このテストが守るのは「パッケージが 2 本に分かれる」（npm の nest。現実的な壊れ方）だけで、
  束ね方まで含めた実物の確認は Playwright でモーダルを開く手順（§6-4）が担う。コメントにその範囲を書いてある
- 見送り（8 回目と同じ）: `/apple-touch-icon.png` / `/robots.txt` を実在するルートとして置く件。§7 の未確定に残す

### 2026-10-12 コードレビュー 12 回目（6 件。4 件を反映、2 件は見送り）

- **proxy 側の nonce の確認（`assertNonceForwarded` / `isNonceForwarded` / `reportCspMisconfiguration`）を消した。** root layout の `assertNonce()` が
  「matcher から外れた」「段が `{ request }` を渡し忘れた」の両方を描画側で直接見られ、Next の内部のヘッダ名（`x-middleware-*`）に依存しない。
  7〜11 回目で育てた約 30 行と `NextResponse` を組むテストは、Next の更新で誤検知する側の負債になるので手放した。「開発は例外、本番はログ」は layout の 1 か所だけに残る
- `AppProviders.test.ts` の 2 つ目（`module` フィールドが `dist/es2015/index.js` という文字列）は不変条件と無関係で、get-nonce の無害な更新で落ちるので消した
- `attachCsp()` の JSDoc がレスポンス側の規則（PDF の例外など）を 3 か所目として写していた。リクエストヘッダのことだけにし、規則は `proxy()` のコメントに 1 か所
- `isNonceForwarded` の JSDoc が（関数を間に挿したせいで）`reportCspMisconfiguration` に付いていた件は、両方を消したので解消
- 見送り: `setNonce()` を `useState` の初期化（描画の段階）から `useEffect` へ移す案。effect は子から先に走るので、最初から開いている Modal の `<style>` が
  親の effect より前に足されて nonce が無いまま止まる。描画の段階で渡すのが正しく、`setNonce` は冪等なので StrictMode の二重実行でも害は無い。コメントに理由を書いた
- 見送り（ユーザーの判断に回す）: 違反を数える Playwright をリポジトリに入れる案。§7 の未確定に、入れる場合の形と理由を書いた

### 2026-10-12 プレビューでの確認（PR #25。スマホで）

LP の表示とボタン → ログイン（`dev@example.com`）→ シフト表でアサインして空に戻す（Action 後の描き直し）→ 共有メニューのモーダルを開閉 →
**PDF を別タブで開く** → 店舗情報の保存、の 7 手順がすべて動いた。CSP でスクリプトが止まっていれば 2 以降が反応しないので、本番の方針で動く確認になる。
コンソール（違反の件数）はスマホでは見られないが、`next start` + Playwright の 35 件 0 で代える。Vercel Toolbar は想定どおり出ない。

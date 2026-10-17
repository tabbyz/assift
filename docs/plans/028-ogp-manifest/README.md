# 028: OGP 画像と manifest

- 前提: 016 §5（LP の範囲外に「OGP 画像・favicon の差し替え」）/ 027（favicon・`icon.svg`・`apple-icon.png`。§2-6・§2-7）/ 022（CSP・proxy の matcher）/
  009 §3（公開シフト表のタイトルに店舗名を入れない）/ 020（管理画面のホストの振り分け）/ 024 §6・026 §6.3（`SITE_URL` を当日 `https://assift.com` に替えて Redeploy する）
- 参照: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`・`manifest.md`、
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`（`metadataBase`・`openGraph`）、
  `node_modules/next/dist/lib/metadata/resolve-metadata.js`（`mergeStaticMetadata`・`postProcessMetadata`・`inheritFromMetadata`）・
  `resolvers/resolve-opengraph.js`・`resolvers/resolve-url.js`（file-based の画像の URL の決まり方）・`build/webpack/loaders/next-metadata-image-loader.js`（webpack のときだけ。ビルドは Turbopack）
- 予定: 10/27 までに main へ（026 のコードの締めにそろえる。カットオーバーの前に `v2.assift.com` でリンクプレビューを確かめる）。026 §4 のゲートではない（遅れても切り替えは止めない）

**状態: 実装済み（確認待ち。2026-10-17）。プランはレビュー 4 回で収束（§7）。実装ログと検証は §8。残りはマージ後の本番での確かめ（人間。§5）。**

---

## 1. 目的と完了条件

LINE・X・Facebook・Slack などに assift の URL を貼ったとき、ロゴの画像・ページのタイトル・説明が出るようにする。あわせて Web アプリの manifest を置く。

今は `openGraph` / `twitter` の metadata も OGP 画像も無く、リンクプレビューは `<title>` と `description` を拾えるサービスでだけ文字が出る。manifest も無い（001 §4.1 で `app/manifest.ts` を置く予定だった）。

- [x] 未ログインで開くページ（LP・静的ページ・ログイン系・公開シフト表・404。クローラーが取るページ）の `<head>` に
      `og:image`（絶対 URL・1200×630）・`og:image:alt`（ちょうど `assift`）・`og:title`・`og:description`・`og:site_name`・`og:locale`・`og:type` と、
      `twitter:card`（`summary_large_image`）・`twitter:image` が出る（ボットの一覧に当たる UA でも、当たらない UA でも。§2.2-5）
- [ ] 本番（Vercel の Production）では `og:image` の URL のホストが `SITE_URL` のホストになる（今 `v2.assift.com`、当日から `assift.com`）。ローカルの `next start` で確認済み、本番はマージ後に見る（§8）
- [x] 公開シフト表（`/share/<code>`）にも同じ画像が出て、説明のタグ（`description`・`og:description`・`twitter:description`）は出さない（§2.3-3）。店舗名はどのタグにも出ない（009 §3）
- [x] `<link rel="manifest" href="/manifest.webmanifest">` が出て、manifest を Chrome が誤り無しで読む（本体のホストと管理画面のホストの両方）
- [x] `/opengraph-image.png`・`/manifest.webmanifest` が 200 で CSP のヘッダが付かず（matcher の外）、`/opengraph-image.png/x` は 404 の HTML + CSP（完全一致の除外）
- [x] CSP の違反が 0 件
- [x] `format:check` / `lint` / `typecheck` / `test` / `build` が通る

## 2. 決定

ユーザーの回答（2026-10-17）: 画像は Claude が静的な PNG を作る（案 A）/ 中身はロゴだけの控えめなもの / 公開シフト表にも出す / manifest は `display: 'browser'`・`start_url: '/'` /
root の description を LP にそろえる / プランは 028。

### 2.1 OGP 画像

1. **静的な PNG を `src/app/opengraph-image.png` に置く**（Next の規約。ファイルを置くと `og:image`・`og:image:type`・`og:image:width`・`og:image:height` を Next が書く）。
   コードで描く `opengraph-image.tsx`（`next/og`）にはしない: 一度作れば当分変えない画像で、日本語の文字も描かないので、コードで描く利点が無い
2. **中身はロゴだけ。** 1200×630 の白地（`#ffffff`）の中央に `AssiftLogo` を幅 560px（高さ ≒ 124px。ロゴの縦横比 1902 : 420）で置く。文字の色は `#000000`
   （LP のヘッダーと同じ `--mantine-color-text`。ライト専用なので黒）
   - 幅 560px は、中央の 630×630 の正方形に収まる大きさ。サービスによっては 1.91 : 1 の画像を正方形や 2 : 1 に切り抜く（Slack の小さい表示・iMessage・X の 2 : 1 は上下 15px を切る）ので、どこを切ってもロゴが欠けないようにする
   - 白地は透過にしない（透過の PNG はサービスによって黒や灰色の地で描かれる。`apple-icon.png` を白地にしたのと同じ理由。027 §2-6）
3. 作り方は 027 の ICO・PNG と同じく、**スクリプトをリポジトリに置かず手順をここに書く**（§4）。`AssiftLogo` を `renderToStaticMarkup` で描いた SVG を 1200×630 の SVG に入れ、sharp で PNG にする。
   ロゴを描き直さないので、ロゴの形は 027 で原本と照合したものと同じ
4. `src/app/opengraph-image.alt.txt` に代替テキスト `assift` を置く（`og:image:alt`。`twitter:image:alt` にも写る）。
   **末尾に改行を入れない**: webpack のローダー（`next-metadata-image-loader.js`）はファイルを trim せずにそのまま `content` に入れる。
   このリポジトリのビルドは Turbopack で、こちらは前後の空白を落とす（レビュー 3 回目の実測）が、ビルドの方式に依らないよう改行を入れない。
   エディタは末尾に改行を足しがちで、Prettier は `.txt` を見ないので、`printf 'assift' > src/app/opengraph-image.alt.txt` で書く
5. **`twitter-image` は置かない。** `openGraph` があって `twitter` の画像が無いとき、Next は `og:image` を `twitter:image` に写し、画像があるので `twitter:card` を `summary_large_image` にする
   （`resolve-metadata.js` の `postProcessMetadata`。レビューで Next 16 の最小のアプリを組んで確かめた）
6. **画像は root の segment に置くので、全ページに出る**（公開シフト表・ログイン系・ログイン後・管理画面を含む）。公開シフト表に出すのはユーザーの決定。
   ログイン後と管理画面の URL が貼られても困るものは出ない（画像はロゴだけ、タイトルは今の `<title>`、説明はサイト共通の文）

### 2.2 `metadataBase` と openGraph の既定

1. **root layout の `metadata` に `metadataBase` を入れ、値は `SITE_URL`**（`normalizeSiteUrl()`。`lib/auth/requestOrigin.ts`。共有 URL・OAuth の redirectTo と同じ正準のオリジン）。
   `SITE_URL` が無い・使えない形のときは `metadataBase` を書かない（`undefined` は「親のまま = 無し」と同じ扱い）
   - **file-based の画像（`opengraph-image.png`）の URL は、`metadataBase` を見る場面が限られる**（`resolve-opengraph.js` → `resolve-url.js` の `getSocialImageMetadataBaseFallback`）:

     | 環境 | `og:image` のオリジン |
     | --- | --- |
     | 開発（`next dev`） | 常に `http://localhost:<PORT>`（`metadataBase` を見ない） |
     | Vercel のプレビュー（`VERCEL_ENV=preview`） | 常に `VERCEL_BRANCH_URL`（無ければ `VERCEL_URL`。`metadataBase` を見ない） |
     | それ以外（Vercel の本番・ローカルの `next start`） | `metadataBase` → `VERCEL_PROJECT_PRODUCTION_URL` → `http://localhost:<PORT>` の順 |

     つまり `SITE_URL` が効くのは本番とローカルの `next start` だけで、プレビューで `og:image` がブランチの URL になるのは仕様。
     プレビューは Deployment Protection の内側でクローラーが取れず、もともとリンクプレビューの確かめには使えない（ブラウザでタグを見るだけ）ので困らない
   - 本番で書かないと `VERCEL_PROJECT_PRODUCTION_URL`（Vercel のプロジェクトの「いちばん短い本番のドメイン」）になり、当日 `assift.com` を Vercel に足す前後でどのホストを指すかがアプリの外で決まる。
     `SITE_URL` は当日 `https://assift.com` に替えて Redeploy する手順が既にある（024 §6・026 §6.3）ので、それに乗せる
   - 管理画面（`admin.assift.com`）でも `og:image` は `SITE_URL`（本体のホスト）を指す。画像は matcher の外の静的なファイルで、本体のホストで配れるので問題ない
   - 値は実行時に読まれる（ビルドに焼き込まれない。レビューで同じビルドを `SITE_URL` を替えて起動し、ホストが変わることを確かめた）。Vercel の環境変数は Redeploy で入れ替わるので、当日の手順のままでよい
   - `normalizeSiteUrl` は `lib/auth/requestOrigin.ts` に置いたまま読む（root layout は Server なので `server-only` を読んでよい）。壊れた `SITE_URL` は共有 URL を組むときに `requestOrigin()` が警告するので、ここでは警告を足さない
2. **root layout に `openGraph: { siteName: 'assift', locale: 'ja_JP', type: 'website' }` を書く。** `og:title` / `og:description` は書かない: 各ページの `title`（template を当てたもの）と `description` を Next が `openGraph` に写す
   （`inheritFromMetadata`）。`twitter` も書かない（§2.1-5）
3. **子の segment では `openGraph` を書かない**（AGENTS.md に書く）。metadata の `openGraph` は浅いマージで、子が書くと root の値が丸ごと置き換わり、
   **file-based の画像も消える**（画像を足すのはファイルを置いた segment だけ。`mergeStaticMetadata`）。レビューの実測では、子が `openGraph: { title }` を書くと
   `og:image`・`og:site_name`・`og:locale`・`og:type` が消え、`twitter:card` が `summary` に落ちた。
   ページごとに説明を変えたいときはトップレベルの `description` を書く（`og:description` に写る。§2.3-3）。どうしても `openGraph` を書くなら、その segment にも `opengraph-image` を置くか `images` を明示し、
   root の `siteName` などを広げる
4. `og:url`（canonical）は入れない。ページごとに組む必要があり、今は困っていない
5. **メタデータが `<head>` ではなく `<body>` に出ることがある**（Next 16 のストリーミングのメタデータ。`lib/metadata/metadata.js`・`server/lib/streaming-metadata.js`）。
   全ルートが動的描画なので、UA がボットの一覧（`HTML_LIMITED_BOT_UA_RE`。facebookexternalhit・Twitterbot・Slackbot・Discordbot など）に当たらないとき、
   Next はメタデータを自分の Suspense（`Next.Metadata`）で包んで流す。**メタデータの解決（主に `generateMetadata` の中の DB や fetch の待ち）が、Suspense の外側の描画（シェル）より遅いと**、
   タグが `<body>` の hidden な要素に入る。ページに Suspense / `loading.tsx` があるとシェルが早く出るので起きやすくなるが、無くても起きる
   （レビュー 2 回目の実測: Suspense の無いページでも `generateMetadata` だけ 0.8 秒待つと `<body>`。静的な `metadata` のページは描画が遅くても `<head>`）。
   - いまの未ログインのページ（LP・静的ページ・ログイン系・公開シフト表・404）は静的な `metadata` だけで `generateMetadata` を使っていない（`loading.tsx` も無い）ので、どの UA でも `<head>` に出る見込み（§5 #2 で確かめる）。
     `generateMetadata` は店舗の layout にしかない
   - LINE のクローラーの UA は資料によって一覧に当たるもの（`facebookexternalhit/1.1;line-poker/1.0`）と当たらないもの（`Line-Crawler`）があり、はっきりしない。上の条件を満たさない限りどちらでも `<head>` なので、今は `htmlLimitedBots` を設定しない
   - 店舗の `generateMetadata`（DB を読む）ではブラウザで `<body>` になりうるが、ログイン後のページでクローラーは `/login` に送られるので実害は無い
   - AGENTS.md に「未ログインのページで `generateMetadata` に待ち（DB・fetch）を入れる、または Suspense / `loading.tsx` を足すと、ボットの一覧に無いクローラーにはタグが `<body>` に出る
     （直すなら `next.config.ts` の `htmlLimitedBots`。既定の一覧を置き換えるので、既定の正規表現に足す形で）」と書く

### 2.3 説明（description）

1. **root の `description` を LP の文にそろえる**（ユーザーの決定）。今の root は v1 の文（「スマホだけでシフト表の作成・共有ができる…」）のまま、LP 以外のすべてのページの `description` と、§2.2-2 で `og:description` にもなる
2. 文は 1 か所に置く: `src/lib/site/metadata.ts` に `SITE_NAME`（`'assift'`）と `SITE_DESCRIPTION` を置き、root layout と manifest（§2.4）が読む。LP の `page.tsx` は自分の `description` を消して root から引き継ぐ
   （`title` の `absolute` は残す）。文の「スタッフ10人まで無料」の人数は手で書かず、LP の料金の欄と同じ `FREE_STAFF_LIMIT`（`lib/billing/pricing.ts`）をテンプレート文字列で埋める
3. **公開シフト表（`share/[code]/page.tsx`・`not-found.tsx`）は説明を出さない: `description: null`**。
   書かないと root の LP の宣伝文（「…スタッフ10人まで無料。」）を引き継ぎ、店長が LINE のグループに共有 URL を貼るとスタッフに宣伝文が出る。
   Next は子のキーが `null` でも親の値を上書きする（`resolve-metadata.js` の `description: metadata[key] ?? null`）ので、`null` で打ち消せる。
   `og:description` / `twitter:description` も引き継ぐ元が空になって出ない。トップレベルの `description` なので `openGraph` を書かず、§2.2-3 に触れない。not-found も同じ（期限切れの URL を貼っても宣伝文を出さない）
   - 当初は「assift で作ったシフト表です。」を書いていたが、LINE のプレビューで中身の無い 1 行にしかならない（タイトルの「シフト表 | assift」と同じことしか言っていない）ので、ユーザーの指示で外した（2026-10-17。§8）

### 2.4 manifest

1. **`src/app/manifest.ts`**（Next の規約。`/manifest.webmanifest` を `application/manifest+json` で返し、`<link rel="manifest">` を Next が書く）。Request-time API を使わないので、ビルド時に静的に作られる
2. 中身:

   | キー | 値 | 理由 |
   | --- | --- | --- |
   | `name` / `short_name` | `assift` | `SITE_NAME` |
   | `description` | `SITE_DESCRIPTION` | §2.3 |
   | `id` / `start_url` | `/` | ログイン済みは LP が `/tenants` へ redirect する（016 §3.2）。未ログインは LP |
   | `display` | `browser` | 下記 |
   | `lang` | `ja` | |
   | `background_color` / `theme_color` | `#ffffff` | ライト専用・白地（LP のヘッダーも白で塗っている。027） |
   | `icons` | `/icon.svg`（`sizes: 'any'`・`image/svg+xml`）と `/apple-icon.png`（`180x180`・`image/png`） | 027 のファイルをそのまま使う。`<link>` の href はキャッシュ用のクエリが付くだけで、パスは同じ（素のパスでも 200）|

3. **`display: 'browser'`**（ユーザーの決定）。Android の Chrome では、ホーム画面に置いても普通のブラウザで開く。`standalone` にすると iOS ではホーム画面のアプリが Safari と cookie を分けて持ち、
   Google ログイン（OAuth の画面）や Stripe の決済・ポータルに出て戻ったときにログイン状態が引き継がれない恐れがある。Service Worker も作らない（001）。
   - **iOS は manifest では決められない見込み。** iOS 26 の「ホーム画面に追加」のダイアログは「Web アプリとして開く」が既定でオンで、manifest の無いサイトでも Web アプリとして開く
     （WebKit の WWDC25 の記事など）。`display: 'browser'` でこの既定が変わるかは Apple の資料で確かめられていない。
     効くのは Android の Chrome（「ホーム画面に追加」がブラウザで開くショートカットになる）で、iOS は**利用者のトグルの選択に任せる**（受け入れる。manifest やメタタグで iOS を縛る手段は探さない）
   - iOS の実機で、トグルの既定値と開いた先を記録する（§5 の人間の確認）。Web アプリとして開いたときに Google ログインと Stripe から戻れるかも見て、戻れなければリリース後の課題として残す
     （今の v1 の利用者にも同じことが起きている。§6）
4. **192 / 512px の PNG アイコンは足さない。** Chrome が「インストール」を出す条件（192 と 512 の PNG）は `display: 'browser'` では目指していない。
   Android の Chrome の「ホーム画面に追加」は manifest の `icons` から選ぶので 027 の 2 つで足り、iOS は manifest ではなく `apple-touch-icon`（027 の `<link>`）を使う。
   足すと `public/` を作るか（027 §2-1 で作らないと決めた）、Route Handler を足すことになる
5. `<link rel="icon">` などは 027 のまま（manifest の `icons` はタグを増やさない）

### 2.5 proxy の matcher

`opengraph-image\.png$` と `manifest\.webmanifest$` を完全一致で外す（027 §2-7 のアイコンと同じ）。どちらもログイン状態と無関係の実在する単一のパスで、
LINE などのクローラーは cookie を持たずに取りに来る。

外すのは 027 にそろえるためだけではない: **管理画面のホストでは、proxy の 0 段目が `/-` 以外を管理画面のトップ（`/-`）へ redirect する**（`lib/admin/host.ts`・`src/proxy.ts`）ので、
外さないと管理画面のページの `<link rel="manifest">` が redirect を受けて Chrome の manifest の読み込みが失敗する。
前方一致や拡張子で外さない理由は 022・027 と同じ（存在しない URL が CSP の無い 404 の HTML になる）。

CSP は変えない: manifest は `manifest-src` が無いので `default-src 'self'`（同じオリジン）、画像はクローラーが取るもので CSP と関係が無い。

## 3. ファイル

- `src/app/opengraph-image.png`・`src/app/opengraph-image.alt.txt`（新規）
- `src/app/manifest.ts`（新規）
- `src/lib/site/metadata.ts`（新規。`SITE_NAME` / `SITE_DESCRIPTION`）
- `src/app/layout.tsx`（`metadataBase`・`openGraph`・`description`）
- `src/app/(public)/(site)/page.tsx`（`description` を消す）
- `src/app/(public)/share/[code]/page.tsx`・`not-found.tsx`（`description: null`。§2.3-3）
- `src/proxy.ts`（matcher とコメント）
- `AGENTS.md`（ディレクトリの `app/` 直下の説明と `lib/site/`・matcher の段落・「子の segment で `openGraph` を書かない」と「未ログインのページの Suspense とメタデータ」の注意）
- `docs/plans/016-landing-page/README.md` §5（「OGP 画像・favicon の差し替え」に 027・028 で対応したと添える）
- `docs/plans/026-cutover/README.md` §6.6（10/31 にリンクプレビューを取り直す行。§5）

## 4. OGP 画像の作り方（作り直すときも同じ手順）

1. `renderToStaticMarkup(createElement(AssiftLogo, { height }))` で SVG の文字列を得る（`npx tsx` で 1 回だけ走らせるスクリプトを scratchpad に置く。リポジトリには置かない）。
   scratchpad のスクリプトにはリポジトリの `node_modules` と tsconfig が効かないので、次のようにする（レビュー 4 回目に実測で通した形）:
   - scratchpad に `ln -s /home/user/assift/node_modules node_modules` を作る（`react-dom/server`・`sharp` を解決するため）
   - **scratchpad を cwd にして `npx tsx --tsconfig /home/user/assift/tsconfig.json make.tsx` で走らせる**。tsx は tsconfig を cwd から探すので、
     渡さないとリポジトリ側の `AssiftLogo.tsx` まで classic JSX で変換され `React is not defined` になる。リポジトリを cwd にすると、相対パスの出力がリポジトリの中にできてしまう
   - スクリプトは JSX ではなく `createElement` で書く
   - 出力は scratchpad に書き、目で見てから `src/app/opengraph-image.png` へコピーする
   - トップレベルの `await` は使わず、async の即時関数で包む（cjs として走る）
   - sharp は `package.json` に無く、`next` の optional の依存として入っているもの（0.35 系）を使う
2. 1200×630 の SVG を組む: 白の `<rect>` を敷き、ロゴを幅 560（高さ 560 × 420 / 1902 ≒ 123.66）で中央に置く。`AssiftLogo` は位置を受けないので、
   出力を `<g transform="translate(320 253.17)">` で包む（y = (630 − 123.66) / 2）か、出力の先頭の `<svg` に `x` / `y` を足す。文字の `currentColor` は外側の `color="#000000"` で決める
3. sharp で PNG に書き出す（`sharp(svg).png({ palette: true })`。色数が少ないのでパレットにして小さくする。レビューの試作で約 7KB。Next の上限は 8MB）
4. 書き出した PNG を目で見る（全体・中央の 630×630・中央の 1200×600 の切り抜き）。大きさが 1200×630 であることを `sharp(...).metadata()` で見る
5. 代替テキストは `printf 'assift' > src/app/opengraph-image.alt.txt`（末尾の改行なし。§2.1-4）

## 5. 確かめ

ローカル（`next start`）。ビルドの前に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を入れておく（ビルドに埋め込まれ、無いと proxy が全リクエストで投げる。Supabase が起動できないときはダミーでよい）。
`SITE_URL` は実行時に読まれるので、**`next start` の側に渡す**（起動時の環境変数は `.env*` より強い。`.env.local` に `SITE_URL` があると #6 の `env -u SITE_URL` でも読まれてしまうので、#6 の間だけ外す）。
ビルドの環境に `SITE_URL` が無いと `next build` のログにも `metadataBase property … is not set` が出るが、ビルド時の話なので気にしない（#6 は `next start` のログで見る）:

```bash
npm run build
SITE_URL=https://v2.assift.com npm run start          # #1〜#5・#7
ADMIN_HOST=admin.localhost:3000 SITE_URL=https://v2.assift.com npm run start   # #8
env -u SITE_URL npm run start                         # #6
```

`metadataBase` が `SITE_URL` から来ることを見るため、あえて localhost 以外を入れる。

| # | 見るもの | 期待 |
| --- | --- | --- |
| 1 | `/`・`/login`・`/terms`・`/nonexistent`（root の 404）の HTML | §1 のタグが `<head>` に出る。`og:image` は `https://v2.assift.com/opengraph-image.png?opengraph-image.<hash>.png`（クエリ付き）。`og:image:alt` と `twitter:image:alt` はちょうど `assift`（改行なし）。`og:title` は各ページの `<title>` と同じ（`/` は `assift｜シフト表づくりに、…`、`/login` は `ログイン \| assift`）。`og:description` は `SITE_DESCRIPTION`。`twitter:card` は `summary_large_image` |
| 2 | #1 を UA を替えて取る: curl の既定・`-A 'facebookexternalhit/1.1'`・`-A 'Mozilla/5.0 (compatible; Line-Crawler)'`（一覧に無い UA） | どれも `<head>` に出る（§2.2-5） |
| 3 | `/share/<code>`（seed の共有）と形式違いの `/share/0`（DB を引かずに not-found） | 同じ画像。`og:title` は `シフト表 \| assift` / `ページが見つかりません \| assift`。`description`・`og:description`・`twitter:description` が無い。店舗名がどのタグにも無い |
| 4 | `curl -I /opengraph-image.png`・`/manifest.webmanifest` | 200・`image/png`・`application/manifest+json`。`content-security-policy` が無い |
| 5 | `curl -I /opengraph-image.png/x`・`/xmanifest.webmanifest` | 404 の HTML に `content-security-policy` が付く |
| 6 | `SITE_URL` を外して起動した `/` | `og:image` が `http://localhost:3000/…`（Next の既定に落ちる）。`next start` のログに `metadataBase property … is not set` の警告が出る |
| 7 | Playwright（Chromium）で `/` と `/login` を開き、CDP の `Page.getAppManifest` | `errors` が空。`securitypolicyviolation` が 0 件 |
| 8 | `ADMIN_HOST` ありで `admin.localhost:3000/-/login` | `og:image` が `https://v2.assift.com/…`。`admin.localhost:3000/manifest.webmanifest` が 200（redirect されない）。Playwright の `Page.getAppManifest` の `errors` が空 |
| 9 | `/tenants/<id>`（ログイン後。Supabase が要る） | タグが出る（`<body>` でもよい。§2.2-5） |

seed の共有（#3 の前半）と #9 は Supabase のローカルが要る。起動できないときは `/share/0` だけで見て、プレビューで seed の共有を開いて確かめる
（プレビューでは `og:image` がブランチの URL になる。§2.2-1）。

人間（マージ後、本番 `v2.assift.com`）:

- `https://v2.assift.com/` と共有の URL を、LINE の Page Poker（`https://poker.line.naver.jp/`）・Facebook のシェアデバッガ・X の投稿画面（下書き）に通し、画像とタイトル・説明が出ること
- Android の Chrome で `v2.assift.com` を「ホーム画面に追加」し、アイコンがシンボルで、開くとブラウザ（アドレスバーのある画面）で開くこと
- iOS の実機で同じく追加し、アイコンがシンボルであること。ダイアログの「Web アプリとして開く」の既定値と、開いた先（Safari か Web アプリか）を記録する。
  Web アプリで開いたら、Google ログインと「プランとお支払い」から Stripe に出て戻れるかを見る（§2.4-3。戻れなくてもこのタスクは止めず、リリース後の課題にする）
- 当日の後（026 §6.6 に 1 行足す）: 10/31 に `https://assift.com/` の `og:image` が `https://assift.com/…` を指すこと（`SITE_URL` の差し替えと Redeploy の確認）。
  LINE と Facebook は以前の assift.com（v1）のプレビューを持っていることがあるので、Page Poker とシェアデバッガで `https://assift.com/` を取り直す。
  `v2.assift.com` を外したあとに v2 の URL で取られたプレビューも同じく取り直せば足りる

## 6. やらないこと

- 192 / 512px の PNG アイコン・`standalone`・Service Worker（§2.4）
- ページごとの OGP 画像（共有ページに期間を描くなど）・`og:url`
- `htmlLimitedBots`（§2.2-5。今は要らない）
- v1 でホーム画面に追加されたアイコン。v1 は `apple-mobile-web-app-capable=yes` と `manifest.json`（`display: standalone`・`start_url: "/?standalone"`・`id` 無し）を出していた
  （v1 `app/views/layouts/application.html.slim`・`app/assets/javascripts/manifest.json.erb`）。v2 の manifest は `id: '/'` で別のアプリ扱いなので、
  v1 で入れたアイコンは standalone のまま v2 を開き続ける（`/?standalone` は LP に着き、ログイン済みなら `/tenants` へ。`/manifest.json` は 404）。028 では変わらない
- `robots.txt` / `sitemap.xml` / `/apple-touch-icon.png`（iOS が `<link>` を見ずに取りに来るパス）を実在するルートにする件（022 §7 の未確定。別の仕事）

## 7. レビュー

| 回 | 高 / 中 / 低 | 主な指摘 | 反映 |
| --- | --- | --- | --- |
| 1 | 0 / 6 / 7 | `next start` に `SITE_URL` が渡らない手順 / 子の `openGraph` で画像も消える / `.alt.txt` の末尾の改行 / file-based の画像は開発・プレビューで `metadataBase` を見ない / ストリーミングのメタデータで `<body>` に出る条件 / 確かめの抜け（alt・寸法・404・管理画面のホスト・UA）。低: URL の形・`/share/0`・管理画面のホストで matcher を外す理由・ファイル一覧・共有ページの説明・`normalizeSiteUrl` の警告・iOS の実機 | 中はすべて反映。低は `normalizeSiteUrl` の警告（§2.2-1 の最後に理由を書いて見送り）以外を反映。共有ページの説明（§2.3-3）はレビューの提案を採った |
| 2 | 0 / 1 / 4 | `<body>` に出る条件の誤り（Suspense が無くても `generateMetadata` が遅ければ出る）。低: プレビューの行（`VERCEL_URL`・Deployment Protection）/ §5 の前置きの理由 / 管理画面のホストの redirect 先 / §4 のロゴの置き方 | すべて反映 |
| 3（別のレビュアー） | 0 / 2 / 5 | `.alt.txt` を trim しないのは webpack だけ（Turbopack は trim する）/ iOS 26 は「ホーム画面に追加」が既定で Web アプリとして開き、manifest で決められない見込み。低: §4 の手順がそのままでは走らない / `.env.local` と起動時の環境変数の強さが逆 / ビルドでも警告が出る / 説明の人数を `FREE_STAFF_LIMIT` で / v1 のホーム画面のアイコン | すべて反映。iOS は利用者の選択に任せると決めた（§2.4-3） |
| 4（3 回目と同じレビュアー） | 0 / 1 / 1 | §4-1 は scratchpad を cwd にすると `--tsconfig` が要る（実測）。低: §2.4-3 の冒頭を Android に限る | すべて反映。**収束**（高 0。残った中は `--tsconfig` を足す 1 行で、レビュアーが実測で通した） |

## 8. 実装ログ

### 2026-10-17 実装

- §2・§3 のとおり。`src/lib/site/metadata.ts` に `SITE_NAME` / `SITE_DESCRIPTION` / `SHARE_DESCRIPTION` を置いた（公開シフト表の page と not-found が同じ文を使うので、これも定数にした。のちに消した）
- OGP 画像は §4 の手順で作った（1200×630・8-bit のパレット・7,004 バイト）。ロゴは `x="320" y="253.17"`。全体・中央の 630×630・中央の 1200×600 の切り抜きを目で見た
- `opengraph-image.alt.txt` は `printf` で書き、`od -c` で 6 バイト（`assift`）を確かめた
- セッションの途中で `node_modules` が `package-lock.json` より古く（`@vercel/analytics` が無く typecheck が落ちた）、`npm ci` で揃えた。dockerd は古い pid ファイルで起動に失敗していたので、消して起こし直した（どちらもリポジトリの変更ではない）

### 検証

| 項目 | 結果 |
| --- | --- |
| `lint` / `typecheck` / `test` / `build` | 通る（test 99 ファイル・924 件。lint は既存の `reasons.test.ts` の warning 1 件だけ）。`npx supabase test db` も 241 件通る |
| `format:check` | 変更したファイルは通る。main に前からある 3 件（`.agents/skills/interface-design/` の 2 件・`ShareModal.tsx`）で落ちる。今回は触らない |
| §5 #1 | `SITE_URL=https://v2.assift.com` の `next start` で `/`・`/login`・`/terms`・`/nonexistent` に §1 のタグがすべて `<head>`。`og:image` は `https://v2.assift.com/opengraph-image.png?opengraph-image.3eyipk4g0po5j.png`、alt はちょうど `assift`、`twitter:card` は `summary_large_image`、`og:title` は各ページの `<title>` と同じ |
| §5 #2 | curl の既定・`facebookexternalhit/1.1`・`Mozilla/5.0 (compatible; Line-Crawler)` のどれでも、`/`・`/login`・`/share/SEEDSHR1`・`/share/0` のタグが `<head>` |
| §5 #3 | `/share/SEEDSHR1`（seed。本文に「小石川ストア」が出る）と `/share/0` で同じ画像、`og:description` は「assift で作ったシフト表です。」（のちに外した。下の「公開シフト表の説明を外す」）。店舗名はどの `<meta>` にも無い |
| §5 #4・#5 | `/opengraph-image.png` 200 `image/png`・`/manifest.webmanifest` 200 `application/manifest+json`、どちらも CSP のヘッダ無し。`/opengraph-image.png/x`・`/xmanifest.webmanifest` は 404 の HTML + CSP |
| §5 #6 | `env -u SITE_URL` の `next start` で `og:image` が `http://localhost:3000/…`、ログに `metadataBase property … is not set` |
| §5 #7 | Playwright（Chromium）で `/`・`/login` の `Page.getAppManifest` の errors が空、`securitypolicyviolation` 0 件 |
| §5 #8 | `ADMIN_HOST=admin.localhost:3000` で `/-/login` の `og:image` が `https://v2.assift.com/…`。`admin.localhost:3000/manifest.webmanifest` と `/opengraph-image.png` は 200（`/login` は `/-` へ 307 なので、matcher の除外が効いている）。`Page.getAppManifest` の errors が空・CSP の違反 0 件 |
| §5 #9 | `dev@example.com` でログインし、`/tenants/<seed の店舗>`・`/account` でタグと manifest が出る。CSP の違反 0 件 |

残り（人間・マージ後）: §5 の「人間」の 3 つ（LINE・Facebook・X のプレビュー / Android と iOS の実機）と、10/31 の確かめ（026 §6.6）

### 実装のレビュー

| 回 | 高 / 中 / 低 | 指摘 | 反映 |
| --- | --- | --- | --- |
| 1 | 0 / 0 / 4 | `.env.example` の `SITE_URL` の説明に `metadataBase` が無い / `lib/site/metadata.ts` の説明の位置と読む側 / AGENTS.md の `brand/` の行の重複 / 009 の metadata の記述 | すべて反映（024 の環境変数の表の出典にも 028 を足した）。直したあとビルドし直し、`/share/SEEDSHR1` と `/` のタグが変わらないことを見た |

### 2026-10-17 公開シフト表の説明を外す

- PR #49 のプレビューを LINE に貼ったところ、説明の「assift で作ったシフト表です。」が中身の無い 1 行だったので、ユーザーの指示で外した（§2.3-3）。
  公開シフト表の page と not-found を `description: null` にし、`SHARE_DESCRIPTION` を消した（AGENTS.md・009 の記述も直した）
- 確かめ（`SITE_URL=https://v2.assift.com` の `next start`・ローカルの Supabase）: `/share/SEEDSHR1`（200。本文に「小石川ストア」）と `/share/0` で `description`・`og:description`・`twitter:description` が無く、
  `og:title`・`og:image`・`twitter:card`（`summary_large_image`）は残る。メタタグに店舗名は無い。curl の既定と `facebookexternalhit/1.1` で同じ。`/` の説明は変わらない

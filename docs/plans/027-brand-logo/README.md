# 027: ロゴとシンボルの差し替え

- 前提: 016 §2（LP の仮のロゴ。4 マスをパターン色で塗ったもの + 「assift」の文字）/ 022（CSP。`img-src 'self' data:`）
- 参照: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`
- 原本: デザイナーの書き出し（Affinity）。ロゴ `assift_v2_logo.svg`（2000×500。文字は Inter Bold をカーブにしたもの）/ シンボル `assift_v2_symbol.svg`（500×500）/ 同じ絵の PNG（1000×250・500×500）

## 1. 目的と完了条件

仮のロゴ（016）と文字だけの「assift」を、作ったロゴとシンボルに差し替える。

- [x] LP・静的ページのヘッダー、ログイン系の枠、店舗の枠・アカウントの枠・初期設定のヘッダー、管理画面の枠とログインが新しいロゴになる
- [x] favicon・`icon.svg`・`apple-icon.png`（iOS のホーム画面）がシンボルになる
- [x] 描いたロゴが原本と一致する（§4）。CSP の違反が 0 件
- [x] `lint` / `typecheck` / `test` / `build` が通る

## 2. 決定

1. **ロゴは画像ファイルではなく、インラインの SVG のコンポーネントにする**（`src/components/brand/AssiftLogo.tsx`）。`public/` は作らない（proxy の matcher の前提。022）。
   素の `<svg>` なので Server / Client のどちらからも使え、文字の色は `currentColor` で親に合わせられる
2. **原本の `<text>`（Inter の指定）は使わない。** Inter の入っていない端末では別の書体で描かれる。カーブにした書き出しのパスを使う
3. 原本を次のように整える（見た目は変えない）
   - 四方の余白 40 を落とし、シンボルの左上を原点にする（viewBox `0 0 1902 420`。ロゴの高さ = シンボルの高さで、並べたときに上下がそろう）
   - シンボルの角丸の `<path>` は円弧の近似（制御点 0.552）なので `<rect rx>` に置き換える（1 マス 190、間 40、角丸 47.16 = 44.678 × 1.05556）
   - 文字の `<g transform="matrix(500,…)">` は座標に焼き込み、小数 1 桁に丸める
4. 色はブランドの色なので `theme.ts` ではなくコンポーネントに置く（左上・右下 `#156ffd`、右上 `#75a8fa`、左下 `#428bfd`）
5. 大きさ: ログイン後のアプリの枠（店舗・アカウント・初期設定・管理画面のヘッダー）は**シンボルだけ**を 20px（2026-10-16 の指示。24px から小さくした。管理画面は右に「管理」）。**ハンバーガーが出ている幅では出さない**（店舗の枠は md 以上だけ、アカウントの枠はハンバーガーが常に出るので無し）、LP のヘッダーは 24px（スマホ幅 ≤ 36em は 20px。2026-10-16 に 28px / 22px から小さくした。359px 以下は右の「無料ではじめる」を出さない。2026-10-20）、ログイン系の枠は 36px、管理画面のログインは 32px
6. アイコンは Next の規約のファイル（`app/favicon.ico` / `app/icon.svg` / `app/apple-icon.png`）。
   favicon と `icon.svg` は四方に少し余白を入れ、シンボルを 87.5% で置く（2026-10-17 の指示。当初は余白なし。§4）。`apple-icon.png` は 180×180 の白地（iOS は透過を黒で塗る）にシンボルを 70%（126px）で置く
7. `icon.svg` / `apple-icon.png` も favicon と同じく proxy の matcher から完全一致で外す（実在する単一のパス。セッションの更新が要らない）

## 3. ファイル

- `src/components/brand/AssiftLogo.tsx`（新規）
- `src/app/(public)/(site)/_components/Logo.tsx`・`Site.module.css`（仮のロゴの `.mark` を削除）
- `src/app/(auth)/layout.tsx`
- `src/components/TenantShell.tsx`・`SimpleShell.tsx`・`setup/SetupHeader.tsx`
- `src/app/-/(console)/_components/AdminShell.tsx`・`src/app/-/login/_components/AdminLoginForm.tsx`
- `src/app/favicon.ico`（差し替え。16 / 32 / 48 の PNG を埋め込んだ ICO）・`src/app/icon.svg`・`src/app/apple-icon.png`（新規）
- `src/proxy.ts`（matcher）・`AGENTS.md`

## 4. 実装ログ

### 2026-10-16 実装

- §2 のとおり。ICO・PNG は `icon.svg` から sharp で書き出した（スクリプトはリポジトリに置かない。作り直すときは同じ手順: 16 / 32 / 48 の PNG を ICO に詰める、180 の白地に 126 で重ねる）
- 原本との照合: `AssiftLogo` を `renderToStaticMarkup` で描いた SVG と、原本（viewBox を `40 40 1902 420` に切ったもの）を 1902×420 で描き比べ、
  画素の差の平均 0.014 / 255（差が 64 を超える画素は 24 / 80 万。小数 1 桁の丸めの分）
- カーブの SVG と原本の PNG（1000×250）も一致する（差の平均 0.096 / 255）。`<text>` 版を Inter Bold の既定の字送りで組むと「ss」が右にずれる（字間を詰めてある）ので、カーブ版が正

### 確認（`npm run build && npm run start`）

- `<head>` に `favicon.ico`（48x48）・`icon.svg`（any）・`apple-touch-icon`（180x180）が出る。3 つとも 200 で CSP のヘッダが付かない（matcher の外）。
  `/icon.svg/x`・`/xicon.svg` は 404 の HTML + CSP（完全一致の除外が効いている）
- Playwright で `/`（1280・375）・`/login`・`/-/login`・`/tenants/<id>`・`/account`・`/tenants/new`・`/-/users` を開き、ロゴが描かれ、`securitypolicyviolation` が 0 件
- LP のヘッダー: 375px で収まる（ロゴ 22px で幅 99.6px。仮のロゴは 85px）。**320px では変更前から「ログイン」が折り返し、「無料ではじめる」が右にはみ出す**（今回は直していない）

### 2026-10-16 ログイン後のヘッダーをシンボルだけにする

- 指示により、店舗（`TenantShell`）・アカウント（`SimpleShell`）・初期設定（`SetupHeader`）・管理画面（`AdminShell`）のヘッダーをロゴからシンボル（`AssiftSymbol`、24px）に替えた。
  シンボルだけのリンクにも名前が付くよう、`AssiftSymbol` も `role="img"` + `aria-label="assift"`
- LP・静的ページ・ログイン系・管理画面のログイン（いずれもログイン前）はロゴのまま
- 24px では大きいとの指示で 20px にした（Burger・店舗名の文字と高さがほぼそろう）
- ハンバーガーが出ているときはシンボルを出さない、との指示で、`TenantShell` は `visibleFrom="sm"` → `"md"`（ハンバーガーは `hiddenFrom="md"`）、
  `SimpleShell` はハンバーガーが幅によらず出るのでシンボルのリンクを外した（戻り先は Navbar の「店舗に戻る」）
- md でハンバーガー（幅 28px）とシンボル（20px）が入れ替わると店舗名が 8px ずれるので、シンボルのリンクをハンバーガーと同じ 28×28 の枠にして中央に置いた。
  991px / 992px とも店舗名の左端は 42px（Playwright で測った）
- ハンバーガー / シンボルと店舗名の間が空き過ぎ、との指示で、外側の `Group` の `gap` を 6 → 0 にした。店舗名のボタン（`TenantSwitcher`）の内側の余白（`px="xs"`）はホバーの背景のために残す。
  アイコンの右端から店舗名の文字までが 22px → 16px（ハンバーガー）/ 21px → 15px（シンボル）
- LP のヘッダーのロゴが大きい、との相談で 28px → 24px（スマホ幅は 22px → 20px）にした。28px だと文字の x ハイトが約 18px（34px 前後の太字相当）で、
  ナビ（14.5px）の 2 倍を超えていた。24px で x ハイトは約 16px
  確認: 1280px でロゴの幅 108.7px。575px 以下は 20px（幅 90.6px）で 375px は 1 行に収まる（24px のままだと「ログイン」が折り返す）。
  320px は「ログイン」が折り返すが横にははみ出さない（変更前からの折り返し）。CSP の違反 0 件
- LP の固定ヘッダーが半透明で見づらい、との指示で、背景を `color-mix(… 88%, transparent)` + `backdrop-filter: blur(12px)` から `var(--mantine-color-body)`（白）の塗りにした。
  1280px・375px でスクロールし、本文が透けないこと・CSP の違反 0 件を確かめた

### 2026-10-17 favicon に余白を入れる

- タブの favicon に少し余白を入れたい、との指示で、`icon.svg` の viewBox を `0 0 420 420` → `-30 -30 480 480` にした（シンボルが枠の 87.5%。四方の余白は 1 マスの約 16%）
- `favicon.ico` は `icon.svg` を縮めるのをやめ、サイズごとにピクセルへそろえて描いた（余白・1 マス・間 = 16px: 1 / 6 / 2、32px: 2 / 13 / 2、48px: 3 / 19 / 4。どれもシンボルが 87.5%、角丸は 1 マス × 47.16 / 190）。
  縮めただけの 16px は 1 マスが 7.24px・間が 1.52px で、間が半透明（不透明度 2 / 9）になり 4 マスが 1 つの塊に見えていた。作り直すときは同じ表で描いて 16 / 32 / 48 の PNG を ICO に詰める
- `apple-icon.png` はもとから白地に 70% で置いているので変えていない

### 2026-10-17 ログイン系の枠でロゴ + カードを縦の中央に置く

- ロゴとカードが画面の上に寄っていて下が大きく空く、との指摘で、layout のロゴ（`Title`）に `mt="auto"`、`AuthCard` に `mb="auto"` を付け、余った高さを上下で分けた
- 下に置くものがある /login（同意の表示が `mt="auto"`）は余りが上 1 : 下 2 になり、少し上寄り（目で見た中央）。ほかのページはちょうど中央
- 確かめ（`next dev`・Playwright）: /login はロゴの上端が 32px → 87px（1280×800）/ 96px（390×844）。/password/forgot（1280×800）はカードの上下の余白がどちらも 173px。
  ロゴの大きさ（36px）は変えていない

### 2026-10-20 320px の LP のヘッダーとカードを直す

- §4 の 1 回目で先送りにした 320px の崩れ。今の main を `next build && next start` で開き、Playwright で測った（変更前）:
  - ヘッダー: ロゴ（90.6px）・「ログイン」（58px）・「無料ではじめる」（136px）と間・左右の余白を 1 行に並べるには約 359px 要る。
    350px 以下で「ログイン」が 2 行に折り返し、320px では「無料ではじめる」も 111.8px に縮んで文字が右で切れる（文字の幅 98px に対して見える幅 74px）。
    ヘッダーそのものは画面の外へははみ出さない（§4 の 1 回目の「右にはみ出す」は、ボタンの中で文字が切れることを指す）
  - 「できること」の「URLを送るだけで共有できる」のカードが 320px で右へ 8px はみ出し、ページ全体が横にスクロールする。
    `.card` の grid に列の指定が無く、共有の URL の飾り（`.linkPill`）の最小の幅（約 258px）が列を押し広げていた
- 直し方（指示により推奨の案）:
  - 359px 以下（`max-width: 22.4375em`）ではヘッダーの「無料ではじめる」を出さない。申し込みのボタンはヒーローの見出しのすぐ下にある（320px で上端から約 350px）。
    詰めて 3 つを残す案は、計算で 320px の余りが 0〜3px しかなく、317px 未満で再び崩れるので採らなかった。
    Mantine の Button の `display` に読み込み順で負けないよう、`.header .headerCta` とクラスを 2 つ重ねる
  - 「ログイン」は `white-space: nowrap`
  - `.card` に `grid-template-columns: minmax(0, 1fr)`（URL は `…` で省略される）
- 確認（`next build && next start`・Playwright。ログアウトの状態）:
  - `/` と `/terms` を 280 / 320 / 340 / 359 / 360 / 375 / 1280px で開いた。359px 以下は「ログイン」が 1 行で「無料ではじめる」が出ない。
    360px 以上は変更前と同じ（3 つが 1 行に並び、ボタンの文字は切れない）。どの幅でもページの横スクロールは無く、`securitypolicyviolation` は 0 件
  - 320px で `/`・`/terms`・`/privacy`・`/law`・`/contact`・`/login`・`/signup`・`/password/forgot` に横スクロールは無い。
    280px は `/law` だけ、連絡先のメールアドレス（`support@assift.com`）のリンクが 5px はみ出す（今回は直していない。320px は収まる）

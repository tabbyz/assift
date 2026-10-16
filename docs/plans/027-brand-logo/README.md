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
5. 大きさ: ログイン後のアプリの枠（店舗・アカウント・初期設定・管理画面のヘッダー）は**シンボルだけ**を 24px（2026-10-16 の指示。管理画面は右に「管理」）、LP のヘッダーは 28px（スマホ幅 ≤ 36em は 22px）、ログイン系の枠は 36px、管理画面のログインは 32px
6. アイコンは Next の規約のファイル（`app/favicon.ico` / `app/icon.svg` / `app/apple-icon.png`）。
   favicon と `icon.svg` は余白なし（タブの小さな枠をいっぱいに使う）。`apple-icon.png` は 180×180 の白地（iOS は透過を黒で塗る）にシンボルを 70%（126px）で置く
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


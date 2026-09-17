# 002: プロジェクト基盤

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md`）のマイルストーン 002。
機能を一切持たない状態で、以降のマイルストーンが同じ流儀で実装できる土台を作る。

---

## 1. 目的と完了条件

### 目的

- `.tmp/project-template.md` の規約どおりに Next.js + Mantine + Supabase の骨格を作る
- Server Actions、Supabase クライアント、認証ガード、テスト基盤を「1 回だけ書く」場所を用意する
- 以降の機能実装がコピペ元にできる最小のサンプル（ページ 1 枚、Action 1 本、テスト 1 本）を置く

### 完了条件

- `npm run build` / `npm run lint` / `npm run typecheck` / `npm test` / `npm run format:check` がすべて成功する
- `npx supabase start` でローカル Supabase が起動し、`.env.local` の値で `npm run dev` が動く
- `/` が Mantine のスタイルで表示される
- 未ログインで `/tenants` にアクセスすると `/login` にリダイレクトされる
- `AGENTS.md` に規約が書かれ、`CLAUDE.md` は `@AGENTS.md` のみ

---

## 2. 前提と確認済みの環境

| 項目 | 値 | 備考 |
| --- | --- | --- |
| Node | ローカルは 20.10.0（`~/work/dev/.node-version`） | **Node 20 は 2026-04 で EOL**。リポジトリに `.node-version` = `22` を置き、`package.json` の `engines` も 22 にする提案（3.1 参照） |
| npm | 10.x | パッケージマネージャは npm。lockfile をコミット |
| Docker | 28.3 | `supabase start` に必要。起動確認済み |
| Supabase CLI | グローバル未インストール | `devDependencies` に `supabase` を入れ `npx supabase` で使う（テンプレート準拠） |

### 採用バージョン（2026-09-17 時点の最新安定版）

| パッケージ | 版 | 注意点 |
| --- | --- | --- |
| next | 16.3.x | **`middleware.ts` は `proxy.ts` に改名されている**。`params` / `searchParams` は Promise。`next dev` が `AGENTS.md` にルールブロックを自動追記する |
| react / react-dom | 19.3 | |
| @mantine/core, hooks, notifications, modals, dates | 9.6.x | v9。`postcss-preset-mantine` 1.18 + `postcss-simple-vars` 7 |
| @tabler/icons-react | 3.46 | |
| @supabase/supabase-js / @supabase/ssr | 2.116 / 0.12 | `getClaims()` でセッション検証（`getUser()` より速い） |
| supabase（CLI） | 2.117 | 宣言的スキーマのコマンド（`db schema declarative ...`）が使えることを Step 4 で確認する |
| nuqs | 2.10 | |
| zod | 4.x | v3 と API が一部異なる（`error.issues`、`z.email()` など） |
| dayjs | 1.11 | |
| vitest | 5.x | |
| prettier | 3.9 | |
| eslint / eslint-config-next | 9.x / 16.3.x | ESLint 10 は `eslint-config-next` の peer 範囲外の可能性があるため、`create-next-app` が入れる 9 系のまま使う |

隣のプロジェクト `nekonoie`（Next 16.3 / Mantine 9.5）の `eslint.config.mjs`、`postcss.config.mjs`、`tsconfig.json`、`layout.tsx`（`ColorSchemeScript` + `mantineHtmlProps`）の書き方を踏襲する。Tailwind は入れない。

---

## 3. 事前に確認したい決定

### 3.1 Node のバージョン

Vercel の既定ランタイムと EOL を考えると Node 22 にしたい。ローカルは anyenv / volta で 22 を入れる必要がある。**22 で進めてよいか**。

### 3.2 `proxy.ts` の命名

テンプレートは `middleware.ts` だが Next 16 では `proxy.ts` が正。次の構成にする。

- `src/proxy.ts`（Next のエントリ）
- `src/utils/supabase/proxy.ts`（cookie 更新 + リダイレクト判定。テンプレートの `utils/supabase/middleware.ts` に相当）

AGENTS.md にもこの読み替えを明記する。

### 3.3 テーマ

- `primaryColor`: Mantine 組み込みの `teal`（v1 の primary `#00d1b2` に最も近い）。LP マイルストーンで調整可
- フォント: システムフォントスタック（v1 と同じ。Web フォントは読み込まない）
- 勤務パターンの 20 色は `theme.other.patternColors` に置く（`src/lib/patterns/colors.ts` の定数を参照）

### 3.4 環境変数名

Supabase の新しいキー体系に合わせる。

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # 旧 anon key に相当
SUPABASE_SECRET_KEY=                    # 旧 service_role key に相当。サーバーのみ
V1_UUID_NAMESPACE=                      # 旧 URL 解決と移行で使う固定 UUID（005 / 012 で使用）
```

---

## 4. 成果物

```
.node-version                     22
.prettierrc                       { semi: false, singleQuote: true, tabWidth: 2, trailingComma: 'es5', printWidth: 100 }
.prettierignore
.env.example
.gitignore                        create-next-app 既定 + supabase/.temp
AGENTS.md / CLAUDE.md / README.md
.cursor/rules/supabase-sql.mdc    supabase/**/*.sql 向け（private schema / RLS 二層 / GRANT 最小）
eslint.config.mjs                 nekonoie と同じ + eslint-config-prettier
postcss.config.mjs                postcss-preset-mantine + postcss-simple-vars（Tailwind なし）
next.config.ts                    optimizePackageImports: ['@mantine/core', '@mantine/hooks']
vitest.config.ts
tsconfig.json                     strict、paths @/* → src/*
package.json                      scripts: dev / build / start / lint / typecheck / test / test:watch / format / format:check
src/
  proxy.ts
  theme.ts
  app/
    layout.tsx                    ColorSchemeScript + MantineProvider > ModalsProvider > NuqsAdapter > children + Notifications
    globals.css                   @mantine/core/styles.css 等の import
    page.tsx                      仮の LP（タイトル + ログインボタン）。011 で置き換え
    (auth)/login/page.tsx         仮ページ。004 で置き換え
    (protected)/layout.tsx        requireUser() 相当で未ログインを弾く（proxy と二重に守る）
    (protected)/tenants/page.tsx  仮ページ（proxy の動作確認用）。005 で置き換え
  components/                     空（.gitkeep）
  lib/
    actions/result.ts             ActionResult 型（'use server' なし）
    actions/error.ts              ActionError / fail / toActionError
    actions/run.ts                runAction（unstable_rethrow）
    actions/guards.ts             requireUser（requireAdmin は 003 で profiles を作ってから追加）
    actions/error.test.ts         Zod / ActionError / 未知エラーの変換テスト
    patterns/colors.ts            v1 の Material 20 色
    supabase/createPrivilegedClient.ts   service_role。server-only
    validation/                   空（.gitkeep）
  queries/ は機能マイルストーンで追加
  types/database.ts               空の Database 型（003 で CLI 生成に置き換え）
  utils/
    auth/current.ts               getAuthUser()（cache 済み）。profiles 込みの currentUser は 004 で拡張
    supabase/server.ts            createClient()（cache でリクエスト内 1 インスタンス）
    supabase/client.ts            createBrowserClient
    supabase/proxy.ts             updateSession()
supabase/
  config.toml                     [api] schemas = ["public", "graphql_public"]（private を出さない）
  schemas/.gitkeep                003 で SQL を置く
  migrations/.gitkeep
  seed.sql                        空
docs/plans/002-foundation/README.md（本ファイル。実装ログを末尾に追記）
```

---

## 5. 手順

### Step 1: Next.js の雛形

`create-next-app` は `.tmp/` があるディレクトリを「空でない」と判定して失敗するため、scratchpad に生成してからコピーする。

```bash
npx create-next-app@latest assift-v2-scaffold --ts --app --src-dir --eslint --no-tailwind \
  --import-alias "@/*" --use-npm --turbopack --skip-install
rsync -a --exclude .git assift-v2-scaffold/ /Users/kazuma.yamashita/work/dev/assift-v2/
```

生成された `src/app/page.tsx` などのサンプルは Step 9 で置き換える。`.node-version` を追加し、`package.json` に `"engines": { "node": ">=22" }` を入れる。

### Step 2: 依存パッケージ

```bash
npm i @mantine/core @mantine/hooks @mantine/notifications @mantine/modals @mantine/dates \
  @tabler/icons-react @supabase/supabase-js @supabase/ssr nuqs zod dayjs server-only
npm i -D supabase vitest prettier eslint-config-prettier postcss-preset-mantine postcss-simple-vars
```

- `@mantine/dates` は shifts の開始日入力（007）で使うが、Provider 配線の都合で今入れる
- `uuid`（uuid v5）は 005 で追加する
- scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

### Step 3: Mantine の配線

- `postcss.config.mjs`: nekonoie と同じ（Tailwind の行を除く）
- `next.config.ts`: `experimental.optimizePackageImports: ['@mantine/core', '@mantine/hooks']`
- `src/theme.ts`

```ts
import { createTheme } from '@mantine/core'
import { PATTERN_COLORS } from '@/lib/patterns/colors'

export const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'sm',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif',
  other: { patternColors: PATTERN_COLORS },
})
```

- `src/app/layout.tsx`

```tsx
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/dates/styles.css'
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import type { Metadata } from 'next'
import { theme } from '@/theme'

export const metadata: Metadata = { title: 'assift', description: 'スマホで簡単シフト表作成' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <ModalsProvider>
            <NuqsAdapter>
              {children}
              <Notifications position="top-right" />
            </NuqsAdapter>
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  )
}
```

### Step 4: Supabase ローカル

```bash
npx supabase init          # supabase/config.toml を生成
npx supabase start         # Docker で起動。出力の URL / publishable key / secret key を .env.local に転記
npx supabase db schema declarative --help   # 宣言的スキーマのコマンドが使えることを確認
```

`config.toml` の変更点

- `[api] schemas = ["public", "graphql_public"]`（`private` を出さない）
- `[auth] site_url = "http://localhost:3000"`、`additional_redirect_urls = ["http://localhost:3000/auth/callback"]`（004 で使う）
- `[db.migrations] schema_paths` は使わない（テンプレート準拠）

`.gitignore` に `supabase/.temp/` を追加。`.env.example` は 3.4 の 4 変数。

### Step 5: Supabase クライアント

`src/utils/supabase/server.ts`

```ts
import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export const createClient = cache(async () => {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Component からの呼び出しでは set できない。proxy が更新するので無視
          }
        },
      },
    }
  )
})
```

- `client.ts`: `createBrowserClient<Database>(url, publishableKey)`。Realtime 等が必要になるまで使わない
- `lib/supabase/createPrivilegedClient.ts`: `createClient<Database>(url, SUPABASE_SECRET_KEY, { auth: { persistSession: false } })`。`server-only`。service_role の入口はここだけ
- `types/database.ts`: 003 で `npx supabase gen types typescript --local` に置き換えるまでは `export type Database = Record<string, never>` 相当の仮定義

### Step 6: proxy（旧 middleware）

`src/utils/supabase/proxy.ts` の `updateSession(request)`

1. `createServerClient` を request / response の cookie で作る
2. `supabase.auth.getClaims()` でセッションを検証
3. 判定
   - 保護パス（`/tenants`, `/account` 配下、`/api/tenants` 配下）に未ログイン → `/login?next=<pathname>` へ redirect
   - `/login`, `/signup` にログイン済み → `/tenants` へ redirect
   - それ以外は素通し（`/`, `/terms`, `/privacy`, `/law`, `/releases`, `/share/*`, `/auth/*`, `/password/*`）
4. cookie を更新した response を返す

`src/proxy.ts`

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf)$).*)'],
}
```

`(protected)/layout.tsx` でも `getAuthUser()` が null なら `redirect('/login')` して二重に守る。

### Step 7: Server Actions の共通部品

| ファイル | 内容 |
| --- | --- |
| `result.ts` | `type ActionResult<T = undefined> = { ok: true; data: T } \| { ok: false; error: string }`。`'use server'` を付けない |
| `error.ts` | `class ActionError extends Error`。`fail(message): never`。`toActionError(e)`: ZodError は `issues[0].message`、ActionError は message、それ以外は「処理に失敗しました」 |
| `run.ts` | `runAction(fn)`: try / catch。catch 内で `unstable_rethrow(e)` してから `{ ok: false, error: toActionError(e) }` |
| `guards.ts` | `requireUser()`: `createClient().auth.getUser()` が null なら `throw new ActionError('ログインが必要です')` |

Zod のエラーメッセージは日本語で書く前提（`z.string().min(1, '店舗名は入力必須です')` のように各スキーマで指定）。

### Step 8: Vitest

`vitest.config.ts`

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
})
```

最初のテストは `src/lib/actions/error.test.ts`（`toActionError` の 3 分岐）。

### Step 9: 仮ページ

- `/`: `Container` + `Title` + `Button component={Link} href="/login"`。Mantine が効いていることの確認用
- `/login`: 「ログイン画面は 004 で実装」のテキストのみ
- `/tenants`: 「店舗一覧は 005 で実装」のテキストのみ。未ログインで開けないことを確認

### Step 10: エージェント用ファイルと README

`AGENTS.md` の構成（テンプレートの「規約」を転記し、次を足す）

1. プロジェクト概要（assift v2。v1 分析と 001 プランへのリンク）
2. スタックと Next 16 の読み替え（`proxy.ts`、`params` は Promise、`LayoutProps` / `PageProps` 型）
3. ディレクトリ規約（テンプレート §ディレクトリ）
4. コード規約（`useTransition` + `loading`、import 1 行、props 1 行）
5. UI 規約（Mantine のみ、Tailwind 禁止、Server Component では `TableThead` 形式、色は theme に集約）
6. Server Actions の流れ（`runAction` → guard → Zod → `createClient()` → `revalidatePath`。service_role は `createPrivilegedClient` のみ）
7. nuqs の使い方
8. Supabase（スキーマの正は `supabase/schemas/`、sync → 確認 → `migration up`、`db diff` は使わない、RLS 二層、型は CLI 生成）
9. テスト（純関数は `*.test.ts`、`server-only` alias）
10. Prettier 設定
11. プランと実装ログの置き場（`docs/plans/`）

`next dev` が自動追記する `<!-- BEGIN:nextjs-agent-rules -->` ブロックはそのままコミットする。

`.cursor/rules/supabase-sql.mdc`（`globs: supabase/**/*.sql`）: private schema、GRANT は authenticated のみ、RESTRICTIVE + PERMISSIVE の二層、`(select private.fn())` で initPlan 化。

`README.md`: セットアップ手順（Node 22、`npm i`、`npx supabase start`、`.env.local`、`npm run dev`）とスクリプト一覧。

### Step 11: 検証とコミット

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build
npx supabase status
npm run dev   # / と /tenants → /login を手で確認
```

すべて通ったら実装ログを本ファイル末尾に追記し、ユーザー確認のうえでコミットする。

---

## 6. スコープ外（次のマイルストーンで扱う）

- DB スキーマ、RLS、`gen types`（003）
- ログイン / サインアップ画面、`auth/callback`、`currentUser()` の profiles 対応、`requireAdmin`（004）
- Vercel プロジェクト作成と本番環境変数（013）

---

## 7. 実装ログ（2026-09-17）

### 実施内容

- Node 22.23.2 を nodenv で追加（`node-build` 定義を更新して最新の 22 系を取得）。`.node-version` = `22.23.2`、`engines.node >= 22`
- `create-next-app@16.3.5` を scratchpad に生成して rsync（`.tmp/` があると直接生成できないため）。Tailwind なし、React Compiler なし
- 依存: next 16.3.5 / react 19.2.8 / @mantine/* 9.6.1 / @supabase/ssr 0.12.7 / supabase-js 2.116 / supabase CLI 2.117 / nuqs 2.10 / zod 4.6 / vitest 5.0 / prettier 3.9 / eslint 9.39 + eslint-config-prettier 10
- Step 3〜10 のファイルをプラン通りに作成。差分は次の「プランからの変更点」
- `npx supabase init` → `config.toml` の `site_url` / `additional_redirect_urls` を localhost:3000 に変更 → `npx supabase start`。`.env.local` を `supabase status` の値で作成（`V1_UUID_NAMESPACE` はランダムな UUID を生成）
- 宣言的スキーマのコマンド `npx supabase db schema declarative {sync,generate}` が CLI 2.117 で利用できることを確認

### プランからの変更点

| 項目 | 変更 | 理由 |
| --- | --- | --- |
| Supabase のポート | **既定のまま**（API 54321 / DB 54322 / Studio 54323 / Mailpit 54324）。作業中は隣の `nekonoie` のローカル Supabase と衝突したため一時的に +100 にしたが、ユーザーの指示で nekonoie 側を停止し既定に戻した | ローカル Supabase は同時に 1 プロジェクトだけ起動する運用 |
| `vitest.config.ts` → `vitest.config.mts` | 拡張子を変更 | package.json が CJS 扱いのため Vite が ESM 構文の警告を出した |
| `typecheck` スクリプト | `next typegen && tsc --noEmit` | `LayoutProps<'/'>` などの生成型を先に作らないと tsc が通らない |
| `src/components/LinkButton.tsx` を追加 | 関数を渡す部分だけ Client に切り出し | Server Component から `<Button component={Link}>` は「Functions cannot be passed directly to Client Components」でビルドエラー。Mantine Help Center の指針は「関数を渡すファイルを `'use client'` にする」。page 全体を Client にしないための適用例としてラッパーを置き、AGENTS.md に規約として追記 |
| `src/utils/supabase/env.ts` を追加 | 公開 env の取得を 1 か所に | server / client / proxy の 3 か所で同じ検証を書かないため |
| `.prettierignore` | `docs/`, `.tmp/`, `supabase/migrations/`, `src/types/database.ts` を除外 | 設計ドキュメントの表が整形で書き換わるのを避ける。生成物は整形しない |

### 検証結果

| 項目 | 結果 |
| --- | --- |
| `npm run format:check` | OK |
| `npm run lint` | OK（警告なし） |
| `npm run typecheck` | OK（route types 生成 → tsc） |
| `npm test` | 1 file / 4 tests passed（`lib/actions/error.test.ts`） |
| `npm run build` | OK。`/`, `/login` は static、`/tenants` は dynamic、Proxy 有効 |
| `npx supabase status` | 起動中（Postgres 17.6） |
| `npm start` で手動確認 | `/` 200（Mantine のクラスが出力される）、`/login` 200、`/tenants` → 307 `/login?next=%2Ftenants`、`/tenants/xyz/shifts` → 307 `/login?next=%2Ftenants%2Fxyz%2Fshifts` |

### 申し送り

- `AGENTS.md` 先頭の `nextjs-agent-rules` ブロックは `next dev` が再生成する。そのままコミットする
- `.env.local` はコミットしない（`.gitignore` 済み）。別マシンでは README の手順で作る
- `supabase/migrations/` は空。003 で `db schema declarative sync` の出力を置く

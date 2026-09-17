<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# assift v2

アルバイトのシフト表作成 SaaS「assift」の作り直し（Rails v1 → Next.js + Supabase）。

- v1 の分析: `docs/v1-analysis.md`
- Phase 1 全体設計（スキーマ・RLS・URL・移行）: `docs/plans/001-phase1-architecture/README.md`
- マイルストーンごとのプランと実装ログ: `docs/plans/00N-<slug>/README.md`。実装前にプランを書き、実装後に同じファイルへログを追記する

## スタック

| 層             | 選択                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------- |
| アプリ         | Next.js 16 (App Router, Turbopack) / React 19 / TypeScript strict                            |
| UI             | Mantine 9（`@mantine/core` `hooks` `notifications` `modals` `dates`）/ `@tabler/icons-react` |
| DB / Auth      | Supabase Postgres + Auth + RLS（`@supabase/ssr`）                                            |
| URL 状態       | nuqs                                                                                         |
| バリデーション | Zod 4                                                                                        |
| 日付           | dayjs（`Asia/Tokyo`。カレンダー日付は `YYYY-MM-DD` 文字列で扱う）                            |
| テスト         | Vitest（純関数のユニットテスト）/ pgTAP（RLS）                                               |
| 品質           | ESLint (`eslint-config-next`) / Prettier                                                     |

### Next 16 の読み替え

- `middleware.ts` は **`src/proxy.ts`**。ロジックは `src/utils/supabase/proxy.ts` に置く
- `params` / `searchParams` は Promise。`await` してから使う
- layout / page の props 型は生成される `LayoutProps<'/path'>` / `PageProps<'/path'>` を使う。`npm run typecheck` が `next typegen` を先に走らせる
- 実装前に `node_modules/next/dist/docs/` の該当ガイドを読む

## ディレクトリ

```
src/
  proxy.ts                        cookie 更新 + 保護ルートの未ログイン redirect
  theme.ts                        createTheme（色・半径・フォントはここに集約）
  app/
    layout.tsx                    MantineProvider > ModalsProvider > NuqsAdapter > children + Notifications
    (public)/                     LP、規約、share/[code] など認証不要
    (auth)/                       login, signup, password/*
    (protected)/                  layout で未ログインを弾く
      tenants/[tenantId]/
        <feature>/
          page.tsx                Server。searchParams → queries → Client へ props
          actions.ts              書き込みがあるとき。'use server'
          searchParams.ts         URL 状態があるときだけ（nuqs parser + createLoader）
          _components/            このルート専用 Client UI
          _lib/                   このルート専用ロジック（Vitest 対象）
    api/                          Route Handler（PDF / CSV など）
  components/                     横断 UI
  lib/
    actions/                      result / run / error / guards
    migration/v1Ids.ts            v1 の ID → uuid v5（旧 URL 解決と 012 が共有）
    tenants/                      旧 URL の書き換え・直近店舗 cookie の純関数
    queries/                      読み取り（Server から呼ぶ）
    <domain>/                     ドメインロジック（calendar, patterns, pdf, csv ...）
    supabase/createPrivilegedClient.ts   service_role の唯一の入口
    validation/                   Zod スキーマ
  types/database.ts               CLI 生成。手書きしない
  utils/
    auth/current.ts               getAuthUser / currentUser
    supabase/{server,client,proxy,env}.ts
supabase/
  config.toml
  schemas/                        宣言的スキーマ（正）
  migrations/                     sync の出力
  unmanaged/                      pg-delta が生成できない SQL。sync 後に migration へ追記する
  tests/                          RLS の pgTAP（npx supabase test db）
  seed.sql                        ローカル専用。dev@example.com / password
```

ページ専用は `_components/` / `_lib/`、横断 UI は `src/components/`、読み取りは `lib/queries/`、書き込みは各ルートの `actions.ts`。

例外: チュートリアル（`tutorial/pattern` `tutorial/staff`）は設定画面の `_components/` のフォームと `actions.ts` を import する。v1 も同じフォームを使い回しており、同じものを 2 つ持つほうが壊れやすい。

ルートをまたいで使う Action は、そのグループ直下に置く（`(protected)/actions.ts` の `logout` はヘッダーとアカウント画面の両方から呼ぶ）。

## コード規約

- submit 中は `useTransition` で button に `loading`
- import は 1 行。props はできるだけ 1 行
- 日付は `YYYY-MM-DD` の文字列で持ち回り、Date 型への変換は表示・計算の直前だけ
- 文字数上限などのドメイン定数は `lib/validation/` の Zod スキーマに集約し、UI とサーバーで共有する
- Zod のエラーメッセージは日本語で各スキーマに書く（`toActionError` が先頭 issue をそのまま表示する）

## UI 規約

- コンポーネント・レイアウト・余白は Mantine（`Stack` / `Group` / `Flex` / `SimpleGrid` など）。**Tailwind は使わない**
- 色・半径・fontSizes は `src/theme.ts` の `createTheme` に集約する。勤務パターンの 20 色は `theme.other.patternColors`
- Server Component では Mantine のドット記法不可 → `Table.Thead` ではなく `TableThead` を `@mantine/core` から import
- Mantine コンポーネントに関数を渡すファイル（`component={Link}`、`renderRoot`、callback children など）は `'use client'` にする。Server Component から渡すと「Functions cannot be passed directly to Client Components」になる（Mantine Help Center「Can I use Mantine components as server components?」の指針）。Server の page を Client にしたくないときは `src/components/LinkButton.tsx` のように関数を渡す部分だけ Client コンポーネントへ切り出す
- 通知は `@mantine/notifications`、確認ダイアログは `modals.openConfirmModal`
- sticky テーブルなど Mantine にないレイアウトだけ CSS Modules で書く

## 画面の組み立て

1. **page.tsx（Server）**: 必要なら `loadXxxSearchParams(searchParams)` → `lib/queries` で読む → Client に渡す
2. **`_components/*Client.tsx`**: 操作・フィルタ。`'use client'`
3. **actions.ts**: 書き込みがあるとき。`'use server'`。Zod + guard + `runAction`

認証必須ページは `(protected)/layout.tsx` が `getAuthUser()` で守る。テナント配下は `tenants/[tenantId]/layout.tsx` がテナントを解決する。

認可ロールは `auth.users.user_metadata` ではなくアプリ側の `profiles`（RLS 経由）を信頼する。

## Server Actions

`src/lib/actions/result.ts` に `'use server'` を付けない（付けると全 export がエンドポイントになる）。

| ファイル    | 役割                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `result.ts` | `ActionResult<T>`（client から import 可）                                                       |
| `run.ts`    | `runAction(fn)`: try/catch → `ActionFailure`。`unstable_rethrow` で redirect/notFound は再スロー |
| `error.ts`  | `ActionError` / `fail` / `toActionError`（Zod は先頭 issue の日本語）                            |
| `guards.ts` | `requireUser` / `requireAdmin` 等。失敗は `throw new ActionError(...)`                           |

引数はシリアル化可能なオブジェクトを直接渡す。Zod で parse する。`FormData` はファイルアップロードのときだけ。

```ts
// actions.ts
'use server'
export async function saveItem(input: { name: string }): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = schema.parse(input)
    await requireUser()
    const supabase = await createClient()
    // ...
    revalidatePath('/items')
  })
}
```

```ts
// client
startTransition(async () => {
  const r = await saveItem({ name })
  notifications.show({ message: r.ok ? '保存しました' : r.error, color: r.ok ? 'green' : 'red' })
})
```

流れ: `runAction` → guard → Zod → `createClient()`（anon + RLS）→ `revalidatePath`。

`service_role` は `createPrivilegedClient()` のみ。ユーザー文脈の Action では使わない。用途は公開共有ページの読み取り、ジョブ、管理操作に限る。

唯一の例外は `account/actions.ts` の `deleteAccount()`（`auth.admin.deleteUser` は service_role でしか呼べない）。渡す id は `requireUser()` の戻り値だけにし、入力から受け取らない。例外を足すときはここに追記する。

## uuid の扱い

- **`z.uuid()` と `uuid` パッケージの `validate()` は使わない。** RFC 9562 の version / variant ビットまで検査するため、seed（`22222222-…`）や pgTAP の id を弾く。Postgres の uuid 型はこれらを受けるので、アプリ側の判定も合わせる
- 形式の判定は `isUuid()`（`src/utils/uuid.ts`）、Zod は `z.guid()`
- 例外は uuid v5 の**名前空間**だけ。`v5()` は RFC 非準拠の値に例外を投げるので、`getV1UuidNamespace()`（`lib/migration/v1Ids.ts`）が `validate()` で先に弾く
- v1 の ID からの導出は `v1Uuid(table, id, namespace)` に集約する。旧 URL の解決（005）と移行スクリプト（012）が同じ関数を使う

## proxy（`src/proxy.ts`）

3 段の合成にとどめ、ロジックは `lib/tenants/` の純関数に置く。

1. v1 の店舗 URL（22 文字トークン）を新 URL へ 308
2. `updateSession()`: Supabase の cookie 更新 + 保護ルートの未ログイン redirect
3. 開いている `/tenants/<uuid>` を直近店舗の cookie に記録

- **`config.matcher` から prefetch を除外しない。** セッション cookie を書けるのは proxy だけで、除外するとトークン更新が Server Component の描画中に起き、新しい refresh token を保存できずに次の遷移でログアウトする（`enable_refresh_token_rotation = true`）
- proxy のコード内では RSC / prefetch のヘッダが剥がされていて prefetch を判別できない。先読みで困る導線は、リンク側に `prefetch={false}` を付けて塞ぐ（他店舗を指す `TenantSwitcher`、006 で作るページへのリンク）
- URL 由来の文字列で定数マップを引くときは `lookup()`（`src/utils/record.ts`）。素の添字はプロトタイプ上の値を返す

## nuqs

一覧の検索・フィルタなど、URL に残す状態があるときだけ使う。そのページに `searchParams.ts` を置き、parser と `createLoader` を Server / Client で共有する。`URLSearchParams` 直操作や `router.replace` での手書き同期はしない。

- Server: `loadXxxSearchParams(searchParams)`
- Client: `useQueryStates(parsers)`。**既定は shallow（クライアントだけ更新）**
- Server Component の再フェッチが必要なときだけ `{ shallow: false }`
- 検索入力など連続更新は `throttleMs`（目安 300）
- `NuqsAdapter` は root `layout.tsx` に 1 回だけ

```ts
// searchParams.ts
import { createLoader, parseAsInteger, parseAsString } from 'nuqs/server'

export const xxxParsers = {
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
}
export const loadXxxSearchParams = createLoader(xxxParsers)
```

## Supabase

### クライアント

- Server / Action / Route: `src/utils/supabase/server.ts`（`cache()` でリクエスト内 1 インスタンス）
- Browser: `client.ts`（Realtime 等が必要なときだけ）
- proxy: `src/utils/supabase/proxy.ts`（cookie 更新 + 保護ルートの未ログイン redirect）
- 環境変数: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`（`.env.example` 参照）

### スキーマ

正は `supabase/schemas/` の SQL。Studio やライブ DB を正にしない。拡張はツリーに宣言する。

CLI は `devDependencies` の `supabase` を `npx supabase` で使う（未ピンの npx に頼らない）。

```bash
npx supabase start
# schemas/ に SQL を書く
rm -f supabase/migrations/*.sql   # 本番へ push するまでは init_schema 1 本を作り直す（下記）
npx supabase db schema declarative sync --no-apply --name init_schema --strict-coverage
# 生成物を確認（欠けた GRANT / storage ポリシーは生成ファイルに追記してよい）
cat supabase/unmanaged/restrict_anon_grants.sql >> supabase/migrations/*_init_schema.sql
npx supabase db reset             # migration → seed を空から通す
npx supabase test db              # RLS の pgTAP
npx supabase gen types typescript --local --schema public > src/types/database.ts
```

- `db diff` は「起動中のローカル DB 対 migrations」であり `schemas/` は見ない。宣言的スキーマの差分には使わない
- `config.toml` の `schema_paths` は使わない（適用順は依存関係から決まる）
- `migrations/` は sync の出力を正にする。ゼロから手書きしない。適用済みの migration は書き換えない
- 空から作り直すときだけ `npx supabase db reset`（未コミットのローカルデータは消える）
- **本番に初回 push（マイルストーン 013）するまでは migration を `init_schema` 1 本に保つ。**
  スキーマを変えたら差分を積むのではなく `migrations/` を空にして sync をやり直し、`db reset` で検証する。
  push 以降は通常どおり差分 migration を追加し、適用済みは書き換えない
- `supabase/unmanaged/` は pg-delta が生成できない SQL の置き場。sync のたびに生成 migration の末尾へ追記する。
  現在は `anon` からの REVOKE のみ（理由はファイル冒頭のコメント）。追記漏れは `npx supabase test db` で落ちる

PK は uuid（`gen_random_uuid()`）。v1 から移行する行は `uuidv5('<table>:<v1 id>', V1_UUID_NAMESPACE)` で決定的に導出する。

### RLS

常に:

1. GRANT は最小。`revoke all ... from anon, authenticated` してから `authenticated` に必要な DML だけ付ける
   （既定権限は TRUNCATE まで付けてしまう。TRUNCATE は RLS を通らない）。`anon` にポリシーを書かない
2. `ENABLE ROW LEVEL SECURITY`
3. 認可ヘルパは**引数なしの集合関数 + `IN`**（`tenant_id in (select private.owned_tenant_ids())`）。
   行の列を引数に渡すと行ごとに評価される
4. 認可ヘルパ・内部トリガは `private` スキーマ。`[api] schemas` に `private` を出さない。
   `authenticated` に `private` の USAGE は不要（ポリシー式は関数 OID まで解決済み）

マルチテナントなので二層にする:

5. **RESTRICTIVE** 1 本でテナント境界（`{table}_restrict_same_tenant`、`FOR ALL`）
6. **PERMISSIVE** には権限だけ。`tenant_id = ...` は書かない
7. クライアント側でも `.eq('tenant_id', ...)` を重ねる

テナント境界は `supabase/tests/rls_tenant_isolation.sql`（pgTAP）で固定する。テーブルを足したらここにも足す。

### 型

`npx supabase gen types typescript --local > src/types/database.ts` で生成してコミットする。手書きしない。jsonb は生成された `Json` のままにし、ドメイン型はアプリ層で wrap する。

### 認証（Supabase Auth）

- 認証メール（確認 / 再設定 / メール変更）のテンプレートは `supabase/templates/*.html`。`config.toml` の `[auth.email.template.*]` が参照する。文言は v1 の Devise メールを移植したもの
- メールのリンクは `{{ .ConfirmationURL }}` ではなく **`/auth/callback?token_hash={{ .TokenHash }}&type=...&next=...`** を書く。Route Handler が `verifyOtp` するので、別端末でリンクを開いても動く。Google OAuth の `code` も同じ `/auth/callback` が `exchangeCodeForSession` で受ける
- `?next=` は必ず `safeNext()`（`src/lib/auth/safeNext.ts`）を通す（open redirect 対策）
- GoTrue のエラーは `authErrorMessage()`（`src/lib/auth/authErrorMessage.ts`）で日本語にしてから `fail()` する。`error.message` をそのまま出さない
- 認証系の Action は `redirect()` せず `{ redirectTo }` を返し、クライアントが `router.push` する（`ActionResult` の契約を保つため）
- 再設定リンクは通常のセッションを張るだけなので、`/password/reset` は `hasRecoverySession()`（`src/lib/auth/recoveryFlow.ts` の短命 cookie）も必須にする。セッションの有無だけで通すと、盗まれた cookie から現在のパスワードなしで変更できる
- ログイン状態の判定は `getAuthUser()`（JWT）に揃える。`getUser()`（ネットワーク）は `new_email` など claims に無い値が要るときだけ使い、失敗しても `/login` へ送らない（proxy が `/tenants` へ戻すのでログアウトできなくなる）
- `?error=` / `?notice=` は文言そのものではなくキーを渡し、`lookup()`（`src/utils/record.ts`）でマップを引く。素の `map[key]` は `constructor` などプロトタイプ上の値を返してしまう
- パスワードの下限は `PASSWORD_MIN_LENGTH`（`lib/validation/auth.ts`）と `config.toml` の `minimum_password_length` の両方で 8
- `config.toml` を変えたら `npx supabase stop && npx supabase start`。ローカルのメールは Mailpit（http://127.0.0.1:54324）で見る

## テスト

- 純関数（期間計算、ペア処理、コピー、CSV 生成、Zod スキーマ）は同じディレクトリに `*.test.ts`
- `server-only` は `vitest.config.ts` で Next 同梱の空モジュールに alias 済み
- RLS は `supabase/tests/*.sql`（pgTAP）で `npx supabase test db`
- コンポーネントテスト / E2E は必要になってから足す

## スクリプト

```bash
npm run dev            # http://localhost:3000
npm run build
npm run lint
npm run typecheck      # next typegen && tsc --noEmit
npm test               # vitest run
npm run format         # prettier --write .
npm run format:check
```

Prettier: `{ "semi": false, "singleQuote": true, "tabWidth": 2, "trailingComma": "es5", "printWidth": 100 }`

## コミット

コミット・プッシュはユーザーが指示したときだけ行う。マイルストーンの実装が終わったら検証結果と実装ログをプランに追記してから確認を取る。

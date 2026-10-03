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
    (public)/                     認証不要
      share/[code]/               公開シフト表（未ログインで開く。読み取りは service_role）
    (auth)/                       login, signup, password/*
    (protected)/                  layout で未ログインを弾く
      tenants/[tenantId]/
        <feature>/
          page.tsx                Server。searchParams → queries → Client へ props
          actions.ts              書き込みがあるとき。'use server'
          searchParams.ts         URL 状態があるときだけ（nuqs parser + createLoader）
          _components/            このルート専用 Client UI
          _lib/                   このルート専用ロジック（Vitest 対象）
    api/tenants/[tenantId]/shifts/{pdf,csv}/route.ts   エクスポート（Route Handler。下記）
  components/                     横断 UI（SortableList = 上下ボタンの並べ替え一覧 など）
    restrictions/                 制約の行（説明・種類・強さの札・編集）。制約ページとスタッフの編集画面で共有（013）
    shiftTable/                   シフト表の見た目（CSS Modules / DateHeaderCell / PatternDescriptionList / cellStyle）。保護ルートと公開ページで共有
  lib/
    actions/                      result / run / error / guards
    migration/v1Ids.ts            v1 の ID → uuid v5（旧 URL 解決と 012 が共有）
    tenants/                      旧 URL の書き換え・直近店舗 cookie の純関数
    queries/                      読み取り（Server から呼ぶ）。publicShare.ts だけが service_role（下記）
    <domain>/                     ドメインロジック（calendar, patterns, shifts, pdf, csv ...）
    calendar/                     dateString（YYYY-MM-DD の道具。dayjs はここだけ）/ dateRange / today / weekdays / holidays（server-only）
    shifts/                       key（セルの Map）/ applyAssign（楽観更新。assign_shift と同じ規則）/ satisfaction（必要人数の充足）/ count（集計）/ planDefaultPatterns（デフォルト勤務パターンの行を組む純関数）/ table（エクスポートが共有する表の型）
    shares/                       expiry（公開期限。v1 の DATE_LIMIT = 6）/ code（8 文字のコード）
    export/                       request（認証 → 店舗 → 期間 → 表。PDF / CSV 共通の入口）/ filename
    csv/                          shiftCsv（純関数）/ encode（CP932 か BOM 付き UTF-8。iconv-lite）
    pdf/                          fonts（Font.register + 折り返し）/ styles / paginate / pdfCellStyle / ShiftPdfDocument
    actions/reorder.ts              reorder_positions RPC の共通ラッパ（staffs / patterns。restrictions は 013 で並べ替えをやめた）
    restrictions/                 制約の種類（kinds）/ 説明文（describe。土日祝の上限は表示期間で言い換える）/ 守れない下限の注意（warnings）/ 一覧の 1 行（rowView）
    assist/                       自動アサイン（012）。problem → model（MILP）→ solver/highs → validate（最後の門番）→ reasons → levers（効く一手の試算）→ restrictionOutcomes（守れなかった「なるべく」。013）。llm/ は指示の解釈だけ
    supabase/createPrivilegedClient.ts   service_role の唯一の入口
    validation/                   Zod スキーマ
  types/database.ts               CLI 生成。手書きしない
  utils/
    auth/current.ts               getAuthUser / currentUser
    supabase/{server,client,proxy,env}.ts
assets/fonts/                     PDF に埋め込む Noto Sans JP（public/ に置かない。下記）
supabase/
  config.toml
  schemas/                        宣言的スキーマ（正）。RPC は schemas/public/functions.sql
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
- Zod のエラーメッセージは日本語で各スキーマに書く（`toActionError` が先頭 issue をそのまま表示する）。
  **`NumberInput` の空欄（`''`）や `Select` の未選択（`null`）が届く leaf には必ず `{ error }` を付ける。**
  付け忘れると Zod 既定の英語（`Invalid input: expected number, received string`）が画面に出る。
  保険として `toActionError` は「日本語を含まないメッセージ」を `入力内容が正しくありません` に丸める

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

流れ: `runAction` → guard → Zod → `createClient()`（anon + RLS）→ `revalidatePath` / `refresh`。

書き込み後の再描画は 2 通りに分ける（007 §3.5）。

| 使うもの                                    | 対象                                                           | 理由                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `revalidatePath('/tenants/<id>', 'layout')` | 設定・店舗・アカウント                                         | その変更はシフト表など他のページの描画にも影響する                                                                                             |
| `refresh()`（`next/cache`）                 | シフト表の中で完結する書き込み（アサイン・必要人数・日付メモ） | 現在のルートだけ再描画する。`revalidatePath` は訪問済みの全ページを次回訪問時に refresh する副作用があり、1 画面で何十回も呼ぶアサインには重い |

`refresh()` を呼んだ Action の応答は「戻り値 + 現在ルートの RSC」を 1 本のストリームで返すので、`useOptimistic` の transition はその描画で終わる。

`service_role` は `createPrivilegedClient()` のみ。ユーザー文脈の Action では使わない。用途は公開共有ページの読み取り、ジョブ、管理操作に限る。

**RLS を通らない読み取りは `lib/queries/publicShare.ts` だけ**（009）。`/share/[code]` は未ログインで開くので RLS が使えず、
テナント境界はクエリ側でしか担保できない。したがってこのファイルの中では**すべてのクエリに `.eq('tenant_id', …)` を書き**、
`shifts` / `date_notes` は共有の期間（`gte` / `lte`）でしか読まない。汎用のクエリ関数にクライアントを引数で渡して使い回さない
（service_role を差し込める口を作らないほうが、多少の重複より価値が大きい）。

自動アサインの `lib/assist/load.ts` / `runs.ts` / `run.ts` は**クライアントを引数で受ける**（012 §3.4。将来ジョブ基盤へ移すとき
service_role を渡すため）。したがって `publicShare.ts` と同じく、中のクエリにはすべて `.eq('tenant_id', …)` を書く。
いまは Server Action がユーザーのクライアント（anon + RLS）を渡している。`lib/queries/` の汎用関数には渡さない。

唯一の例外は `account/actions.ts` の `deleteAccount()`（`auth.admin.deleteUser` は service_role でしか呼べない）。渡す id は `requireUser()` の戻り値だけにし、入力から受け取らない。例外を足すときはここに追記する。

## Route Handler（`src/app/api/`）

ファイルを返す GET だけを置く（現在は PDF / CSV のエクスポート。010）。書き込みは Server Action のまま。

- **`ActionResult` を返さない。** ブラウザが直接開く GET なので `notifications.show()` の出番が無い。
  未ログインは `401` + `text/plain`、見えない店舗・uuid でない id は **`notFound()`**（404。存在を漏らさない）、
  それ以外の例外はそのまま投げる（500）。`runAction` / `ActionError` は持ち込まない
- **ルート自身が認証を見る。** `app/api/` は `(protected)/layout.tsx` の外なので layout の `getAuthUser()` が掛からない。
  守りは proxy（`PROTECTED_PREFIXES` に `/api/tenants`。redirect）とルート（401）の 2 枚。
  認可の入口は 1 本にまとめる（`lib/export/request.ts` の `loadShiftExport()`）。ルートごとに書くと片方だけ抜ける
- `createPrivilegedClient()` を使わない。エクスポートはユーザー文脈なので `createClient()`（anon + RLS）
- **期間などの範囲は URL から受けず、サーバーが計算する。** エクスポートは `?start=` だけを受け、
  `dateRange()` で組み直す（戻り値は最長 31 日なので、範囲を任意に広げられない）。壊れた `?start=` は失敗にせず既定に落とす
- `Cache-Control: private, no-store` を付ける。**リンク側にキャッシュバスターを入れない**（`Date.now()` を href に
  入れるとハイドレーション不一致になる）。リンクは `next/link` ではなく素の `<a>`（Next のページではない）
- 日本語のファイル名は `Content-Disposition` に生で書けない（ヘッダは Latin-1）。RFC 5987 の
  `filename*=UTF-8''…` と ASCII の `filename=` を併記する（`lib/export/filename.ts`）
- **実行時に読むファイルは `outputFileTracingIncludes` に書く**（`next.config.ts`）。ルート glob の
  `[tenantId]` は `*` に置き換える（picomatch が文字クラスとして解釈する）。**dev では効かないので `npm run build` で確かめる**

### PDF（`lib/pdf/`）

`@react-pdf/renderer`。日本語フォントは `assets/fonts/` に同梱し、**`Font.register` に絶対パスを渡す**
（自オリジンへの `fetch` は preview の Deployment Protection で認証 HTML を掴む）。`public/` には置かない
（読むのはサーバーだけで、置くと 9.2MB が CDN から誰でも落とせる）。

- **フォントが欠けたときの症状は豆腐ではなく 500**（`fontkit.open` の ENOENT）。`.nft.json` を見るのが唯一の事前確認
- **`lineHeight: 1` を落とすと文字が切れる。** Noto Sans CJK は自然な行高が 1.448 倍あり、v1 の
  `line-height: 3mm`（= 1.0）を写し忘れると 3 行目が `…` に丸められる
- **日本語は `Font.registerHyphenationCallback` を入れないと折り返さない。** ただし 1 文字ずつ返すと
  textkit が改行位置にハイフンを挿す。**文字の間にソフトハイフンのパートを挟む**（`lib/pdf/fonts.ts`）
- **高さは border-box。** 行の高さを `border` で削ると文字の入る行数が減る。下書きの色帯は v1 と同じく絶対配置で重ねる
- 色は Mantine の外なので hex を直書きする（`lib/pdf/styles.ts` に集約し、対応する CSS 変数をコメントに書く）

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
- **本番に初回 push（マイルストーン 015。001 の 013 から 012・013 のぶん繰り下げた）するまでは migration を `init_schema` 1 本に保つ。**
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

### RPC（`supabase/schemas/public/functions.sql`）

複数行を 1 文で書き換える必要があるときだけ足す（現在は並べ替えの `reorder_positions`、シフトのアサインの `assign_shift`、
一括操作の `set_shifts_fixed` / `clear_draft_shifts`、コピーの `copy_shifts`、自動アサインを元に戻す `rollback_assist_run`）。単純な CRUD は PostgREST のまま。

一括の書き込みでも、1 文で書けるなら RPC にしない。ただし **PostgREST の UPDATE / DELETE は別テーブルの条件で絞れない**
（「在籍スタッフの行だけ」は `staffs` との join）。そこで id を URL に並べて分割するのは回避策の積み重ねになるので、RPC にする（008 §10.13）。
「既にある行は触らない」INSERT は **`upsert(rows, { onConflict: '…', ignoreDuplicates: true })`**（= `on conflict do nothing`）で足りる。
行の組み立てに app だけが持つ知識（祝日など）が要るものは TS の純関数（`lib/shifts/planDefaultPatterns`）に置いて Vitest で固定し、
DB の行から DB の行を作るだけのもの（コピー）は `insert ... select` の RPC にする。

**UPDATE / DELETE の RLS 違反は例外ではなく「0 行」**になる。書き込んだあとに 0 行の理由を切り分けるのではなく、
テナント配下の Action は先に `requireTenant()` で店舗を確かめ、以降の 0 行は「対象が無かった」の一意味にする（下記）。

**読み取りは `max_rows`（`config.toml` で 1000。Supabase クラウドの既定も同じ）で黙って切られる。**
行数が「スタッフ数 × 日数」のように増えうるクエリは **`pageAll()`（`lib/queries/pageAll.ts`）を通す**（例: `listShifts`）。
1 ページ目だけ `count: 'exact'` で総件数を受け取り、残りを `.range()` で並行に読む。呼び出し側は `.order()` を付けてページの境界を安定させる。
切られても例外は出ないので、**気付けるのは件数を数えたときだけ**（シフト表が歯抜けになって初めて分かる、という壊れ方をする）。

`.in('…', ids)` のような絞り込みは URL に載る。100 件で約 3.8KB、200 件を超えるとゲートウェイの上限に触れる。
勤務パターン id のように高々 20 件程度のものは載せてよいが、スタッフ id のように増えるものは載せず、RPC で SQL 側に絞り込みを置く。

テナント配下の Action は `requireUser()` の直後に **`requireTenant(tenantId)`**（`lib/actions/guards.ts`）を呼ぶ。
先に店舗の可視性を確かめておけば、以降の「0 行」は「対象が無かった」の一意味になり、書き込んだあとに理由を切り分ける分岐が要らない。
**RPC が先頭で `tenant not found` を投げる場合はそちらに任せ、TS 側では呼ばない**（`set_shifts_fixed` / `clear_draft_shifts` / `copy_shifts`。往復を 1 回にする）。

`assign_shift` は「既存削除 → ペアの翌日を処理 → 作成 → ペアを翌日に上書き」を 1 トランザクションで行う（007 §3.2）。
分けると「本体は消えたがペアは残る」が起きる。**引数に null を渡す必要があるものは `default null` にする**:
`supabase gen types` は既定値の無い引数を必須の非 null（`p_x: string`）で出すので、省略可能にしないと null を渡せない。

- **`security invoker`** にする。テーブルの RLS がそのまま効き、他テナントの行は更新対象から外れる
- 「何行更新したか」を `get diagnostics` で数え、期待と違えば `raise exception`（= ロールバック）。
  RLS は権限違反ではなく「0 行」になるので、これが無いと黙って一部だけ書き換わる
- 動的 SQL のテーブル名は **アプリからは受け取らない**。Server Action が定数で渡し、SQL 側でもホワイトリストする
- `public` の関数は Supabase の既定権限で `anon` にも EXECUTE が付く。
  `revoke ... from public` を書いても生成 migration には `GRANT ... TO anon` が残るので、
  `unmanaged/restrict_anon_grants.sql` の `REVOKE ALL ON ALL FUNCTIONS` で外す（sync のたびに追記する）
- pgTAP に「自テナントは通る / 他テナントは例外 / anon は 42501」を足す

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
- **日付の検証は `isDateString()`（`lib/calendar/dateString.ts`）を使う。** dayjs は存在しない日付を黙って繰り上げる（`2026-02-30` → 3/2、`2026-13-01` → 2027/1/1）ので、`dayjs(v).isValid()` では弾けない
- 祝日（`@holiday-jp/holiday_jp`）は **`lib/calendar/holidays.ts`（`server-only`）だけ**で使う。データが 1.4MB あるのでクライアントに送らず、Server が期間分の日付配列にして渡す
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
npm run assist:eval    # 自動アサインの評価（012 §6.3。手動。LLM を使う評価は AI_GATEWAY_API_KEY が要る）
```

Prettier: `{ "semi": false, "singleQuote": true, "tabWidth": 2, "trailingComma": "es5", "printWidth": 100 }`

## コミット

コミット・プッシュはユーザーが指示したときだけ行う。マイルストーンの実装が終わったら検証結果と実装ログをプランに追記してから確認を取る。

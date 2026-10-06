# 005: 店舗・チュートリアル

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §4.1 / §4.2 / §4.6）のマイルストーン 005。
店舗（tenant）の作成・切替・編集・削除、v1 の店舗 URL（22 文字トークン）から新 URL への 308 リダイレクト、
ログイン後の共通枠（AppShell）、チュートリアル（intro → 勤務パターン → スタッフ → 完了）を実装する。

004 の申し送りにあった「`/tenants` の仮ページと `/account` の導線を AppShell に置き換える」もここで行う。

---

## 1. 目的と完了条件

### 目的

- ログイン直後に「直近の店舗 → 店舗なしなら作成画面」へ着地し、店舗を作ってチュートリアルを一巡できる
- ヘッダーから店舗の切替・追加、設定、アカウント、ログアウトに行ける（v1 の navbar 相当。モバイルは Burger）
- 店舗情報（名前・シフト表の作成周期・週の始まり）を編集・削除できる
- v1 の店舗 URL を uuid v5 で解決し、クエリも新形式に書き換えて 308 で新 URL へ送る
- 006（設定）/ 007（シフト表）が「テナント配下のページを 1 枚足すだけ」で済むよう、`[tenantId]/layout.tsx` と `lib/queries/tenants.ts` を固める

### 完了条件

- 新規ユーザー: ログイン → `/tenants` → `/tenants/new` → 作成 → `/tenants/<id>` → `tutorial/intro` → 勤務パターン 1 件 → スタッフ 1 件 → `tutorial/complete` → 「シフト表を作成する」→ `shifts`（仮ページ）
- seed の店舗（パターン 6 / スタッフ 8）はチュートリアル完了扱いで、`/tenants` から直接 `shifts` に着地する
- ヘッダーの店舗メニューで別店舗に切り替えられ、そのあと `/tenants` を開くと切り替えた店舗に戻る（直近店舗の記憶）
- `settings/general` で店舗情報を更新でき、削除は確認モーダル → `/tenants` へ（最後の店舗を消すと `/tenants/new` へ）
- `V1_UUID_NAMESPACE` を設定した状態で `GET /tenants/<22 文字トークン>/shifts?start_date=2026-10-01` が `308 /tenants/<uuid>/shifts?start=2026-10-01`
- 他人の店舗・存在しない uuid・uuid でもトークンでもない文字列は 404（存在を漏らさない）
- スマホ幅（390px）でヘッダーが崩れず、Burger からメニューが開く
- `npm run format:check` / `lint` / `typecheck` / `test` / `build` が通る。スキーマ変更はないので `npx supabase test db` は 22 件のまま PASS

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| Next 16.3.5 の proxy | **Node.js ランタイム既定**（Edge ではない）。`NextResponse.redirect(url, 308)` で永続リダイレクトを返せる。`request.nextUrl` にパスとクエリの両方がある |
| layout が知れる情報 | `params` だけ。**配下のパスやクエリは知れない**（`docs/.../layout.md` Caveats）。旧 URL のクエリ書き換えは layout ではできない |
| cookie の書き込み | Server Component の描画中は不可。**Server Action / Route Handler / proxy** でのみ `set` できる |
| proxy と prefetch | `Link` の prefetch も RSC リクエストとして proxy を通る。**proxy のコード内では `rsc` / `next-router-prefetch` ヘッダが `request.headers` から剥がされている**ので、コードで prefetch を見分けられない。見分けられるのは `config.matcher` の `has` / `missing` だけ（`proxy.md`「RSC requests and rewrites」と matcher の例） |
| `notFound()` を layout で投げたとき | その layout 自身の `not-found.tsx` では受けられず、親の境界（= `src/app/not-found.tsx`）が描画される |
| `redirect()` / `permanentRedirect()` | Server Component からは 307 / 308。001 の「301」は Next の慣例では 308 になる（GET では同義） |
| `useSelectedLayoutSegment()` | layout 直下の 1 段だけを返す Client hook。チュートリアルのステップ表示に使える。`cacheComponents` は無効なので Suspense 不要 |
| `LayoutProps<'/tenants/[tenantId]'>` 等 | `next typegen` で生成される（`npm run typecheck` が先に走らせる） |
| Mantine 9.6 | `AppShell` / `AppShellHeader` / `AppShellNavbar` / `AppShellMain` / `Burger` / `Menu` / `NavLink` / `Stepper` / `StepperStep` を静的 export で確認。`navbar.collapsed: { desktop: true, mobile: !opened }` でモバイル専用ナビになる |
| 生成型 | `Constants.public.Enums.shift_cycle` が `as const` の配列で出ている → `z.enum()` にそのまま渡せる |
| `tenants` のスキーマ | `owner_id default auth.uid()`、`tenants_owner_all`（owner_id = auth.uid()）。INSERT に owner_id を渡さなくてよい（003 §3.4） |
| `staff_patterns` | `(tenant_id, staff_id, pattern_id)`、複合 FK。INSERT には `tenant_id` が必須 |
| `uuid` パッケージ | 14.0.2。依存 0、型同梱、`v5(name, namespace)` は同期。`node_modules` には入っていない（推移的にも無い） |
| uuid 形式の判定 | **`z.uuid()` と `uuid` の `validate()` は RFC 9562 の version / variant ビットまで検査する**ため、seed の `22222222-2222-2222-2222-222222222222`（variant が `2`）を弾く（Zod 4.6.5 で実測）。Postgres は任意の hex を uuid として受けるので、アプリ側は `z.guid()` と緩い正規表現（8-4-4-4-12 の hex）に揃える |
| v1 のトークン | `SecureRandom.urlsafe_base64`（16 バイト）= **22 文字の `[A-Za-z0-9_-]`**。uuid の形式と重ならない |
| v1 の直近店舗 | cookie `current_tenant`（7 日）。`/tenants` は cookie の店舗 → 無ければ `@tenants.last`（作成順の最後）→ 店舗が無ければ `/tenants/new` |
| v1 の `tutorial_completed?` | `patterns.exists? && staffs.enabled.exists?`（パターン 1 件以上 かつ 在籍スタッフ 1 件以上） |
| v1 の店舗フォーム | 作成: 店舗名 + シフト表の作成周期（week の始まりは既定の日曜）。設定: + カレンダーの週の始まり。削除は confirm → `/tenants` |
| v1 の navbar | 店舗名ドロップダウン（店舗一覧 + 店舗を追加）/ 設定（店舗情報・スタッフ・勤務パターン / 自動アサイン制約）/ アカウント（メール、アカウント情報、決済情報、お問い合わせ、ログアウト）。`/tenants/new` と `/users/edit` はロゴ + ログアウトだけの簡易版 |
| uuid v5 の検証ベクタ | `uuid5(NAMESPACE_DNS, 'python.org') = 886313e1-3b8a-5372-9b90-0c9aee199e5d`、`uuid5(NAMESPACE_DNS, 'www.example.com') = 2ed6657d-e927-568b-95e1-2665a8aea6a2`（Python `uuid` で実測） |
| ブランチ | `main` は 003 まで。004 は `004-auth` に未マージ。005 は `004-auth` から `005-tenants-tutorial` を切る想定 |

---

## 3. 事前に確認したい決定

### 3.1 旧 URL の解決は layout ではなく proxy で行う（001 §4.2 からの変更）

001 は `[tenantId]/layout.tsx` で「uuid 形式でなければトークンとみなして uuid v5 → redirect」としていたが、layout は `params` しか知れない（§2）。
v1 の URL は `/tenants/<token>/shifts?start_date=…` のようにクエリも旧名なので、パス + クエリ全体を見られる **proxy** で書き換える。

- 対象: `^/tenants/([A-Za-z0-9_-]{22})(/.*)?$`。22 文字トークンだけを旧 URL とみなす。uuid 形式はそのまま通す。どちらでもない文字列も通し、layout の `notFound()` に任せる
- 書き換え（純関数 `rewriteLegacyTenantUrl(pathname, search, namespace)`、Vitest）:

| v1 | v2 |
| --- | --- |
| `/tenants/<token>` | `/tenants/<uuid>` |
| `/tenants/<token>/shifts?start_date=D` | `/tenants/<uuid>/shifts?start=D`（他のクエリは維持） |
| `/tenants/<token>/shifts.pdf?start_date=D` | `/api/tenants/<uuid>/shifts/pdf?start=D`（着地は 010 まで 404） |
| `/tenants/<token>/shifts.csv?…` | `/api/tenants/<uuid>/shifts/csv?…` |
| `/tenants/<token>/<その他>` | `/tenants/<uuid>/<その他>`（`settings/staff_groups` など無いものは 404） |

- 順序: **旧 URL の 308 → セッション更新と未ログイン redirect → 直近店舗の記録**。未ログインでも先に新 URL へ送るので、`/login?next=` には新 URL が入る
- ステータスは 308（`permanentRedirect` と同じ。001 の「301」は Next では 308 に読み替える）。308 はブラウザに永続キャッシュされるので、**本番の namespace は一度決めたら変えない**前提。ローカルで namespace を変えて試すときはキャッシュに注意
- 遷移先は `request.nextUrl.clone()` に `pathname` / `search` を代入して作る（文字列連結で `Location` を組まない）。同一オリジンしか指せないので open redirect にならない
- `V1_UUID_NAMESPACE` が未設定または uuid 形式でないときは書き換えを行わない（トークン URL はそのまま layout で 404）。起動時に一度だけ警告を出す。013 のチェックリストに「本番の env に必ず入れる」を足す

### 3.2 uuid v5 は `uuid` パッケージを使う（初稿の「自前実装」を撤回）

初稿は「30 行で書けるので依存を足さない」としていたが、レビューで見直した。

- 導出の正しさは **012 の全テーブルの主キーと旧 URL 互換の土台**で、間違うと移行後に静かに全部ずれる。ここは標準実装に寄せる場所であって、行数の少なさで判断する場所ではない
- `uuid` は依存 0・型同梱・ESM / CJS 両対応で、`v5()` は**同期**。自前案の Web Crypto は非同期なので、URL 書き換えの純関数まで async になっていた
- uuid 形式の判定には `uuid` の `validate()` を**使わない**。RFC のビットまで見るので seed の id を弾く（§2）。`src/utils/uuid.ts` に緩い正規表現の `isUuid()` を置き、Zod 側は `z.guid()` を使う。Postgres が受ける形式に揃えるのが正しく、RLS があるので緩くても認可は崩れない

`npm i uuid` を足し、`lib/migration/v1Ids.ts` から `v5` を使う。§2 の検証ベクタ 2 件は「ライブラリの使い方（引数の順・namespace の形）を間違えていない」ことの確認としてテストに残す。

**v1 の ID を名前にする規約（`'tenants:' + token`、他テーブルは `'<table>:' + id`）と namespace の読み取りは `lib/tenants/legacyUrl.ts` ではなく `src/lib/migration/v1Ids.ts` に置き**、旧 URL 解決（005）と 012 のインポートスクリプトの両方がそこを import する。導出が一致することの保証はライブラリではなくこの共有にある。

### 3.3 直近店舗は proxy が cookie に記録し、`/tenants` が一覧と突き合わせる

> **実装で覆った（§10.4）**: 本節の「`config.matcher` の `missing` で prefetch を proxy から外す」は**採用していない**。
> セッション cookie を書けるのは proxy だけで、除外するとトークン更新を保存できずログアウトを招く。
> 実装は「proxy は全リクエストで走らせ、他の店舗を指すリンク（`TenantSwitcher`）に `prefetch={false}` を付ける」。

Server Component は cookie を書けない（§2）ので、v1 の `current_tenant` 相当は proxy で記録する。

- proxy: パスが `^/tenants/(<uuid>)(/|$)` に一致し、cookie の値と違うときだけ `assift-current-tenant=<uuid>` を set（httpOnly / sameSite=lax / 本番は secure / **30 日**）。v1 は 7 日だったが、1 週間ぶりに開いた人が別店舗に着地する理由が無いので延ばす
- proxy は「そのユーザーの店舗か」を判定しない（DB を見ない）。**`/tenants/page.tsx` が `listTenants()`（RLS で自分の店舗だけ）と突き合わせ**、cookie の id が一覧に無ければ最新（作成順の末尾 = v1 の `@tenants.last`）に落とす。店舗が 0 件なら `/tenants/new`
- `listTenants()` は `created_at asc`（v1 のメニュー順）。切替メニューの表示順とフォールバックの「末尾」で同じ配列を使う
- `deleteTenant` は成功時に cookie を消す（Server Action なので書ける）。消し忘れても上の突き合わせで最新に落ちる
- cookie の値は uuid 形式を検証してから使う
- **prefetch を除外する。** 切替メニューを開くと店舗一覧の `Link` がまとめて prefetch され、それも `/tenants/<uuid>` への RSC リクエストとして proxy を通る。そのまま記録すると「開いてもいない店舗」が直近になり、ロゴを押すと別の店舗に着地する。proxy のコード内では prefetch ヘッダが見えない（§2）ので、**`config.matcher` の `missing` に `next-router-prefetch` と `purpose: prefetch` を置き、prefetch リクエストでは proxy 自体を走らせない**（Next ドキュメントの定型）。prefetch でセッション更新と未ログイン redirect が走らなくなるが、`(protected)/layout.tsx` が二重に守っているので問題ない。実装時に `curl -H 'RSC: 1' -H 'Next-Router-Prefetch: 1'` で cookie が付かないことを確認する
- 上の除外が期待どおり動かない場合の代替: proxy での記録をやめ、`TenantSwitcher` の選択と `createTenant` の Server Action で cookie を書く（URL 直打ちでは更新されないが、そのときは既に目的の店舗に居る）

`/tenants` → `/tenants/<id>` → `shifts` の 2 段 redirect は v1（index → show → shifts）と同じ。`/tenants` で直接 `shifts` / `tutorial` まで判定すると `[tenantId]/page.tsx` と二重になるので、そのままにする。

### 3.4 チュートリアルの勤務パターン / スタッフ登録は「名前だけ」のフォームを 005 で入れ、006 が同じファイルを育てる

v1 のチュートリアルは `settings/patterns/_form` と `settings/staffs/_form` を埋め込み、settings のコントローラに `tutorial=true` を付けて POST していた。フルのフォーム（色・種別・デフォルト必要人数・ペア / 勤務曜日・デフォルト勤務パターン・週上限・選択可能パターン）は 006 の成果物。

選択肢:

1. **005 で名前だけのフォームを、006 の置き場（`settings/patterns/`, `settings/staffs/`）に作る**（推奨）。Zod・Action・クエリ・フォームは 006 でそのファイルに項目を足す。捨てるコードはほぼ無い
2. pattern / staff ステップの本体を 006 に送り、005 はステップ枠だけ。新規店舗が 005 の時点でチュートリアルを完了できなくなり、seed の店舗でしか動作確認できない

1 を採る。置き場は「チュートリアルは設定画面のフォームと Action を再利用する」という v1 と同じ構造にする:

| ファイル | 005 の内容 | 006 で足すもの |
| --- | --- | --- |
| `lib/validation/patterns.ts` | `PATTERN_NAME_MAX_LENGTH = 6`、`createPatternSchema = { tenantId, name }` | description / colorHex / kind / pairPatternId / defaultRequiredNums、update / sort |
| `lib/validation/staffs.ts` | `STAFF_NAME_MAX_LENGTH = 10`、`createStaffSchema = { tenantId, name }` | availableWdays / maxWorkWeek / availablePatternIds / defaultPatterns、update / retire / sort |
| `settings/patterns/actions.ts` | `createPattern`: 末尾の position で INSERT → **在籍スタッフ全員の `staff_patterns` に追加**（v1 `after_create` と同じ） | update / delete / sort |
| `settings/staffs/actions.ts` | `createStaff`: 末尾の position で INSERT → **全パターンを `staff_patterns` に追加**（v1 の新規フォームは全パターンにチェック済み） | update / retire / restore / sort |
| `settings/patterns/_components/PatternForm.tsx` | 名前 + 「登録する」。成功したら入力を空にして通知。一覧は Action の `revalidatePath` で Server が再描画するので、クライアント側に一覧の状態は持たない | 残りの項目 |
| `settings/staffs/_components/StaffForm.tsx` | 同上 | 同上 |
| `lib/queries/patterns.ts` / `staffs.ts` | `listPatterns(tenantId)`（position 順）/ `listActiveStaffs(tenantId)`（在籍のみ、position 順） | 退職者一覧など |

チュートリアルの page は `../../settings/patterns/_components/PatternForm` を import する。AGENTS.md の「`_components/` はそのルート専用」の例外として「チュートリアルは設定のフォーム・Action を再利用する（v1 と同じ）」を注記する。

`createPattern` / `createStaff` の「親を INSERT → `staff_patterns` を INSERT」は 2 回の PostgREST 呼び出しで、トランザクションではない。2 回目が失敗しても親は残り、スタッフ編集（006）で結び直せるので 005 では許容する。006 でフルのフォームが入るときに RPC（`public.create_pattern(...)`）へ寄せるかを判断する。

### 3.5 AppShell はヘッダーのみ。常設のサイドバーは置かない

シフト表（007）は横幅をすべて使うので、Mantine `AppShell` は `header` だけにし、モバイルでは `AppShell.Navbar` を `collapsed={{ desktop: true, mobile: !opened }}` で Burger から開く（Mantine の responsive の定型）。

| 部品 | 置き場 | 内容 |
| --- | --- | --- |
| `TenantShell` | `src/components/TenantShell.tsx`（Client） | 左: Burger（`hiddenFrom="sm"`）・ロゴ「assift」→ `/tenants`・`TenantSwitcher`。右（`visibleFrom="sm"`）: 設定 `Menu`（店舗情報 / スタッフ / 勤務パターン / 自動アサイン制約）・アカウント `Menu`（メール表示、アカウント情報、ログアウト）。モバイルの Navbar には同じ項目を `NavLink` で並べる |
| `TenantSwitcher` | `src/components/TenantSwitcher.tsx`（Client） | 現在の店舗名（12 文字で省略、v1 と同じ）をトリガにした `Menu`。店舗一覧（→ `/tenants/<id>`）+ 区切り + 「店舗を追加」（→ `/tenants/new`） |
| `SimpleShell` | `src/components/SimpleShell.tsx`（Client） | ロゴ + 「店舗へ戻る」（→ `/tenants`。店舗 0 件の初回は出さない）+ ログアウト。`/tenants/new` と `/account` で使う（v1 の simple navbar） |
| `SettingsNav` | `src/components/SettingsNav.tsx`（Client） | `NavLink` の縦並び 1 種類。デスクトップは左カラム、モバイルは本文の上に積む（`Flex` の direction を切り替えるだけで、モバイル専用の UI は作らない）。**→ 後に変更: モバイル（`sm` 未満）では出さない。バーガーの Navbar に同じ項目があり、積むと画面の 6 割を占めていた**。「シフト表へ」+ 基本設定 3 件 + アサイン設定 1 件。`usePathname()` で active |

- `logout` は 004 の申し送りどおり `account/actions.ts` から **`src/app/(protected)/actions.ts`** に移す（account 画面・両シェルの 3 か所から呼ぶ。AGENTS.md に「グループ共通の Action は `(protected)/actions.ts`」と追記）
- モバイルの Navbar は `usePathname()` の変化で閉じる（`NavLink` で遷移したあと開いたままにならないように）
- 店舗名を変えたときにヘッダーの表示が古いまま残らないよう、`updateTenant` は **`revalidatePath('/tenants/<id>', 'layout')`** で layout ごと再検証する（page だけだと Router Cache の layout が残る）
- 設定メニューの「スタッフ / 勤務パターン / 自動アサイン制約」のリンクは 005 で置くが、着地する page は 006（それまで 404）。placeholder は作らない
- v1 navbar の Beamer（お知らせ）・決済情報・お問い合わせ（form.run）は入れない。お問い合わせ導線は 011 で LP と合わせて決める
- 001 §4.1 の `TenantProvider`（React Context）は作らない。Client 側で店舗 id が要るときは `useParams()`、店舗名などはシェルに props で渡す。007 で必要になったら足す

### 3.6 `[tenantId]/layout.tsx` は tenant を RLS 経由で 1 行読み、無ければ `notFound()`

- `tenantId` が uuid 形式（`isUuid()`、緩い判定）でなければクエリせずに `notFound()`（Postgres の `22P02 invalid input syntax for type uuid` を避ける）
- `getTenant(tenantId)` は `.from('tenants').select('*').eq('id', tenantId).maybeSingle()`。RLS で自分の店舗しか返らないので、他人の店舗も存在しない uuid も同じ 404 になる（存在を漏らさない）
- `getTenant` は React `cache()` で包み、layout / `generateMetadata` / page が 1 リクエストで 1 回だけ読む
- `generateMetadata`: title に店舗名を入れる（v1 は `assift | 店舗名`。root の template `%s | assift` と組み合わせ、配下ページは `店舗情報 | 店舗名` のようになる。実装時に出力を確認する）
- layout は `listTenants()` も読み、`TenantShell` に渡す（切替メニュー用）
- `src/app/not-found.tsx` を Mantine で作る（「ページが見つかりません」+ `/tenants` へのリンク）。layout の `notFound()` はここに落ちる（§2）

### 3.7 `[tenantId]/page.tsx` の分岐と `tutorial/complete` のガード

- `getTutorialStatus(tenantId)` = `{ hasPattern, hasActiveStaff }`（それぞれ `select('id').limit(1)`）。両方 true なら `redirect('/tenants/<id>/shifts')`、でなければ `redirect('/tenants/<id>/tutorial/intro')`。**`redirect()` には常に `/` から始まる絶対パスを渡す**（`redirect('shifts')` のような相対参照は `Location` ヘッダで `/tenants/shifts` に解決されうる）
- 各ページの `metadata.title`: `/tenants/new` は「店舗を作成」、`settings/general` は「店舗情報」、`tutorial/*` は「初期設定」、`shifts` は「シフト表」
- `tutorial/complete` は v1 では URL 直打ちで開けて「シフト表を作成する」を押すと intro に戻される。v2 では **未完了なら足りないステップ（pattern → staff の順）へ redirect** する。3 行で済み、ループを防げる

### 3.8 `/tenants/new` の文言は「初回だけ歓迎」

v1 は常に「assift へようこそ / まず最初にあなたの店舗を作成しましょう。」を出し、店舗があるときだけ「キャンセル」を足す。
v2 は店舗 0 件のときはその文言、1 件以上のときは見出しを「店舗を追加」にしてキャンセル（→ `/tenants`）を出す。フォームは共通（店舗名 + シフト表の作成周期。週の始まりは設定画面で変える = v1 と同じ）。

### 3.9 `shifts/page.tsx` は仮ページ

`[tenantId]/page.tsx` と `tutorial/complete` の着地先なので 005 で作る。店舗名と「シフト表はマイルストーン 007 で実装します」だけ。007 で置き換える。

---

## 4. 成果物

```
src/
  proxy.ts                                旧 URL 308 → updateSession → 直近店舗 cookie の 3 段に組み替え
  utils/
    uuid.ts (+ .test.ts)                  isUuid()（8-4-4-4-12 の hex。RFC のビットは見ない）
  lib/
    migration/
      v1Ids.ts (+ .test.ts)               v1Uuid(table, id)（uuid の v5 + 名前の規約）/ getV1UuidNamespace()。012 も使う
    tenants/
      legacyUrl.ts (+ .test.ts)           isV1Token / rewriteLegacyTenantUrl / legacyTenantRedirect(NextRequest)
      currentTenant.ts (+ .test.ts)       cookie 名・期間、rememberCurrentTenant(req, res)、pickTenantToOpen(tenants, cookieId)
    calendar/
      shiftCycle.ts                       SHIFT_CYCLES（Constants 由来）、SHIFT_CYCLE_LABELS（1ヶ月ごと / 半月ごと / 2週間ごと / 1週間ごと）
      weekdays.ts                         WEEKDAY_LABELS（日〜土）。006 / 007 でも使う
    validation/
      tenants.ts (+ .test.ts)             TENANT_NAME_MAX_LENGTH = 20、createTenantSchema / updateTenantSchema / tenantIdSchema（z.guid()）
      patterns.ts (+ .test.ts)            PATTERN_NAME_MAX_LENGTH = 6、createPatternSchema（3.4）
      staffs.ts (+ .test.ts)              STAFF_NAME_MAX_LENGTH = 10、createStaffSchema（3.4）
    queries/
      tenants.ts                          listTenants()（created_at asc）/ getTenant(id)（cache）/ getTutorialStatus(id)
      patterns.ts                         listPatterns(tenantId)
      staffs.ts                           listActiveStaffs(tenantId)
      positions.ts                        nextPosition(table, tenantId)（patterns / staffs の末尾 position。006 の並べ替えでも使う）
  components/
    TenantShell.tsx  TenantSwitcher.tsx  SimpleShell.tsx  SettingsNav.tsx       （3.5）
  app/
    not-found.tsx                         404（3.6）
    (protected)/
      actions.ts                          logout（account/actions.ts から移動）
      account/page.tsx                    SimpleShell で包む（中身は 004 のまま）
      tenants/
        page.tsx                          直近店舗 / 最新 / new へ redirect（3.3）
        new/
          page.tsx  actions.ts            createTenant → { redirectTo: /tenants/<id> }
          _components/NewTenantForm.tsx
        [tenantId]/
          layout.tsx                      tenant 解決 + generateMetadata + TenantShell（3.6）
          page.tsx                        shifts / tutorial 分岐（3.7）
          shifts/page.tsx                 仮（3.9）
          settings/
            layout.tsx                    SettingsNav + children
            general/
              page.tsx  actions.ts        updateTenant / deleteTenant → { redirectTo: '/tenants' }
              _components/GeneralSettingsClient.tsx
            patterns/
              actions.ts                  createPattern（3.4。page は 006）
              _components/PatternForm.tsx
            staffs/
              actions.ts                  createStaff（3.4。page は 006）
              _components/StaffForm.tsx
          tutorial/
            layout.tsx                    TutorialSteps + children
            _components/TutorialSteps.tsx Stepper（useSelectedLayoutSegment で active）
            intro/page.tsx
            pattern/page.tsx  _components/TutorialPatternClient.tsx   登録済み一覧 + PatternForm + 「次のSTEPへ」
            staff/page.tsx    _components/TutorialStaffClient.tsx     登録済み一覧 + StaffForm + 「初期設定を完了する」
            complete/page.tsx             未完了なら該当ステップへ redirect（3.7）
docs/plans/005-tenants-tutorial/README.md 本ファイル（末尾に実装ログ）
AGENTS.md                                 (protected)/actions.ts、チュートリアルの再利用例外、proxy の 3 段、直近店舗 cookie
README.md / .env.example                  V1_UUID_NAMESPACE の説明（未設定時は旧 URL 解決が無効）
```

### 画面と Action

| 画面 | Action（`runAction` → guard → Zod → `createClient()`） | 備考 |
| --- | --- | --- |
| `/tenants` | — | Server で redirect のみ |
| `/tenants/new` | `createTenant({ name, shiftCycle })` → `{ redirectTo }` | `owner_id` は DB default。`.select('id').single()` で id を受ける |
| `/tenants/[tenantId]` | — | redirect のみ |
| `/tenants/[tenantId]/settings/general` | `updateTenant({ tenantId, name, shiftCycle, startOfWeek })` → `revalidatePath('/tenants/<id>', 'layout')` | `.eq('id').eq('owner_id', user.id)` を重ね、`.select('id').maybeSingle()` が null（RLS で見えない）なら `fail('店舗が見つかりません')` |
|  | `deleteTenant({ tenantId })` → `{ redirectTo: '/tenants' }` | `modals.openConfirmModal`。同じく 0 行なら fail。成功時に直近店舗 cookie を消す |
| `/tenants/[tenantId]/tutorial/pattern` | `createPattern({ tenantId, name })`（`settings/patterns/actions.ts`） | 成功通知は v1 と同じ「「早番」を登録しました。続けて登録できます」 |
| `/tenants/[tenantId]/tutorial/staff` | `createStaff({ tenantId, name })`（`settings/staffs/actions.ts`） | 同上 |
| ヘッダー / `/account` | `logout()`（`(protected)/actions.ts`） | 004 から移動 |

すべての Action は `requireUser()` のあと、テナント配下の書き込みには `.eq('tenant_id', tenantId)`（tenants 自身は `.eq('owner_id', user.id)`）を重ねる（AGENTS.md RLS 7）。`tenantId` は `z.guid()` で検証する（`z.uuid()` は seed の id を弾く。§2）。名前は `.trim()` してから長さを見る（v1 の `presence` と同じ）。

### 文言（v1 から移植）

| 場所 | 文言 |
| --- | --- |
| `/tenants/new`（店舗 0 件） | 「assift へようこそ」「まず最初にあなたの店舗を作成しましょう。」 |
| tutorial/intro | 「初期設定」「シフト表を作成する前に、いくつかの設定を行う必要があります。」「これらの設定はあとで変更できますので、まずは基本的な情報だけ登録して、初期設定を完了させてください。」→ 「はじめる」 |
| tutorial/pattern（0 件） | 「はじめにあなたの店舗の勤務パターンを登録しましょう。」「早番、日勤、有給など、いま使用しているシフト表の形式にあわせて自由に登録できます。（あとで追加/編集もできます）」 |
| tutorial/pattern（1 件以上） | 「登録済みのパターン（あとで編集できます）」+ 名前を「、」で連結 + 「ひと通り追加したら次へ進みましょう。」→ 「次のSTEPへ」 |
| tutorial/staff | 「続けてスタッフを登録しましょう。」/「登録済みのスタッフ（あとで編集できます）」「ひと通り追加したら初期設定は完了です。」→ 「初期設定を完了する」 |
| tutorial/complete | 「お疲れさまでした。」「assiftを利用する準備が整いました。」「今まで行なった設定は、画面右上のメニューからいつでも変更できます。」「それでは早速シフト表を作成してみましょう！」→ 「シフト表を作成する」 |
| settings/general 削除 | 「削除すると、この店舗に関連するすべてのデータが削除されます。」「この操作は元には戻せません。」確認: 「本当に削除しますか？この操作は取り消せません。」 |
| 通知 | 「店舗を作成しました」「店舗情報を更新しました」「店舗を削除しました」 |

---

## 5. 設計の要点

### 5.1 proxy の 3 段

```ts
// src/proxy.ts
export async function proxy(request: NextRequest) {
  const legacy = legacyTenantRedirect(request) // 旧 URL なら 308、でなければ null
  if (legacy) return legacy
  const response = await updateSession(request) // 004 のまま（cookie 更新 + 未ログイン redirect）
  rememberCurrentTenant(request, response) // /tenants/<uuid> を開いたら cookie に記録
  return response
}
```

`legacyTenantRedirect` と `rememberCurrentTenant` は `lib/tenants/` の純関数（URL 文字列を受けて URL 文字列を返す）の薄いラッパーにし、純関数側を Vitest で固定する。`utils/supabase/proxy.ts` は触らない。

`config.matcher` は既存の source に `missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }]` を足す（3.3）。

### 5.2 `/tenants` の redirect

```ts
const tenants = await listTenants() // created_at asc（v1 のメニュー順）
if (tenants.length === 0) redirect('/tenants/new')
const cookieId = (await cookies()).get(CURRENT_TENANT_COOKIE)?.value
redirect(`/tenants/${pickTenantToOpen(tenants, cookieId).id}`)
```

`pickTenantToOpen` は「一覧に cookie の id があればそれ、無ければ末尾（v1 の `@tenants.last`）」。uuid 形式でない cookie 値は無視する。

### 5.3 `[tenantId]/layout.tsx`

```ts
export default async function TenantLayout({ children, params }: LayoutProps<'/tenants/[tenantId]'>) {
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound() // 緩い判定（3.2）。uuid の validate() は seed の id を弾く
  const [tenant, tenants, user] = await Promise.all([getTenant(tenantId), listTenants(), getAuthUser()])
  if (!tenant) notFound()
  return <TenantShell tenant={tenant} tenants={tenants} email={user?.email ?? ''}>{children}</TenantShell>
}
```

`TenantShell` は Client なので、`tenant` / `tenants` はシリアル化可能なオブジェクト（`Tables<'tenants'>` の必要な列だけ）で渡す。`children` は Server の要素のまま通る。

### 5.4 `createPattern`（`createStaff` も同型）

```ts
const { tenantId, name } = createPatternSchema.parse(input)
await requireUser()
const supabase = await createClient()
const position = await nextPosition('patterns', tenantId) // lib/queries/positions.ts
const { data: pattern, error } = await supabase
  .from('patterns').insert({ tenant_id: tenantId, name, position }).select('id').single()
if (error) throw error
const { data: staffs } = await supabase.from('staffs').select('id')
  .eq('tenant_id', tenantId).is('retired_at', null)
if (staffs?.length) {
  await supabase.from('staff_patterns')
    .insert(staffs.map((s) => ({ tenant_id: tenantId, staff_id: s.id, pattern_id: pattern.id })))
}
revalidatePath(`/tenants/${tenantId}`, 'layout')
```

色・種別・必要人数は DB default（`#FFFFFF` / `workday` / `{}`）。006 で入力項目にする。

### 5.5 チュートリアルのステップ表示

`tutorial/layout.tsx`（Server）が `<TutorialSteps />`（Client）と `children` を並べる。`TutorialSteps` は `useSelectedLayoutSegment()` で `intro | pattern | staff | complete` を取り、Mantine `Stepper` の `active` にする。最初の 3 ステップはクリックで遷移（v1 と同じ）、「完了」はクリック不可。

---

## 6. 手順

1. `npm i uuid`。`utils/uuid.ts`、`lib/migration/v1Ids.ts`、`lib/tenants/legacyUrl.ts`、`lib/tenants/currentTenant.ts` とテスト。`src/proxy.ts` を 5.1 に組み替え、`curl -I` で 308 と cookie を確認。prefetch ヘッダ付きのリクエストで cookie が**付かない**ことも確認し、付くなら 3.3 の代替に切り替える
2. `lib/calendar/{shiftCycle,weekdays}.ts`、`lib/validation/{tenants,patterns,staffs}.ts` とテスト
3. `lib/queries/{tenants,patterns,staffs}.ts`
4. `(protected)/actions.ts`（logout 移動）、`components/{SimpleShell,TenantShell,TenantSwitcher,SettingsNav}.tsx`、`app/not-found.tsx`
5. `/tenants`（redirect）、`/tenants/new`
6. `[tenantId]/layout.tsx` / `page.tsx` / `shifts/page.tsx`（仮）
7. `settings/layout.tsx`、`settings/general/*`、`settings/patterns/{actions.ts,_components/PatternForm.tsx}`、`settings/staffs/{actions.ts,_components/StaffForm.tsx}`
8. `tutorial/*`
9. `/account` を `SimpleShell` で包む。AGENTS.md / README.md / `.env.example` を更新
10. `npm run format && npm run lint && npm run typecheck && npm test && npm run build`、`npx supabase test db`（変更なしで 22 件 PASS を確認）
11. `npm run dev` で完了条件を一巡（新規ユーザーの signup からチュートリアル完了まで、seed ユーザーの切替と設定、旧 URL、390px）。他人の店舗が 404 になることは、signup で作った 2 人目のユーザーのセッションで seed の店舗 URL を開いて確認する。console エラー 0 件を確認
12. 実装ログを本ファイルに追記し、確認のうえコミット

---

## 7. スコープ外

- スタッフ / 勤務パターン / 自動アサイン制約の一覧・編集・並べ替え・退職と、フォームの名前以外の項目（006）。005 のフォームは名前だけ
- シフト表本体（007）。`shifts/page.tsx` は仮
- `/api/tenants/[tenantId]/shifts/{pdf,csv}`（010）。旧 URL からの redirect 先は 005 で組むが、着地は 010 まで 404
- LP の「ログイン済みなら `/tenants` へ」（011）
- お問い合わせ導線、Beamer、決済情報、スタッフ上限（v1 navbar / plan_status。011 と Phase 2）
- v1 トークン以外の旧 URL（`/users/sign_in` 等 → `/login`）。認証系の旧 URL は 011 か 013 で `next.config` の `redirects` にまとめる
- 店舗の共同管理・招待（Phase 1 に無い。RLS の PERMISSIVE 側をそのときに分岐する）

---

## 8. 001 からの変更点（まとめ）

| 001 | 005 | 理由 |
| --- | --- | --- |
| 旧 URL の解決は `[tenantId]/layout.tsx` | proxy（3.1） | layout は配下のパス・クエリを知れない。`start_date` → `start` の書き換えも必要 |
| 旧 URL は 301 | 308 | Next の `permanentRedirect` / `NextResponse.redirect(…, 308)` の慣例。GET では同義 |
| `TenantProvider`（Context） | 作らない（3.5） | `useParams()` と props で足りる。007 で必要になれば足す |
| AppShell にヘッダー + （暗黙に）ナビ | ヘッダーのみ、モバイルだけ Burger で Navbar（3.5） | シフト表が横幅を使う |
| 直近店舗は「cookie またはユーザー設定」 | cookie（proxy で記録、3.3） | Server Component で cookie を書けないため proxy に置く。ユーザー設定（DB 列）は端末をまたぐ利点があるが Phase 1 では見送る |

---

## 9. セルフレビューでの修正（2026-09-17）

初稿に対してプラン全体を読み直し、Zod 4.6.5 / `uuid` 14.0.2 / Next 16.3.5 のドキュメントで確認して直した点。

| #   | 指摘                                                                                                                                                                                                       | 対応                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | uuid v5 を自前実装としていた。導出は 012 の全主キーの土台で、行数で判断する場所ではない。Web Crypto は非同期で純関数まで async になる                                                                       | `uuid` パッケージに変更（3.2）。名前の規約と namespace は `lib/migration/v1Ids.ts` に置き、005 と 012 が共有する                                                     |
| 2   | `z.uuid()` と `uuid` の `validate()` は RFC のビットを検査し、seed の `22222222-…` を弾く。そのままだと **seed の店舗が 404 になり、Action も入力エラーになる**（実測）                                     | `z.guid()` と緩い `isUuid()`（`utils/uuid.ts`）に統一（§2、3.2、3.6、5.3）。Postgres が受ける形式に揃える                                                            |
| 3   | `redirect('shifts')` のような相対参照は `Location` ヘッダで現在の URL 基準に解決され、`/tenants/shifts` になりうる                                                                                         | `redirect()` は常に `/` 始まりの絶対パス（3.7）                                                                                                                      |
| 4   | `updateTenant` の `revalidatePath` の範囲が未指定。page だけだとヘッダーの店舗名（layout の props）が古いまま残る                                                                                          | `revalidatePath('/tenants/<id>', 'layout')` を明記（3.5、§4）                                                                                                        |
| 5   | `listTenants()` を `created_at desc` にすると切替メニューが v1（作成順）と逆になる。フォールバックの「最新」だけのために全体を逆順にしていた                                                               | `created_at asc` + フォールバックは末尾（3.3、5.2）                                                                                                                  |
| 6   | `updateTenant` / `deleteTenant` は RLS で見えない行に対して**エラーにならず 0 行**で終わる。成功通知を出してしまう                                                                                           | `.select('id').maybeSingle()` で 0 行を検出して `fail('店舗が見つかりません')`（§4）                                                                                 |
| 7   | `PatternForm` の `onCreated` でクライアントが一覧を更新する設計は、`revalidatePath` で Server が再描画するのと二重                                                                                          | クライアントに一覧の状態を持たせない（3.4）                                                                                                                          |
| 8   | 旧 URL の遷移先を文字列で組むと open redirect の余地を残す。308 がブラウザに永続キャッシュされる点も未記載                                                                                                | `nextUrl.clone()` に `pathname` / `search` を代入する。namespace は本番で変えない前提を明記（3.1）                                                                   |
| 9   | 初回ユーザーの `/tenants/new` に「店舗へ戻る」が出る（戻り先が無い）。モバイル Navbar が遷移後に開いたまま。`SettingsNav` がデスクトップとモバイルで別 UI                                                  | `SimpleShell` は店舗 0 件で戻るリンクを隠す。Navbar は `usePathname()` の変化で閉じる。`SettingsNav` は 1 種類を積み替えるだけ（3.5。後にモバイルでは出さないよう変更）                                |
| 10  | 「他人の店舗は 404」の検証手順が無い（seed はユーザー 1 人）。ページの `metadata.title` が未定。position 計算の置き場が未定。名前の `trim` が未記載                                                        | 2 人目のユーザーで確認（§6 の 11）。title を 3.7 に列挙。`lib/queries/positions.ts` に `nextPosition()`。名前は `.trim()`（§4）                                       |

### 2 回目のレビュー（2026-09-17）

| #   | 指摘                                                                                                                                                                                                                                              | 対応                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | 直近店舗を proxy で記録すると、切替メニューの `Link` の **prefetch**（`/tenants/<uuid>` への RSC リクエスト）でも cookie が書かれ、開いていない店舗が直近になる。proxy のコード内では prefetch ヘッダが剥がされていて見分けられない（Next ドキュメントで確認） | 当初は `config.matcher` の `missing` で prefetch を proxy から外す方針にしたが、**実装時のレビューで撤回**（トークン更新が保存できなくなる）。最終形はリンク側の `prefetch={false}`（§10.4） |

見直したが変えなかった点:

- **proxy に旧 URL 解決と cookie を置くこと**（3.1、3.3）。proxy が Supabase 専用でなくなるが、URL 全体と cookie 書き込みの両方が要るのは proxy だけ。`src/proxy.ts` を 3 段の合成にとどめ、ロジックは `lib/tenants/` の純関数に出す
- **`createPattern` / `createStaff` の 2 段 INSERT が非トランザクション**（3.4）。005 の入力は名前だけで、失敗しても 006 のスタッフ編集で結び直せる。RPC 化は 006 で判断
- **seed の id を RFC 準拠に書き換える案**。アプリの契約は「Postgres が受ける uuid」であり、seed を直しても pgTAP の `aaaaaaaa-0000-…` など非 RFC の id は残る。判定を緩める方が筋がよい
- **`/tenants` → `/tenants/<id>` → `shifts` の 2 段 redirect**（3.3）。v1 と同じで、分岐の置き場が 1 か所（`[tenantId]/page.tsx`）に収まる

---

## 10. 実装ログ（2026-09-17）

ブランチ `005-tenants-tutorial`（`004-auth` から分岐）。Next 16.3.5 / Mantine 9.6 / Supabase CLI 2.117。

### 10.1 成果物

§4 の構成どおり。プランに無かった追加・変更:

| パス | 内容 |
| --- | --- |
| `src/lib/tenants/navigation.ts` | **追加**。ヘッダーと設定ナビで共有するリンク定義。006 で作るページには `pending: true` を付け、先読みを切る（10.4） |
| `src/components/LogoutMenuItem.tsx` | **追加**。`logout` を呼ぶ部分を `MenuItem` 版と `NavLink` 版で共有する（ヘッダー・モバイルナビ・簡易ヘッダーの 3 か所） |
| `src/lib/queries/positions.ts` | `nextPosition(supabase, table, tenantId)`。プランでは引数に client を書いていなかったが、Action が持つ client を使い回す形にした |
| `src/lib/migration/v1Ids.ts` | `v1Uuid(table, id, namespace)` は namespace を引数で受ける純関数にし、env の読み取りは `getV1UuidNamespace()` に分けた（テストで env を触らずに済む） |
| `account/_components/AccountClient.tsx` | logout の import 元を `(protected)/actions` に変更。**パネル自体は 004 のまま残した**（プランの「中身は 004 のまま」に従う。ヘッダーにも導線があるが v1 も navbar と設定メニューの両方に置いていた） |

### 10.2 プランどおり確認できたこと

- 旧 URL の 308 は 5 パターンすべて期待どおり（店舗トップ / 配下 / `start_date` → `start` / `shifts.pdf` / `shifts.csv`）
- **未ログインでも 308 が先に効き、`/login?next=` に新 URL（クエリ書き換え済み）が入る**。`next=%2Ftenants%2F<uuid>%2Fshifts%3Fstart%3D2026-10-01`
- `[tenantId]/layout.tsx` の `notFound()` はルートの `not-found.tsx` に落ち、他人の店舗も uuid でない id も同じ 404（HTTP ステータスも 404）
- `generateMetadata` の `title.template` で配下ページが `店舗情報 | ひまわり保育園` になる
- seed の店舗（パターン 6 / スタッフ 8）はチュートリアルを飛ばしてシフト表に着地する
- `revalidatePath(..., 'layout')` でヘッダーの店舗名が更新後に切り替わる

### 10.3 プランからの変更: `uuid` の `validate()` は使わない

§3.2 は「namespace の検証も含めて `validate()` を使う」書き方だったが、実装して分かったこと:

- `uuid` の `v5()` は **RFC 非準拠の namespace に `Invalid UUID` を投げる**。したがって namespace だけは厳密判定が必要
- 一方、店舗 id の判定に `validate()` を使うと seed の `22222222-…` を弾いてしまう

そこで判定を 2 種類に分けた。店舗 id は `isUuid()`（緩い）と `z.guid()`、namespace だけ `validate()`（厳密）。
seed ユーザーで「非準拠 uuid の店舗を開ける / 更新できる」ことをブラウザで確認した（10.6）。

### 10.4 プランからの変更: prefetch の扱い（§3.3 と §9 の 11 を差し替え）

プランは「`config.matcher` の `missing` で prefetch を proxy から外す」としていたが、**これは採らなかった**。
コードレビューで、セッション cookie を書けるのは proxy だけであり、除外すると次の経路でログアウトすることが分かった:

1. アクセストークンの期限（`jwt_expiry = 3600`）が切れたあと、最初のリクエストが prefetch だと
2. トークン更新が Server Component の描画中に起き、`setAll` は無視される（cookie を書けない）
3. `enable_refresh_token_rotation = true` / `refresh_token_reuse_interval = 10` なので、
   保存できなかった新しい refresh token の裏で古いほうが無効になり、次の遷移で失敗する

採った方法: **proxy は全リクエストで走らせ、先読みで困るリンク側に `prefetch={false}` を付ける**。
他の店舗を指すリンクは `TenantSwitcher` だけなので、そこだけ切れば「メニューを開くと直近店舗が変わる」は起きない。
現在の店舗を指すリンクは先読みされても同じ id なので、`rememberCurrentTenant` の比較で書き込みが起きない。

あわせて、006 で作るページ（スタッフ / 勤務パターン / 自動アサイン制約）へのリンクにも `prefetch={false}` を付けた。
付けないと、テナント配下を開くたびに 3 本の 404 が console に出る（モバイル用 Navbar のリンクは
閉じていても DOM にあるため先読みされる）。006 でページを作ったら `navigation.ts` の `pending` を外す。

### 10.5 コードレビューでの修正

実装後に差分をレビューして直した点。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | `EXPORT_PATHS[rest]` が URL 由来のキーで素の添字を引いており、`/tenants/<token>/constructor` が
プロトタイプ上の関数を拾って `/api/tenants/<uuid>/shifts/function Object() { [native code] }` へ 308 する | `lookup()`（`utils/record.ts`）経由に変更。AGENTS.md の既定どおり | `curl` で `constructor` が通常のパスとして 308 されることを確認。Vitest に 5 キー分 |
| 2 | proxy の prefetch 除外が refresh token のローテーションを壊す（10.4） | `missing` を外し、リンク側の `prefetch={false}` に置き換え | prefetch ヘッダ付きのリクエストで proxy が走る（307 が返る）ことを確認 |
| 3 | `tenantIdFromPathname` が大文字 uuid を通すのに、`pickTenantToOpen` は DB 由来の小文字と `===` で比較していた。大文字 URL で開くと直近店舗が毎回ずれる | パス側で小文字に正規化し、比較も大小を無視する | 大文字 URL で開いたあと `/tenants` が同じ店舗に戻ることをブラウザで確認。Vitest 2 件 |

### 10.6 検証結果

```
npm run format:check   → OK
npm run lint           → OK
npm run typecheck      → OK
npm test               → 9 files / 65 tests passed
npm run build          → OK（新規 8 ルート。すべて dynamic）
npx supabase db reset  → OK
npx supabase test db   → Files=1, Tests=22, Result: PASS（スキーマ変更なし）
```

HTTP レベル（本番ビルド、port 3100）:

| 操作 | 結果 |
| --- | --- |
| `/tenants/<token>` | 308 `/tenants/<uuid>` |
| `/tenants/<token>/shifts?start_date=2026-10-01` | 308 `/tenants/<uuid>/shifts?start=2026-10-01` |
| `/tenants/<token>/shifts.pdf?start_date=…` | 308 `/api/tenants/<uuid>/shifts/pdf?start=…` |
| `/tenants/<token>/shifts.csv?encoding=utf8` | 308 `/api/tenants/<uuid>/shifts/csv?encoding=utf8` |
| `/tenants/<token>/settings/general` | 308 `/tenants/<uuid>/settings/general` |
| `/tenants/<token>/constructor` | 308 `/tenants/<uuid>/constructor`（10.5 の 1） |
| 未ログインで `/tenants` | 307 `/login?next=%2Ftenants` |
| 未ログインで旧 URL | 308 → 307 `/login?next=<新 URL（クエリ書き換え済み）>` |
| prefetch ヘッダ付きの `/tenants` | 307（proxy が走っている。10.4） |

ブラウザ（実 Chrome を playwright-core で操作。検証コードは scratchpad のみでリポジトリに入れていない）:

新規ユーザーで signup からログアウトまで一巡し、**29 項目すべて PASS / console エラー 0 件**。

| 確認 | 結果 |
| --- | --- |
| 確認メール → 店舗 0 件で `/tenants/new`、歓迎の文言、「店舗へ戻る」は出さない | PASS |
| 店舗作成 → `tutorial/intro` に着地 | PASS |
| パターン 2 件・スタッフ 1 件を登録 → 一覧が即座に反映（`revalidatePath`） | PASS |
| `次のSTEPへ` → `初期設定を完了する` → `シフト表を作成する` | PASS |
| 完了後の店舗トップはシフト表へ直行 | PASS |
| 2 店舗目は「店舗を追加」+ キャンセル | PASS |
| 切替メニューで別店舗へ、`/tenants` が直近店舗に戻る | PASS |
| 切替メニューを開いても直近店舗が変わらない（10.4） | PASS |
| 店舗名の更新でヘッダーとタイトルが変わる | PASS |
| 削除 → 残った店舗に着地 | PASS |
| 他人の店舗 / uuid でない id は 404 | PASS |
| 390px で横スクロールなし、Burger で開き、遷移で閉じる | PASS |
| ヘッダーからログアウト | PASS |

seed ユーザー（`dev@example.com`）:

| 確認 | 結果 |
| --- | --- |
| チュートリアルを飛ばしてシフト表へ | PASS |
| RFC 非準拠の uuid（`22222222-…`）の店舗を開ける・更新できる（10.3） | PASS |
| 大文字 uuid で開いても直近店舗が保たれる（10.5 の 3） | PASS |

### 10.7 006 以降への申し送り

- `settings/staffs` `settings/patterns` `settings/restrictions` の `page.tsx` を作ったら、
  `src/lib/tenants/navigation.ts` の `pending: true` を外す（先読みが有効に戻る）
- `PatternForm` / `StaffForm` は名前だけ。006 で同じファイルに項目を足す。Zod も
  `lib/validation/{patterns,staffs}.ts` の `create*Schema` に足す
- `createPattern` / `createStaff` の `staff_patterns` への 2 段 INSERT は非トランザクション。
  006 でフルのフォームが入るときに RPC へ寄せるか判断する（§3.4）
- `shifts/page.tsx` は仮ページ。007 で置き換える
- `TenantShell` は店舗名とメールしか受け取っていない。007 で共有する値が増えるなら Context を検討する

### 10.8 2 回目のコードレビューでの修正（2026-09-18）

実装を読み直し、疑った箇所を実測して直した点。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | フォームが `revalidatePath` のあとに `router.refresh()` も呼んでおり、**登録・更新のたびにサーバー描画が 2 回**走っていた | 3 か所（`PatternForm` / `StaffForm` / `GeneralSettingsClient`）から削除 | `router.refresh()` を外した状態で「登録済みのパターン」が出ること、店舗名の変更がヘッダー（親 layout）に反映されることをブラウザで確認。Server Action 内の `revalidatePath` は呼び出し元の画面を layout ごと描き直す |
| 2 | `prefetch={!link.pending}` が、実装済みリンクに `true`（全体を強制先読み）を渡していた。Next の既定より広い先読みで、意図していない | `prefetch={link.pending ? false : undefined}` に変更し、既定に戻した | ビルドと通し検証で挙動が変わらないことを確認 |
| 3 | `isV1Token` がどこからも使われておらず、22 文字トークンの正規表現が `V1_TOKEN_PATTERN` と `LEGACY_TENANT_PATH` の 2 か所にあった | 未使用の関数と定数を削除し、正規表現を `LEGACY_TENANT_PATH` 1 か所に | Vitest から該当ブロックを削除（63 件に） |
| 4 | `Stepper` の `allowNextStepsSelect={false}` が、各ステップの `allowStepSelect` に上書きされて**効いていなかった**（読み手に誤解を与える） | 削除。クリック可否は `allowStepClick` / `allowStepSelect` だけで決める | 実測で intro から「勤務パターン」「スタッフ」へ進めること、「完了」は押しても動かないことを確認 |

疑ったが問題が無かったもの:

- **`[tenantId]/layout.tsx` の `notFound()` と page の DB クエリの競合**: layout と page は並行に描画されうるので、uuid でない `tenantId` で page 側のクエリが Postgres の `22P02` を投げて 500 になる可能性を疑った。ログイン状態で 12 パターン（`not-a-uuid` / 他人の uuid / `%2e%2e%2f%2e%2e` / `0` を shifts・settings・tutorial の各配下に）を実測し、**すべて 404 で 500 は 0 件**
- `nextPosition` の採番競合、`staff_patterns` の 2 段 INSERT、`/tenants` の 2 段 redirect: いずれもプランで意図したとおり（§3.4、§3.3）
- `pickTenantToOpen` の `!`（非 null アサーション）: 直前に 0 件を弾いているので安全

### 10.9 再検証

```
npm run format:check / lint / typecheck / build → OK
npm test        → 9 files / 63 tests passed
npx supabase db reset && npx supabase test db → 22 tests PASS
```

クリーンな DB で通し検証をやり直し、**新規ユーザー 29/29・seed ユーザー 5/5 が PASS、console エラー 0 件**。

### 10.10 3 回目のコードレビューでの修正（2026-09-18）

まだ実際に動かしていなかった経路と、認可境界のテスト網羅を見に行った。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **閉じた Navbar のリンクにキーボードのフォーカスが入る。** Mantine の `AppShell` は閉じた Navbar を unmount せず画面外へずらすだけなので、リンクが tab 順に残る。とくにデスクトップは `collapsed.desktop: true` で常に閉じているため、**常時 6 件の見えないリンク**にフォーカスできた | `AppShellNavbar` に `inert={!opened}` を付けた（React 19 は boolean の `inert` を通す） | Tab を 12 回押して画面外の要素にフォーカスが入る回数を計測。1280px / 390px とも **6・7 回 → 0 回**。開いたときの操作は通し検証で PASS のまま |
| 2 | **`staff_patterns` の pgTAP カバレッジがゼロ**。005 の `createPattern` / `createStaff` がこのテーブルへの最初の書き込みなのに、テナント境界がテストで固定されていなかった | `supabase/tests/rls_tenant_isolation.sql` に 5 アサーションを追加（22 → 27 件）: 別テナントの行は見えない / 自テナントの組み合わせは入る / 別テナントの `tenant_id` は 42501 / 自テナント id に他テナントの staff を混ぜると 23503 / A の操作後も B の行が残る | `npx supabase test db` → Files=1, Tests=27, PASS。追加前に psql で同じ 4 条件を手で確認済み |

検証して問題が無かったもの:

- **`createPattern` のスタッフ連結分岐（`staffs.length > 0`）**: 通し検証はパターン → スタッフの順なので、この分岐を通っていなかった。
  seed の店舗（パターン 6 / 在籍 8 / `staff_patterns` 48）に勤務パターンを 1 件足して **48 → 56**（在籍 8 名全員に付く）、
  続けてスタッフを 1 名足して **56 → 63**（全 7 パターンが付く）を DB で確認。v1 の `Pattern#after_create` と同じ挙動
- `staff_patterns` の複合 FK: 自テナント id に他テナントの `staff_id` を混ぜると `23503` で拒否される（psql で実測）
- `revalidatePath` を消した副作用: 10.8 の 1 で `router.refresh()` を外したあとも、一覧・ヘッダーの更新は通し検証で PASS

## 11. 追補: シフト表を店舗のトップに置く（2026-10-06）

### 11.1 課題

シフト表はこのサービスの主画面なのに、URL は `/tenants/<uuid>/shifts` と 1 段深い。
`/tenants/<uuid>` のほうは実体を持たず、`setup_completed_at` を見て `/shifts` か `/setup` へ飛ばすだけの中継になっている
（`[tenantId]/page.tsx`）。主画面の上に空の中継が被さった形で、ブックマークや共有で渡る URL も 1 段長い。

### 11.2 決めたこと

**シフト表を `/tenants/<uuid>` に置く。** `/shifts` は旧 URL として redirect だけ残す。

| 変更 | 内容 |
| --- | --- |
| ルート | `shifts/{page.tsx,actions.ts,searchParams.ts,_components/,_lib/}` を `[tenantId]/` 直下へ移す（`git mv` で履歴を保つ） |
| 振り分け | **移動する `shifts/page.tsx` が既に持っている**（`isUuid` → `getTenant` → 準備中なら `/setup`）。いまの `[tenantId]/page.tsx` は削除するだけ |
| 旧 URL | `shifts/page.tsx` は残し、**`redirect()`（307）**で `/tenants/<uuid>` へ。クエリは `start` だけでなく**まるごと素通し**する（将来増えても落とさない）。ブックマークと、v1 から移ってきた URL の両方の受け皿（308 にしない理由は §11.8 の 1） |
| v1 の書き換え | `rewriteLegacyTenantUrl()` は `/tenants/<token>/shifts` → `/tenants/<uuid>`（末尾の `/shifts` を落とす）。**2 回 redirect させない** |
| Action の置き場 | `[tenantId]/actions.ts` は空かない（シフト表の Action が入る）。いま入っている「ルートをまたぐ Action」（`deleteTenant` / `saveDefaultRequiredNums`）は 1 つ上の `(protected)/tenants/actions.ts` へ移す。設定・初期設定の共通の祖先なので AGENTS.md の規約（ルートをまたぐ Action はグループ直下）を満たす |
| リンク | 直書きの `/shifts` は `shiftsHref()` に寄せる（`setup/page.tsx` / `setup/actions.ts` / `SetupWizard` / 旧 `TenantPage`） |
| 現在地の判定 | `isShiftsPath()` はいま `pathname.includes('/shifts')` という緩い実装。**`/tenants/<何か>` 完全一致**（セグメント 2 つ）に変える |

### 11.3 変えないもの

- **エクスポートの `/api/tenants/<uuid>/shifts/{pdf,csv}`**。これは Route Handler の置き場であって画面の URL ではない。
  変えると 010 の `outputFileTracingIncludes` のグロブまで波及する
- 公開シフト表 `/share/<code>`（店舗 URL とは別系統）
- 直近店舗の cookie（`tenantIdFromPathname()` は `/tenants/<uuid>` 以下ならどれでも拾う。`/shifts` が無くなっても動く）
- `(protected)/tenants/[tenantId]/layout.tsx`（店舗の解決と枠）と `settings/` / `setup/`

### 11.4 やること（順序）

1. `git mv` でシフト表の一式を `[tenantId]/` 直下へ。`[tenantId]/actions.ts` は先に `(protected)/tenants/actions.ts` へ退避
2. 旧 `[tenantId]/page.tsx` を削除。移動した page の型を `PageProps<'/tenants/[tenantId]'>` に直す
3. `shifts/page.tsx`（redirect だけ）を新設
4. `legacyUrl.ts` と `navigation.ts`（`shiftsHref` / `isShiftsPath`）を直し、`legacyUrl.test.ts` / `navigation.test.ts` を更新
5. 直書きリンクを `shiftsHref()` に寄せる
6. `AGENTS.md` を更新: ディレクトリ図と、初期設定（014）の段落の「`shifts/page.tsx` と `settings/layout.tsx` が `/setup` へ送る」（過去のプランの記述は履歴なので触らない）
7. `lint` / `typecheck` / `test` / `build`、ブラウザで通し確認

### 11.5 検証（ブラウザ）

| 見るもの | 期待 |
| --- | --- |
| `/tenants/<uuid>` | シフト表が出る（redirect しない）。`?start=` も効く |
| `/tenants/<uuid>/shifts?start=2026-11-01` | `/tenants/<uuid>?start=2026-11-01` へ redirect |
| 準備中の店舗で `/tenants/<uuid>` | `/setup` へ |
| v1 の `/tenants/<22 文字トークン>/shifts?start_date=…` | `/tenants/<uuid>?start=…` へ 1 回で着地 |
| 設定からの「← シフト表画面へ」、ヘッダーのシフト表、初期設定の完了 | 新 URL へ飛ぶ |
| エクスポート（PDF / CSV） | これまでどおり落ちる |

### 11.6 リスクと対応

- **移動の規模が大きい**（30 ファイル超）。`git mv` で履歴を保ち、1 コミットにまとめる
- **`actions.ts` の衝突**。退避を先にやらないと `git mv` が上書きする。手順 1 の順序を守る
- **リンクの取りこぼし**。`grep -rn "/shifts"` で残りを洗い、`shiftsHref()` 以外の直書きを無くす
- **Next のルート型**（`PageProps<'/tenants/[tenantId]'>`）は `next typegen` で再生成される。`npm run typecheck` が先に走らせる

### 11.7 プランのレビュー（2026-10-06）

| # | 指摘 | 直したこと |
| --- | --- | --- |
| 1 | 旧 URL の redirect を `redirect()` と書いていた。Next の `redirect()` は **307（一時）** なので、恒久的な移動では毎回サーバーに来るうえ、意図も伝わらない | `permanentRedirect()`（308）にした（§11.2） |
| 2 | 引き継ぐクエリを `?start=` と書いていた | **クエリはまるごと素通し**に（将来 `?view=` などが増えても落とさない） |
| 3 | 「テストを更新」が曖昧だった | `legacyUrl.test.ts`（`/tenants/<token>/shifts` の期待値）と `navigation.test.ts`（`isShiftsPath`）と明記 |
| 4 | AGENTS.md はディレクトリ図だけ直す、と書いていたが、初期設定の段落にも `shifts/page.tsx` が出てくる（AGENTS.md:103） | 両方直す、に変更 |

検証して問題が無かったもの（変更不要と確認した）:

- **proxy の `PROTECTED_PREFIXES`**: `/tenants` の前方一致なので、`/shifts` の有無に関係なく守られる
- **直近店舗の cookie**: `tenantIdFromPathname()` は `/tenants/<uuid>` とその配下にマッチするので、`/shifts` が消えても記録される
- **`revalidatePath('/tenants/<id>', 'layout')` と `refresh()`**: 指定は `/tenants/<id>` の layout なので、ページの位置が変わっても対象は同じ
- **`safeNext()`**: 未ログインで `/tenants/<uuid>` を開くと `/login?next=/tenants/<uuid>` になり、ログイン後に戻る（`/` 始まりの同一オリジンなので通る）
- **014 の「準備中は枠を描かない」**: 判定は `[tenantId]/layout.tsx` にあり、ページの位置に依存しない

### 11.8 2 回目のレビュー（2026-10-06）

| # | 指摘 | 直したこと |
| --- | --- | --- |
| 1 | **1 回目のレビューの判断を訂正。** 旧 URL を `permanentRedirect()`（308）にすると決めていたが、**308 はブラウザに恒久的にキャッシュされる**。`/tenants/<uuid>` はログイン必須で検索エンジンが見ないため 308 の利点（SEO の集約）が無く、あとで `/shifts` を別の意味に使いたくなったときに、キャッシュを持つブラウザが戻ってこない | `redirect()`（307）にした。恒久的に残す受け皿なので、サーバーへの往復 1 回は許容する |
| 2 | 「`TenantPage` の振り分けを新しい page に引き継ぐ」と書いていたが、**移動する `shifts/page.tsx` が既に同じ判定を持っている**（`isUuid` → `getTenant` → `setup_completed_at`）。旧 `page.tsx` は捨てるだけでよい | §11.2 / §11.4 の手順 2 を「削除する」に直した |
| 3 | `isShiftsPath()` を「`/tenants/<uuid>` 完全一致」と書いたが、現在の実装は `pathname.includes('/shifts')` で、テストの fixture も `/tenants/t/shifts`（uuid ではない）。uuid 判定を足すとテストが落ちる | **セグメント 2 つの完全一致**（`/tenants/<何か>`）に変える、と明記した |

検証して問題が無かったもの:

- **`[tenantId]/layout.tsx`**: 準備中の店舗は `children` をそのまま返す（枠を描かない）。シフト表が `/tenants/<uuid>` に来ても、page が先に `/setup` へ送るので枠なしで描かれることはない（layout と page は並行だが、描かれるのは redirect 後）
- **`(protected)/tenants/page.tsx`（店舗一覧）と `actions.ts` の同居**: `actions.ts` はルートではないので衝突しない
- **`loading.tsx`**: `shifts/` には無い（`settings/` にはあるが移動しない）
- **metadata**: 移動する page の `title: 'シフト表'` はそのまま。layout の template で `シフト表 | 店舗名` になる（店舗のトップでも画面の名前が出るほうが分かりやすい）

### 11.9 実装ログ（2026-10-06）

| 段階 | やったこと |
| --- | --- |
| 1 | `[tenantId]/actions.ts`（`deleteTenant` / `saveDefaultRequiredNums`）を `(protected)/tenants/actions.ts` へ退避。呼び出し 3 件の相対パスを直した |
| 2 | 旧 `[tenantId]/page.tsx` を削除し、`shifts/` の `page.tsx` / `actions.ts` / `searchParams.ts` / `_components/` / `_lib/` を `git mv` で `[tenantId]/` 直下へ |
| 3 | `shifts/page.tsx` を新設（307 でクエリごと `shiftsHref()` へ） |
| 4 | `navigation.ts`（`shiftsHref` は店舗のトップ、`isShiftsPath` はセグメント 2 つの完全一致）/ `legacyUrl.ts`（末尾の `/shifts` を落とす）とそれぞれのテスト |
| 5 | 直書きの `/shifts` を `shiftsHref()` に寄せた（`SetupWizard` / `setup/actions.ts` / `setup/page.tsx`） |
| 6 | `AGENTS.md` のディレクトリ図・Action の置き場・初期設定の段落を更新 |

検証（ローカル。ブラウザとリクエスト）:

| 見たもの | 結果 |
| --- | --- |
| `/tenants/<uuid>` | 200 でシフト表（redirect なし）。`?start=2026-11-01` も効く |
| `/tenants/<uuid>/shifts?start=2026-11-01&view=week` | `/tenants/<uuid>?start=2026-11-01&view=week` へ（**クエリをまるごと引き継ぐ**） |
| v1 の `/tenants/<22 文字トークン>/shifts?start_date=2026-10-01` | `308` 1 回で `/tenants/<uuid>?start=2026-10-01` に着地（`/shifts` を経由しない） |
| 準備中の店舗（`setup_completed_at` が null） | `/tenants/<uuid>` も `/tenants/<uuid>/shifts` も `/setup` へ |
| 設定（`/settings/required-nums`） | 200。ヘッダー・設定ナビのリンクも新 URL |
| エクスポート | CSV 200（`text/csv; charset=Shift_JIS`）/ PDF 200（`application/pdf`） |
| `npm run build` | 成功。ルートに `/tenants/[tenantId]` と `/tenants/[tenantId]/shifts`（受け皿）が並ぶ |

`npm test` 699 件 / `typecheck` / `lint`（既存の警告 1 件のみ）。

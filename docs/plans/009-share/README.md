# 009: 共有

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §4.4 / §6）のマイルストーン 009。
007 / 008 で作ったシフト表に **URL 共有（発行・一覧・解除）** を足し、**未ログインで開ける公開ページ `/share/[code]`** を作る。
PDF / CSV は 010、LP などの静的ページは 011。

---

## 1. 目的と完了条件

### 目的

- v1 の `SharesController`（`index` / `create` / `destroy` / `show`）と `Share` モデルをそのまま移植する。**`code` は v1 の値を壊さない**（012 の移行でそのまま引き継ぎ、既に配ってある URL が生き続ける）
- 003 で作ってあった `shares` テーブルを初めて使う。**スキーマ変更なし**（GRANT の最小化だけ §3.7 で検討）
- `createPrivilegedClient()`（service_role）の**最初の正規の用途**を作る。RLS を通らないクライアントなので、読み取りを 1 ファイル（`lib/queries/publicShare.ts`）に閉じ、すべてのクエリで `tenant_id` を明示する
- 「公開期限」の規則（v1 `Share::DATE_LIMIT = 6`）を純関数 1 か所に集約し、一覧の分類・発行ボタンの可否・公開ページの 404 が同じ判定を使う

### 完了条件

- ツールバーの「集計」と「ツール」の間に**共有メニュー**が出て、「URLでシフト表を共有」でモーダルが開く（v1 と同じドロップダウン構造。010 が PDF / CSV をこのメニューに足す）
- モーダルに**表示中の期間**（`2026/9/1〜9/30`）が出て、「共有用URLを取得」で `/share/<8文字>` が発行される。発行後はモーダルを閉じずに「共有中のシフト表」の先頭に増える
- 表示中の期間が既に公開期限を過ぎているときは、ボタンが **disabled + 「過去のシフト表は共有できません」**
- 「共有中のシフト表」「公開期限が過ぎたシフト表」が作成日時の降順で並ぶ。各行に 期間 / URL / コピーボタン / 取得日時、共有中の行には「共有解除」。解除は確認ダイアログ（「シフト表の共有を解除しますか？」）を挟む
- `/share/<code>` を**未ログインの別ブラウザ**で開くと、その期間のシフト表（日付行 / メモ行 / 在籍スタッフ × 日のセル / パターンの凡例）が出る。**下書きも確定と同じ位置に、上辺の色帯付きで出る**（v1 と同じ）
- 管理側でセルを変えてから公開ページを再読み込みすると、その変更が**そのまま反映**される（キャッシュされない）
- 存在しないコード・期限切れのコード・解除済みのコードは、どれも同じ 404 ページ（「ページが見つかりませんでした。」）
- 他店舗の `tenantId` を Action に渡すと「店舗が見つかりません」で失敗し、行は増えない / 消えない。pgTAP に `shares` のテナント境界が入って PASS
- `npm run lint` / `npm run typecheck` / `npm test` / `npx supabase test db` が通る

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| v1 `Share` | `DATE_LIMIT = 6`。`enabled` は `end_date >= Date.current - 6.days`（= 終了日の 6 日後まで有効、7 日後に無効）。`to_param` は `code` |
| v1 のコード生成 | `SecureRandom.alphanumeric(8)` のあと `tr("0O1lIij", "2345678")`。**置換なので分布が偏る**（`0`→`2` など 7 文字が 2 倍出る）。衝突したら再帰で引き直し |
| v1 `create` | 期間はフォームの hidden（表示中の期間）。`end_date - start_date > 31` なら `start_date + 30.days` に**黙って切る**（改ざん対策）。期限切れの期間でも保存自体は通る（ボタンが disabled なだけ） |
| v1 `destroy` | `@tenant.user_id == current_user.id` のときだけ destroy。解除リンクは `enabled` な共有にしか出ない |
| v1 `show` | `Share.find_by(code:)` → 無い / `disabled?` なら 404 の `disabled` ページ。有効なら `share.start_date..end_date` で DB を直読（キャッシュなし） |
| v1 公開ページの中身 | 見出し（`9/1 〜 9/30` + 店舗名）/ 日付行 / **イベント行は期間内にメモがあるときだけ** / 在籍スタッフ × 日のセル / パターン凡例 / `© assift` のリンク。**必要人数行は無い**。セルの「担当可（グレー）」表示も無い（アサイン済みか空かだけ） |
| v1 公開ページの下書き | `data-fixed="false"` のセルは白地 + 上辺 3px の色帯。**下書きも公開される** |
| v1 公開ページのスタッフ | `staffs.enabled`（在籍）を `position` 順。グループは v2 には無い（Phase 1 スコープ外） |
| v2 のスキーマ | `shares(id, tenant_id, code unique check '^[A-Za-z0-9]{8}$', start_date, end_date, created_at)` + `check (end_date >= start_date and end_date - start_date <= 31)` + `shares_tenant_created_idx (tenant_id, created_at desc)`。RESTRICTIVE + PERMISSIVE は他テーブルと同じ |
| v2 の GRANT | `select, insert, update, delete to authenticated`。**UPDATE はどこからも使わない**（§3.7） |
| 007 / 008 の骨格 | `Toolbar` 右の `Group` に共有の位置をコメントで空けてある（`Toolbar.tsx:166`）。シフト表内の書き込みは `refresh()`（AGENTS.md の表） |
| `createPrivilegedClient()` | 既にあり、`account/actions.ts` の `deleteAccount()` だけが使っている。**RLS を通らない**ので、テナント境界はクエリ側で明示するしかない |
| `pageAll()` | クライアントを引数に取らず「ページを読む関数」を受け取るので、service_role のクライアントでもそのまま使える |
| 公開ページのレンダリング | `(public)` ルートグループは未作成（011 が LP などを足す）。root `layout.tsx` にシェルは無いので、`/share/[code]` は素の Server Component として描ける |
| Next 16 のキャッシュ | `cacheComponents` は未使用。`export const dynamic = 'force-dynamic'` は「毎リクエスト描画 + すべての `fetch` を `no-store`」（`caching-without-cache-components.md`）。公開ページの「リアルタイム反映」はこれで固定する |

---

## 3. 事前に確認した決定

### 3.1 一覧は `page.tsx` で毎回読む（確認済み）

共有の一覧（共有中 / 期限切れ）は `shifts/page.tsx` の `Promise.all` に `listShares()` を 1 本足して（内部は有効 / 期限切れの 2 クエリ）Client に渡す。

- 読み取りは Server、書き込みは Action + `refresh()` という既存の流れから外れない。「読み取りを Server Action で返す」パターンをこのリポジトリに持ち込まない
- `shares_tenant_created_idx` が効き、既存のクエリと並行に走るので遅延はほぼ増えない。行は 1 件 100 バイト程度
- 発行・解除のあとは `refresh()` の再描画でそのまま一覧が更新される（モーダルは開いたまま props が入れ替わる）

### 3.2 公開期限の規則は `lib/shares/expiry.ts` に集約する

判定が要る場所が 3 つある（一覧の分類 / 発行ボタンの可否 / 公開ページの 404）。3 か所が別々に `- 6 days` を書くと、境界日にどれか 1 つだけずれても気付けない。

```ts
export const SHARE_GRACE_DAYS = 6
/** v1 `Share#enabled?`（`end_date >= today - 6日`）。終了日の 6 日後まで有効、7 日後に無効 */
export function isShareEnabled(endDate: string, today: string): boolean
/** SQL の絞り込み用（`end_date >= この日` が有効な共有） */
export function minEnabledEndDate(today: string): string
```

**「今日」は `todayJst()` に固定する。** v1 は `Date.current`（サーバー TZ = Tokyo）に依存していて、サーバーの TZ 設定が変われば境界がずれた。

Client（発行ボタンの可否）も自分で `new Date()` を見ず、**Server が渡した `today` を使う**。端末の TZ で判定すると、日本時間の日付が変わる前後で利用者ごとにボタンの状態がずれる。

### 3.3 コード生成は純関数 + 衝突リトライ

`lib/shares/code.ts` に 8 文字のコードを作る純関数を置く。

- アルファベットは **英数字から `0O1lIij` を除いた 55 文字**（v1 が読み間違えを避けた文字。v1 の既存コードもこの 55 文字の範囲に収まる）
- v1 の `tr` は分布が偏るので、v2 は `crypto.getRandomValues` + 剰余バイアスの除去（`b >= 220` のバイトは捨てて引き直す）にする
- 乱数源は引数で差し替えられるようにして Vitest で固定する
- 衝突（`code` の unique 違反 = `23505`）は Action 側で最大 5 回引き直す。55^8 ≈ 8.4×10^13 なので実際にはまず起きないが、静かに握り潰さない

### 3.4 公開ページの読み取りは 1 ファイルに閉じ、`tenant_id` を必ず重ねる（確認済み）

`lib/queries/publicShare.ts` の `getSharedShiftTable(code, today)` だけが `createPrivilegedClient()` を使う。

- service_role は RLS を通らないので、**すべてのクエリに `.eq('tenant_id', share.tenant_id)` を書く**。ここが唯一の境界になる
- `code` はまず形式（`^[A-Za-z0-9]{8}$`）で弾いてからクエリする
- シフトは `pageAll()` 経由（31 日 × 在籍スタッフで `max_rows` に届く。AGENTS.md の規約）
- 期限切れ / 存在しない / 解除済みは**すべて `null`** を返し、呼び出し側は理由を出し分けない（店舗の存在を漏らさない）

### 3.5 公開ページは Client JS ゼロの Server Component

公開ページに操作は無い（v1 も静的 HTML）。`ShareTable` は `<td>` を直接描く Server Component にして、保護ルートの `CalendarTable`（Popover / Menu / onClick）とは別物にする。

`export const dynamic = 'force-dynamic'` を置く。**v1 の「URL 共有後に変更したシフトもリアルタイムに反映されます」という約束をキャッシュ設定に依存させない**（`[code]` は動的セグメントなので既定でも毎回描かれるが、約束事はコードに書く）。
`metadata` は**静的**に `title: 'シフト表'` + `robots: { index: false, follow: false }` とする（§8.5 F1）。店舗名はページの見出しには出すが、**タイトルには入れない**:
v1 の公開ページも `current_tenant` が無いので店舗名は出ていないうえ、LINE などに URL を貼ったときのリンクプレビューに店舗名が出てしまう。
静的なので `generateMetadata` は要らず、`getSharedShiftTable` を `cache()` で包む必要も無い（読み取りは 1 回だけ）。

### 3.6 表の見た目は `src/components/shiftTable/` に切り出す（確認済み）

公開ページと保護ルートで同じセル・日付ヘッダ・凡例を使う。AGENTS.md の「横断 UI は `src/components/`」に従って 3 つ + 1 を移す。

| 移すもの | 現在地 | 理由 |
| --- | --- | --- |
| `ShiftTable.module.css` | `shifts/_components/CalendarTable.module.css` | sticky テーブル・セル・日付・メモ行のスタイルは公開側でも同じ。**移すときに hover を `button` に限定する**（§8.9 F20）: 今の `.cell:hover` / `.noteButton:hover` を公開ページの `<div>` が受けると、押せないセルが反応してしまう。`.noteButton` は `<div>` にも当てるので `.noteCell` に改名する |
| `DateHeaderCell.tsx` | 同上 | 曜日 + 日、日曜・祝日は赤 / 土曜は青。純粋な表示 |
| `PatternDescriptionList.tsx` | 同上 | 表の下の凡例。両方の画面の末尾に出る。**移すときに v1 の取りこぼしを直す**（§8.5 F2）: v1 は名前の枠をパターン色で描いていたが 007 は色を落としていた。`colorHex` を props に足して `borderColor` に当てる |
| `cellStyle.ts`（新規） | — | 「確定はパターン色で塗って白文字、下書きは上辺だけ色帯」の inline style を純関数にして、ボタン版（`ShiftCell`）と公開版で共有する |

保護ルートの `_components` を公開ページから import しない（`StaffNameCell` の設定リンクなど、公開側に要らないものを引き込む）。

### 3.7 `shares` の GRANT から UPDATE を外すのは見送る（確認済み）

共有は「発行して解除する」だけで、更新は v1 にも v2 にも無い。AGENTS.md の「GRANT は最小」に従えば `grant select, insert, delete` で足りるが、**009 では触らない**。

- 実害が無い。UPDATE を呼ぶコードはどこにも無く、あっても RESTRICTIVE ポリシーで自テナントの行に限られる
- スキーマを 1 行変えるために `migrations/` の作り直し → `db reset` → `gen types` まで走る（本番 push 前の運用）。009 の検証対象がスキーマ全体に広がる
- 013 の本番 push 以降なら、通常の差分 migration で単独に入れられる。**そのときに回す**

### 3.8 v1 から変えるところ

| 変更 | 理由 |
| --- | --- |
| 期限切れ一覧は直近 20 件まで | v1 は全件。週次で共有する店舗だと数年で数百行になり、`page.tsx` で毎回読む以上は上限が要る。期限切れの URL は既に死んでいるので情報としての価値も低い |
| 各 URL にコピーボタン（Mantine `CopyButton`） | v1 はリンクを長押しで選択させていた。スマホファーストのサービスで共有 URL を渡す導線がこれだけなのは弱い |
| 31 日超の期間は**切らずに拒否** | v1 は黙って `start + 30 日` に切っていた。008 のコピーと同じ方針（`refineTerm` で拒否）にそろえる。UI からは表示期間（最長 31 日）しか送らないので、通常は起きない |
| 期限切れの期間での発行を**サーバーでも拒否** | v1 はボタンを disabled にするだけで、直接 POST すれば作れた。発行直後に 404 になる行を作らない |
| 公開ページに `noindex` | v1 には無い。URL を知っている人だけの前提なので検索結果に出さない |

---

## 4. 成果物

### 新規

```
src/lib/shares/expiry.ts                       SHARE_GRACE_DAYS / isShareEnabled / minEnabledEndDate
src/lib/shares/expiry.test.ts
src/lib/shares/code.ts                         SHARE_CODE_ALPHABET / SHARE_CODE_LENGTH / generateShareCode / isShareCode
src/lib/shares/code.test.ts
src/lib/validation/shares.ts                   createShareSchema / deleteShareSchema
src/lib/validation/shares.test.ts
src/lib/queries/shares.ts                      listShares（共有中 / 期限切れ）
src/lib/queries/publicShare.ts                 getSharedShiftTable（service_role。公開ページ専用）
src/components/shiftTable/ShiftTable.module.css
src/components/shiftTable/DateHeaderCell.tsx
src/components/shiftTable/PatternDescriptionList.tsx
src/components/shiftTable/cellStyle.ts
src/components/shiftTable/cellStyle.test.ts
src/app/(protected)/tenants/[tenantId]/shifts/_components/ShareMenu.tsx    共有ドロップダウン
src/app/(protected)/tenants/[tenantId]/shifts/_components/ShareModal.tsx   発行・一覧・解除
src/app/(public)/share/[code]/page.tsx                                     公開ページ
src/app/(public)/share/[code]/not-found.tsx                                v1 の disabled ページ
src/app/(public)/share/[code]/_components/ShareTable.tsx                   読み取り専用の表
docs/plans/009-share/README.md
```

### 変更

```
src/app/(protected)/tenants/[tenantId]/shifts/page.tsx          listShares を足して Client に渡す
src/app/(protected)/tenants/[tenantId]/shifts/actions.ts        createShare / deleteShare
src/app/(protected)/tenants/[tenantId]/shifts/_components/ShiftsClient.tsx   shares を受けて ShareModal を開く
src/app/(protected)/tenants/[tenantId]/shifts/_components/Toolbar.tsx        ShareMenu を集計とツールの間に
src/app/(protected)/tenants/[tenantId]/shifts/_components/{CalendarTable,ShiftCell,DateNoteCell,RequiredNumCell,StaffNameCell}.tsx  import 先の差し替え
src/lib/calendar/dateString.ts + dateString.test.ts              formatYearMonthDay（2026/9/1。1 桁月日と月またぎを固定）
src/lib/calendar/datetime.ts（新規）+ datetime.test.ts             formatJstDateTime（2026/09/01 10:30。Intl + Asia/Tokyo。UTC 深夜が翌日になることを固定）
src/lib/auth/requestOrigin.ts                                   page からも呼ぶことを JSDoc に追記
supabase/tests/rls_tenant_isolation.sql                         shares の境界（plan(97) → 実際の assert 数）
supabase/seed.sql                                               今月を指す共有を 1 件（`/share/SEEDSHR1` をすぐ開ける。§8.7 F17）
AGENTS.md                                                       ディレクトリ図に components/shiftTable/ と (public)/share/[code]/ を足し、
                                                                「RLS を通らない読み取りは lib/queries/publicShare.ts だけ」を Supabase 節に追記
```

### 文言（v1 から移植）

| 場所 | 文言 |
| --- | --- |
| メニュー項目 | `URLでシフト表を共有` |
| モーダル見出し | `URLでシフト表を共有` |
| 期間 | `シフト期間：2026/9/1〜9/30` |
| 発行ボタン | `共有用URLを取得` / 期限切れなら `過去のシフト表は共有できません`（disabled） |
| ポイント（`Alert`） | `URLを知っている人は誰でもアクセスできます（assiftアカウントも不要）` / `URL共有後に変更したシフトの内容もリアルタイムに反映されます` / `URLはシフト期間終了日の7日後に自動で無効になります` |
| 一覧の見出し | `共有中のシフト表` / `共有中のシフト表はありません` / `公開期限が過ぎたシフト表` |
| 解除 | `共有解除` / 確認 `シフト表の共有を解除しますか？` |
| 取得日時 | `2026/09/01 10:30 に取得` |
| 公開ページ | 見出し `9/1 〜 9/30` + 店舗名、末尾 `© assift`（`/` へのリンク） |
| 404 ページ | `ページが見つかりませんでした。` / `このシフト表は、公開期限が過ぎているかすでに削除されています。` / `assift.com`（`/` へのリンク） |

---

## 5. 設計の要点

### 5.1 `lib/shares/expiry.ts`

```ts
export const SHARE_GRACE_DAYS = 6

export function isShareEnabled(endDate: string, today: string): boolean {
  return addDays(endDate, SHARE_GRACE_DAYS) >= today // YYYY-MM-DD は辞書順 = 日付順
}

export function minEnabledEndDate(today: string): string {
  return addDays(today, -SHARE_GRACE_DAYS)
}
```

テスト: 終了日当日 / 6 日後（有効）/ 7 日後（無効）、月またぎ、`minEnabledEndDate` と `isShareEnabled` が同じ境界になること。

### 5.2 `lib/shares/code.ts`

```ts
export const SHARE_CODE_LENGTH = 8
/** 英数字から 0 O 1 l I i j を除いた 55 文字（v1 が読み間違えを避けた文字） */
export const SHARE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnopqrstuvwxyz'

export function generateShareCode(randomBytes: (n: number) => Uint8Array = cryptoBytes): string
export function isShareCode(value: string): boolean // ^[A-Za-z0-9]{8}$（DB の CHECK と同じ）
```

- 剰余バイアスの除去: `256 % 55 = 36` なので `byte >= 220` は捨てて引き直す
- `isShareCode` は DB の CHECK と同じ「英数字 8 文字」。**55 文字に絞らない**（v1 由来のコードを将来も受けるため）
- テスト: 長さ 8 / `isShareCode` を満たす / 除外文字を含まない / 220 以上のバイトが読み飛ばされる / 乱数源を固定すると決定的

### 5.3 `lib/queries/shares.ts`

```ts
export type ShareRow = { id: string; code: string; startDate: string; endDate: string; createdAt: string }
export const EXPIRED_SHARES_LIMIT = 20

export async function listShares(tenantId: string, today: string): Promise<{ enabled: ShareRow[]; expired: ShareRow[] }>
```

有効・期限切れを 2 本のクエリで並行に読む（`end_date` の `gte` / `lt` は `minEnabledEndDate(today)` が境界）。どちらも `created_at desc` で `shares_tenant_created_idx` に乗る。期限切れだけ `limit(EXPIRED_SHARES_LIMIT)`。

`enabled` 側に上限は置かない。期限切れになった行は自動で `expired` 側へ移るので、放っておいても伸び続けない。

**共有 URL は `ShareRow` に持たせない**（クエリは DB の列だけを返す）。`shifts/page.tsx` が `requestOrigin()` で `${origin}/share/${code}` を組んで Client に渡す。
`requestOrigin()` は今まで Server Action からしか呼ばれていないので、page からも呼ぶことを JSDoc に足す（GET には `Origin` ヘッダが無く、`x-forwarded-host` / `host` のフォールバックに落ちる。localhost は `http` になる）。

### 5.4 `lib/queries/publicShare.ts`

```ts
export type SharedShiftTable = {
  tenantName: string
  start: string
  end: string
  staffs: { id: string; name: string }[]
  patterns: { id: string; name: string; description: string | null; colorHex: string }[]
  shifts: ShiftCell[]
  notes: { date: string; note: string }[]
}

export async function getSharedShiftTable(code: string, today: string): Promise<SharedShiftTable | null>
```

1. `isShareCode(code)` でなければ `null`
2. `shares` を `code` で 1 件。店舗名は `select('tenant_id, start_date, end_date, tenants(name)')` の埋め込みで同じ往復に載せる（`shares.tenant_id → tenants.id` の FK がある）。無い / `isShareEnabled` が偽なら `null`
3. 以降は `share.tenant_id` で並行に読む。**すべて `.eq('tenant_id', …)` を書く**
   - `staffs`: `id, name`、`retired_at is null`、`position` 順
   - `patterns`: `id, name, description, color_hex`、`position` 順
   - `shifts`: `pageAll()` で期間分（`date` → `staff_id` 順）
   - `date_notes`: 期間分
4. 退職者の行は在籍スタッフの id で落とす（007 §5.8 と同じ）

- ファイル先頭は `import 'server-only'`（他のクエリと同じ）。`createPrivilegedClient()` 自体も `server-only`
- `shifts` / `date_notes` は**共有の期間（`gte` / `lte`）でしか読まない**。URL が漏れても、公開されるのはその期間の表だけになる
- `staffs` / `patterns` は `pageAll()` を通さない。`max_rows`（1000）未満である前提は保護側の既存クエリ（`listActiveStaffs` / `listPatterns`）と同じ

### 5.5 Action（`shifts/actions.ts` に追加）

```ts
export async function createShare(input: { tenantId: string; start: string; end: string }): Promise<ActionResult<{ code: string }>>
export async function deleteShare(input: { tenantId: string; shareId: string }): Promise<ActionResult>
```

`createShare`:

1. `runAction` → Zod（`refineTerm` 済み）→ `requireUser()` → `requireTenant(tenantId)`
2. `isShareEnabled(end, todayJst())` が偽なら `fail(SHARE_EXPIRED_MESSAGE)`（§5.6 の定数。UI の disabled 文言と同じ文字列を使う）
3. `generateShareCode()` で insert。`23505` かつ `code` の unique 違反なら最大 5 回引き直す（他の `23505` はそのまま投げる）
4. `refresh()`（シフト表の中で完結する書き込み。AGENTS.md の表）

`deleteShare`: 同じ guard のあと `.delete().eq('id', shareId).eq('tenant_id', tenantId).select('id')`。**0 行なら `fail(SHARE_NOT_FOUND_MESSAGE)`**（`requireTenant` を先に通しているので「対象が無かった」の一意味になる）。

どちらも結果は `notifications.show()` で出す（008 の一括操作と同じ作法）。成功は `共有用URLを取得しました` / `共有を解除しました`、失敗は Action の `error` をそのまま赤で出す。
期限切れの共有は v1 と同じく解除できない（`EXPIRED_SHARES_LIMIT` で一覧が伸び続けないので、掃除の導線は要らない）。

### 5.6 Zod（`lib/validation/shares.ts`）

```ts
export const createShareSchema = refineTerm(z.object({ tenantId: tenantIdSchema, ...dateTermShape }))
export const deleteShareSchema = z.object({ tenantId: tenantIdSchema, shareId: shareIdSchema })
export const SHARE_NOT_FOUND_MESSAGE = '共有が見つかりません'
export const SHARE_EXPIRED_MESSAGE = '過去のシフト表は共有できません'
```

`shareIdSchema` は他の id と同じく `z.guid({ error: SHARE_NOT_FOUND_MESSAGE })`（`z.uuid()` は使わない。AGENTS.md）。
**leaf には必ず `{ error }` を付ける**。付け忘れると Zod 既定の英語がそのまま画面に出る（`toActionError` の日本語丸めは保険であって正ではない）。

この画面に出うる失敗の文言は次の 5 つに閉じる: `店舗が見つかりません` / `過去のシフト表は共有できません` / `共有が見つかりません` / `期間が正しくありません` / `日付が正しくありません`。
コードの引き直しが 5 回とも衝突した場合だけ `runAction` の汎用文言（`処理に失敗しました`）になる。

### 5.7 画面

**`ShareMenu`**（`Toolbar` の 集計 と ツール の間）: v1 と同じドロップダウン。009 の項目は「URLでシフト表を共有」だけで、010 が区切り線 + PDF / CSV を足す。
`ToolsMenu` と同じく `ActionIcon` に `aria-label="共有"` / `title="共有"` を付け、`Tooltip` では包まない（007 §10.6）。期間移動・一括操作の最中は `disabled`。

**`ShareModal`**: props は `tenantId` / `range` / `today` / `shares`（すべて Server から。`shares` の各行は URL 済み）。

- 期間 + 発行ボタン（`useTransition` で `loading`）
- ポイントの `Alert`
- 共有中リスト（`Card` 相当の `Paper`）: 期間 / URL（`Anchor`）/ `CopyButton` / 取得日時 / 「共有解除」（`modals.openConfirmModal`）
- 期限切れリスト（解除ボタンなし）
- URL は `window.location.origin` を使わず、`page.tsx` が `requestOrigin()` で組んだ絶対 URL を props で渡す（SSR と同じ文字列になる）。スマホ幅で折り返せるよう `word-break: break-all` を当てる
- 解除の確認は `modals.openConfirmModal`。`ModalsProvider` は `zIndex = getDefaultZIndex('modal') + 1` の `Modal` を 1 枚描くので、素の `Modal` である `ShareModal` の上に重なる（実装を確認。§8.5 F13）。**focus trap の入れ子だけブラウザで確かめる**

**公開ページ**: `page.tsx` が `getSharedShiftTable(code, todayJst())` → `null` なら `notFound()`。`holidaysIn(dates)` は Server で解決して `ShareTable` に渡す（`holidays.ts` は `server-only`）。
見出し（`9/1 〜 9/30` + 店舗名）と末尾のリンクは Server Component なので、`Anchor component={Link}` ではなく既存の **`LinkAnchor`**（`src/components/`）を使う（Server から関数を渡さない規約）。404 ページも同じ。

見出しは `Title order={1}`（見た目は v1 と同じ小さめの太字）にする。**単独で開かれるページなので h1 が無いと構造が伝わらない**。
表のセルには保護側と同じ `scope="col"` / `scope="row"` を付ける（007 §のとおり、930 セルのグリッドで支援技術が行と列を結べるようにする）。

**`ShareTable`**: `thead` は日付行 +（メモがある期間だけ）メモ行の 2 行。`tbody` は在籍スタッフ × 日。セルは `cellStyle()` の結果を inline style に当てた `<div>`（`data-assigned` / `data-fixed` は付け、`data-enabled` は付けない = 「担当可」のグレーは出さない）。人数行・ポップオーバー・メニューは無い。

日付の配列は `dateRange()` ではなく **`datesBetween(share.start, share.end)`** で作る（共有は保存済みの期間そのもので、店舗の作成周期とは無関係）。セルの引き当ては保護側と同じ `toShiftMap()` / `cellKey()` を使う。

### 5.8 pgTAP（`rls_tenant_isolation.sql` に「共有（009）」節を追加）

0. fixture として `\set share_a` を 1 件足す（他の節と同じ `aaaaaaaa-…` 系の id）
1. A は自テナントの `shares` を insert できる
2. A は自分の `shares` を select できる
3. B から A の `shares` は見えない（0 行）
4. B が A の `tenant_id` で insert すると `42501`
5. B の delete は 0 行で、A の行は残る
6. `end_date - start_date > 31` の insert は CHECK 違反（`23514`）

`plan(97)` は**実際に書いた assert の数**に合わせて増やす（上の 6 項目のうち「0 行 + 残っている」は 2 assert になるなど、書いてから数える）。
anon は既存の「anon が権限を持つ public のテーブルは 1 つも無い」で覆われているので個別テストは足さない。

---

## 6. 手順

1. `src/components/shiftTable/` を作り、CSS・`DateHeaderCell`・`PatternDescriptionList` を移して既存 5 ファイルの import を差し替える。あわせて
   **(a)** `cellStyle()` を抜き出して `ShiftCell` から使う、**(b)** hover を `button.cell` / `button.noteCell` に限定して `.noteButton` を `.noteCell` に改名（§8.9 F20 / F21）、
   **(c)** 凡例の枠をパターン色にする（§8.5 F2）。**ここまでで `lint` / `typecheck` / `test` が通り、シフト表の見た目が変わっていないこと**（凡例の色以外）
2. `lib/shares/expiry.ts` / `code.ts` + Vitest
3. `lib/validation/shares.ts` + Vitest
4. `lib/queries/shares.ts` / `lib/queries/publicShare.ts`
5. `shifts/actions.ts` に `createShare` / `deleteShare`
6. `ShareMenu` / `ShareModal` / `Toolbar` / `ShiftsClient` / `shifts/page.tsx`
7. `(public)/share/[code]` の `page.tsx` / `not-found.tsx` / `ShareTable`
8. pgTAP を足して `npx supabase test db`（スキーマは触らないので `db reset` は不要）
9. 検証: `npm run lint` / `npm run typecheck` / `npm test` / `npx supabase test db` + ブラウザ
   - 発行 → 別ブラウザ（未ログイン）で公開ページ → 管理側でセルを変えて再読み込み → 反映される
   - 解除 → 同じ URL が 404
   - 期限切れの期間に移動 → ボタンが disabled
   - `end_date` の 6 日後 / 7 日後で境界を確認（`shares` の行を SQL で書き換えて再読み込み）
   - スマホ幅（390px）でモーダルと公開ページの表が収まる。モーダルの上に解除の確認ダイアログが出て、キャンセルするとモーダルに戻る（focus が迷子にならない）
   - 店舗を 2 つ作ってそれぞれ共有し、**片方の URL にもう片方のスタッフが出ない**
   - 公開ページのレスポンスヘッダが `Cache-Control: private, no-store`（相当）で、CDN に載らない
10. プランに実装ログを追記してからコミットの確認を取る

---

## 7. スコープ外

- PDF / CSV（010。同じ共有メニューに入る）
- LP・規約などの静的ページ（011）。`(public)` グループはこのマイルストーンで作るが、中身は `share/[code]` だけ
- 管理画面の共有一覧（v1 `admin/shares`。Phase 2）
- 共有ページの Realtime 購読（v1 と同じくリクエスト時の DB 直読。001 §7 の決定）
- 共有の期間を任意に選ばせる UI（v1 と同じく表示中の期間のみ）
- 共有 URL の再発行 / 期限延長（v1 に無い）
- `?debug=true`（v1 の管理者だけが期限切れの共有を閲覧できる裏口）。管理機能は Phase 2

### 7.1 後続マイルストーンへの申し送り

- **010（PDF / CSV）**: 項目は `ShareMenu` の中、「URLでシフト表を共有」の下に区切り線を挟んで足す。v1 の並びと同じ
- **011（静的ページ）**: **ルートの `not-found.tsx` の導線を見直す**。今は「店舗へ戻る」（`/tenants`）だけで、
  未ログインの訪問者は proxy にログイン画面へ送られる。共有 URL を受け取った人が `/share` まで削るなど
  **ルートに落ちる経路は必ずある**ので、LP を実装するタイミングで `/` への導線に変える（`/share/<code>` の 404 は
  セグメント側が受けるので影響しない）。
  あわせて **`(public)/layout.tsx` を作るなら共有ページを外す**。公開シフト表は AppShell 無しの全画面テーブルで、LP のヘッダ / フッタが付くと縦の高さ計算（`.page` の 100dvh）が崩れる。LP 側を `(public)/(site)/` のような入れ子グループに寄せるのが素直
- **012（移行）**: `shares` は `code` と **`created_at`** をそのまま移す。`created_at` を落とすと一覧の「◯◯に取得」が全部同じ日時になる。`id` は他のテーブルと同じく `uuidv5('shares:<v1 id>')`。
  **31 日を超える v1 の行は `end_date` を丸める**（001 §5 の移行方針）。v2 の CHECK（`end_date - start_date <= 31`）がそのままでは通らない。
  丸める先は **DB の CHECK ではなくアプリの規則**（`refineTerm` = 両端を含めて 31 日 = 差 30 日）にする。
  DB のほうが 1 日ゆるいので、CHECK に合わせると「DB には入るが `createShareSchema` では作れない」行ができる（pgTAP で両方の境界を固定した）

---

## 8. プランのセルフレビュー（2026-09-20）

実装前に観点を変えながらプランを読み直した記録。8.1〜8.4 が 1 回目（プラン内部の辻褄）、8.5 以降が 2 回目以降。収束の判断は §8.14。

### 8.1 1 回目: 確かめて、そのままでよかったもの

- **`/share/[code]` が proxy に壊されない**: 旧 URL の書き換えは `^/tenants/([A-Za-z0-9_-]{22})` にしかマッチしない（`legacyUrl.ts`）。`PROTECTED_PREFIXES` にも `/share` は無いので、未ログインのまま通る
- **`not-found.tsx` はセグメント直下でよい**: Next 16 のガイド（`01-getting-started/10-error-handling.md`）が `app/blog/[slug]/not-found.tsx` を例示している。ルートの `not-found.tsx`（「店舗へ戻る」= `/tenants` へのリンク）は公開ページの訪問者に出してはいけないので、必ずセグメント側に置く
- **共有 CSS の `.page` / `.scroller` が公開ページでも成立する**: `.page` は `calc(100dvh - var(--app-shell-header-offset, 0rem) - …)` で、AppShell の外では変数が既定の `0rem` に落ちて 100dvh になる。flex 列の中で見出し・凡例・フッタが auto、`.scroller` が `flex: 1` なので v1 の `calc(100vh - 105px)` と同じ形になる
- **コードのアルファベットは 55 文字**（`0O1lIij` を除いた英数字）で、`256 % 55 = 36` → 220 以上のバイトを捨てれば偏りが消える（実際に数えて確認）
- **v1 のコードも 55 文字の範囲に収まっている**: `tr("0O1lIij", "2345678")` は `share.rb` を追加した最初のコミット（`9945a1f`）から入っていて、後から足されたものではない。とはいえ `isShareCode` は DB の CHECK と同じ英数字 8 文字のままにして、想定外の値でも公開ページの入口で落とさない

### 8.2 プランを直したところ

| 直した点 | 理由 |
| --- | --- |
| 発行ボタンの可否に使う「今日」を Server から渡す（§3.2） | Client で `new Date()` を見ると端末の TZ で判定してしまう。判定関数だけ共有しても入口がずれる |
| `getSharedShiftTable` を `cache()` で包み、`generateMetadata` で店舗名を出す（§3.5） | 包まずに `generateMetadata` を足すと、公開ページの DB 読み取りが丸ごと 2 回走る |
| 共有 URL はクエリではなく `page.tsx` が組む（§5.3） | クエリは DB の列だけを返すほうが役割が濁らない。`requestOrigin()` を page から呼ぶのは初めてなので JSDoc も直す |
| 店舗名は `shares` の埋め込みで読む（§5.4） | 公開ページの往復が 6 → 5 本になる。FK があるので PostgREST がそのまま解決できる |
| 発行・解除の通知を明記（§5.5） | 008 の一括操作と作法をそろえる。プランに書いていないと実装時に落ちる |
| `ShareMenu` の `aria-label` / `disabled`（§5.7） | 007 §10.6 の「Tooltip で包むと Menu の aria が壊れる」を踏むところだった |
| pgTAP は assert を数えてから `plan(n)` を直す（§5.8） | 「6 項目 = 6 assert」とは限らない（0 行 + 残存の確認は 2 つ） |
| §3.7（GRANT から UPDATE を外す）は見送り | 実害が無く、スキーマ再生成のコストのほうが大きい。013 以降に差分 migration で回す |

### 8.3 検討して採らなかった案

- **`listShifts()` にクライアントを引数で渡して公開ページと共有する**: 15 行の重複は消えるが、汎用のクエリ関数に service_role を差し込める口ができる。「RLS を通らない読み取りは `publicShare.ts` だけ」という境界のほうが価値が大きいので、重複を選ぶ
- **公開ページのセルを `ShiftCell`（ボタン）で描く**: 公開側に不要な `onClick` / `aria-haspopup` / hover が付き、Client Component になる。共有するのは `cellStyle()`（色と太字の規則）までにとどめる
- **共有 URL を `window.location.origin` で組む**: モーダルは開いたときにしか mount しないので実害は出にくいが、Server が持っている情報をわざわざ Client で作り直すことになる

### 8.4 残る制約（実装時に踏まえる）

- `CopyButton` は `navigator.clipboard` を使うので、**セキュアコンテキスト以外（`http://<LAN IP>:3000` で開いた開発サーバーなど）ではコピーが効かない**。URL のテキスト自体は選択できる形で出しておく
- 公開ページのクエリが失敗したときの受け皿は無い（アプリ全体に `error.tsx` が無い）。009 では足さず、必要になったら別途

### 8.5 2 回目のレビュー（v1 パリティ / セキュリティ / 境界 / Mantine の機構）（2026-09-20）

1 回目は「プランの中で辻褄が合うか」を見た。2 回目は **v1 の実物と v2 の既存コード・ライブラリの実装**に当てて、書いてあることが本当に成り立つかを見た。

| # | 指摘 | 対応 |
| --- | --- | --- |
| F1 | **1 回目の修正が行き過ぎていた。** v1 の公開ページのタイトルは店舗名を含まない（`current_tenant` が無いので既定の `assift ｜ スマホで簡単シフト表作成`）。タイトルに店舗名を入れると、LINE などに URL を貼ったときのプレビューに店舗名が出る | `metadata` を静的に戻し（`title: 'シフト表'`）、`generateMetadata` と `cache()` をやめた（§3.5）。**1 回目の判断の取り消し** |
| F2 | v1 の凡例は名前の枠を**パターン色**で描いていたが、007 の `PatternDescriptionList` は色を落としていた。公開ページには popover が無く、凡例が唯一の色の手がかりになる | 切り出しのときに `colorHex` を props に足して直す（§3.6） |
| F3 | v1 の `shares#show` には `?debug=true`（管理者だけ期限切れを閲覧）がある | 移植しない。スコープ外に明記（§7） |
| F4 | `publicShare.ts` の `server-only` と、読み取りを共有期間に限ることがプランに書かれていなかった | §5.4 に明記。URL が漏れてもその期間の表しか出ない、が設計上の約束になる |
| F5 | `staffs` / `patterns` を `pageAll()` に通さない前提が暗黙だった | 「`max_rows` 未満の前提。保護側の既存クエリと同じ」と明記（§5.4） |
| F13 | 素の `Modal` の中から `modals.openConfirmModal` を呼ぶのは、このリポジトリで初めて | `@mantine/modals` の `ModalsProvider` を読んだ。**`zIndex = getDefaultZIndex('modal') + 1` の `Modal` を 1 枚描く**ので重なりは成立する。focus trap の入れ子だけ検証項目に足した（§6） |
| F14 | 公開ページ（Server Component）からリンクを出す設計で、`Anchor component={Link}` を書きかけていた | 既存の `LinkAnchor` を使うと明記（§5.7）。AGENTS.md の「Server から関数を渡さない」に該当 |

### 8.6 2 回目で確かめて、変えなかったもの

- **公開ページの RSC ペイロードにパターンの uuid が載る**（Mantine は Client Component なので `key` と props が payload に入る）。`anon` にはテーブルの権限が一切無く、id を知っても何もできないので実害なし。ページを全部プレーンな DOM にするほどの理由にはならない
- **共有コードの総当たり**: 55^8 ≈ 8.4×10^13。レート制限は入れない
- **共有後に退職したスタッフは公開ページから消える**（在籍スタッフだけを読むため）。v1 と同じ挙動なので合わせる。パターンを削除すると `shifts` が cascade で消え、公開ページからもそのセルが消えるのも同様
- **`code` の照合は case-sensitive**（`unique` 索引そのまま）。v1 も同じで、コピー & ペーストで渡す前提

### 8.7 3 回目のレビュー（実装順序・検証手段・後続マイルストーン）（2026-09-20）

3 回目は「この順で実装したとき、各段階で何が確かめられるか」と「010 以降が踏む地雷を残していないか」を見た。

| # | 指摘 | 対応 |
| --- | --- | --- |
| F15 | **011 が `(public)/layout.tsx` を作ると、共有ページがその殻を被る。** 公開ページは AppShell 無しの全画面テーブルなので、LP のヘッダ / フッタが付くと壊れる | §7 の申し送りに明記。011 では LP 側を `(public)/(site)/` のような入れ子グループに寄せるか、共有ページを別グループに移す |
| F16 | 012 の移行で `shares.created_at` を落とすと、一覧の「◯◯に取得」が全部同じ日時になる | §7 の申し送りに明記（`code` と `created_at` はそのまま移す） |
| F17 | **ローカルで公開ページを開く手段が無い。** seed にはシフトも共有も無いので、画面から店舗 → アサイン → 発行と辿るまで `/share/...` を 1 回も踏めない | seed に「今月」を指す共有を 1 件足す（`code = 'SEEDSHR1'`、期間は `date_trunc('month', current_date)` から月末）。シフトはアサインすれば即座に公開ページへ出るので、行は増やさない |
| F18 | 手順 1（部品の切り出し）だけで `lint` / `typecheck` / `test` が通ることは書いたが、**手順 4 の時点で `publicShare.ts` はどこからも呼ばれない**。ESLint の未使用検出に引っかからないか | export された関数なので引っかからない（既存の `lib/queries/*` と同じ形）。手順はこのままでよい |
| F19 | `npm run typecheck` は `next typegen` を先に走らせるので、**`PageProps<'/share/[code]'>` はルートを作るまで存在しない** | 手順 7 でページを作ってから typecheck する、という今の順序で問題ない（手順 6 までは触らない） |

### 8.8 3 回目で確かめて、変えなかったもの

- **同じ期間を 2 回発行すると 2 行できる**（v1 と同じ）。「既にある共有を返す」ほうが親切に見えるが、v1 の利用者は「前の URL を無効にしたいから取り直す」使い方もしている。挙動を変えない
- **まだ始まっていない未来の期間の共有も「共有中」に入る**（`end_date` 基準なので当然）。v1 と同じ
- **`createShare` の戻り値 `{ code }`** は通知に使わなくても残す。010 以降で「発行した URL をすぐコピー」を足すときの足がかりになる

### 8.9 4 回目のレビュー（コードを書くつもりで型と CSS をなぞる）（2026-09-20）

4 回目は「プランのとおりに書いたら何にぶつかるか」を、共有する CSS と関数シグネチャの粒度で見た。

| # | 指摘 | 対応 |
| --- | --- | --- |
| F20 | **共有する CSS に hover が入っている**（`.cell:hover` / `.noteButton:hover`）。公開ページのセルは押せない `<div>` なのに、カーソルを乗せると背景色と文字色が変わる | 切り出しのときに hover を `button.cell:hover` / `button.noteCell:hover` に限定する（§3.6） |
| F21 | `.noteButton` という名前を公開ページの `<div>` に当てることになる | `.noteCell` に改名する。保護側の `DateNoteCell` は元々 import を差し替えるので追加の手間は無い |
| F22 | 公開ページの日付配列を `dateRange()` で作ると、**店舗の作成周期で丸められて共有した期間とずれる**（共有は保存済みの期間が正） | `datesBetween(start, end)` を使うと明記（§5.7） |
| F23 | `formatJstDateTime` にテストを書くと書いていなかった | `datetime.test.ts` を成果物に追加。UTC 深夜（`2026-09-01T15:30:00Z` → `2026/09/02 00:30`）を固定する |

### 8.10 4 回目で確かめて、変えなかったもの

- `ShareTable` は `lib/shifts/key` の `toShiftMap()` / `cellKey()` をそのまま使える（Map の構造は保護側と同じ）。公開用に別の引き当てを作らない
- 型名 `ShiftCell`（`lib/shifts/key`）とコンポーネント名 `ShiftCell`（保護側 `_components`）の重複は、公開ページがコンポーネントのほうを import しないので衝突しない

### 8.11 5 回目のレビュー（失敗パスの文言とアクセシビリティ）（2026-09-20）

5 回目は「うまくいかなかったとき」と「読み上げで使うとき」に何が起きるかを見た。

| # | 指摘 | 対応 |
| --- | --- | --- |
| F24 | `shareIdSchema` を「`z.guid()` ベース」としか書いておらず、**leaf の `{ error }` を落とす書き方**になっていた（AGENTS.md が名指しで禁じている落とし穴） | §5.6 に `z.guid({ error: SHARE_NOT_FOUND_MESSAGE })` と明記し、この画面に出る失敗文言を 5 つに数え上げた |
| F25 | 公開ページに見出し要素が無く、`<h1>` の無いページになるところだった。共有ページは**単独で開かれる**ので、保護ルートのように上位の見出しが無い | 見出しを `Title order={1}` にする（§5.7） |
| F26 | 表の `scope` 属性について公開側で何も書いていなかった（保護側は 007 で入れている） | `scope="col"` / `scope="row"` を付けると明記（§5.7） |

### 8.12 5 回目で確かめて、変えなかったもの

- **スタッフ 0 人 / パターン 0 件の店舗を共有した場合**は、日付行だけの空の表が出る（v1 と同じ）。オーナーは共有前にチュートリアルを通っているので、実際にはほぼ起きない
- **印刷**は考えない（v1 も未対応。紙は 010 の PDF が担当）
- v1 の `user-scalable=no` は移植しない。ピンチズームを塞ぐのは公開ページで特に不利益が大きい
- **2 タブで同じ共有を解除**すると、後から押したほうは 0 行 → `共有が見つかりません`。正しい結果なので分岐は足さない

### 8.13 6 回目のレビュー（5 回分の修正を入れた文書として読み直す）（2026-09-20）

6 回目は新しい観点を足さず、**2〜5 回目の修正を入れたあとのプランを通しで読んで、古くなった記述と実装者が取りこぼす指示**を探した。

| # | 指摘 | 対応 |
| --- | --- | --- |
| F27 | 手順 1 が「移して import を差し替える」だけのままで、4〜5 回目で決めた **hover の限定・`.noteCell` への改名・凡例の色**が手順に現れていなかった（§8 を読まないと落ちる） | 手順 1 に (a)(b)(c) として畳み込み、完了の目安（凡例の色以外は見た目が変わらない）も足した |
| F28 | §3.1 の「`Promise.all` に 2 本足して」は、`listShares()` が 1 本に見える呼び出し側の実態とずれていた | 「`listShares()` を 1 本（内部は 2 クエリ）」に直した |
| F29 | pgTAP の節に fixture（A の共有 1 件）の用意が書かれていなかった | `\set share_a` を 0 番として明記 |
| F30 | `formatYearMonthDay` / `formatJstDateTime` のテストの中身が「書く」としか決まっていなかった | 固定する値（1 桁の月日・月またぎ / UTC 深夜）まで成果物に書いた |

### 8.14 収束の判断

6 回目で出たのは**すべて文書の整合と手順の書き漏れ**で、設計上の指摘は出なかった（新しい観点を足した 2〜5 回目は毎回 3〜7 件の設計の指摘が出ていた）。
v1 パリティ・セキュリティ・境界値・Mantine の機構・型と CSS・失敗パス・アクセシビリティ・後続マイルストーンの 8 観点を一度ずつ通したので、**プラン段階のレビューはここで収束とする**。

残る不確実性は「実際に動かすまで分からない」もの（focus trap の入れ子・スマホ幅の収まり・レスポンスヘッダ）に絞られていて、これらは §6 の検証項目に入っている。
実装後は 008 と同じように、書いたコードに対して改めてレビューを回す。

---

## 9. 実装ログ（2026-09-20）

ブランチ `009-share`（`008-shifts-tools` から）。Next 16.3.5 / Mantine 9.6 / Supabase CLI / Zod 4。

### 9.1 成果物

§4 の構成どおり。プランに無かった追加・変更:

| パス | 内容 |
| --- | --- |
| `src/components/shiftTable/ShiftTable.module.css` の `.staffName` | **追加**。公開ページのスタッフ名セルは押せない `<div>` なので、`.menuButton`（ボタン）から文字の体裁だけを取り出した 1 クラス。§3.6 の 3 つ + `cellStyle` に加えてこれだけ増えた |
| `ShareItem` 型の置き場 | `ShareModal.tsx` に置いた（`page.tsx` が組んだ URL 込みの行）。`lib/queries/shares.ts` の `ShareRow` は DB の列だけ、という §5.3 の分担をそのまま型に写した形 |
| `SHARE_CODE_ATTEMPTS` / `isDuplicateCode()` | `shifts/actions.ts` に追加。衝突リトライ（§3.3）の実装。`23505` かつ制約名が `shares_code_key` のときだけ引き直し、他はそのまま投げる |
| `formatJstDateTime` の `hourCycle: 'h23'` | プランに無かった指定。ロケールによっては 0 時を `24:30` と書くため明示した（テストで固定） |
| `lib/patterns/colors.ts` の `outlineColor()` | **追加**（レビュー 1 巡目）。凡例とポップオーバーが共有する「白いパターンは枠線色を当てない」規則。`PatternPopover` に同じ条件が直書きされていたのを寄せた |
| `lib/auth/requestOrigin.ts` の `SITE_URL` / `isLoopbackHost()` / `normalizeSiteUrl()` | **追加**（レビュー 3・5・6 巡目）。§9.5 を参照。`.env.example` に `SITE_URL` を足した |

### 9.2 プランどおり確認できたこと

- **手順 1（部品の切り出し）だけで lint / typecheck / test が通り**、シフト表の見た目は凡例の枠色以外変わらなかった（§8.13 F27 の狙いどおり）
- `requestOrigin()` は GET でも動く（`Origin` が無いので `host` のフォールバックに落ち、localhost は `http`）。シフト表のペイロードに `http://localhost:3100/share/SEEDSHR1` が入ることを実測
- `shares` への埋め込み（`select('tenant_id, start_date, end_date, tenants(name)')`）は `supabase gen types` が**非 null のオブジェクト**として型付けする。往復は 5 本に収まった
- 素の `Modal` の上に `modals.openConfirmModal` が重なる（§8.5 F13）。スクリーンショットで確認し、キャンセル後のフォーカスは共有モーダルの中に戻る
- 発行・解除のあとはモーダルを開いたまま一覧が入れ替わる（`refresh()`）

### 9.3 検証結果

```
npm run lint / typecheck / build / format:check → OK
npm test        → 37 files / 298 tests passed（009 で 7 ファイル / 38 件を追加）
npx supabase test db → 108 tests PASS（97 → 108。共有の 11 件）
```

`npx supabase db reset` は**実行していない**（スキーマを触っていないため。§6 手順 8）。
seed に足した行は同じ SQL をローカル DB に適用して確認した。まっさらな状態で確かめるときは `db reset` を実行する。

ブラウザ検証は `next start`（本番ビルド）に対して行い、Server Action は本番ビルドの action id を使って直接呼んだ。
画面操作は headless Chrome を CDP で駆動（390px）。結果はすべて psql で DB と突き合わせている。

| 検証 | 結果 |
| --- | --- |
| 公開ページ（未ログイン） | 200。見出し `9/1 〜 9/30` + 店舗名、日付 30 列、在籍 8 人、メモ行、凡例、`© assift` |
| セルの描画 | 確定 = パターン色で塗り + 白文字 / 下書き = 白地 + 上辺の色帯 / 確定かつ白のパターン = 既定の文字色。必要人数行も「担当可」のグレーも出ない（v1 と同じ） |
| メモ行 | 期間内にメモがあるときだけ出る |
| 公開期限の境界 | `end_date` の 6 日後 = 200、7 日後 = 404（JST の今日で判定） |
| 存在しない / 形式違反のコード | `NOSUCH01` も `bad` も 404（DB を引く前に落ちる） |
| 404 の中身 | セグメントの `not-found.tsx`（「ページが見つかりませんでした。」/「assift.com」）。ルートの「店舗へ戻る」は出ない |
| キャッシュ | 本番の応答ヘッダが `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` |
| `createShare` | `{ ok: true, data: { code: 'r6fAXGAP' } }` → その URL が即座に 200 |
| `createShare` の失敗 | 期限切れの期間 = `過去のシフト表は共有できません` / 32 日 = `期間が正しくありません` / 他店舗 = `店舗が見つかりません` / `2026-02-30` = `日付が正しくありません`（§5.6 で数え上げた 5 文言のうち 4 つ） |
| `deleteShare` | 成功 → 同じ URL が 404 → 2 回目・他店舗の id・uuid でない id はすべて `共有が見つかりません` |
| 店舗をまたぐ可視性 | 店舗を 2 つ作って相互に確認。**どちらのページにも相手のスタッフ・メモ・パターン・店舗名が出ない** |
| 退職者 | 共有後に退職させると公開ページから行ごと消える（v1 と同じ） |
| 390px | 公開ページもモーダルも横スクロールしない（`scrollWidth == innerWidth == 390`）。表は内側だけ横スクロールする（1595px） |
| 入れ子のダイアログ | 共有モーダルの上に確認ダイアログが重なり、キャンセルで共有モーダルへ戻る（フォーカスも戻る） |
| 凡例 | パターン名の枠がパターン色になった（§8.5 F2 の修正）。白いパターンだけは既定の枠線色 |
| `SITE_URL` | 設定すると共有 URL がその origin になる（`https://assift.example.com/` → 末尾の `/` は落ちる）。未設定ならリクエストのヘッダから組む |
| 共有中が複数件 | 6 件すべてが一覧に出る（`pageAll` 化の後も欠けない） |

### 9.4 実装して分かったこと

- **Next 16 の `notFound()` は HTML の body を空で返し、404 の UI はクライアントで描かれる。** `<div hidden></div>` + flight payload だけが返り、
  可視の DOM はハイドレーション後に現れる。ステータス（404）と `<meta name="robots" content="noindex">` はサーバーが返すので、
  クローラや CDN から見た挙動は正しい。`force-dynamic` の有無とも、このページ固有の事情とも無関係（`notFound()` だけの probe ルートで再現を確認）。
  ビルド時に prerender されるルートの 404（`/no-such-page` → ルートの `not-found.tsx`）は HTML に出るので、両者は別物として扱う
- `CopyButton` はセキュアコンテキストでのみ動く（§8.4）。URL は `Anchor` のテキストとして出してあるので、効かない環境でも選択して渡せる
- 共有 URL は `page.tsx` が `requestOrigin()` で組むため、**`next start` のポートがそのまま URL に入る**。本番では `SITE_URL`、無ければ `x-forwarded-host` を見る
- **プラン §3.5 の「公開ページは Client JS ゼロ」は、正確にはコンポーネント（`ShareTable`）の話。**
  ページ自体は root layout の `MantineProvider` 配下にあり、見出しやリンクに使う Mantine の Client Component は載る。
  意図（セル・ヘッダ・凡例に操作を持ち込まない）は満たしているが、ページ全体が素の HTML になるわけではない
- **`listShares` は `refresh()` のたびに走る**（アサインのたびに 2 クエリ + ペイロード増）。実測すると
  期限切れ側は索引で 0.145ms、26 件で 227KB 中 4.1KB（+1.8%）だった。アサインが既に 5 クエリを再実行していることを踏まえ、
  §3.1 の「page.tsx で毎回読む」はそのままにした（nuqs でモーダルの開閉を URL に出す案は、モーダルが往復を挟んでから開くことになる）

---

## 10. 実装後のコードレビュー（2026-09-20）

実装した差分に対して観点を変えながらレビューを回した記録（008 と同じ進め方）。6 巡で収束と判断した。

| 巡 | 出た指摘 | 対応 |
| --- | --- | --- |
| 1 | 3 件 | 2 件修正 / 1 件は誤りと確認 |
| 2 | 2 件 | 2 件修正 |
| 3 | 2 件 | 1 件修正 / 1 件は実測して現状維持 |
| 4 | 0 件 | — |
| 5（max） | 15 件 | 9 件修正 / 6 件はプランの決定・実測により却下 |
| 6 | 2 件 | 2 件修正（うち 1 件はこの文書の更新漏れ） |
| 7 | 1 件 | 却下（011 の LP 実装に申し送り） |
| 8 | 1 件 | 却下（到達しない前提条件） |

7・8 巡目は「共有中が 1000 件を超えたうえでページング中に同時 INSERT があれば」のような到達しない条件の話になった。
**指摘の件数ではなく深刻度で収束を判断する**（回せば毎回何かは出るが、直すべきものは 6 巡目で尽きた）。

### 10.1 直したところ

| # | 指摘 | 対応 |
| --- | --- | --- |
| R1 | 凡例の枠に**白いパターンの逃げ道が無い**（`PatternPopover` には元からあった）。白地に白枠で枠ごと消える | `outlineColor()` を `lib/patterns/colors.ts` に置き、凡例とポップオーバーで共有（テスト付き） |
| R2 | `ShareModal` の失敗パスで `router.refresh()` を呼んでいない。`failure()` の JSDoc と、007 / 008 の作法から外れていた | 発行・解除の両方で読み直す。別タブでの削除や日付が変わったケースがその場で解消する |
| R3 | `PatternDescriptionList` の 1 行が `printWidth: 100` 超過（`format` 忘れ） | `npm run format` |
| R4 | `generateShareCode` は差し替えた乱数源が使えるバイトを返さないと**無限ループ**する | `MAX_DRAWS` で上限を置き、埋まらなければ例外。テストを追加 |
| R5 | `requestOrigin()` の `http` 判定が `localhost` の文字列一致のみ。`http://127.0.0.1:3000` で開くと共有 URL が `https://` になって開けない | `isLoopbackHost()`（`localhost` / `127.0.0.1` / `[::1]`）に切り出してテスト |
| R6 | 共有 URL がリクエストのヘッダ由来のまま。Host を固定しない構成や preview デプロイでは、配る URL が意図しないホストになりうる | `SITE_URL` を正準オリジンとして優先する（任意設定）。`.env.example` に追記 |
| R7 | `SITE_URL` にスキームの無い値（`assift.com`）を入れると、共有 URL が壊れたうえ `new URL('/auth/callback', origin)` が例外になり Google ログインごと落ちる | `normalizeSiteUrl()` で `http(s)` の絶対 URL だけ受け、駄目なら警告してヘッダに戻す（テスト付き） |
| R8 | `listShares` の**共有中**に上限が無く、`max_rows`（1000）で黙って切られうる。切られた行は画面から解除できないのに URL は生きている | `pageAll()` を通す（`created_at` の同値に備えて `id` を第 2 キーに）。コメントの「伸び続けない」という説明も誤りだったので直した |
| R9 | `isShareEnabled` が `YYYY-MM-DD` でない値で **fail open**（`'Invalid Date' >= '2026-09-20'` は真）。未ログインページの唯一の期限判定 | `isDateString()` で先に弾いて false にする（AGENTS.md の規約どおり）。テストを追加 |
| R10 | `isDuplicateCode` が制約名 `shares_code_key` の部分一致。この名前は `schemas/` に無く、sync のたびに作り直される生成 migration にしか現れない | `isRetryableConflict`（23505 なら引き直す）に変更。`shares` の unique は `code` と主キーだけで、主キーも引き直しのたびに振り直される |
| R11 | 「ログに残す」とコメントしながら何も出していない（`runAction` が例外を握るので痕跡が残らない） | `console.warn('[shares] …')` を足した（`auth/callback` などと同じ作法） |
| R12 | pgTAP の DELETE が `:share_a` / `:share_b` を使わず uuid 直書き。id がずれると「0 行」を期待する側は緑のまま腐る | 変数に統一。あわせて **UPDATE の境界**（B の共有の公開期限を延ばせない）と、CHECK の境界ちょうど（差 31 日は通る / 32 日は 23514）を追加。`plan(105)` → `plan(108)` |
| R13 | seed の「今月」が `current_date`（コンテナは UTC）。JST の 0〜9 時に `db reset` すると前月を指す | `(current_timestamp at time zone 'Asia/Tokyo')::date` を基準にした |
| R14 | `generateShareCode` の内側ループが 8 文字を超えうる（要求より多く返す乱数源のとき） | 長さに達したら `break`。DB の CHECK に頼らない |

### 10.2 指摘を受けて確かめ、変えなかったもの

- **`not-found.tsx` の `metadata` は死んでいる**（レビュー 1 巡目）→ **誤り**。タイトルを変えた probe で反映を確認した（`resolve-metadata.js` は not-found の convention module も見る）
- **`listShares` が `refresh()` のたびに走る**（3・5 巡目）→ 実測（§9.4）のうえ §3.1 の設計を維持
- **`shares` の GRANT に UPDATE が残っている**（5 巡目）→ §3.7 のとおり 013 に先送り。他テナントの行を更新できないことは pgTAP に足した（R12）
- **`SUPABASE_SECRET_KEY` 未設定で公開ページが 500 になる**（5 巡目）→ §8.4 のとおり受け皿（`error.tsx`）は 009 では足さない
- **公開ページの見出しに年が無い**（5 巡目）→ §4 の文言表（v1 パリティ）どおり。モーダル側は開始日に年が付く
- **`publicShare.ts` が `listShifts` の行マッピングを重複して持つ**（5 巡目）→ §8.3 の決定どおり、service_role を差し込める口を作らないほうを取る
- **`/share`（コード無し）はルートの 404 に落ち、未ログインだと「店舗へ戻る」= ログイン画面に送られる**（7 巡目）→
  ルートの 404 の導線そのものの問題で、直すなら LP のある 011。§7.1 に申し送った
- **`listShares` が `pageAll` の行を id で重複排除していない**（8 巡目）→ `pageAll` は「ページの間に書き込みが挟まると
  境界の行が重複しうる。読み手は重複に耐える形で使う」契約（`pageAll.ts`）。到達には 1 店舗で**有効な共有が 1000 件超**、
  かつページングの最中に別セッションが INSERT することが要り、影響も一覧に 1 行重複して見えるだけなので足さない

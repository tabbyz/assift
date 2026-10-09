# 001: Phase 1 アーキテクチャ設計

v1（Rails）の分析（`docs/v1-analysis.md`）と Phase 1 の決定事項を踏まえた、v2 全体の設計。
以降のマイルストーンごとの実装プランは `docs/plans/00N-<slug>/` に分割して作成する。

---

## 1. スコープ

### Phase 1 に含む

- 認証（メール + パスワード、Google、パスワード再設定、アカウント削除）
- 店舗（複数店舗、作成・編集・削除・切替、旧 URL リダイレクト）
- 設定（スタッフ、勤務パターン、自動アサイン制約の CRUD、店舗情報）
- チュートリアル
- シフト表（期間表示、アサイン、ペアパターン、下書き/確定、必要人数、日付メモ、一括操作、デフォルト勤務パターン、コピー、集計）
- URL 共有（発行・一覧・解除、公開ページ）
- PDF / CSV エクスポート
- 静的ページ（LP、利用規約、プライバシー、特商法、アップデート情報）
- v1 データ移行とカットオーバー

### Phase 1 に含まない

- Stripe サブスクリプション、スタッフ上限判定、請求履歴画面
- 自動アサインエンジン（制約の **設定 UI は含む**）
- スタッフグループ（廃止）
- 管理画面（グラフ、一斉メール、招待の代理承認）
- PWA の Service Worker（`manifest` のみ任せる）、Beamer、Google Analytics

---

## 2. 技術スタック

`.tmp/project-template.md` に準拠。

| 層 | 選択 |
| --- | --- |
| アプリ | Next.js App Router / React / TypeScript strict |
| UI | Mantine（Tailwind は使わない）/ `@tabler/icons-react` |
| DB / Auth | Supabase Postgres + Auth + RLS（`@supabase/ssr`） |
| URL 状態 | nuqs（シフト表の `start` のみ） |
| バリデーション | Zod |
| 日付 | dayjs（`Asia/Tokyo` 固定。カレンダー日付は `YYYY-MM-DD` 文字列で扱い Date 型の TZ 問題を避ける） |
| 祝日 | `@holiday-jp/holiday_jp`（v1 の YAML ハードコードを置換） |
| PDF | `@react-pdf/renderer`（Route Handler、Node runtime、Noto Sans JP を `public/fonts` に同梱） |
| CSV | `iconv-lite`（CP932） |
| テスト | Vitest（期間計算・ペア処理・コピー・CSV 生成などの純関数） |
| ホスティング | Vercel + Supabase |

---

## 3. データモデル

### 3.1 v1 → v2 対応表

| v1 | v2 | 変更点 |
| --- | --- | --- |
| users | `auth.users` + `public.profiles` | bcrypt ハッシュをそのまま移行。Stripe 関連列は profiles に nullable で保持 |
| tenants | `tenants` | `user_id` → `owner_id`。PK は v1 の `uuid`（22 文字トークン）から uuid v5 で導出。旧 URL は同じ式で解決する |
| staffs | `staffs` | `disabled` → `retired_at`。`kana`（UI 未使用）と `group_id` を廃止。`available_wdays` → `smallint[]` |
| staffs.available_patterns（YAML） | `staff_patterns` | 中間テーブル化（FK で整合性確保） |
| staffs.default_patterns（YAML） | `staff_default_patterns` | 中間テーブル化 |
| staff_groups | （廃止） | |
| patterns | `patterns` | `pair_pattern_id` に FK（`ON DELETE SET NULL`）。`default_required_nums` → jsonb |
| shifts | `shifts` | `tenant_id` 追加、`staff_id NOT NULL` + FK、`UNIQUE(staff_id, date)`。`assist_token` は廃止（自動アサイン Phase で `assist_run_id` として再設計） |
| required_nums | `required_nums` | `tenant_id` 追加 |
| restrictions | `restrictions` | `kind` を enum 化、pattern FK 追加 |
| events | `date_notes` | 名前を用途に合わせて変更。`UNIQUE(tenant_id, date)` |
| shares | `shares` | `code` はそのまま |
| usage_records | ~~`plan_change_logs`~~ | **019 で取りやめ**（移行せず表ごと削除。元のデータは v1 のダンプに残す。019 §5.2）。当初: プラン変更履歴。Phase 1 では UI なし |
| invoices | （移行しない） | 本番にレコードなし（書き込みコードも存在しない）。請求書は Stripe に全履歴がある |

移行する行の PK は v1 の ID から **uuid v5 で決定的に導出**する。`uuidv5('<table>:<v1 id>', NS)` とし、tenants だけは整数 ID ではなく 22 文字トークンを名前にする。対応表や `legacy_id` 列は持たず、FK も同じ式で書き換える。再実行は `ON CONFLICT (id)` で冪等。名前空間 `NS` は固定の UUID で、移行スクリプトと（旧 URL 解決のため）アプリの両方が環境変数 `V1_UUID_NAMESPACE` として参照する。

### 3.2 DDL（`supabase/schemas/` に置く SQL の骨子）

```sql
-- enums
create type public.shift_cycle as enum ('month', 'half_month', 'two_week', 'week');
create type public.pattern_kind as enum ('workday', 'dayoff');
create type public.restriction_kind as enum (
  'deny_pattern_pair', 'max_work_week', 'max_work_consecutive', 'sat_or_sun_dayoff'
);

create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text not null,
  is_admin               boolean not null default false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  trial_end              timestamptz,
  max_staffs_count       integer,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 20),
  shift_cycle   public.shift_cycle not null default 'month',
  start_of_week smallint not null default 0 check (start_of_week between 0 and 6),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tenants_owner_id_idx on public.tenants (owner_id);

create table public.staffs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 10),
  position        integer not null default 0,
  retired_at      timestamptz,
  available_wdays smallint[] not null default '{0,1,2,3,4,5,6}',
  max_work_week   smallint not null default 5 check (max_work_week between 0 and 7),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index staffs_tenant_position_idx on public.staffs (tenant_id, position);

create table public.patterns (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 6),
  description           text check (char_length(description) <= 10),
  color_hex             text not null default '#FFFFFF' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  kind                  public.pattern_kind not null default 'workday',
  pair_pattern_id       uuid references public.patterns (id) on delete set null,
  position              integer not null default 0,
  default_required_nums jsonb not null default '{}'::jsonb,  -- {"0".."6","holiday": number}
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index patterns_tenant_position_idx on public.patterns (tenant_id, position);

-- スタッフが選択可能な勤務パターン（v1 available_patterns。許可リスト）
create table public.staff_patterns (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  staff_id   uuid not null references public.staffs (id) on delete cascade,
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  primary key (staff_id, pattern_id)
);

-- スタッフのデフォルト勤務パターン（v1 default_patterns）
create table public.staff_default_patterns (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  staff_id   uuid not null references public.staffs (id) on delete cascade,
  day_key    text not null check (day_key in ('0','1','2','3','4','5','6','holiday')),
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  primary key (staff_id, day_key)
);

create table public.shifts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  staff_id   uuid not null references public.staffs (id) on delete cascade,
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  date       date not null,
  fixed      boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, date)
);
create index shifts_tenant_date_idx on public.shifts (tenant_id, date);

create table public.required_nums (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  date       date not null,
  num        smallint not null default 0 check (num >= 0),
  unique (pattern_id, date)
);
create index required_nums_tenant_date_idx on public.required_nums (tenant_id, date);

create table public.restrictions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  kind        public.restriction_kind not null,
  days        smallint check (days between 1 and 31),
  pattern1_id uuid references public.patterns (id) on delete cascade,
  pattern2_id uuid references public.patterns (id) on delete cascade,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.date_notes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  date       date not null,
  note       text not null check (char_length(note) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, date)
);

create table public.shares (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  code       text not null unique,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 31)
);
create index shares_tenant_created_idx on public.shares (tenant_id, created_at desc);

-- プラン変更履歴（v1 usage_records。Phase 1 では UI なし）
create table public.plan_change_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  staffs_count integer not null,
  created_at   timestamptz not null default now()
);
create index plan_change_logs_user_created_idx on public.plan_change_logs (user_id, created_at desc);
```

### 3.3 private スキーマ

> **003 で変更**: `is_tenant_owner(tenant_id)` は行の列を引数に取るため行ごとに評価される。
> 引数なしの集合関数 `owned_tenant_ids()` に変更した。実装は `docs/plans/003-schema/README.md` §3.2 / §5.1 を参照。

| 関数 / トリガ | 役割 |
| --- | --- |
| `private.owned_tenant_ids()` | ログインユーザーがオーナーのテナント id の集合を security definer で返す。RLS から `tenant_id in (select ...)` で使う |
| `private.handle_new_user()` | `auth.users` INSERT 時に `profiles` を作成（email をコピー） |
| `private.sync_profile_email()` | `auth.users.email` 更新時に `profiles.email` を同期 |
| `private.set_updated_at()` | `updated_at` の自動更新 |

`[api] schemas` に `private` は出さない。

### 3.4 RLS

マルチテナントなのでテンプレートの二層構成。

- **RESTRICTIVE** `{table}_restrict_same_tenant`（`FOR ALL TO authenticated`）: `tenant_id in (select private.owned_tenant_ids())` を USING / WITH CHECK 両方に
- **PERMISSIVE** `{table}_member_all`（`FOR ALL TO authenticated USING (true) WITH CHECK (true)`）: 現状オーナーだけがメンバーなので権限は全許可。将来「スタッフ本人のログイン」等を足すときにここでロール分岐する
- `tenants`: `owner_id = (select auth.uid())` で SELECT / UPDATE / DELETE、INSERT は WITH CHECK 同条件
- `profiles`: 自分の行のみ SELECT（003 §3.5 で UPDATE は付けないことに変更）
- `plan_change_logs`: `user_id = (select auth.uid())` で SELECT のみ。書き込みはサブスクリプション Phase の Server Action で行う
- GRANT は `authenticated` のみ。`anon` にポリシーは書かない（003 §3.3 で `anon` からの REVOKE を明示）
- クライアント側クエリでも `.eq('tenant_id', tenantId)` を重ねる

> **003 で変更**: ポリシー名・ヘルパ・GRANT の詳細は `docs/plans/003-schema/README.md` が正。
> テーブル定義の差分（複合 FK、インデックス、`shares.code` の CHECK など）は同 §5.6 / §3.9 にまとめている。

**共有ページ（`/share/[code]`）** は未ログインで閲覧するため、Server Component から `createPrivilegedClient()`（service_role）で `code` を条件に読む。有効期限（`end_date + 6 日 >= 今日(JST)`）判定もサーバー側で行い、無効なら 404 ページを返す。anon ポリシーは作らない。

---

## 4. アプリケーション構成

### 4.1 ディレクトリ

```
AGENTS.md / CLAUDE.md(@AGENTS.md)
middleware.ts                       cookie 更新 + 保護ルートの未ログイン redirect
src/
  app/
    layout.tsx                      MantineProvider / ModalsProvider / NuqsAdapter / Notifications
    manifest.ts
    (public)/
      page.tsx                      LP
      terms/ privacy/ law/ releases/
      share/[code]/page.tsx         公開シフト表
    (auth)/
      login/ signup/ password/forgot/ password/reset/
    auth/callback/route.ts          OAuth / メール確認のコード交換
    (protected)/
      layout.tsx                    currentUser を解決
      account/                      メール・パスワード変更、アカウント削除
      tenants/
        page.tsx                    直近の店舗へ redirect（なければ new）
        new/
        [tenantId]/
          layout.tsx                tenant 解決（uuid 形式でなければ v1 トークンとして uuid v5 を計算し redirect）、TenantProvider
          page.tsx                  tutorial 未完了なら tutorial へ、完了なら shifts へ
          shifts/
            page.tsx  searchParams.ts  actions.ts
            _components/            ShiftsClient, CalendarTable, PatternPopover, RequiredNumModal,
                                    DateNoteModal, CopyModal, CountModal, ShareModal, Toolbar
            _lib/                   dateRange, pair, satisfy などの純関数（Vitest 対象）
          settings/
            general/ staffs/ patterns/ restrictions/
          tutorial/
            intro/ pattern/ staff/ complete/
    api/
      tenants/[tenantId]/shifts/pdf/route.ts
      tenants/[tenantId]/shifts/csv/route.ts
  components/                       横断 UI（AppShell、TenantSwitcher、SettingsNav など）
  lib/
    actions/{result,run,error,guards}.ts
    queries/                        tenants, staffs, patterns, shifts, requiredNums, dateNotes, shares, restrictions
    calendar/                       dateRange, holidays, weekdays（Server / Client 共有の純関数）
    pdf/                            ShiftPdfDocument（@react-pdf/renderer）
    csv/
    supabase/createPrivilegedClient.ts
    validation/                     Zod スキーマ（v1 の文字数制限をそのまま定数化）
  types/database.ts                 CLI 生成
  utils/
    auth/current.ts
    supabase/{server,client,middleware}.ts
supabase/
  config.toml  schemas/  migrations/  seed.sql
scripts/
  migrate-v1/                       v1 → v2 データ移行（後述）
docs/
  v1-analysis.md  plans/
```

### 4.2 URL 対応と旧 URL 互換

| v1 | v2 |
| --- | --- |
| `/` | `/` |
| `/users/sign_in` | `/login` |
| `/sign_up`（POST）→ 招待メール → `/users/invitation/accept` | `/signup`（メール + パスワード + 規約同意）→ 確認メール → `/auth/callback` |
| `/users/password/new` / `edit` | `/password/forgot` / `/password/reset` |
| `/users/edit` | `/account` |
| `/tenants` | `/tenants`（redirect） |
| `/tenants/:legacy_uuid` | `/tenants/[tenantId]`。`[tenantId]` が uuid 形式でなければ v1 トークンとみなし `uuidv5('tenants:' + token, NS)` を計算して新 URL に **301** |
| `/tenants/:uuid/shifts?start_date=` | `/tenants/[tenantId]/shifts?start=` |
| `/tenants/:uuid/shifts.pdf` / `.csv` | `/api/tenants/[tenantId]/shifts/pdf` / `csv`（`?start=`） |
| `/tenants/:uuid/settings/*` | 同じ（`staff_groups` は廃止） |
| `/tenants/:uuid/tutorial/*` | 同じ |
| `/share/:code` | **同一**。code も移行 |
| `/terms` `/privacy` `/law` `/releases` | 同じ |
| `/charge` `/card` `/billing` `/admin` | Phase 2 |

v1 の JS モーダル（必要人数、日付メモ、集計、コピー、共有、自動アサイン設定）は shifts ページ内の Mantine Modal に置き換える。`prev_term` / `next_term` はクライアント側で `start` を計算して nuqs 更新（`shallow: false`）。

### 4.3 認証フロー

- **サインアップ**: LP のメール入力 → `/signup?email=` にプリフィル → パスワード + 規約同意 → `signUp` → 確認メール → `/auth/callback` → `/tenants/new`
- **ログイン**: メール + パスワード / Google（Supabase Provider）。v1 の Google ログイン不具合はこれで解消
- **セッション**: `@supabase/ssr` の cookie。v1 の 1 日タイムアウトは再現しない（Supabase 既定のリフレッシュに任せる）
- **メール送信**: Supabase Auth の Custom SMTP に `noreply@assift.com` を設定。テンプレートは v1 の文言（【assift】メールアドレスの確認 等）を移植
- **アカウント削除**: Server Action で `requireUser` → `createPrivilegedClient().auth.admin.deleteUser` → cascade で全データ削除
- **管理者判定**: `profiles.is_admin`（移行時に `@assift.com` を true に）。Phase 1 では UI なし

### 4.4 シフト表の設計

**期間計算**（`lib/calendar/dateRange.ts`、v1 `Calendar.date_range` を移植し Vitest で固定）

| shift_cycle | 範囲 | 前 / 次 |
| --- | --- | --- |
| week | `start_of_week` 基準の週初〜 +6 | ±7 日 |
| two_week | 週初〜 +13 | ±14 日 |
| half_month | 1〜15 / 16〜月末 | 前半 ↔ 後半で切替 |
| month | `start`〜翌月同日の前日 | ±1 か月 |

`start` 未指定時は JST 今日の月初。

**データ取得**（page.tsx, Server）
staffs（在籍・position 順）、patterns（position 順）、staff_patterns、shifts / required_nums / date_notes（期間内）、祝日。すべて `ShiftsClient` に props で渡す。

**クライアント状態**
`shifts` を `${staffId}:${date}` キーの Map で保持。`useOptimistic` でセル更新を即時反映し、Server Action 完了後に `revalidatePath` で再同期。必要人数行の ✓ / ! はクライアントで計算（v1 の gon 相当）。

**Server Actions**（`shifts/actions.ts`）

| Action | 内容 |
| --- | --- |
| `assignShift` | (staff, date) の既存を削除（ペアなら翌日も条件付き削除）→ patternId があれば作成 → ペアなら翌日を上書き。1 トランザクションにするため Postgres 関数 `public.assign_shift(...)` を RPC で呼ぶ |
| `setFixed` / `clearDrafts` | 期間 × 任意の staff で一括更新 / 下書き削除 |
| `setDefaultPatterns` | `staff_default_patterns` から未アサインの日だけ埋める |
| `saveRequiredNums` / `setDefaultRequiredNums` | 日別 upsert / 期間分を `default_required_nums` から再生成（祝日は `holiday` キー優先） |
| `saveDateNote` | note 空なら削除 |
| `copyShifts` | from 期間（≤31 日）→ to 開始日。既存セルは上書きしない。前回条件は localStorage |
| `createShare` / `deleteShare` | 期間は表示中の範囲を固定 |

**ペアパターンの挙動**（v1 からの改善点）
- セット: 翌日を pair パターンで上書き（v1 と同じ。夜勤→明けの期待に合わせる）
- 解除: 翌日が **pair パターンのときだけ**削除（v1 はパターン問わず削除していた）

**集計モーダル**はロード済みの shifts から計算（サーバー呼び出しなし）。

### 4.5 PDF / CSV

- **PDF**: `GET /api/tenants/[tenantId]/shifts/pdf?start=`。cookie で認証 → 期間データ取得 → `renderToBuffer(<ShiftPdfDocument/>)`。A4 横、13 行 / ページ、日付・イベント行・凡例、確定は塗り / 下書きは上辺の色帯（v1 準拠）。`Font.register` で `public/fonts/NotoSansJP-{Regular,Bold}.ttf` を自オリジン URL から読み込む。Node runtime、`serverExternalPackages` に `@react-pdf/renderer`
- **CSV**: `GET /api/tenants/[tenantId]/shifts/csv?start=&encoding=`。1 行目 = 日付、2 行目 = メモ、以降 = スタッフ × パターン名。既定 CP932、`utf8` で BOM 付き

### 4.6 UI 方針

- Mantine `AppShell`。ヘッダーに店舗切替（Menu）、設定・アカウントメニュー。モバイルは Drawer
- カレンダーは `<table>` + CSS Modules で先頭列・ヘッダを sticky（v1 `sticky_table.scss` の再現）。セルは `Button`、タップで `Popover`（下書き / 確定 SegmentedControl + パターンボタン。`staff_patterns` で絞り込み）
- 色は v1 の Material 20 色を `createTheme` の `other.patternColors` に定義
- 並べ替えは v1 と同じ上下ボタン（DnD は後から検討）
- 通知は `@mantine/notifications`、確認は `modals.openConfirmModal`

---

## 5. データ移行

### 5.1 方針

2 段階にして YAML デシリアライズを Rails に任せる。

1. **エクスポート（v1 側 rake タスク）**: ActiveRecord でロードし、テーブルごとに JSONL を出力（`available_wdays` 等は Ruby 側で配列 / Hash に復元済みの状態で書く）。`patterns.default_required_nums` は二重エンコードの有無をここで吸収
2. **インポート（v2 側 `scripts/migrate-v1/`、TypeScript）**: `pg` で Supabase Postgres に直接接続（PostgREST は使わない）。新 ID は `uuidv5('<table>:<v1 id>', NS)` で導出し、FK も同じ式で書き換えるため対応表は不要。親 → 子の順に `INSERT ... ON CONFLICT (id) DO UPDATE` で投入し、再実行を冪等にする

### 5.2 テーブルごとの変換

| v1 | 変換 |
| --- | --- |
| users | `invitation_accepted_at IS NULL AND invitation_token IS NOT NULL`（招待未承認）は移行しない。それ以外を `auth.users` に INSERT: `encrypted_password` そのまま、`email_confirmed_at = confirmed_at`、`raw_app_meta_data = {"provider":"email","providers":["email"]}`。`id` は `uuidv5('users:' + id, NS)` で指定。`profiles` はトリガで作成後に `is_admin`、Stripe 列を UPDATE |
| users（Google） | `provider = 'google_oauth2'` の行は `auth.identities` に `provider='google', provider_id=uid` を追加。Supabase は同一メールの OAuth ログインを自動リンクするため、識別子追加は保険 |
| tenants | `id = uuidv5('tenants:' + uuid, NS)`（22 文字トークンから導出）。他テーブルは `uuidv5('<table>:' + id, NS)` |
| staffs | `disabled = true` → `retired_at = updated_at`。`available_wdays` → `smallint[]`。`available_patterns` → `staff_patterns`（存在しない pattern_id は捨てる）。`default_patterns` → `staff_default_patterns` |
| patterns | `pair_pattern_id` が他 tenant や存在しない ID を指す場合は NULL。`default_required_nums` は数値化して jsonb |
| shifts | `staff_id IS NULL` は捨てる。`(staff_id, date)` 重複は `updated_at` が最新の 1 件を残す。`tenant_id` は staff から補完。pattern と staff の tenant が一致しない行は捨ててログ |
| required_nums | `tenant_id` は pattern から補完 |
| restrictions | `kind` を enum に。pattern FK が壊れている行はログして捨てる |
| events | `date_notes` へ。`(tenant_id, date)` 重複は最新のみ |
| shares | そのまま。`end_date - start_date > 31` は end_date を丸める |
| 文字数超過（全テーブルの text 列） | v1 の上限（店舗名 20 / スタッフ名 10 / パターン名 6 / 説明 10 / メモ 12）は 2019-05-05 に導入されたため、それ以前の行は超過しうる。DB の CHECK と同じ長さに切り詰める（v1 の画面・PDF・共有ページの表示と同じ長さ）。テーブル・列ごとの件数と前後の値をログに出す（003 §3.10 の決定） |
| usage_records | **019 で取りやめ（移行しない）**。当初: `plan_change_logs` へ。`id = uuidv5('usage_records:' + id, NS)`、`user_id` は users と同じ式で導出 |
| staff_groups, invoices | 移行しない。invoices は本番 0 件を確認済み。pg_dump は保管 |

### 5.3 検証

- 件数突合（v1 件数 − 除外件数 = v2 件数）をテーブルごとに出力
- 文字数の切り詰めが発生した行の件数と内容を報告し、想定外に多ければ CHECK の緩和を再検討する
- サンプル店舗 5 件で v1 と v2 のシフト表 CSV を比較
- 移行済みユーザーで v1 と同じパスワードでログインできること
- v1 の店舗 URL（22 文字トークン）でアクセスすると新 URL へ 301 されること

### 5.4 カットオーバー手順

1. Supabase / Vercel 本番環境を用意し、テスト移行で 5.3 を通す
2. ユーザーへ事前告知（メンテナンス時間、再ログインが必要な旨）
3. Heroku `MAINTENANCE_MODE=on`（v1 が 503 を返す）
4. `pg_dump` → ローカル復元 → エクスポート → 本番 Supabase へインポート → 検証
5. DNS を Vercel へ切替。`/share/:code` と旧 `/tenants/:uuid/*` は v2 が受ける
6. 数日は Heroku を停止せず保持。問題なければ停止し、dump をアーカイブ

---

## 6. マイルストーン

各マイルストーンで `docs/plans/00N-<slug>/README.md` を作ってから実装する。

| # | マイルストーン | 主な成果物 |
| --- | --- | --- |
| 002 | プロジェクト基盤 | Next.js + Mantine + Supabase local、ESLint / Prettier / Vitest、AGENTS.md、`lib/actions/*`、middleware、ルート layout |
| 003 | スキーマ・RLS・型 | `supabase/schemas/`、`private` 関数、RLS、`gen types`、seed |
| 004 | 認証・アカウント | signup / login / Google / パスワード再設定 / account、`auth/callback`、メールテンプレート |
| 005 | 店舗・チュートリアル | tenants CRUD、切替、旧 URL（v1 トークン）の uuid v5 解決とリダイレクト、tutorial |
| 006 | 設定 | staffs / patterns / restrictions / general の CRUD と並べ替え |
| 007 | シフト表（読み取り・アサイン） | 期間計算、カレンダー、ポップオーバー、ペアパターン、必要人数、日付メモ |
| 008 | シフト表（ツール） | 一括操作、デフォルト勤務パターン、コピー、集計 |
| 009 | 共有 | 発行・一覧・解除、公開ページ |
| 010 | エクスポート | PDF（react-pdf）、CSV |
| 011 | 静的ページ | LP、規約、プライバシー、特商法、アップデート情報、manifest |
| 012 | データ移行 | v1 rake エクスポート、TS インポート、検証スクリプト、リハーサル |
| 013 | カットオーバー | 本番構築、SMTP、DNS、告知、実施 |

---

## 7. 確認済みの決定（2026-09-17）

- ID: 全テーブル uuid PK。移行分は uuid v5 で導出し、対応表・legacy 列は持たない。新規行は `gen_random_uuid()`
- ~~`usage_records` は `plan_change_logs` として移行する。~~ 019 で取りやめ（移行しない。019 §8.1）。`invoices` は本番 0 件（書き込みコードも存在しない）のため移行しない
- サインアップは「メール + パスワード → 確認メール」方式に変更する
- `events` → `date_notes`、`disabled` → `retired_at`、`kana` 廃止の列名整理を採用する
- 旧 URL のリダイレクトは 301

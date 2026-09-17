# 003: スキーマ・RLS・型

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §3）を `supabase/schemas/` の SQL に落とし、RLS と型生成まで通す。
アプリ側は `profiles` を読む `currentUser()` と `requireAdmin()` だけ足す。画面は作らない。

---

## 1. 目的と完了条件

### 目的

- 001 で決めたテーブル・enum・RLS 二層を宣言的スキーマとして実装する
- `db reset` 一発で「空 DB → スキーマ → seed」が再現できる状態にする
- テナント境界が RLS で守られていることをテストで固定する
- `src/types/database.ts` を CLI 生成に置き換え、以降のマイルストーンが型付きで書けるようにする

### 完了条件

- `npx supabase db reset` が成功し、seed のユーザーでログインできる状態の DB ができる（ログイン画面は 004）
- `npx supabase test db` の RLS テストが通る（別テナントの行が見えない・書けない）
- `npx supabase gen types typescript --local` の出力をコミットし、`npm run typecheck` / `lint` / `test` / `build` が通る
- `supabase/migrations/` に sync の出力が 1 本入り、手書きの SQL はない（生成が扱えないオブジェクトの追記を除く）

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| Postgres | 17.6（ローカル）。`gen_random_uuid()` は組み込み |
| 拡張 | `pgcrypto` 1.3 が利用可（seed でのパスワードハッシュ `extensions.crypt` に使う）。`pgtap` 1.3.3 が利用可（未インストール。テスト内で作る）。uuid v5 はアプリ側で計算するため `uuid-ossp` は使わない |
| CLI 2.117 | `db schema declarative sync --no-apply --name <name>`、`--strict-coverage`（管理できないオブジェクトがあれば失敗）、`generate --local`、`migration up --local`、`gen types --local --schema public` を確認 |
| `config.toml` | `declarative_schema_path` の既定は `./schemas`。`[db.migrations] schema_paths` は使わない。`[db.seed] sql_paths = ["./seed.sql"]` |
| `auth.users` | `id uuid, email, encrypted_password, email_confirmed_at, raw_app_meta_data jsonb, raw_user_meta_data jsonb, aud, role, instance_id` を確認。`confirmation_token` / `recovery_token` / `email_change` / `email_change_token_new` は **nullable かつ default なし**（他の token 列は default `''`） |
| `auth.identities` | `provider_id, provider, identity_data, user_id, email` |
| RLS 式の評価（実測） | `(select private.fn(tenant_id))` のように行の列を引数に取ると **SubPlan として行ごとに評価**される。`tenant_id in (select private.fn())` のように引数なしの集合関数なら **文ごとに 1 回**の評価になる（§5.1）。※実装後の plan は Hash Join ではなく `hashed SubPlan`。狙いどおり行ごとの再評価にはならない（§10.2 で修正） |
| private スキーマの USAGE | ポリシー式は CREATE POLICY 時に関数 OID まで解決されるため、`authenticated` に `private` の USAGE がなくてもポリシーは評価できる（実測）。必要なのは関数の EXECUTE（既定で PUBLIC に付く） |

---

## 3. 事前に確認したい決定

### 3.1 テナント整合性を複合 FK で保証する（001 からの追加）

`staff_patterns.tenant_id` が `staffs.tenant_id` と一致することなどを、アプリではなく DB で保証する。`staffs` と `patterns` に `unique (id, tenant_id)` を足し、子テーブルは複合 FK で参照する。

```sql
-- 例: staff_patterns
foreign key (staff_id, tenant_id)   references public.staffs (id, tenant_id)   on delete cascade,
foreign key (pattern_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade
```

対象: `staff_patterns`, `staff_default_patterns`, `shifts`, `required_nums`, `restrictions`（pattern1 / pattern2）, `patterns.pair_pattern_id`（自己参照。`on delete set null (pair_pattern_id)` は PG 15+ の列指定構文）。
RESTRICTIVE ポリシーが `tenant_id` を見るので、この整合性が崩れると RLS の前提も崩れる。DB で閉じておきたい。

**リスク**: 複合 FK と `on delete set null (列指定)` を pg-delta（sync の差分エンジン）が表現できない可能性がある。Step 2 で確認し、扱えない場合は次のフォールバックをとる。

- 子テーブルの複合 FK が扱えない → 単純 FK に戻し、`tenant_id` の一致は `private.assert_same_tenant()` の BEFORE トリガで検査する
- `pair_pattern_id` の列指定 set null が扱えない → `(pair_pattern_id, tenant_id)` の複合 FK をやめ、単純 FK `pair_pattern_id → patterns(id) on delete set null` + 同トリガ

### 3.2 テナント境界の判定は集合関数 + `IN` にする（001 の `is_tenant_owner(tenant_id)` を変更）

001 では `(select private.is_tenant_owner(tenant_id))` としていたが、行の列を引数に取る関数は文ごとではなく **行ごと**に評価される（§2 の実測）。シフト表は 1 テナント 1 か月で最大 1,500 行程度読むので、次の形にする。

```sql
tenant_id in (select private.owned_tenant_ids())
```

`owned_tenant_ids()` は引数なしで「ログインユーザーがオーナーのテナント id の集合」を返す。プランナはこれを 1 回だけ評価して Hash Join する。テンプレートの「ヘルパは `(SELECT private.fn())` で initPlan 化」の意図（文ごとに 1 回）を、引数ありの関数でも守る形。

### 3.3 `anon` からの権限を明示的に外す

> **§10.3 で変更**: 本節の「各テーブルで `revoke all ... from anon` を明示する」は**実装では機能しなかった**。
> pg-delta は権限を 1 つも持たせないロールの REVOKE を生成しないため、`schemas/` に書いても migration に落ちない。
> 実際の手順は `supabase/unmanaged/restrict_anon_grants.sql` を sync 後に生成 migration へ追記する形。
> また `authenticated` からも一度 `revoke all` する必要があった（既定で付く TRUNCATE は RLS を通らない）。
> 手順の正は AGENTS.md の Supabase 節。

Supabase は新規テーブルに `anon` / `authenticated` へ既定で全権限を付ける。テンプレートの「GRANT は最小」に従い、各テーブルで `revoke all on public.<table> from anon` を明示する。RLS だけでも `anon` は何も読めないが、権限の層でも閉じる。

`private` スキーマの USAGE は誰にも付けない（作成時の既定）。ポリシーからの呼び出しには不要なことを確認済み（§2）。

### 3.4 `tenants.owner_id` は `default auth.uid()`

INSERT 時にアプリが `owner_id` を渡さなくても DB が埋める。`with check (owner_id = (select auth.uid()))` は残す。

### 3.5 `profiles` は `authenticated` に SELECT だけ付ける

Phase 1 でユーザーが `profiles` を更新する場面はない（`email` はトリガ同期、`is_admin` は移行時に SQL で立てる）。UPDATE を付けなければ `is_admin` を守るトリガも要らない。ユーザー編集可能な列が増えたときに列単位で `grant update (col)` する。

### 3.6 seed でローカル用ユーザーを `auth.users` に直接 INSERT する

`db reset` だけで手動確認できる環境を作るため、seed で `dev@example.com` / `password` を `auth.users` と `auth.identities` に SQL で作る（`extensions.crypt(..., extensions.gen_salt('bf'))`）。Supabase 公式の手法ではないが広く使われており、**012 のデータ移行で同じ形の INSERT を使う**ので、その予行にもなる。ローカル専用で本番には流さない。

GoTrue は token 系の varchar 列が NULL だと「converting NULL to string」で失敗するため、default のない 4 列（`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`）に `''` を入れる（§2）。

続けて v1 の `db/seeds.rb` 相当（店舗「ひまわり保育園」、勤務パターン 6 件、スタッフ 8 件、制約 4 件）を入れる。

**012 への依存**: 「予行になる」という根拠は、本番の Supabase でも `postgres` ロールが `auth.users` に INSERT できることが前提。012 のプラン時点で本番プロジェクトに対して確認する。できない場合は Admin API の `createUser({ password_hash })` に切り替えるが、その API で `id` を指定できるかが uuid v5 の設計（001 §3.1）の前提になるので、同時に確認する。

### 3.7 RLS テストに pgTAP を使う

`supabase/tests/*.sql` に pgTAP で「テナント A のユーザーが B の staffs を読めない・書けない」「`profiles` は自分の行だけ」「未ログインは何も読めない」を書き、`npx supabase test db` で回す。pgtap 拡張はテストのトランザクション内で `create extension` し、スキーマには入れない（本番に持ち込まない）。テンプレートのテスト方針（Vitest）とは別枝だが、RLS は唯一の認可境界なのでテストで固定しておきたい。

### 3.8 本番に初回 push するまでは migration を 1 本に保つ

テンプレートの「適用済みの migration は書き換えない」は本番に適用したものが対象。013 で初めて `db push` するまでは本番が存在しないので、004〜011 でスキーマを変えるたびに差分 migration を積むのではなく、**`supabase/migrations/` を空にして `sync` をやり直し、`db reset` で検証する**（常に `init_schema` 1 本）。

- 利点: 本番初回投入時の migration が読みやすい 1 ファイルになり、開発中の試行錯誤が履歴に残らない
- 制約: ローカル DB は `db reset` で作り直す（seed で再現できる前提。手で入れたデータは消える）
- 013 の初回 push 以降は通常どおり差分 migration を追加し、適用済みは書き換えない

この運用は AGENTS.md の Supabase 節にも書く。

### 3.9 インデックスの方針（001 に不足）

001 の DDL は主キーと一部の複合インデックスしか持たない。RLS が全クエリに `tenant_id in (...)` を付け、クライアントも `.eq('tenant_id', ...)` を重ねるので、**テナント配下の全テーブルに `tenant_id` を先頭に持つインデックス**を必ず置く。また複合 FK の参照側（`pattern_id` など）に索引がないと、パターン削除のカスケードで子テーブルが全走査になる。**全 FK 列（参照側）にインデックス**を置く。数千テナント規模では `staff_patterns` が数十万行になるため、無索引は許容しない。

| テーブル | 追加するインデックス |
| --- | --- |
| staff_patterns | `(tenant_id)`, `(pattern_id)`（PK が `staff_id` 先頭） |
| staff_default_patterns | `(tenant_id)`, `(pattern_id)` |
| shifts | `(pattern_id)`（`(tenant_id, date)` と `unique (staff_id, date)` は 001 のまま） |
| restrictions | `(tenant_id, position)`, `(pattern1_id)`, `(pattern2_id)` |
| patterns | `(pair_pattern_id)`（set null のカスケード用） |
| required_nums, date_notes, shares, tenants, plan_change_logs | 001 のまま（`tenant_id` / `owner_id` / `user_id` 先頭の索引あり） |

### 3.10 文字数の CHECK 制約と v1 の既存データ（決定: CHECK を維持し 012 で切り詰める）

001 / 003 は v1 の UI 上限（店舗名 20、スタッフ名 10、パターン名 6、パターン説明 10、メモ 12）を CHECK 制約として DB に入れる設計。しかし v1 でこれらの上限が導入されたのは **2019-05-05**（コミット `9945a1f`）で、クローズドベータ開始（2019-02-03）からの約 3 か月間に作られた行は上限を超えうる。Rails の `validates length` は保存時にしか効かないため、その後編集されていない行は今も超過したまま残っている可能性がある。このままだと 012 の INSERT が該当行で失敗する。

選択肢:

1. **CHECK は維持し、012 で超過分を切り詰める**（推奨）。v1 の画面・PDF・共有ページは表示時に同じ長さで `truncate` しているので、ユーザーが見ている値は変わらない。編集フォームに出る元の値だけが短くなる。切り詰めた行は件数と内容をログに残す
2. CHECK を緩める（例: 50 文字）か外し、上限は Zod だけで守る。データは無傷だが、DB 単独では不変条件を保証できなくなる

**決定（2026-09-17）: 1 を採用。** 003 は CHECK 制約を入れたまま実装する。012 では超過行を CHECK と同じ長さに切り詰め、テーブル・列ごとの件数と切り詰め前後の値をログに出してリハーサルで報告する。想定外に多い場合はその時点で 2 への切り替えを再検討する。

---

## 4. スキーマファイルの構成

pg-delta が依存関係から適用順を決めるので、分割はレビューしやすさ優先。

```
supabase/schemas/
  private/
    schema.sql                 create schema private
    functions.sql              owned_tenant_ids / set_updated_at / handle_new_user / sync_profile_email
  public/
    types.sql                  enum: shift_cycle / pattern_kind / restriction_kind
    tables/
      profiles.sql
      tenants.sql
      staffs.sql
      patterns.sql
      staff_patterns.sql
      staff_default_patterns.sql
      shifts.sql
      required_nums.sql
      restrictions.sql
      date_notes.sql
      shares.sql
      plan_change_logs.sql
  _custom/
    auth_triggers.sql          auth.users → private.handle_new_user / sync_profile_email
supabase/tests/
  rls_tenant_isolation.sql     pgTAP
supabase/seed.sql
```

各 `tables/*.sql` の並び: `create table` → index → `alter table ... enable row level security` → `revoke` / `grant` → policy → trigger。

`_custom/auth_triggers.sql`: pg-delta は `auth` スキーマを管理対象外にする可能性が高い。テンプレートによれば `generate` は扱えないオブジェクトを `_custom/` に出すので、まず `_custom/` に置いて `sync --strict-coverage` の挙動を見る。sync が無視または失敗する場合は、生成された migration の末尾に追記する（Step 2）。

---

## 5. SQL の要点

### 5.1 private 関数

```sql
create schema if not exists private;

-- ログインユーザーがオーナーのテナント id。ポリシーからは tenant_id in (select private.owned_tenant_ids()) で使う
-- security definer で tenants の RLS を通さずに読む（tenants 自身のポリシーとの再帰を避ける）
create or replace function private.owned_tenant_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select t.id from public.tenants t where t.owner_id = (select auth.uid());
$$;
-- EXECUTE は既定で PUBLIC に付くため、anon だけの revoke は効かない。PUBLIC から外して authenticated に付け直す
revoke execute on function private.owned_tenant_ids() from public;
grant execute on function private.owned_tenant_ids() to authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- auth.users INSERT → profiles 作成。移行スクリプトが先に profiles を作っていても失敗しないよう on conflict
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- auth.users.email 更新 → profiles.email 同期
create or replace function private.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
```

### 5.2 profiles / tenants（ポリシーが他と異なる 2 表）

```sql
-- profiles: 自分の行の SELECT だけ（3.5）
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- tenants: owner_id で絞る
alter table public.tenants enable row level security;
revoke all on public.tenants from anon, authenticated;  -- §10.3: authenticated も一度外す
grant select, insert, update, delete on public.tenants to authenticated;

create policy tenants_owner_all on public.tenants
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
```

### 5.3 テナント配下の表（共通テンプレート）

```sql
alter table public.staffs enable row level security;
-- §10.3: 既定で付く TRUNCATE（RLS を通らない）を外すため authenticated も revoke 対象に含める。
-- anon はこの revoke が migration に落ちないため supabase/unmanaged/ 側で外す
revoke all on public.staffs from anon, authenticated;
grant select, insert, update, delete on public.staffs to authenticated;

-- 境界: RESTRICTIVE 1 本。集合は文ごとに 1 回評価される（3.2）
create policy staffs_restrict_same_tenant on public.staffs
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

-- 権限: PERMISSIVE（現状オーナーだけなので全許可。将来ロールを足すときにここを分岐）
create policy staffs_member_all on public.staffs
  for all to authenticated using (true) with check (true);

create trigger staffs_set_updated_at
  before update on public.staffs
  for each row execute function private.set_updated_at();
```

`staff_patterns` / `staff_default_patterns` / `shares` は `updated_at` を持たないのでトリガなし。

### 5.4 plan_change_logs（ユーザー単位・読み取りのみ）

```sql
alter table public.plan_change_logs enable row level security;
revoke all on public.plan_change_logs from anon, authenticated;
grant select on public.plan_change_logs to authenticated;

create policy plan_change_logs_select_own on public.plan_change_logs
  for select to authenticated using (user_id = (select auth.uid()));
```

### 5.5 auth トリガ（`_custom/auth_triggers.sql`）

```sql
-- _custom は再 sync 時に再適用される可能性があるため or replace（PG14+）で冪等にする
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_profile_email();
```

### 5.6 テーブル定義の 001 からの差分

| テーブル | 001 からの変更 |
| --- | --- |
| profiles | `email` を nullable に（`auth.users.email` が null の経路でトリガが落ちないように） |
| staffs, patterns | `unique (id, tenant_id)` を追加（複合 FK の参照先） |
| staff_patterns, staff_default_patterns, shifts, required_nums, restrictions | 子側の FK を `(x_id, tenant_id)` の複合 FK に変更（3.1） |
| patterns.pair_pattern_id | `foreign key (pair_pattern_id, tenant_id) references patterns (id, tenant_id) on delete set null (pair_pattern_id)` |
| staffs | `create index ... (tenant_id, position) where retired_at is null` を追加（在籍一覧用） |
| tenants.owner_id | `default auth.uid()` |
| shares | `check (code ~ '^[A-Za-z0-9]{8}$')` を追加（v1 と同じ 8 文字英数） |

### 5.7 seed（抜粋）

```sql
-- ローカル専用。dev@example.com / password
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
  'dev@example.com', extensions.crypt('password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '11111111-...', '11111111-...', 'email',
  '{"sub":"11111111-...","email":"dev@example.com","email_verified":true}', now(), now(), now());

-- 店舗・パターン・スタッフ・制約は v1 の db/seeds.rb を移植（早番 / 日勤 / 遅番 / 夜勤 → 明け / 休み、スタッフ 8 名、制約 4 件）
-- profiles はトリガで作られる。tenants.owner_id は seed では明示する（postgres として実行するため auth.uid() は null）
```

---

## 6. アプリ側とドキュメントの変更

| ファイル | 内容 |
| --- | --- |
| `src/types/database.ts` | CLI 生成に置き換え（`--schema public`）。`Tables<'staffs'>` などのヘルパ型は生成物に含まれる |
| `src/lib/queries/profiles.ts` | `getProfile(userId)` |
| `src/utils/auth/current.ts` | `currentUser()` を追加: `getAuthUser()` → `profiles` を 1 行読む（`cache()`）。戻り値は `{ id, email, isAdmin }`。未ログインは null。**`profiles` 行が無い場合も null にせず `isAdmin: false` で返し、警告ログを出す**（auth トリガが本番で欠けていてもログインが壊れないように。認可は常に fail-safe 側） |
| `src/lib/actions/guards.ts` | `requireAdmin()` を追加: `currentUser()` が null か `isAdmin` false なら `ActionError('権限がありません')` |
| `.cursor/rules/supabase-sql.mdc` | RESTRICTIVE の例を `tenant_id in (select private.owned_tenant_ids())` に更新。`private` の USAGE に関する記述を §2 の実測に合わせる |
| `AGENTS.md` | RLS の項を同じ内容に更新 |
| `docs/plans/001-phase1-architecture/README.md` §3.3–3.4 | `is_tenant_owner` → `owned_tenant_ids` に更新し、003 を参照させる |

---

## 7. 手順

### Step 1: スキーマ SQL を書く

§4 の構成で `supabase/schemas/` を作成。001 §3.2 の DDL に §5.6 の差分を反映し、各表に §5.3 のテンプレートを適用する。

### Step 2: migration を生成して適用

```bash
npx supabase db schema declarative sync --no-apply --name init_schema --strict-coverage
# 生成された supabase/migrations/<ts>_init_schema.sql をレビュー
#  - auth.users のトリガが含まれているか。含まれていなければ末尾に §5.5 を追記
#  - REVOKE / GRANT が落ちていないか。落ちていれば追記
npx supabase migration up --local
```

`--strict-coverage` で失敗した場合は、失敗したオブジェクトを `schemas/` から外して migration に追記する方針をとり、実装ログに残す。

生成物で必ず確認すること:

- 複合 FK と `on delete set null (pair_pattern_id)` がそのまま出ているか（出ていなければ 3.1 のフォールバック）
- `auth.users` のトリガ、REVOKE / GRANT、RESTRICTIVE ポリシーの `as restrictive` が落ちていないか
- enum と `private` スキーマの関数が migration に含まれているか

003 の作業中にスキーマを直したら、`supabase/migrations/*.sql` を削除して sync をやり直し、`npx supabase db reset` で空から通す（3.8）。

### Step 3: seed と reset

`supabase/seed.sql` を書き、`npx supabase db reset` で「migration → seed」を空から通す。`profiles` がトリガで作られていること、`tenants.owner_id` が seed ユーザーになっていることを psql で確認。

auth トリガの存在確認 SQL を README か 013 のチェックリストに残す（本番 push 後に必ず実行する）:

```sql
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname like 'on_auth_user_%';
```

### Step 4: 型生成

```bash
npx supabase gen types typescript --local --schema public > src/types/database.ts
npm run typecheck
```

### Step 5: pgTAP テスト

`supabase/tests/rls_tenant_isolation.sql`:

1. `begin; create extension if not exists pgtap with schema extensions; select plan(N);`
2. ユーザー A / B と各テナントを作る（`auth.users` 直接 INSERT。トリガで profiles ができる）
3. `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);` で A になりすます
4. 確認項目
   - A の staffs は読める / B の staffs は 0 行
   - B の `tenant_id` で staffs に INSERT すると RLS 違反（`throws_ok`）
   - `profiles` は自分の 1 行だけ。`update profiles` は権限エラー
   - `set local role anon` では tenants / staffs が 0 行
5. `select * from finish(); rollback;`

```bash
npx supabase test db
```

### Step 6: アプリ側・ドキュメント（§6）と検証

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build
```

### Step 7: 実装ログとコミット

実装ログを本ファイルに追記し、確認のうえコミット。

---

## 8. スコープ外

- `assign_shift` などの RPC 関数（007 で `public/functions/` に追加）
- Storage、Realtime の設定
- 本番プロジェクトへの `db push`（013）

---

## 9. セルフレビューでの修正（2026-09-17）

初稿に対して Postgres 17.6 のローカル環境で実測して直した点。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | `(select private.is_tenant_owner(tenant_id))` は行ごとに評価される（EXPLAIN で SubPlan を確認）。「initPlan 化」になっていない | 引数なしの集合関数 `owned_tenant_ids()` + `IN` に変更（3.2）。EXPLAIN で Hash Join（1 回評価）を確認 |
| 2 | 初稿の「`private` の USAGE を `authenticated` から revoke」は、必要なら逆にポリシーが壊れる懸念があった | 実測で USAGE なしでもポリシーは評価できることを確認。USAGE は誰にも付けず、関数の EXECUTE だけ `anon` から外す（3.3、5.1） |
| 3 | `profiles` に UPDATE を付けて `is_admin` をトリガで守る設計は、Phase 1 に更新される列がないのに複雑 | SELECT のみに簡略化（3.5） |
| 4 | seed の `auth.users` INSERT で token 系列が NULL だと GoTrue が落ちる | default のない 4 列を確認し `''` を入れる（3.6、5.7） |
| 5 | `handle_new_user` が、移行で先に `profiles` を作った場合に失敗する | `on conflict (id) do nothing`（5.1） |
| 6 | `profiles.email not null` は `auth.users.email` が null のときトリガが落ちる | nullable に（5.6） |
| 7 | auth トリガの置き場が曖昧 | `_custom/` に置いて sync の挙動を確認し、無理なら migration に追記と明記（4、Step 2） |
| 8 | pgTAP の拡張をどこで作るか未記載 | テストのトランザクション内で作り、本番スキーマに含めない（3.7、Step 5） |
| 9 | 001 と `.cursor/rules` が旧ヘルパ名のまま残る | 003 の作業で更新する（6） |
| 10 | （2 回目）複合 FK・列指定 set null を差分エンジンが扱えない場合の代替が未定で、Step 2 で詰まる | トリガによるフォールバックを 3.1 に明記 |
| 11 | （2 回目）004〜011 でスキーマが変わるたびに migration を積むのか、1 本を作り直すのかが未定。以降の全マイルストーンの手順に影響する | 本番初回 push（013）までは `init_schema` 1 本を作り直す運用に決めた（3.8） |
| 12 | （3 回目）001 の DDL に `tenant_id` 先頭の索引や FK 参照側の索引が足りず、RLS 付きの全クエリとパターン削除のカスケードが全走査になる | インデックス方針を 3.9 に定義し、不足分を列挙 |
| 13 | （3 回目）`currentUser()` が `profiles` 行の存在に依存すると、本番で auth トリガが欠けた場合に全ユーザーがログイン不能になる | 行が無くても `isAdmin: false` で返す fail-safe に。本番でのトリガ存在確認 SQL を Step 3 に追加 |
| 14 | （3 回目）3.6 の「012 の予行」は本番で `postgres` が `auth.users` に INSERT できる前提。Admin API に切り替える場合は uuid v5 の `id` 指定可否が連動する | 012 のプラン時点で本番プロジェクトで確認する項目として 3.6 に明記 |
| 15 | （4 回目）文字数の CHECK 制約が、上限導入（2019-05-05）以前に作られた v1 の行を弾き、012 の INSERT が失敗しうる | 3.10 で「CHECK 維持 + 012 で切り詰め（v1 の表示と同じ長さ）」に決定 |

---

## 10. 実装ログ

実装日: 2026-09-17。ローカル Postgres 17.6 / Supabase CLI 2.117.0。

### 10.1 成果物

| パス | 内容 |
| --- | --- |
| `supabase/schemas/private/{schema,functions}.sql` | `private` スキーマと 4 関数（§5.1 のまま） |
| `supabase/schemas/public/types.sql` | enum 3 種 |
| `supabase/schemas/public/tables/*.sql` | 12 テーブル（§4 の構成のまま） |
| `supabase/schemas/_custom/auth_triggers.sql` | `auth.users` の 2 トリガ |
| `supabase/unmanaged/restrict_anon_grants.sql` | **プランにない追加**。`anon` からの REVOKE（10.3） |
| `supabase/migrations/20260917082838_init_schema.sql` | sync の出力 + 上記 REVOKE を末尾に追記 |
| `supabase/seed.sql` | dev ユーザー + v1 `db/seeds.rb` 相当（店舗 1 / パターン 6 / スタッフ 8 / staff_patterns 48 / 制約 4） |
| `supabase/tests/rls_tenant_isolation.sql` | pgTAP 22 アサーション |
| `src/types/database.ts` | `gen types --local --schema public` の出力（674 行） |
| `src/lib/queries/profiles.ts` | `getProfile(userId)` |
| `src/utils/auth/current.ts` | `currentUser()` を追加（profiles 行が無くても `isAdmin: false` で返す） |
| `src/lib/actions/guards.ts` | `requireAdmin()` を追加 |

### 10.2 プランどおり確認できたこと

- **複合 FK と `on delete set null (pair_pattern_id)` は pg-delta がそのまま扱えた**。生成 migration に
  `FOREIGN KEY (pair_pattern_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE SET NULL (pair_pattern_id)`
  がそのまま出た。§3.1 のトリガ・フォールバックは不要。事前に psql で「参照先を削除しても `tenant_id` は残り
  `pair_pattern_id` だけ null になる」ことも確認した
- `--strict-coverage` は一度も失敗しなかった。`_custom/auth_triggers.sql` の `auth.users` トリガも
  pg-delta が管理オブジェクトとして取り込み、migration に出力した（`create or replace trigger` は
  `CREATE TRIGGER` に正規化される）。Step 2 で想定していた「migration 末尾への追記」は不要だった
- `authenticated` に `private` の USAGE を付けなくてもポリシーは評価できる（§2 の実測どおり）
- RLS の評価回数: `explain` の出力は `Filter: (ANY (tenant_id = (hashed SubPlan 1).col1))`。
  **hashed SubPlan** なので文ごとに 1 回評価してハッシュ化される（プランの記述は Hash Join だったが、
  狙いどおり行ごとの再評価にはならない）
- seed の `auth.users` 直接 INSERT で `dev@example.com` / `password` のログインが通る
  （`/auth/v1/token?grant_type=password` で access_token を取得して確認）。`profiles` は
  `private.handle_new_user()` トリガが作り、`tenants.owner_id` も seed ユーザーになっている

### 10.3 プランからの変更: `anon` の権限を宣言的スキーマで閉じられなかった

§3.3 は「各テーブルで `revoke all on public.<table> from anon` を明示する」としていたが、
**この revoke は生成 migration に落ちない**。理由:

- Supabase は `CREATE TABLE` 時に `anon` / `authenticated` / `service_role` へ全権限を付ける
  （`config.toml` の `auto_expose_new_tables`。クラウドの既定）
- pg-delta は「宣言側の ACL に現れるロール」だけを差分に出す。`authenticated` は SELECT 等を
  付けているので `REVOKE ALL` + `GRANT ...` が出るが、権限を 1 つも持たせない `anon` は差分に現れない
- `_custom/` に裸の `REVOKE` を置いても同じ理由で消える（passthrough ではなくモデル化される）

実測: 最初の `db reset` 後、`anon` は全 12 テーブルに
`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` を持っていた。
**TRUNCATE は RLS を通らない**ため、これは行レベルの防御では埋まらない穴になる。

検討して却下した案: `auto_expose_new_tables = false`。実測すると
`service_role` からも DML が外れて `createPrivilegedClient()`（公開共有ページの読み取り）が使えなくなる一方、
`anon` には `REFERENCES,TRIGGER,TRUNCATE` が残った。狙いと逆方向なので採らず、既定（クラウドと同じ挙動）に戻した。

採った方針: `supabase/unmanaged/restrict_anon_grants.sql` に `REVOKE ALL ON ALL TABLES/SEQUENCES/FUNCTIONS
IN SCHEMA public FROM anon` を置き、**sync のたびに生成 migration の末尾へ追記する**。

```bash
cat supabase/unmanaged/restrict_anon_grants.sql >> supabase/migrations/*_init_schema.sql
```

追記を忘れても pgTAP の「anon は tenants / staffs / profiles を読めない」が落ちるので気づける。
手順は AGENTS.md の Supabase 節と `.cursor/rules/supabase-sql.mdc` に書いた。

あわせて、各テーブルの revoke を `from anon, authenticated` に変更した（`authenticated` から
TRUNCATE などを外すため）。最終状態:

| ロール | 権限 |
| --- | --- |
| `anon` | `public` に何もなし（0 行） |
| `authenticated` | `select, insert, update, delete`。`profiles` / `plan_change_logs` は `select` のみ |
| `service_role` | 全権限（`createPrivilegedClient()` 用） |

### 10.4 その他の差分

- pg-delta は enum 列を `CREATE TYPE` の後に `ALTER TABLE ... ADD COLUMN` で足すため、
  DB 上の列順が宣言と異なる（`patterns.kind` などが末尾）。挙動には影響しないのでそのままにした
- §3.7 の anon テストは「0 行」ではなく `42501 permission denied` を期待する形にした（10.3 で権限を
  revoke したため、SELECT 自体が拒否される）。より強い保証になっている
- pgTAP は 22 アサーション。テナント分離・複合 FK 違反・`TRUNCATE` 拒否・`profiles` の UPDATE 拒否・
  `plan_change_logs` の INSERT 拒否・anon の全面拒否・「A の UPDATE/DELETE が B の行を変えない」を含む
- `supabase/migrations/.gitkeep` を削除（CLI が毎回 `Skipping migration .gitkeep` を出すため）
- `src/utils/auth/current.ts` は `getProfile()` が「行なし」を返したときだけ fail-safe に倒す。
  クエリ自体のエラーは throw してそのまま見えるようにした

### 10.5 検証結果

```
npx supabase db reset      → migration → seed が空から成功
npx supabase test db       → Files=1, Tests=22, Result: PASS
npm run format             → 差分なし
npm run lint               → エラーなし
npm run typecheck          → エラーなし
npm test                   → 1 file / 4 tests passed
npm run build              → 成功（/ , /login, /tenants）
```

PostgREST 経由の最終確認（アプリと同じ経路）:

| 経路 | 結果 |
| --- | --- |
| `authenticated` で `profiles` | 自分の 1 行のみ |
| `authenticated` で `staffs` | 8 行（自テナントのみ） |
| `anon` で `staffs` / `tenants` | `42501 permission denied` |

### 10.6 013（本番初回 push）への申し送り

- push 後に auth トリガの存在を必ず確認する:

  ```sql
  select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname like 'on_auth_user_%';
  ```

- push 後に `anon` の権限が 0 件であることを確認する（10.3 の REVOKE がクラウドでも効いているか）:

  ```sql
  select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  ```

- §3.6 の「本番の `postgres` で `auth.users` に INSERT できるか」は 012 のプラン時点で確認する（未着手）

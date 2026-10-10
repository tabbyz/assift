# 021: v1 データ移行（エクスポート・インポート・検証・リハーサル）

- 前提: `docs/v1-analysis.md`（§2 データモデル・§7.2 移行で必ず確認すること）/ 001 §3.1（対応表・uuid v5）・§5（移行の方針）/
  003 §3.10（文字数の切り詰め）/ 005（`lib/migration/v1Ids.ts`・旧 URL）/ 013 §5.7（制約の 3 列）/ 014 §5.10（`setup_completed_at`）/
  015 §5.5（必要人数の上書きだけを残す）/ 019 §8.1・§13.7（`profiles` の課金の列・`staff_count_history`）/ 020 §5.1（`is_admin`）
- v1 のコード: `db/schema.rb`、`app/models/{user,tenant,staff,pattern,shift,required_num,restriction,event,share}.rb`、`config/application.rb`（YAML の許可クラス）

> 番号: 013 / 014 の冒頭注記では移行を 015 / 016 に繰り下げていたが、015〜020 が別の用途に使われたので本プランを **021** とし、
> カットオーバー（本番の構築・DNS・告知・当日の手順）は **022** にする。本プランはカットオーバーのうち「データを v2 に入れて確かめる」部分だけを扱う。

**状態: プラン（未実装）。2026-10-10 に作成。§13 の未確定を決めてから実装に入る。**

---

## 1. 目的と完了条件

### 目的

v1（Rails / Heroku Postgres）の全データを v2（Supabase）に移し、**利用者が v1 と同じメール・パスワードでログインすると、同じ店舗・同じシフト表・同じ共有 URL が開く**状態を作る。
移行は 1 回きりだが、カットオーバーの当日に初めて流すのではなく、**本番と同じ手順をリハーサルで何度も通して**、当日は手順をなぞるだけにする。

### 完了条件

- [ ] v1 の本番ダンプから `v1-export/<日時>/` の JSONL 一式が出る（Ruby 側で YAML を復元済み）
- [ ] `npm run migrate:v1 -- --input <dir>` が、空の v2 DB に対して **1 トランザクション**で全テーブルを入れ、件数の突合（v1 の件数 − 捨てた件数 = v2 の件数）を自分で確かめて通る
- [ ] 捨てた行・切り詰めた値・直した値が、理由つきでレポート（JSON）に残る
- [ ] ローカルのリハーサルで: v1 と同じパスワードでログインできる / v1 の店舗 URL（22 文字トークン）が 308 で移行後の店舗に着く / `/share/<code>` が開く /
      サンプル店舗の CSV が v1 と一致する / 移行後の店舗が「準備中」にならない / 必要人数の表示が v1 と同じ
- [ ] 本番の Supabase に対して `--rollback`（全部入れて最後に ROLLBACK）で通り、所要時間が分かっている
- [ ] 019 §8.2 の Stripe の引き継ぎスクリプトの入力（`v1-subscriptions.csv`）が、同じダンプから出る

## 2. 範囲

### 作る

| 区分 | 中身 |
| --- | --- |
| エクスポート | v1 の rake タスク `v2:export`（このリポジトリに置き、v1 に写して流す）。テーブルごとの JSONL + `manifest.json` + Stripe 用の CSV |
| 変換 | `src/lib/migration/` の純関数（v1 の行 → v2 の行 + 捨てた理由）。Vitest で固定する |
| インポート | `scripts/migrate-v1/import.ts`。`pg` で Postgres に直接つなぎ、1 トランザクションで入れる。`--rollback` で本番の予行ができる |
| 検証 | インポートの最後に同じトランザクションの中で件数を突合。別に `scripts/migrate-v1/verify.ts` で移行後の DB と v1 の件数・サンプルを比べる |
| 手順書 | リハーサルと当日の手順（§9・§10）。022 がこれを当日のチェックリストに組み込む |

### 作らない

| 項目 | 理由 / 代わり |
| --- | --- |
| `staff_groups` / `invoices` / `usage_records` の移行 | 001 §3.1・019 §5.2 の決定どおり移行しない。ダンプに残す |
| 対応表・`legacy_id` 列 | uuid v5 で導出する（001 §3.1）。`v1Uuid()` 以外で id を組まない |
| 差分・追いつき移行（v1 を動かしたまま 2 回目を流す） | カットオーバーは v1 を止めてから 1 回（001 §5.4）。差分は要らない。失敗したらトランザクションごと戻して流し直す |
| Stripe の Subscription の引き継ぎ | 019 §8.2 の `scripts/stripe/migrate-v1-subscriptions.ts`（実装済み）。本プランは入力の CSV を出すだけ |
| 本番の構築・DNS・告知・当日の進行 | 022 |

## 3. 001 からの変更点（先に決める）

001 §5 を書いた後に 003〜020 でスキーマと決定が変わった。本プランで上書きするのは次の 5 点。それ以外は 001 §5 のまま。

| # | 001 / 019 | 本プラン | 理由 |
| --- | --- | --- | --- |
| 1 | `INSERT ... ON CONFLICT (id) DO UPDATE` で再実行を冪等にする（001 §5.1） | **1 トランザクションで入れ、失敗したら全部戻す。`ON CONFLICT` は書かない** | 空の DB に 1 回入れるだけなので「途中から再開」は要らない。upsert にすると、親を更新して子が残る・捨てるべき行が前回の残骸として残る、といった半端な状態を自分で考えることになる。重複は PK で**うるさく失敗**させたほうが安全。副産物として `--rollback` で本番の予行ができる（§9.3） |
| 2 | インポートの間は `session_replication_role = replica` でトリガを止める（019 §8.1） | **`alter table public.staffs disable trigger staffs_record_staff_count` だけ止める**（トランザクションの中で。終わりに enable） | `replica` は FK の整合性トリガ（RI）も止める。壊れた参照（v1 には FK が無い列が多い）を DB が見逃すのは移行でいちばん避けたいこと。止めたいのは在籍数の履歴がスタッフ 1 行ごとに増えることだけなので、そのトリガだけ止める。上限の門番は `auth.uid()` が null なら通す（019 §5.3）ので止めない |
| 3 | `@assift.com` のユーザーに `is_admin = true`（001 §4.3） | **立てない** | 020 §5.1 で「`is_admin` は管理専用のアカウントにだけ立て、本体にはログインしない」と決めた。運営者の v1 アカウント（店舗を持ち本体で使う）に立てると、本体で盗まれたセッションで管理画面に入れる。管理用のアカウントはカットオーバーで別に作る（022） |
| 4 | `required_nums` は `tenant_id` を補完してそのまま（001 §5.2） | **焼き付けられた行を捨て、上書きだけ残す**（015 と同じ規則。祝日はアプリで判定） | 015 で `required_nums` の意味が「この日だけの上書き」に変わった。v1 の「デフォルト人数をセット」で期間ぶん焼き付いた行をそのまま入れると、基本の人数を直しても既存の期間に届かない（015 が直したこと）が v1 の店舗だけに残る。詳細は §7.7 |
| 5 | `shifts.assist_token` は廃止（001 §3.1） | 同じ。加えて v2 の `shifts.assist_run_id` は null | v1 の自動アサインの履歴は再現しない（012） |

## 4. 全体の流れ

```
Heroku 本番 ──pg_dump──▶ 手元の v1（ローカル DB に restore）──rails v2:export──▶ v1-export/<日時>/*.jsonl, manifest.json, v1-subscriptions.csv
                                                                                        │
                                                            npm run migrate:v1 -- --input v1-export/<日時> [--rollback]
                                                                                        │ pg（直接接続。1 トランザクション）
                                                                                        ▼
                                                                                 v2 Supabase（auth.users / public.*）
                                                                                        │
                                                            npm run migrate:v1:verify -- --input v1-export/<日時>   件数・サンプルの突合
```

- **エクスポートは本番の Heroku ではなく、ダンプを restore した手元の v1 で流す。** 本番に rake を足すデプロイが要らず、何度でもやり直せる。YAML 列（`staffs.*`・`patterns.default_required_nums`）は v1 のモデルを通して復元するので、Ruby 側でしか正しく読めない形（`HashWithIndifferentAccess` のタグ付き YAML）も吸収できる
- **当日は、v1 をメンテナンスモードにしてからダンプを取る**（001 §5.4）。ダンプの後の書き込みは移らない
- **インポートは PostgREST を使わず Postgres に直接つなぐ**（001 §5.1）。`auth.users` に書く・トリガを止める・1 トランザクションにする、のどれも PostgREST では出来ない。本番は Supabase の **Session pooler（ポート 5432。IPv4 で届く）** につなぐ。直接接続は IPv6 だけなので手元からは届かないことがある
- 変換はすべて TS の純関数に置き、Vitest で固定する（§6.2）。Ruby 側は「YAML を復元して書き出す」だけにして、判断を 2 か所に分けない

## 5. エクスポート（v1 側。`scripts/migrate-v1/v1/v2_export.rake`）

このリポジトリに置き、v1 の `lib/tasks/` に写して `bundle exec rails v2:export[/path/to/out]` で流す。両方の形を 1 つのリポジトリで見られるようにするため、v1 には写しだけを置く。

### 5.1 出力

`<out>/<YYYYMMDD-HHMM>/` に次を書く。1 行 1 レコードの JSONL（UTF-8）。値は Ruby で復元済みの JSON（配列は配列、Hash は Hash、日付は `YYYY-MM-DD`、時刻は ISO 8601 の UTC）。

| ファイル | 元 | 列 |
| --- | --- | --- |
| `users.jsonl` | `users` | `id email encrypted_password confirmed_at invitation_accepted_at invitation_token provider uid sign_in_count current_sign_in_at locked_at unconfirmed_email stripe_customer_id stripe_subscription_id trial_end max_staffs_count created_at updated_at` |
| `tenants.jsonl` | `tenants` | `id uuid user_id name shift_cycle start_of_week created_at updated_at` |
| `staffs.jsonl` | `staffs` | `id tenant_id name position disabled max_work_week available_wdays(配列) available_patterns(配列) default_patterns(Hash) created_at updated_at` |
| `patterns.jsonl` | `patterns` | `id tenant_id name description color_hex kind pair_pattern_id position default_required_nums(Hash) created_at updated_at` |
| `shifts.jsonl` | `shifts` | `id date pattern_id staff_id fixed created_at updated_at` |
| `required_nums.jsonl` | `required_nums` | `id date pattern_id num` |
| `restrictions.jsonl` | `restrictions` | `id tenant_id kind days pattern1_id pattern2_id position created_at updated_at` |
| `events.jsonl` | `events` | `id tenant_id date note created_at updated_at` |
| `shares.jsonl` | `shares` | `id tenant_id code start_date end_date created_at` |
| `manifest.json` | — | 各テーブルの行数・ダンプの取得時刻・v1 の最終コミット・`Rails.env`・YAML 列の形の集計（§5.2） |
| `v1-subscriptions.csv` | `users` + `shifts` | 019 §8.2 のスクリプトの入力（`v1_user_id, email, stripe_customer_id, stripe_subscription_id, max_staffs_count, last_edited_at`）。同じダンプから出すことで、データ移行と Stripe の引き継ぎの「対象」がずれない |

- `shift_cycle` / `kind` は **enum の名前**（`month` / `workday`）で書く（整数を v2 で読み替えない）
- YAML 列は `staff.available_wdays`（配列）・`staff.available_patterns`（配列）・`staff.default_patterns`（Hash）・`pattern.default_required_nums`（Hash）を**モデルの属性として読んだ値**をそのまま書く。
  `default_required_nums` は json 列に YAML 文字列が入っている疑いがある（v1 分析 §2.2）。読んだ値が `String` なら `YAML.safe_load(..., permitted_classes: [ActiveSupport::HashWithIndifferentAccess, Symbol])` でもう一段ほどき、`manifest.json` に「文字列だった件数」を出す
- `available_wdays` が nil のスタッフは、v1 の画面が「担当可」をどう判定しているか（`Staff#available?` 相当）を見て、**その判定の結果と同じ配列**にする（nil = 全日不可なら `[]`、全日可なら `[0..6]`）。rake の中で判定し、理由を manifest に書く（§13-3）
- `find_each`（1000 件ずつ）で書く。`shifts` は数十万〜数百万行を見込む（件数は §9.1 で埋める）
- 個人情報を含むので、出力先はリポジトリの外（`~/v1-export/`）。`.gitignore` に `v1-export/` を足しておく

### 5.2 manifest に出す集計（v1 分析 §7.2 の「必ず確認すること」）

| # | 集計 | 使い道 |
| --- | --- | --- |
| 1 | `patterns.default_required_nums` の型の内訳（Hash / String / nil） | §5.1 のほどき方の確認 |
| 2 | `staffs` の YAML 列が nil の件数 | nil の読み替え（§5.1） |
| 3 | `shifts` の `(staff_id, date)` 重複の組数・`staff_id IS NULL` の件数 | §7.6 で捨てる件数の見込み |
| 4 | `patterns.pair_pattern_id` が自分自身・他店舗・存在しない id を指す件数 | §7.4 |
| 5 | `users` の未確認（`confirmed_at IS NULL`）の内訳: 招待未承認 / 承認済みだが未確認 / ログイン実績あり | §7.1 の規則を決める |
| 6 | `provider = 'google_oauth2'` の件数 | §7.1 |
| 7 | 文字数超過の件数（店舗名 20 / スタッフ名 10 / パターン名 6 / 説明 10 / メモ 12） | 003 §3.10。想定外に多ければ CHECK の緩和を再検討 |

## 6. インポート（v2 側）

### 6.1 `scripts/migrate-v1/import.ts`

```
V1_UUID_NAMESPACE=... MIGRATION_DATABASE_URL=postgresql://... \
  npm run migrate:v1 -- --input ~/v1-export/20261025-0100 [--rollback] [--report ~/v1-export/20261025-0100/report.json]
```

| 項目 | 内容 |
| --- | --- |
| 接続 | `pg`（新しい devDependency）。`MIGRATION_DATABASE_URL`（ローカルは `postgresql://postgres:postgres@127.0.0.1:54322/postgres`、本番は Session pooler の URL + `sslmode=require`）。`.env.local` には書かず、実行する shell で渡す |
| 名前空間 | `getV1UuidNamespace()`（`lib/migration/v1Ids.ts`）。無ければ起動時に止まる。**本番の Vercel に入れる `V1_UUID_NAMESPACE` と同じ値**でなければ旧 URL が別の id に解決される。起動時に既知の店舗トークン 1 件の導出結果を表示し、手順書の値と目で突き合わせる |
| 実行の単位 | `BEGIN` → 全テーブル → 件数の突合（§8.1）→ `COMMIT`（`--rollback` なら `ROLLBACK`）。途中の例外は `ROLLBACK` して非 0 で終わる |
| 順序 | `auth.users` → `auth.identities` → `profiles`（UPDATE）→ `tenants` → `patterns`（`pair_pattern_id` は後から UPDATE）→ `staffs` → `staff_patterns` → `staff_default_patterns` → `shifts` → `required_nums` → `restrictions` → `date_notes` → `shares` → `staff_count_history` |
| 書き込み | 1000 行ずつの複数行 `INSERT`（`pg` のパラメータ上限 65535 に収まる列数にする）。リハーサルで遅ければ `COPY FROM STDIN`（`pg-copy-streams`）に替える。**最後に `ANALYZE`** |
| トリガ | 冒頭で `alter table public.staffs disable trigger staffs_record_staff_count`、末尾で `enable`（§3-2）。`on_auth_user_created` は**止めない**（`profiles` を作らせる。`handle_new_user` は `on conflict do nothing`） |
| 既存データ | 起動時に `auth.users` と `public.tenants` の件数を表示し、`tenants` が 0 件でなければ `--allow-existing` が無い限り止まる（本番は管理用アカウント 1 件だけの状態で流す。ローカルは seed が入っているので `--allow-existing`） |
| レポート | `report.json`: テーブルごとの `読んだ / 入れた / 捨てた（理由別）/ 直した（理由別）`、捨てた行の id と理由、切り詰めた値の前後。**個人情報（名前・メモ）を含む**のでエクスポートと同じ場所に置き、同じ扱いで保管する |
| 実行環境 | `tsx --conditions=react-server`（`stripe:*` と同じ。`server-only` の `lib/calendar/holidays.ts` を読むため） |

### 6.2 変換は純関数（`src/lib/migration/`）

| ファイル | 役割 |
| --- | --- |
| `v1Ids.ts` | 既存。`v1Uuid(table, id, ns)`。**id の導出はここ以外に書かない**（005 §3.2） |
| `v1Types.ts` | JSONL の行の型と Zod（読み込み時に 1 行ずつ検査。形が違えばその場で止まる） |
| `transform.ts` (+ test) | テーブルごとの `transformXxx(rows, context) → { rows, dropped, fixed }`。context は「移行する users の id 集合」「tenant → owner」「pattern → tenant」など、親テーブルの変換結果 |
| `truncate.ts` (+ test) | 文字数の切り詰め（コードポイント単位。`char_length` と同じ数え方）。切り詰めの前後を返す |
| `requiredNums.ts` (+ test) | 焼き付けられた行の判定（§7.7）。`resolveRequiredNum()` の逆向きで、祝日は呼び出し側が渡す |

スクリプトは「読む → 変換 → 書く」の配線だけにし、判断は純関数に置く（AGENTS.md の「`_lib/` は Vitest 対象」と同じ考え）。

## 7. テーブルごとの変換（001 §5.2 を今のスキーマで書き直したもの）

共通:

- id は `v1Uuid('<table>', id, ns)`。tenants だけ 22 文字トークン（`uuid` 列）を名前にする
- `created_at` / `updated_at` は v1 の値をそのまま
- 文字数超過は CHECK と同じ長さに切り詰め、前後を記録する（003 §3.10）。切り詰めは `.trim()` の後
- 親が移行されない行（捨てた user の店舗、捨てた店舗のスタッフ…）は連鎖して捨て、理由に `parent_dropped` を付ける
- `position` は v1 の `(position, id)` 順に **0 から振り直す**（v1 の acts_as_list は 1 始まり。v2 は 0 始まりで並べ替え RPC が振り直すので、値そのものに意味は無い）

### 7.1 users → `auth.users` / `auth.identities` / `profiles`

| v1 | v2 |
| --- | --- |
| 招待未承認（`invitation_accepted_at IS NULL AND invitation_token IS NOT NULL`） | **移行しない**（パスワードが無い。001 §5.2） |
| `confirmed_at IS NULL` で上以外 | **§13-1 で決める。** 案: `sign_in_count > 0` なら確認済みとして入れる（`email_confirmed_at = coalesce(confirmed_at, invitation_accepted_at, created_at)`）。ログイン実績が無ければ未確認のまま入れる（`email_confirmed_at = null`。v2 は `enable_confirmations = true` なので、ログインには確認メールの再送が要る） |
| `encrypted_password`（Devise の bcrypt `$2a$`） | そのまま `encrypted_password` へ。GoTrue は `$2a$` を受ける。**リハーサルで実際にログインして確かめる**（§9.2） |
| `provider = 'google_oauth2'`・`uid` | `raw_app_meta_data = {"provider":"google","providers":["google"]}`、`auth.identities` に `provider = 'google'`・`provider_id = uid`・`identity_data = {"sub": uid, "email", "email_verified": true}`。`encrypted_password` は **null**（v1 の omniauth が入れた乱数のパスワードは誰も知らない。004 §3.5 の「Google だけの人」として扱わせる） |
| それ以外 | `raw_app_meta_data = {"provider":"email","providers":["email"]}`、`auth.identities` に `provider = 'email'`・`provider_id = <v2 の id>`（seed と同じ形） |
| その他の列 | `instance_id = '00000000-…'`、`aud = role = 'authenticated'`、`raw_user_meta_data = '{}'`、`last_sign_in_at = current_sign_in_at`、token 系 4 列は `''`（seed の注記。null だと GoTrue が落ちる） |
| `locked_at`・`unconfirmed_email` | 無視する（ロックは解除、メール変更の途中は捨てる）。件数だけ記録 |
| `profiles`（トリガが作った後に UPDATE） | `stripe_customer_id`（そのまま）/ `trial_end`（そのまま）/ `max_staffs_count`（**`stripe_subscription_id IS NULL AND max_staffs_count >= 11` のときだけ**その値。個別契約）/ `staff_cap`（**`stripe_subscription_id IS NOT NULL AND max_staffs_count >= 11` のとき** `least(greatest(max_staffs_count, 移行時点の在籍数), 1000)`。019 §13.7）/ `is_admin` は **立てない**（§3-3） |

- `email` は Devise が小文字で保存している。念のため `.toLowerCase().trim()` し、重複があれば止まる（`auth.users` の一意制約に任せず、変換で先に検出して理由を出す）
- 店舗を 1 つも持たないユーザーも移行する（ログインできて `/tenants/new` に着く）

### 7.2 tenants

| v1 | v2 |
| --- | --- |
| `id = v1Uuid('tenants', uuid)`、`owner_id = v1Uuid('users', user_id)` | 旧 URL の 308 が同じ式で解決する（`lib/tenants/legacyUrl.ts`） |
| `name` | trim → 20 文字に切り詰め。空なら `'店舗'` にして記録（NOT NULL + `between 1 and 20`） |
| `shift_cycle` / `start_of_week` | そのまま（enum の名前。`start_of_week` が 0..6 の外なら 0 にして記録） |
| `setup_completed_at` | **スタッフが 1 人でもいれば（退職者を含む）`created_at`、いなければ null**（014 §5.10。v1 の `tutorial_completed?` とはわざと違う） |
| `assist_notes` | null |

### 7.3 staffs → `staffs` / `staff_patterns` / `staff_default_patterns`

| v1 | v2 |
| --- | --- |
| `name` | trim → 10 文字。空なら `'スタッフ'` にして記録 |
| `disabled = true` | `retired_at = updated_at`（001） |
| `max_work_week` | 0..7 の外は 5（既定）にして記録 |
| `available_wdays` | 整数に寄せ、0..6 だけ残し、重複を除いて昇順。nil は §5.1 の読み替え |
| `available_patterns` → `staff_patterns` | 要素ごとに `v1Uuid('patterns', id)`。**同じ店舗に存在するパターンだけ**残す（他店舗・削除済みは捨てて記録） |
| `default_patterns` → `staff_default_patterns` | キーは `'0'..'6'` / `'holiday'` だけ。値が空・0・存在しない・他店舗なら捨てる |
| `kana`・`group_id` | 捨てる（廃止） |

### 7.4 patterns

| v1 | v2 |
| --- | --- |
| `name` / `description` | trim → 6 / 10 文字。`name` が空なら `'勤務'` にして記録。`description` が空なら null |
| `color_hex` | nil → `'#FFFFFF'`。`^#[0-9A-Fa-f]{6}$` に合わなければ `'#FFFFFF'` にして記録（`#` 無し・3 桁などは直せるなら直す） |
| `kind` | enum の名前 |
| `pair_pattern_id` | 自分自身・他店舗・存在しない → null にして記録。**全パターンを入れた後に UPDATE**（複合 FK `(pair_pattern_id, tenant_id)` の参照先が要る） |
| `default_required_nums` | `parseRequiredNums()`（`lib/patterns/requiredNums.ts`）と同じ規則で数値化（文字列の数字 → 数値、範囲外のキー・値は捨てる）。結果が空なら `{}` |

### 7.5 （中間）`staff_patterns` / `staff_default_patterns`

7.3 で組む。`tenant_id` はスタッフの店舗。パターンの店舗と一致しない行は捨てる（複合 FK で DB も弾くが、理由を出すために先に判定する）。

### 7.6 shifts

| v1 | v2 |
| --- | --- |
| `staff_id IS NULL` | 捨てる（自動アサインの一時 Task。v1 分析 §2.2） |
| `staff_id` が存在しない（FK 無し） | 捨てて記録 |
| スタッフの店舗 ≠ パターンの店舗 | 捨てて記録 |
| `(staff_id, date)` の重複 | `updated_at` が最新の 1 件（同時刻なら id が大きいほう）を残し、残りを捨てて記録 |
| `tenant_id` | スタッフの店舗 |
| `fixed` | そのまま。`assist_token` は捨てる。`assist_run_id` は null |

退職したスタッフのシフトも入れる（スタッフの行は残るので FK は通る。v1 と同じく過去の表に出る）。

### 7.7 required_nums（§3-4）

| v1 | v2 |
| --- | --- |
| `tenant_id` | パターンの店舗 |
| パターンが `dayoff` | 捨てて記録（v1 も workday しか作らない。v2 の画面にも出ない） |
| **焼き付けられた行** | **捨てる**。判定は 015 の migration（`20261005150000_resolve_required_nums.sql`）と同じで、祝日だけアプリで解決する: `num = (default_required_nums[dayKeyFor(date, isHolidayDate(date))] ?? 0)` なら捨てる |
| 残った行 | 「この日だけの上書き」として入れる（`unique (pattern_id, date)` の重複は最新のみ） |

- 015 の SQL は祝日を見られず「曜日の値と `holiday` が同じときだけ」消えたが、TS は `lib/calendar/holidays.ts` を使えるので**祝日は `holiday` キーで判定**する。v1 の焼き付けは祝日に `holiday` の値を入れていた（v1 分析 §3.4）ので、こちらのほうが v1 の意図どおりに消える
- 015 §7 の注記どおり、`num = 0` で基本が未設定の行も消える（「0 人」→「未設定」。表では `n/0` が `n/—` になる）。消した件数を記録し、リハーサルのサンプル比較（§8.2）で表示の違いを目で確かめる

### 7.8 restrictions

| v1 | v2 |
| --- | --- |
| `kind` | 4 種はそのまま enum へ。それ以外の文字列は捨てて記録 |
| `days` / `pattern1_id` / `pattern2_id` | `toRestrictionColumns()`（`lib/validation/restrictions.ts`）と同じく、**種別が使わない列は null** にする。使う列が無い（`max_work_week` に `days` が無い / `deny_pattern_pair` のパターンが無い・他店舗）行は捨てて記録。`days` が 1..7 の外なら捨てて記録（006 §10.12: v1 の画面も 1..7） |
| 追加の 3 列 | `staff_id = null` / `hard = true` / `wdays = null`（013 §5.7） |

### 7.9 events → `date_notes`

| v1 | v2 |
| --- | --- |
| `note` | trim → 12 文字。空は捨てる（v1 は「空で保存 = 削除」だが行が残っていることがある） |
| `(tenant_id, date)` の重複 | 最新のみ |

### 7.10 shares

| v1 | v2 |
| --- | --- |
| `code` | そのまま（`^[A-Za-z0-9]{8}$` に合わなければ捨てて記録。配った URL が壊れるので 0 件のはず） |
| `end_date - start_date > 31` | `end_date = start_date + 31` にして記録（v1 は 30 日に切っていたが、CHECK は 31 なので CHECK に合わせる） |
| `end_date < start_date` | 捨てて記録 |
| 期限切れの共有 | **入れる**（v1 の一覧にも「期限切れ」として出る。009） |

### 7.11 `staff_count_history`（019 §8.1）

全テーブルを入れた後、同じトランザクションで 1 文:

```sql
insert into public.staff_count_history (user_id, active_count, changed_at)
select p.id, count(s.id) filter (where s.retired_at is null), now()
  from public.profiles p
  left join public.tenants t on t.owner_id = p.id
  left join public.staffs s on s.tenant_id = t.id
 where p.id in (<移行した users の id>)
 group by p.id;
```

移行時点の在籍数が「期間の開始時点の人数」になる（請求は Stripe の引き継ぎの後、最初の期間から。019 §4.2）。

## 8. 検証

### 8.1 インポートの中で（COMMIT の前）

| 確認 | 期待 |
| --- | --- |
| テーブルごとの件数 | `読んだ − 捨てた = 入れた = select count(*)`（移行対象の id に絞る） |
| `auth.users` と `profiles` | 件数が同じ。`profiles.email = auth.users.email` |
| `staff_cap` を 1000 で切った人数 | 0（019 §13.7） |
| 無料扱い（Subscription 無し・個別契約でない）で在籍 11 人以上の人数と一覧 | 報告する（v2 では lock panel が出る。多ければカットオーバーの前に連絡。019 §8.1） |
| `tenants` で `setup_completed_at is null` の件数 | = スタッフ 0 人の店舗の数 |
| 切り詰めた値の件数（列ごと） | 報告する。想定外に多ければ 003 §3.10 の 2 を再検討 |

どれかが合わなければ `ROLLBACK` して非 0 で終わる。

### 8.2 移行後の DB に対して（`scripts/migrate-v1/verify.ts` + 手で）

| # | 確認 | 方法 |
| --- | --- | --- |
| 1 | 件数の突合（再掲） | `verify.ts` が `manifest.json` と `report.json` と DB を比べる |
| 2 | パスワード | リハーサルでは restore した v1 の 1 ユーザーに既知のパスワードを `rails runner` で入れてからエクスポートし、v2 でログインする。本番では自分のアカウント |
| 3 | 旧 URL | `curl -I https://<v2>/tenants/<v1 トークン>/shifts?start_date=2026-10-01` が 308 で `/tenants/<uuid>?start=…`、その uuid の店舗が開く |
| 4 | 共有 URL | 有効な `shares` を 3 件選び `/share/<code>` が v1 と同じ表を出す。期限切れは 404 |
| 5 | **CSV の一致** | サンプル店舗 5 件（スタッフ数の多い店・ペアのある店・退職者のいる店・半月表示の店・必要人数の上書きが多い店）で、v1 の `shifts.csv?encoding=utf8` と v2 の `/api/tenants/<id>/shifts/csv?encoding=utf8` を同じ `start` で取り `diff`。違いは 1 つずつ理由を書く（CSV は 010 で v1 と同じ形に作った） |
| 6 | 必要人数 | 5 のサンプルで、v1 の表の `required / assigned` と v2 の表の数字が同じ（§7.7 で消した行が表示を変えていない） |
| 7 | 準備中 | 移行した店舗を開いて `/setup` に送られない（§7.2） |
| 8 | Google の人 | `auth.identities` に `google` の行があり、アカウント画面でパスワード欄が出ない（004 §3.5）。`encrypted_password = null` のままメール + パスワードのログインが「メールアドレスまたはパスワードが違います」で止まり、GoTrue が落ちないこと。実際の Google ログインは本番の Google の資格情報が要るので 022 で |
| 9 | 課金の列 | `profiles` の `stripe_customer_id` / `trial_end` / `max_staffs_count` / `staff_cap` を数件、v1 の値と目で比べる。`staff_count_history` が全員 1 行 |
| 10 | 制約 | 制約を持つ店舗を 2 件開き、設定画面に v1 と同じ行が出る |

## 9. リハーサル

### 9.1 手元（ローカル Supabase）

1. Heroku からダンプを取る（`heroku pg:backups:capture` → `download`）。**取った日時と件数を本プランの §14 に書く**（`shifts` の行数で所要時間を見込む）
2. 手元の v1 に restore → `rails v2:export`
3. `npx supabase db reset`（seed あり）→ `npm run migrate:v1 -- --input … --allow-existing`
4. §8.2 の 1〜10（Google は 8 の範囲まで）
5. 所要時間を記録する。エクスポート・インポート・検証のそれぞれ

### 9.2 直すものが出たら

変換の純関数とテストを直して 9.1 の 3 からやり直す。**エクスポート側（Ruby）を直すのは YAML の読み方だけ**にし、判断は TS に寄せる。

### 9.3 本番の Supabase に対する予行（`--rollback`）

本番のプロジェクト（022 で作る）が出来たら、管理用アカウントだけの状態で `--rollback` を流す。

- 確かめること: Session pooler につながる / `postgres` ロールで `auth.users` に INSERT できる・`staffs` のトリガを止められる（クラウドの `postgres` は superuser ではない。できなければ §13-4）/ 所要時間（手元との差）/ §8.1 がすべて通る
- 何も残らないので、何度でも流せる。**当日の前に最低 1 回**、できれば当日の朝にもう 1 回（ネットワークと権限の最終確認）

## 10. カットオーバーでの位置（022 に渡す）

001 §5.4 と 019 §8.3 を本プランの手順で具体化したもの。時間は 9.1 / 9.3 で埋める。

| 順 | 手順 | 目安 |
| --- | --- | --- |
| 1 | Heroku `MAINTENANCE_MODE=on`。Heroku Scheduler の `stripe:create_usage_record` を止める（019 §8.2） | |
| 2 | `heroku pg:backups:capture` → download → 手元に restore → `rails v2:export` | |
| 3 | `npm run migrate:v1 -- --input … --rollback`（最終確認）→ `--rollback` 無しで本番へ | |
| 4 | `verify.ts` + §8.2 の 2〜4・7・9 を本番で | |
| 5 | `npm run stripe:migrate-v1 -- --input …/v1-subscriptions.csv`（dry-run → `--limit 5` → 全部。019 §8.2.3） | |
| 6 | 全員の同期（019 §8.3-4）→ Stripe の Dashboard の設定を切り替える | |
| 7 | DNS を Vercel へ。`V1_UUID_NAMESPACE` が本番の env に入っていることを 3 の前に確かめておく（005 §3.1） | |
| 8 | ダンプ・エクスポート・`report.json`・Stripe の結果 CSV を暗号化して保管（保管期間は §13-6） | |

3 で失敗したら: トランザクションごと戻っているので、原因を直して 3 からやり直す。v1 は止まったままなのでデータはずれない。
直すのに時間がかかるなら Heroku のメンテナンスモードを解いて日を改める（v2 には何も入っていない）。

## 11. ファイル

```
scripts/migrate-v1/
  import.ts                      読む → 変換 → 1 トランザクションで書く → 突合 → COMMIT / ROLLBACK
  verify.ts                      移行後の DB と manifest / report の突合
  v1/v2_export.rake              v1 に写して流す rake（§5）
src/lib/migration/
  v1Ids.ts (+ test)              既存
  v1Types.ts                     JSONL の行の Zod
  transform.ts (+ test)          テーブルごとの変換（§7）
  truncate.ts (+ test)           文字数の切り詰め
  requiredNums.ts (+ test)       焼き付けられた行の判定（§7.7）
package.json                     "migrate:v1" / "migrate:v1:verify"（tsx --conditions=react-server）、pg / @types/pg
.env.example                     MIGRATION_DATABASE_URL（コメントだけ。.env.local には書かない）
.gitignore                       v1-export/
AGENTS.md                        scripts/migrate-v1 と lib/migration の説明、環境変数
docs/plans/001-…/README.md       §5 の冒頭に「021 で上書き」の注記
```

## 12. 実装の順序と確認

1. `v1Types.ts` と `v2_export.rake` を先に書き、**形を 1 つに決める**（JSONL の 1 行 = Zod の 1 型）
2. `truncate.ts` / `requiredNums.ts` / `transform.ts` と Vitest（§7 の各行に 1 ケース以上。重複・他店舗・自己参照・空文字・範囲外）
3. `import.ts`。手元の seed だけの DB に、手で作った小さな JSONL（2 ユーザー・2 店舗・Google の人・捨てる行を含む）を入れて通す
4. `verify.ts`
5. 9.1 のリハーサル（本物のダンプ）。件数と所要時間を §14 に記録
6. AGENTS.md・001 の注記・`.env.example`
7. PR の前に `npm run lint` / `typecheck` / `test`。`npx supabase test db` はスキーマを触らないので変化なし

## 13. 決定と未確定

| # | 論点 | 状態 |
| --- | --- | --- |
| 1 | 未確認ユーザー（`confirmed_at IS NULL`、招待は承認済み）の扱い | **未確定**。案は §7.1（ログイン実績があれば確認済み扱い）。§5.2-5 の内訳を見てから決める |
| 2 | `V1_UUID_NAMESPACE` の値 | **未確定**。RFC 準拠の v4 を 1 つ作り、Vercel の Production と手順書（パスワード管理ツール）の両方に置く。一度決めたら変えない（`.env.example` の注記） |
| 3 | `staffs.available_wdays` が nil のときの読み替え | **未確定**。v1 の `Staff` の判定を見て §5.1 に書く |
| 4 | 本番の `postgres` ロールで `auth.users` への INSERT と `disable trigger` ができるか | **9.3 で確かめる**。できなければ: INSERT は `supabase_auth_admin` 相当の権限を一時的に付ける / トリガは止めずに `staff_count_history` を最後に `delete` して入れ直す |
| 5 | 1 トランザクション（§3-1）・トリガの止め方（§3-2）・`is_admin` を立てない（§3-3）・必要人数の間引き（§3-4） | **本プランで決定**（理由は §3）。異論があればここで |
| 6 | ダンプ・エクスポート・レポートの保管期間 | **未確定**。暗号化して保管し、期限を決めて消す（019 §8.1）。案: 移行から 1 年 |
| 7 | リハーサルのダンプをいつ取るか | **未確定**。実装の 5（§12）の前。古いダンプでよい |
| 8 | 書き込みが遅いときの `COPY` への切り替え | 9.1 の所要時間で判断。目安: インポート全体が 10 分を超えるなら切り替える |

## 14. 実装ログ

（未着手）

# 021: v1 データ移行（エクスポート・インポート・検証・リハーサル）

- 前提: `docs/v1-analysis.md`（§2 データモデル・§7.2 移行で必ず確認すること）/ 001 §3.1（対応表・uuid v5）・§5（移行の方針）/
  003 §3.10（文字数の切り詰め）/ 005（`lib/migration/v1Ids.ts`・旧 URL）/ 013 §5.7（制約の 3 列）/ 014 §5.10（`setup_completed_at`）/
  015 §5.5（必要人数の上書きだけを残す）/ 019 §8.1・§13.7（`profiles` の課金の列・`staff_count_history`）/ 020 §5.1（`is_admin`）
- v1 のコード: `db/schema.rb`、`app/models/{user,tenant,staff,pattern,shift,required_num,restriction,event,share}.rb`、`config/application.rb`（YAML の許可クラス）

> 番号: 013 / 014 の冒頭注記では移行を 015 / 016 に繰り下げていたが、015〜020 が別の用途に使われたので本プランを **021** とし、
> カットオーバー（本番の構築・DNS・告知・当日の手順）は **022** にする。本プランはカットオーバーのうち「データを v2 に入れて確かめる」部分だけを扱う。

**状態: プラン（未実装）。2026-10-10 に作成。同日に §13 の 1〜3・5・6 を決めた（未確認ユーザー・名前空間の定数化・YAML 列の NULL・保管期間）。残りはリハーサルのダンプの時期（#7）と、リハーサルで確かめること（#4・#8）だけ。**

---

## 1. 目的と完了条件

### 目的

v1（Rails / Heroku Postgres）の全データを v2（Supabase）に移し、**利用者が v1 と同じメール・パスワードでログインすると、同じ店舗・同じシフト表・同じ共有 URL が開く**状態を作る。
移行は 1 回きりだが、カットオーバーの当日に初めて流すのではなく、**本番と同じ手順をリハーサルで何度も通して**、当日は手順をなぞるだけにする。

### 完了条件

- [ ] v1 の本番ダンプから `v1-export/<日時>/` の JSONL 一式が出る（Ruby 側で YAML を復元済み）
- [ ] `npm run migrate:v1 -- --input <dir>` が、`tenants` が 0 件の v2 DB（本番は管理用アカウントだけ）に対して **1 トランザクション**で全テーブルを入れ、件数の突合（v1 の件数 − 捨てた件数 = v2 の件数）を自分で確かめて通る
- [ ] 捨てた行・切り詰めた値・直した値が、理由つきでレポート（JSON）に残る
- [ ] ローカルのリハーサルで: v1 と同じパスワードでログインできる / v1 の店舗 URL（22 文字トークン）が 308 で移行後の店舗に着く / `/share/<code>` が開く /
      サンプル店舗の CSV が v1 と一致する（切り詰めた名前を除く）/ 移行後の店舗が「準備中」にならない / 必要人数の表示が焼き付け済みの期間で v1 と同じ
- [ ] 本番の Supabase に対して `--rollback`（全部入れて最後に ROLLBACK）で通り、所要時間が分かっている
- [ ] 019 §8.2 の Stripe の引き継ぎスクリプトの入力（`v1-subscriptions.csv`）が、インポートと同じ判定（移行する人）で出る

## 2. 範囲

### 作る

| 区分 | 中身 |
| --- | --- |
| エクスポート | v1 の rake タスク `v2:export`（このリポジトリに置き、v1 に写して流す）。テーブルごとの JSONL + `manifest.json` + `usage_records.csv`（保管用。§5.1） |
| 変換 | `src/lib/migration/` の純関数（v1 の行 → v2 の行 + 捨てた理由）。Vitest で固定する |
| インポート | `scripts/migrate-v1/import.ts`。`pg` で Postgres に直接つなぎ、1 トランザクションで入れる。`--rollback` で本番の予行ができる。Stripe の引き継ぎ用の CSV（§5.1）と `report.json` もここが書く |
| 検証 | インポートの最後に同じトランザクションの中で件数を突合。別に `scripts/migrate-v1/verify.ts` で移行後の DB と v1 の件数・サンプルを比べる |
| 手順書 | リハーサルと当日の手順（§9・§10）。022 がこれを当日のチェックリストに組み込む |

### 作らない

| 項目 | 理由 / 代わり |
| --- | --- |
| `staff_groups` / `invoices` / `usage_records` の移行 | 001 §3.1・019 §5.2 の決定どおり移行しない。`usage_records` だけは名前を含まない CSV に抜いて 1 年残す（§10-8） |
| 対応表・`legacy_id` 列 | uuid v5 で導出する（001 §3.1）。`v1Uuid()` 以外で id を組まない |
| 差分・追いつき移行（v1 を動かしたまま 2 回目を流す） | カットオーバーは v1 を止めてから 1 回（001 §5.4）。差分は要らない。失敗したらトランザクションごと戻して流し直す |
| Stripe の Subscription の引き継ぎ | 019 §8.2 の `scripts/stripe/migrate-v1-subscriptions.ts`（実装済み）。本プランは入力の CSV を出すだけ |
| 本番の構築・DNS・告知・当日の進行 | 022 |

## 3. 001 からの変更点（先に決める）

001 §5 を書いた後に 003〜020 でスキーマと決定が変わった。本プランで上書きするのは次の 6 点。それ以外は 001 §5 のまま。

| # | 001 / 019 | 本プラン | 理由 |
| --- | --- | --- | --- |
| 1 | `INSERT ... ON CONFLICT (id) DO UPDATE` で再実行を冪等にする（001 §5.1） | **1 トランザクションで入れ、失敗したら全部戻す。`ON CONFLICT` は書かない** | 空の DB に 1 回入れるだけなので「途中から再開」は要らない。upsert にすると、親を更新して子が残る・捨てるべき行が前回の残骸として残る、といった半端な状態を自分で考えることになる。重複は PK で**うるさく失敗**させたほうが安全。副産物として `--rollback` で本番の予行ができる（§9.3） |
| 2 | インポートの間は `session_replication_role = replica` でトリガを止める（019 §8.1） | **止めるのは 3 つだけ**: `staffs_record_staff_count`（履歴）と、`patterns_set_updated_at` / `profiles_set_updated_at`（ペアの後追い UPDATE と `profiles` の UPDATE で v1 の `updated_at` が `now()` に上書きされないように）。`alter table … disable trigger …` をトランザクションの中で流し、終わりに enable | `replica` は FK の整合性トリガ（RI）も止める。壊れた参照（v1 には FK が無い列が多い）を DB が見逃すのは移行でいちばん避けたいこと。止めたいのは在籍数の履歴がスタッフ 1 行ごとに増えることだけなので、そのトリガだけ止める。上限の門番は `auth.uid()` が null なら通す（019 §5.3）ので止めない |
| 3 | `@assift.com` のユーザーに `is_admin = true`（001 §4.3） | **立てない** | 020 §5.1 で「`is_admin` は管理専用のアカウントにだけ立て、本体にはログインしない」と決めた。運営者の v1 アカウント（店舗を持ち本体で使う）に立てると、本体で盗まれたセッションで管理画面に入れる。管理用のアカウントはカットオーバーで別に作る（022） |
| 4 | `required_nums` は `tenant_id` を補完してそのまま（001 §5.2） | **焼き付けられた行を捨て、上書きだけ残す**（015 と同じ規則。祝日はアプリで判定） | 015 で `required_nums` の意味が「この日だけの上書き」に変わった。v1 の「デフォルト人数をセット」で期間ぶん焼き付いた行をそのまま入れると、基本の人数を直しても既存の期間に届かない（015 が直したこと）が v1 の店舗だけに残る。詳細は §7.7 |
| 5 | `shifts.assist_token` は廃止（001 §3.1） | 同じ。加えて v2 の `shifts.assist_run_id` は null | v1 の自動アサインの履歴は再現しない（012） |
| 6 | 名前空間は環境変数 `V1_UUID_NAMESPACE`（001 §3.1・005 §3.1） | **リポジトリの定数にする**（`lib/migration/v1Ids.ts` の `V1_UUID_NAMESPACE`。値は `uuidgen` で作った v4）。環境変数の読み取り・未設定時の警告・`.env.example` の項目は消す（**決定。2026-10-10**） | 秘密ではない（名前空間が分かっても RLS は破れず、店舗の uuid は旧 URL の 308 で見える）。一方で Vercel の Production・インポート・リハーサル・プレビューの 4 か所で同じ値でなければならず、一度決めたら変えられない。「複数の場所で同一で、永久に変えない値」は設定ではなく定数。定数にすればアプリとインポートが同じ import を読むので構造的にずれず、設定漏れも無くなる。値を意味のある形（ゾロ目など）にはしない: 推測できる名前空間と v1 の連番 id を合わせると全行の id を外から計算できる。いまは id の秘匿に頼っていないが、ランダムにしておけば将来もその前提を保てる。読み手に「定数である」ことを伝えるのは値の見た目ではなく、名前・コメント（秘密ではないが絶対に変えない）・値を固定するテストで行う |

## 4. 全体の流れ

```
Heroku 本番 ──pg_dump──▶ 手元の v1（ローカル DB に restore）──rails v2:export──▶ v1-export/<日時>/*.jsonl, manifest.json, usage_records.csv
                                                                                        │
                                                            npm run migrate:v1 -- --input v1-export/<日時> [--rollback]   → report.json, v1-subscriptions.csv
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
| `users.jsonl` | `users` | `id email encrypted_password password_is_email confirmed_at invitation_accepted_at invitation_token provider uid sign_in_count current_sign_in_at locked_at stripe_customer_id stripe_subscription_id trial_end max_staffs_count created_at updated_at`。`password_is_email` は `user.valid_password?(user.email)`（v1 の管理画面の「代理承認」が初期パスワードをメールにした人。§7.1。bcrypt の検証 1 回 ≈ 0.2 秒なので全員分で数分） |
| `tenants.jsonl` | `tenants` | `id uuid user_id name shift_cycle start_of_week created_at updated_at` |
| `staffs.jsonl` | `staffs` | `id tenant_id name position disabled max_work_week available_wdays(配列) available_patterns(配列) default_patterns(Hash) created_at updated_at` |
| `patterns.jsonl` | `patterns` | `id tenant_id name description color_hex kind pair_pattern_id position default_required_nums(Hash) created_at updated_at` |
| `shifts.jsonl` | `shifts` | `id date pattern_id staff_id fixed created_at updated_at` |
| `required_nums.jsonl` | `required_nums` | `id date pattern_id num` |
| `restrictions.jsonl` | `restrictions` | `id tenant_id kind days pattern1_id pattern2_id position created_at updated_at` |
| `events.jsonl` | `events` | `id tenant_id date note created_at updated_at` |
| `shares.jsonl` | `shares` | `id tenant_id code start_date end_date created_at` |
| `manifest.json` | — | 各テーブルの行数・ダンプの取得時刻・v1 の最終コミット・`Rails.env`・YAML 列の形の集計（§5.2） |
| `usage_records.csv` | `usage_records` | `user_id, staffs_count, created_at`（名前を含まない。1 年残す記録。§10-8） |

019 §8.2 の引き継ぎスクリプトの入力 `v1-subscriptions.csv`（`v1_user_id, email, stripe_customer_id, stripe_subscription_id, max_staffs_count, last_edited_at`）は **rake ではなく `import.ts` が書く**（§6.1）。
「移行する人」の判定（§7.1）を Ruby と TS の 2 か所に持たないため。`last_edited_at` は `shifts.jsonl` の `updated_at` の最大を staff → tenant → user でたどって TS が出す。
移行しない人の Subscription は `v1-subscriptions-not-migrated.csv` に分け、引き継ぎスクリプトには渡さず Dashboard で解約する（想定 0 件。022 の手順に入れる）。

- `shift_cycle` / `kind` は **enum の名前**（`month` / `workday`）で書く（整数を v2 で読み替えない）
- YAML 列は `staff.available_wdays`（配列）・`staff.available_patterns`（配列）・`staff.default_patterns`（Hash）・`pattern.default_required_nums`（Hash）を**モデルの属性として読んだ値**をそのまま書く。
  `default_required_nums` は **json 列に `serialize :default_required_nums, Hash`**（`app/models/pattern.rb`）なので、DB には YAML の文字列が JSON の文字列として入っている（二重エンコード。v1 分析 §2.2 の疑いは事実）。モデルの属性として読めば Hash に戻る。値は `to_i` されていないので `"2"` のような文字列が混じる（v2 の `parseRequiredNums()` が数値に寄せる）。念のため、読んだ値が `String` なら `YAML.safe_load(..., permitted_classes: [ActiveSupport::HashWithIndifferentAccess, Symbol])` でもう一段ほどき、`manifest.json` に「文字列だった件数」を出す
- YAML 列が NULL のスタッフは、**モデルを通して読んだ値をそのまま書く** = `available_wdays` / `available_patterns` は `[]`、`default_patterns` は `{}`（**決定。2026-10-10**。§13-3）。
  v1 は `serialize :available_wdays, Array` で、Rails は NULL を `[]` として読む。画面の「担当可 / 不可」（`Staff#available_wday?`）・ポップオーバーの絞り込み・自動アサインはすべてモデル経由なので、v1 でも NULL と `[]` は区別されていない（= 全日「担当不可」）。rake に特別な読み替えは書かない。NULL の件数だけ manifest に出す（列は 2018-01-04 に足され、クローズドベータは 2019-02 からなので 0 件のはず）
- `find_each`（1000 件ずつ）で書く。`shifts` は数十万〜数百万行を見込む（件数は §9.1 で埋める）
- 個人情報を含むので、出力先はリポジトリの外（`~/v1-export/`）。`.gitignore` に `v1-export/` を足しておく

### 5.2 manifest に出す集計（v1 分析 §7.2 の「必ず確認すること」）

| # | 集計 | 使い道 |
| --- | --- | --- |
| 1 | `patterns.default_required_nums` の型の内訳（Hash / String / nil）と、値に文字列を含む件数 | §5.1 のほどき方の確認 |
| 2 | `staffs` の YAML 列が NULL の件数 | §5.1（0 件のはず。あれば v1 でも「担当不可」だった人として `[]` で入る） |
| 3 | `shifts` の `(staff_id, date)` 重複の組数・`staff_id IS NULL` の件数 | §7.6 で捨てる件数の見込み |
| 4 | `patterns.pair_pattern_id` が自分自身・他店舗・存在しない id を指す件数 | §7.4 |
| 5 | `users` の未確認（`confirmed_at IS NULL`）の内訳: 招待未承認 / 承認済みだが未確認 / ログイン実績あり | §7.1 の規則の確認（移行しないのに店舗を持つ人の一覧は `report.json` に出る。0 件のはず） |
| 6 | `provider = 'google_oauth2'` の件数 | §7.1 |
| 7 | 文字数超過の件数（店舗名 20 / スタッフ名 10 / パターン名 6 / 説明 10 / メモ 12） | 003 §3.10。想定外に多ければ CHECK の緩和を再検討 |
| 8 | `password_is_email` の件数と、`stripe_customer_id` を複数のユーザーが持つ組 | §7.1 |
| 9 | `restrictions` のうち種別に必要な列が無い行の件数（§7.8） | 捨てる件数の見込み |
| 10 | `required_nums` の `num > 32767` の件数、親の id が NULL の行の件数（`tenants.user_id` / `staffs.tenant_id` / `patterns.tenant_id` / `restrictions.tenant_id` / `events.tenant_id` / `shares.tenant_id` / `required_nums.pattern_id` / `shifts.pattern_id`）、`required_nums` の `date` が NULL・`num < 0` の件数、`shares.code` の重複の組 | §7 共通・§7.7・§7.10（v1 の列はほぼすべて nullable で、FK はあっても NULL は通る） |
| 11 | `provider = 'google_oauth2'` の人のうち `current_sign_in_at` が 90 日以内の件数 | §7.1（v1 は Google ログインが壊れていて、この人たちはパスワードで入っている） |
| 12 | スタッフ 0 人の店舗のうち、勤務パターン・制約・必要人数を持つ店舗の件数 | §7.2（準備中になり、初期設定でパターンを置き換えると消える。014 §5.10） |
| 13 | `max_staffs_count > 1000` の人、`encrypted_password = ''` の人（`confirmed_at` の有無 × `sign_in_count > 0` の内訳。移行対象の判定は Ruby では行わない） | §7.1・§8.1 |

## 6. インポート（v2 側）

### 6.1 `scripts/migrate-v1/import.ts`

```
MIGRATION_DATABASE_URL=postgresql://... \
  npm run migrate:v1 -- --input ~/v1-export/20261025-0100 [--rollback] [--report ~/v1-export/20261025-0100/report.json]
```

| 項目 | 内容 |
| --- | --- |
| 接続 | `pg`（新しい devDependency）。`MIGRATION_DATABASE_URL`（ローカルは `postgresql://postgres:postgres@127.0.0.1:54322/postgres`、本番は Session pooler の URL + `sslmode=require`）。`.env.local` には書かず、実行する shell で渡す |
| 名前空間 | `V1_UUID_NAMESPACE`（`lib/migration/v1Ids.ts` の定数。§3-6）。アプリの旧 URL 解決と同じ import を読むので、環境ごとの設定も突き合わせも要らない |
| 実行の単位 | `BEGIN` → 全テーブル → 件数の突合（§8.1）→ `COMMIT`（`--rollback` なら `ROLLBACK`）。途中の例外は `ROLLBACK` して非 0 で終わる |
| 順序 | `auth.users` → `auth.identities` → `tenants` → `patterns`（`pair_pattern_id` は後から UPDATE）→ `staffs` → `profiles`（UPDATE。`staff_cap` に在籍数が要るので staffs の後）→ `staff_patterns` → `staff_default_patterns` → `shifts` → `required_nums` → `restrictions` → `date_notes` → `shares` → `staff_count_history`。在籍数は TS が変換済みの `staffs` から数え、`profiles.staff_cap` と `staff_count_history` の両方に同じ値を使う（§8.1 で DB の `private.active_staff_count()` と突き合わせる） |
| 書き込み | 1000 行ずつの複数行 `INSERT`（`pg` のパラメータ上限 65535 に収まる列数にする）。リハーサルで遅ければ `COPY FROM STDIN`（`pg-copy-streams`）に替える。**最後に `ANALYZE`** |
| セッション | 冒頭で `set statement_timeout = 0` / `set idle_in_transaction_session_timeout = 0`（Supabase の既定で切られないように。自セッションなら superuser でなくても変えられる）。`pg` の型パーサは `date`（OID 1082）と `timestamptz`（1184）を**文字列のまま**受ける（`types.setTypeParser`。既定は JS の `Date` にして実行環境の TZ で 1 日ずれる）。`verify.ts` も同じ |
| トリガ | 冒頭で `staffs_record_staff_count` / `patterns_set_updated_at` / `profiles_set_updated_at` を `disable trigger`、末尾で `enable`（§3-2）。`on_auth_user_created` は**止めない**（`profiles` を作らせる。`handle_new_user` は `on conflict do nothing`）。`alter table … disable trigger` は SHARE ROW EXCLUSIVE ロックをトランザクションの間ずっと持つ。読み取りは通るが、その表への書き込み（Webhook や cron の同期による `profiles` の UPDATE）はコミットまで待つ。保守的に **Vercel の cron（23:20 / 23:50 JST）と重ねない**（§10） |
| 既存データ | 起動時に `auth.users` と `public.tenants` の件数を表示し、`tenants` が 0 件でなければ `--allow-existing` が無い限り止まる（本番は管理用アカウント 1 件だけの状態で流す。ローカルは seed が入っているので `--allow-existing`） |
| 上書き | `--overrides <json>`: 規則の外で手で決めたことをスクリプトに渡す口。`customerOwner`（`stripe_customer_id` を複数人が持つ組の持ち主。§7.1）と `forceMigrateUsers`（移行しない判定だが店舗を持つ人を確認済みで入れる。§7.1）。適用した上書きは `report.json` に残す。想定は空のファイルで、空でも手順は同じ（決めた結果を次の実行で再現できる） |
| レポート | `report.json`（`--input` と同じ場所）: テーブルごとの `BEGIN 直後の count(*) / 読んだ / 入れた / 捨てた（理由別）/ 直した（理由別）`、捨てた行の id と理由、切り詰めた値の前後、移行しないのに店舗を持つ人、適用した上書き。同じ場所に `v1-subscriptions.csv` と `v1-subscriptions-not-migrated.csv`（§5.1）。`--rollback` でも書く。**個人情報（名前・メモ）を含む**のでエクスポートと同じ場所に置き、暗号化して 1 年で消す（§10-8） |
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
- `created_at` / `updated_at` は v1 の値をそのまま。`profiles` はトリガが `now()` で作るので、§7.1 の UPDATE で v1 の値に直す（管理画面の「登録日」が `profiles.created_at`）
- 文字数超過は CHECK と同じ長さに切り詰め、前後を記録する（003 §3.10）。切り詰めは `.trim()` の後
- 親が移行されない行（捨てた user の店舗、捨てた店舗のスタッフ…）は連鎖して捨て、理由に `parent_dropped` を付ける
- **v1 で nullable の列は、`v1Types.ts` の Zod も `nullable()` で受ける**（`position` / `color_hex` / `note` / `name` / `provider` / `uid` / `stripe_*` / `trial_end` など。non-null で書くとリハーサルの最初の行で止まる）。`position` が null の行は末尾（id 順）。`stripe_customer_id` / `stripe_subscription_id` の空文字は null
- **親の id が NULL の行は `parent_missing` で捨てて記録する。** v1 の親を指す列はほぼすべて nullable（FK はあっても NULL は通る）。`v1Types.ts` の Zod も `nullable()` で受ける（0 件のはずだが、モデル経由の書き込み以外に保証が無い）
- `position` は v1 の `(position, id)` 順に **0 から振り直す**（v1 の acts_as_list は 1 始まり。v2 は 0 始まりで並べ替え RPC が振り直すので、値そのものに意味は無い）

### 7.1 users → `auth.users` / `auth.identities` / `profiles`

| v1 | v2 |
| --- | --- |
| 入れる人（**決定。2026-10-10**） | **v1 でログインできた人だけ**: `confirmed_at IS NOT NULL OR sign_in_count > 0`。全員を**確認済み**で入れる（`email_confirmed_at = coalesce(confirmed_at, invitation_accepted_at, created_at)`）。未確認（`email_confirmed_at = null`）の行は作らない |
| それ以外（招待未承認・未確認でログイン実績なし） | **移行しない**。招待未承認はパスワードが無い（001 §5.2）。未確認の人は Devise の confirmable が v1 でもログインを拒んでいる（`active_for_authentication?` が false）ので、店舗も作れていない。v2 で登録し直せば同じメールで新しく始められる。未確認の行を v2 に残すと、同じメールでの登録（GoTrue は既存の未確認ユーザーに確認メールを再送する）がパスワードを引き継ぐのか置き換えるのかが読みにくくなる |
| 保険 | `import.ts` が、移行しないユーザーのうち**店舗（スタッフかシフトのあるもの）を持つ人**を `report.json` に出す。想定は 0 件。1 件でもあれば個別に見て、入れるなら `--overrides` の `forceMigrateUsers`（§6.1）で確認済みとして入れる（その人は v1 で使えていたはず） |
| `encrypted_password`（Devise の bcrypt） | そのまま `encrypted_password` へ。v1 は **pepper なし・stretches 11・bcrypt 3.1.20**（`config/initializers/devise.rb`・`Gemfile.lock`）なので `$2a$11$…` の素の bcrypt で、GoTrue（Go の bcrypt）がそのまま検証できる。pepper があれば全員ログインできなくなるところだった。**リハーサルで実際にログインして確かめる**（§8.2-2・§9.1-4） |
| `password_is_email = true`（代理承認の初期パスワード） | **Google の人でも最優先で** `encrypted_password = null`（パスワードではログインできない。「パスワードを忘れた方」で再設定してもらう）。v1 は**店舗を新しく作るときだけ**（`tenants_controller.rb` の `check_init_password!` は `only: [:new]`）`valid_password?(email)` を見て変更させていたので、既に店舗を持つ人は初期パスワードのまま使えていた。v2 にその仕組みは無く、残すとメールを知る人が誰でも入れる。件数を記録し（想定より多いかもしれない）、022 の案内の分量を決める |
| `encrypted_password = ''`（v1 の既定値）で移行対象の人 | 理屈上いない（§7.1 の条件はログインできた人）が、いれば `null` にして記録 |
| `provider = 'google_oauth2'`・`uid` | `raw_app_meta_data = {"provider":"google","providers":["google","email"]}`、`auth.identities` に `google`（`provider_id = uid`・`identity_data = {"sub": uid, "email", "email_verified": true}`）と `email` の**両方**。`encrypted_password` は**そのまま残す**（`password_is_email` なら null）。`providers` に `email` があるので、アカウント画面のパスワード欄（`account/page.tsx` の `hasPassword`）と「パスワードを忘れた方」の guard（`requireEmailProviderAccount()`）が通る。`providers` は GoTrue が identity の link / unlink のときにしか計算し直さないので、書いた値がそのまま JWT に出る。**v1 は Google ログインが壊れていた**（`users/sessions/new.html.slim` がボタンに取り消し線を引き「現在、Google ログインできない問題が発生しています」と出している。v1 分析 §2.2）ので、この人たちは「パスワードを忘れた方」で自分のパスワードを作って入っている（Devise の recoverable は provider を見ない）。null にすると初日から締め出す。`from_omniauth` が入れた乱数の bcrypt が残っている人は誰もそれで入れないので、残しても害が無い。§5.2-11 で最近ログインしている人数を見る |
| `provider = 'google_oauth2'` だが `uid` が空 | 「それ以外」と同じ（`providers = ["email"]`・`email` の identity だけ・パスワードは残す）にして記録。最初の Google ログインで GoTrue が確認済みの同じメールに自動で結び付ける（001 §5.2 のとおり identity は保険） |
| それ以外 | `raw_app_meta_data = {"provider":"email","providers":["email"]}`、`auth.identities` に `provider = 'email'`・`provider_id = <v2 の id>`（seed と同じ形） |
| `auth.identities` の共通の列 | `id = gen_random_uuid()`、`identity_data` の `email` は小文字、`last_sign_in_at` / `created_at` / `updated_at` は v1 の `created_at`（seed と同じく明示する。本番の `auth` スキーマは GoTrue が管理していて既定値が版で変わりうる） |
| その他の列 | `instance_id = '00000000-…'`、`aud = role = 'authenticated'`、`raw_user_meta_data = '{}'`、`last_sign_in_at = current_sign_in_at`、token 系 4 列は `''`（seed の注記。null だと GoTrue が落ちる） |
| `locked_at` | 無視する（ロックは解除）。件数だけ記録。`unconfirmed_email` は v1 に無い（`reconfirmable = false`） |
| `profiles`（トリガが作った後、staffs の後に UPDATE） | `stripe_customer_id`（そのまま。v1 に一意制約が無く v2 は `unique` なので、同じ Customer を持つユーザーが 2 人以上いれば、`stripe_subscription_id` を持つ人を優先し、それでも決まらなければ `created_at` が古い 1 人に残して他は null にして記録。Customer を失った側の Subscription は v2 に結び付かないので、§5.2-8 が 0 件でなければ Stripe の Dashboard でその Customer の Subscription の持ち主を確かめてから決める）/ `trial_end`（そのまま）/ `created_at` / `updated_at`（v1 の値。トリガは止めてある）/ `max_staffs_count`（**`stripe_subscription_id IS NULL AND max_staffs_count >= 11` のときだけ**その値。個別契約）/ `staff_cap`（**`stripe_subscription_id IS NOT NULL AND max_staffs_count >= 11` のとき** `least(greatest(max_staffs_count, 移行時点の在籍数), 1000)`。019 §13.7）/ `is_admin` は **立てない**（§3-3）。v1 は `stripe_subscription_id` を退会以外で消さない（解約は上限を 10 人に下げるだけ。`user.rb`・`charges_controller.rb`）ので、「Subscription なし」= 一度も申し込んでいない人で、`max_staffs_count >= 11` なら管理者が SQL で入れた個別契約 |

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
| `available_patterns` → `staff_patterns` | 整数に寄せて重複を除き（PK が `(staff_id, pattern_id)`）、要素ごとに `v1Uuid('patterns', id)`。**同じ店舗に存在するパターンだけ**残す（他店舗・削除済みは捨てて記録） |
| `default_patterns` → `staff_default_patterns` | キーは `'0'..'6'` / `'holiday'` だけ。値が空・0・存在しない・他店舗なら捨てる |
| `kana`・`group_id` | 捨てる（廃止） |

### 7.4 patterns

| v1 | v2 |
| --- | --- |
| `name` / `description` | trim → 6 / 10 文字。`name` が空なら `'勤務'` にして記録。`description` が空なら null |
| `color_hex` | nil・空 → `'#FFFFFF'`。`^#[0-9A-Fa-f]{6}$` ならそのまま。`^[0-9A-Fa-f]{6}$` は `#` を付ける、`^#?[0-9A-Fa-f]{3}$` は各桁を 2 倍にする（どちらも記録）。それ以外は `'#FFFFFF'` にして記録 |
| `kind` | enum の名前 |
| `pair_pattern_id` | 自分自身・他店舗・存在しない → null にして記録。**全パターンを入れた後に UPDATE**（複合 FK `(pair_pattern_id, tenant_id)` の参照先が要る） |
| `default_required_nums` | `parseRequiredNums()`（`lib/patterns/requiredNums.ts`）と同じ規則で数値化（文字列の数字 → 数値、範囲外のキー・値は捨てる）。結果が空なら `{}`。**`dayoff` のパターンは `{}`**（v2 は休みに変えたら空にする。015 §3.4） |

### 7.5 （中間）`staff_patterns` / `staff_default_patterns`

7.3 で組む。`tenant_id` はスタッフの店舗。パターンの店舗と一致しない行は捨てる（複合 FK で DB も弾くが、理由を出すために先に判定する）。

### 7.6 shifts

| v1 | v2 |
| --- | --- |
| `staff_id IS NULL` | 捨てる（自動アサインの一時 Task。v1 分析 §2.2） |
| `staff_id` が存在しない（FK 無し） | 捨てて記録 |
| `pattern_id` が null・存在しない | 捨てて記録（v1 は FK と `dependent: :destroy` があるので 0 件のはず） |
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
| `date` が NULL・`YYYY-MM-DD` でない / `num < 0` / `num > 32767` | 捨てて記録（v1 の `date` は nullable で、`required_nums_controller#update` は `params[:date]` と `num` を検査せずに保存する。v2 は `date not null`・`num >= 0`・`smallint`。99 超 32767 以下は画面の上限を超えるが DB には入るので残す） |
| **焼き付けられた行** | **捨てる**。判定は 015 の migration（`20261005150000_resolve_required_nums.sql`）と同じで、祝日だけアプリで解決する: `num = (default_required_nums[dayKeyFor(date, isHolidayDate(date))] ?? 0)` なら捨てる。`default_required_nums` は §7.4 で数値化した後の値（v1 の文字列のまま比べない） |
| 残った行 | 「この日だけの上書き」として入れる（v1 にも `unique (date, pattern_id)` があるので重複は無い） |

- 015 の SQL は祝日を見られず「曜日の値と `holiday` が同じときだけ」消えたが、TS は `lib/calendar/holidays.ts` を使えるので**祝日は `holiday` キーで判定**する。v1 の焼き付けは祝日に `holiday` の値を入れていた（v1 分析 §3.4）ので、こちらのほうが v1 の意図どおりに消える
- 015 §9.2 の注記どおり、`num = 0` で基本が未設定の行も消える（「0 人」→「未設定」。表では `n/0` が `n/—` になる）。消した件数を記録し、リハーサルのサンプル比較（§8.2）で表示の違いを目で確かめる。
  v1 の日別モーダル（`required_nums_controller.rb` の `update`）はその日の全パターンの行を作り直し、空欄は 0 で入れるので、手で変えた日にも 0 の行が多い
- **祝日の食い違いは表示を変えない。** v1 の祝日は `config/business_time.yml` のハードコード（2017〜2026 年）、v2 は `@holiday-jp/holiday_jp`。両者が違う日は、焼き付けの値が v2 の基本と一致しなければ上書きとして残る（= v1 と同じ数を表示）、一致すれば消える（= 同じ数を表示）ので、どちらでも表示は v1 と同じ
- **v1 で行が無い日の表示は変わる。** v1 の `Calendar#required_num` は行が無ければ 0 を出し、v2 は基本の人数に落ちる（015 の意図した変化）。移行した店舗では「デフォルト人数をセット」を押していない期間に基本の人数が出るようになる。移行の不具合ではないので §8.2-6 の比較は焼き付け済みの期間で行い、変化は 022 の告知に 1 行入れる

### 7.8 restrictions

| v1 | v2 |
| --- | --- |
| `kind` | 4 種はそのまま enum へ。それ以外の文字列は捨てて記録 |
| `days` / `pattern1_id` / `pattern2_id` | `toRestrictionColumns()`（`lib/validation/restrictions.ts`）と同じく、**種別が使わない列は null** にし、種別が使う列が無ければ捨てて記録: `deny_pattern_pair` は `pattern1_id` と `pattern2_id` の両方 / `max_work_week` は `pattern1_id` と `days` / `max_work_consecutive` は `days`（`pattern1_id` は任意。null は「勤務日」全体。v1 の `Restriction#description` と v2 の Zod が同じ） / `sat_or_sun_dayoff` は何も使わない。v1 の `belongs_to` は `optional: true` で、パターンを消した後の行が残りうる（`Pattern` の `dependent: :destroy` は後から足されたもの）。パターンが他店舗・存在しない場合も捨てる（`max_work_consecutive` は null にすれば「勤務日」全体の制約として入れられるが、v1 ではその行は何にも効いていなかったので、効く制約に変えるより捨てるほうが v1 の実態に近い）。`days` が 1..7 の外なら捨てて記録（006 §10.12: v1 の画面も 1..7） |
| 追加の 3 列 | `staff_id = null` / `hard = true` / `wdays = null`（013 §5.7） |

### 7.9 events → `date_notes`

| v1 | v2 |
| --- | --- |
| `note` | trim → 12 文字。空は捨てる（v1 は「空で保存 = 削除」だが行が残っていることがある） |
| `(tenant_id, date)` の重複 | `updated_at` が最新の 1 件（同時刻なら id が大きいほう。§7.6 と同じ） |

### 7.10 shares

| v1 | v2 |
| --- | --- |
| `code` | そのまま（`^[A-Za-z0-9]{8}$` に合わなければ捨てて記録。配った URL が壊れるので 0 件のはず）。v1 に一意制約が無い（作成時に照合するだけ）ので、重複があれば `created_at` が新しい 1 件（同時刻なら id が大きいほう）を残して捨てて記録 |
| `end_date - start_date > 31` | `end_date = start_date + 31` にして記録（v1 は 30 日に切っていたが、CHECK は 31 なので CHECK に合わせる） |
| `end_date < start_date` | 捨てて記録 |
| 期限切れの共有 | **入れる**（v1 の一覧にも「期限切れ」として出る。009） |

### 7.11 `staff_count_history`（019 §8.1）

全テーブルを入れた後、同じトランザクションで、移行した全ユーザーに 1 行ずつ `(user_id, active_count, changed_at = now())` を入れる（店舗の無い人は 0）。
`active_count` は TS が変換済みの `staffs`（`retired_at is null`）から数えた値で、`profiles.staff_cap` の計算（§7.1）と同じ数を使う。
SQL で数え直さない（2 つの数え方を持たない）。§8.1 で DB の `private.active_staff_count()` と全員分を突き合わせる。

移行時点の在籍数が「期間の開始時点の人数」になる（請求は Stripe の引き継ぎの後、最初の期間から。019 §4.2）。

## 8. 検証

### 8.1 インポートの中で（COMMIT の前）

| 確認 | 期待 |
| --- | --- |
| テーブルごとの件数 | `読んだ − 捨てた = 入れた = (終わりの count(*)) − (BEGIN 直後の count(*))`。差分で見れば seed や管理用アカウントの行を除け、数十万件の id を `IN` に並べずに済む。以下の行も同じく差分か、移行した行に限る条件で数える |
| `auth.users` と `profiles` | 件数が同じ。`profiles.email = auth.users.email` |
| 在籍数 | 全員について `staff_count_history.active_count = private.active_staff_count(user_id)`（TS の数え方と DB の数え方が一致する） |
| `encrypted_password is null` の件数 | = `password_is_email` の人と `encrypted_password = ''` だった人の和集合（Google の人はパスワードを残すので含まない。§7.1） |
| `staff_cap` を 1000 で切った人数 / 個別契約の `max_staffs_count > 1000` | 0（019 §13.7。管理画面の上限の入力は 11〜1000） |
| スタッフ 0 人（準備中）の店舗のうち勤務パターン・制約・必要人数を持つ店舗 | 報告する（初期設定でパターンを置き換えると消える。多ければ 022 の告知に入れる） |
| 上限超過の人数と一覧 | v1 の `over_limit?`（在籍 > `max_staffs_count`）の人と、個別契約でなく在籍 > 10 の人を、Subscription の有無・上限（10 以下 / 11 以上）の内訳付きで報告する。上限 10 の Subscription（約 502 件）と使っていない `unpaid`（87 件）は Stripe の引き継ぎで解約されて v2 では無料になり、v1 は解約で上限を下げるだけで在籍を減らさないので、この層にロックされる人がいる（019 §8.1・§8.2.2）。多ければカットオーバーの前に連絡 |
| `tenants` で `setup_completed_at is null` の件数 | = スタッフ 0 人の店舗の数 |
| 切り詰めた値の件数（列ごと） | 報告する。想定外に多ければ 003 §3.10 の 2 を再検討 |

どれかが合わなければ `ROLLBACK` して非 0 で終わる。

### 8.2 移行後の DB に対して（`scripts/migrate-v1/verify.ts` + 手で）

| # | 確認 | 方法 |
| --- | --- | --- |
| 1 | 件数の突合（再掲） | `verify.ts` が `manifest.json` と `report.json` と DB を比べる。基準は `report.json` に残した **BEGIN 直後のテーブルごとの `count(*)`**（seed や管理用アカウントの分）で、`現在の count − 基準 = 入れた` を見る。既知の 1 件の `shifts.date` が文字列で一致する（`pg` の型パーサの設定が効いている） |
| 2 | パスワード | リハーサルでは restore した v1 の 2 ユーザー（通常の人 1 人と、`provider = 'google_oauth2'` で `uid` のある人 1 人）に既知のパスワードを `rails runner` で入れてからエクスポートし、v2 でログインする（後者が 8 の確認を兼ねる。Google の人の実際のパスワードは本人しか知らない）。本番では自分のアカウント |
| 3 | 旧 URL | `curl -I https://<v2>/tenants/<v1 トークン>/shifts?start_date=2026-10-01` が 308 で `/tenants/<uuid>?start=…`、その uuid の店舗が開く |
| 4 | 共有 URL | 有効な `shares` を 3 件選び `/share/<code>` が v1 と同じ表を出す。期限切れは 404。v1 の共有ページはスタッフグループ順（`ordered_shift_groups`）なので、グループを使っていた店舗では行の並びが違って正しい（グループは廃止） |
| 5 | **CSV の一致** | サンプル店舗 5 件（スタッフ数の多い店・ペアのある店・退職者のいる店・半月表示の店・必要人数の上書きが多い店）で、v1 の `shifts.csv?encoding=utf8` と v2 の `/api/tenants/<id>/shifts/csv?encoding=utf8` を同じ `start` で取り `diff`。違いは 1 つずつ理由を書く（CSV は 010 で v1 と同じ形に作った）。v1 の CSV は名前を切り詰めないので、切り詰めたスタッフ名・パターン名の行は違って正しい（`report.json` の切り詰めの一覧と突き合わせる） |
| 6 | 必要人数 | 5 のサンプルで、**「デフォルト人数をセット」を押してある期間**について v1 の表の `required / assigned` と v2 の表の数字が同じ（§7.7 で消した行が表示を変えていない）。押していない期間は v1 が 0、v2 が基本の人数で、違って正しい（§7.7） |
| 7 | 準備中 | 移行した店舗を開いて `/setup` に送られない（§7.2） |
| 8 | Google の人 | `auth.identities` に `google` と `email` の 2 行があり、v1 のパスワードでログインでき、アカウント画面にパスワード欄が出る。実際の Google ログインは本番の Google の資格情報が要るので 022 で |
| 8b | 代理承認の人（`password_is_email`） | `encrypted_password` が null で、メール + パスワードのログインが「メールアドレスまたはパスワードが違います」で止まり GoTrue が落ちない。`/password/forgot` から再設定できる（`providers` に `email` があるので guard を通る） |
| 9 | 課金の列 | `profiles` の `stripe_customer_id` / `trial_end` / `max_staffs_count` / `staff_cap` を数件、v1 の値と目で比べる。`staff_count_history` が全員 1 行 |
| 10 | 制約 | 制約を持つ店舗を 2 件開き、設定画面に v1 と同じ行が出る |

## 9. リハーサル

### 9.1 手元（ローカル Supabase）

1. Heroku からダンプを取る（`heroku pg:backups:capture` → `download`）。**取った日時と件数を本プランの §15 に書く**（`shifts` の行数で所要時間を見込む）
2. 手元の v1 に restore（`pg_restore`。Heroku の Postgres と同じメジャー版を使う）→ `rails v2:export`
3. `npx supabase db reset`（seed あり）→ `npm run migrate:v1 -- --input … --allow-existing`
4. §8.2 の 1〜10（Google は 8 の範囲まで）
5. 所要時間と `import.ts` の最大メモリ（RSS）を記録する。エクスポート・インポート・検証のそれぞれ。変換は全行をメモリに載せる（重複の判定に全行が要る）ので、Node の既定のヒープで足りなければ `--max-old-space-size` を手順に書く

### 9.2 直すものが出たら

変換の純関数とテストを直して 9.1 の 3 からやり直す。**エクスポート側（Ruby）を直すのは YAML の読み方だけ**にし、判断は TS に寄せる。

### 9.3 本番の Supabase に対する予行（`--rollback`）

本番のプロジェクト（022 で作る）が出来たら、管理用アカウントだけの状態で `--rollback` を流す。

- 確かめること: Session pooler につながる / `postgres` ロールで `auth.users` に INSERT できる・トリガを止められる（クラウドの `postgres` は superuser ではない。できなければ §13-4）/ `statement_timeout` と `idle_in_transaction_session_timeout` を 0 にできる / `pg` の SSL（`sslmode=require` の解釈は版で変わる。つながらなければ Supabase の CA を渡して `verify-full`） / 所要時間（手元との差）/ §8.1 がすべて通る
- 何も残らないので、何度でも流せる。**当日の前に最低 1 回**、できれば当日の朝にもう 1 回（ネットワークと権限の最終確認）

## 10. カットオーバーでの位置（022 に渡す）

001 §5.4 と 019 §8.3 を本プランの手順で具体化したもの。時間は 9.1 / 9.3 で埋める。

| 順 | 手順 | 目安 |
| --- | --- | --- |
| 1 | Heroku `MAINTENANCE_MODE=on`。Heroku Scheduler の `stripe:create_usage_record` を止める（019 §8.2） | |
| 2 | `heroku pg:backups:capture` → download → 手元に restore → `rails v2:export` | |
| 3 | `npm run migrate:v1 -- --input … --rollback`（最終確認）→ `--rollback` 無しで本番へ。**23 時台（Vercel の cron が `staffs` を読む）を避ける** | |
| 4 | `verify.ts` + §8.2 の 2〜4・7・9 を本番で | |
| 5 | `npm run stripe:migrate-v1 -- --input <report と同じ場所>/v1-subscriptions.csv`（dry-run → `--limit 5` → 全部。019 §8.2.3）。dry-run の結果 CSV で、`skip`（Stripe で解約済み）・`review`・取得できません・Customer が一致しません のいずれかで `max_staffs_count >= 11` の人がいれば（どれも `billing_subscriptions` に写しが作られない）、Dashboard から解約した個別契約かを確かめる（§7.1 の規則では `staff_cap` が入り `max_staffs_count` は null になるので、同期の後に無料扱いでロックされうる。該当なら `profiles.max_staffs_count` を管理画面で入れる） | |
| 6 | 全員の同期（019 §8.3-4）→ Stripe の Dashboard の設定を切り替える | |
| 7 | DNS を Vercel へ | |
| 8 | 保管（**決定。2026-10-10**。§13-6）。暗号化して 1 か所に置き、ファイル名に消す日を入れ、022 のチェックリストに削除の日付を 2 つ書く: (a) **pg_dump と JSONL はカットオーバーから 3 か月**で消す（復旧の窓はシフトの 3 周期で足り、以降は v2 のほうが新しくて戻せない。パスワードのハッシュと第三者であるスタッフの名前を本番の外に置き続けない。プライバシーポリシーの「バックアップに一定期間残り、復旧にのみ使う」と揃う）。(b) **`manifest.json` / `report.json` / Stripe の引き継ぎの結果 CSV と旧料金の対象者の一覧（019 §8.1）/ ダンプから抜いた `usage_records` の CSV（user id・人数・日時だけ）は 1 年**（「スタッフが消えた」「旧料金のはず」の問い合わせと、半年後に旧料金をやめる作業 019 §8.5 に使う）。Heroku の自動バックアップはアプリの停止（001 §5.4）で消える | |

3 で失敗したら: トランザクションごと戻っているので、原因を直して 3 からやり直す。v1 は止まったままなのでデータはずれない。
直すのに時間がかかるなら Heroku のメンテナンスモードを解いて日を改める（v2 には何も入っていない）。

## 11. ファイル

```
scripts/migrate-v1/
  import.ts                      読む → 変換 → 1 トランザクションで書く → 突合 → COMMIT / ROLLBACK
  verify.ts                      移行後の DB と manifest / report の突合
  overrides.example.json         --overrides の形（§6.1。中身は空）
  v1/v2_export.rake              v1 に写して流す rake（§5）
  (scripts/stripe/migrate-v1-subscriptions.ts と src/lib/billing/migration.ts の冒頭コメント「入力の CSV は rails runner で出す」を「import.ts が書く」に直す)
  fixtures/                      手で作った小さな JSONL（§12-4。個人情報を含まない架空の値。Vitest の通しのテストも読む）
src/lib/migration/
  v1Ids.ts (+ test)              既存。V1_UUID_NAMESPACE を定数にし、getV1UuidNamespace() を消す。テストで値を固定する
  v1Types.ts                     JSONL の行の Zod
  transform.ts (+ test)          テーブルごとの変換（§7）
  truncate.ts (+ test)           文字数の切り詰め
  requiredNums.ts (+ test)       焼き付けられた行の判定（§7.7）
package.json                     "migrate:v1" / "migrate:v1:verify"（tsx --conditions=react-server）、pg / @types/pg
src/lib/tenants/legacyUrl.ts     resolveLegacyTenantUrl() から名前空間の取得と未設定の警告を消す（常に解決する）
.env.example / README.md         V1_UUID_NAMESPACE の項目を消し、MIGRATION_DATABASE_URL をコメントで書く（.env.local には書かない）
.gitignore                       v1-export/
AGENTS.md                        scripts/migrate-v1 と lib/migration の説明。「uuid の扱い」の V1_UUID_NAMESPACE を定数に読み替える
docs/plans/001-…/README.md       §5 の冒頭に「021 で上書き」の注記
docs/plans/019-…/README.md       §8.1 の「session_replication_role = replica」に「021 §3-2 で上書き」の注記
```

## 12. 実装の順序と確認

1. `uuidgen` で v4 を 1 つ作り、`v1Ids.ts` の定数 `V1_UUID_NAMESPACE` にする（コメント: 秘密ではないが絶対に変えない。変えると移行した全行の id と旧 URL がずれる）。
   テストで値を固定し、`getV1UuidNamespace()` と `legacyUrl.ts` の警告、`.env.example` / README の項目を消す。**この時点で 1 回コミットし、以降は値に触らない**
2. `v1Types.ts` と `v2_export.rake` を先に書き、**形を 1 つに決める**（JSONL の 1 行 = Zod の 1 型）
3. `truncate.ts` / `requiredNums.ts` / `transform.ts` と Vitest（§7 の各行に 1 ケース以上。重複・他店舗・自己参照・空文字・範囲外）
4. `import.ts`。`scripts/migrate-v1/fixtures/` に手で作った小さな JSONL（2 ユーザー・2 店舗・Google の人・代理承認の人・捨てる行・切り詰める値・焼き付けと上書きの必要人数を含む）を置き、変換の通し（JSONL → v2 の行 + report）を Vitest で固定してから、手元の seed だけの DB に入れて通す
5. `verify.ts`
6. 9.1 のリハーサル（本物のダンプ）。件数と所要時間を §15 に記録
7. AGENTS.md・001 の注記・`.env.example`
8. PR の前に `npm run lint` / `typecheck` / `test`。`npx supabase test db` はスキーマを触らないので変化なし

## 13. 決定と未確定

| # | 論点 | 状態 |
| --- | --- | --- |
| 1 | 未確認ユーザー（`confirmed_at IS NULL`、招待は承認済み）の扱い | **決定（2026-10-10）**: v1 でログインできた人（`confirmed_at IS NOT NULL OR sign_in_count > 0`）だけを確認済みで入れ、それ以外は入れない。未確認の行は作らない（§7.1）。devise_invitable は招待の承認で `confirmed_at` を埋め、Devise の confirmable は未確認のログインを拒むので、該当は僅少のはず。§5.2-5 の内訳と「移行しないのに店舗を持つ人」が 0 件であることをリハーサルで確かめる |
| 2 | `V1_UUID_NAMESPACE` の管理場所と値 | **決定（2026-10-10）**: 環境変数をやめ、`lib/migration/v1Ids.ts` の定数にする。値は `uuidgen` のランダムな v4（意味のある値にしない。理由は §3-6）。実装の最初に作ってコミットし、テストで固定する |
| 3 | `staffs.available_wdays` が nil のときの読み替え | **決定（2026-10-10）**: `[]`（全日「担当不可」）。v1 の `Staff` は `serialize ..., Array` で NULL を `[]` と読み、判定はすべてモデル経由なので、v1 の見え方と同じ。`available_patterns` → `[]`、`default_patterns` → `{}` も同じ理由（§5.1） |
| 4 | 本番の `postgres` ロールで `auth.users` への INSERT と `disable trigger` ができるか | **9.3 で確かめる**。できなければ: INSERT は `supabase_auth_admin` 相当の権限を一時的に付ける / トリガは止めずに `staff_count_history` を最後に `delete` して入れ直す |
| 5 | 1 トランザクション（§3-1）・トリガの止め方（§3-2）・`is_admin` を立てない（§3-3）・必要人数の間引き（§3-4） | **本プランで決定**（理由は §3）。異論があればここで |
| 6 | ダンプ・エクスポート・レポートの保管期間 | **決定（2026-10-10）**: pg_dump と JSONL は 3 か月、manifest / report / Stripe の結果 CSV / `usage_records` の CSV は 1 年（§10-8）。当初の案（全部 1 年）は、フルのダンプの価値が数週間で尽きる一方で負債が 1 年残るのでやめた |
| 7 | リハーサルのダンプをいつ取るか | **未確定**。実装の 6（§12）の前。古いダンプでよい |
| 8 | 書き込みが遅い・メモリが足りないときの対処 | 9.1 の所要時間と RSS で判断。目安: インポート全体が 10 分を超えるなら `COPY` に切り替える。ヒープが足りなければ `--max-old-space-size` |

## 14. プランのレビュー（指摘が出なくなるまで）

### 1 回目（2026-10-10。v1 のコード `tabbyz/assift-v1` を取り込み、前提にしていた挙動を実物で確かめた）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | `users.unconfirmed_email` は v1 に存在しない（`reconfirmable = false`） | §5.1・§7.1 から消した |
| 2 | v1 の管理画面の「代理承認」は初期パスワードをメールにし、`/tenants` で強制的に変えさせていた（`check_init_password!`）。v2 にその仕組みは無く、そのまま移すとメールを知る人が誰でも入れる | エクスポートで `valid_password?(email)` を判定して `password_is_email` を出し、該当者は `encrypted_password = null`（再設定してもらう）。件数を manifest と §8.1 に（§5.1・§5.2・§7.1） |
| 3 | パスワードのハッシュが GoTrue で検証できる前提を確かめていなかった（pepper があれば全滅） | `devise.rb` に pepper なし・stretches 11、bcrypt 3.1.20 を確認。§7.1 に書いた。実ログインの確認は残す |
| 4 | `patterns.default_required_nums` の二重エンコードは「疑い」のままだった | json 列 + `serialize Hash` を `pattern.rb` で確認（事実）。モデル経由で Hash に戻る。値に文字列が混じる（`to_i` していない）ことも書いた（§5.1） |
| 5 | `required_nums` の重複を「最新のみ」としていたが、v1 に `unique (date, pattern_id)` がある | 重複の記述を消した（§7.7）。`shifts` は non-unique なので据え置き |
| 6 | 制約の「使う列が無い行」の判定が種別ごとに書かれていなかった。v1 の `belongs_to` は `optional: true` でパターンの無い行が残りうる | 種別ごとの必須列を明記（§7.8）。`max_work_consecutive` の `pattern1_id` は任意（v1・v2 とも「勤務日」全体） |
| 7 | 祝日の判定が v1（`business_time.yml` のハードコード）と v2（holiday_jp）で違いうることを見ていなかった | 違っても表示は変わらないことを示した（§7.7）。また v1 で行が無い日は 0、v2 は基本の人数に落ちる（015 の意図）ので、§8.2-6 の比較を焼き付け済みの期間に限り、022 の告知に申し送り |
| 8 | `profiles` の UPDATE を staffs より前に置いていたが、`staff_cap` に在籍数が要る。§7.11 は SQL で数え直していて、数え方が 2 つあった | staffs の後に移し、在籍数は TS の 1 か所で数えて `staff_cap` と履歴の両方に使う。DB の `private.active_staff_count()` との突合を §8.1 に（§6.1・§7.11） |
| 9 | `profiles.stripe_customer_id` は v2 で `unique` だが、v1 に制約が無い | 同じ Customer を持つ人が複数いれば古い 1 人に残して他は null にして記録（§7.1・§5.2） |
| 10 | `dayoff` のパターンの `default_required_nums` をそのまま入れていた。v2 は休みに変えたら空にする（015 §3.4） | `{}` にする（§7.4） |
| 11 | Google の人の `encrypted_password` を null にすると、v1 で後からパスワードを再設定した人が困る可能性 | （当時）受け入れると明記した → **3 回目の #1 で覆した**（v1 は Google ログインが壊れていて、全員パスワードで入っている） |
| 12 | manifest の集計に 2・9 の件数が無かった | §5.2 に足した |

### 2 回目（2026-10-10。1 回目の反映後に頭から読み直し、v2 側の前提をコードと突き合わせた）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | §8.2-5 の CSV の `diff` は、v1 の CSV が名前を切り詰めない（`index.csv.ruby` は `staff.name` をそのまま出す）ので、切り詰めた行で必ず違う | 違って正しいと書き、`report.json` の切り詰めの一覧と突き合わせる（§8.2-5・§1） |
| 2 | `shifts.pattern_id` が null・存在しない行の扱いが無かった | 捨てて記録（§7.6。v1 に FK があるので 0 件のはず） |
| 3 | §7.7 の判定に使う `default_required_nums` が、v1 の文字列のままか数値化後かが曖昧 | §7.4 で数値化した後の値と明記 |
| 4 | §8.1 の `encrypted_password is null` の件数が、Google と代理承認の両方に当たる人を二重に数える | 和集合と明記（3 回目の #1 で Google の人はパスワードを残すことになり、内訳を `password_is_email` と `''` に直した） |
| 5 | `provider = 'google_oauth2'` で `uid` が空の行の扱いが無かった | identity を作らず記録。GoTrue の自動リンクに任せる（§7.1） |
| 6 | 「Subscription なし = 個別契約の候補」の根拠（v1 が `stripe_subscription_id` を消さないこと）を確かめていなかった | `user.rb` / `charges_controller.rb` で、解約は上限を 10 に下げるだけで id は消さないことを確認。§7.1 に書いた |
| 7 | `password_is_email` の bcrypt の検証の所要時間に触れていなかった | 1 回 ≈ 0.2 秒、全員で数分と書いた（§5.1） |
| 8 | 手で作る JSONL の置き場と、変換の通しのテストが無かった | `scripts/migrate-v1/fixtures/` と Vitest の通し（§11・§12-4） |
| 9 | §9.1・§12・§13-7 の節番号の参照が、§14 を足したときにずれていた（§14 → §15、実装の 5 → 6） | 直した |
| 10 | `pg_restore` の版を書いていなかった | Heroku と同じメジャー版（§9.1） |

### 3 回目（2026-10-10。別のレビュー担当（サブエージェント）に実物と突き合わせて批判的に読ませ、指摘を自分で確かめてから反映した）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | **v1 は Google ログインが壊れていた**（ログイン画面に取り消し線と注意書き。v1 分析 §2.2 にも「壊れている」）。provider のある人は「パスワードを忘れた方」で作ったパスワードで入っているので、`encrypted_password = null` は初日から締め出す | 残す。identity は `google` と `email` の両方、`providers = ["google","email"]`（§7.1）。1 回目の #11 を覆した。最近ログインしている人数を manifest に（§5.2-11） |
| 2 | `required_nums.date` は nullable、`num` は負も入る（controller が検査しない）。v2 は `not null` / `num >= 0` で INSERT が落ちる | 捨てて記録（§7.7・§5.2-10） |
| 3 | 親を指す列が v1 ではほぼすべて nullable で、NULL のときの規則が無かった | 共通に `parent_missing` を足し、Zod は `nullable()`（§7） |
| 4 | §8.1 の「無料扱いで 11 人以上」の定義が、Stripe の引き継ぎで解約されて無料になる約 590 件を数えていなかった。v1 は解約で上限を下げるだけで在籍を減らさない | v1 の `over_limit?` と「個別契約でなく在籍 > 10」を内訳付きで報告（§8.1） |
| 5 | `v1-subscriptions.csv` が移行しない人の Subscription も含み、v2 にアカウントが無いのに schedule が付いて課金が続く | 移行する人に絞り、残りは別 CSV に出して Dashboard で解約（§5.1・§8.1） |
| 6 | ペアの後追い UPDATE と `profiles` の UPDATE で `set_updated_at` トリガが `updated_at` を `now()` に上書きし、`profiles.created_at`（管理画面の「登録日」）も `now()` のまま | 2 つの `*_set_updated_at` も止め、`profiles` の UPDATE で `created_at` / `updated_at` を v1 の値にする（§3-2・§6.1・§7 共通・§7.1） |
| 7 | `shares.code` は v1 に一意制約が無い | 重複は新しい 1 件を残して捨てて記録（§7.10・§5.2-10） |
| 8 | `available_patterns` の重複を除いていなかった（`staff_patterns` の PK で落ちる） | 重複除去を足した（§7.3） |
| 9 | 準備中（スタッフ 0）の店舗に勤務・制約・必要人数があると、初期設定でパターンを置き換えた時点で消える（014 §5.10 の決定どおりだが書いていなかった） | 件数を報告し、多ければ 022 の告知へ（§8.1・§5.2-12） |
| 10 | `pg` は `date` を JS の `Date` で返し、実行環境の TZ で 1 日ずれうる | 型パーサで文字列のまま受ける。検証に 1 件の文字列一致を足した（§6.1・§8.2-1） |
| 11 | §8.1 の「移行対象の id に絞って count」は `shifts` の数十万件では現実的でなく、seed の行も混じる | BEGIN 直後との差分で数える（§8.1） |
| 12 | `encrypted_password = ''` の人の規則が無かった | null にして記録（§7.1） |
| 13 | `auth.identities` の `id` / `created_at` 等を書いていなかった | 明示する（§7.1） |
| 14 | `max_work_consecutive` の壊れた `pattern1_id` は null にして残せる | 捨てるまま。v1 ではその行は効いていなかったので、効く制約に変えない理由を書いた（§7.8） |
| 15 | 共有ページの並びは v1 がスタッフグループ順 | 違って正しいと書いた（§8.2-4） |
| 16 | 個別契約の `max_staffs_count > 1000` は管理画面で触れない | §8.1 に件数を足した |
| 17 | 「5 点」が 6 行 / `updated_at` の矛盾 / 「空の DB」と「管理用アカウントだけ」 | 直した（§3・§7・§1） |
| A | `stripe_customer_id` の重複で「古い人に残す」は、Subscription の持ち主と食い違いうる | `stripe_subscription_id` を持つ人を優先し、0 件でなければ Dashboard で確かめる（§7.1） |
| B | Session pooler の `statement_timeout` / `idle_in_transaction_session_timeout` と、`disable trigger` のロックが Vercel の cron（23:20 / 23:50 JST）と待ち合う | セッション冒頭で 0 に。23 時台を避ける（§6.1・§9.3・§10） |
| C | `check_init_password!` は `tenants#new` だけで走る。既に店舗を持つ人は初期パスワードのまま使えていたので、該当は想定より多いかもしれない | §7.1 の記述を直し、件数を見て 022 の案内の分量を決める |

### 4 回目（2026-10-10。別のレビュー担当に、3 回目で新しく入った記述を中心に実物と突き合わせて読ませた）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | §8.2-8 と「`uid` が空」の行が、3 回目 #1（Google の人はパスワードを残す）と矛盾したまま。`providers` に `email` があるとアカウント画面のパスワード欄（`account/page.tsx`）と再設定の guard（`requireEmailProviderAccount()`）が通る | `uid` が空は「それ以外」と同じ扱いに。§8.2-8 を Google の人（パスワードで入れる・欄が出る）と代理承認の人（null で止まる・再設定できる）に分けた。`providers` の意味を §7.1 に書いた |
| 2 | `password_is_email` と Google が同じ人に当たるときの優先順位が無かった | `password_is_email` を最優先で null（§7.1） |
| 3 | `v1-subscriptions.csv` を rake で出すと、「移行する人」の判定が Ruby と TS の 2 か所になる（§4・§9.2 に反する） | CSV は `import.ts` が書く。`last_edited_at` も `shifts.jsonl` から TS で出す。§5.2-5 の一覧も report へ。§8.1 の行数の突合は不要になった（§4・§5.1・§6.1・§10-5） |
| 4 | `usage_records` の CSV（§2・§10-8）を作る手順が無かった | rake の出力に `usage_records.csv` を足した（§5.1） |
| 5 | 手で決める 2 か所（Customer の持ち主・店舗を持つ移行対象外の人）の結果をスクリプトに渡す口が無く、再現できない | `--overrides <json>` を足し、適用した上書きを report に残す（§6.1・§11） |
| 6 | §7.1 の「§9.2」の参照がずれていた | §8.2-2・§9.1-4 に直した |
| 7 | 019 §8.1 の `session_replication_role` の記述に注記しないままだった | §11 に足した |
| 8 | `color_hex` の「直せるなら直す」と、events / shares の重複のタイブレークがスクリプトに書ける規則になっていなかった | 規則にした（§7.4・§7.9・§7.10） |
| A | Stripe で解約済み（`skip`）なのに `max_staffs_count >= 11` の人は、§7.1 の規則で `max_staffs_count` が null になり、同期の後に無料扱いでロックされうる | 引き継ぎの dry-run の結果 CSV で `skip` × 11 人以上を確かめ、個別契約なら管理画面で入れる（§10-5） |
| B | `pg` の `sslmode=require` の解釈が版で変わる | 本番の予行でつながらなければ CA を渡して `verify-full`（§9.3） |

### 5 回目（2026-10-10。別のレビュー担当に収束判定を兼ねて読ませた。4 回目の変更が届いていない箇所と参照のずれが中心）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | §2 の「Stripe 用の CSV」が rake の出力のまま（4 回目 #3 で `import.ts` に移した） | `usage_records.csv` に書き換え、Stripe 用はインポート行へ（§2） |
| 2 | §7.1 の保険行と §5.2-13 に、Ruby 側の「移行する人」の判定が残っていた | 保険は `import.ts` が report に出し、入れるなら `--overrides` で。§5.2-13 は生の内訳に（§7.1・§5.2） |
| 3 | `verify.ts` は BEGIN 直後の件数を知れないので、seed や管理用アカウントの分で突合が合わない | `report.json` に BEGIN 直後の `count(*)` を残し、それを基準にする（§6.1・§8.2-1） |
| 4 | 参照のずれ: 「015 §7」は 015 §9.2、「v1 分析 §1」は §2.2 | 直した（レビュー担当の「015 §5.5」も違っていて、実物は §9.2） |
| 5 | `disable trigger` のロックは ACCESS EXCLUSIVE ではなく SHARE ROW EXCLUSIVE。待つのは読み取りではなく書き込み（同期・Webhook） | 書き換えた。23 時台を避ける結論は残す（§6.1） |
| 6 | Google の人のパスワードでのログイン（§8.2-8）は、既知のパスワードを入れないと手元で確かめられない | §8.2-2 のテスト用のユーザーを 2 人（通常 + Google）に |
| 7 | §10-5 の確認が `skip` だけで、`review` / 取得失敗 / Customer 不一致 も写しが作られず同じ状態になる | 広げた（§10-5） |
| 8 | v1 の nullable な列（`position` / `color_hex` / `note` …）を Zod が non-null で受けると最初の行で止まる。`position` null の並び、`stripe_*` の空文字も未定 | §7 共通に 1 行足した |
| 9 | `migrate-v1-subscriptions.ts` と `lib/billing/migration.ts` の冒頭コメントが「`rails runner` で出す」のまま | §11 に直す対象として足した |
| A | `required_nums.num` が `smallint` の上限を超える行 | 捨てて記録。manifest に件数（§7.7・§5.2-10） |
| B | `import.ts` のメモリ（全行をヒープに載せる） | §9.1-5 で RSS を記録し、§13-8 に `--max-old-space-size` を足した |

## 15. 実装ログ

（未着手）

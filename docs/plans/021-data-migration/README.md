# 021: v1 データ移行（エクスポート・インポート・検証・リハーサル）

- 前提: `docs/v1-analysis.md`（§2 データモデル・§7.2 移行で必ず確認すること）/ 001 §3.1（対応表・uuid v5）・§5（移行の方針）/
  003 §3.10（文字数の切り詰め）/ 005（`lib/migration/v1Ids.ts`・旧 URL）/ 013 §5.7（制約の 3 列）/ 014 §5.10（`setup_completed_at`）/
  015 §5.5（必要人数の上書きだけを残す）/ 019 §8.1・§13.7（`profiles` の課金の列・`staff_count_history`）/ 020 §5.1（`is_admin`）
- v1 のコード: `db/schema.rb`、`app/models/{user,tenant,staff,pattern,shift,required_num,restriction,event,share}.rb`、`config/application.rb`（YAML の許可クラス）

> 番号: 013 / 014 の冒頭注記では移行を 015 / 016 に繰り下げていたが、015〜020 が別の用途に使われたので本プランを **021** とし、
> カットオーバー（本番の構築・DNS・告知・当日の手順）は **022** にする。本プランはカットオーバーのうち「データを v2 に入れて確かめる」部分だけを扱う。

**状態: 実装済み（§12 の 1〜5・7・8。2026-10-11）。本物のダンプでのリハーサルは restore とエクスポート（§9.1-1〜2。2026-10-13）まで済み。インポート以降（§12-6・§9.1-3〜5）と本番の予行（§9.3）は未実施。** 2026-10-10 に作成し、§13 の #1・2・3・6 を決め、レビューを 6 回行った。2026-10-11 に §3 の 6 点（#5）と変換を TS で書くこと（#9）を決め、全体をもう一度レビューした（7 回目。§14）うえで実装した（§15）。2026-10-13 にリハーサルのダンプを取った（#7。§15）。残りはリハーサルで確かめること（#4・#8）。

---

## 1. 目的と完了条件

### 目的

v1（Rails / Heroku Postgres）の全データを v2（Supabase）に移し、**利用者が v1 と同じメール・パスワードでログインすると、同じ店舗・同じシフト表・同じ共有 URL が開く**状態を作る。
移行は 1 回きりだが、カットオーバーの当日に初めて流すのではなく、**本番と同じ手順をリハーサルで何度も通して**、当日は手順をなぞるだけにする。

### 完了条件

- [ ] v1 の本番ダンプから `v1-export/<日時>/` の JSONL 一式が出る（Ruby 側で YAML を復元済み）。rake は書いた（構文チェックのみ。本物の v1 で未実行。§15）
- [x] `npm run migrate:v1 -- --input <dir>` が、`tenants` が 0 件の v2 DB（本番は管理用アカウントだけ）に対して **1 トランザクション**で全テーブルを入れ、件数の突合（v1 の件数 − 捨てた件数 = v2 の件数）を自分で確かめて通る（fixtures で確認。§15）
- [x] 捨てた行・切り詰めた値・直した値が、理由つきでレポート（JSON）に残る
- [ ] ローカルのリハーサルで: v1 と同じパスワードでログインできる / v1 の店舗 URL（22 文字トークン）が 308 で移行後の店舗に着く / `/share/<code>` が開く /
      サンプル店舗の CSV が v1 と一致する（切り詰めた名前を除く）/ 移行後の店舗が「準備中」にならない / 必要人数の表示が焼き付け済みの期間で v1 と同じ
      （fixtures ではログイン・308・共有の読み取り・準備中を確認。本物のダンプでの CSV の `diff` と必要人数の比較は §12-6 で）
- [ ] 本番の Supabase に対して `--rollback`（全部入れて最後に ROLLBACK）で通り、所要時間が分かっている
- [x] 019 §8.2 の Stripe の引き継ぎスクリプトの入力（`v1-subscriptions.csv`）が、インポートと同じ判定（移行する人）で出る

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
| 1 | `INSERT ... ON CONFLICT (id) DO UPDATE` で再実行を冪等にする（001 §5.1） | **1 トランザクションで入れ、失敗したら全部戻す。`ON CONFLICT` は書かない**（**決定。2026-10-11**） | 空の DB に 1 回入れるだけなので「途中から再開」は要らない。upsert にすると、親を更新して子が残る・捨てるべき行が前回の残骸として残る、といった半端な状態を自分で考えることになる。重複は PK で**うるさく失敗**させたほうが安全。副産物として `--rollback` で本番の予行ができる（§9.3） |
| 2 | インポートの間は `session_replication_role = replica` でトリガを止める（019 §8.1） | **止めるのは 3 つだけ**（**決定。2026-10-11**）: `staffs_record_staff_count`（履歴）と、`patterns_set_updated_at` / `profiles_set_updated_at`（ペアの後追い UPDATE と `profiles` の UPDATE で v1 の `updated_at` が `now()` に上書きされないように）。`alter table … disable trigger …` をトランザクションの中で流し、終わりに enable | `replica` は FK の整合性トリガ（RI）も止める。壊れた参照（v1 には FK が無い列が多い）を DB が見逃すのは移行でいちばん避けたいこと。止めたいのは、在籍数の履歴がスタッフ 1 行ごとに増えること（履歴のトリガ）と、ペアの後追い UPDATE と `profiles` の UPDATE で `updated_at` / `created_at` が `now()` になること（2 つの `set_updated_at`）だけ。上限の門番は `auth.uid()` が null なら通す（019 §5.3）ので止めない |
| 3 | `@assift.com` のユーザーに `is_admin = true`（001 §4.3） | **立てない**（**決定。2026-10-11**） | 020 §5.1 で「`is_admin` は管理専用のアカウントにだけ立て、本体にはログインしない」と決めた。運営者の v1 アカウント（店舗を持ち本体で使う）に立てると、本体で盗まれたセッションで管理画面に入れる。管理用のアカウントはカットオーバーで別に作る（022） |
| 4 | `required_nums` は `tenant_id` を補完してそのまま（001 §5.2） | **焼き付けられた行を捨て、上書きだけ残す**（015 と同じ規則。祝日はアプリで判定。**決定。2026-10-11**） | 015 で `required_nums` の意味が「この日だけの上書き」に変わった。v1 の「デフォルト人数をセット」で期間ぶん焼き付いた行をそのまま入れると、基本の人数を直しても既存の期間に届かない（015 が直したこと）が v1 の店舗だけに残る。詳細は §7.7 |
| 5 | `shifts.assist_token` は廃止（001 §3.1） | 同じ。加えて v2 の `shifts.assist_run_id` は null（**決定。2026-10-11**） | v1 の自動アサインの履歴は再現しない（012） |
| 6 | 名前空間は環境変数 `V1_UUID_NAMESPACE`（001 §3.1・005 §3.1） | **リポジトリの定数にする**（`lib/migration/v1Ids.ts` の `V1_UUID_NAMESPACE`。値は `uuidgen` で作った v4）。`v1Uuid(table, id)` は内部でこの定数を使い、名前空間を引数で受けない。環境変数の読み取り・未設定時の警告・`.env.example` の項目は消す（**決定。2026-10-10**） | 下の箇条書き |

§3-6 の理由:

- 秘密ではない。名前空間が分かっても RLS は破れず、店舗の uuid は旧 URL の 308 で誰にでも見える
- 一方で Vercel の Production・インポート・リハーサル・プレビューの 4 か所で同じ値でなければならず、一度決めたら変えられない。「複数の場所で同一で、永久に変えない値」は設定ではなく定数。定数にすればアプリとインポートが同じ import を読むので構造的にずれず、設定漏れも無くなる
- `v1Uuid()` が名前空間を引数で受けると、別の値を渡せる口が残る。定数を内部で使う形にして口を閉じる（テスト用に名前空間を渡す関数は別名で残す）
- 値を意味のある形（ゾロ目など）にはしない。推測できる名前空間と v1 の連番 id を合わせると全行の id を外から計算できる。いまは id の秘匿に頼っていないが、ランダムにしておけば将来もその前提を保てる。「定数である」ことは値の見た目ではなく、名前・コメント（秘密ではないが絶対に変えない）・値を固定するテストで示す

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
| `users.jsonl` | `users` | `id email encrypted_password password_is_email confirmed_at invitation_accepted_at invitation_token provider uid sign_in_count current_sign_in_at locked_at stripe_customer_id stripe_subscription_id trial_end max_staffs_count created_at updated_at`。`password_is_email` はパスワードがメールのままか（v1 の管理画面の「代理承認」が初期パスワードをメールにした人と、自分でメールにした人。§7.1）。照合するのは **v1 でログインできた人（`confirmed_at` か `sign_in_count > 0`）のうち店舗を持たない人だけ**で、それ以外は照合せず false（店舗を持つ人は `check_init_password!` が変えさせていた。移さない人の値は使わない）。bcrypt の検証は 1 回 ≈ 0.1 秒で、全員を照合すると 84,226 人で 2 時間 41 分かかった（§15。当初の「数分」は人数の見込み違い）。絞ると約 3,500 人で 6〜7 分 |
| `tenants.jsonl` | `tenants` | `id uuid user_id name shift_cycle start_of_week created_at updated_at` |
| `staffs.jsonl` | `staffs` | `id tenant_id name position disabled max_work_week available_wdays(配列) available_patterns(配列) default_patterns(Hash) created_at updated_at` |
| `patterns.jsonl` | `patterns` | `id tenant_id name description color_hex kind pair_pattern_id position default_required_nums(Hash) created_at updated_at` |
| `shifts.jsonl` | `shifts` | `id date pattern_id staff_id fixed created_at updated_at` |
| `required_nums.jsonl` | `required_nums` | `id date pattern_id num` |
| `restrictions.jsonl` | `restrictions` | `id tenant_id kind days pattern1_id pattern2_id position created_at updated_at` |
| `events.jsonl` | `events` | `id tenant_id date note created_at updated_at` |
| `shares.jsonl` | `shares` | `id tenant_id code start_date end_date created_at` |
| `manifest.json` | — | 各テーブルの行数・rake の開始時刻（`exported_at`）・ダンプの取得時刻（`dumped_at`。rake の 2 つ目の引数で渡す。`heroku pg:backups:info` の Started）・v1 の最終コミット・`Rails.env`・YAML 列の形の集計（§5.2） |
| `usage_records.csv` | `usage_records` | `user_id, staffs_count, created_at`（名前を含まない。1 年残す記録。§10-8） |

Stripe の引き継ぎスクリプトの入力 `v1-subscriptions.csv` は rake では出さない。`import.ts` が書く（§6.1 の「Stripe 用の CSV」）。

- `shift_cycle` / `kind` は **enum の名前**（`month` / `workday`）で書く（整数を v2 で読み替えない）
- YAML 列は `staff.available_wdays`（配列）・`staff.available_patterns`（配列）・`staff.default_patterns`（Hash）・`pattern.default_required_nums`（Hash）を**モデルの属性として読んだ値**をそのまま書く。
  `default_required_nums` は **json 列に `serialize :default_required_nums, Hash`**（`app/models/pattern.rb`）なので、DB には YAML の文字列が JSON の文字列として入っている（二重エンコード。v1 分析 §2.2 の疑いは事実）。モデルの属性として読めば Hash に戻る。値は `to_i` されていないので `"2"` のような文字列が混じる（v2 の `parseRequiredNums()` が数値に寄せる）。念のため、読んだ値が `String` なら `YAML.safe_load(..., permitted_classes: [ActiveSupport::HashWithIndifferentAccess, Symbol])` でもう一段ほどき、`manifest.json` に「文字列だった件数」を出す
- YAML 列が NULL のスタッフは、**モデルを通して読んだ値をそのまま書く** = `available_wdays` / `available_patterns` は `[]`、`default_patterns` は `{}`（**決定。2026-10-10**。§13-3）。
  v1 は `serialize :available_wdays, Array` で、Rails は NULL を `[]` として読む。画面の「担当可 / 不可」（`Staff#available_wday?`）・ポップオーバーの絞り込み・自動アサインはすべてモデル経由なので、v1 でも NULL と `[]` は区別されていない（= 全日「担当不可」）。rake に特別な読み替えは書かない。NULL の件数だけ manifest に出す（`available_wdays` / `available_patterns` は 2018-01 に足されたので 0 件のはず。`default_patterns` は 2019-11 なので NULL がありうる。§5.2-2）
- `find_each`（1000 件ずつ）で書く。`shifts` は約 1,279 万行（2026-10-13 の件数。§15）
- 個人情報を含むので、出力先はリポジトリの外（`~/v1-export/`）。`.gitignore` に `v1-export/` を足しておく

### 5.2 manifest に出す集計（v1 分析 §7.2 の「必ず確認すること」）

| # | 集計 | 使い道 |
| --- | --- | --- |
| 1 | `patterns.default_required_nums` の型の内訳（Hash / String / nil）と、値に文字列を含む件数 | §5.1 のほどき方の確認 |
| 2 | `staffs` の YAML 列が NULL の件数（列ごと） | §5.1。`available_wdays` / `available_patterns` は 0 件のはず（2018-01 に追加）。`default_patterns` は **2019-11-16 に追加**（`20191116120346_add_default_patterns_to_staffs.rb`）で、それ以前に作られて以降保存されていないスタッフは NULL のまま。どちらも v1 の見え方と同じ（`[]` / `{}`）で入る |
| 3 | `shifts` の `(staff_id, date)` 重複の組数・`staff_id IS NULL` の件数 | §7.6 で捨てる件数の見込み |
| 4 | `patterns.pair_pattern_id` が自分自身・他店舗・存在しない id を指す件数 | §7.4 |
| 5 | `users` の未確認（`confirmed_at IS NULL`）の内訳: 招待未承認 / 承認済みだが未確認 / ログイン実績あり | §7.1 の規則の確認（移行しないのに店舗を持つ人の一覧は `report.json` に出る。0 件のはず） |
| 6 | `provider = 'google_oauth2'` の件数 | §7.1 |
| 7 | 文字数超過の件数（店舗名 20 / スタッフ名 10 / パターン名 6 / 説明 10 / メモ 12） | 003 §3.10。想定外に多ければ CHECK の緩和を再検討。目安の数で、TS の切り詰めの件数（`report.truncated`）とは厳密には一致しない（SQL の `trim()` は ASCII の空白だけ、JS の `.trim()` は全角空白なども落とす） |
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
| 接続 | `pg`（新しい devDependency）。`MIGRATION_DATABASE_URL`（ローカルは `postgresql://postgres:postgres@127.0.0.1:54322/postgres`、本番は Session pooler の URL + **`sslmode=verify-full`**。`pg` 8.x は `require` を `verify-full` の別名として扱い毎回 SECURITY WARNING を出し、9 で libpq の意味（検証なし）に変わるので、明示する。pooler の証明書が Node の信頼ストアに無ければ `sslrootcert=<Supabase の CA>` を足す）。`.env.local` には書かず、実行する shell で渡す |
| 名前空間 | `V1_UUID_NAMESPACE`（`lib/migration/v1Ids.ts` の定数。§3-6）。アプリの旧 URL 解決と同じ import を読むので、環境ごとの設定も突き合わせも要らない |
| 実行の単位 | `BEGIN` → 全テーブル → 件数の突合（§8.1）→ `COMMIT`（`--rollback` なら `ROLLBACK`）。途中の例外は `ROLLBACK` して非 0 で終わる |
| 順序 | `auth.users` → `auth.identities` → `tenants` → `patterns`（`pair_pattern_id` は後から UPDATE）→ `staffs` → `profiles`（UPDATE）→ `staff_patterns` → `staff_default_patterns` → `shifts` → `required_nums` → `restrictions` → `date_notes` → `shares` → `staff_count_history`。在籍数（`staff_cap` と `staff_count_history`）は TS が変換済みの `staffs` から数えるので、順序に制約は無い。両方に同じ値を使い、§8.1 で DB の `private.active_staff_count()` と突き合わせる |
| 書き込み | 1000 行ずつの複数行 `INSERT`（`pg` のパラメータ上限 65535 に収まる列数にする）。リハーサルで遅ければ `COPY FROM STDIN`（`pg-copy-streams`）に替える。**最後に `ANALYZE`** |
| セッション | 冒頭で `set statement_timeout = 0` / `set idle_in_transaction_session_timeout = 0`（Supabase の既定で切られないように。自セッションなら superuser でなくても変えられる）。`pg` の型パーサは `date`（OID 1082）と `timestamptz`（1184）を**文字列のまま**受ける（`types.setTypeParser`。既定は JS の `Date` にして実行環境の TZ で 1 日ずれる）。`verify.ts` も同じ |
| トリガ | 冒頭で `staffs_record_staff_count` / `patterns_set_updated_at` / `profiles_set_updated_at` を `disable trigger`、末尾で `enable`（§3-2）。`on_auth_user_created` は**止めない**（`profiles` を作らせる。`handle_new_user` は `on conflict do nothing`）。`alter table … disable trigger` は SHARE ROW EXCLUSIVE ロックをトランザクションの間ずっと持つ。読み取りは通るが、その表への書き込み（Webhook や cron の同期による `profiles` の UPDATE）はコミットまで待つ。保守的に **Vercel の cron（23:20 / 23:50 JST）と重ねない**（§10） |
| 既存データ | 起動時に `auth.users` と `public.tenants` の件数を表示し、`tenants` が 0 件でなければ `--allow-existing` が無い限り止まる（本番は管理用アカウント 1 件だけの状態で流す。ローカルは seed が入っているので `--allow-existing`） |
| 上書き | `--overrides <json>`: 規則の外で手で決めたことをスクリプトに渡す口。`customerOwner`（`stripe_customer_id` を複数人が持つ組の持ち主。§7.1）と `forceMigrateUsers`（移行しない判定だが店舗を持つ人を確認済みで入れる。§7.1）。適用した上書きは `report.json` に残す。想定は空のファイルで、空でも手順は同じ（決めた結果を次の実行で再現できる） |
| レポート | `report.json`（`--input` と同じ場所）: テーブルごとの `BEGIN 直後の count(*) / 読んだ / 入れた / 捨てた（理由別）/ 直した（理由別）`、捨てた行の id と理由、切り詰めた行の id と前後の文字数（**値そのものは書かない**。名前・メモは 3 か月で消える JSONL から id で引ける。§10-8）、移行しないのに店舗を持つ人、適用した上書き。同じ場所に `v1-subscriptions.csv` と `v1-subscriptions-not-migrated.csv`（§5.1）。`--rollback` でも書く。メールと id を含むのでエクスポートと同じ場所に置き、暗号化して 1 年で消す（§10-8） |
| Stripe 用の CSV | 019 §8.2 の引き継ぎスクリプトの入力 `v1-subscriptions.csv`（`v1_user_id, email, stripe_customer_id, stripe_subscription_id, max_staffs_count, last_edited_at`）を **`import.ts` が書く**（rake ではない。「移行する人」の判定 §7.1 を Ruby と TS の 2 か所に持たないため）。`last_edited_at` は `shifts.jsonl` の `updated_at` の最大を **pattern → tenant → user** でたどり、**§7.6 で捨てる前の全行**（`staff_id IS NULL` の自動アサインの一時行や、消えたスタッフの行を含む）から出す。019 §8.2.1 の集計（`Shift.joins(pattern: :tenant)`）と同じ母集合にしないと、rescue / cancel_unpaid の 90 日の境目が動く。移行しない人の Subscription は `v1-subscriptions-not-migrated.csv` に分け、引き継ぎスクリプトには渡さず Dashboard で解約する（想定 0 件。022 の手順に入れる） |
| 実行環境 | `tsx --conditions=react-server`（`stripe:*` と同じ。`server-only` の `lib/calendar/holidays.ts` を読むため） |

### 6.2 変換は純関数（`src/lib/migration/`）

| ファイル | 役割 |
| --- | --- |
| `v1Ids.ts` | 既存。`v1Uuid(table, id)`（名前空間は内部の定数。§3-6）。**id の導出はここ以外に書かない**（005 §3.2） |
| `v1Types.ts` | JSONL の行の型と Zod（読み込み時に 1 行ずつ検査。形が違えばその場で止まる） |
| `transform.ts` (+ test) | テーブルごとの `transformXxx(rows, context) → { rows, dropped, fixed }`。context は「移行する users の id 集合」「tenant → owner」「pattern → tenant」など、親テーブルの変換結果 |
| `truncate.ts` (+ test) | 文字数の切り詰め（コードポイント単位。`char_length` と同じ数え方）。切り詰めの前後を返す |
| `requiredNums.ts` (+ test) | 焼き付けられた行の判定（§7.7）。`resolveRequiredNum()` の逆向きで、祝日は呼び出し側が渡す |

スクリプトは「読む → 変換 → 書く」の配線だけにし、判断は純関数に置く（AGENTS.md の「`_lib/` は Vitest 対象」と同じ考え）。

## 7. テーブルごとの変換（001 §5.2 を今のスキーマで書き直したもの）

共通:

- id は `v1Uuid('<table>', id)`。tenants だけ 22 文字トークン（`uuid` 列）を名前にする
- `created_at` / `updated_at` は v1 の値をそのまま。`profiles` はトリガが `now()` で作るので、§7.1 の UPDATE で v1 の値に直す（管理画面の「登録日」が `profiles.created_at`）
- 文字数超過は CHECK と同じ長さに切り詰め、id と前後の文字数を記録する（003 §3.10。値は report に書かない。§6.1）。切り詰めは `.trim()` の後
- 親が移行されない行（捨てた user の店舗、捨てた店舗のスタッフ…）は連鎖して捨て、理由に `parent_dropped` を付ける
- **v1 で nullable の列は、`v1Types.ts` の Zod も `nullable()` で受ける**（`position` / `color_hex` / `note` / `name` / `provider` / `uid` / `stripe_*` / `trial_end` など。non-null で書くとリハーサルの最初の行で止まる）。`position` が null の行は末尾（id 順）。`stripe_customer_id` / `stripe_subscription_id` の空文字は null
- **親の id が NULL の行は `parent_missing` で捨てて記録する。** v1 の親を指す列はほぼすべて nullable（FK はあっても NULL は通る。0 件のはずだが、モデル経由の書き込み以外に保証が無い）
- `position` は v1 の `(position, id)` 順に **0 から振り直す**（v1 の acts_as_list は 1 始まり。v2 は 0 始まりで並べ替え RPC が振り直すので、値そのものに意味は無い）

### 7.1 users → `auth.users` / `auth.identities` / `profiles`

| v1 | v2 |
| --- | --- |
| 入れる人（**決定。2026-10-10**） | **v1 でログインできた人だけ**: `confirmed_at IS NOT NULL OR sign_in_count > 0`。全員を**確認済み**で入れる（`email_confirmed_at = coalesce(confirmed_at, invitation_accepted_at, created_at)`）。未確認（`email_confirmed_at = null`）の行は作らない |
| それ以外（招待未承認・未確認でログイン実績なし） | **移行しない**。招待未承認はパスワードが無い（001 §5.2）。未確認の人は Devise の confirmable が v1 でもログインを拒んでいる（`active_for_authentication?` が false）ので、店舗も作れていない。v2 で登録し直せば同じメールで新しく始められる。未確認の行を v2 に残すと、同じメールでの登録（GoTrue は既存の未確認ユーザーに確認メールを再送する）がパスワードを引き継ぐのか置き換えるのかが読みにくくなる |
| 保険 | `import.ts` が、移行しないユーザーのうち**店舗（スタッフかシフトのあるもの）を持つ人**を `report.json` に出す。想定は 0 件。1 件でもあれば個別に見て、入れるなら `--overrides` の `forceMigrateUsers`（§6.1）で確認済みとして入れる（その人は v1 で使えていたはず） |
| `encrypted_password`（Devise の bcrypt） | そのまま `encrypted_password` へ。v1 は **pepper なし・stretches 11・bcrypt 3.1.20**（`config/initializers/devise.rb`・`Gemfile.lock`）なので `$2a$11$…` の素の bcrypt で、GoTrue（Go の bcrypt）がそのまま検証できる。pepper があれば全員ログインできなくなるところだった。**リハーサルで実際にログインして確かめる**（§8.2-2・§9.1-4） |
| `password_is_email = true`（代理承認の初期パスワード） | **Google の人でも最優先で** `encrypted_password = null`（パスワードではログインできない。「パスワードを忘れた方」で再設定してもらう）。v1 は**店舗を新しく作るときだけ**（`tenants_controller.rb` の `check_init_password!` は `only: [:new]`）`valid_password?(email)` を見て変更させていた。店舗を作る入口は `/tenants/new` だけで、このチェックは承認機能と同じコミット（`46d38b2`、2019-03-30）で入ったので、**店舗を持つ人はメールのままにならない**（承認の対象は未確認 = ログインできなかった人で、承認の前に店舗は持てない）。残るのは店舗を持たない人で、v1 では何もできないが、v2 にその仕組みは無く、残すとメールを知る人が誰でも入れる（本人が v2 で店舗を作ればその店舗も）。リハーサル（2026-10-13）では全員を照合して 3 人（代理承認 1・自分でメールにした人 2。3 人とも店舗なし）で、rake の照合を「ログインできた人のうち店舗を持たない人」に絞った（§5.1・§15）。件数を記録し（想定より多いかもしれない）、022 の案内の分量を決める。判定は今のメールと比べる。v1 にはメールを変える画面が無い（`users/registrations/edit` はメールを表示するだけ。Devise の `account_update` が `email` を受けるので手で組んだリクエストなら変えられた）ので、実質はこれで全員を拾える |
| `encrypted_password = ''`（v1 の既定値）で移行対象の人 | 理屈上いない（§7.1 の条件はログインできた人）が、いれば `null` にして記録 |
| `provider = 'google_oauth2'`（`uid` の有無を問わず） | **「それ以外」と同じ email のアカウントとして入れる**（`providers = ["email"]`・`email` の identity だけ。**決定。2026-10-11**）。`encrypted_password` は**そのまま残す**（`password_is_email` なら null）。**v1 は Google ログインが壊れていた**（`users/sessions/new.html.slim` がボタンに取り消し線を引き「現在、Google ログインできない問題が発生しています」と出している。v1 分析 §2.2）ので、この人たちは「パスワードを忘れた方」で自分のパスワードを作って入っている（Devise の recoverable は provider を見ない）。null にすると初日から締め出す。`from_omniauth` が入れた乱数の bcrypt が残っている人は誰もそれで入れないので、残しても害が無い。§5.2-11 で最近ログインしている人数を見る。v2 で初めて Google ログインしたとき、GoTrue が**確認済みの同じメール**のユーザーに `google` の identity を自動で結び付ける（supabase/auth の `DetermineAccountLinking`: sub の identity が無ければ、provider が verified と返したメールと同じメールの identity / ユーザーを探し、1 人に決まれば link）。v1 にメールを変える画面は無いので Google 側と assift のメールは同じ。当初（〜7 回目のレビュー）は v1 の `uid` から `google` の identity を先に作る案だったが、利点が「Google 側のメールが後で変わった人」だけで、`auth.identities` の行を自分で組む複雑さに見合わないのでやめた |
| `uid` | 使わない（上のとおり identity は作らない）。`manifest.json` の件数（§5.2-6・11）に残るだけ |
| それ以外 | `raw_app_meta_data = {"provider":"email","providers":["email"]}`、`auth.identities` に `provider = 'email'`・`provider_id = <v2 の id>`（seed と同じ形） |
| `auth.identities` の共通の列 | `id = gen_random_uuid()`、`identity_data` の `email` は小文字、`last_sign_in_at` / `created_at` / `updated_at` は v1 の `created_at`（seed と同じく明示する。本番の `auth` スキーマは GoTrue が管理していて既定値が版で変わりうる） |
| その他の列 | `instance_id = '00000000-…'`、`aud = role = 'authenticated'`、`raw_user_meta_data = '{}'`、`last_sign_in_at = current_sign_in_at`、token 系 4 列は `''`（seed の注記。null だと GoTrue が落ちる） |
| `locked_at` | 無視する（ロックは解除）。件数だけ記録。`unconfirmed_email` は v1 に無い（`reconfirmable = false`） |
| `profiles`（トリガが作った後に UPDATE） | `stripe_customer_id`（そのまま。重複は §7.1.1）/ `trial_end`（そのまま）/ `created_at` / `updated_at`（v1 の値。トリガは止めてある）/ `max_staffs_count`（**`stripe_subscription_id IS NULL AND max_staffs_count >= 11` のときだけ**その値。個別契約）/ `staff_cap`（**`stripe_subscription_id IS NOT NULL AND max_staffs_count >= 11` のとき** `least(greatest(max_staffs_count, 移行時点の在籍数), 1000)`。019 §13.7）/ `is_admin` は **立てない**（§3-3） |

- `email` は Devise が小文字で保存している。念のため `.toLowerCase().trim()` し、重複があれば止まる（`auth.users` の一意制約に任せず、変換で先に検出して理由を出す）
- 店舗を 1 つも持たないユーザーも移行する（ログインできて `/tenants/new` に着く）
- 「Subscription なし」= 一度も申し込んでいない人。v1 は `stripe_subscription_id` を退会以外で消さない（解約は上限を 10 人に下げるだけ。`user.rb`・`charges_controller.rb`）ので、`stripe_subscription_id IS NULL AND max_staffs_count >= 11` は管理者が SQL で入れた個別契約

#### 7.1.1 `stripe_customer_id` を複数のユーザーが持つとき

v1 に一意制約が無く、v2 は `unique`。想定は 0 件（§5.2-8）で、あれば次の規則で 1 人に残し、他は null にして記録する。

1. `stripe_subscription_id` を持つ人を優先する
2. それでも決まらなければ `created_at` が古い人
3. 規則で決めたくないときは `--overrides` の `customerOwner`（§6.1）で持ち主を指定する。Stripe の Dashboard でその Customer の Subscription の持ち主を確かめてから決める

Customer を失った側に `stripe_subscription_id` があれば、その人は `v1-subscriptions-not-migrated.csv` に出して Dashboard で扱う。引き継ぎスクリプトに渡すと Customer 一致で schedule が付き、同期の `chooseSubscription()` が後から解約する形になる。

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
| `available_wdays` | 整数に寄せ、0..6 だけ残し、重複を除いて昇順。NULL はモデルが `[]` にしている（§5.1） |
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
| `date` が `YYYY-MM-DD` の実在する日付でない（西暦 5 桁など） | 捨てて記録（`invalid_date`）。v1 の date 列は西暦 5 桁も受け、リハーサルで `20223-03-11` が実在した（§15）。`events` / `shares` も同じ |
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
| `date` が実在する日付でない | 捨てて記録（`invalid_date`。§7.6 と同じ） |

### 7.10 shares

| v1 | v2 |
| --- | --- |
| `code` | そのまま（`^[A-Za-z0-9]{8}$` に合わなければ捨てて記録。配った URL が壊れるので 0 件のはず）。v1 に一意制約が無い（作成時に照合するだけ）ので、重複があれば `created_at` が新しい 1 件（同時刻なら id が大きいほう）を残して捨てて記録 |
| `end_date - start_date > 31` | `end_date = start_date + 31` にして記録（v1 は 30 日に切っていたが、CHECK は 31 なので CHECK に合わせる） |
| `end_date < start_date` | 捨てて記録 |
| `start_date` / `end_date` が実在する日付でない | 捨てて記録（`invalid_date`。§7.6 と同じ） |
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
| `staff_cap` を 1000 で切った人数 / 個別契約の `max_staffs_count > 1000` | **報告するだけ（ROLLBACK しない）**。§7.1 の式は 1000 超を丸めて入れる設計で、v2 側に他の手が無い（CHECK も管理画面も 11〜1000。019 §13.7）。該当者には個別に連絡する |
| スタッフ 0 人（準備中）の店舗のうち勤務パターン・制約・必要人数を持つ店舗 | 報告する（初期設定でパターンを置き換えると消える。多ければ 022 の告知に入れる） |
| 上限超過の人数と一覧 | v1 の `over_limit?`（在籍 > `max_staffs_count`）の人と、個別契約でなく在籍 > 10 の人を、Subscription の有無・上限（10 以下 / 11 以上）の内訳付きで報告する。上限 10 の Subscription（約 502 件）と使っていない `unpaid`（87 件）は Stripe の引き継ぎで解約されて v2 では無料になり、v1 は解約で上限を下げるだけで在籍を減らさないので、この層にロックされる人がいる（019 §8.1・§8.2.2）。多ければカットオーバーの前に連絡 |
| `tenants` で `setup_completed_at is null` の件数 | = スタッフ 0 人の店舗の数 |
| 切り詰めた値の件数（列ごと） | 報告する。想定外に多ければ 003 §3.10 の 2 を再検討 |

「期待」に数や等式が書いてある行が合わなければ `ROLLBACK` して非 0 で終わる。「報告する」の行は止めず、レポートに出すだけ。

### 8.2 移行後の DB に対して（`scripts/migrate-v1/verify.ts` + 手で）

| # | 確認 | 方法 |
| --- | --- | --- |
| 1 | 件数の突合（再掲） | `verify.ts` が `manifest.json` と `report.json` と DB を比べる。基準は `report.json` に残した **BEGIN 直後のテーブルごとの `count(*)`**（seed や管理用アカウントの分）で、`現在の count − 基準 = 入れた` を見る。既知の 1 件の `shifts.date` が文字列で一致する（`pg` の型パーサの設定が効いている） |
| 2 | パスワード | リハーサルでは restore した v1 の 2 ユーザー（通常の人 1 人と、`provider = 'google_oauth2'` で `uid` のある人 1 人）に既知のパスワードを `rails runner` で入れてからエクスポートし、v2 でログインする（後者が 8 の確認を兼ねる。Google の人の実際のパスワードは本人しか知らない）。本番では自分のアカウント |
| 3 | 旧 URL | `curl -I https://<v2>/tenants/<v1 トークン>/shifts?start_date=2026-10-01` が 308 で `/tenants/<uuid>?start=…`、その uuid の店舗が開く |
| 4 | 共有 URL | 有効な `shares` を 3 件選び `/share/<code>` が v1 と同じ表を出す。期限切れは 404。v1 の共有ページはスタッフグループ順（`ordered_shift_groups`）なので、グループを使っていた店舗では行の並びが違って正しい（グループは廃止） |
| 5 | **CSV の一致** | サンプル店舗 5 件（スタッフ数の多い店・ペアのある店・退職者のいる店・半月表示の店・必要人数の上書きが多い店）で、v1 の `shifts.csv?encoding=utf8` と v2 の `/api/tenants/<id>/shifts/csv?encoding=utf8` を同じ `start` で取り `diff`。違いは 1 つずつ理由を書く（CSV は 010 で v1 と同じ形に作った）。v1 の CSV は名前を切り詰めないので、切り詰めたスタッフ名・パターン名の行は違って正しい（`report.json` の切り詰めの一覧と突き合わせる） |
| 6 | 必要人数 | 5 のサンプルで、**「デフォルト人数をセット」を押してある期間**について v1 の表の `required / assigned` と v2 の表の数字が同じ（§7.7 で消した行が表示を変えていない）。押していない期間は v1 が 0、v2 が基本の人数で、違って正しい（§7.7） |
| 7 | 準備中 | スタッフのいる店舗を開いて `/setup` に送られない。スタッフ 0 人の店舗は送られる（§7.2） |
| 8 | Google の人 | `auth.identities` は `email` の 1 行だけ（通常の人と同じ）で、v1 のパスワードでログインでき、アカウント画面にパスワード欄が出る。実際の Google ログイン（自動リンクで `google` の identity が足される）は本番の Google の資格情報が要るので 022 で |
| 8b | 代理承認の人（`password_is_email`） | `encrypted_password` が null で、メール + パスワードのログインが「メールアドレスまたはパスワードが違います」で止まり GoTrue が落ちない。`/password/forgot` から再設定できる（`providers` に `email` があるので guard を通る）。**アカウント画面からは設定できない**（「現在のパスワード」を求める。GoTrue はパスワードの有無を返さないので画面で見分けられない）。v2 で Google ログインの自動リンクで入った人も同じなので、022 の案内に「パスワードは『パスワードを忘れた方』から作る」を入れる |
| 9 | 課金の列 | `profiles` の `stripe_customer_id` / `trial_end` / `max_staffs_count` / `staff_cap` を数件、v1 の値と目で比べる。`staff_count_history` が全員 1 行 |
| 10 | 制約 | 制約を持つ店舗を 2 件開き、設定画面に v1 と同じ行が出る |

## 9. リハーサル

### 9.1 手元（ローカル Supabase）

1. Heroku からダンプを取る（`heroku pg:backups:capture` → `download`）。**取った日時と件数を本プランの §15 に書く**（`shifts` の行数で所要時間を見込む）
2. 手元の v1 に restore（`pg_restore`。Heroku の Postgres と同じメジャー版を使う）→ `rails v2:export`
3. `npx supabase db reset`（seed あり）→ `npm run migrate:v1 -- --input … --allow-existing`
4. §8.2 の 1〜10（実際の Google ログインを除く）
5. 所要時間と `import.ts` の最大メモリ（RSS）を記録する。エクスポート・インポート・検証のそれぞれ。変換は全行をメモリに載せる（重複の判定に全行が要る）ので、Node の既定のヒープで足りなければ `--max-old-space-size` を手順に書く

### 9.2 直すものが出たら

変換の純関数とテストを直して 9.1 の 3 からやり直す。**エクスポート側（Ruby）を直すのは YAML の読み方だけ**にし、判断は TS に寄せる。

### 9.3 本番の Supabase に対する予行（`--rollback`）

本番のプロジェクト（022 で作る）が出来たら、管理用アカウントだけの状態で `--rollback` を流す。

- 確かめること: Session pooler につながる / **管理用アカウントのメールが v1 のどのユーザーとも重ならない**（重なると `auth.users` の一意制約で全体が ROLLBACK する。変換はv1 の中の重複しか見ない）/ `postgres` ロールで `auth.users` に INSERT できる・トリガを止められる（クラウドの `postgres` は superuser ではない。できなければ §13-4）/ `statement_timeout` と `idle_in_transaction_session_timeout` を 0 にできる / `pg` の SSL（`sslmode=require` の解釈は版で変わる。つながらなければ Supabase の CA を渡して `verify-full`） / 所要時間（手元との差）/ §8.1 がすべて通る
- 何も残らないので、何度でも流せる。**当日の前に最低 1 回**、できれば当日の朝にもう 1 回（ネットワークと権限の最終確認）

## 10. カットオーバーでの位置（022 に渡す）

001 §5.4 と 019 §8.3 を本プランの手順で具体化したもの。時間は 9.1 / 9.3 で埋める。

| 順 | 手順 | 目安 |
| --- | --- | --- |
| 1 | Heroku `MAINTENANCE_MODE=on`。Heroku Scheduler の `stripe:create_usage_record` を止める（019 §8.2） | |
| 2 | `heroku pg:backups:capture` → download → 手元に restore → `rails v2:export` | |
| 3 | `npm run migrate:v1 -- --input … --rollback`（最終確認）→ `--rollback` 無しで本番へ。**23 時台（Vercel の cron の同期が `profiles` に書く）を避ける** | |
| 4 | `verify.ts` + §8.2 の 2〜4・7・9 を本番で | |
| 5 | `npm run stripe:migrate-v1 -- --input <report と同じ場所>/v1-subscriptions.csv`（dry-run → `--limit 5` → 全部。019 §8.2.3）。dry-run の結果 CSV で、`skip`（Stripe で解約済み）・`review`・取得できません・Customer が一致しません のいずれかで `max_staffs_count >= 11` の人がいれば（どれも `billing_subscriptions` に写しが作られない）、Dashboard から解約した個別契約かを確かめる（§7.1 の規則では `staff_cap` が入り `max_staffs_count` は null になるので、同期の後に無料扱いでロックされうる。該当なら `profiles.max_staffs_count` を管理画面で入れる。`report.json` の `over_limit.freeOverLimit` で `hasSubscription: true` の人がこの候補）。Webhook は §10-1 で先に登録してあるので、このスクリプトの実行中に Stripe のイベント → `syncCustomer()` が走る（`profiles` は入っているので持ち主が引ける。二重の有効契約は 019 §5.5 のとおり新しいほうが解約される） | |
| 6 | 全員の同期（019 §8.3-4）→ Stripe の Dashboard の設定を切り替える | |
| 7 | DNS を Vercel へ | |
| 8 | 保管（**決定。2026-10-10**。§13-6）。暗号化して 1 か所に置き、ファイル名に消す日を入れ、022 のチェックリストに削除の日付を 2 つ書く: (a) **pg_dump と JSONL はカットオーバーから 3 か月**で消す（復旧の窓はシフトの 3 周期で足り、以降は v2 のほうが新しくて戻せない。パスワードのハッシュと第三者であるスタッフの名前を本番の外に置き続けない。プライバシーポリシーの「バックアップに一定期間残り、復旧にのみ使う」と揃う）。(b) **`manifest.json` / `report.json` / Stripe の引き継ぎの結果 CSV と旧料金の対象者の一覧（019 §8.1）/ ダンプから抜いた `usage_records` の CSV（user id・人数・日時だけ）は 1 年**（「スタッフが消えた」「旧料金のはず」の問い合わせと、半年後に旧料金をやめる作業 019 §8.5 に使う。どれもスタッフの名前・メモを含まない。`report.json` は切り詰めを id と文字数で持つ。§6.1）。Heroku の自動バックアップはアプリの停止（001 §5.4）で消える | |

3 で失敗したら: トランザクションごと戻っているので、原因を直して 3 からやり直す。v1 は止まったままなのでデータはずれない。
直すのに時間がかかるなら Heroku のメンテナンスモードを解いて日を改める（v2 には何も入っていない）。

## 11. ファイル

```
scripts/migrate-v1/
  import.ts                      読む → 変換 → 1 トランザクションで書く → 突合 → COMMIT / ROLLBACK
  verify.ts                      移行後の DB と manifest / report の突合
  pg.ts                          型パーサの設定（date / timestamp を文字列のまま。import と verify が共有）
  overrides.example.json         --overrides の形（§6.1。中身は空）
  v1/v2_export.rake              v1 に写して流す rake（§5）
  fixtures/                      手で作った小さな JSONL + README（§12-4。個人情報を含まない架空の値。Vitest の通しのテストも読む）
src/lib/migration/
  v1Ids.ts (+ test)              既存。V1_UUID_NAMESPACE を定数にし、v1Uuid(table, id) が内部で使う。getV1UuidNamespace() を消す。テストで値を固定する
  v1Types.ts                     JSONL の行の Zod
  transform.ts (+ test)          テーブルごとの変換（§7）
  truncate.ts (+ test)           文字数の切り詰め
  requiredNums.ts (+ test)       焼き付けられた行の判定（§7.7）
  convert.ts (+ test)            全体の配線 + レポートの材料（fixtures の通しを Vitest で固定）
  readExport.ts                  JSONL と manifest の読み込み（1 行ずつ Zod）
package.json                     "migrate:v1" / "migrate:v1:verify"（tsx --conditions=react-server）、pg / @types/pg
src/lib/tenants/legacyUrl.ts     resolveLegacyTenantUrl() と警告を消し、proxy が rewriteLegacyTenantUrl(pathname, search) を直接呼ぶ（常に解決する）
scripts/stripe/migrate-v1-subscriptions.ts / src/lib/billing/migration.ts
                                 冒頭コメント「入力の CSV は rails runner で出す」を「import.ts が書く」に直す
.env.example / README.md         V1_UUID_NAMESPACE の項目を消し、MIGRATION_DATABASE_URL をコメントで書く（.env.local には書かない）。
                                 README の「旧 URL（v1）の確認」の例を今の着地（/tenants/<uuid>?start=…。/shifts を落とす）に直す
.gitignore                       v1-export/ と、fixtures を --input にしたときの report / CSV
AGENTS.md                        scripts/migrate-v1 と lib/migration の説明。「uuid の扱い」の 2 か所（V1_UUID_NAMESPACE の環境変数、getV1UuidNamespace() が validate() で弾く）を定数に読み替える
docs/plans/001-…/README.md       §3.1（環境変数・ON CONFLICT）と §5 の冒頭に「021 で上書き」の注記
docs/plans/005-…/README.md       §3.1（未設定時の警告・本番の env）に「021 §3-6 で定数化」の注記
docs/plans/019-…/README.md       §8.1 の「session_replication_role = replica」に「021 §3-2 で上書き」の注記
```

## 12. 実装の順序と確認

1. 名前空間の定数化（§3-6）: `uuidgen` で v4 を 1 つ作って `v1Ids.ts` の定数にし、`v1Uuid(table, id)` が内部で使う形に変える。テストで値を固定し、`getV1UuidNamespace()`・`legacyUrl.ts` の警告・`.env.example` / README / AGENTS.md の項目を直す（§11）。**この時点で 1 回コミットし、以降は値に触らない**
2. `v1Types.ts` と `v2_export.rake` を先に書き、**形を 1 つに決める**（JSONL の 1 行 = Zod の 1 型）
3. `truncate.ts` / `requiredNums.ts` / `transform.ts` と Vitest（§7 の各行に 1 ケース以上。重複・他店舗・自己参照・空文字・範囲外）
4. `import.ts`。`scripts/migrate-v1/fixtures/` に手で作った小さな JSONL（2 ユーザー・2 店舗・Google の人・代理承認の人・捨てる行・切り詰める値・焼き付けと上書きの必要人数を含む）を置き、変換の通し（JSONL → v2 の行 + report）を Vitest で固定してから、手元の seed だけの DB に入れて通す
5. `verify.ts`
6. 9.1 のリハーサル（本物のダンプ）。件数と所要時間を §15 に記録
7. AGENTS.md・001 / 005 / 019 の注記・Stripe のスクリプトの冒頭コメント（§11 の残り）
8. PR の前に `npm run lint` / `typecheck` / `test`。`npx supabase test db` はスキーマを触らないので変化なし

## 13. 決定と未確定

| # | 論点 | 状態 |
| --- | --- | --- |
| 1 | 未確認ユーザー（`confirmed_at IS NULL`、招待は承認済み）の扱い | **決定（2026-10-10）**: v1 でログインできた人（`confirmed_at IS NOT NULL OR sign_in_count > 0`）だけを確認済みで入れ、それ以外は入れない。未確認の行は作らない（§7.1）。devise_invitable は招待の承認で `confirmed_at` を埋め、Devise の confirmable は未確認のログインを拒むので、該当は僅少のはず。§5.2-5 の内訳と「移行しないのに店舗を持つ人」が 0 件であることをリハーサルで確かめる |
| 2 | `V1_UUID_NAMESPACE` の管理場所と値 | **決定（2026-10-10）**: §3-6 のとおり（定数・ランダムな v4） |
| 3 | `staffs.available_wdays` が nil のときの読み替え | **決定（2026-10-10）**: `[]`（全日「担当不可」）。v1 の `Staff` は `serialize ..., Array` で NULL を `[]` と読み、判定はすべてモデル経由なので、v1 の見え方と同じ。`available_patterns` → `[]`、`default_patterns` → `{}` も同じ理由（§5.1） |
| 4 | 本番の `postgres` ロールで `auth.users` への INSERT と `disable trigger` ができるか | **9.3 で確かめる**。`public` の表は migration を流した `postgres` が所有者なので `disable trigger` はできるはず（できなければ 3 つとも代替が無い。`set_updated_at` は BEFORE UPDATE で毎回 `now()` にするので後から直せない）。止められることを §9.3 の必須条件にする。`auth.users` への INSERT ができなければ `supabase_auth_admin` 相当の権限を一時的に付ける |
| 5 | §3 の 6 点（1 トランザクション・トリガ 3 つ・`is_admin`・必要人数の間引き・`assist_run_id`・名前空間） | §3-1〜§3-5 は **決定（2026-10-11）**、§3-6 は #2 で決定済み |
| 6 | ダンプ・エクスポート・レポートの保管期間 | **決定（2026-10-10）**: pg_dump と JSONL は 3 か月、manifest / report / Stripe の結果 CSV / `usage_records` の CSV は 1 年（§10-8）。当初の案（全部 1 年）は、フルのダンプの価値が数週間で尽きる一方で負債が 1 年残るのでやめた |
| 7 | リハーサルのダンプをいつ取るか | **決定（2026-10-13）**: Heroku の手動バックアップ `b2818`（2026-10-13 13:27 JST に capture）を使う。件数と所要時間は §15 |
| 8 | 書き込みが遅い・メモリが足りないときの対処 | 9.1 の所要時間と RSS で判断。目安: インポート全体が 10 分を超えるなら `COPY` に切り替える。ヒープが足りなければ `--max-old-space-size` |
| 10 | Google の人（`provider = 'google_oauth2'`）の identity を v1 の `uid` から先に作るか | **決定（2026-10-11）: 作らない**。全員 email のアカウントとして入れ、Google ログインは GoTrue の自動リンク（確認済みの同じメール）に任せる。先に作る利点は「Google 側のメールが後で変わった人」だけ（v1 にメールを変える画面は無い）で、`auth.identities` を自分で組む複雑さに見合わない（§7.1） |
| 9 | 変換を TypeScript で書くか SQL で書くか（`pg_restore` で `v1` スキーマに入れて `INSERT … SELECT`） | **決定（2026-10-11）: TypeScript**。SQL でも成立する（速く部品が少ない）が、YAML の列は SQL で読めず Ruby の工程が消えないこと、uuid の導出・祝日・必要人数の数値化をアプリの関数と共有できること、Vitest で規則を固定できることを優先した |

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

### 6 回目（2026-10-10。収束判定。別のレビュー担当が「実装やカットオーバーの結果を変える指摘だけ」を出し、2 件 + 軽微 3 件で収束と判定）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | §8.1 の「`staff_cap` を 1000 で切った人数 = 0」が ROLLBACK の条件になっていて、§7.1 の「1000 で丸めて入れる」式と食い違う | 報告するだけにした（v2 に他の手が無い。該当者には連絡） |
| 2 | `last_edited_at` を staff 経由で求めると、019 §8.2.1 の集計（pattern 経由・自動アサインの一時行を含む）と母集合が違い、rescue / cancel_unpaid の境目が動く | pattern → tenant → user、§7.6 で捨てる前の全行から求める（§5.1） |
| 3 | §10-3 の括弧の理由が 5 回目 #5 の修正に追いついていなかった | 揃えた |
| 4 | `default_patterns` は 2019-11 に足された列で、NULL は 0 件とは限らない | §5.2-2 の期待値を列ごとに分けた |
| 5 | `stripe_customer_id` の重複で Customer を失った側の Subscription をどちらの CSV に書くかが未定 | not-migrated に出して Dashboard で扱う（§7.1） |

### 7 回目（2026-10-11。§3 の決定を入れた後、利用者の依頼で全体を通読。私の通読と、別の担当の通読を合わせた）

結果を変える指摘は無し。本文の矛盾・参照・構造だけ。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | §3-2 の理由欄が「履歴のトリガだけ止める」のまま（3 回目 #6 で 3 つにした） | 理由に 2 つの `set_updated_at` を足した |
| 2 | 冒頭の状態行が 10-11 の決定（§3・#9）を反映していない。§13-5 の論点に §3-5・§3-6 が無い。#9 が #5 と #6 の間にある | 状態行と §13-5 を直し、#9 を末尾へ |
| 3 | §5.1「件数は §9.1 で埋める」の参照先が違う（§15） | 直した |
| 4 | 定数化で消す場所が足りない: AGENTS.md の「`getV1UuidNamespace()` が `validate()` で弾く」、README の旧 URL の例（`/shifts` を落とす今の着地とずれ）、001 §3.1・005 §3.1 の注記 | §11・§12 に足した |
| 5 | `v1Uuid(table, id, ns)` が名前空間を引数で受けたままで、§3-6 の「構造的にずれない」が成り立たない | `v1Uuid(table, id)` が内部で定数を使う形に（§3-6・§6.2・§7・§11・§12-1） |
| 6 | §13-4 の代替案が履歴のトリガだけで、`set_updated_at` の代替（無い）に触れていない | 止められることを §9.3 の必須条件にした |
| 7 | §10-8 の「名前を本番の外に置き続けない」と、1 年残す `report.json` が切り詰めた値（名前・メモ）を含むことが食い違う | report の切り詰めは id と文字数だけにし、値を書かない（§6.1・§7 共通・§10-8） |
| 8 | §6.1「順序」の `profiles` を staffs の後に置く理由（在籍数が要る）が、TS で数えると決めた後は無い | 順序に制約が無いと書き直した |
| 9 | §8.2-7「`/setup` に送られない」はスタッフ 0 人の店舗では逆 | 分けて書いた |
| 10 | §8.1 で「報告するだけ」の行と「合わなければ ROLLBACK」が同じ表にあり、どれが止める条件か読めない | 数・等式のある行だけが止める条件、と明記 |
| 11 | §5.1 の「NULL は 0 件のはず」が §5.2-2（`default_patterns` は 2019-11）と食い違う。§7.3 の「§5.1 の読み替え」も古い。§7 共通で Zod の nullable を 2 回書いている | 直した |
| 12 | §9.1-4「Google は 8 の範囲まで」が、5 回目 #6（既知のパスワードで確かめる）の後は不要 | 「実際の Google ログインを除く」に |
| 13 | 構造: §7.1 の `profiles` 行に重複の規則・条件・根拠が詰まっている / `v1-subscriptions.csv` の説明が §5 にある（書くのは `import.ts`）/ §3-6・§13-2 に同じ論証が 3 か所 | `stripe_customer_id` の重複を §7.1.1 に、CSV を §6.1 に移し、§3-6 の理由を表の下の箇条書きに、§13-2 は参照だけに |

以降の指摘は出ていない。ここで収束とする。

## 15. 実装ログ

### 2026-10-11（§12 の 1〜5・7・8）

クラウドのセッションで実装した。v1 のコードは `tabbyz/assift-v1` を clone して突き合わせた。

| § | やったこと |
| --- | --- |
| 12-1 | `V1_UUID_NAMESPACE = 4b880c2f-808c-4326-9bbd-3497ab1056e1`（`uuidgen` の v4）を `lib/migration/v1Ids.ts` の定数にし、`v1Uuid(table, id)` が内部で使う。テストで値と RFC 準拠を固定（Python の `uuid5` と相互確認した値も固定）。`getV1UuidNamespace()` と `legacyUrl.ts` の `resolveLegacyTenantUrl()`・警告を消し、proxy は `rewriteLegacyTenantUrl(pathname, search)` を直接呼ぶ。`.env.example` / README / AGENTS.md を直した。**ここで 1 回コミット**（`5210380`） |
| 12-2 | `v1Types.ts`（JSONL の 1 行 = Zod の 1 型。親を指す列と v1 で nullable の列は `nullable()`。`required_nums.date` は壊れていても読んで変換で捨てる）と `scripts/migrate-v1/v1/v2_export.rake`（§5.1 の列・§5.2 の 13 の集計・`usage_records.csv`。`ruby -c` のみ。**本物の v1 では未実行**） |
| 12-3 | `truncate.ts`（コードポイント。サロゲートペアを途中で切らない）/ `requiredNums.ts`（`judgeBakedRequiredNum()`。祝日は呼び出し側）/ `transform.ts`（§7 の表ごと。親は `Map<v1 id, 変換後 \| null>` で受け、`has()` が false なら `parent_missing`、null なら `parent_dropped`）。Vitest 79 件 |
| 12-4 | `convert.ts`（全体の配線 + レポートの材料: 件数・移行しないのに店舗を持つ人・上限超過・準備中でデータあり・Stripe の CSV）/ `readExport.ts`（1 行ずつ Zod。manifest の件数と突合）/ `scripts/migrate-v1/import.ts` / `fixtures/`（架空の 8 ユーザー・5 店舗。中身は `fixtures/README.md`）。`convert.test.ts` が fixtures の通しを固定。seed 入りのローカル DB に `--rollback` → COMMIT で通した |
| 12-5 | `verify.ts`。`report.json` の BEGIN 直後の `count(*)` を基準に `現在 − 基準 = 入れた`、manifest の行数 = 読んだ、v1 の表の「入れた」= v2 の表の差分、`shifts.date` の文字列一致 |
| 12-7 | AGENTS.md（`lib/migration` / `scripts/migrate-v1` / スクリプト）、001 §3.1・§5.1、005 §3.1、019 §8.1 の注記、Stripe のスクリプトと `lib/billing/migration.ts` の冒頭コメント |
| 12-8 | `npm run lint`（警告 1 件は main 由来の `reasons.test.ts`）/ `typecheck` / `test`（894 件）/ `npx supabase test db`（241 件）すべて通過。`format:check` の 4 ファイルも main 由来 |

#### fixtures での通し（ローカル Supabase。seed あり → `--allow-existing`）

- `--rollback` と COMMIT の両方で §8.1 の突合 20 件がすべて OK。所要 0.2 秒（fixtures は 70 行なので時間の目安にはならない）
- `verify.ts` が 30 件すべて一致
- **GoTrue でのログイン**: `$2a$11$…`（Postgres の `crypt('password', gen_salt('bf', 11))` で作った Devise と同じ形）で通常の人・Google の人（email として入れる。`providers = ["email"]`）が入れた。`encrypted_password = null`（代理承認・空）の人はメール + パスワードが 400（`invalid_credentials`）で GoTrue は落ちない。Devise の bcrypt gem が作った実物のハッシュは本物のダンプで確かめる（§8.2-2）
- **旧 URL**: `next dev` で `/tenants/FixtureTenant00000001A/shifts?start_date=2026-10-01` → `308 /tenants/<uuid>?start=2026-10-01`。uuid は `v1Uuid('tenants', token)` と一致
- **共有ページ**: `getSharedShiftTable()` を直接呼んで、移行した店舗名・在籍スタッフ・勤務パターン・シフト・メモが返り、捨てた店舗の code は null。ページそのものはこのセッションの環境で `next dev` が Google Fonts を取れず（`next/font/google` の fetch がプロキシを通らない）500 になるため、表示はリハーサルで見る
- DB の中身を目で確認: ペアの UPDATE（夜勤 → 明け）、`position` の 0 始まり、`retired_at`、`available_wdays` の正規化、`profiles` の `stripe_customer_id` / `trial_end` / `max_staffs_count` / `staff_cap`、`created_at` / `updated_at` が v1 の値のまま（`set_updated_at` を止めた効果）、`staff_count_history` が全員 1 行、トリガが 3 つとも `enable` に戻っている（`tgenabled = O`）

#### プランとの差分（実装で決めたこと）

- `lib/migration/` に `convert.ts`（全体の配線）と `readExport.ts`（JSONL の読み込み）を足した（§6.2 の 4 ファイルに加えて）。`import.ts` を「読む → 変換 → 書く」だけにしつつ、fixtures の通しを Vitest で固定するには、配線が import できる場所に要る
- `scripts/migrate-v1/pg.ts`（`keepDateStrings()`。`import.ts` と `verify.ts` が共有する型パーサの設定）を足した
- `resolveLegacyTenantUrl()` は残さず消した。名前空間を受けない `rewriteLegacyTenantUrl(pathname, search)` と同じものが 2 つになるため
- `v1UuidIn(namespace, table, id)` をテスト専用に残した（§3-6 の「テスト用に名前空間を渡す関数は別名で残す」）
- `report.json` の `dropped` は、件数が数十万になりうる理由（`shifts` の `unassigned`・`required_nums` の `baked`）だけ id を並べない。件数は `source[table].dropped` にある。`fixed` は全部並べる（切り詰めは id と前後の文字数だけ）
- `--overrides` は Zod で形を検査する（`customerOwner` に指定した人がその Customer を持っていなければ `MigrationError` で止まる）
- `restrictions` の `max_work_consecutive` で `pattern1_id` が壊れた参照（他店舗・存在しない）の行は §7.8 のとおり捨てる。`days` が 1..7 の外も `missing_column` に含めて記録（`detail` に `days=<値>`）
- `transformShares` の重複判定は店舗をまたぐ（v2 の `code` は全体で一意）
- インポートの突合に「`shifts.date` が文字列のまま一致する」を足し、`report.json` の `sample` に id と日付を残して `verify.ts` も同じ 1 件を見る（§8.2-1）
- `verify.ts` は `report.committed` が false（`--rollback` や失敗）なら止まる

#### レビュー（2026-10-11。別の担当に実物と突き合わせて読ませ、低い重大度 5 件。すべて反映）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | rake の `valid_password?` は bcrypt の形でないハッシュで `BCrypt::Errors::InvalidHash` を投げ、1 行で全体が止まる | `rescue` して false にし、`users.invalid_password_hash` を manifest に出す。TS はそのハッシュをそのまま入れる（GoTrue は照合に失敗して 400 を返すだけで落ちない。再設定で直せる） |
| 2 | `import.ts` の読み込み・変換の失敗（メールの重複など）が `try` の外で、スタックトレースのまま終わる | `main().catch()` でメッセージを出して非 0 |
| 3 | fixtures の README の手順どおりに流すと、追跡中の `fixtures/` に report と CSV が落ちる | `.gitignore` に足した |
| 4 | `verify.ts` の `before` / `after` が non-null で、BEGIN 前に失敗した report は Zod のエラーで止まる | `nullable()` にし、`committed` と同じ文言で止める |
| 5 | `password_is_email` は今のメールとしか比べられない（メールを変えた代理承認の人は検出できない） | v1 にメールを変える画面が無いことを確かめ（`users/registrations/edit.html.slim`）、§7.1 に「実質は全員を拾える」と注記 |

#### Google の人の identity をやめた（2026-10-11。§13-10）

利用者の指摘で、v1 の `uid` から `google` の identity を先に作るのをやめ、全員を email のアカウントとして入れる形にした（`transformUsers()` から `google` の identity と `providers` の `google` を外した。`google_without_uid` の記録も不要になった）。GoTrue の自動リンクの規則は supabase/auth の `internal/models/linking.go` で確かめた。fixtures で、Google の人（`hanako`）が `email` の identity 1 行でパスワードログインできることを確かめ直した。

#### レビュー 2 周目（2026-10-11。利用者の依頼で収束まで繰り返す。1 回目: 変換の規則 / スクリプトと rake の 2 人）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | **高**: rake の `valid_password?` は devise_invitable が上書きしていて、招待未承認の人には nil を返す。`password_is_email: null` になり Zod が止まる（fixtures は手書きの false だったので通っていた） | `Devise::Encryptor.compare(User, encrypted_password, email) == true` を直接呼ぶ |
| 2 | **中**: v1 の `shifts_controller#assign` は `params[:staff_id].to_i` をそのまま保存し FK も無いので `staff_id = 0` がありうる。Zod の `.positive()` が弾いて止まる | 親を指す列は整数なら受け、変換が `parent_missing` で捨てる。rake に「存在しないスタッフを指す shifts」の集計 |
| 3 | 低: `pg` 8.x の `sslmode=require` は `verify-full` の別名（警告つき）で、9 で意味が変わる | `verify-full` を明示（§6.1・`.env.example`） |
| 4 | 低: 裸の `ANALYZE` は postgres が所有しない表で WARNING を出し、全表のロックをコミットまで持つ | COMMIT の後に書いた public の表だけ `analyze` |
| 5 | 低: `profiles` とペアの UPDATE が 1 行 1 往復（Session pooler 越しで利用者数 × RTT） | リハーサルの所要時間で判断（§13-8 と同じ扱い）。遅ければ `unnest` でまとめる |
| 6 | 低: §8.1 の「切り詰めた値の件数（列ごと）」が理由別にしか無かった | `report.truncated`（`table.column` → 件数）を足した |
| 7 | 低: 管理用アカウントのメールが v1 のユーザーと重なると一意制約で全体が戻る | §9.3 の確かめることに足した |
| 8 | 低: 移行しない人の Stripe 用 CSV のメールが小文字化されていない | 揃えた |
| 9 | 低（受け入れ）: `shifts` / `events` / `shares` の日付が西暦 3 桁以下・5 桁だと Zod が止める（`required_nums` だけ捨てる規則） | v1 の画面から入ることは実質無いので止まる挙動のまま。**リハーサルで実在した（`shifts` に西暦 5 桁）ので、2026-10-13 に捨てて記録する形に直した**（§7.6・§15） |

2 回目（rake と TS のデータの契約 / 移行後の行がアプリでどう振る舞うか）:

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | 低〜中: パスワードが null の人（代理承認・空）と Google の人は、v2 のアカウント画面から新しいパスワードを設定できない（「現在のパスワード」を求める）。再設定メールの経路しか無い | 移行のコードでは直せない（GoTrue はパスワードの有無を返さない）。§8.2-8b に書き、022 の案内に入れる |
| 2 | 低: `import.ts` が COMMIT の後に report / CSV を書けないと（`--input` が書けない等）、verify の基準と Stripe の入力を失う。`analyze` の失敗で exit 1 になる | 接続前に書き込み先の `W_OK` を確かめる。`writeOutputs` を try で包み「COMMIT 済みだが書けなかった」と出す。`analyze` の失敗は警告だけ |
| 3 | 低: 22 文字のトークンでない `tenants.uuid` は id は導出されるが旧 URL の 308 が効かず、どこにも出ない | `fixed` に `legacy_url_unmatched` を記録。rake の集計にも足した |
| 4 | 低: `staff_cap` は Stripe の状態を問わず Subscription のある人に入る。同期後に有効でない人は free でロックされる（§10-5 の網だけ） | §10-5 に `report.over_limit.freeOverLimit` の `hasSubscription: true` との対応を書いた |
| 5 | 低: §11 のファイル一覧と AGENTS.md が差分に追いついていない | 直した |
| 補足 | §10-5 の実行中に Webhook → `syncCustomer()` が走る（設計どおり） | §10-5 に 1 行 |
| 6 | **中**: rake は YAML 列の読み取りが投げる例外（宣言と違う型 → `SerializationTypeMismatch`、許可外のクラス・壊れた YAML → `Psych::Exception`）を拾っておらず、1 行で全体が止まり manifest も残らない。`ts()` も Time 以外（`'infinity'`）で落ちる | `yaml_attr` で行ごとに rescue して既定値（`[]` / `{}`）にし、件数と id を manifest に出す。`safe_yaml` / `raw_json_type` も同じ。`ts()` は Time 以外を nil にして数える |
| 7 | 低: Array 列（`available_wdays` / `available_patterns`）だけ「文字列だった」集計が無い | `array_or_empty` で数える |
| 8 | 低: §5.2-7 の文字数超過（SQL の `trim()`）と TS の切り詰め（JS の `.trim()`）は空白の扱いが違う | 目安の数と注記 |
| 9 | 低: `exported_at` は rake の開始時刻で、ダンプの取得時刻ではない | rake の 2 つ目の引数 `dumped_at` を manifest に残す（§5.1） |

3 回目（全体の差分の通読。直近 2 コミットの Ruby / TS を実行して確認）: **結果を変える指摘なし。ここで収束とする。**
低い注記 4 件（`default_required_nums` の 0..99 外は黙って捨てる = v1 の画面も 99 まで / zsh の `[` / `"0"` と `0` のキーの同居 / COMMIT 済みの DB に再実行すると PK で止まる）のうち、最後だけ fixtures の README に書いた。

#### 未実施（次にやること）

- **§12-6**: Heroku のダンプを取って（2026-10-13 に取得。下の節）手元の v1 に restore し、`rails v2:export` → `npm run migrate:v1` → `verify.ts` → §8.2 の 1〜10。件数・所要時間・RSS をここに記録する。rake は本物の v1 で初めて動かすので、YAML 列（`hash_or_empty` / `raw_json_type`）の読み方で直すものが出るかもしれない（§9.2: 直すのは YAML の読み方だけ）
- **§9.3**: 本番の Supabase に対する `--rollback`（`postgres` ロールで `auth.users` に INSERT できるか・`disable trigger` できるか・Session pooler の SSL）

### 2026-10-13（§9.1-1。リハーサルのダンプ）

利用者が手元の PC で取った。既存の自動バックアップではなく、当日（§10-2）と同じ `heroku pg:backups:capture` → `download` で取り、当日の所要時間の目安を兼ねた。

| 項目 | 値 |
| --- | --- |
| Heroku | アプリ `assift` / Heroku Postgres Standard 0 / **PG 16.14** / Data Size 3.41 GB（`heroku pg:info`）。restore は Postgres 16 で行う（§9.1-2） |
| バックアップ | `b2818`（手動）。開始 2026-10-13 04:27:56 UTC（13:27:56 JST）、完了 04:28:48 UTC（13:28:48 JST）。**capture は 52 秒** |
| ダンプ | 265.49 MB。**download は 1〜2 分** |
| rake の `dumped_at` | `2026-10-13T13:27:56+09:00`（`heroku pg:backups` の Created at。§5.1 の Started と同じ値のはず） |
| 保管 | 利用者の手元の PC。FileVault（ディスク全体の暗号化）で守る（§10-8 の「暗号化して 1 か所に置く」をこれで満たす。PC の外へ写すとき（バックアップ・クラウドの同期フォルダ）はファイル自体を暗号化する）。消す日: カットオーバーのダンプを取った時点（リハーサルの役目を終えるため） |

件数（13:36 JST に `heroku pg:psql` で `count(*)`。ダンプの約 8 分後なので、その間の v1 の書き込みの分だけダンプと違う。ダンプの正確な件数は rake の `manifest.json` で取る）:

| 表 | 件数 |
| --- | ---: |
| `users` | 84,228 |
| `tenants` | 27,610 |
| `staffs` | 160,277 |
| `patterns` | 167,256 |
| `shifts` | 12,790,920 |
| `required_nums` | 2,517,661 |
| `restrictions` | 10,145 |
| `events` | 157,027 |
| `shares` | 57,978 |
| `usage_records` | 2,721 |

#### 件数から分かること（restore 以降のリハーサルで確かめる）

- `shifts` は約 1,279 万行で、§5.1 で見込んでいた「数十万〜数百万」より 1 桁多い。`required_nums` も約 252 万行ある
- `import.ts` は変換のために全行をメモリに載せる（§9.1-5）。この行数では Node の既定のヒープで足りない見込みが高いので、最初から `--max-old-space-size` を付けて RSS を測る
- 1000 行ずつの INSERT は `shifts` だけで約 1.28 万回になる。§13-8 の目安（インポート全体が 10 分を超えたら `COPY`）に掛かりやすい。手元で測り、Session pooler 越しの往復（§9.3）を足して判断する
- rake の `find_each` も `shifts` だけで約 1.28 万回のクエリになる。エクスポートの所要時間と JSONL の大きさ（`shifts.jsonl` だけで GB 単位の見込み）も記録する

#### 022 への申し送り

- Heroku Postgres のメンテナンス（DB の載せ替え）が 2026-10-17 18:00 UTC（10/18（日）03:00 JST）に予定されている（期限 11-05）。メンテナンスの時間帯は毎週 土曜 18:00〜22:00 UTC（日曜 03:00〜07:00 JST）なので、カットオーバーを重ねない
- 自動バックアップが毎日 17:00 UTC（02:00 JST）ごろに走る（約 50 秒）。当日の capture と重ねない
- 当日の §10-2 の目安: capture 約 1 分、download 1〜2 分（265 MB）
- Heroku には 2019〜2025 年の手動バックアップが 8 件残っている（`b093`〜`b2287`。個人情報を含む）。§10-8 の保管の決まりの外にあるので、Heroku を止めるときにアドオンごと消すかを決める
- 手元の Heroku CLI が 7.68.2（11.10.0 が出ている）。今回は動いた

#### 次にやること

- 手元に Postgres 16 を用意して `b2818` を restore → `rails v2:export[<out>,2026-10-13T13:27:56+09:00]` → 以降は 2026-10-11 の「未実施」の §12-6 のとおり

### 2026-10-13（§9.1-2。restore とエクスポート）

利用者が手元の Mac（メモリ 24 GB）で行った。

#### restore

| 項目 | 値 |
| --- | --- |
| Postgres | Postgres.app 2.9.6 の **PostgreSQL 16.15**（port 5433。既存の PG 15 の 5432 と同居）。Postgres.app は「all currently supported versions」の配布物を入れる（PG 18 だけの配布物で置き換えると、既存の PG 15 のサーバーが「version not installed」で起動しなくなる。データは残っていて、版を戻せば起動した） |
| コマンド | `createdb -p 5433 assift_v1_rehearsal` → `pg_restore -p 5433 -d assift_v1_rehearsal --no-owner --no-acl -j 4 <dump>` → `vacuumdb -p 5433 --analyze-only` |
| 所要 | **1 分 17 秒** |
| エラー | `errors ignored on restore: 2`。どちらも `pg_stat_statements`（Heroku の `heroku_ext` スキーマに置かれた監視用の拡張）で、v1 の表とは無関係 |
| 件数 | `users` 84,226 / `tenants` 27,609 / `staffs` 160,272 / `patterns` 167,253 / `shifts` 12,790,904 / `required_nums` 2,517,661 / `restrictions` 10,145 / `events` 157,025 / `shares` 57,978 / `usage_records` 2,721。13:36 に Heroku で数えた値（上の節）と同じか少し少ない（差は最大で `shifts` の 16 件。ダンプ後 8 分の書き込み） |

#### v1 をつなぐ

- v1 は `master`（`a8bb5ad`）。本番の最後のデプロイ（Heroku `v215`、2025-11-14）と同じコミット
- `DATABASE_URL` にユーザー名を入れる（`postgres://$(whoami)@localhost:5433/assift_v1_rehearsal`）。v1 の `config/database.yml` の development が `username: rails_user` を持っていて、URL に無いとそれが使われる
- `STRIPE_SECRET_KEY` にダミーの値を入れる（`config/initializers/stripe.rb` が起動時に `ENV.fetch` する。エクスポートは Stripe を呼ばない。本番のキーは入れない）。起動に必須の環境変数はこれだけ
- `rails_env` は `development`（manifest に残る）
- §8.2-2 のログインの確認用に 2 人を決めた: 利用者本人のアカウント（Google の人。本物のハッシュのまま、本人のパスワードで確かめる）と、Google でない人 1 人（戻した DB でだけ既知のパスワードに置き換えた）。id は利用者の手元に控える
- 戻した DB は、ダンプと同じくカットオーバーのダンプを取った時点で消す（`dropdb -p 5433 assift_v1_rehearsal`）

#### エクスポート（`rails v2:export`。照合を絞る前の rake）

開始 16:55:33（`exported_at`）、所要 **10,064 秒（2 時間 48 分）**、最大 RSS **495 MB**。各ファイルの更新時刻からの内訳:

| 段 | 所要 |
| --- | ---: |
| `users`（全員の bcrypt の照合） | **2 時間 41 分** |
| `tenants` / `staffs` / `patterns` | 32 秒 |
| `shifts`（1,279 万行） | 5 分 10 秒 |
| `required_nums` 〜 `usage_records` | 46 秒 |
| 集計 → `manifest.json` | 3 秒 |

ファイルの大きさ: `shifts.jsonl` 2.0 GB / `required_nums.jsonl` 149 MB / `staffs.jsonl` 56 MB / `patterns.jsonl` 50 MB / `users.jsonl` 46 MB / ほか合わせて約 2.4 GB。件数は 10 表とも restore した DB と一致。

manifest の要点（§5.2）:

| 集計 | 値 | 扱い |
| --- | ---: | --- |
| 未確認（すべて招待未承認） | 55,216 | 移さない（§7.1）。移すのは 29,010 人 |
| Google の人 / うち 90 日以内にログイン | 8,707 / 439 | email のアカウントとして入れる（§7.1） |
| `default_required_nums` が文字列（二重エンコード） | 142,736（Hash は 24,517） | §5.1 の想定どおり。rake がほどく |
| ペアが自分自身を指す | 390 | §7.4 |
| スタッフの YAML 列が NULL（`available_wdays` / `available_patterns` / `default_patterns`） | 567 / 596 / 27,978 | 前 2 つは 0 件の見込みだったがあった。v1 と同じく `[]` / `{}` で入る（§13-3 のまま） |
| 存在しないスタッフを指す `shifts` | **1,291,327**（約 1 割） | 捨てる（§7.6）。v1 の画面にも出ていない行 |
| `(staff_id, date)` の重複 | 3,769 組 | 新しいほうを残す（§7.6） |
| 文字数の超過（店舗名 / スタッフ名 / パターン名 / 説明 / メモ） | 3 / 24 / 127 / 247 / 0 | 切り詰める（003 §3.10）。少ないので CHECK は緩めない |
| スタッフ 0 人でデータのある店舗 | 1,845 | 準備中になる（§7.2）。022 の告知で触れるかを決める |
| `stripe_customer_id` の共有 / `max_staffs_count > 1000` / 空のパスワード / 親の id が NULL / `restrictions` の欠け / `shares.code` の重複 / 22 文字でない `tenants.uuid` | すべて 0 | — |

#### `password_is_email` の照合を絞った

全員（84,226 人）を照合した結果は **3 人**で、3 人とも店舗を持たない:

| 区分 | 人数 | 記録の形 |
| --- | ---: | --- |
| 管理者の承認（2019-04。承認機能が入った直後） | 1 | `invitation_created_at` = 承認の時刻、`invitation_sent_at` = 最初の登録のまま、`invitation_accepted_at` が同じ秒。ログインなし |
| 本人が自分でパスワードをメールにした | 2 | ふつうの登録（`invitation_sent_at` = `invitation_created_at`、数分後に本人が承認）。ログインは 0 回と 1 回 |

- 承認機能は v1 の管理画面のユーザー一覧の「招待」リンク（`Admin::UsersController#accept_invitation`。`password = email`）。利用者は機能を認識しておらず、承認の記録の形をした人は移す人の中で 4 人（3 人は店舗を作るときにパスワードを変えていた）
- 案 B（記録の形から承認された人だけを照合）は、自分でメールにした 2 人を取りこぼすのでやめた
- **案 A を採った**: 照合は「v1 でログインできた人（`confirmed_at` か `sign_in_count > 0`）のうち店舗を持たない人」（3,466 人）だけ。それ以外は照合せず false。根拠は v1 の `check_init_password!`（§7.1）と、全員を照合したこの結果（3 人とも範囲の内側）。見込みは 6〜7 分で、エクスポート全体は約 13 分
- rake が「移す人」の条件を持つことになるが、照合を省くためだけで、照合しなかった人の値はインポートで使わない（移す / 移さないの判断は TS のまま）
- manifest に照合した人数（`users.password_is_email_checked`）を出す。**rake の変更は `ruby -c` のみ**。次にエクスポートを流したときに `password_is_email_checked = 3466`・`password_is_email = 3` になることを確かめる

#### 次にやること

- 手元の v2 を最新の `main` にして `npm ci`（利用者の clone は 10/05 のままだった）→ `npx supabase start` → `npx supabase db reset` → `NODE_OPTIONS=--max-old-space-size=16384`（24 GB の Mac）で `npm run migrate:v1 -- --input ~/v1-export/20261013-1655 --allow-existing`。所要時間と RSS を記録し、§13-8（10 分を超えたら `COPY`）を判断する
- `verify.ts` → §8.2 の 1〜10
- 直した rake でエクスポートを流し直し、照合の人数と所要時間を確かめる（インポートの検証と並行してよい）

#### インポート 1 回目（2026-10-13。読み込みで停止）

`npm run migrate:v1 -- --input ~/v1-export/20261013-1655 --allow-existing` が、読み込みの 18 秒目（`shifts.jsonl` の 4,324,771 行目。そこまでの最大 RSS 1.26 GB）で止まった:
`date YYYY-MM-DD の実在する日付ではありません`（`"date":"20223-03-11"`。2023-03-08 に作られた行）。

- v1 の date 列（Postgres の `date`）は西暦 5 桁も受ける。v1 の画面からは入らないはずだが、実在した（レビュー 2 周目の #9 で「止まる挙動のまま」と受け入れていた箇所）
- 直したこと: `shifts.date` / `events.date` / `shares.start_date`・`end_date` の Zod を「文字列なら受ける」にし、変換が `isDateString()` で見て `invalid_date` で捨てて記録する（`required_nums` と同じ規則。§7.6・§7.9・§7.10）。西暦 5 桁の日付は v1 の表にも出ていない行なので、見え方は変わらない
- Vitest（移行 88 件・全体 916 件）と `npm run typecheck` が通る

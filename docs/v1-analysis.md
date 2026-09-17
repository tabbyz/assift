# assift v1（Rails）コード分析

v2（Next.js + Supabase）への作り直しに向けた、既存コードの詳細分析。
対象: `/Users/kazuma.yamashita/work/dev/assift-v1`（最終コミット 2025-11-14）

---

## 1. 概要

| 項目 | 内容 |
| --- | --- |
| サービス | アルバイトのシフト表作成・共有 SaaS。スマホファースト |
| 構成 | Ruby 3.2.8 / Rails 6.0.6 / Slim / CoffeeScript / jQuery / Bulma / Heroku / PostgreSQL |
| 認証 | Devise（database_authenticatable, confirmable, invitable, lockable, timeoutable 1日, omniauthable）+ Google OAuth2 |
| 課金 | Stripe 従量課金（metered, 月次 max 集計）。スタッフ 10 人まで無料、5 人単位で +250 円/月 |
| PDF | wicked_pdf + wkhtmltopdf 0.12.3.1（A4 横、13 行/ページ） |
| その他 | PWA（serviceworker-rails）、Beamer（お知らせ）、Google Analytics、form.run（問い合わせ）、SendGrid（管理者一斉メール）、Gehirn SMTP（Devise メール） |
| テスト | scaffold 生成の雛形のみ（実質なし） |
| 直近の変更 | 祝日マスタ更新、Stripe gem 更新、Payment Intents（3DS2）対応、インデックス追加。機能追加は 2020 年以降ほぼなし |

### 画面遷移の骨格

```
/                       LP（ログイン済なら /tenants へ）
/tenants                → 直近の店舗（cookie）へ redirect。店舗なしなら /tenants/new
/tenants/:uuid          → tutorial 完了なら shifts へ、未完了なら tutorial/intro へ
/tenants/:uuid/shifts   ★メイン画面（シフト表カレンダー）
/tenants/:uuid/settings/{general,staffs,patterns,staff_groups,restrictions}
/tenants/:uuid/tutorial/{intro,pattern,staff,complete}
/share/:code            公開シフト表（認証不要）
/charge, /card, /billing  Stripe 関連（Phase 1 スコープ外）
/<ADMIN_PATH>/...       管理画面（@assift.com メールのユーザーのみ）
```

---

## 2. データモデル

### 2.1 テーブル一覧（schema.rb より）

```
users ─1:N─ tenants ─1:N─ staffs ─N:1─ staff_groups
                     ├─1:N─ patterns ─1:N─ shifts ─N:1─ staffs
                     │              └─1:N─ required_nums
                     ├─1:N─ restrictions（pattern1/pattern2 → patterns）
                     ├─1:N─ events
                     └─1:N─ shares
users ─1:N─ usage_records, invoices（Stripe 関連）
```

**注意: `shifts` に `tenant_id` がない。** `Tenant has_many :shifts, through: :patterns` で辿っている。同様に `required_nums` も pattern 経由。

### 2.2 各テーブル詳細

#### users（Devise 標準 + 拡張）

| 列 | 用途 |
| --- | --- |
| email, encrypted_password（bcrypt） | Devise。Supabase Auth も bcrypt なので `auth.users.encrypted_password` に直接移行可能 |
| confirmation_*, invitation_*（devise_invitable） | サインアップは「メール入力 → 招待メール → パスワード設定」フロー |
| provider, uid, token, refresh_token, expires_at | Google OAuth（現在ログイン画面に「Google ログイン不可」の注意書きあり = 壊れている） |
| stripe_customer_id, stripe_subscription_id, trial_end | Stripe |
| staffs_count | counter_culture による全店舗合計の在籍スタッフ数（キャッシュ） |
| max_staffs_count（default 10） | 契約プランの上限人数 |
| failed_attempts, locked_at, sign_in_count, *_sign_in_* | Devise trackable / lockable |

- `admin?` は `email.end_with?("@assift.com")` で判定（ハードコード）。

#### tenants（店舗）

| 列 | 用途 |
| --- | --- |
| name（≤20 文字） | 店舗名 |
| user_id | オーナー。**1 店舗 = 1 ユーザー**（共同管理の概念なし） |
| uuid（urlsafe_base64 22 文字, unique） | URL に使用（`/tenants/:uuid`） |
| staffs_count | counter cache（在籍のみ） |
| start_of_week（0=日〜6=土） | week / two_week 表示の週の始まり |
| shift_cycle enum | month(0) / half_month(1) / two_week(2) / week(3) |

#### staffs

| 列 | 用途 |
| --- | --- |
| name（≤10 文字）, kana | kana は UI 上ほぼ未使用 |
| tenant_id, group_id（FK なし） | group_id → staff_groups |
| position（acts_as_list, scope tenant） | 表示順 |
| disabled | 退職フラグ。退職者はカウント・表示対象外 |
| max_work_week（0..7, default 5） | 自動アサイン専用 |
| available_wdays: **text（YAML Array of int）** | 勤務可能曜日。カレンダーの「担当可/不可」表示に使用 |
| available_patterns: **text（YAML Array of int）** | 選択可能な勤務パターン ID。ポップオーバーのボタン絞り込みに使用 |
| default_patterns: **text（YAML Hash）** | `{"0".."6", "holiday"} → pattern_id`。「デフォルト勤務パターンをセット」で使用 |

- パターン作成時に全在籍スタッフの available_patterns へ自動追加、削除時に自動除去（`Pattern` の after_create / after_destroy）。
- 新規スタッフはフォーム側で全曜日・全パターンがチェック済み。

#### staff_groups

| 列 | 用途 |
| --- | --- |
| name（≤10, tenant 内 unique）, position | 表示グループ（正社員/アルバイト等） |

- **UI 上は管理者（@assift.com）または development 環境のみ表示**（`settings/staffs/_form` 内の条件分岐）。カレンダー・PDF・共有画面はグループ描画に対応済み。実質的に「隠し機能」。
- グループ削除時は所属スタッフの group_id は残る（dependent なし）。`ordered_shift_groups` は `includes(:group)` で nil グループを「所属なし」として扱う。

#### patterns（勤務パターン）

| 列 | 用途 |
| --- | --- |
| name（≤6）, description（≤10） | 表示名・補足（表下部に凡例表示） |
| color_hex | Material 20 色から選択。nil は白扱い |
| kind enum | workday(0) / dayoff(1)。dayoff は勤務日数カウント・必要人数の対象外 |
| pair_pattern_id（FK なし） | 翌日に自動でセットするパターン（夜勤→明け） |
| position（acts_as_list） | 表示順 |
| default_required_nums: **json 列 + `serialize Hash`** | `{"0".."6","holiday"} → num`。**Rails 側で YAML 二重エンコードされている可能性が高い**（`application.rb` の `yaml_column_permitted_classes` に HashWithIndifferentAccess が追加されている＝params の Hash がそのまま YAML 化された痕跡）。移行前に実データを必ず確認 |

#### shifts（アサイン）

| 列 | 用途 |
| --- | --- |
| date, pattern_id（FK あり）, staff_id（FK なし, nullable） | staff_id が null なのは自動アサインの一時 Task 用途 |
| fixed（default false） | 下書き(false) / 確定(true)。旧名 locked |
| assist_token | 自動アサイン 1 回分の識別子（ロールバック用） |

- **(staff_id, date) のユニーク制約は DB になし**（モデル validation のみ。コミット「shiftが重複する問題に暫定対応」あり）。
- tenant_id がないため tenant 境界は pattern 経由。RLS 設計上は tenant_id を持たせるべき。

#### required_nums（必要人数）

| 列 | 用途 |
| --- | --- |
| date, pattern_id, num | (date, pattern_id) unique。workday パターンのみ対象 |

#### restrictions（自動アサイン制約）

| 列 | 用途 |
| --- | --- |
| kind（string） | deny_pattern_pair / max_work_week / max_work_consecutive / sat_or_sun_dayoff |
| days, pattern1_id, pattern2_id（FK なし） | 種別ごとに使う列が異なる |
| position | 並び順（処理には影響しない） |

- **自動アサイン専用**。Phase 1 では設定 UI ごと保留可能（データは移行）。

#### events（日付メモ）

| 列 | 用途 |
| --- | --- |
| tenant_id, date, note（≤12） | 1 日 1 メモ。unique index なし（`find_or_initialize_by`）。note 空で保存 = 削除 |

#### shares（URL 共有）

| 列 | 用途 |
| --- | --- |
| tenant_id, start_date, end_date（最大 31 日）, code | code は 8 文字英数（0O1lIij を除外）。`end_date + 6 日` を過ぎると 404 |

#### usage_records / invoices（Stripe 関連）

- usage_records はプラン変更履歴（assift 独自のログ）。v2 では `plan_change_logs` として移行する
- invoices は書き込みコードが存在せず本番 0 件。移行しない

---

## 3. 機能一覧と Phase 1 スコープ

### 3.1 認証・オンボーディング

| 機能 | v1 実装 | Phase 1 |
| --- | --- | --- |
| サインアップ | LP でメール入力 → `User.invite!` → 招待メールのリンクでパスワード設定 → 利用規約同意。yahoo.com 入力時の確認画面、再送信時の迷惑メール案内など | ○（Supabase Auth のメール認証に置換） |
| ログイン | メール+パスワード / Google OAuth（現在壊れている） | ○ |
| パスワード再設定・変更・アカウント削除 | Devise | ○ |
| 初期パスワード強制変更 | 管理者が代理承認したユーザー（password = email）向け | ×（不要） |
| チュートリアル | intro → 勤務パターン登録 → スタッフ登録 → 完了。`tutorial_completed?` = パターン 1 件以上 && 在籍スタッフ 1 件以上 | ○ |

### 3.2 店舗（tenant）

| 機能 | Phase 1 |
| --- | --- |
| 作成・編集（名前, shift_cycle, start_of_week）・削除 | ○ |
| 複数店舗切替（navbar ドロップダウン、直近店舗を cookie 記憶） | ○ |

### 3.3 設定

| 機能 | Phase 1 |
| --- | --- |
| スタッフ CRUD、並べ替え（上下ボタン）、退職/復帰、在籍/退職タブ | ○ |
| 勤務パターン CRUD、並べ替え、カラーピッカー、ペアパターン、デフォルト必要人数（曜日別+祝日） | ○ |
| スタッフグループ CRUD（モーダル、管理者限定） | △（正式公開するか判断） |
| 自動アサイン制約 CRUD | ×（自動アサインと一緒に Phase 2） |
| スタッフ上限（プラン）による追加ブロック、lock panel | △（無料上限 10 人を Phase 1 で維持するか判断。維持するなら `max_staffs_count` / `staffs_count` は必要） |

### 3.4 シフト表（メイン画面）

| 機能 | v1 の挙動 | Phase 1 |
| --- | --- | --- |
| 期間表示 | shift_cycle と start_date から `Calendar.date_range` で算出（後述） | ○ |
| 前/次期間 | week ±7, two_week ±14, half_month −13/+16（月前半/後半の切替）, month ±1 month | ○ |
| 開始日指定 | ドロップダウン内の date input | ○ |
| セルクリックでアサイン | tippy ポップオーバー: 下書き/確定ラジオ + パターンボタン（available_patterns で絞り込み、先頭は「空」ボタン）。Ajax で 1 行差し替え | ○ |
| ペアパターン | アサイン時に翌日へ pair を **上書き**セット（`find_or_initialize_by` → pattern_id 上書き）。解除時は翌日のシフトを **パターン問わず**削除 | ○（挙動改善の余地あり） |
| セル表示 | 担当可（whitesmoke + "+"）/ 担当不可（白）/ 下書き（白背景 + 上辺 3px 色）/ 確定（塗り + 白文字 + 太字） | ○ |
| 必要人数行 | 日ごとに required と assigned（workday のみ）を比較し ✓ / ! 表示。クリックで日別必要人数モーダル（パターン別 input, デフォルト人数セット） | ○ |
| デフォルト人数を一括セット | 表示期間の required_nums を削除し default_required_nums から再生成（祝日は holiday キー優先） | ○ |
| イベントメモ | ヘッダ行、日付ごとにモーダル編集 | ○ |
| 一括操作（全体/スタッフ単位） | すべて確定 / すべて下書き / 下書きクリア（確定は残す） | ○ |
| デフォルト勤務パターンをセット | staff.default_patterns から未アサインの日だけ埋める | ○ |
| シフトコピー | from 期間（≤31 日）→ to 開始日。パターン絞り込み。既存があるセルは上書きしない。前回条件を cookie 保存 | ○ |
| アサイン数集計 | モーダル。スタッフ×（勤務日 / 休み / 各パターン）件数。「休み」= 日数 − 勤務日数 | ○ |
| PDF | wkhtmltopdf、A4 横、13 行/ページで改ページ、イベント行、凡例 | ○（実装方式は要検討。後述） |
| CSV | 既定 CP932（Excel 向け）、`?encoding=utf8` で BOM 付き UTF-8。ヘッダ=日付、2 行目=イベント、以降スタッフ×パターン名 | ○ |
| URL 共有 | モーダルで期間固定の共有 URL 発行、一覧（共有中/期限切れ）、解除。公開ページはリアルタイム反映（DB 直読） | ○ |
| 自動アサイン | `AssistModule#assist!`（後述） | × |

### 3.5 その他

| 機能 | Phase 1 |
| --- | --- |
| LP、利用規約、プライバシー、特商法、アップデート情報（ActiveHash 固定データ） | ○（静的ページ） |
| 管理画面（グラフ、ユーザー/店舗/共有/…一覧、招待の代理承認、SendGrid 一斉メール、メンテナンスモード） | ×（Phase 2 で最小限） |
| PWA（manifest, service worker, iOS 起動画像） | △（manifest 程度は容易） |
| IE ブロック | × |
| Beamer / GA | △ |

---

## 4. 主要ロジック詳細

### 4.1 表示期間の計算（`Calendar.date_range`）

```ruby
week:       start = date.beginning_of_week(start_of_week); end = start + 6
two_week:   start = date.beginning_of_week(start_of_week); end = start + 13
half_month: date.day <= 15 ? [1日, 15日] : [16日, 月末]
month:      start = date（1 日固定ではない）; end = date.next_month.prev_day
```

- `current_start_date` は `params[:start_date]` → `cookies[:current_start_date]` → `Date.current.beginning_of_month` の優先順で決まり、cookie に 1 か月保存。
- `view_type` は現在は `tenant.shift_cycle` を正とする（cookie 版からの移行コードが残存）。

### 4.2 祝日判定

`business_time` gem の holidays 設定（`config/business_time.yml`）に 2017〜2026 年分をハードコード。`Date#holiday?` パッチで参照。v2 では `@holiday-jp/holiday_jp` 等のライブラリまたは DB テーブルへ。

### 4.3 アサイン（`ShiftsController#assign`）

1. (staff, date) の既存 shift を取得 → `delete_pair`（翌日を削除）→ destroy
2. pattern_id ≠ 0 なら新規作成（fixed 引き継ぎ）→ `assign_pair`（翌日を pair で上書き、fixed も同じ）
3. 対象スタッフ行の HTML を返して置換、JS 側で必要人数チャージ数を再計算

### 4.4 確定 / 下書き

- `fixed` はスタイルの違いのみ（確定は塗り、下書きは枠線）。
- 「下書きクリア」は `fixed: false` のみ削除。自動アサインは既存シフトを避けて空きに入れる。

### 4.5 自動アサイン（Phase 2 参考）

`AssistModule#assist!`:
1. 期間を週境界に拡張して `Calendar` 構築（メモリ上の `SearchHash` に全 shift をロード）
2. 日×workday パターンごとに `required − assigned` 件の Task 生成
3. Task を「アサイン可能スタッフ数 × max_work_week/7 の合計 × rand(0.8..1.2)」でスコアリングし昇順（難しい順）
4. 各 Task で、アサイン数が少ないスタッフから順に `assignable_staffs` 判定: 当日空き / 翌日空き（pair 時）/ 曜日 / パターン / 週上限 / 制約 4 種
5. `assist_token` を付けて保存。ロールバックは token で一括削除
- 純グリーディ。バックトラックなし。v2 では制約ソルバ等での作り直しが前提。

### 4.6 プラン上限

- `users.staffs_count`（全店舗の在籍合計）と `max_staffs_count` を比較。
- `maxed_out?`（>=）でスタッフ追加・復帰をブロック、`over_limit?`（>）でシフト表に lock panel。
- 課金は Stripe metered（`create_usage_record` を rake で日次送信）。

### 4.7 認可

- すべて `current_user.tenants.find_by(uuid:)` で tenant を解決し、tenant 経由でリソースを取得（IDOR 対策は概ね OK）。
- ただし `Shift.where(assist_token:).destroy_all`（AssistController）は tenant を絞っていない。

---

## 5. クライアント状態（cookie / params）

| キー | 内容 |
| --- | --- |
| `current_tenant` | 直近に開いた店舗 uuid（7 日） |
| `current_start_date` | シフト表の開始日（1 か月） |
| `view_type` | 旧。現在は DB（tenant.shift_cycle）に統合済み |
| `copy_from_start/from_end/to_start/pattern_ids` | シフトコピーの前回条件（1 か月） |
| `gon.*` | dates, workdayPatternIds, requiredNums, assignedCounts, availablePatterns（クライアント側の ✓/! 計算用） |

v2 では `start_date` は URL（nuqs）、直近店舗は cookie またはユーザー設定、コピー条件は localStorage が自然。

---

## 6. 技術的負債・バグ・注意点

### スキーマ
- `shifts` / `required_nums` に `tenant_id` がない（tenant 境界が pattern 経由）→ RLS では致命的なので追加必須
- FK 欠落: `shifts.staff_id`, `staffs.group_id`, `patterns.pair_pattern_id`, `restrictions.pattern1_id/2_id`
- `shifts(staff_id, date)` の unique がない（重複データが存在する可能性。移行時に検出・解消）
- `events(tenant_id, date)` の unique がない
- YAML シリアライズ列: `staffs.available_wdays / available_patterns / default_patterns`。`patterns.default_required_nums` は json 列だが二重エンコードの疑い
- `restrictions.kind` が string（enum ではない）
- `users.staffs_count` / `tenants.staffs_count` はキャッシュ列（counter_culture）。整合性が崩れた場合の rake タスクあり

### ロジック
- ペアパターンの解除で翌日のシフトをパターン問わず削除する
- ペアパターンのセットで翌日を無条件に上書きする
- `Share` の enabled 判定が `Date.current`（サーバー TZ = Tokyo）依存
- 半月表示の前後移動が −13 / +16 の固定値（16 日始まりの期間から −13 すると前半の 3 日目になる等、境界が曖昧。`date_range` 側で吸収している）
- `Calendar#initialize` が毎リクエスト全 shift をメモリロード（規模的には問題なし）
- 自動アサイン中に `shift.update` を Task ごとに発行（N 回の UPDATE）

### 運用
- 祝日ハードコード（毎年手動更新）
- 管理者判定がメールドメイン固定
- Google OAuth が壊れている（omniauth 1.9 / provider_ignores_state: true）
- テストが実質ゼロ
- Heroku + wkhtmltopdf バイナリ依存

---

## 7. v2 への示唆

### 7.1 スキーマ改善案（移行可能な範囲）

| v1 | v2 案 |
| --- | --- |
| integer serial PK | uuid PK。移行分は v1 の ID から uuid v5 で決定的に導出（対応表・`legacy_id` 列なし） |
| `tenants.uuid`（22 文字 base64） | `uuidv5('tenants:' + uuid, NS)` を PK にする。旧 URL は同じ式で解決してリダイレクト |
| `users` | `auth.users` + `public.profiles`（max_staffs_count, stripe_*, trial_end, is_admin 等）。bcrypt ハッシュはそのまま移行可 |
| `shifts` | `tenant_id` 追加、`staff_id NOT NULL` + FK、`UNIQUE(staff_id, date)` |
| `required_nums` | `tenant_id` 追加、`UNIQUE(tenant_id, date, pattern_id)` |
| `events` | `UNIQUE(tenant_id, date)` |
| `staffs.available_wdays` | `smallint[]` |
| `staffs.available_patterns` | `uuid[]` または中間テーブル `staff_patterns(staff_id, pattern_id)` |
| `staffs.default_patterns` | `jsonb`（`{"0".."6","holiday": pattern_uuid}`）または `staff_default_patterns(staff_id, day_key, pattern_id)` |
| `patterns.default_required_nums` | `jsonb` |
| `patterns.kind`, `tenants.shift_cycle`, `restrictions.kind` | Postgres enum または text + CHECK |
| `users.staffs_count`, `tenants.staffs_count` | トリガで維持、または集計ビュー |
| `shares.code` | そのまま保持（有効な共有 URL を壊さない） |

### 7.2 データ移行で必ず確認すること

1. `patterns.default_required_nums` の実データ形式（JSON か YAML 文字列か、HashWithIndifferentAccess タグ付きか）
2. `staffs.*` の YAML 列のパース（`--- \n- 0\n- 1` 形式）
3. `shifts` の (staff_id, date) 重複と `staff_id IS NULL` の孤児レコード
4. `staffs.group_id` が存在しない staff_groups を指していないか
5. `patterns.pair_pattern_id` の自己参照・他 tenant 参照がないか
6. Devise 未確認ユーザー（`confirmed_at IS NULL` かつ `invitation_accepted_at IS NULL`）の扱い
7. Google OAuth ユーザー（`provider = 'google_oauth2'`）の `auth.identities` への移行

### 7.3 Phase 1 の決定事項（2026-09-17 確定）

| 論点 | 決定 |
| --- | --- |
| PDF の実装方式 | `@react-pdf/renderer`（Route Handler でサーバー生成、Noto Sans JP 埋め込み） |
| スタッフ上限（10 人無料） | Phase 1 では判定しない。サブスクリプション管理機能を追加する際に実装する |
| スタッフグループ | 機能廃止（`staff_groups` / `staffs.group_id` は移行しない） |
| 自動アサイン制約 | 設定 UI（CRUD）は Phase 1 で実装。制約を使う割り当てエンジンは別スコープ |
| 既存 URL 互換 | 保つ。v2 は uuid ベースの新 URL を正とし、旧 `tenants.uuid` は uuid v5 の導出元として同じ式で解決し 301 する（`legacy_slug` 列は持たない）。`/share/:code` は同一パス・同一コードで維持 |
| CSV の文字コード | v1 と同じ（既定 CP932、`utf8` 指定で BOM 付き UTF-8）。`iconv-lite` で生成 |
| 共有ページの反映 | v1 と同じくリクエスト時に DB を読む。Realtime は使わない |

詳細な設計は `docs/plans/001-phase1-architecture/README.md` を参照。

### 7.4 v1 のドメイン定数（v2 でも維持）

| 定数 | 値 |
| --- | --- |
| Tenant.NAME_MAX_LENGTH | 20 |
| Staff.NAME_MAX_LENGTH | 10 |
| StaffGroup.NAME_MAX_LENGTH | 10 |
| Pattern.NAME_MAX_LENGTH / DESCRIPTION_MAX_LENGTH | 6 / 10 |
| Event.NOTE_MAX_LENGTH | 12 |
| Share.DATE_LIMIT | 6 日（end_date 後の猶予） |
| 共有・コピーの最大期間 | 31 日 |
| Plan.MAX_STAFFS_COUNT_FOR_FREE / UNIT_PRICE / UNIT_STEP / TRIAL_MONTH | 10 / 50 円 / 5 人 / 2 か月 |
| Pattern.COLOR_HEXS | Material 20 色（White 〜 Black） |
| 曜日キー | `"0"`(日)〜`"6"`(土) + `"holiday"` |

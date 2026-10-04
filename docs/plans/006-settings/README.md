# 006: 設定（スタッフ・勤務パターン・自動アサイン制約）

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §4.1 / §4.6）のマイルストーン 006。
設定画面のうち 005 で店舗情報（general）だけ作ってあるものに、スタッフ / 勤務パターン / 自動アサイン制約の
一覧・登録・編集・削除・並べ替え、スタッフの退職 / 復帰を足す。005 の「名前だけ」のフォームと Action を
同じファイルで育て、チュートリアルもそのまま新しいフォームを使う（v1 と同じ構造）。

---

## 1. 目的と完了条件

### 目的

- 007（シフト表）が必要とするマスタをすべて画面から作れるようにする: 勤務パターンの色・種別・ペア・デフォルト必要人数、
  スタッフの勤務曜日・選択可能パターン・デフォルト勤務パターン・週上限、退職 / 復帰
- 自動アサイン制約の CRUD（エンジンは Phase 2。001 §7.3 の決定どおり **設定 UI だけ**入れる）
- 並べ替え（v1 の上下ボタン）を 3 テーブル共通の仕組みで実装する
- `src/lib/tenants/navigation.ts` の `pending` を外し、ヘッダー・設定ナビの 3 リンクを着地させる

### 完了条件

- `settings/patterns`: 一覧（種別・色・名前・上下・編集）→ 追加 → 全項目を入れて登録 → 一覧に戻る。編集で更新・削除できる。
  削除の確認モーダルに「シフト・必要人数・制約も消える」旨が出る。ペアに使われていたパターンを消すと相手の `pair_pattern_id` が null になる
- `settings/staffs`: 在籍 / 退職タブ。追加（全曜日・全パターンにチェック済み）→ 編集で曜日・デフォルト・週上限・選択可能パターンを変えて保存
  → `staff_patterns` / `staff_default_patterns` が入力どおりになる。退職 → 退職タブに移り、在籍タブの人数が減る。復帰 → 戻る。削除できる
- `settings/restrictions`: 一覧（説明文 + 種別）→ 追加 → 種別を 4 枚のカードから選ぶ → 種別ごとのフォーム → 登録。編集・削除できる
- 上下ボタンで並べ替えると即座に並びが変わり、リロードしても保たれる。1 件のときはボタンが出ない
- チュートリアルの pattern / staff ステップがフルのフォームで動き、「続けて登録できます」の挙動（入力クリア）が 005 のまま
- 他店舗の id で `settings/staffs/<id>` などを開くと 404。他店舗の id を Action に渡すと「見つかりません」で失敗し、行は変わらない
- スマホ幅（390px）で一覧・フォームが崩れない（必要人数の 8 列テーブルは横スクロール）
- `npm run format:check` / `lint` / `typecheck` / `test` / `build` が通る。`npx supabase test db` に並べ替え RPC のテナント境界テストが追加されて PASS

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| v1 の画面構成 | 一覧 (`index`) / 登録 (`new`) / 編集 (`edit`) の 3 画面 + `sort`（`move_higher` / `move_lower` の PATCH）。スタッフは在籍 (`index`) / 退職 (`disabled`) の 2 一覧。制約は `select_kind`（種別選択）→ `new?kind=` |
| v1 の登録後の遷移 | 設定画面からの登録は一覧へ戻る（「登録しました」）、更新は編集画面に留まる（「更新しました」）。チュートリアルからの登録は同じ画面に戻り入力を空にする（「続けて登録できます。」） |
| v1 の副作用 | パターン作成 → 在籍スタッフ全員の `available_patterns` に追加（005 で `createPattern` に移植済み）。パターン削除 → shifts / required_nums / restrictions を destroy、スタッフの `available_patterns` から除去、`parents.pair_pattern_id` を null。v2 では **すべて FK の cascade / set null** で DB が行う（003 のスキーマ） |
| v1 の制約種別 | `deny_pattern_pair`（pattern1 の翌日は pattern2 にしない）/ `max_work_week`（pattern1 は 1 週間に days 日まで、1..7）/ `max_work_consecutive`（pattern1 または勤務日は連続で days 日まで、1..7、pattern1 は任意）/ `sat_or_sun_dayoff`（設定項目なし）。フォームの選択肢は **workday のパターンだけ**。`_max_work_month` の view は残骸で `KINDS` に無い → 入れない |
| v1 の制約の並び | 一覧は `position` 順。「処理結果には影響しません」と注記されていた。同じ注記を出す |
| v1 のフォーム項目 | パターン: 名前(6) / 説明(10) / 色（20 色のスウォッチ）/ 種別（出勤日・休み）/ デフォルト必要人数（workday のみ。日〜土 + 祝、0..99）/ ペア（未指定 or 既存パターン）。スタッフ: 名前(10) / 勤務できる曜日（日〜土）/ デフォルトの勤務パターン（日〜土 + 祝 → パターン or 指定なし）/ 週の最大勤務日数（0..7）/ 選択可能な勤務パターン |
| DB | `staff_patterns` PK `(staff_id, pattern_id)`、`staff_default_patterns` PK `(staff_id, day_key)`。どちらも `(pattern_id, tenant_id)` の複合 FK があるので、**他店舗のパターン id を混ぜると 23503 で落ちる**（アプリ側で店舗一致を検査しなくても越境はしない） |
| `position` | 一意制約なし。`nextPosition()` の採番は非アトミックで重複しうる（005 §3.4）。並べ替えは「隣と swap」ではなく全件を採番し直す形にする（3.3） |
| 生成型 | `Constants.public.Enums.restriction_kind` / `pattern_kind` が `as const` 配列で出ている → `z.enum()` に渡せる。`patterns.default_required_nums` は `Json` |
| Mantine 9.6 | `ColorSwatch` `CheckIcon` `Checkbox`（`Checkbox.Group`）`NumberInput` `SegmentedControl` `Tabs` `ActionIcon` `Table` `Badge` `Breadcrumbs` `Card` を `components/` に確認 |
| nuqs 2 | `parseAsStringLiteral([...])` で enum の URL 状態を作れる。既定 shallow |
| PostgREST の埋め込み | 複合 FK でも解決できることを実測（seed のセッションで `staffs?select=*,staff_patterns(pattern_id),staff_default_patterns(day_key,pattern_id)` と `restrictions?select=*,pattern1:patterns!restrictions_pattern1_id_tenant_id_fkey(name)` が返る）。`getStaffWithRelations` は 1 クエリでよい |
| `public` の関数の既定権限 | `ALTER DEFAULT PRIVILEGES` で **anon / authenticated / service_role に EXECUTE** が付く。`anon` は `unmanaged/restrict_anon_grants.sql` の `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon` が migration 末尾で外す（sync 後の追記を忘れると anon から RPC を叩ける）。pgTAP で anon の実行拒否を固定する |
| Next 16 の Server Action | 「id だけ受け取り、所有は session + DB で確認する」（`server-actions.md` Security）。v2 は RLS + `.eq('tenant_id')` + `.select('id').maybeSingle()` の 0 行判定で満たす（005 の `updateTenant` と同型） |
| `revalidatePath(path, 'layout')` | その layout 配下の全 page を無効化する。設定の書き込みはシフト表にも影響するので 005 と同じく `/tenants/<id>` を layout ごと |

---

## 3. 事前に確認したい決定

### 3.1 画面は v1 と同じ「一覧 / 登録 / 編集」の 3 ページ。モーダルにしない

フォームが大きい（スタッフはパターン数 × チェック + 8 行のデフォルト）ので、一覧の上にモーダルで開くと窮屈になる。
v1 と同じ URL 構成にしておくと旧 URL（`/tenants/:uuid/settings/staffs/:id/edit`）も近い。

```
settings/staffs                 在籍 / 退職タブの一覧（?tab=retired）
settings/staffs/new             登録
settings/staffs/[staffId]       編集（v1 の /edit は付けない）
settings/patterns  /new  /[patternId]
settings/restrictions  /new?kind=  /[restrictionId]
```

### 3.2 在籍 / 退職タブは nuqs の `?tab=`。両方の一覧を Server で読む

v1 は `/staffs/disabled` の別 URL。v2 では同じ page で `tab: parseAsStringLiteral(['active', 'retired']).withDefault('active')`。
page は在籍・退職の両方を読んで Client に渡し、タブ切替は **shallow**（再フェッチなし）。退職者は多くても数十件で、2 本目のクエリは軽い。
URL に残すので「退職タブを開いたまま編集 → 戻る」で元のタブに戻れる。

### 3.3 並べ替えは上下ボタン + RPC `public.reorder_positions` で全件を採番し直す（スキーマ変更あり）

v1 の `move_higher` / `move_lower`（acts_as_list の隣との swap）は、`position` が重複・欠番していると「押しても動かない」ことがある
（v1 でも退職者が position 列に混ざるため起きていた）。v2 では:

- Client: 表示中の id 配列を `moveItem(ids, index, ±1)`（純関数）で並べ替え、`reorderXxx({ tenantId, ids })` を呼ぶ。`useOptimistic` で即時反映する。失敗しても transition が終われば Server の props（変わっていない並び）に自動で戻るので、通知だけ出す
- Server Action: Zod（guid の配列、重複なし、1..200 件）→ `requireUser()` → `supabase.rpc('reorder_positions', { p_table, p_tenant_id, p_ids })`
- DB: `public.reorder_positions(p_table text, p_tenant_id uuid, p_ids uuid[])`。**security invoker**（RLS がそのまま効く）。
  `p_table` を `staffs / patterns / restrictions` のホワイトリストで検査し、`unnest(p_ids) with ordinality` で `position = ord - 1` を 1 文の UPDATE で書く。
  更新行数が `array_length(p_ids)` と違えば `raise exception`（他店舗の id が混ざった・別タブで消された → 何も変えずに失敗）

1 トランザクション・1 往復で、position の重複・欠番も直る。スタッフは在籍者だけを渡すので退職者の position は触らない
（復帰したときに在籍者の間に入ることがあるが、一覧で上下すれば直る。v1 も同じ）。

代替は「隣と swap する 2 回の UPDATE」。RPC を足さずに済むが、重複 position に弱く非トランザクション。採らない。

スキーマ変更なので 003 の手順どおり `migrations/` を空にして `init_schema` を作り直す（013 の初回 push 前）。
関数は `supabase/schemas/public/functions.sql` に置く（`private` ではなく `public`。PostgREST の `rpc()` で呼ぶため）。
pgTAP に「A が自分の並びを変えられる」「他テナントの id は例外」「自テナント id に他テナント id を混ぜても例外でロールバックされる」「重複 id は例外」「ホワイトリスト外は例外」「anon は実行できない」を足す（§10.11 / §10.13 で強化）。

### 3.4 スタッフ・パターンの保存は PostgREST の複数呼び出しのまま（保存用の RPC は作らない）

005 §3.4 の申し送り（「006 で RPC へ寄せるか判断」）への回答。

- `createPattern`: 親 INSERT → 在籍スタッフ全員に `staff_patterns` INSERT（005 のまま）
- `createStaff`: 親 INSERT → 全パターンに `staff_patterns` INSERT → `staff_default_patterns` INSERT（入力があれば）
- `updateStaff`: 親 UPDATE → `staff_patterns` は **差分**（消えた分を DELETE、増えた分を INSERT）→ `staff_default_patterns` は
  upsert（`onConflict: 'staff_id,day_key'`）+ 指定なしになったキーを DELETE

途中で失敗しても親は正しく、中間テーブルが一部古いだけで、同じフォームをもう一度保存すれば直る。
RPC にすると Zod で検証した値を jsonb で渡して SQL 側でもう一度ばらすことになり、型の二重管理になる。
並べ替え（3.3）は「複数行を 1 文で」という要件があるので RPC、保存は要件が無いので素の呼び出し、で線を引く。

### 3.5 チュートリアルはフルのフォームを使う（v1 と同じ）。フォームは `mode` と登録後の挙動を props で分ける

v1 のチュートリアルは設定と同じ `_form` を埋め込んでいた。005 の名前だけのフォームに項目を足すと、そのままチュートリアルにも出る。
新規店舗ではパターンが 0 件なので、スタッフフォームの「選択可能な勤務パターン」「デフォルト」はチュートリアル時点で短い。

`PatternForm` / `StaffForm` の props:

| prop | 内容 |
| --- | --- |
| `tenantId` | |
| `patterns` | ペア / デフォルト / 選択可能の選択肢（Server の page が `listPatterns` で読んで渡す） |
| `initial?` | 編集時の初期値（無ければ登録） |
| `afterCreate` | `'reset'`（チュートリアル: 入力を空にして留まる）/ `'list'`（設定: 一覧へ `router.push`） |

編集画面の「退職 / 削除」パネルはフォームの外（`StaffEditClient` / `PatternEditClient`）に置き、フォーム本体は登録と共有する。

### 3.6 削除の確認は cascade の範囲を明記する

v1 の文言「削除すると、この○○に関連するすべてのデータが削除されます。この操作は元には戻せません。」を使い、
パターンには「このパターンのシフト・必要人数・自動アサイン制約も削除されます」、スタッフには「このスタッフのシフトも削除されます」を足す。
退職（`retired_at = now()`）は取り消せるので確認モーダルなし（v1 も無し）。復帰も同様。

### 3.7 制約は種別ごとの Zod discriminated union。`?kind=` は nuqs

`restrictions/new/searchParams.ts` に `kind: parseAsStringLiteral(RESTRICTION_KINDS)`（既定なし）。
`kind` が無ければ 4 枚のカード（v1 `select_kind` の文言）、あればその種別のフォーム。

| kind | 入力 | 保存 |
| --- | --- | --- |
| `deny_pattern_pair` | pattern1（必須）/ pattern2（必須） | `days = null` |
| `max_work_week` | pattern1（必須）/ days 1..7（既定 5） | |
| `max_work_consecutive` | pattern1（任意。無ければ「勤務日」）/ days 1..7（既定 5） | |
| `sat_or_sun_dayoff` | なし | `days = null`, pattern = null |

選択肢は workday のパターンだけ（v1 と同じ）。ただし**編集画面では、その欄がすでに参照している id は
`kind` が変わっても候補に残す**（`restrictionPatternOptions()`。残さないと保存できなくなる。§10.7 の 1）。
欄ごとに作ること（まとめると片方の休みパターンをもう片方でも選べる。§10.11 の 4）。一覧の説明文は `describeRestriction(restriction, patternsById)` の純関数で生成し Vitest で固定する
（例: 「遅番 の翌日は 早番 にはしない」「夜勤 は1週間に 1日 まで」「勤務日は連続で 5日 まで」「土日のどちらかは必ず休みにする」）。
パターンが消えて FK cascade で制約も消えるので、名前が解決できないケースは起きないが、念のため `?` で表示する。
出勤日のパターンが 0 件のとき、`sat_or_sun_dayoff` 以外のカードは disabled にして「出勤日の勤務パターンを先に登録してください」を出す（v1 は空の select を出していた）。

### 3.8 ペアパターンの選択肢から自分自身を外す

v1 は編集時に全パターン（自分を含む）を選べたが、登録時には自分の id が無いので選べない。v2 は登録・編集とも自分以外にして揃える。
「夜勤の翌日も夜勤」はペアではなく連勤なので、業務上も要らない。

### 3.9 `default_required_nums` はアプリ層の型で wrap する

生成型は `Json`。`DAY_KEYS = ['0'..'6', 'holiday']` / `DayKey` は `lib/calendar/weekdays.ts`（スタッフのデフォルトと共有）。`src/lib/patterns/requiredNums.ts` に `RequiredNumsByDay = Partial<Record<DayKey, number>>`、
`parseRequiredNums(json): RequiredNumsByDay`（Zod で緩く読み、壊れていれば `{}`）を置く。007 の「デフォルト人数を一括セット」も同じ関数を使う。
`kind = dayoff` で保存するときは `{}` にする（休みに必要人数は無い。v1 はフォームを隠すだけで値は残していた）。
既に入っている日別の `required_nums` 行は消さない（v1 も残す）。007 の必要人数行は v1 と同じく **workday のパターンだけ**を対象にする必要がある（申し送り）。

### 3.10 スタッフ上限は判定しない。人数はその場で数える

001 §7.3 の決定どおり `max_staffs_count` は見ない。「在籍中のスタッフ (N人)」は `listActiveStaffs` の件数（v1 の counter cache は持たない）。

### 3.11 `[staffId]` などの動的セグメントは `isUuid()` で先に弾く

`[tenantId]/layout.tsx` と同じ理由（Postgres の `22P02` を投げさせない）。`settings/staffs/[staffId]` / `patterns/[patternId]` / `restrictions/[restrictionId]` の page は
`isUuid(id)` でなければ `notFound()`、クエリが null（他店舗・存在しない）でも `notFound()`。Action 側は Zod の `z.guid()` が同じ役割を持つ。

### 3.12 Zod の型不一致（invalid_type / invalid_format）が英語で表示されるのを塞ぐ

004 / 005 の入力は `TextInput` の文字列だけで、型の不一致は UI から起こせなかった。006 は `NumberInput`（空欄は `''`）と `Select`（未選択は `null`）が入るので、
`z.int()` や `z.guid()` の leaf に `{ error }` が無いと `toActionError` が先頭 issue の **英語**（`Invalid input: expected number, received string` / `Invalid GUID`）をそのまま出す
（Zod 4 の既定ロケールは英語。`z.config()` はどこでも呼んでいないことを確認）。

対応は 2 層:

1. **ユーザーが空にできる leaf にはすべて `{ error }` を付ける**（`z.int({ error: '週の最大勤務日数を入力してください' })` は invalid_type にも効く。`z.guid({ error: '勤務パターンを選択してください' })` も同様）。Vitest で「空欄 / null を渡すと日本語になる」を固定する
2. **`toActionError` の安全網**: 先頭 issue のメッセージが**日本語を 1 文字も含まなければ** `INVALID_INPUT_MESSAGE`（入力内容が正しくありません）に落とす。AGENTS.md の規約でこのアプリの文言はすべて日本語なので、日本語を含まない = `{ error }` の書き忘れで Zod の既定が漏れている、と判定できる。`code` で判定すると `{ error }` を正しく付けた invalid_type の日本語まで潰してしまう（実装時に実測。§10）

`zod/locales` の `ja()` をグローバル設定する案は、文言が機械的（「無効な入力: 期待された型は number」）でユーザー向きではなく、`z.config()` がプロセス全体の可変状態になるので採らない。

---

## 4. 成果物

```
supabase/
  schemas/public/functions.sql            reorder_positions(p_table, p_tenant_id, p_ids)（3.3）
  migrations/<ts>_init_schema.sql         作り直し（+ unmanaged の REVOKE を末尾に追記）
  tests/rls_tenant_isolation.sql          reorder_positions を 4 件追加（自店舗 OK / 他店舗 tenant_id は例外 / 他店舗 id 混入は例外で自店舗も未変更 / anon は 42501）
src/
  types/database.ts                       再生成（Functions に reorder_positions）
  lib/
    calendar/weekdays.ts                  DAY_KEYS / DAY_KEY_LABELS（日〜土 + 祝）を追加
    patterns/
      requiredNums.ts (+ .test.ts)        RequiredNumsByDay / parseRequiredNums（3.9）
      kinds.ts                            PATTERN_KIND_LABELS（出勤日 / 休み）
    restrictions/
      kinds.ts                            RESTRICTION_KINDS / RESTRICTION_KIND_LABELS / 種別カードの説明文
      describe.ts (+ .test.ts)            describeRestriction()（3.7）
    ordering/
      move.ts (+ .test.ts)                moveItem(ids, index, delta)（3.3）
    validation/
      patterns.ts (+ .test.ts)            createPatternSchema にフル項目、updatePatternSchema / deletePatternSchema / reorderSchema
      staffs.ts (+ .test.ts)              同上 + retireStaffSchema（restore は同じ）
      restrictions.ts (+ .test.ts)        discriminated union（3.7）
      ordering.ts                         reorderSchema = { tenantId, ids }（3 ルート共有）
    queries/
      patterns.ts                         listPatterns（既存）/ getPattern(tenantId, id)
      staffs.ts                           listActiveStaffs（既存）/ listRetiredStaffs / getStaffWithRelations(tenantId, id)
      restrictions.ts                     listRestrictions / getRestriction
  app/(protected)/tenants/[tenantId]/settings/
    patterns/
      page.tsx                            一覧（Server）→ PatternListClient
      new/page.tsx                        PatternForm(afterCreate='list')
      [patternId]/page.tsx                PatternForm(initial) + PatternEditClient（削除）
      actions.ts                          createPattern（拡張）/ updatePattern / deletePattern / reorderPatterns
      _components/PatternForm.tsx         フル項目（3.5）
      _components/PatternListClient.tsx   Table + 上下 + 編集
      _components/PatternEditClient.tsx   削除パネル
      _components/ColorSwatchPicker.tsx   20 色
      _components/RequiredNumsInput.tsx   8 列の NumberInput
    staffs/
      page.tsx  searchParams.ts           在籍 / 退職タブ（3.2）→ StaffListClient
      new/page.tsx  [staffId]/page.tsx
      actions.ts                          createStaff（拡張）/ updateStaff / retireStaff / restoreStaff / deleteStaff / reorderStaffs
      _components/StaffForm.tsx  StaffListClient.tsx  StaffEditClient.tsx（退職 / 復帰 / 削除）
    restrictions/
      page.tsx                            一覧 → RestrictionListClient
      new/page.tsx  new/searchParams.ts   kind 無し: KindSelector / あり: RestrictionForm
      [restrictionId]/page.tsx
      actions.ts                          createRestriction / updateRestriction / deleteRestriction / reorderRestrictions
      _components/RestrictionForm.tsx  RestrictionListClient.tsx  KindSelector.tsx
  components/
    SortableList.tsx                      上下ボタン付き一覧の共通部品（3 画面で使う。行の描き方は render prop）
    SettingsBreadcrumbs.tsx               「スタッフ一覧 › スタッフの編集」（Client: Anchor に Link を渡す）
  lib/tenants/navigation.ts               pending を削除
docs/plans/006-settings/README.md         このファイル（実装後にログ追記）
AGENTS.md                                 RPC の置き場（schemas/public/functions.sql、security invoker、anon の revoke は unmanaged）と `SortableList` を追記
```

### 画面と Action

| 画面 | Server（page） | Client | Action |
| --- | --- | --- | --- |
| パターン一覧 | `listPatterns` | 種別 Badge（色スウォッチ付き）/ 名前 / 説明 / 上下 / 編集 | `reorderPatterns` |
| パターン登録・編集 | `listPatterns`（ペアの選択肢）、編集は `getPattern` | `PatternForm`。kind が dayoff のとき必要人数を隠す | `createPattern` / `updatePattern` / `deletePattern` |
| スタッフ一覧 | `listActiveStaffs` + `listRetiredStaffs` | Tabs（在籍 (N人) / 退職）。在籍は上下 + 編集、退職は編集のみ | `reorderStaffs` |
| スタッフ登録・編集 | `listPatterns`、編集は `getStaffWithRelations` | `StaffForm`。退職者は上部に Alert「このスタッフは退職済みです。[在籍中に戻す]」 | `createStaff` / `updateStaff` / `retireStaff` / `restoreStaff` / `deleteStaff` |
| 制約一覧 | `listRestrictions` + `listPatterns` | 説明文（太字）+ 種別名（dimmed）/ 上下（2 件以上のとき）/ 編集 | `reorderRestrictions` |
| 制約登録 | `?kind=` を loader で読む、`listPatterns` | `KindSelector`（4 枚のカード）/ `RestrictionForm` | `createRestriction` |
| 制約編集 | `getRestriction` + `listPatterns` | `RestrictionForm` + 「制約を削除」 | `updateRestriction` / `deleteRestriction` |

すべての Action は 005 と同じ流れ: `runAction` → Zod → `requireUser()` → `createClient()` → `.eq('tenant_id', tenantId)` を重ねる →
UPDATE / DELETE は `.select('id').maybeSingle()` で 0 行なら `fail('○○が見つかりません')` → `revalidatePath('/tenants/<id>', 'layout')`。
戻り値は UI が使う最小（`{ id }` / `{ name }` / `{ redirectTo }`）に絞る。

`metadata.title`: 「勤務パターン」「勤務パターンの登録」「勤務パターンの編集」「スタッフ」「スタッフの登録」「スタッフの編集」「自動アサイン制約」「制約の登録」「制約の編集」（親 layout の template で `| 店舗名` が付く）。
退職者一覧は `position` 順（v1 と同じ。`retired_at` 順にはしない）。

### 文言（v1 から移植）

- 一覧の見出し: 「勤務パターン」「在籍中のスタッフ (N人)」「退職したスタッフ」「アサイン制約」。空: 「勤務パターンが登録されていません」「スタッフが登録されていません」「スタッフがいません」「登録されているアサイン制約はありません」
- 登録画面の案内: パターン「「日勤」や「夜勤」などの勤務日だけでなく、「休み」や「有給」などの休暇日もすべて勤務パターンとして登録できます。」
- フォームの help: 「勤務日数にカウントしないパターンは「休み」を選択してください（例: [有給]や[夜勤明け]など）」
  「必要人数は「自動アサイン機能」を使用する場合に設定が必要です（デフォルト値を設定しておくとシフト表画面にて一括でセットできるため便利です）」
  「自動で翌日に特定のパターンを割り当てたい場合に選択します（例: [夜勤] → [明け] など）」
  「設定したデフォルトパターンは、シフト表画面の[ツール]ボタンから一括でアサインできます（自動的にはアサインされません）」
  「自動シフト作成時にアサインされる最大日数を設定します（手動アサイン時には影響しません）」
- 通知: 「登録しました」「更新しました」「削除しました」「退職済みにしました」「在籍中に戻しました」。並べ替えは成功時の通知を出さない（画面が動くので不要）。失敗時は「並び順を変更できませんでした」
- 並べ替えの注記: 「アイコンで並べ替え」（制約は「（処理結果には影響しません）」を足す）
- 退職パネル: 「退職済みにすると、シフト表に表示されなくなります。この操作はいつでも元に戻せます。」

---

## 5. 設計の要点

### 5.1 `reorder_positions`

実装は `supabase/schemas/public/functions.sql`（ここに写しを置くと二重管理になり、実際に古くなった）。要点:

- `p_table` をホワイトリストで検査してから `format('%I')` で埋める。空の id 配列も弾く
- `unnest(p_ids) with ordinality` で `position = ord - 1` を **1 文の UPDATE** で書く
- `get diagnostics` で更新行数を数え、渡した件数と違えば `raise exception`
- `revoke execute ... from public` → `grant ... to authenticated`

- **`p_table` はクライアントから受け取らない。** `reorderStaffs` / `reorderPatterns` / `reorderRestrictions` の 3 つの Action がそれぞれ定数で渡す（入力は `{ tenantId, ids }` だけ）。ホワイトリストは Action を経由しない直接呼び出しへの二重の守り
- security invoker なので RLS（`*_restrict_same_tenant`）が UPDATE に効く。他店舗の行は 0 行 → 件数不一致で例外 → ロールバック
- `p_ids` の重複は Zod で弾く（DB 側は `unnest` で同じ id に 2 回当たり、件数が合わなくなるので二重に守られる）
- `updated_at` トリガはそのまま発火する（並べ替えも更新として扱う）

### 5.2 `updateStaff` の中間テーブル同期

```ts
const current = await supabase.from('staff_patterns').select('pattern_id').eq('staff_id', staffId).eq('tenant_id', tenantId)
const toDelete = current.filter((r) => !next.has(r.pattern_id))
const toInsert = [...next].filter((id) => !currentSet.has(id))
if (toDelete.length) await supabase.from('staff_patterns').delete().eq('staff_id', staffId).eq('tenant_id', tenantId).in('pattern_id', toDelete)
if (toInsert.length) await supabase.from('staff_patterns').insert(toInsert.map((pattern_id) => ({ tenant_id, staff_id, pattern_id })))
```

`staff_default_patterns` も同じ差分方式にする: 現在の 8 行以下を読み、入力に無い `day_key` を `.in('day_key', removed)` で DELETE、
残りを `upsert(rows, { onConflict: 'staff_id,day_key' })`。`.not('day_key', 'in', ...)` は PostgREST の文字列リテラル `("0","1")` を手で組む必要があり、読みにくいので使わない。
現在値の読み取りは `getStaffWithRelations` と同じ埋め込みで 1 クエリにまとめる（staff の存在確認も兼ねる。null なら「スタッフが見つかりません」）。

### 5.3 `getStaffWithRelations`

`select('*, staff_patterns(pattern_id), staff_default_patterns(day_key, pattern_id)')` の 1 クエリ（複合 FK での埋め込みは実測済み。§2）。
呼び出し側の型は `Staff & { patternIds: string[]; defaultPatterns: Partial<Record<DayKey, string>> }` に整形して返す。
`listRestrictions` は `pattern1:patterns!restrictions_pattern1_id_tenant_id_fkey(name)` のヒント付き埋め込みでも取れるが、フォームの選択肢で `listPatterns` を読むので、名前解決は TS 側の Map で行い埋め込みは使わない。

### 5.4 一覧の楽観更新

`SortableList` は `ids` を `useOptimistic` で持ち、上下クリックで `moveItem` → `startTransition(async () => { setOptimistic(next); const r = await reorder(...); if (!r.ok) notifications.show(...) })`。
Action の `revalidatePath` で Server の props が更新されると `useOptimistic` の基底値が入れ替わる。transition 中はボタンを disabled にして連打を防ぐ。

### 5.5 Zod（抜粋）

```ts
// patterns.ts
export const patternInputSchema = z.object({
  name: patternNameSchema,
  description: z.string().trim().max(PATTERN_DESCRIPTION_MAX_LENGTH, { error: '説明は10文字以下で入力してください' }),
  // 20 色の enum ではなく DB の CHECK と同じ hex 形式。理由は §10.9 の 3
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: 'カラーを選択してください' }),
  kind: z.enum(PATTERN_KINDS, { error: 'パターン区分を選択してください' }),
  pairPatternId: z.guid({ error: 'ペア勤務パターンが正しくありません' }).nullable(),
  defaultRequiredNums: z.partialRecord(z.enum(DAY_KEYS), z.int().min(0).max(99, { error: '必要人数は0〜99で入力してください' })),
})
export const createPatternSchema = patternInputSchema.extend({ tenantId: tenantIdSchema })
export const updatePatternSchema = createPatternSchema.extend({ patternId: z.guid() })
  .refine((v) => v.pairPatternId !== v.patternId, { error: 'ペア勤務パターンに自分自身は選べません', path: ['pairPatternId'] })

// ordering.ts
export const reorderSchema = z.object({
  tenantId: tenantIdSchema,
  ids: z.array(z.guid()).min(1).max(200).refine(unique, { error: '並び順が正しくありません' }),
})

// staffs.ts
export const staffInputSchema = z.object({
  name: staffNameSchema,
  availableWdays: z.array(z.int().min(0).max(6)).max(7).refine(unique, { error: '勤務できる曜日が重複しています' }),
  maxWorkWeek: z.int({ error: '週の最大勤務日数を入力してください' }).min(0).max(7, { error: '週の最大勤務日数は0〜7で入力してください' }),
  availablePatternIds: z.array(z.guid()).refine(unique),
  defaultPatterns: z.partialRecord(z.enum(DAY_KEYS), z.guid()),
})

// restrictions.ts（tenantId は各メンバーに spread で入れる。discriminatedUnion 全体に .extend は無い）
const patternRef = z.guid({ error: '勤務パターンを選択してください' })
const daysSchema = z.int({ error: '日数を入力してください' }).min(1, { error: '日数は1〜7で入力してください' }).max(7, { error: '日数は1〜7で入力してください' })
export const restrictionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('deny_pattern_pair'), pattern1Id: patternRef, pattern2Id: patternRef }),
  z.object({ kind: z.literal('max_work_week'), pattern1Id: patternRef, days: daysSchema }),
  z.object({ kind: z.literal('max_work_consecutive'), pattern1Id: patternRef.nullable(), days: daysSchema }),
  z.object({ kind: z.literal('sat_or_sun_dayoff') }),
])
```

`createPattern` の `description` は空文字を `null` にして保存する（DB の `check (char_length(description) <= 10)` は null を通す）。

---

## 6. 手順

1. ブランチ `006-settings`（`005-tenants-tutorial` から）
2. **スキーマ**: `supabase/schemas/public/functions.sql` に `reorder_positions` → `rm supabase/migrations/*.sql` → `db schema declarative sync --no-apply --name init_schema --strict-coverage` → unmanaged を追記 → `db reset` → pgTAP に 4 件足し `plan(27)` → `plan(31)` にして `test db` → `gen types`
3. **lib**: `lib/actions/error.ts` の `toActionError` に invalid_type の安全網（3.12。既存の `error.test.ts` に追加）、`weekdays.ts`（DAY_KEYS）、`patterns/requiredNums.ts` `patterns/kinds.ts`、`restrictions/kinds.ts` `restrictions/describe.ts`、`ordering/move.ts`、validation 4 ファイル。Vitest を先に書く
4. **queries**: `getPattern` / `listRetiredStaffs` / `getStaffWithRelations` / `listRestrictions` / `getRestriction`
5. **actions**: patterns → staffs → restrictions。005 の `createPattern` / `createStaff` を拡張
6. **UI**: `SortableList` / `SettingsBreadcrumbs` → patterns の 3 画面 → staffs の 3 画面 + タブ → restrictions の 3 画面 + 種別選択。チュートリアルの page に `patterns` props を渡す
7. `navigation.ts` の `pending` を外す
8. `format:check` / `lint` / `typecheck` / `test` / `build` / `test db`
9. ブラウザで §1 の完了条件を seed 店舗と新規店舗の両方で通す（390px も）。`staff_patterns` / `staff_default_patterns` / `position` は psql で確認
10. 実装ログをこのファイルに追記して確認を取る

---

## 7. スコープ外

- ドラッグ & ドロップの並べ替え（001 §4.6「上下ボタン。DnD は後から検討」）
- スタッフ上限（プラン）の判定・ロックパネル（001 §7.3）
- スタッフグループ（廃止）
- 自動アサインのエンジン（制約は設定 UI のみ）
- シフト表側の「デフォルト勤務パターンをセット」「デフォルト人数を一括セット」（008。ここでは保存するだけ）
- 一覧のページング・検索（v1 に無い。件数も少ない）

---

## 8. 001 / 005 からの変更点（まとめ）

| 項目 | 001 / 005 | 006 |
| --- | --- | --- |
| 並べ替え | 「上下ボタン」（001 §4.6）。実装方式は未定 | RPC `reorder_positions` で全件採番（3.3）。**スキーマに関数が 1 つ増える** |
| `createPattern` / `createStaff` の 2 段 INSERT | 「006 で RPC 化を判断」（005 §3.4） | RPC にしない。差分更新で影響を小さくする（3.4） |
| チュートリアルのフォーム | 名前だけ（005） | 設定と同じフルフォーム（3.5）。v1 と同じ |
| ペアの自己参照 | v1 は編集時に選べた | 選択肢から外す（3.8） |
| `default_required_nums` の dayoff 時 | v1 は値を残す | `{}` に落とす（3.9） |
| 在籍 / 退職 | v1 は別 URL（`/staffs/disabled`） | 同じ page の `?tab=`（3.2） |
| `toActionError` | Zod の先頭 issue をそのまま表示（004） | `invalid_type` / `invalid_union` は `INVALID_INPUT_MESSAGE` に丸める（3.12） |

---

## 9. セルフレビューでの修正（2026-09-18）

初稿を読み直し、前提を実物で確かめて直した点。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | `public` の関数は既定権限で **anon にも EXECUTE** が付く（`pg_default_acl` で確認）。schemas に `revoke from anon` を書いても pg-delta は出力しない（003 と同じ理由） | `unmanaged/restrict_anon_grants.sql` の `REVOKE ALL ON ALL FUNCTIONS` が migration 末尾で外すことを §2 に明記。pgTAP に「anon は `reorder_positions` を実行できない（42501）」を追加（3 → 4 件） |
| 2 | 複合 FK での PostgREST 埋め込みを「試して駄目なら 3 クエリ」と曖昧にしていた | seed のセッションで実測し、`staffs → staff_patterns / staff_default_patterns`、`restrictions → patterns`（FK ヒント付き）とも返ることを確認。§5.3 を 1 クエリに確定 |
| 3 | `useOptimistic` の失敗時に「元に戻す」と書いていたが、transition 終了後は基底値（Server の props）へ自動で戻る。手で戻すコードは要らない | §3.3 の記述を修正 |
| 4 | `staff_default_patterns` の「入力に無いキーを `.not('day_key', 'in', …)` で消す」は PostgREST のリテラル `("0","1")` を手で組む必要があり読みにくい | `staff_patterns` と同じ差分方式（現在値を読んで DELETE / upsert）に統一。現在値の読み取りは存在確認と兼ねる（§5.2） |
| 5 | `[staffId]` などの動的セグメントを uuid 検査せずにクエリすると `22P02` で 500 になる（005 §10.8 で疑った経路と同型） | §3.11 を追加。page は `isUuid()` → `notFound()` |
| 6 | 出勤日のパターンが 0 件のときの制約フォーム、`kind` を dayoff に変えたときの `required_nums`、退職者一覧の並び、`metadata.title`、`reorderSchema` の下限が未定義 | §3.7 / §3.9 / §4 / §5.5 に追記。007 への申し送り「必要人数行は workday だけ」を §3.9 に残した |
| 7 | 通知の文言の行が「並び順を変更しました」を出すのか出さないのか読めなかった | 成功時は出さない・失敗時は「並び順を変更できませんでした」に書き分け |
| 8 | AGENTS.md の更新（RPC の置き場と規約、`SortableList`）が成果物に無かった | §4 に追加 |

疑ったが問題が無かったもの:

- **`reorder_positions` の `security invoker`**: 他店舗の行は RLS で UPDATE 対象から外れ 0 行になる。件数不一致の `raise exception` でロールバックされるので、部分更新は起きない。pgTAP で固定する
- **並べ替え後の `nextPosition()`**: 0..n-1 に採番し直したあとの追加は n になり、末尾に付く
- **退職者の position**: 在籍者だけを採番し直すので退職者の値と重なりうるが、在籍・退職の一覧は別で、復帰後に上下で直せる（v1 と同じ）
- **`deny_pattern_pair` の pattern1 = pattern2**: 「遅番の翌日は遅番にしない」は正当な制約なので v1 と同じく許可する
- **`revalidatePath(..., 'layout')` → `router.push(一覧)`**: 005 の `deleteTenant` と同じ順序で、一覧は再検証後に読まれる

### 2 回目のレビュー（2026-09-18）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | **Zod の型不一致が英語で表示される。** `NumberInput` の空欄（`''`）や `Select` の未選択（`null`）が `z.int()` / `z.guid()` に届くと、`toActionError` が `Invalid input: expected number, received string` をそのまま出す。ロケール設定は無い（`grep z.config` で確認、`node -e` で実測）。004 / 005 は文字列入力だけだったので表面化していなかった | §3.12 を追加。leaf に `{ error }` を付ける + `toActionError` の安全網の 2 層。`ja()` ロケールのグローバル設定は採らない理由も書いた |
| 2 | `reorder_positions` の `p_table` をクライアントが指定できるように読めた | §5.1 に「3 つの Action が定数で渡す。入力は `{ tenantId, ids }` だけ」と明記 |
| 3 | `DAY_KEYS` の置き場が §3.9（`patterns/requiredNums.ts`）と §4（`calendar/weekdays.ts`）で食い違っていた | `weekdays.ts` に統一（スタッフのデフォルトと共有するため） |
| 4 | `discriminatedUnion` に `tenantId` を足す方法、pgTAP の `plan()` 件数が未記載 | §5.5 / §6 に追記 |

疑ったが問題が無かったもの:

- **並べ替え中に別タブでスタッフが増えた場合**: 送った id はすべて更新され件数も合う。増えた行は旧 `position`（末尾）のまま残る。害は無い
- **復帰したスタッフに新しいパターンが紐付いていない**: `createPattern` は在籍者だけに `staff_patterns` を足すので、退職中に作られたパターンは復帰後に選べない。v1 も同じ挙動で、編集画面でチェックを入れれば直る。仕様として受け入れる
- **`reorderSchema.max(200)`**: v1 の有料プランでも 1 店舗 200 人超は無い

---

## 10. 実装ログ（2026-09-18）

ブランチ `006-settings`（`005-tenants-tutorial` から）。Next 16.3.5 / Mantine 9.6 / Supabase CLI 2.117。

### 10.1 成果物

§4 の構成どおり。プランに無かった追加・変更:

| パス | 内容 |
| --- | --- |
| `src/lib/actions/reorder.ts` | **追加**。`reorder_positions` RPC の共通ラッパ。3 ルートの Action がテーブル名を定数で渡す。`'use server'` は付けない（呼び出し側の `actions.ts` に付ける） |
| `src/lib/validation/restrictions.ts` の `RawRestrictionInput` | **追加**。フォームが送れる形（`days: number \| ''`、`pattern1Id: string \| null`）を型で表す。`RestrictionInput` は parse 後の型。§10.3 |
| `src/lib/patterns/colors.ts` の `PATTERN_COLOR_HEXES` | **追加**。`z.enum()` に渡すタプル。UI の選択肢と検証を 1 か所から作る |
| `src/lib/calendar/weekdays.ts` の `dayKeyColor()` | **追加**。日・祝は赤、土は青（v1 の色分け）。パターンの必要人数表とスタッフのデフォルト表で共有 |
| `staffs/_components/RetiredStaffAlert.tsx` | **追加**。退職者の編集画面の上に出す「在籍中に戻す」の帯（v1 の notification）。`StaffEditClient` と分けたのは置き場所が違うため |
| `restrictions/_components/RestrictionEditClient.tsx` | **追加**。v1 は編集画面の左下に「制約を削除」のテキストリンクを置いていた |
| `SortableList` の `onReorder` | プランでは必須にしていたが **任意**にした。退職タブは並べ替えないので、渡さなければ上下ボタンごと出ない（§10.4 の 1） |

### 10.2 プランどおり確認できたこと

- `reorder_positions` は security invoker のまま RLS が効き、pgTAP 4 件（自店舗 OK / 他店舗は例外 / ホワイトリスト外は例外 / anon は 42501）が PASS。27 → 32 件
- 生成 migration には `GRANT EXECUTE ... TO "anon"` が出るが、`unmanaged/restrict_anon_grants.sql` の `REVOKE ALL ON ALL FUNCTIONS` が末尾で外す（§2 の想定どおり）
- 複合 FK でも PostgREST の埋め込みが解決でき、`getStaffWithRelations` は 1 往復で済んだ
- `?tab=retired` は双方向に往復する（タブを押すと URL に乗り、URL 直打ちで退職タブが開く）
- 休みに変えて保存すると `default_required_nums` が `{}` になる。既存の日別 `required_nums` 行は消さない
- パターン削除でペアの相手の `pair_pattern_id` が null になる（複合 FK の `on delete set null (pair_pattern_id)`）

### 10.3 プランからの変更: Action の引数型を「フォームが送れる形」に広げた

`NumberInput` の空欄は Mantine が `''` を返す。プランの `maxWorkWeek: number` / `days: number` のままだと呼び出し側に `as number` の嘘が要るので、
`number | ''` を受ける型にして Zod に弾かせることにした（`StaffInput`、`RawRestrictionInput`）。
当初 `NaN` に変換する案を書いていたが、React の state と Mantine の `value` に NaN を置くことになるのでやめた。

### 10.4 セルフレビューとブラウザ検証での修正

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **退職タブに上下ボタンが出て無反応だった。** 並べ替えは在籍者だけを採番し直す設計なのに、`SortableList` を no-op の `onReorder` で使い回していた | `onReorder` を任意にし、渡さなければボタンを描かない | 退職タブのスクリーンショットで確認 |
| 2 | **一覧の「編集」が 2 行に折り返していた**（操作列が `w={1}` で内容ぴったりに縮むため） | 操作セルに `whiteSpace: 'nowrap'` | 1280px のスクリーンショットで 1 行になったことを確認 |
| 3 | `toActionError` の安全網を「issue の `code` が invalid_type なら汎用メッセージ」で書いたら、**`{ error }` を正しく付けた日本語まで潰した** | 「日本語を 1 文字も含まないメッセージなら汎用に落とす」に変更（AGENTS.md の規約が根拠）。§3.12 を書き換え | Vitest 4 件（英語の invalid_type は汎用に / 日本語の invalid_type はそのまま / 未カスタムの union は汎用に / too_small はそのまま） |
| 4 | `SegmentedControl` の補足を生の `<p>` + Mantine のクラス名で描いていた | `Input.Wrapper` で包む（Mantine の作法。CSS Modules も不要） | 画面で label / description の見た目が他の項目と揃うことを確認 |

### 10.5 検証結果

```
npm run format:check / lint / typecheck / build → OK
npm test        → 16 files / 119 tests passed
npx supabase db reset && npx supabase test db → 32 tests PASS
```

ブラウザ（Chrome / Playwright、1280px と 390px）で seed 店舗と新規店舗を通した。**console エラー 0 件**。

| 検証 | 結果 |
| --- | --- |
| 勤務パターン 登録（名前・説明・色・区分・必要人数） | 6 → 7 件。DB は `#00BCD4` / `workday` / `{"0": 2, "holiday": 3}` |
| 並べ替え（遅番を 1 つ上へ） | 画面が即時に動き、リロード後も保持。DB の `position` が 0..6 に振り直された |
| パターン作成時の `staff_patterns` 自動追加 | 48 → 56（在籍 8 名全員に付いた。v1 の `after_create` と同じ） |
| 休みに変更して保存 | 必要人数の欄が消え、`default_required_nums` が `{}` に |
| パターン削除 | 確認モーダルに cascade の範囲が出る。`明け` を消すと `夜勤` の `pair_pattern_id` が null に |
| スタッフ 登録 | 新規フォームは 14/14 チェック済み（7 曜日 + 7 パターン）。在籍 8 → 9 人 |
| スタッフ 編集（日曜とパターン 1 件を外す） | `available_wdays` が `{1,2,3,4,5,6}`（ソート済み）、`staff_patterns` が 7 → 6、`staff_default_patterns` に 月 → 早番 |
| 退職 → 復帰 → 削除 | 在籍 9 → 8 人、退職タブに移動、復帰で帯が消える、削除で関連ごと 0 件 |
| 制約 登録（連続勤務、パターン未指定） | 一覧に「勤務日は連続で 3日 まで」。編集で日数が復元され、削除で消える |
| 制約の種別選択 | v1 の 4 枚のカードと説明・例示が再現 |
| チュートリアル（新規店舗） | intro → パターン（フルフォーム、登録後に入力クリア）→ スタッフ（7 曜日 + 1 パターンがチェック済み）→ 完了まで通る |
| 404（各 `[id]` に `not-a-uuid` / 他店舗 uuid / `%2e%2e%2f%2e%2e`、他店舗の一覧） | **9 経路すべて 404。500 は 0 件** |
| `?kind=bogus_kind` | 種別選択カードにフォールバック（設計どおり） |
| 390px | 6 画面すべて横スクロールなし。必要人数の 8 列だけ表内で横スクロール |

検証中に気づいた運用メモ: 宣言的スキーマを変えたあと `next dev` を再起動するときは `.next` を消す。
Turbopack が古いモジュールグラフを保持して「Export PATTERN_COLOR_HEXES doesn't exist」のような実在しないエラーを出すことがあった。

### 10.6 007 以降への申し送り

- **シフト表の必要人数行は `kind = 'workday'` のパターンだけを対象にする。** 休みに変えても過去の `required_nums` 行は残すため（§3.9）
- `parseRequiredNums()` は 007 の「デフォルト人数を一括セット」でも使う。祝日は `holiday` キーを優先する
- `reorder_positions` は 3 テーブルのホワイトリスト。並べ替えるテーブルを増やすときは SQL とラッパの両方に足す
- 退職中に作られた勤務パターンは、復帰したスタッフの `staff_patterns` に入らない（`createPattern` は在籍者だけに付ける。v1 と同じ）。編集画面でチェックすれば直る
- **スタッフのデフォルト勤務パターンは「選択可能な勤務パターン」で絞っていない**（v1 と同じ）。
  そのため 008 の「デフォルト勤務パターンをセット」は、スタッフが選択できないパターンを指すデフォルトに出会いうる。
  スキップするか、そもそも選択肢を絞る仕様に変えるかを 008 で決める

### 10.7 コードレビューでの修正（2026-09-18）

実装を別の目で読み直し、指摘を実機で再現してから直した。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **制約が参照する勤務パターンを「休み」に変えると、その制約を編集できなくなる。** 編集画面の Select は出勤日のパターンだけを `data` に渡していたので、参照中の id が候補に無く表示が空になる。その項目は required なので保存できず、画面からは直せない（削除するかパターンを戻すしかない） | `restrictionPatternOptions(patterns, referencedIds)` を追加し、**参照中の id は kind が変わっても候補に残す**。新規・編集の両ページをこの関数に寄せた | seed の「夜勤 は1週間に 1日 まで」で夜勤を休みに変更 → 編集画面の Select に「夜勤」が出て、そのまま更新できることをブラウザで確認 |
| 2 | **`toActionError` の「日本語を含むか」判定をすり抜けて英語が出る経路があった。** `z.partialRecord` の未知キーは `Unrecognized key: "あ"` のようにキーをそのまま埋め込むので、キーに日本語が 1 文字でもあると通ってしまう | 入力値がメッセージに埋まる issue（`unrecognized_keys` / `invalid_key` / `invalid_element`）はメッセージを見ずに汎用文言へ落とす。日本語判定はその後に適用 | Vitest を 1 件追加（120 件に） |
| 3 | **一覧・新規ページが uuid 検証なしの `tenantId` で Postgres に投げていた。** layout の `notFound()` は並行描画される page のクエリを止めないので、404 は返るがサーバーログに毎回 22P02 が出る。005 の `settings/general` から続く見落とし | 設定配下の 10 ページすべてに `isUuid(tenantId)` → `notFound()` を追加（§3.11 を leaf だけでなく tenantId にも適用） | `/tenants/notauuid/settings/*` で 404 のまま、dev のログに 22P02 が出なくなったことを確認 |
| 4 | **pgTAP に「自テナント id と他テナント id を混ぜた」ケースが無かった。** §9 で設計の根拠として挙げたのはこのケース（ロールバックの証明）なのに、実際に足したのは境界のフィルタだけだった | 混在で例外になること・その後も自テナントの並びが変わっていないこと・重複 id も例外になることの 3 件を追加（32 → 36 件） | `npx supabase test db` |
| 5 | **anon の EXECUTE 検査が関数ごとだった。** 今後 RPC を足して `unmanaged` の追記を忘れると、anon 実行可能なまま何も落ちない | 関数名を列挙せず `pg_proc` を走査して「anon が EXECUTE できる public の関数は 1 つも無い」を固定するアサーションに変更 | わざと `grant execute ... to anon` を戻すとこのテストだけが落ち、revoke すると PASS することを実測 |
| 6 | `describeRestriction` が `days` null のとき `null日` と描く（Action 経由では起きないが、012 の移行データにはありうる） | パターン名と同じく `?` にする | Vitest は既存のまま PASS |
| 7 | `loadStaffsSearchParams` がどこからも使われていなかった（Server はタブを読まない設計なので不要） | `createLoader` を削除し、不要な理由をコメントに残した | lint / build |

指摘されたが変えなかったもの:

- **スタッフのデフォルト勤務パターンの選択肢が「選択可能な勤務パターン」で絞られていない。** 選べないパターンをデフォルトにできてしまうが、**v1 も同じ**（v1 の `_form` は `@tenant.patterns` 全件を出していた）。挙動を変えるのは製品判断なので 007 への申し送りにした（§10.6 に追記）
- **`REORDER_MAX_ITEMS = 200` を超えると理由の分からない失敗になる。** 1 店舗 200 行は v1 の最大店舗でも到達しないため、プランどおり据え置き

レビューで確認して問題が無かったもの（報告より）: `reorder_positions` の `%I` + ホワイトリスト（インジェクション不可）、`security invoker` の実測、
全 Action のテナント境界と複合 FK による 23503（存在を漏らさない）、cascade と `pair_pattern_id` の set null、404 と 500 の切り分け、
`SortableList` のフック順序と transition、`z.guid()` の統一。

### 10.8 2 回目のセルフレビュー（2026-09-18）

10.7 の修正自体はまだ誰も読んでいなかったので、そこを中心に読み直した。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **並べ替えに失敗したあと、一覧が古いまま残る。** 件数不一致で失敗する主因は「別タブで消された行を送った」= この画面が古いこと。楽観更新は transition 終了で戻るが、**消えたはずの行は表示されたまま**で、押し直しても失敗し続ける。リロードしないと直らなかった | 失敗時に `router.refresh()` を呼んで読み直す。検出した「画面が古い」状態を放置しないため | 2 つのブラウザコンテキストで再現。タブ B で 1 件削除 → タブ A で並べ替え → 通知が出て、行数が 4 → 3 に減る（修正前は 4 のまま） |
| 2 | `PATTERN_COLOR_HEXES` に `as unknown as [T, ...T[]]` の二重キャストを書いていた | Zod 4 の `z.enum()` は `readonly string[]` を受ける（`schemas.d.ts` で確認）ので非空タプルは不要。キャストを削除。`PATTERN_COLORS` が `as const` なので要素型は `PatternColorHex` に絞られる | `typecheck` と勤務パターンの Zod テスト 11 件 |

あわせて規約を機械的に確認した（いずれも違反なし）:

- Server Component で Mantine のドット記法を使っていない
- `router.refresh()` は 10.8 の 1 で足した 1 か所だけ（005 で撤去した「revalidate と二重に走る」用途では使っていない）
- submit ボタン 11 個すべてに `loading={isPending}`
- 書き込み Action 14 本すべてに guard・Zod・`revalidatePath` があり、UPDATE / DELETE は `.eq('tenant_id')` + 0 行判定つき
  （`createRestriction` だけ `.eq` が無いが INSERT なので正しい。越境は RLS の WITH CHECK が 42501 で弾き、pgTAP で固定済み）
- 診断用の `console.log` / `TODO` / `any` / `@ts-ignore` は 0 件。`as unknown as` も 0 件になった

### 10.9 v1 との突き合わせでの修正（2026-09-18）

v1 の設定 3 画面と項目単位で比べ直した。バリデーションの数値・既定値・モデルコールバックの受け先・
select が出すパターンの範囲はすべて一致していた。取りこぼしていたのは文言と導線。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **3 つのフォームすべてでキャンセル導線が無かった。** v1 は必ず送信ボタンの横に置き、**制約の登録だけは「制約タイプを選択」へ戻す**という作り分けまでしていた。v2 は編集をやめて戻る手段がパンくずだけだった | 3 フォームにキャンセルを追加。制約の登録は `new`（種別選択）へ、それ以外と編集は一覧へ。**チュートリアルでは出さない**（v1 の `unless @tutorial_step`） | ブラウザで 3 画面の遷移先を確認。チュートリアルに出ないことも確認 |
| 2 | **「アイコンで並べ替え」の注記が制約一覧にしか無かった。** §4 の文言節は 3 画面前提で書いていたのに実装が漏れていた。上下ボタンはアイコンだけで 1 件のときは消えるので、注記が無いと並べ替えられること自体に気づきにくい | 勤務パターン・スタッフの一覧にも追加 | 3 画面すべてに出ることを確認 |
| 3 | **`color_hex` を 20 色の `z.enum` に限定していた。** v1 は任意の hex（nil も可）を保存でき、DB の CHECK も `^#[0-9A-Fa-f]{6}$` なので、**012 でパレット外の色を持つ行を移行すると編集画面で保存できなくなる**（スウォッチが未選択になり「カラーを選択してください」で止まる）。10.7 の 1 とまったく同じ「保存済みの値が選択肢に無いと詰む」型の不具合 | Zod を DB の CHECK と同じ hex 形式の検査に変更。UI が出すのは 20 色のままで、移行データは編集できる | Vitest を 2 件に書き換え（形式違いは弾く / パレット外の hex は通す）。121 件 PASS |

指摘を受けたが変えなかったもの:

- **スタッフ一覧の見出し**（v1 の「在籍中のスタッフ (N人)」「退職したスタッフ」）。v2 はタブ見出しが「在籍中 (8人)」「退職」で、
  同じ言葉をタブのすぐ下にもう一度置くと重複する。情報は失われていないので、タブ化（§3.2）に伴う意図的な差として扱う
- **`acts_as_list` の「削除時に下位の position を詰める」**。v2 は欠番が残るが、表示順は `position` の昇順なので見た目は変わらず、
  次の並べ替えで `reorder_positions` が 0..n-1 に振り直す。`nextPosition` は max+1 なので追加も末尾のまま。実害なし

### 10.10 012（データ移行）への申し送り

v1 との突き合わせで見つかった、移行時に手当てが要る点:

- **`patterns.color_hex` が nil の行**: v1 は nil を許し表示時に `#FFFFFF` へフォールバックしていた。v2 の列は `not null` なので、
  移行時に nil → `#FFFFFF` へ正規化する。パレット外の hex はそのまま入れてよい（10.9 の 3 で編集できるようにした）
- **自己ペア（`pair_pattern_id = id`）の行**: v2 は候補から自分自身を外す（§3.8）ので、移行したまま編集画面を開いて保存すると
  **無言で null になる**。移行時に検出して null にし、件数をログに出す
- **`restrictions.days` が 8 以上の行**: v1 は DB 制約もモデル検証も無く、`max_work_month` のフォームは 1..31 を許していた。
  v2 の CHECK は 1..7 なので **INSERT が落ちる**（§10.12）。移行時に 7 へ丸めるか、その行を捨てるかを決めて件数をログに出す
- **`staffs.available_wdays` に 0..6 以外が混じる行**: 同じく v2 の CHECK で **INSERT が落ちる**。移行時に 0..6 だけに絞り、重複も除いてソートする
- v1 の `kind = 'max_work_month'` の行は v2 の enum に無い。移行対象から外すか `max_work_consecutive` に寄せるかを決める

### 10.11 修正そのもののレビューでの修正（2026-09-18）

10.7〜10.9 で入れた修正は誰も読み直していなかったので、そこだけを対象にもう一度見た。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **ロールバックを確かめるアサーションが空振りしていた。** `array_agg(name order by position)` で見ていたが、部分更新が残った状態は両方 `position = 0` になり、同値ソートの結果が heap 順で決まる。ロールバックされた場合と区別できていなかった | `array_agg(position order by name)` にして **値そのもの**（正常 `{1,0}` / 部分更新 `{0,0}`）を固定 | 値で区別できることを確認。なお plpgsql は `EXCEPTION` で捕まえてもサブトランザクションが巻き戻るため、この経路で実際に落とすのは難しい。それでも「区別できない」状態は解消した |
| 2 | **`isUuid` の手当てが `settings/` で止まっていた。** 同じ理屈が `[tenantId]/page.tsx`・`shifts`・`tutorial/pattern`・`tutorial/staff` にも当てはまり、**クエリが 22P02 を throw していた**（404 にはなるがレンダリングのエラー） | 4 ページにも同じガードを追加 | `/tenants/notauuid` 配下 5 経路が 404 のまま、サーバーログの 22P02 と `⨯` が **0 件**になったことを確認（修正前は 4 件） |
| 3 | **anon の一般アサーションが関数だけだった。** `unmanaged/restrict_anon_grants.sql` は TABLES と SEQUENCES も revoke しているのに、テーブルは 3 つを名指しするだけで、新しいテーブルの追記漏れは捕まらなかった | `information_schema.role_table_grants` と `pg_class`（シーケンス）を走査する 2 件を追加（36 → 38 件） | わざと `grant select on public.patterns to anon` すると新しいテストだけが落ちることを実測 |
| 4 | **`restrictionPatternOptions` が「制約ごと」だったため、`deny_pattern_pair` で片方の欄が参照している休みパターンを、もう片方の欄でも新たに選べた。** 「出勤日だけ」という v1 の制限が崩れる | 引数を `referencedId`（単数）にして**欄ごと**に作る。フォームも `pattern1Options` / `pattern2Options` を受ける | 早番を休みに変えてから編集画面を開き、1 つ目の欄の候補が `日勤,遅番,夜勤`（早番なし）、2 つ目が `早番,日勤,遅番,夜勤`（参照中なので残る）であることをブラウザで確認 |
| 5 | `throws_ok(..., 'P0001', null, ...)` が**メッセージを検査していなかった**。`reorder_positions` の 3 つの `raise` はすべて P0001 なので、別の理由で落ちても通ってしまう | 4 か所に期待メッセージを明示 | `EXCEPTION` で握り潰す版に差し替えると該当テストが落ちることを実測してから戻した |
| 6 | `days` が null のときの回帰テストが無く、フォールバックの定数名が `UNKNOWN_PATTERN`（日数にも使うのに）だった | テストを 1 件追加し、定数を `UNKNOWN` に改名 | Vitest 122 件 |
| 7 | `StaffTab` が未使用の export になり、タブ切替が `value as typeof tab` で literal 型へ素通しキャストしていた | `isStaffTab()` の型ガードを置き、`StaffTab` をそこで使う | typecheck / lint |

指摘されたが変えなかったもの:

- `kinds.ts` が `PatternKind`（生成 enum）ではなく `'workday' | 'dayoff'` を直書きしていた点は、4 の修正で `PatternKind` に置き換え済み
- 一般アサーションが `public` スキーマだけを見ている点（`config.toml` は `graphql_public` も公開する）。`graphql_public` に自作関数を置く予定が無いため据え置き

### 10.12 「保存済みの値が UI の制約に収まらない」型の総ざらい（2026-09-18）

10.7 の 1（休みに変えたパターンを参照する制約）と 10.9 の 3（パレット外の色）は、**同じ型の不具合**だった:

> DB に入っている値を画面がそのまま表示するのに、その値がフォームの選択肢・範囲の外なので保存できない。

2 回別々の場所で出たので、設定画面が扱う全カラムについて **DB の CHECK とアプリの検証範囲**を突き合わせた。3 つ目が 2 件見つかった。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **`restrictions.days` は DB が 1..31、アプリが 1..7。** 001 の素案の 1..31 は v1 の `max_work_month`（v2 の enum に無い残骸）を想定した値で、残る 2 種別は v1 の画面も 1..7。`days = 20` の行を手で作って編集画面を開くと、**「20 日」と表示されたまま「日数は1〜7で入力してください」で保存できない** | DB の CHECK を 1..7 に狭め、アプリと一致させる | `days = 20` を入れて再現（保存が通らず DB の値も変わらないことを確認）→ CHECK を直す |
| 2 | **`staffs.available_wdays` に DB 制約が無い。** `{0,...,6,9}` のような行があると、`9` はチェックボックスに出せないので**画面は 7 つ全部チェック済みで何も異常が見えないのに、保存だけが「勤務できる曜日が正しくありません」で失敗する**。3 件のうち最も原因が分かりにくい | `check (available_wdays <@ array[0,1,2,3,4,5,6]::smallint[])` を追加 | 同上の手順で再現（画面は正常・保存だけ失敗）→ CHECK を追加 |

突き合わせて一致していた残り（指摘なし）:

`patterns.name` 1..6 / `description` ≤10 / `color_hex` の hex 正規表現 / `staffs.name` 1..10 / `max_work_week` 0..7 /
`staff_default_patterns.day_key` の 8 キー / `tenants.name` 1..20 / `start_of_week` 0..6。
`patterns.default_required_nums` は DB に制約が無いが、`parseRequiredNums()` が読み取り時に範囲外・非整数・未知キーを落とすので画面が壊れない（設計どおり）。

**この 2 つはスキーマ変更なので、013 の初回 push 前のルールどおり `init_schema` を作り直す。**

### 10.13 4 回目のレビューでの修正（2026-09-18）

§10.11 / §10.9 / §10.12 の修正を対象にもう一度読んでもらった。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **§10.12 のスキーマ変更が `migrations/` に入っていなかった。** `schemas/` だけ直して `init_schema` の作り直しを保留していたため、宣言（正）と migration がずれ、追加した 2 つの CHECK が**効いていない**状態だった（レビューが DB を使っていて衝突を避けた保留だったが、未完了には変わりない） | `migrations/` を作り直し、unmanaged を追記、`db reset`、`gen types` まで実施 | `db reset` 後に `days = 20` と `available_wdays = '{0,1,9}'` の UPDATE がどちらも CHECK 違反で拒否されることを実測 |
| 2 | **`isUuid` の手当てに 5 ページ目の漏れがあった**（`tutorial/complete`）。`getTutorialStatus` を未検証の id で呼び、22P02 を throw していた。§10.11 の 2 で「0 件になった」と書いたのは早かった | ガードを追加。アプリ全体を再度掃いて、クエリを持つページはこれで最後であることを確認 | `/tenants/notauuid` 配下 **10 経路**すべて 404 で、サーバーログの 22P02 と `⨯` が 0 件 |
| 3 | **anon のテーブル検査が `GRANT ... TO PUBLIC` を見落としていた。** `information_schema.role_table_grants` は PUBLIC への付与を anon の行として出さないが、PUBLIC への付与は anon にも効く。関数・シーケンスの検査（`has_*_privilege`）と方式が揃っていなかった | `pg_class` を走査する `has_table_privilege` に統一 | `grant select on public.patterns to public` で該当テストだけが落ちることを実測（修正前は 38 件すべて PASS していた） |
| 4 | `pattern2Options` が省略可だったため、将来の呼び出し側が渡し忘れると `?? pattern1Options` に落ちて §10.11 の 4 の不具合が**型検査をすり抜けて戻る** | 必須にしてフォールバックを削除。不変条件を tsc が守るようにした | typecheck / 制約の編集画面で 2 つの欄が別々の候補を持つことを確認 |
| 5 | **送信中にキャンセルを押せた。** 書き込みは走ったまま遷移するので、成功・失敗の通知とエラー表示を取りこぼす | 3 フォームのキャンセルに `disabled={isPending}`（**この時点では直っていなかった。§10.14**） | Action のレスポンスを遅延させて送信中を捕まえ、`data-disabled=true` になることを実測（**属性を見ただけで、遷移が止まるかを見ていなかった**） |
| 6 | `PATTERN_COLOR_HEXES` が §10.9 の 3 以降どこからも使われず、docstring も古いままだった | 削除（UI は `PATTERN_COLORS` を直接使う） | 参照 0 件を確認、build |

指摘されたが対応不要としたもの:

- ロールバック検査（assertion 21）が 18 / 20 / 22 と重複していて単独では落とせない点。レビューが実測で
  「旧アサーションは 3/3 で空振り、新アサーションは落ちる」ことを確認しており、**改善であることは裏が取れた**ので残す

---

## 11. レビューの記録

実装後に 4 巡した。見つかった不具合の性質が巡ごとに変わっている。

| 巡 | 観点 | 主な収穫 |
| --- | --- | --- |
| 1 | 自己レビュー + 正しさ / 安全性 | Zod の英語メッセージ漏れ、22P02、pgTAP の穴（§10.7） |
| 2 | 修正そのもの | 並べ替え失敗後に画面が古いまま（§10.8）、空振りアサーション・欄をまたぐ選択肢漏れ（§10.11） |
| 3 | v1 との突き合わせ | キャンセル導線・並べ替え注記の欠落、色の検証が厳しすぎる（§10.9） |
| 4 | 総ざらい + 修正の修正 | **「保存済みの値が UI の制約に収まらない」型が 3 か所**（§10.9 の 3、§10.12 の 2 件）、ガード漏れ 5 ページ目（§10.13） |

得られた教訓（007 以降に持ち込む）:

1. **DB の CHECK とフォームの選択肢・範囲は必ず突き合わせる。** ずれていると「画面に出るのに保存できない」行ができる。
   とくに `available_wdays` の例は**画面上は何も異常が見えない**ので、報告されても再現できない類の不具合になる
2. **修正した直後のコードが一番読まれていない。** 4 巡のうち 2 巡は「前の巡の修正」から新しい指摘が出た
3. 機械的に入れた変更（今回の `isUuid` ガード）は**入れた範囲の外を掃く**。2 回とも漏れが見つかった

### 10.14 5 回目のレビューでの修正（2026-09-18）

Major 以上に絞って、スキーマ再生成・新しい CHECK・§10.13 の修正・通しのセッション・同時書き込み・
細工したペイロードでの越境書き込みを見てもらった。**指摘は 1 件**で、それは §10.13 の 5 が直っていなかったというもの。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **`disabled={isPending}` はリンクを止めていなかった。** `LinkButton` は `Button component={Link}` なので実体は `<a>`。`<a>` は `disabled` 属性を解釈せず、Mantine の Button.css も `[data-disabled]` に `cursor: not-allowed` を当てるだけ。**送信中でもクリックでもキーボードでも遷移でき**、離脱先で「保存できませんでした」が表示されないまま終わる。§10.13 で「実測した」と書いたのは `data-disabled` 属性の確認であって、**挙動を確かめていなかった** | `LinkButton` 側で根本から直す。`disabled` のとき `onClick` を `preventDefault`、`tabIndex={-1}`、`aria-disabled` を付ける。3 つのフォームは `LinkButton` を使うのでそのまま直る | 送信中に**実際にクリック**して URL が変わらないこと、**Enter** でも変わらないこと、**Tab 40 回でキャンセルに到達しない**こと（送信前は 1 回到達）、送信完了後は普通に遷移することをブラウザで実測 |

レビューが実行して破れなかったもの（報告より）:

- **スキーマ再生成**: 旧 migration との差分は意図した 3 か所のみ。ポリシー・GRANT・トリガ・複合 FK・`ON DELETE`・インデックス・`private` に変化なし。空からの `db reset` を 3 回、pgTAP 38 件 PASS
- **新しい 2 つの CHECK**: アプリが作れる値（空配列・重複・`days = null`）はすべて通り、`{0,1,9}` と `days = 20` は拒否される。seed も全書き込み経路も制約の内側
- **細工したペイロードでの越境書き込み**: Server Action の POST ボディを差し替えて他テナントの id を送る実験で、`updateStaff` は「スタッフが見つかりません」、`createStaff` / `createPattern` は RLS 42501、`reorderStaffs` は件数不一致でロールバック。**被害側の行はいずれも無変化**
- **通しのセッション**（店舗作成 → チュートリアル → 設定 CRUD → 並べ替え → 退職 → 削除）で console エラー 0 件
- **同時書き込み**: `createPattern` / `updateStaff` の非トランザクションな多段書き込みは §3.4 で受け入れた挙動のままで、データの消失・破損は起きない

---

## 12. 教訓の追記（§11 に続けて）

4. **「直した」の検証は、目印ではなく挙動で取る。** §10.13 の 5 は `data-disabled` 属性が付いたことを確認して完了にしたが、
   属性は見た目を変えただけでリンクは踏めたままだった。次からは「その操作が実際にできなくなったか」を操作して確かめる

## 13. 設定画面のブラッシュアップ（2026-10-04）

スタッフの登録・編集フォームを組み替えた（§3.5 の「同じフォームをチュートリアルと共有する」は保つ）。

- 入力欄を `StaffFields.tsx`（`StaffNameInput` / `StaffConditionFields`）に切り出し、新規（`StaffForm`。設定画面とチュートリアル）と
  編集（`StaffEditForms`）で共有する
- **編集はセクションごとに保存する。** `updateStaff` を `updateStaffName`（基本情報）と `updateStaffConditions`（勤務条件）に分けた。
  新規は今までどおり「追加」1 回で `createStaff` に送る。編集画面のキャンセルはやめ、戻るのはパンくずから
- 「勤務できる曜日」と「デフォルトの勤務パターン」を 1 つの表（曜日ごとの勤務）にまとめた。勤務できない曜日もデフォルトは選べる
  （v1 から「勤務できない曜日に休みを入れる」使い方があり、`planDefaultPatterns` も絞らない）

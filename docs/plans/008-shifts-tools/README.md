# 008: シフト表（ツール）

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §4.4 / §6）のマイルストーン 008。
007 で作ったシフト表に、**一括操作（すべて確定 / 下書きに戻す / 下書きクリア。全体・スタッフ単位）・
デフォルト勤務パターンをセット・シフトコピー・アサイン数集計**を足す。共有は 009、PDF / CSV は 010。

---

## 1. 目的と完了条件

### 目的

- v1 の `ShiftsController#fixed` / `#unfixed` / `#clear` / `#set_default` / `#count` と `Shifts::CopyController` をシフト表の中に移植する
- v1 が「N 回の `exists?` + `save`」で書いていた一括 INSERT（デフォルト勤務パターン・コピー）を、
  **1 文の `INSERT ... ON CONFLICT DO NOTHING`** にする（既存セルを上書きしない、という v1 の規則を DB に任せる）
- 007 で空けておいたツールバー右側とスタッフ名メニューを埋める。ツールバーの並びは v1 と同じ「集計 / 共有（009・010）/ ツール」
- 集計・コピー計画・デフォルト計画はすべて純関数にして Vitest で固定する（001 §2 のテスト方針）

### 完了条件

- ツールバー右に「集計」ボタンと「ツール」メニュー（すべて確定シフトにする / すべて下書きに戻す / 下書きシフトをクリア / デフォルト勤務パターンをセット / シフトをコピー）が出る。
  スタッフ名メニューに「一括操作」（同じ 3 件、そのスタッフだけ）が「スタッフ情報を編集」の上に出る
- **すべて確定 / 下書きに戻す**: 確認 → 表示期間の全セル（またはそのスタッフの全セル）の `fixed` が変わり、表の塗りが変わる。通知「シフトを確定しました」「シフトを下書きに戻しました」
- **下書きクリア**: 確認 → 表示期間の下書き（`fixed = false`）だけが消え、確定は残る。通知「下書きシフトをクリアしました」
- **デフォルト勤務パターンをセット**: 確認 → 在籍スタッフ × 表示期間の日付について、`staff_default_patterns` の
  曜日（祝日は `holiday` キー優先）のパターンが**未アサインの日だけ**下書きで入る。アサイン済みのセルは変わらない。
  通知「デフォルトの勤務パターンをセットしました」。デフォルトを持つスタッフが 1 人も居なければ失敗の通知
- **シフトをコピー**: モーダルで From（開始日・終了日）/ To（開始日。終了日は自動計算して表示）/ 対象の勤務パターン（すべて / 個別）を選び
  「シフトをコピー」→ From の在籍スタッフのシフトが To に**下書きで**写る。To 側にすでにシフトがあるセルは上書きされない。
  31 日を超える From、パターン 0 件、From 開始 > 終了は日本語のエラーで拒否。前回の条件は同じ端末で次に開いたときに復元される
- **集計**: モーダルに 期間・スタッフ × （勤務日 / 休み / 各パターン）の件数が出る。セルをアサインして開き直すと即座に変わる（サーバー呼び出しなし）
- 他店舗の `tenantId` / `staffId` を Action に渡すと「店舗が見つかりません」「スタッフが見つかりません」で失敗し、行は変わらない。pgTAP に shifts の範囲 UPDATE / DELETE / `ON CONFLICT DO NOTHING` INSERT の境界が入って PASS
- 一括操作の処理中は表に `LoadingOverlay` が出て、メニューは押せない。完了で `refresh()` の再描画に置き換わる
- スマホ幅（390px）でツールバーが折り返さず、コピー・集計モーダルが収まる（集計は横スクロール）

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| v1 `fixed` / `unfixed` | `@tenant.shifts.where(date: 期間[, staff_id]).update_all(fixed: …)`。ペアは見ない。0 件でも notice は出る |
| v1 `clear` | `where(date: 期間, fixed: false[, staff_id]).destroy_all`。**`delete_pair` は呼ばれない**（Shift にコールバックなし）。夜勤（下書き）と明け（確定）なら明けだけ残る |
| v1 `set_default` | `staffs.enabled` × 期間で `default_patterns[holiday ? "holiday" : wday]` を引き、**テナントにそのパターンが存在し**かつ `shifts.exists?(staff, date)` が偽なら `build(...).save`。**`fixed` は既定の false（下書き）、`assign_pair` は呼ばない**、`available_patterns` / `available_wdays` は見ない。パターン存在チェックは YAML に消えた id が残るための守り（v2 は複合 FK の cascade で残らない） |
| v1 `count` | `staffs.enabled` × `patterns` 全件。勤務日 = `where(pattern: patterns.workday).group(:staff_id).count`、休み = **期間日数 − 勤務日数**（未アサインの日も「休み」に入る）、各パターン = `group_by([staff_id, pattern_id])` の件数。0 は空欄（休みだけ常に表示）。**退職者のシフトは母集団に入らない**（`staffs.enabled` のループ） |
| v1 コピー | `from_end − from_start + 1 > 31` なら **黙って 31 日に切る**。`offset = to_start − from_start`、`pattern_ids.include?` と `exists?(date + offset, staff)` で 1 行ずつ `save`。**`@tenant.shifts` 全件が対象なので退職者の行もコピーされる**。`fixed` は既定の false。ペアは張らない（元に夜勤・明けの両方があればそのまま写る）。前回条件は cookie 4 つ（1 か月）。`params[:patterns]` が nil（0 件）だと `rescue` → 「エラーが発生しました」 |
| v1 コピーモーダルの既定値 | To = cookie or 今月 1 日、From 開始 = To − 1 か月、From 終了 = From 開始の月末。To の終了日は「自動計算」のプレースホルダで値は出さない |
| v1 の文言 | ツール: 「すべて確定シフトにする」「すべて下書きに戻す」「下書きシフトをクリア」「デフォルト勤務パターンをセット」「シフトをコピー」「集計」。確認文は §4 に写した |
| v1 の導線 | ツールバー右: 集計（アイコン `desktop`）/ 共有 dropdown / ツール dropdown。スタッフ名 dropdown: 見出し「一括操作」+ 3 件 + 区切り + 「スタッフ情報を編集」 |
| 007 の骨格 | `Toolbar` 右の空 `Group`、`StaffNameCell` の Menu、`ShiftsClient` の `startAssign` transition と `isNavigating` の `LoadingOverlay`（007 §10.5） |
| DB | `shifts unique (staff_id, date)` → `on conflict (staff_id, date) do nothing` が使える。`(staff_id, tenant_id)` / `(pattern_id, tenant_id)` の複合 FK。RESTRICTIVE ポリシーで他店舗の行は UPDATE / DELETE の対象から外れて **0 行**、INSERT は **42501** |
| supabase-js | `upsert(rows, { onConflict: 'staff_id,date', ignoreDuplicates: true })` が `Prefer: resolution=ignore-duplicates` = `ON CONFLICT DO NOTHING`。`.select()` を付けると**挿入された行だけ**返る（DO NOTHING の行は返らない） |
| `staffs → staff_default_patterns` の埋め込み | 006 §2 で実測済み（`staffs?select=*,staff_default_patterns(day_key,pattern_id)`）。在籍スタッフ + デフォルトは 1 クエリ |
| 祝日 | `isHolidayDate()` は `server-only`（007 §3.8）。デフォルト勤務パターンの `dayKeyFor()` は Action（Server）で呼ぶので問題ない |
| Mantine 9.6 | `Menu`、`Modal`、`Checkbox` / `Checkbox.Group`、`ScrollArea`、`Table stickyHeader`。`@mantine/hooks` の `useLocalStorage<T>({ key, defaultValue, getInitialValueInEffect })`（JSON シリアライズ）。**`getInitialValueInEffect` は既定 true** = 初回描画は `defaultValue` で、storage の値は effect 後に届く。モーダルは操作後にしか mount しないので `false` にして同期的に読む |
| 期間の上限 | `MAX_TERM_DAYS = 31`（`validation/requiredNums.ts`、007 §10.5 の申し送り）。コピーの From も同じ上限 |
| `daysBetween()` | **両端を含む日数**（`daysBetween('09-01', '09-01')` = 1、`('09-01', '09-30')` = 30）。007 の `daysBetween(start, end) <= 31` は「31 日間まで」で正しい。v1 のコピーの `(from_end − from_start) + 1 > 31` も同じ値なので、コピーの上限も同じ式でよい。**日付の差（符号付き、`to − from`）は別物**なので `diffDays()` を足す（5.3） |
| Zod 4.6 | `.refine()` した object に `.safeExtend()` / `.extend()` は使えて refine は保たれる（実測）。**`.omit()` は `cannot be used on object schemas containing refinements` を投げる**（実測。モジュール読み込み時に落ちる）。refine 付きの共通スキーマからは `safeExtend` で組み上げる方向だけにする（5.5） |

---

## 3. 事前に確認したい決定

### 3.1 スキーマ変更なし。新しい RPC も足さない

> **実装後に覆った（§10.13）。** 一括操作（確定 / 下書き / クリア）は「表に出ている在籍スタッフの行だけ」を対象にする必要があり
> （§10.7）、その絞り込みは `staffs` との join になる。PostgREST の UPDATE / DELETE は別テーブルの条件で絞れないので、
> 在籍 id を URL に並べて分割する回避策が積み重なった（§10.8 / §10.11）。「1 文で書ける」という前提が崩れたため、
> 一括操作 2 種は **RPC（`set_shifts_fixed` / `clear_draft_shifts`）**にした。デフォルト勤務パターンとコピーの INSERT は
> `ON CONFLICT DO NOTHING` の 1 文で済むので PostgREST のまま。以下は当初の判断の記録。

4 つの書き込みはどれも **PostgREST の 1 文**で書ける。

| 操作 | SQL 相当 |
| --- | --- |
| すべて確定 / 下書きに戻す | `update shifts set fixed = $1 where tenant_id = $2 and date between $3 and $4 [and staff_id = $5]` |
| 下書きクリア | `delete from shifts where tenant_id = … and date between … and fixed = false [and staff_id = …]` |
| デフォルト勤務パターン | `insert into shifts (…) values (…), (…) on conflict (staff_id, date) do nothing` |
| コピー | 同上（行は Server が From の shifts を読んで組む） |

AGENTS.md の「RPC は複数行を 1 文で書き換える必要があるときだけ」に照らすと、INSERT の行を SQL 側で `insert ... select` にする RPC も書けるが、
行の組み立て（祝日判定・パターン絞り込み・在籍スタッフ絞り込み）を TS の純関数にして Vitest で固定できるほうを取る。
行数は最大 31 日 × 在籍スタッフ数で、007 の `setDefaultRequiredNums`（31 × パターン数）と同じ桁。

したがって `migrations/` の作り直し・`gen types` は不要。pgTAP だけ足す（5.6）。

### 3.2 「未アサインの日だけ埋める」は `ON CONFLICT DO NOTHING` で DB に任せる

v1 は `exists?` → `save` を 1 行ずつ回していた。v2 は既存の有無を読まず、`unique (staff_id, date)` に当てて `do nothing` にする。

- 1 文なので**全部入るか全部入らないか**。途中で複合 FK 違反（別タブでスタッフ / パターンが消えた）が出ても半端に残らない
- 読んでから書くまでの間に別タブがアサインしても、上書きしない規則は崩れない
- 「何件入ったか」は `.select('staff_id')` の行数で分かるが、v1 は件数を出していないので通知は v1 の文言のまま

### 3.3 一括操作は楽観更新しない。処理中は `LoadingOverlay`

`applyAssign` のように結果を TS で先に描くこともできる（`fixed` の一括変更は簡単）が、デフォルト勤務パターンとコピーは
Server が読む値（`staff_default_patterns`・From の shifts）に依存し、Client に無い。4 つのうち 2 つで楽観更新できないなら揃えて外す。

- 期間移動と同じ transition パターン（`isNavigating`）で表に `LoadingOverlay` を出し、ツール・スタッフメニューを `disabled` にする
- Action の `refresh()` が返す RSC で表が置き換わる（007 §3.5）。1 操作あたり 1 往復で、体感はセルのアサインと同じ
- 頻度は 1 期間に数回。何十回も押すアサインとは性質が違う

### 3.4 0 行更新は「店舗が見つかりません」と「対象なし」を切り分ける

UPDATE / DELETE は他店舗の `tenantId` でも RLS で **0 行**になるだけで、例外にならない（007 §10.6 の 4）。
`.select('id')` で件数を取り、**0 のときだけ** `tenants` を 1 件読む。見えなければ「店舗が見つかりません」、見えれば成功扱い（v1 は 0 件でも notice を出す）。

INSERT（デフォルト・コピー）は他店舗の `tenantId` だと WITH CHECK 違反の 42501 になるので `failIfForbidden()` で写す。
組んだ行が 0 件のとき（デフォルト未設定 / From にシフトが無い）は INSERT を呼ばず、3.5 / 3.6 の文言で失敗にする。

### 3.5 デフォルト勤務パターンは v1 の規則を保つ（006 §10.6 の申し送りへの回答）

| 論点 | 決定 | 理由 |
| --- | --- | --- |
| スタッフの選択可能パターンで絞るか | **絞らない**（v1 と同じ） | 設定画面が全パターンから選ばせている（006 §10.6）。ユーザーが明示的に選んだデフォルトを黙って飛ばすと「セットされない」原因が分からない。ポップオーバーは現在アサイン中のパターンを候補に残す（007 §3.7）ので、選べないパターンが入っても外せる |
| `available_wdays` を見るか | **見ない**（v1 と同じ） | デフォルトは曜日別に設定するので、勤務できない曜日には設定しなければよい |
| ペアを張るか | **張らない**（v1 と同じ） | 夜勤をデフォルトにした翌日に「明け」を自動で入れると、翌日のデフォルト（早番など）と衝突する。`ON CONFLICT DO NOTHING` の行順に依存する挙動を作らない |
| `fixed` | **下書き**（v1 と同じ） | 一括で入れたものは見直す前提 |
| デフォルトを持つスタッフが 0 人 | **失敗の通知**「デフォルト勤務パターンが設定されたスタッフがいません」（v1 は成功 notice） | 何も起きないのに「セットしました」は誤解を生む。設定画面への導線は 006 の文言（「設定したデフォルトパターンは、シフト表画面の[ツール]ボタンから一括でアサインできます」）が担う |

計画は純関数 `planDefaultPatterns(staffs, dates, holidays)`（5.2）で組む。祝日判定は Action が `isHolidayDate()` で `Set` にして渡す。

### 3.6 コピーは「在籍スタッフの行だけ・下書き・31 日超は拒否」

| 論点 | 決定 | v1 |
| --- | --- | --- |
| 母集団 | **在籍スタッフの shifts だけ**（`listShifts` → 在籍 id で絞る。007 §5.8 と同じやり方） | 全件（退職者の行も To に写る。表に出ない行が増えるだけ） |
| `fixed` | **下書き** | 同じ |
| ペア | 張らない（From に夜勤・明けの両方があればそのまま写る） | 同じ |
| From が 31 日超 | **Zod で拒否**「コピー元の期間は最大31日間です」 | 黙って 31 日に切る |
| パターン 0 件 | **拒否**「コピー対象の勤務パターンを選択してください」 | `rescue` → 「エラーが発生しました」 |
| From > To の逆順、From と To の重なり | **許す** | 同じ（既存セルは上書きされないので安全） |
| From にシフトが無い / 絞り込みで 0 件 | 失敗の通知「コピー元にシフトがありません」 | 成功 notice |
| 前回条件 | **`localStorage`**（`useLocalStorage`、キー `assift:copyShifts:<tenantId>`、Zod で `safeParse` して壊れていれば既定値） | cookie 4 つ |
| 既定値 | To = **表示中の期間の開始日**、From = **その 1 つ前の期間**（`prevStart()` → `dateRange()`）。「前の期間をこの期間へ」がいちばん多い使い方 | To = 今月 1 日、From = 先月 |
| To の終了日 | **計算して表示**（`copyEnd()`。5.3） | 「自動計算」の文字 |
| 成功後 | To が表示期間の外なら **`?start=toStart` へ移動**してコピー結果を見せる（中なら `refresh()` の再描画だけ） | 表示中の期間へ redirect（コピー先は見えない） |

前回条件の `patternIds` に消えたパターンが混ざっていれば表示時に落とす。前回のあとに追加したパターンは**未選択で復元**される（v1 の `@select_pattern_ids.include?` と同じ。
「すべて」を保存する形にすると v1 と挙動が変わるので据え置く）。復元した From / To は日付文字列のまま持ち、Zod（`dateStringSchema`）で検証する。

計画は純関数 `planCopy(source, { fromStart, toStart, patternIds, staffIds })`（5.3）で組む。

### 3.7 集計は Client が持つ shifts から計算する（001 §4.4）

`useOptimistic` の `shifts`（在籍スタッフ分）と `patterns` / `range.dates` から `countShifts()`（5.4）で組む。サーバー呼び出しなし。
アサイン直後に開いても表と一致する（v1 は `count` アクションが DB を読んでいたので、Ajax 中に開くとずれた）。

- 「休み」= 期間の日数 − 勤務日（`kind = 'workday'`）の件数。未アサインの日も休みに数える（v1 と同じ。凡例に一言添える）
- 列は全パターン（休みの種別も含む。表示順）。0 は空欄、休みだけ常に表示（v1 と同じ）
- 母集団は在籍スタッフ（v1 と同じ。退職者の行は Client に来ていない）

### 3.8 期間（≤ 31 日）の Zod を `dateTermSchema` に共通化する

`setDefaultRequiredNumsSchema` の `refine`（`end >= start && daysBetween <= 31`）を `validation/date.ts` の `dateTermSchema`
（`{ start, end }`）に出し、一括操作 3 件・デフォルト・コピーの From が共有する。`MAX_TERM_DAYS` も `date.ts` へ移す（`requiredNums.ts` から re-export して既存 import を壊さない）。

### 3.9 ツールバーは「集計 / ツール」を右に置き、共有（009）は間に入れる

v1 の並びは 集計 → 共有 → ツール。008 では集計と ツール を置き、009 が間に共有を足す。
アイコンは v1 の Font Awesome を Tabler に写す: 集計 `IconCalculator`、ツール `IconTool`、確定 `IconSquareCheck`、下書き `IconSquare`、クリア `IconEraser`、デフォルト `IconSquareRoundedPlus`、コピー `IconCopy`。

確認ダイアログは `modals.openConfirmModal`、文言は v1（§4）。`\r` は `Text` の改行に置き換える。

---

## 4. 成果物

```
supabase/
  tests/rls_tenant_isolation.sql            shifts の範囲 UPDATE / DELETE が 0 行、ON CONFLICT DO NOTHING の INSERT が 42501（3 件。plan(68) → plan(71)）
src/
  lib/
    calendar/dateRange.ts                   変更なし（prevStart をコピーモーダルの既定値で使う）
    calendar/dateString.ts (+ .test.ts)     diffDays(from, to) を追加（符号付きの日数差。daysBetween は両端を含むので流用しない）
    shifts/
      count.ts (+ .test.ts)                 countShifts(shifts, staffIds, workdayPatternIds, dayCount)（3.7 / 5.4）
      planDefaultPatterns.ts (+ .test.ts)   planDefaultPatterns(staffs, dates, holidays)（3.5 / 5.2）
      planCopy.ts (+ .test.ts)              planCopy(source, options) / copyEnd(fromStart, fromEnd, toStart)（3.6 / 5.3）
    validation/
      date.ts (+ .test.ts)                  dateTermSchema / MAX_TERM_DAYS を追加（3.8）
      requiredNums.ts                       setDefaultRequiredNumsSchema を dateTermSchema で書き直し。MAX_TERM_DAYS は re-export
      shifts.ts (+ .test.ts)                bulkShiftsSchema / setDefaultPatternsSchema / copyShiftsSchema / copyConditionsSchema（5.5）
    queries/
      staffs.ts                             listActiveStaffsWithDefaultPatterns（`staffs.select('id, staff_default_patterns(day_key, pattern_id)')`）
  app/(protected)/tenants/[tenantId]/shifts/
    actions.ts                              setShiftsFixed / clearDraftShifts / setDefaultPatterns / copyShifts を追加
    _components/
      ShiftsClient.tsx                      isBulkPending transition、count / copy モーダルの開閉、runBulk() の共通化
      Toolbar.tsx                           右側に CountButton + ToolsMenu
      ToolsMenu.tsx                         ツールの Menu（5 件。確認 → Action）
      StaffNameCell.tsx                     「一括操作」3 件を追加（スタッフ単位）
      CountModal.tsx                        集計（スタッフ × 勤務日 / 休み / 各パターン。ScrollArea + stickyHeader）
      CopyModal.tsx                         From / To / パターン。useLocalStorage で前回条件
docs/plans/008-shifts-tools/README.md       このファイル（実装後にログ追記）
AGENTS.md                                   lib/shifts の一覧に count / planDefaultPatterns / planCopy、「未アサインだけ埋める INSERT は ignoreDuplicates」の一言
```

### 画面と Action

| 操作 | 入口 | 確認 | Action | 書き込み |
| --- | --- | --- | --- | --- |
| すべて確定 | ツール / スタッフ | あり | `setShiftsFixed({ tenantId, start, end, staffId?, fixed: true })` | UPDATE `.select('id')` |
| すべて下書きに戻す | ツール / スタッフ | あり | `setShiftsFixed({ …, fixed: false })` | 同上 |
| 下書きクリア | ツール / スタッフ | あり | `clearDraftShifts({ tenantId, start, end, staffId? })` | DELETE `.eq('fixed', false).select('id')` |
| デフォルト勤務パターン | ツール | あり | `setDefaultPatterns({ tenantId, start, end })` | 在籍 + デフォルト読み → `planDefaultPatterns` → upsert ignoreDuplicates |
| シフトをコピー | ツール → CopyModal | モーダルの submit が確認を兼ねる | `copyShifts({ tenantId, fromStart, fromEnd, toStart, patternIds })` | `listShifts` + 在籍で絞る → `planCopy` → upsert ignoreDuplicates |
| 集計 | ツールバー → CountModal | — | なし | なし |

すべての Action は 007 と同じ流れ: `runAction` → Zod → `requireUser()` → `createClient()` → 書き込み → **`refresh()`**。
`start` / `end` は Client が `range`（`dateRange()` の結果）から渡す。Server は `dateTermSchema` で 31 日以内を検査する。

### 文言（v1 から移植）

- ツールメニュー: 「すべて確定シフトにする」「すべて下書きに戻す」「下書きシフトをクリア」「デフォルト勤務パターンをセット」「シフトをコピー」。ツールチップ「集計」「ツール」
- スタッフメニュー: 見出し「一括操作」、同じ 3 件
- 確認（全体）: 「この期間のシフトをすべて「確定シフト」にします。よろしいですか？」「この期間のシフトをすべて「下書き」に戻します。よろしいですか？」
  「この期間の下書きシフトをクリアしますか？ ※確定されたシフトはクリアされません。」（v1 は「この週の」だが、周期は月もあるので「この期間の」に直す）
  「スタッフ毎に設定されたデフォルトの勤務パターンをセットします。 ※アサイン済みのシフトは上書きされません。」
- 確認（スタッフ）: 「{名前} のシフトをすべて「確定シフト」にします。よろしいですか？」「{名前} のシフトをすべて「下書きシフト」に戻します。よろしいですか？」「{名前} の下書きシフトをクリアしますか？ ※確定されたシフトはクリアされません。」
- 通知: 「シフトを確定しました」「シフトを下書きに戻しました」「下書きシフトをクリアしました」「デフォルトの勤務パターンをセットしました」「シフトをコピーしました」
- 失敗: 「店舗が見つかりません」「スタッフが見つかりません」（42501 / 23503 は「スタッフまたは勤務パターンが見つかりません」+ `router.refresh()`）、
  「デフォルト勤務パターンが設定されたスタッフがいません」「この期間にセットできるデフォルト勤務パターンがありません」「コピー元にシフトがありません」「コピー元の期間は最大31日間です」「コピー対象の勤務パターンを選択してください」「期間が正しくありません」
- コピーモーダル: 見出し「シフトをコピー」、案内「コピー先がすでにアサイン済みの場合は上書きされません」、「コピー元 (From) の期間」「開始日」「終了日」「※コピー可能な期間は最大1ヶ月間です」、
  「コピー先 (To) の期間」「開始日」「終了日」（計算値を readonly で表示）、「コピー対象の 勤務パターン」「すべて」、ボタン「シフトをコピー」
- 集計モーダル: 見出し「アサイン数集計」、右に `9/1〜9/30`、列「勤務日」「休み」+ パターン名。注記「休み = 期間の日数 − 勤務日数（未アサインの日を含む）」

---

## 5. 設計の要点

### 5.1 Action の骨子

```ts
export async function setShiftsFixed(input: { tenantId; start; end; staffId?: string | null; fixed: boolean }) {
  return runAction(async () => {
    const parsed = bulkShiftsSchema.parse(input)
    await requireUser()
    const supabase = await createClient()
    let query = supabase.from('shifts').update({ fixed: parsed.fixed })
      .eq('tenant_id', parsed.tenantId).gte('date', parsed.start).lte('date', parsed.end)
    if (parsed.staffId) query = query.eq('staff_id', parsed.staffId)
    const { data, error } = await query.select('id')
    if (error) throw error
    if (data.length === 0) await ensureTenantVisible(supabase, parsed.tenantId)   // 3.4
    refresh()
  })
}
```

- `ensureTenantVisible()` は `setDefaultRequiredNums` の「tenants を 1 件読んで切り分ける」を関数に出したもの。`staffId` 付きで 0 行のときはスタッフの存在も見て「スタッフが見つかりません」にする
- `clearDraftShifts` は `.delete().eq('fixed', false)` で同じ形
- `setDefaultPatterns`: `listActiveStaffsWithDefaultPatterns(tenantId)` → デフォルトを持つスタッフが 0 なら `fail('デフォルト勤務パターンが設定されたスタッフがいません')`（在籍 0 人で他店舗の可能性があるときは `ensureTenantVisible`）
  → `planDefaultPatterns(staffs, datesBetween(start, end), new Set(dates.filter(isHolidayDate)))` → 0 行なら `fail('この期間にセットできるデフォルト勤務パターンがありません')`（例: `holiday` キーだけ設定していて期間に祝日が無い。前の文言と分ける）
  → `upsert(rows, { onConflict: 'staff_id,date', ignoreDuplicates: true })`
- `copyShifts`: `listShifts(tenantId, fromStart, fromEnd)` と `listActiveStaffs(tenantId)` を `Promise.all` → `planCopy(...)` → 0 行なら `fail('コピー元にシフトがありません')` → 同じ upsert。
  Client から届く `patternIds` は**絞り込み条件としてだけ**使い、INSERT する `pattern_id` は From の shifts（RLS 越しに読んだ自店舗の行）から取る
- INSERT する行は (staff_id, date) が行の中で重複しない（デフォルト: staffs × dates、コピー: 1 スタッフ 1 日 1 行の写像）。
  仮に重複しても **`DO NOTHING` は同じ文の中のキー重複を許容する**（1 行目が入り 2 行目は無視。実測。§10.11）。
  `cannot affect row a second time` になるのは `DO UPDATE` だけなので、ページング中の競合で同じ行を 2 回読んでも落ちない
- INSERT のエラー: 42501 → 「店舗が見つかりません」、23503 → 「スタッフまたは勤務パターンが見つかりません」（別タブでの削除。Client は `router.refresh()`）

### 5.2 `planDefaultPatterns()`

```ts
type StaffDefaults = { id: string; defaults: Partial<Record<DayKey, string>> }
export function planDefaultPatterns(
  staffs: StaffDefaults[], dates: string[], holidays: Set<string>
): { staffId: string; date: string; patternId: string }[]
// staffs × dates で dayKeyFor(date, holidays.has(date)) のキーを引き、値があれば 1 行。順序は staffs → dates
```

Vitest: 平日 / 祝日（`holiday` が曜日に勝つ）/ キー無しはスキップ / デフォルト空のスタッフは 0 行 / 日付 0 件。

### 5.3 `planCopy()`

```ts
// dateString.ts
export function diffDays(from: string, to: string): number   // dayjs(to).diff(from, 'day')。符号付き。diffDays('09-01', '09-01') = 0

// planCopy.ts
export function copyEnd(fromStart: string, fromEnd: string, toStart: string): string
// addDays(toStart, diffDays(fromStart, fromEnd))。daysBetween（両端を含む）を足すと 1 日ずれる
export function planCopy(
  source: ShiftCell[],
  options: { fromStart: string; toStart: string; patternIds: Set<string>; staffIds: Set<string> }
): { staffId: string; date: string; patternId: string }[]
// offset = diffDays(fromStart, toStart)（負も可）。patternIds と staffIds の両方に含まれる行だけ、date を addDays(date, offset) にして返す。fixed は付けない（Action が false を入れる）
```

Vitest: 正のオフセット / 負のオフセット / 同じ期間（offset 0）/ 月跨ぎ / パターン絞り込み / 退職者（staffIds 外）の除外 / From が空。
`copyEnd` は From が 1 日（`fromStart = fromEnd`）なら `toStart` そのもの、9/1〜9/30 → 10/1 なら 10/30。

### 5.4 `countShifts()`

```ts
export type StaffCount = { workdays: number; daysOff: number; byPattern: Map<string, number> }
export function countShifts(
  shifts: ShiftMap, staffIds: string[], workdayPatternIds: Set<string>, dayCount: number
): Map<string, StaffCount>
// staffIds ごとに初期化（0 件のスタッフも行を持つ）。shifts を 1 周して byPattern を加算、workday なら workdays も加算。daysOff = dayCount − workdays
```

Vitest: 0 件のスタッフ / 出勤日と休みの混在 / 期間外の shift は来ない前提（Client の shifts は期間分だけ）。

### 5.5 Zod（抜粋）

```ts
// validation/date.ts
export const MAX_TERM_DAYS = 31
export const dateTermSchema = z.object({ start: dateStringSchema, end: dateStringSchema })
  .refine((v) => v.end >= v.start && daysBetween(v.start, v.end) <= MAX_TERM_DAYS, { error: '期間が正しくありません' })

// validation/shifts.ts
// refine 付きの dateTermSchema から safeExtend で「足す」方向だけで組む（.omit() は例外を投げる。§2）
export const clearDraftShiftsSchema = dateTermSchema.safeExtend({
  tenantId: tenantIdSchema,
  staffId: staffIdSchema.nullish(),
})
export const bulkShiftsSchema = clearDraftShiftsSchema.safeExtend({
  fixed: z.boolean({ error: '下書き / 確定の指定が正しくありません' }),
})
export const setDefaultPatternsSchema = dateTermSchema.safeExtend({ tenantId: tenantIdSchema })

const COPY_TERM_ERROR = { error: 'コピー元の期間は最大31日間です' }
export const copyShiftsSchema = z
  .object({
    tenantId: tenantIdSchema,
    fromStart: dateStringSchema,
    fromEnd: dateStringSchema,
    toStart: dateStringSchema,
    patternIds: z.array(patternIdSchema).min(1, { error: 'コピー対象の勤務パターンを選択してください' }),
  })
  .refine((v) => v.fromEnd >= v.fromStart, { error: 'コピー元の期間が正しくありません' })
  // daysBetween は両端を含むので、dateTermSchema と同じ `<= MAX_TERM_DAYS` が「31 日間まで」（v1 の `(to − from) + 1 > 31` と同じ）
  .refine((v) => daysBetween(v.fromStart, v.fromEnd) <= MAX_TERM_DAYS, COPY_TERM_ERROR)
/** localStorage の前回条件。壊れていれば既定値に戻す */
export const copyConditionsSchema = z.object({
  fromStart: dateStringSchema, fromEnd: dateStringSchema, toStart: dateStringSchema, patternIds: z.array(z.string()),
})
```

Vitest（`shifts.test.ts`）に「From 31 日（9/1〜10/1）は通り、32 日（9/1〜10/2）は落ちる」「From > To の逆順は通る」「`staffId` 省略 / null / 他形式」を置く。

### 5.6 pgTAP（`rls_tenant_isolation.sql` に 3 件）

```sql
-- A が B の期間を範囲 UPDATE / DELETE しても 0 行（RLS は例外ではなく 0 行になる。3.4 の前提）。
-- データ変更の CTE は文のトップレベルにしか置けない（スカラー副問い合わせの中に書くと
-- `WITH clause containing a data-modifying statement must be at the top level`）ので、WITH を先頭に出して is() を SELECT する
with u as (
  update public.shifts set fixed = true
   where tenant_id = :tenant_b and date between '2026-10-01' and '2026-10-31'
   returning 1
)
select is((select count(*) from u), 0::bigint, '別テナントの shifts は範囲 UPDATE で 0 行');

with d as (
  delete from public.shifts where tenant_id = :tenant_b and fixed = false returning 1
)
select is((select count(*) from d), 0::bigint, '別テナントの shifts は DELETE で 0 行');

-- ON CONFLICT DO NOTHING でも RLS の WITH CHECK が先に評価される（実測済み。§9 の 2 回目）。
-- あえて B の fixture と同じ日付（2026-10-01 = 衝突する行）で試し、DO NOTHING で黙って抜けるのではなく 42501 になることを固定する
select throws_ok(
  format($$insert into public.shifts (tenant_id, staff_id, pattern_id, date) values (%L, %L, %L, '2026-10-01')
           on conflict (staff_id, date) do nothing$$, :tenant_b, :staff_b, :pattern_b),
  '42501', null, '別テナントへの ON CONFLICT DO NOTHING の INSERT は衝突する行でも拒否'
);
```

3 件とも使い捨てテーブルで同じ形を流して PASS を確認した（RLS 越しの UPDATE / DELETE が 0、自分の行は 1、衝突する越境 INSERT は 42501。
自分の行への `DO NOTHING` は 0 行・エラーなしで `returning` が空 = `.select()` が挿入行だけ返す根拠）。
UPDATE / DELETE のテストは B の行を条件に含めるだけなので、他のテストの fixture に影響しない。

### 5.7 `ShiftsClient` の変更

```ts
const [isBulkPending, startBulk] = useTransition()
const runBulk = (action: () => Promise<ActionResult>, successMessage: string) =>
  startBulk(async () => {
    const result = await action()
    notifications.show(result.ok ? { message: successMessage, color: 'green' } : { message: result.error, color: 'red' })
    if (!result.ok) router.refresh()
  })
```

- `LoadingOverlay visible={isNavigating || isBulkPending}`。`Toolbar`（期間ナビも含む）/ `StaffNameCell` に `disabled={isNavigating || isBulkPending}` を渡す
- コピー成功後、`toStart` が `range.start..range.end` の外なら `navigate(toStart)`（3.6）。`refresh()` の再描画は現在の期間分なので、移動は Client 側で行う
- `confirmSetDefaultRequiredNums` も `runBulk` に寄せる（`startAssign` から分ける。アサインの transition は楽観更新の寿命に使っているため）
- `CalendarTable` に `onBulk(staffId, kind)` と `disabled` を足し、`StaffNameCell` へ渡す（セルの props は変えない）
- `CountModal` / `CopyModal` は `noteDate` と同じく開いているときだけ mount
- `CopyModal` の props: `tenantId` / `range` / `cycle` / `startOfWeek` / `patterns`。既定値は `useMemo(() => defaultCopyConditions(cycle, startOfWeek, range))`。
  `useLocalStorage({ key: `assift:copyShifts:${tenantId}`, defaultValue, getInitialValueInEffect: false })` で**同期的に読み**（§2。既定の true だと初回描画が defaultValue になり、`useState` の初期値に写すと storage の値を取りこぼす）、
  読んだ値は `copyConditionsSchema.safeParse` に通し、失敗なら既定値。フォームの state は storage の値そのもの（`setValue` で更新）にし、別の `useState` に写さない。submit 成功時の値が次回の初期値になる

### 5.8 集計モーダルの表

`Modal size="xl"` + `ScrollArea`（横）+ `Table stickyHeader withTableBorder withColumnBorders`。先頭列（名前）は `position: sticky; left: 0`
を CSS Modules で 1 クラス書く（`CalendarTable.module.css` の sticky を再利用しない。列の性質が違う）。列幅は名前 100px、他は `ta="center"`。

---

## 6. 手順

1. ブランチ `008-shifts-tools`（`007-shifts-calendar` から）
2. **lib**（Vitest を先に書く）: `dateString.ts` の `diffDays` → `validation/date.ts` の `dateTermSchema`（`requiredNums.ts` を書き直し、既存テストが通ることを確認）→ `shifts/count` → `planDefaultPatterns` → `planCopy` → `validation/shifts.ts` の 4 スキーマ
3. **queries**: `listActiveStaffsWithDefaultPatterns`
4. **actions**: `setShiftsFixed` → `clearDraftShifts` → `setDefaultPatterns` → `copyShifts`。`ensureTenantVisible()` を切り出し、`setDefaultRequiredNums` も使う
5. **pgTAP**: 5.6 の 3 件 → `plan(71)` → `npx supabase test db`
6. **UI**: `ShiftsClient` の `runBulk` / `isBulkPending` → `ToolsMenu` + `Toolbar` 右側（一括 3 件が先に動く状態にする）→ `StaffNameCell` の一括操作 → デフォルト勤務パターン → `CountModal` → `CopyModal`
7. AGENTS.md の追記（§4）
8. `format:check` / `lint` / `typecheck` / `test` / `build` / `test db`
9. ブラウザで §1 の完了条件を seed 店舗で通す。確認する DB の状態:
   - 全体「すべて確定」→ `select count(*) from shifts where fixed` が期間の全行。スタッフ単位「下書きに戻す」→ そのスタッフだけ false
   - 夜勤（下書き）+ 明け（確定）を作って「下書きクリア」→ 明けだけ残る（v1 と同じ。§2）
   - 設定でスタッフ 2 人に 月〜金 = 早番、`holiday` = 休み を入れ、9 月でセット → 9/22（火・国民の休日）が「休み」、平日が早番、既にアサイン済みのセルは変わらない。もう一度押しても行数が増えない（`DO NOTHING`）
   - 9 月 → 10 月にコピー（パターン「早番」だけ）→ 10 月へ移動して早番だけ下書きで入っている。10 月にあらかじめ置いたセルは残る。To の終了日が `10/30`（From 9/1〜9/30）と表示される。31 日ちょうど（9/1〜10/1）は通り、32 日（9/1〜10/2）は拒否。モーダルを閉じて開き直す・リロードしても前回条件が復元される
   - 集計: 早番 3 件・夜勤 1 件・明け 1 件のスタッフ → 勤務日 4、休み 26（30 日）、早番 3、夜勤 1、明け 1。セルを 1 つ足して開き直すと変わる
   - 認証済み JWT で他店舗の `tenantId` を `setShiftsFixed` に渡す → 「店舗が見つかりません」、B の行は不変。`copyShifts` に他店舗 → 「店舗が見つかりません」（42501）
   - 390px: ツールバーが 1 行に収まる。コピー・集計モーダルが開く
10. 実装ログをこのファイルに追記して確認を取る

---

## 7. スコープ外

- 自動アサイン（ツールメニューの最後の項目。001 §1）。メニューに無効項目も置かない（007 §3.4 と同じ理由）
- 一括操作の楽観更新（3.3）。体感が問題になったら `fixed` の一括変更だけ `applyBulkFixed` を足す
- デフォルト勤務パターンをスタッフの選択可能パターンで絞る（3.5）。製品判断が変わったら `planDefaultPatterns` に `patternIds` を渡すだけ
- コピーでペアを張り直す、確定のまま写す（3.6）
- 集計の PDF / CSV への出力（010 は表本体だけ。v1 も無い）
- 一括操作の「何件変わったか」の表示（3.2）。`.select()` の行数で出せるので、要望があれば通知に足す

---

## 8. 001 / 007 からの変更点（まとめ）

| 項目 | 001 / 007 / v1 | 008 |
| --- | --- | --- |
| 一括 INSERT | v1 は `exists?` + `save` を 1 行ずつ | `INSERT ... ON CONFLICT DO NOTHING` 1 文（3.2） |
| 新 RPC | 001 §4.4 は `setFixed` / `clearDrafts` / `setDefaultPatterns` / `copyShifts` を Action として列挙 | すべて PostgREST の 1 文。RPC もスキーマ変更も無し（3.1） |
| コピーの母集団 | v1 は退職者の行も | 在籍スタッフだけ（3.6） |
| コピーの 31 日超 | v1 は黙って切る | 拒否（3.6） |
| コピーの前回条件 | v1 は cookie、001 は「localStorage」 | `useLocalStorage` + Zod（3.6） |
| コピーの既定値 | v1 は今月 / 先月 | 表示中の期間 / その前の期間（3.6） |
| 0 件のときの通知 | v1 は成功 | デフォルト未設定・コピー元なしは失敗の文言（3.4 / 3.5 / 3.6） |
| 集計の計算 | v1 は Server（別リクエスト） | Client の shifts から（3.7。001 の決定どおり） |
| 期間の Zod | 007 は `requiredNums.ts` 内 | `dateTermSchema` を `date.ts` に共通化（3.8） |
| クリアの確認文 | v1「この週の」 | 「この期間の」（§4） |

---

## 9. セルフレビューでの修正（2026-09-18）

プランを書いたあとに全体を読み直し、断言している API と数値を実物で確かめた。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | **`daysBetween()` は両端を含む日数**（`('09-01', '09-30')` = 30）なのに、コピーの終了日を `toStart + daysBetween(fromStart, fromEnd)`、オフセットを `daysBetween(fromStart, toStart)` と書いていた。どちらも 1 日ずれ、負のオフセット（過去へのコピー）は符号も崩れる | 符号付きの差 `diffDays(from, to)` を `dateString.ts` に足し、`copyEnd()` / `planCopy()` はそれを使う（5.3）。Vitest に「From 1 日なら To の終了日 = 開始日」「9/1〜9/30 → 10/1 なら 10/30」を置く |
| 2 | 同じ誤解から、コピーの上限を `daysBetween < 31`（= 30 日間まで）と書き、007 の `<= 31` を「31 日ちょうどになりうるから」と別扱いにしていた。v1 の `(from_end − from_start) + 1 > 31` は両端を含む 31 日間までなので、007 と同じ式でよい | `copyShiftsSchema` も `daysBetween(...) <= MAX_TERM_DAYS`（5.5）。§6 の検証に「31 日（9/1〜10/1）は通り、32 日（9/1〜10/2）は落ちる」を追加 |
| 3 | **Zod 4.6 の `.omit()` は refine 付きの object で例外を投げる**（`node -e` で実測。`.safeExtend()` / `.extend()` は refine を保つ）。`bulkShiftsSchema.omit({ fixed: true })` はモジュール読み込み時に落ちる | `clearDraftShiftsSchema` を `dateTermSchema.safeExtend(...)` で作り、`bulkShiftsSchema` はそこへ `fixed` を足す（5.5）。§2 に記録 |
| 4 | **`useLocalStorage` は既定 `getInitialValueInEffect: true`** で、初回描画は `defaultValue`、storage の値は effect 後に届く。`useState` の初期値に写す書き方だと前回条件を取りこぼす | `getInitialValueInEffect: false` で同期的に読み、フォームの state は storage の値そのもの（`setValue`）にする（5.7）。モーダルは操作後にしか mount しないので SSR の心配は無い |
| 5 | pgTAP の `ON CONFLICT DO NOTHING` の INSERT を、B の fixture と**衝突しない**日付で試していた。それでは「WITH CHECK が先に評価される」というコメントを何も検証していない | 衝突する日付（`2026-10-01`）で 42501 を期待する（5.6）。予想と違えば実測に合わせて理由を書く。どちらでも B の行は増えない |
| 6 | デフォルト勤務パターンの「0 行」を 1 つの文言にしていた。`holiday` キーだけ設定した店舗で祝日の無い期間にセットすると「設定されたスタッフがいません」と出て、設定画面を見に行っても設定はある | 「設定されたスタッフがいません」（デフォルトが 1 件も無い）と「この期間にセットできるデフォルト勤務パターンがありません」（あるが期間に当たらない）に分ける（5.1 / §4） |
| 7 | コピー先が表示期間の外のとき、v1 と同じく現在の期間を再描画するだけで、コピー結果が見えない。既定値（To = 表示中の期間）なら問題ないが、過去や 2 期間先へコピーしたときに「コピーしました」だけでは確認できない | 成功後に `toStart` が表示期間の外なら `navigate(toStart)` で移動する（3.6 / 5.7）。`refresh()` は現在ルートの再描画なので、移動は Client が行う |
| 8 | Client から届く `patternIds` の扱いと、1 文の INSERT の中でキーが重複しない根拠を書いていなかった | `patternIds` は絞り込みにだけ使い、INSERT する `pattern_id` は From の行から取ること、行の (staff_id, date) は構造上重複しないこと（重複すると `cannot affect row a second time`）を 5.1 に追記 |
| 9 | `CalendarTable` の props 変更、期間ナビの `disabled`、手順の `diffDays` が抜けていた | 5.7 と §6 に追記 |

確認したが変更しなかったもの:

| 確認 | 結果 |
| --- | --- |
| `upsert(..., { ignoreDuplicates: true })` | `@supabase/postgrest-js` の d.ts に `onConflict` / `ignoreDuplicates` / `count` / `defaultToNull` がある（supabase-js 2.116） |
| Tabler のアイコン名 7 つ | `IconCalculator` / `IconTool` / `IconSquareCheck` / `IconSquare` / `IconEraser` / `IconSquareRoundedPlus` / `IconCopy` すべて `@tabler/icons-react` に存在 |
| `refine` 後の `safeExtend` の連鎖 | 2 段重ねても refine は保たれる（実測） |
| 007 の `dateTermSchema` 相当の `<= 31` | 両端を含む 31 日間まで。month 周期の最長（31 日の月）がちょうど通る。ずれていない |

### 2 回目のレビュー（2026-09-18）

1 回目の修正を含めて全体を読み直し、pgTAP に書いた SQL をローカルの Supabase（使い捨てテーブル、ロールバック）で流した。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | **pgTAP の UPDATE / DELETE のテストが構文エラーだった。** `select is((with u as (update …) select count(*) from u), …)` は `WITH clause containing a data-modifying statement must be at the top level` で落ちる | `with u as (update … returning 1) select is((select count(*) from u), 0::bigint, …)` の形（WITH を文の先頭に出す）に書き直した（5.6）。この形で `plan(4)` の 4 件が PASS することを実測 |
| 2 | 1 回目で「予想と違えば実測に合わせる」と逃げていた 42501 の断言 | 実測した。他人の行と**衝突する** `INSERT … ON CONFLICT DO NOTHING` は `new row violates row-level security policy`（42501）。自分の行との衝突は 0 行・エラーなしで `returning` が空。5.6 のヘッジを外し、実測の結果に置き換えた |
| 3 | §4 の成果物一覧の `countShifts(shifts, staffIds, patterns, dayCount)` と 5.4 の `workdayPatternIds: Set<string>` が食い違っていた | §4 を 5.4 に合わせた |
| 4 | 前回条件の復元で「消えたパターンは落とす」とだけ書き、**あとから追加したパターン**をどう扱うかが無かった | 未選択で復元（v1 と同じ）と明記（3.6）。「すべて」を保存する案は v1 と挙動が変わるので採らない |

確認したが変更しなかったもの:

| 確認 | 結果 |
| --- | --- |
| コピー成功後の `refresh()` + `navigate(toStart)` | To が表示期間の外だと現在期間の RSC を 1 回無駄に受ける。Action は表示期間を知らないので避けられず、頻度も低い。据え置き |
| `Modal` の中の `DateInput`（コピーモーダル） | Mantine の Modal は overlay の `onClick` で閉じるので、Portal に出たカレンダーを押しても閉じない。007 §5.7 の `withinPortal: false` は Popover 固有の話で、ここでは不要 |
| `staffId` 付きの一括操作で 0 行 | 「店舗が見える → スタッフが見える → 対象 0 件 = 成功」の順で切り分ける（5.1）。他店舗の `staffId` は 2 段目で「スタッフが見つかりません」 |
| `bulkShiftsSchema` の期間上限 | Client が渡す `range` は `dateRange()` の結果で最長 31 日（両端含む）。`dateTermSchema` の `<= 31` を常に通る |

### 3 回目のレビュー（2026-09-18）

2 回のレビューで直したのはいずれも「コードを見ずに断言した箇所」だったので、まだ実測していない断言だけを狙って確認した。指摘なし。

| 確認 | 結果 |
| --- | --- |
| supabase-js の `ignoreDuplicates` | `Prefer: resolution=${ignoreDuplicates ? 'ignore' : 'merge'}-duplicates` を送る（`postgrest-js` の実装）。§2 の記述どおり |
| `useLocalStorage` の `getInitialValueInEffect: false` | `useState(readStorageValue(getInitialValueInEffect))` で、`false` なら `useState` の初期値として storage を同期的に読む。`true` は `skipStorage` 扱いで defaultValue（5.7 の前提どおり） |
| Mantine `Modal` の閉じ方 | `ModalBaseOverlay` の `onClick` で `closeOnClickOutside && onClose()`。外側クリック検知ではないので、Portal に出た `DateInput` のカレンダーを押しても閉じない（2 回目の据え置き判断の裏取り） |
| `diffDays` の符号 | `dayjs('09-05').diff('09-01', 'day')` = 4、`dayjs('08-30').diff('09-01', 'day')` = −2。過去へのコピーで負のオフセットになる（5.3 の前提どおり） |

---

## 10. 実装ログ（2026-09-18）

ブランチ `008-shifts-tools`（`007-shifts-calendar` から）。Next 16.3.5 / Mantine 9.6 / Supabase CLI 2.117 / Zod 4.6。

### 10.1 成果物

§4 の構成どおり。プランに無かった追加・変更:

| パス | 内容 |
| --- | --- |
| `src/lib/calendar/dateString.ts` の `formatSlashDate()` | **追加**。`YYYY-MM-DD` → `YYYY/MM/DD`。計算したコピー先の終了日を、隣の日付ピッカー（`valueFormat="YYYY/MM/DD"`）と同じ表記で出すため（§10.4 の 1） |
| `_components/bulkOperations.ts` | **追加**。一括操作 3 種の確認文・通知文・見出しを 1 か所に持つ。`ToolsMenu`（全体）と `StaffNameCell`（スタッフ単位）が同じ定義を使い、`ShiftsClient` が確認ダイアログを出す |
| `_components/CountModal.module.css` | 集計のスタッフ名列を sticky にする 1 クラス（§5.8 どおり） |
| `countShifts()` の引数 | プランは `dayCount: number` だったが **`dates: string[]`** にした。期間で絞る必要があった（§10.5 の 1）うえ、日数と日付集合が食い違う余地も消える |
| `insertPlannedShifts()` | §5.1 に書いた upsert を、デフォルトとコピーで共有する関数に切り出した |
| `MAX_TERM_DAYS` | プラン §3.8 は「`requiredNums.ts` から re-export して既存 import を壊さない」としていたが、**外部からの import が 1 件も無かった**ので `date.ts` へ移すだけにした（使われない re-export を残さない） |

### 10.2 プランどおり確認できたこと

- スキーマ変更・新 RPC なしで 4 つの書き込みが PostgREST の 1 文に収まった（§3.1）。`migrations/` と `gen types` は触っていない
- `upsert(rows, { onConflict: 'staff_id,date', ignoreDuplicates: true })` が `ON CONFLICT DO NOTHING` になり、2 回押しても行が増えない（22 → 22）
- `dateTermSchema.safeExtend()` で refine が保たれる。`.omit()` を避けた設計（§2）のとおり、`clearDraftShiftsSchema` → `bulkShiftsSchema` の順で組めた
- `useLocalStorage({ getInitialValueInEffect: false })` で前回条件が初回描画から入る。リロード後も復元される
- **越境の 3 経路を認証済みトークンで実測**（画面からは他店舗に到達できないため REST を直接叩いた）:
  範囲 UPDATE → `[]`（0 行）、範囲 DELETE → `[]`（0 行）、`ON CONFLICT DO NOTHING` の INSERT → `42501`。他店舗の行は件数も `fixed` も変わらない。
  §3.4 の「0 行と 42501 を別々に扱う」前提がそのまま成り立っている
- 祝日が曜日より優先される: 平日に早番、`holiday` に休みを設定して 9 月にセットすると、9/21・9/22・9/23 の 3 日が「休み」

### 10.3 検証結果

```
npm run format:check / lint / typecheck / build → OK
npm test        → 31 files / 258 tests passed（008 で追加したのは 3 ファイル / 約 35 件）
npx supabase db reset && npx supabase test db → 72 tests PASS
```

ブラウザ（Chromium / Playwright、1280px と 390px）で §6 の手順 9 を 38 項目の自動チェックにして通した。**console エラー 0 件。**
画面の操作結果はすべて psql で DB の状態と突き合わせている。

| 検証 | 結果 |
| --- | --- |
| ツールメニュー | 5 件（確定 / 下書き / クリア / デフォルト勤務パターン / コピー） |
| 集計 | 早番 1・夜勤 1・明け 1 のスタッフで 勤務日 2 / 休み 28（30 日 − 2） |
| すべて確定 | 確認文が v1 どおり → 期間の 4 行すべて `fixed = true` |
| スタッフ単位で下書きに戻す | 確認文に「青木 隆行 の」が入る → 本人 0 件確定・他スタッフは確定のまま |
| 下書きクリア | 夜勤（下書き）+ 明け（確定）→ **明けだけ残る**（v1 と同じくペアは追わない） |
| デフォルト勤務パターン | 祝日 3 日が「休み」、アサイン済みの 9/1（夜勤・確定）は不変、入った行は下書き、2 回目で増えない |
| コピー | 既定値が「表示期間 ← その前の期間」、終了日 `2026/10/30` を計算表示、早番だけ 18 行が下書きで入り、先にあった 10/1 の明け（確定）は不変 |
| コピー後の移動 | コピー先が表示期間の外なので `?start=2026-10-01` へ移る |
| 前回条件 | リロードしても日付と勤務パターンの選択が戻る |
| 拒否 | 32 日の From =「コピー元の期間は最大31日間です」、パターン 0 件 =「コピー対象の勤務パターンを選択してください」 |
| 対象 0 件 | シフトが 1 件も無い期間で一括確定 → 成功の通知（v1 と同じ。店舗は見えているため） |
| デフォルト未設定 | 「デフォルト勤務パターンが設定されたスタッフがいません」 |
| 390px | ページの横スクロール 0px、ツールバーが収まる、コピーモーダル 351px |

### 10.4 ブラウザ検証で見つけた修正

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **コピー先の終了日だけ表記が違った。** 日付ピッカーは `2026/10/01`、計算した終了日は `2026-10-30` と、同じフォームで 2 つの書式が並んでいた | `formatSlashDate()` を足して隣に合わせた | ブラウザで `2026/10/30` を確認。Vitest 1 件 |
| 2 | **日付を手入力するとカレンダーが開いたままになり、勤務パターンのチェックボックスを覆っていた。** その状態でチェックを押すとクリックがカレンダーの日付に吸われ、**コピー先が 10/01 → 10/11 に黙って変わった**（実測）。007 §10.7 の「カレンダーが更新ボタンを覆う」と同じ種類で、今回は誤りに気付けないぶん質が悪い | 3 つの日付欄を **`DatePickerInput` の `dropdownType="modal"`** にした。カレンダーが別モーダルに出るので、フォームの要素と重なりようがない。`DateInput` は開閉を制御できず、並び替えでも「上の日付欄のカレンダーが下の日付欄を覆う」形は消えないため、構造ごと変えた | `elementFromPoint` のヒットテスト（007 §10.7 と同じ手法）。修正前は 早番 の位置に `DateInput-day "11"`、修正後は別モーダルのオーバーレイ。手入力を失う代わりに、選択はカレンダーで完結する |

### 10.5 コードレビューでの修正

実装を別の目で読み直してもらった。**テナント境界・Zod・`ON CONFLICT` の重複・`diffDays` と `daysBetween` の使い分けはいずれも問題なし。**指摘は 1 件で、これを直した。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **集計が期間外のシフトを数えていた。** `applyAssign()` はペアを翌日に置くので、**期間の最終日に夜勤をアサインすると楽観更新の `ShiftMap` に `end + 1` の「明け」が入る**。`countShifts()` は範囲で絞っていなかったのでそれを数え、ペアが出勤日のパターンなら休み（`日数 − 勤務日`）が負にもなりうる。プラン §5.4 の「期間外の shift は来ない前提」が `applyAssign` と矛盾していた | 引数を `dayCount: number` → `dates: string[]` に変え、`Set` で期間外を落とす。日数もこの配列から取るので、日数と日付集合が食い違う余地も消える | Vitest 1 件（9/30 夜勤 + 10/1 早番 → 勤務日 1・休み 29・早番は数えない）。ブラウザでも 9/30 に夜勤を置いて集計を開き、明けが 1 件（9/3 の分だけ）のままであることを確認 |

あわせて、レビューが「指摘としては挙げないが」として触れた 2 点も直した。

- 集計の表に `stickyHeader` を付けた（プラン §5.8 に書いていたのに漏れていた）
- コピー元が 31 日を超えたとき、**送信前にその場でエラーを出す**ようにした（正は Zod のままで、押す前に理由が見える）

`MAX_TERM_DAYS` の re-export 省略（10.1）は、外部の import が無いことを確認したうえで意図的に残している。

### 10.6 009 以降への申し送り

- **ツールバーの並びは 集計 → （ここに共有）→ ツール。** `Toolbar.tsx` の右 `Group` にコメントで位置を示してある。009 の共有ドロップダウンと 010 の PDF / CSV はその間に入る
- **`refresh()` は現在の期間しか描き直さない。** コピーのように別の期間へ書き込む操作を足すときは、Client 側で `navigate()` して見せる（§3.6 / `showCopyResult`）
- **モーダルの中で日付を選ばせるときは `DatePickerInput` の `dropdownType="modal"`**（10.4 の 2）。ポップオーバー型のカレンダーは下の要素を覆い、クリックを吸う
- **`lib/shifts/` の純関数は「行を組む」ところまで**で、書き込みは Action が持つ。010 の PDF / CSV も同じ形にできる（`countShifts` はそのまま集計表に使える）
- 一括操作の pgTAP は `rls_tenant_isolation.sql` の「一括操作（008）」節。**`shifts` に操作を足したらここにも足す**

### 10.7 2 回目のレビューでの修正（2026-09-18）

10.5 の修正を含めて実装をもう一度読み直した。**10.5 以降に変えた箇所（日付ピッカーの差し替え・集計の期間絞り込み・コピーの入力検証）は誰も見ていなかった**ので、そこを重点に見た。
correctness の欠陥 3 件と、アクセシビリティ 2 件を直した。すべてブラウザで再現してから直している。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **一括操作が表に出ていない退職者の行まで書き換えていた。** `tenant_id` + 日付だけで絞っていたので、「下書きシフトをクリア」で**画面に出ていない退職者の下書きが黙って消える**。復帰させると予定が空になる。v1 も同じ挙動だが、コピーを在籍スタッフに限った §3.6 の決定と食い違っていた（見えないデータの削除なので、コピーより質が悪い） | `bulkTargetStaffIds()` を足し、全体への一括操作は在籍スタッフの id で `.in('staff_id', …)` する。スタッフ指定の呼び出しは、その行が表に出ている時点で在籍者なのでそのまま | 退職者の下書きを 1 件仕込んでクリア → 修正前は在籍者 0 / 退職者 0（消えた）、修正後は **在籍者 0 / 退職者 1**。検証スクリプトに常設 |
| 2 | **「ツール」ボタンにメニューの aria が付いていなかった。** `MenuTarget` と `ActionIcon` の間に `Tooltip` を挟んでいたため、Menu が注入する `aria-haspopup` / `aria-expanded` / `aria-controls` / `id` がボタンに届かず、ドロップダウンの `aria-labelledby` が**存在しない id** を指していた（007 §10.6 の 3 と同じ種類） | Tooltip を外し、hover の説明は `title` で出す。`aria-label` はそのまま | 属性を実測。修正前は 3 つとも `null` で labelledby が解決せず、修正後は `menu` / `true` / dropdown の id が付き解決する。スタッフ名のメニュー（Tooltip を挟んでいない）は元から正しかった |
| 3 | **1 行も入らなくても緑の成功を出していた。** デフォルト勤務パターンを 2 回続けてセットしたときや、すべて埋まった期間にコピーしたときに「セットしました」と出る。何も起きていないのに起きたように見える。0 人のときは失敗にしているのに、ここだけ素通しだった | upsert に `count: 'exact'` を付けて実際に入った行数を返し、0 件なら灰色で「すべてアサイン済みのため、追加したシフトはありません」と伝える。**件数そのものは出さない**（§3.2 の決定は保つ） | REST で `Prefer: count=exact` の `Content-Range` が 1 回目 `*/1`・2 回目 `*/0` になることを確認。画面でも 2 回目の文言が変わることを確認。検証スクリプトに常設 |
| 4 | 集計の表の**列見出しに `scope="col"` が無かった**（行見出しには付けていた）。数字だけの表なので、支援技術がセルと列を結べない。007 でカレンダー表に付けた理由がそのまま当てはまる | 3 種類の列見出しに `scope="col"` | ブラウザで属性を確認 |
| 5 | コピー先の**終了日の欄に `disabled` と `readOnly` を両方**付けていた。`disabled` はキーボードと読み上げから外すので、「どこに入るか」という情報が読み上げ利用者に届かない | `disabled` を外し、`readOnly` + `variant="filled"` で「編集できない」ことを見た目で示す | 属性を実測（修正前 `disabled: true`） |

あわせて、一括操作の実行中はスタッフ名のメニューの**ボタン自体**を押せなくした（項目だけ無効で、メニューは開けていた。ツールメニューと揃えた）。

`.in('staff_id', …)` の URL 長: 在籍 30 人で約 1.2KB。007 §5.8 が GET で `.in()` を避けたのは TS で絞れば済んだためで、
UPDATE / DELETE には代わりが無い（PostgREST は埋め込み先の列で絞れない）。100 人でも 4KB 弱で、実用上の上限には遠い。

修正後の再検証:

```
npm run format:check / lint / typecheck / build → OK
npm test        → 31 files / 258 tests passed
npx supabase db reset && npx supabase test db → 72 tests PASS
ブラウザ（1280px / 390px）→ 40 項目 PASS、console エラー 0 件
```

### 10.8 3 回目のレビューでの修正（2026-09-18）

10.7 で入れた層（在籍スタッフの絞り込み・件数の取得・通知の分岐）がまだ誰にも見られていなかったので、そこを中心に見直した。
**書き込みの correctness に欠陥は無し。**指摘 3 件のうち 2 件は実害があり、1 件は無駄の削減。いずれも実測してから直した。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **在籍スタッフの uuid を全部 URL に載せていた。**（10.7 の 1 で入れた `.in('staff_id', …)`）100 人で約 3.8KB。**200 人を超えると 8KB 級のゲートウェイ上限**に触れ、いちばん大きい店舗だけ一括操作が失敗する。読み取りで同じ形を避けている（007 §5.8）のに、ここには逃げ道が無かった | 100 件ずつに分割して繰り返す。**一括操作はどれも冪等**（同じ値に更新する / 下書きを消す）なので、途中で失敗してももう一度実行すれば揃う。007 の `assign_shift` と違って半端な状態が生まれないため、分割して差し支えない。あわせて `.select('id')` を **`{ count: 'exact' }`** に変え、件数だけ受け取るようにした（100 人 × 31 日で 3,100 個の id を返させていた） | スタッフ 100 人・500 行の店舗を作り、一括確定が **500/500** になることを確認。`Prefer: count=exact,return=minimal` の PATCH が本文なしで `Content-Range: 0-99/100` を返すことも実測 |
| 2 | **コピー結果の移動判定が開始日しか見ていなかった。** 8/1〜8/5 を 9/28 へ写すと、開始日は 9 月の表示期間内なので移動しないが、範囲は 9/28〜10/2 で**大半が画面の外**。緑の成功だけ出て、入ったシフトが見えない | `onCopied(toStart, toEnd)` に変え、**範囲全体が表示期間に収まらなければ**コピー先へ移動する | 8/1〜8/5 → 9/28（9 月を表示中）で `?start=2026-09-28` へ移り、10 月に入った 200 行が見えることを確認 |
| 3 | `listActiveStaffs()` の `select('*')` を使いながら `id` しか読んでいなかった（一括操作とコピーの両方） | `listActiveStaffIds()` を足して id だけ読む | typecheck / 既存の検証 40 項目 |

あわせて、`insertPlannedShifts()` が件数を取れなかったときに `?? 0` で 0 に丸めていたのをやめ、**`null` のまま返す**ようにした。
0 に丸めると、件数が読めなかっただけで「何も起きませんでした」と嘘をつくことになる（通知は `inserted === 0` のときだけ変える）。

`count` が「実際に入った行数」であることも実測した（3 件送って 1 件が衝突 → `Content-Range: */2`、DB は 3 行）。

修正後の再検証:

```
npm run format:check / lint / typecheck / build → OK
npm test        → 31 files / 258 tests passed
npx supabase db reset && npx supabase test db → 72 tests PASS
ブラウザ（1280px / 390px）→ 40 項目 PASS、console エラー 0 件
（別途）スタッフ 100 人の店舗で一括確定 500/500、はみ出すコピーで移動、いずれも console エラー 0 件
```

### 10.9 4 回目のレビューでの修正（2026-09-18）

10.8 で入れた分割処理と、まだ画面で踏んでいない分岐を見た。**このマイルストーンでいちばん重い不具合がここで出た。**

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **`max_rows = 1000` で読み取りが黙って切られていた。** `listShifts` は 1 回の GET で読んでいたので、**31 日 × 33 人あたりからシフト表が何も言わずに歯抜けになる**（DB に 3,100 行あるのに 1,000 行しか届かない）。コピーも取りこぼした状態で「コピーしました」と出る。**007 から在る不具合**だが、008 のコピーが被害を広げていた | `listShifts` をページングする。1 ページ目で `count: 'exact'` を受け取り、足りない分を `.range()` で読み足す。`.order('date').order('staff_id')` を付けてページの境界を安定させる | スタッフ 100 人 × 8 月 31 日 = **3,100 行**の店舗を作って実測。修正前は生の GET が 1,000 件、修正後は**画面のアサイン済みセルが 3,100**、別期間へのコピーも **3,100 行**すべて入る |
| 2 | **勤務パターンが 0 件の店舗でコピーが行き止まりになっていた。** チェックボックスが 1 つも無いのにボタンは押せて、押すと「コピー対象の勤務パターンを選択してください」。ユーザーには満たしようがない | 理由（「勤務パターンが登録されていないため、コピーできません」）を出し、ボタンを押せなくする | パターン 0 件の店舗を作って再現 → 修正後はボタンが disabled |

`max_rows` は例外を出さずに切るので、**気付けるのは件数を数えたときだけ**（画面が歯抜けになって初めて分かる）。
同じ罠を繰り返さないよう AGENTS.md の RPC の節に、読み取りのページングと `.in()` の URL 長の 2 点を書いた。

`listRequiredNums` も同じ形だが、上限に触れるには**勤務パターンが 33 件以上**必要で（`unique (pattern_id, date)` × 31 日）、
店舗の勤務パターンとしては現実的でないため据え置いた。`listDateNotes` は期間の日数だけなので 31 行が上限。

確かめて問題が無かったもの:

| 確認 | 結果 |
| --- | --- |
| `holiday` キーだけ設定 + 祝日の無い月（2026-06） | 「この期間にセットできるデフォルト勤務パターンがありません」が出る（§5.1 の分岐が意図どおり動く）。11 月は祝日が 2 日あるので、この確認には使えない |
| 分割した一括操作の冪等性 | 100 人・500 行で 500/500。途中で失敗しても再実行で揃う形になっている |
| `count` の意味 | 「実際に入った行数」（3 件送って 1 件衝突 → 2）。UPDATE / DELETE でも `return=minimal` のまま件数だけ取れる |

修正後の再検証:

```
npm run format:check / lint / typecheck / build → OK
npm test        → 31 files / 258 tests passed
npx supabase db reset && npx supabase test db → 72 tests PASS
ブラウザ（1280px / 390px）→ 40 項目 PASS、console エラー 0 件
（別途）100 人 × 31 日 = 3,100 行の店舗で、表示もコピーも全件通ることを確認
```

### 10.10 レビューを 4 回通してみて

見つかった不具合の質が回ごとに変わった。**同じ観点で繰り返すのではなく、前の回で変えた場所を次の回で見る**のが効いた。

| 回 | 見つかったもの |
| --- | --- |
| 1 | プランの前提と実装のずれ（集計が期間外のペアを数える） |
| 2 | 見えないデータの削除（退職者の下書き）、aria の断線、嘘の成功通知 |
| 3 | 2 回目の修正が持ち込んだ規模の問題（URL 長）、コピー結果の移動判定 |
| 4 | **007 から潜んでいた読み取りの上限**（33 人で表が歯抜けになる）、0 件時の行き止まり |

4 回目で出た `max_rows` は、それまでの 3 回が「008 の差分」を見ていたために見落としていた。
**差分だけでなく、差分が依存している既存コードの前提**（ここでは `listShifts` が全件返すという暗黙の前提）を疑うと出てくる。
009 以降で同じ規模の店舗を扱うときは、まず件数を数えることを勧める。

### 10.11 5 回目のレビュー（8 観点の統合）での修正（2026-09-18）

5 回目は 8 つの観点（行単位・横断トレース・削除された挙動・再利用・簡素化・効率・規約・設計の深さ）に分けて見た。
**correctness の欠陥はゼロ。**出てきたのは挙動の細部 6 件、効率 4 件、重複・整理 10 件、規約 3 件で、以下をまとめて直した。

#### 挙動

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **前回条件が「前回コピーした条件」ではなく「前回開いた期間の既定値」になっていた。** `useLocalStorage` は mount 時に読んだ値（＝既定値）を storage に書き戻す。9 月で開いてキャンセルすると 8 月→9 月が保存され、10 月に開いても 9 月→10 月にならない。v1 の cookie は送信時にしか書かれていなかった | `readLocalStorageValue` で mount 時に 1 回読み、**送信が通ったときだけ**保存する（`saveConditions`） | 編集だけでは storage が変わらず、送信後にリロードしても復元されることを検証スクリプトに常設 |
| 2 | **一括操作（確定 / 下書き / クリア）は 0 行でも緑の成功だった。** INSERT 側だけ灰色にした 10.7 と不整合 | `{ affected }` を返し、0 なら「確定するシフトがありませんでした」等を灰色で出す。文言は `BULK_COPY.nothing` に集めた | 検証スクリプト「対象 0 件は「対象なし」の文言」 |
| 3 | **何も入らなかったコピーでも画面がコピー先へ移動していた** | `inserted === 0` のときは通知だけで移動しない | コード |
| 4 | **コピー先の移動判定が週・半月の周期で無駄になっていた。** `dateRange()` が開始日を丸めるので、丸めた期間が今と同じなら同じ画面を再フェッチするだけ | 丸めた開始日が今の期間と同じなら移動しない | コード。週の周期で 31 日分を 1 画面に収められないことは残る（周期の仕様） |
| 5 | **期間移動中にスタッフ名メニュー全体を無効にしていた。** 007 では移動中も「スタッフ情報を編集」へ行けた。またメニューの見出しからスタッフ名を落としていた（何十行もある表で Portal に開くので誰のメニューか分からない） | 無効にするのは一括操作の実行中だけ。見出しにスタッフ名を戻し、「一括操作」は 2 つ目の見出しに。項目ごとの `disabled` は届かないので外した | ブラウザ |
| 6 | **コピー失敗時に画面を読み直していなかった**（他の一括操作は読み直す）。別タブでパターンが消えたとき、古いチェックボックスのまま何度でも同じエラーになる | 失敗時に `router.refresh()` | コード |

#### 効率

- `listShifts` の `count: 'exact'` を **1 ページ目だけ**にし（毎ページ `SELECT count(*)` が走っていた）、残りのページを**並行**に読む。汎用の **`pageAll()`**（`lib/queries/pageAll.ts`）に切り出し、規則を「段落」ではなく「関数」にした
- コピー元の読み取りで**勤務パターンを DB 側で絞る**（`.in('pattern_id', …)`。20 件程度なので URL に載せてよい）。100 人の店舗で 3,100 行読んで 600 行残す、をやめた
- 分割した一括操作の塊を**並行**に投げる（冪等なので順序に意味がない）
- `listActiveStaffIds` で id だけ読む（`select('*')` を 100 人分読んで id しか使っていなかった）

#### 重複・整理

- **`requireTenant(tenantId)`** を `guards.ts` に足し、一括 Action は `requireUser()` の直後に呼ぶ。書き込んだあとに「0 行の理由」を切り分ける分岐（7 か所・3 形）が消え、`ensureTenantVisible` / `ensureTargetVisible` を撤去した。`getTenant` は `cache()` 済み
- 一括 UPDATE / DELETE の共通部分を **`writeShiftsInBulk()`** に。2 本の Action が 30 行ずつ同じ手順だった。実質 dead code だった早期リターン（空の配列でも同じ結果になる）も消えた
- 期間の規則を **`termIssue()`**（`validation/date.ts`）に 1 つ。Zod（`dateTermSchema` / `copyShiftsSchema`）と送信前の UI が同じ関数を使う。3 か所に書いていた
- `failFromFkError(error, message)` に統合（同じ形の関数が 2 つ）。`RPC_MESSAGES` は定数を参照
- `SupabaseClient<Database>` を `@supabase/supabase-js` から import（`positions.ts` と揃える）
- `toDefaultPatterns()` で `staff_default_patterns` の畳み込みを 1 か所に。`createPattern`（006）も `listActiveStaffIds` を使い、「在籍」の定義を 1 か所に
- 一括操作 3 件のメニュー項目を **`BulkMenuItems`** に。文言は `BULK_COPY.title` と同じもの（3 ファイルに同じ文字列があった）
- `countShifts` は `daysOff` を持たず（`日数 − 勤務日` は表示側で出す）、`staffIds` と同じ順の配列を返す。表示側の `?.` と既定値の言い直しが消えた
- コピー先の終了日を `TextInput` + `formatSlashDate` で真似るのをやめ、**readOnly の `DatePickerInput`** に。書式は隣と同じ `valueFormat` から出る。`formatSlashDate` は削除。ピッカーの共通 props は `datePickerProps.ts`（`zIndex` は `getDefaultZIndex('modal') + 1`）

#### 規約

- **`// prettier-ignore` を 5 か所すべて外した**（この差分で初めて導入していた。`printWidth: 100` の契約から外れる）
- `chunk()` を `src/utils/chunk.ts` に出して Vitest を付けた（`'use server'` の中に置くと import できずテストできない）
- `bulkOperations.ts` を `_components/` から **`_lib/`** へ（UI ではなく文言と型。AGENTS.md の分け方どおり。リポジトリ初の `_lib/`）

#### 直さなかったもの

| 指摘 | 判断 |
| --- | --- |
| **一括操作を RPC にする**（在籍スタッフの絞り込みを SQL の join で行い、URL 長・分割・部分失敗の許容をまとめて無くす） | **プラン §3.1 の決定の見直しなので、ここでは変えない。**スキーマ変更（migration の作り直し）を伴う。判断材料は §10.12 |
| `refresh()` を「画面が古い」と分かる Action 側のエラー分岐で呼び、Client の `router.refresh()` を消す | 007 の `assign` の流儀も変わる。Zod エラーなどでも読み直す無駄はあるが、頻度が低く、Next 16 でエラー応答に RSC を載せる挙動の確認が要る。申し送り |
| `listRequiredNums` のページング | 上限に触れるには勤務パターンが 33 件以上必要。現実的でないため据え置き（`pageAll` を通すだけなので、必要になれば 1 行） |
| コピーでペアを張り直す / 期間の端のペア | v1 と同じ（§3.6）。仕様として据え置き |
| `setDefaultRequiredNumsSchema` のキー順が `tenantId, start, end` → `start, end, tenantId` に変わり、複数項目が同時に不正なときの先頭 issue が変わる | UI からは起こせず、`safeExtend` で組む以上は避けられない。記録のみ |

#### 検証

```
npm run format:check / lint / typecheck / build → OK
npm test        → 32 files / 263 tests passed（chunk のテスト 5 件を追加）
npx supabase db reset && npx supabase test db → 72 tests PASS
ブラウザ（1280px / 390px）→ 41 項目 PASS、console エラー 0 件
（別途）在籍 150 人 × 5 日 = 750 行の店舗で一括確定 750/750（分割 2 塊が並行）、
        はみ出すコピー（8/1〜8/5 → 9/28、9 月表示中）で 9/28 の期間へ移動し 10 月に 300 行
```

### 10.12 収束の判断と、残る設計上の選択

5 回のレビューで見つかったものの推移:

| 回 | correctness | それ以外 |
| --- | --- | --- |
| 1 | 1（集計が期間外のペアを数える） | 3 |
| 2 | 3（退職者の行の削除、aria、嘘の成功） | 2 |
| 3 | 2（URL 長、コピー結果の移動） | 1 |
| 4 | 2（`max_rows` の切り捨て、0 件の行き止まり） | 0 |
| 5 | **0** | 23（挙動の細部 6 / 効率 4 / 重複 10 / 規約 3） |

5 回目で correctness の指摘が 0 になり、残りは品質面だったので、ここで収束と判断した。

**残る設計上の選択（判断を仰ぐ）**: 一括操作を PostgREST の 1 文で書く（§3.1）か、RPC にするか。

| | 今の形（PostgREST + 在籍 id の分割） | RPC（`security invoker` の plpgsql） |
| --- | --- | --- |
| 在籍スタッフの絞り込み | Server が id を読んで URL に載せる（100 件ごとに分割・並行） | SQL の join（`staffs.retired_at is null`）。URL に何も載らない |
| 原子性 | 塊ごと。冪等なので再実行で揃うが、250 人で 3 塊目が失敗すると 200 人確定・50 人下書きの状態を一度は見る | 1 文。半端な状態が生まれない |
| スキーマ変更 | なし | あり（`functions.sql` に 2 関数、migration 作り直し、`gen types`、pgTAP） |
| コード量 | `writeShiftsInBulk` + `chunk` + `requireStaffVisible` | RPC 呼び出し 1 行 + SQL。`assign_shift` と同じ形 |

規模の実測: 150 人で問題なし。v1 の店舗は「アルバイトのシフト表」で、1 店舗 200 人超は想定しにくい。
**今の形で 013 まで進め、012 の移行で実データの最大在籍数を見てから決める**ことを勧める。RPC にする場合は
§3.1 を書き換え、`assign_shift` と同じ手順（`db schema declarative sync` → unmanaged 追記 → `db reset` → `test db` → `gen types`）で入れる。

### 10.13 一括操作を RPC に変更（2026-09-18）

§10.12 の選択について「スタッフの id をそもそも URL に載せる必要があるのか」という問いを受け、RPC にした。
id を載せていたのは PostgREST の UPDATE / DELETE が別テーブルの条件（`staffs.retired_at is null`）で絞れないことの回避策で、
分割・並行・冪等性の議論・URL 長の注記はすべてそこから生えていた。絞り込みを SQL の join に置けば、それらが一度に消える。
プラン §3.1（「RPC は足さない」）は前提が崩れたので注記した。

| 変更 | 内容 |
| --- | --- |
| `supabase/schemas/public/functions.sql` | `set_shifts_fixed(p_tenant_id, p_start, p_end, p_fixed, p_staff_id default null) returns integer` と `clear_draft_shifts(...) returns integer`。`security invoker`、対象は `staff_id in (select id from staffs where tenant_id = … and retired_at is null)`、件数は `get diagnostics`。`p_staff_id` を渡して見えなければ `raise exception '…: staff not found'`（`assign_shift` と同じ文言・同じ扱い） |
| `supabase/migrations/` | `init_schema` 1 本を作り直し、unmanaged の REVOKE を追記（013 までの手順どおり） |
| `supabase/tests/rls_tenant_isolation.sql` | 14 件追加 → `plan(86)`。自店舗の件数（2 → 確定 / 0 → 下書きクリアは確定を消さない / スタッフ指定は 1 行）、**退職者の行は対象外**（退職させてから全体を実行 → 在籍 1 人分だけ、退職者の行は確定のまま）、他店舗は 0 行、他店舗の `staff_id` は `P0001 staff not found` |
| `src/types/database.ts` | 再生成（`Functions` に 2 つ追加） |
| `shifts/actions.ts` | `setShiftsFixed` / `clearDraftShifts` は `supabase.rpc(...)` 1 回。`writeShiftsInBulk` / `requireStaffVisible` / `STAFF_CHUNK_SIZE` を削除。`requireTenant` は残す（RPC は他店舗を 0 行として返すので、先に店舗を確かめないと「対象なし」と区別できない） |
| `src/utils/chunk.ts`（+ test） | 削除（使い道が無くなった） |
| AGENTS.md | RPC の節を更新（4 つ目・5 つ目の RPC、「別テーブルの条件で絞る UPDATE / DELETE は RPC」）。URL 長の段落は「増えるものは載せず SQL 側に絞り込みを置く」に縮めた |

検証:

```
npm run format:check / lint / typecheck / build → OK
npm test        → 31 files / 258 tests passed（chunk のテスト 5 件が無くなった分）
npx supabase db reset && npx supabase test db → 86 tests PASS
ブラウザ（1280px / 390px）→ 41 項目 PASS、console エラー 0 件
（別途）在籍 149 人 + 退職 1 人 × 5 日 = 750 行の店舗で一括確定 → 745/750。
        在籍者の 745 行だけが確定し、退職者の 5 行は下書きのまま（RPC の join が規模でも効く。URL には何も載らない）
```

これで 008 は収束とする。一括操作は「1 文・原子的・件数を返す・在籍者だけ」の 4 点を SQL が保証し、TS 側は呼び出しと文言だけになった。

### 10.14 6 回目のレビュー（RPC 化後）での修正（2026-09-19）

RPC 化（§10.13）の層を見た。8 観点のうち **4 観点（簡素化・削除された挙動・再利用・効率）の報告が届き、
残る 4 観点（行単位・規約・横断トレース・設計の深さ）はセッションの利用上限で途中終了した**（3:20 JST にリセット）。
届いた分は correctness 1 件（`pageAll` の前提）と、挙動・重複の細部。以下を直した。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **`pageAll` がサーバーの `max_rows` = 1000 を決めつけていた。** 歩幅も「取り切れたか」も `PAGE_SIZE` 固定なので、本番のダッシュボードで `max_rows` が 500 に下げられていると 500〜999 の次に 1000〜 を読み、間が黙って抜ける。この関数が防ぐはずの症状そのもの。あわせて `count` が取れなかったとき `?? rows.length` で「1 ページで収まった」扱いにしていた | 歩幅を **1 ページ目が実際に返した行数**にする。`count` が無ければ例外（呼び出し側が `withCount` を無視した）。読み終えて総件数に届かなければ例外 | `pageAll.test.ts` 6 件: 上限 500 のサーバーで 1,240 件を 0 / 500 / 1000 の 3 回で取り切る、count 無しは例外、短いページは例外、count は 1 ページ目だけ |
| 2 | RPC で **退職者を直接指定すると 0 件**（存在確認が在籍を見ていなかった）。古いタブから退職済みのスタッフを操作すると「対象なし」と出て読み直しにつながらない | 存在確認に `retired_at is null` を足し、`staff not found` にする（23503 や `assign_shift` と同じ「画面が古い」の扱い） | pgTAP「退職者を指定すると not found」 |
| 3 | 一括操作 2 本が `requireTenant`（往復 1）→ RPC（往復 1）と直列だった。店舗の確認は RPC の中でできる | RPC の先頭で `tenants` を見て `tenant not found` を投げる。TS 側は `RPC_MESSAGES` に写すだけになり、往復が 1 回に。他の 3 本（デフォルト人数・デフォルト勤務パターン・コピー）は `requireTenant` を最初の読み取りと `Promise.all` で並行に | pgTAP「他テナントの店舗は not found」2 件（0 行の期待から差し替え）。ブラウザ 41 項目 |
| 4 | pgTAP の 008 節の見出しが RPC 化前の説明（「RPC は使わない」「0 行を書き込み後に切り分ける」）のまま | 生の UPDATE / DELETE のテストは「RPC が乗る RLS の境界を固定するもの」と書き直した | — |
| 5 | 文言の散在: 「見つかりません」系が 3 か所ずつ、「最大31日間」がハードコードと `MAX_TERM_DAYS` 補間の 2 通り | `TENANT_/STAFF_/PATTERN_NOT_FOUND_MESSAGE` を各 id スキーマの隣（`lib/validation/*`）に 1 つずつ置き、guards と shifts/actions が import。`COPY_TERM_TOO_LONG_MESSAGE` を `validation/shifts.ts` から UI とサーバーで共有 | typecheck |
| 6 | `StaffWithDefaultPatterns`（queries）と `StaffDefaults`（planDefaultPatterns）が同じ形の 2 つ目の名前 | 前者を消し、クエリは `StaffDefaults[]` を返す | typecheck |
| 7 | CopyModal の `useMemo(fallback)` は `useState` の初期化でしか読まれず、依存配列が「開いている間も既定値を追う」と誤解させる | `useMemo` を外し、初期化子の中で 1 回計算 | コード |
| 8 | `outcome()`（0 件は灰色）が ShiftsClient と CopyModal に 2 つ | `_lib/notices.ts` に 1 つ | コード |
| 9 | `...(staffId ? { p_staff_id } : {})` の条件スプレッド | `p_staff_id: parsed.staffId ?? undefined`（JSON では undefined が落ちる） | typecheck |
| 10 | `planCopy` のパターン絞り込みが DB 側（`.in()`）と二重 | 意図的（純関数の契約を「どう読んだか」に依存させない）と docblock に明記 | — |

直さなかったもの: `pageAll` の「1 ページ目の count 自体をやめて短いページまで順に読む」案（共通の 1 ページ以内で count 分の走査が無駄）は、
並行読みとの取り替えになる判断で据え置き。コピーを `insert ... select` の RPC にする案は、行の組み立てを純関数で固定する方針（§3.1）を保つため据え置き。
SQL の在籍判定・存在確認の共通化（`private.*` ヘルパ）は 3 か所で止まっており、pgTAP が挙動を固定しているので据え置き。

```
npm run format:check / lint / typecheck / build → OK
npm test        → 32 files / 264 tests passed（pageAll 6 件を追加）
npx supabase db reset && npx supabase test db → 89 tests PASS
ブラウザ（1280px / 390px）→ 41 項目 PASS、console エラー 0 件
```

未完了の 4 観点は、利用上限のリセット後に同じ差分で回し直す。

### 10.15 7 回目のレビュー（8 観点すべて完走）での修正（2026-09-19）

前回途中終了した 4 観点を含め、8 観点すべての報告が揃った。**書き込みの correctness に欠陥は無し。**
挙動 1 件（`pageAll` の最終例外）、設計 1 件（コピーの RPC 化）、他は効率・重複・規約。以下を直した。

#### 挙動・設計

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **`pageAll` の「総件数に届かなければ例外」が、別セッションの削除 1 件でシフト表の描画を落とす**（3 観点が独立に指摘）。歩幅を実測にした §10.14 の時点で `max_rows` の切り捨ては起きなくなっており、届かないのは 1 ページ目のあとに他の人が消したときだけ。それを例外にすると「少し古い表」の代わりにエラー画面になる | 最終の突き合わせを外し、読めた分を返す。`count` が無い（呼び出し側の実装誤り）だけは例外のまま | `pageAll.test.ts` を「短いページでも読めた分を返す」に差し替え |
| 2 | **コピーを RPC `copy_shifts` にした**（4 回目の指摘。一括操作を RPC にした理由がそのまま当てはまる）。`insert ... select` 1 文で、在籍の絞り込みは一括操作と同じ SQL の規則、読み書きが 1 文なのでページングの境界の問題（1 の削除競合で**コピー元の行が黙って抜ける**経路）も消える。コピー元の行を app に往復させない（100 人 × 31 日で約 300KB × 2 方向） | `functions.sql` に追加。`tenant not found` / `no source`（条件に合う行が無い）を投げ、`RPC_MESSAGES` で文言に写す。`planCopy.ts`（+ test）を削除し、`copyEnd` は `dateString.ts` へ。`listShifts` の `patternIds` オプションを削除 | pgTAP 5 件（在籍者だけ写る・日数ずらし・下書き・2 回目は 0・no source・他店舗 not found）。150 人規模で 298 行のコピー、退職者の行は 0 |
| 3 | `copy_shifts` / `set_shifts_fixed` / `clear_draft_shifts` の anon 42501 を個別に固定（規約どおり。集約の検査はあったが前例に揃える） | pgTAP 3 件 | `plan(97)` |
| 4 | コピー先の開始日は表示期間内だが終了日がはみ出す（31 日の From を 30 日の月へ）とき、通知が触れない。月の周期で開始日へ移ると表示の起点が 1 日からずれる | **移動は「開始日が表示期間の外」のときだけ**に絞り、はみ出しは通知に「（一部は次の期間にあります）」と添える | 8/1〜8/5 → 9/28（9 月表示中）で URL は変わらず通知に注記 |
| 5 | コピーモーダルは入力欄に理由を出しながら送信できた（逆順・パターン 0 件）。押すと Zod の拒否 + 無駄な読み直し | `issue !== null || patternIds.length === 0` でボタンを無効に。文言は `COPY_TERM_MESSAGES` を UI とサーバーで共有（逆順の文言が 2 通りあった） | ブラウザ「送信できない」2 件 |

#### 効率

- `shifts` の索引を `(tenant_id, date)` → **`(tenant_id, date, staff_id)`** に。`listShifts` のページング順と count をこの索引だけで賄う
- `listActiveStaffsWithDefaultPatterns` を **`!inner`** にして「設定を持つスタッフだけ」を DB 側で絞る（100 人中数人なら空配列 90 個を運ばない）。TS 側の `filter` を削除
- `createPattern` の在籍 id 読みを `nextPosition` と並行に

#### 重複・規約

- `dateTermSchema` を「refine 済みの object」から **`dateTermShape` + `refineTerm()`（規則だけ共有）**に。各スキーマが自分の列順で object を組み、最後に規則を掛ける。`.omit()` が使えない制約と `safeExtend` の連鎖、列順の変化（§10.11）が消えた。`copyShiftsSchema` は `.check()` 1 つで同じ規則
- `insertPlannedShifts` の `count: number | null` を `number` に（`count: 'exact'` の POST に PostgREST は必ず件数を返す。無ければ実装誤りとして例外。`pageAll` と同じ扱い）。`outcome()` の「null は成功」分岐が消えた
- `countShifts` は `staffs` をそのまま受けて zip 済みの行を返す（非 null アサーション 2 か所が消えた）
- 通知の `failure()` を `_lib/notices.ts` に。`confirmBulk(kind, staff?)` を直接渡せるよう `onStaffBulk(kind, staff)` に
- 「見つかりません」系の文言を `lib/validation/*` の 1 つに寄せ、006 の設定画面の Action もそれを import。`guards.ts` の使われない re-export を削除
- `isDayKey` を `weekdays.ts` から公開して `dayKeyFor` と `queries/staffs.ts` で共有。`holidaysIn()` の再実装を戻す
- 日付ピッカーの表示書式は **theme の `components.DateInput / DatePickerInput.defaultProps`** に（ルート専用の定数を廃止）。`DateInput.extend()` は Server 側のバンドルで静的メソッドを持たずビルドが落ちるので、素のオブジェクトで書く
- AGENTS.md: 「RPC が先頭で `tenant not found` を投げる場合は TS で `requireTenant` を呼ばない」、RPC の一覧に `copy_shifts`、「DB の行から DB の行を作るだけのものは `insert ... select` の RPC」

#### 直さなかったもの

| 指摘 | 判断 |
| --- | --- |
| SQL の在籍判定・存在確認を `private.*` ヘルパに共通化（3 回目） | RPC（security invoker）の中から `private.*` を呼ぶには authenticated に `private` スキーマの USAGE が要り、AGENTS.md の「USAGE は不要」の方針とぶつかる。3 関数に同じ 5 行が並ぶが pgTAP が挙動を固定しているので据え置き |
| RPC 2 本を `p_kind` で 1 本に | `assign_shift` と揃った「1 操作 1 関数」のほうが読みやすい。据え置き |
| `pageAll` の 1 ページ目の `count` をやめる | 並行読みとの取り替え。§10.14 の判断のまま |
| RPC の例外を errcode で写す（文言の substring 一致をやめる） | `assign_shift` の前例に揃える。変えるなら 3 関数まとめて |
| コピーモーダルで `onClose()` が transition の外で走る（閉じ方が急に見える） | 見た目だけ。据え置き |

#### 検証

```
npm run format:check / lint / typecheck / build → OK
npm test        → 31 files / 256 tests passed（planCopy 8 件が消え、pageAll 6 件・copyEnd 4 件が入った）
npx supabase db reset && npx supabase test db → 97 tests PASS
ブラウザ（1280px / 390px）→ 41 項目 PASS、console エラー 0 件
（別途）在籍 149 人 + 退職 1 人の店舗: 一括確定は在籍者の 745 行だけ、コピー RPC は 298 行を写し退職者の行は 0、
        開始日が表示期間内で終了日がはみ出すコピーは URL を変えず「（一部は次の期間にあります）」と通知
```

### 10.16 収束の判断（更新）

| 回 | correctness | それ以外 | 備考 |
| --- | --- | --- | --- |
| 1〜4 | 1 / 3 / 2 / 2 | 3 / 2 / 1 / 0 | §10.12 |
| 5 | 0 | 23 | 8 観点を初めて分けた回 |
| 6 | 1（`pageAll` の歩幅） | 9 | 4 観点が利用上限で途中終了 |
| 7 | 1（`pageAll` の最終例外。6 の修正が持ち込んだ） | 20 | 8 観点すべて完走。うち設計 1 件（コピーの RPC 化）を採用 |

7 回目の correctness 1 件は、6 回目で足した防御が新しい失敗モードになったもの。**防御を足すたびに「その防御が何を壊すか」を次の回で見る**必要があった。
残る指摘は方針との衝突（`private` の USAGE）か、前例との整合（`assign_shift` の例外の写し方）で、どちらも「今の形が悪い」ではなく「別の形もある」の類。ここで収束とする。

### 10.17 8 回目のレビュー（§10.15 の変更分に絞り、correctness のみ）（2026-09-19）

「修正が次の問題を作る」連鎖を切るため、対象を 7 回目で入れた変更（コピーの RPC 化・索引・`pageAll` の例外撤去・
theme の defaultProps・期間 Zod の組み替え）に絞り、correctness だけを 3 観点（行単位・横断トレース・削除された挙動）で見た。
品質面の指摘は記録するだけで直さない、と決めて回した。

**結果: correctness の欠陥ゼロ。** 3 観点とも `copy_shifts` の重なり・過去方向・他店舗の id 混入・空配列、`pageAll` の歩幅、
`refineTerm` の Zod 4 の check 実行順、theme の `defaultProps` の効き方までライブラリの実装と実 DB で確かめ、いずれも想定どおり。
自分でも `copy_shifts` の 4 ケース（9/1〜9/3 → 9/2 開始で既存 2 行は残り増分 2 行、他店舗のパターン id は無視、過去方向、空配列は `no source`）を SQL で実測した。

入れたのは守りの精度 1 行だけ: `count === null` の判定は、PostgREST が `Content-Range: */*` を返す（今の版では起きない）と
`parseInt` の `NaN` をすり抜けるので、`Number.isFinite` に変えた（`insertPlannedShifts` と `pageAll` の両方）。挙動は変わらない。

記録のみ（直していない）:

| 指摘 | 判断 |
| --- | --- |
| コピー先へ移動した先でも終了日がはみ出す場合（31 日の From を月の周期で別の月へ）、「一部は次の期間にあります」が付かない | 通知の精度。行は正しく入っている。次に触るときに `spillsOver` を移動先の期間で判定する |
| `showCopyResult` の 2 つ目の条件（丸めた開始日が同じなら動かない）は 1 つ目を通った後には到達しない | dead code。コメントが実在しない挙動を説明している。次に触るときに 1 条件にする |
| `copy_shifts` の期間上限が Zod だけで SQL 側に無い | 直接叩いても自店舗内で既存を上書きしない操作なので欠陥ではない。守りを足すなら SQL に `p_from_end - p_from_start >= 31 → raise` |
| コピー元の `no source` 判定と INSERT が 2 文（間に削除が挟まると「全部埋まっていた」の灰色になる） | 無害 |

```
npm run format:check / lint / typecheck → OK
npm test → 31 files / 256 tests passed
（pgTAP 97 件・ブラウザ 41 項目・150 人規模の確認は §10.15 から変更なし。今回のコードの変化は判定式 2 行のみ）
```

### 10.18 収束

| 回 | correctness | 備考 |
| --- | --- | --- |
| 1〜4 | 1 / 3 / 2 / 2 | 元の実装の欠陥 |
| 5 | 0 | 8 観点を分けた最初の回 |
| 6 | 1 | 5 の修正が持ち込んだ |
| 7 | 1 | 6 の修正が持ち込んだ |
| **8** | **0** | 7 の変更分に絞って correctness のみ。品質面は記録のみ |

8 回目で、7 回目に入れた変更（新しい SQL を含む）から correctness が出なかった。前の 2 回は「修正が次の問題を作る」形だったが、
対象を絞って品質面を直さないことで連鎖が切れた。ここで収束とし、コミットの確認に進む。

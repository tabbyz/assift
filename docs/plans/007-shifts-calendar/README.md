# 007: シフト表（読み取り・アサイン）

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §4.4 / §4.6）のマイルストーン 007。
メイン画面であるシフト表カレンダーを、**期間計算・カレンダー表示・セルのアサイン（ポップオーバー）・ペアパターン・
必要人数行と日別モーダル・日付メモ**の範囲で作る。一括操作 / デフォルト勤務パターン / コピー / 集計は 008、
共有は 009、PDF / CSV は 010 で同じ画面に足していく。

---

## 1. 目的と完了条件

### 目的

- v1 の `ShiftsController#index` + `#assign`、`RequiredNumsController`、`EventsController` をシフト表 1 画面に移植する
- 期間計算（`Calendar.date_range`）を純関数にして Vitest で固定する。祝日は v1 の YAML ハードコードをライブラリに置き換える
- セルの更新は `useOptimistic` で即時反映し、Server Action の完了で再同期する（v1 の「Ajax で 1 行差し替え」に相当）
- アサインの「既存削除 → ペア処理 → 作成」を 1 トランザクションにする（RPC `assign_shift`）
- 008〜010 が同じ `shifts/` の下に機能を足せる骨格（`_components/` / `actions.ts` / `searchParams.ts`）を作る。
  ドメインの純関数は `_lib/` ではなく `src/lib/calendar/` `src/lib/shifts/` に置く（008 のコピー・集計、010 の PDF / CSV も使う）

### 完了条件

- `tenants/[tenantId]/shifts` を開くと、店舗の `shift_cycle` / `start_of_week` と `?start=` から期間が決まり、
  日付行（曜日・日。日曜と祝日は赤、土曜は青）/ メモ行 / 人数行 / 在籍スタッフ × 日付のセルが描かれる。
  `?start=` 無しは JST 今日の月初。不正な `?start=` も月初にフォールバックする
- 「‹」「›」で前後の期間に移り、期間ボタンのドロップダウンから開始日を指定して「更新」で移れる。
  4 つの周期（1 か月 / 半月 / 2 週間 / 1 週間、週始まり込み）すべてで v1 と同じ期間になる（Vitest）
- セルをタップするとポップオーバー（下書き / 確定の切替 + 「空」+ そのスタッフが選択可能なパターン）が開き、
  パターンを押すと即座にセルが変わる（下書き = 白地に上辺の色帯、確定 = 塗り + 白文字）。リロードしても保たれる
- ペア: 夜勤をセットすると翌日に「明け」が入る（翌日に何かあれば上書き）。夜勤を外すと翌日の「明け」も消える。
  **翌日が「明け」以外のときは消えない**（v1 からの改善。001 §4.4）。翌日が表示期間外でも DB は正しく更新される
- 人数行: 日ごとに ✓ / ! が出る（出勤日パターンすべてで 必要 = アサイン済 のとき ✓）。アサインを変えると即座に更新される。
  タップで日別モーダル（出勤日パターンごとの必要人数 / アサイン済、「デフォルト人数をセット」）→ 保存で ✓ / ! が変わる
- 人数行の見出しメニュー「デフォルト人数をセット」→ 確認 → 表示期間の `required_nums` が `default_required_nums` から埋まる（祝日は `holiday` キー優先）
- メモ行: タップでモーダル（12 文字）→ 保存で表示。空にして保存すると消える
- 他店舗の id や存在しない id を Action に渡すと「見つかりません」で失敗し、行は変わらない。pgTAP に `assign_shift` のテナント境界が入って PASS
- スタッフ 0 件 / パターン 0 件のときは、表の上に STEP1 勤務パターン / STEP2 スタッフ の案内（v1 `shifts/_tutorial` の文言）を出す。表自体は空のまま描く（v1 と同じ）
- スマホ幅（390px）でヘッダ 3 行と先頭列が sticky のまま横スクロールでき、ポップオーバーとモーダルが収まる
- `npm run format:check` / `lint` / `typecheck` / `test` / `build` / `npx supabase test db` が通る

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| v1 の期間計算 | `Calendar.date_range`: week / two_week は `beginning_of_week(start_of_week)` から +6 / +13、half_month は `day <= 15 ? [1, 15] : [16, 月末]`、month は **start をそのまま**（1 日固定ではない）+ `next_month.prev_day`。既定は `Date.current.beginning_of_month`、cookie `current_start_date` に 1 か月保持 |
| v1 の前後移動 | week ±7、two_week ±14、month ±1 month、half_month は **−13 / +16 の固定値**（2 月後半 13 日・31 日月後半 16 日を根拠にした近似。`date_range` が吸収するので結果は合うが、コードとしては境界が曖昧） |
| v1 のアサイン | `assign`: 既存 shift を取得 → `delete_pair`（現パターンにペアがあれば**翌日をパターン問わず削除**）→ destroy → `pattern_id != 0` なら作成（fixed 引き継ぎ）→ `assign_pair`（`find_or_initialize_by(翌日)` に pair を**上書き**、fixed も同じ）。ペアの連鎖はしない（1 段だけ） |
| v1 のセル表示 | `data-enabled`（曜日が勤務可）= whitesmoke + 「+」、`data-assigned` = 白地 + `border-top-width: 3px`（色はパターン色）、`data-fixed` = 背景をパターン色で塗り + 太字 + 白文字（パターン色が `#FFFFFF` のときは文字色そのまま） |
| v1 のポップオーバー | tippy。下書き / 確定のラジオ + 「空」ボタン + パターンボタン（`available_patterns` に**無いものは非表示**。現在アサイン中でも無ければ隠れる）。ラジオを変えると、アサイン済みなら同じパターンを自動で押し直す（fixed だけ変える UX） |
| v1 の必要人数 | ✓ / ! は JS（gon）で `requiredNums[date][pid] != assignedCounts[date][pid]` が 1 つでもあれば `!`。対象は **workday パターンだけ**。日別モーダルは `update` で「該当パターンの行を delete → 一括 import（空欄は 0）」。`set_default` は期間の行を全削除 → workday × 日付で再生成 |
| v1 のイベント（メモ） | `find_or_initialize_by(date)`、`note` が空なら destroy。ヘッダ行に表示、無ければペンアイコン |
| v1 のツールバー | 期間ナビ + 集計（008）/ 共有ドロップダウン（009 / 010）/ ツールドロップダウン（008）。スタッフ名セルのドロップダウンは一括操作 3 件（008）+ 「スタッフ情報を編集」 |
| v1 のフッタ / 0 件時 | `_pattern_description_list`（`名前 説明` を横並び）。`_footer`（凡例）と `_tutorial`（STEP1 / STEP2 の案内）は **index から render されていない残骸**。スタッフ 0 件でも表は描かれ、`TenantsController#show` がチュートリアルへ redirect するだけ |
| 006 からの申し送り | 必要人数行は `kind = 'workday'` のパターンだけを対象にする（休みに変えた後も `required_nums` 行は残る）。`parseRequiredNums()` を「デフォルト人数をセット」でも使う。祝日は `holiday` キー優先 |
| DB | `shifts` は `unique (staff_id, date)`、`(staff_id, tenant_id)` / `(pattern_id, tenant_id)` の複合 FK。`required_nums` は `unique (pattern_id, date)`、`date_notes` は `unique (tenant_id, date)` と `note` 1..12 の CHECK。3 テーブルとも RESTRICTIVE + PERMISSIVE の RLS と `authenticated` への DML GRANT が 003 で入っている。`date` 型は PostgREST から `YYYY-MM-DD` 文字列で返る |
| `@holiday-jp/holiday_jp` 2.5.1 | `holidays` が `'YYYY-MM-DD'` キーの定数マップ（**1970〜2050 年**）、`isHoliday(Date \| string)` / `between(Date, Date)`。CommonJS（`export = holiday_jp`。tsconfig は `esModuleInterop: true` なので `import holiday_jp from` で読める）、依存なし、unpacked 1.4MB（データ。d.ts も同じ大きさのリテラル型だが `skipLibCheck: true`）。`isHoliday(string)` は毎回 `Object.keys().includes()` を走るので、期間分は `holidays` を `Object.hasOwn` で引く。v1 の YAML は 2026 年まで |
| Mantine 9.6 | `Popover`（controlled `opened` / `onDismiss`、`withinPortal` 既定 true）、`Menu`、`Modal`、`SegmentedControl`、`NumberInput`。`@mantine/dates` の `DateInput` は `onChange(value: DateStringValue \| null)`（**文字列**）で `valueFormat` を持つ。`DatesProvider settings={{ locale, firstDayOfWeek }}`。`dayjs/locale/ja` は同梱 |
| nuqs 2 | `createParser({ parse, serialize })` で独自 parser、`useQueryStates(parsers, { shallow: false, startTransition })` で Server の再フェッチと `isPending` |
| Next 16 | `refresh()`（`next/cache`）は Server Action から現在のルートを再描画する。`revalidatePath` は「訪問済みの全ページを次回訪問時に refresh する」副作用が現状ある（API リファレンスの Good to know）。`useOptimistic` は transition 終了で基底値（Server の props）に戻る |
| v1 のロケール | 日別モーダルの見出しは `short_with_weekday` = `9/18 (金)`。メモモーダルは `9月18日` |

---

## 3. 事前に確認したい決定

### 3.1 期間の状態は URL `?start=` だけ。v1 の cookie（直近の開始日）は持たない

v1 は `params[:start_date]` → `cookies[:current_start_date]`（1 か月）→ 月初 の順で決めていた。
v2 は 001 §4.2 のとおり nuqs の `?start=`（`YYYY-MM-DD`）だけにする。設定画面から「シフト表」リンクで戻ると当月に戻る。

- URL が正なので、ブックマークや共有した URL の意味が cookie で変わらない
- proxy に cookie を書く処理を増やさない（直近店舗の cookie は 005 で書いているが、それは店舗切替の導線のため）

「直近の期間を覚えていてほしい」が出たら、ヘッダーの「シフト表」リンクを Client 側で `sessionStorage` の値付きにする程度で足せる。

`start` は自作 parser（`isDateString()` を通らなければ null → 既定）。既定値は JST の今日の月初で、Server（loader）と Client（ナビ）で同じ関数を使う。
期間の**正規化**（週初への丸めなど）は `dateRange()` が行い、URL の `start` は書き換えない。前後移動は正規化後の範囲から計算する。

### 3.2 アサインは RPC `public.assign_shift` で 1 トランザクション（スキーマ変更あり）

001 §4.4 の決定どおり。PostgREST の 3 呼び出し（DELETE → INSERT → upsert）だと、途中で失敗したときに「本体は消えたがペアは残る」が起きる。

```
assign_shift(p_tenant_id uuid, p_staff_id uuid, p_date date, p_fixed boolean, p_pattern_id uuid default null) returns void
```

`p_pattern_id` は **`default null`** にする。生成型は既定値の無い引数を必須の `string` にするので、「空」で `null` を渡すと型エラーになる（5.2）。

1. `staffs` に (id, tenant_id) が見えなければ `raise exception 'assign_shift: staff not found'`（RLS で他店舗は見えない = 存在を漏らさない）
2. (staff, date) の既存行があれば: そのパターンに `pair_pattern_id` があり、**翌日の行がその pair パターンなら**翌日を削除 → 既存行を削除
3. `p_pattern_id` が null なら終了（= 「空」）
4. 新パターンが同一テナントに見えなければ `raise exception 'assign_shift: pattern not found'`
5. INSERT → 新パターンに pair があれば翌日を `insert ... on conflict (staff_id, date) do update set pattern_id, fixed`（v1 と同じ上書き。fixed も同じ値）

`security invoker`（006 の `reorder_positions` と同じ）。他店舗の行は RLS で見えず 1. で止まる。`revoke from public` → `grant to authenticated`、
anon は `unmanaged/restrict_anon_grants.sql` が外す（pgTAP の「anon が EXECUTE できる public 関数は無い」がそのまま守る）。

**ペア解除の改善**（001 §4.4）: v1 は翌日を**パターン問わず**削除していた（手で入れた翌日の早番まで消える）。v2 は pair パターンのときだけ消す。
翌日が手動で同じ pair パターンにされていた場合は区別できず消えるが、これは v1 と同じ。

`fixed` の切替（下書き ↔ 確定）も同じ RPC を同じパターンで呼ぶ（delete + insert で id が変わるが、`shifts.id` を参照する行は無い）。

スキーマ変更なので 003 / 006 と同じ手順で `migrations/` を空にして `init_schema` を作り直し、unmanaged を追記、`db reset` → `test db` → `gen types`。

### 3.3 半月の前後移動は「前半 ↔ 後半」の切替で書く（v1 の −13 / +16 をやめる）

`dateRange()` で正規化した範囲の開始日から:

| 周期 | 前 | 次 |
| --- | --- | --- |
| week / two_week | −7 / −14 日 | +7 / +14 日 |
| half_month | 開始日が 1 日なら前月 16 日、16 日なら同月 1 日 | 1 日なら同月 16 日、16 日なら翌月 1 日 |
| month | −1 か月（dayjs は月末を丸める。v1 の `prev_month` と同じ） | +1 か月 |

結果は v1 と同じになる（v1 の固定値も `date_range` で吸収されていた）が、境界が読めるコードになる。Vitest で 2 月後半・31 日月・年跨ぎを固定する。

### 3.4 ツールバーは 007 では期間ナビだけ。他のボタンは各マイルストーンで足す

集計（008）/ 共有・PDF・CSV（009 / 010）/ ツール（008）の無効ボタンを先に置かない（押せないボタンは製品として意味がなく、
006 の `pending` リンクと違って着地先の URL も無い）。`Toolbar` は左に期間ナビ、右に空の `Group` を持ち、008 以降がそこに足す。
スタッフ名セルのメニューは「スタッフ情報を編集」だけ入れ、一括操作 3 件は 008 で足す。

### 3.5 シフト表の書き込みは `refresh()` で現在のルートだけ再描画する

設定の Action は `revalidatePath('/tenants/<id>', 'layout')`（設定の変更はシフト表にも効くため）。シフト表の Action（アサイン・必要人数・メモ）は
**現在見ている `?start=` のページを再描画すればよい**ので、Next 16 の `refresh()`（`next/cache`）を使う。

- セルのアサインは 1 画面で何十回も呼ぶ。`revalidatePath` は「訪問済みの全ページを次回訪問時に refresh する」副作用（API リファレンス）があり、
  設定画面などを毎回作り直すことになる
- `refresh()` は Server Action のレスポンスに現在ルートの RSC を含めるので、`useOptimistic` の transition がその描画で終わる（`interactive-apps.md` のパターン）
- シフト表のデータを他のページは読まない（009 の公開ページは service_role で DB 直読、010 は Route Handler）ので、キャッシュの無効化は要らない

AGENTS.md に「一覧の中で完結する書き込みは `refresh()`、他ページにも影響する書き込みは `revalidatePath`」と追記する。

### 3.6 必要人数の保存は upsert。「デフォルト人数をセット」も 1 回の upsert

v1 は delete → import（非トランザクション）。v2 は `required_nums` の `unique (pattern_id, date)` に `onConflict: 'pattern_id,date'` で upsert し 1 往復にする。

- 日別モーダル: 出勤日パターン全件を `{ patternId: num }` で送る（空欄は 0。v1 と同じ）。0 も行として保存する（「未設定」と区別しない。v1 と同じ。表示側は行が無ければ 0）
- 一括セット: 入力は `{ tenantId, start, end }`（表示中の範囲。Zod で `end >= start` かつ 31 日以内）。Server で祝日を判定し、出勤日パターン × 日付の行を
  `parseRequiredNums(default_required_nums)[holiday ? 'holiday' : wday] ?? 0` で作って upsert。休みパターンの既存行は触らない（表示に使わないため）

複合 FK `(pattern_id, tenant_id)` があるので、他店舗のパターン id を混ぜると 23503 で 1 行も入らない（006 §2 と同じ）。

### 3.7 ポップオーバーの候補は「選択可能なパターン + 現在アサイン中のパターン」

v1 は `available_patterns` に無いパターンを隠すので、設定で外したあとは「下書き ↔ 確定」の切替（同じパターンの押し直し）ができなかった。
現在アサイン中のパターンは候補に残す。それ以外は v1 と同じ（選択可能なパターンだけ、先頭は「空」）。
サーバー側では選択可能かを検査しない（v1 と同じ。RPC はテナント境界だけを見る）。

### 3.8 祝日は `@holiday-jp/holiday_jp` を **Server だけ**で使い、期間分の日付配列を Client に渡す

001 §2 の決定。データが 1.4MB あるのでクライアントには送らない。`lib/calendar/holidays.ts`（`server-only`）に
`holidaysIn(dates: string[]): string[]` を置き、`Object.hasOwn(holiday_jp.holidays, date)` の**文字列キー**で引く（`Date` を渡すとサーバー TZ で日付が 1 日ずれうる）。
`dayKeyFor(date, isHoliday): DayKey`（日別モーダルの「デフォルト人数をセット」で Client も使う）は `weekdays.ts` に置き、`holidays.ts` は server-only のまま保つ。
Client は `Set<string>` にして日付行の色と日別モーダルの `holiday` キー判定に使う。008 の「デフォルト勤務パターンをセット」も同じ関数を使う。

### 3.9 Popover はアクティブなセルだけ mount する

31 日 × 在籍スタッフ数（30 人なら 930）のセルすべてを `Popover` で包むと floating-ui のフックがその数だけ動く。
`ShiftsClient` が `activeCell: { staffId, date } | null` を 1 つ持ち、そのセルだけ `Popover opened` で包む（他は素の `Button`）。
`onDismiss`（外クリック / Esc）と「×」で null に戻す。同時に 1 つしか開かない（v1 の `tippy.hideAllPoppers()` と同じ）。

### 3.10 楽観更新は純関数 `applyAssign()` を reducer にする

`useOptimistic(shifts, applyAssign)`。`applyAssign(shifts, patternsById, { staffId, date, patternId, fixed })` は RPC と同じ意味
（ペアの解除条件・翌日の上書き）を TS で書いた純関数で、Vitest で固定する。SQL と TS の 2 か所に同じ規則があることは避けられないので、
テストケースを pgTAP と同じ並びにして突き合わせやすくする。

失敗時は transition 終了で Server の props に戻る。通知（RPC から写した文言）を出し、`router.refresh()` で読み直す（006 §10.8 の 1 と同じ理由。
失敗の主因は「別タブでパターン / スタッフが消された」= この画面が古い）。

### 3.11 アサイン済み数は表示中の在籍スタッフの shifts から数える

v1 は Ruby 側（`Calendar#assigned_count`）が退職者の shifts も数え、JS 側（DOM のボタン数）は在籍者だけ数えていて食い違っていた。
v2 は Client が持つ shifts（在籍スタッフ分）から数える。退職者のシフトは表示されないので、見えている数と ✓ / ! が一致する。

### 3.12 確定セルの文字色は v1 と同じ「パターン色が白以外なら白文字」

黄色（`#FFEB3B`）の確定に白文字はやや読みにくいが、v1 の PDF・共有ページも同じ規則で、色ごとの見え方をユーザーが覚えている。
輝度で切り替える改善は 010 の PDF と一緒に判断する。

---

## 4. 成果物

```
package.json                                  @holiday-jp/holiday_jp を dependencies に追加
supabase/
  schemas/public/functions.sql                assign_shift(p_tenant_id, p_staff_id, p_date, p_pattern_id, p_fixed)（3.2）
  migrations/<ts>_init_schema.sql             作り直し（+ unmanaged の REVOKE を末尾に追記）
  tests/rls_tenant_isolation.sql              assign_shift 7 件 + shifts / required_nums / date_notes の境界 3 件
src/
  types/database.ts                           再生成（Functions に assign_shift）
  lib/
    calendar/
      dateString.ts (+ .test.ts)              isDateString / addDays / addMonths / wday / formatMonthDay（YYYY-MM-DD 文字列の薄い道具。dayjs を包む）
      dateRange.ts (+ .test.ts)               dateRange(cycle, startOfWeek, start) / prevStart / nextStart / defaultStart(todayJst)（3.1 / 3.3）
      today.ts                                todayJst()（Intl の Asia/Tokyo。テストは日付を注入）
      holidays.ts (+ .test.ts)                holidaysIn(dates)（server-only。3.8）
      weekdays.ts                             dayKeyFor(date, isHoliday): DayKey を追加（Client でも使う）
    shifts/
      key.ts                                  cellKey(staffId, date) と ShiftCell 型（Server / Client 共有）
      applyAssign.ts (+ .test.ts)             楽観更新の reducer（3.10）
      satisfaction.ts (+ .test.ts)            assignedCounts(shifts, workdayIds) / isSatisfied(date, required, assigned, workdayIds)
    patterns/
      colors.ts                               fixedTextColor(hex)（3.12）を追加
      requiredNums.ts                         defaultRequiredNum(pattern, dayKey) を追加（既存 parseRequiredNums を使う）
    validation/
      date.ts (+ .test.ts)                    dateStringSchema（YYYY-MM-DD、実在する日付）
      shifts.ts (+ .test.ts)                  assignShiftSchema
      requiredNums.ts (+ .test.ts)            saveRequiredNumsSchema / setDefaultRequiredNumsSchema（3.6）
      dateNotes.ts (+ .test.ts)               DATE_NOTE_MAX_LENGTH = 12 / saveDateNoteSchema
    queries/
      staffs.ts                               listActiveStaffsWithPatternIds（`staffs.select('*, staff_patterns(pattern_id)')`）
      shifts.ts                               listShifts(tenantId, start, end)（tenant_id + date の範囲で読む。退職者の行は page.tsx が在籍スタッフの id で絞ってから Client に渡す）
      requiredNums.ts                         listRequiredNums(tenantId, start, end)
      dateNotes.ts                            listDateNotes(tenantId, start, end)
  app/(protected)/tenants/[tenantId]/shifts/
    page.tsx                                  loader → tenant / staffs / patterns / shifts / required_nums / date_notes / holidays → ShiftsClient
    searchParams.ts                           start: createParser(isDateString)、loadShiftsSearchParams
    actions.ts                                assignShift（patternId が null なら p_pattern_id を省いて rpc）/ saveRequiredNums / setDefaultRequiredNums / saveDateNote
    _components/
      ShiftsClient.tsx                        状態の置き場（optimistic shifts / activeCell / モーダル）。DatesProvider(ja)
      Toolbar.tsx                             ‹ 期間 ›（期間ボタンの Popover に周期・週始まり・「変更」リンク・DateInput・更新。5.7）
      CalendarTable.tsx (+ .module.css)       sticky なヘッダ 3 行 + 先頭列（v1 sticky_table.scss の再現）
      DateHeaderCell.tsx                      曜日・日（色分け）
      DateNoteCell.tsx                        メモ or ペンアイコン → DateNoteModal
      RequiredNumCell.tsx                     ✓ / ! → RequiredNumModal
      StaffNameCell.tsx                       名前 + Menu（スタッフ情報を編集）
      ShiftCell.tsx                           セルの Button（担当可 / 不可 / 下書き / 確定）。active のとき Popover
      PatternPopover.tsx                      SegmentedControl（下書き / 確定）+ 空 + パターンボタン（3.7）
      RequiredNumModal.tsx                    日別必要人数（デフォルト人数をセット / アサイン済）
      DateNoteModal.tsx                       12 文字のメモ
      PatternDescriptionList.tsx              フッタ（名前: 説明）
      SetupNotice.tsx                         スタッフ / パターンが 0 件のときに表の上に出す案内（文言は v1 _tutorial）
docs/plans/007-shifts-calendar/README.md      このファイル（実装後にログ追記）
AGENTS.md                                     lib/calendar の中身、assign_shift、refresh() の使い分け（3.5）、holiday_jp は server-only
```

### 画面と Action

| 要素 | Server（page） | Client | Action |
| --- | --- | --- | --- |
| 期間ナビ | `loadShiftsSearchParams` → `dateRange()`。`holidaysIn(dates)` | `useQueryStates(shiftsParsers, { shallow: false, startTransition })`。移動中は `LoadingOverlay` | なし |
| セル | `listActiveStaffsWithPatternIds` / `listPatterns` / `listShifts` | `useOptimistic(shifts, applyAssign)` → `ShiftCell` → `PatternPopover` | `assignShift({ tenantId, staffId, date, patternId, fixed })` → RPC |
| 人数行 | `listRequiredNums` | `isSatisfied()` を optimistic shifts から計算 → `RequiredNumModal` | `saveRequiredNums({ tenantId, date, nums })` / `setDefaultRequiredNums({ tenantId, start, end })` |
| メモ行 | `listDateNotes` | `DateNoteModal` | `saveDateNote({ tenantId, date, note })`（空なら delete） |

すべての Action は 006 と同じ流れ: `runAction` → Zod → `requireUser()` → `createClient()` → 書き込み → **`refresh()`**（3.5）。
RPC の `raise exception` は `error.message` の `staff not found` / `pattern not found` を「スタッフが見つかりません」「勤務パターンが見つかりません」に写し、
それ以外は `GENERIC_ERROR_MESSAGE`。

### Client に渡す props（シリアル化可能な最小）

```ts
type ShiftsClientProps = {
  tenantId: string
  tenant: { shiftCycle: ShiftCycle; startOfWeek: number }
  range: { start: string; end: string; dates: string[] }
  holidays: string[]
  staffs: { id: string; name: string; availableWdays: number[]; patternIds: string[] }[]
  patterns: { id: string; name: string; description: string | null; colorHex: string; kind: PatternKind; pairPatternId: string | null; defaultRequiredNums: RequiredNumsByDay }[]
  shifts: ShiftCell[]                    // { staffId, date, patternId, fixed }
  requiredNums: { patternId: string; date: string; num: number }[]
  dateNotes: { date: string; note: string }[]
}
```

`default_required_nums`（`Json`）は Server で `parseRequiredNums()` に通してから渡す（Client に `Json` を持ち込まない。006 §3.9）。
`shifts` は page.tsx が在籍スタッフの id で絞ってから渡す（3.11。クエリの `.in('staff_id', …)` にはしない。5.8）、`requiredNums` は Client 側で出勤日パターンに絞って使う（006 §10.6）。

### 文言（v1 から移植）

- ツールチップ: 「前の期間」「次の期間」「表示期間を変更」。期間ドロップダウン: 「シフト表の作成周期」「（○曜日始まり）」「変更」「開始日」「更新」
- ポップオーバー: 「下書き」「確定」。人数行の見出し「人数」、メニュー「一括操作」「デフォルト人数をセット」
- 日別モーダル: 見出し `9/18 (金)`、「デフォルト人数をセット」、「デフォルト人数は 勤務パターン設定画面 で設定できます」、列「必要人数」「アサイン済」、「キャンセル」「必要人数を保存」
- メモモーダル: 見出し `9月18日`、「イベントなどの情報をメモできます。」、「最大12文字まで」、「保存」
- 確認: 「現在の期間に一括でデフォルトの必要人数をセットします。よろしいですか？」
- 通知: 「更新しました」（必要人数）、「デフォルト人数を設定しました」、メモは通知なし（表示が変わるので不要）、アサインは成功時なし・失敗時は RPC から写した文言（「スタッフが見つかりません」「勤務パターンが見つかりません」。それ以外は「処理に失敗しました」）
- 案内（0 件）: 「初期設定を完了してください。」「STEP1 クリックして勤務パターンを登録」「STEP2 クリックしてスタッフを登録」（登録済みの STEP に ✓）

---

## 5. 設計の要点

### 5.1 `dateRange()`

```ts
export type DateRange = { start: string; end: string; dates: string[] }

export function dateRange(cycle: ShiftCycle, startOfWeek: number, start: string): DateRange
// week:       s = start - ((wday(start) - startOfWeek + 7) % 7); e = s + 6
// two_week:   同上で e = s + 13
// half_month: day(start) <= 15 ? [1 日, 15 日] : [16 日, 月末]
// month:      s = start; e = addMonths(start, 1) - 1 日
export function prevStart(cycle: ShiftCycle, range: DateRange): string   // 3.3 の表
export function nextStart(cycle: ShiftCycle, range: DateRange): string
export function defaultStart(today: string): string                       // 月初
```

日付は全部 `YYYY-MM-DD` 文字列。dayjs は `dateString.ts` の中だけで使い、`format('YYYY-MM-DD')` で返す（AGENTS.md の規約）。

month の開始日が 1 日以外のとき、`1/31 → 2/28 → 3/28` のように月末で日がずれる（dayjs も Ruby の `+ 1.month` も月末に丸める）。v1 と同じ挙動で、
開始日を 1 日以外にするのは日付指定のときだけなので直さない。Vitest に「1 日始まりなら往復してもずれない」を固定する。
`todayJst()` は `Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' })` で `YYYY-MM-DD` を得る（dayjs の timezone プラグインを足さない）。

### 5.2 `assign_shift`（SQL の骨子。正は `functions.sql`）

```sql
create or replace function public.assign_shift(
  p_tenant_id uuid, p_staff_id uuid, p_date date, p_fixed boolean, p_pattern_id uuid default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_current  public.shifts%rowtype;
  v_old_pair uuid;
  v_new_pair uuid;
begin
  if not exists (select 1 from public.staffs where id = p_staff_id and tenant_id = p_tenant_id) then
    raise exception 'assign_shift: staff not found';
  end if;

  select * into v_current from public.shifts
   where tenant_id = p_tenant_id and staff_id = p_staff_id and date = p_date;
  if found then
    select pair_pattern_id into v_old_pair from public.patterns where id = v_current.pattern_id;
    if v_old_pair is not null then
      delete from public.shifts
       where tenant_id = p_tenant_id and staff_id = p_staff_id and date = p_date + 1 and pattern_id = v_old_pair;
    end if;
    delete from public.shifts where id = v_current.id;
  end if;

  if p_pattern_id is null then return; end if;

  select pair_pattern_id into v_new_pair from public.patterns where id = p_pattern_id and tenant_id = p_tenant_id;
  if not found then raise exception 'assign_shift: pattern not found'; end if;

  insert into public.shifts (tenant_id, staff_id, pattern_id, date, fixed)
  values (p_tenant_id, p_staff_id, p_pattern_id, p_date, p_fixed);

  if v_new_pair is not null then
    insert into public.shifts (tenant_id, staff_id, pattern_id, date, fixed)
    values (p_tenant_id, p_staff_id, v_new_pair, p_date + 1, p_fixed)
    on conflict (staff_id, date) do update set pattern_id = excluded.pattern_id, fixed = excluded.fixed;
  end if;
end;
$$;
```

`p_pattern_id uuid default null` にするのは生成型のため。`gen types` は既定値の無い引数を `Args: { p_pattern_id: string }` と必須の非 null で出す
（既存の `reorder_positions` の生成結果で確認）ので、そのままだと「空」で `null` を渡せない。既定値を付ければ `p_pattern_id?: string` になり、
Action は「空」のときキーを**省く**（`patternId === null` なら `p_pattern_id` を渡さない）。SQL 側は省かれた引数を null として受ける。

pgTAP（ユーザー A の文脈。fixtures に A の 夜勤 → 明け のペア（`pair_pattern_id` は複合 FK なので INSERT 後に UPDATE で張る）と、
B 側の shifts / required_nums / date_notes を 1 行ずつ足す）:

1. 早番をセット → 1 行できる
2. 夜勤をセット → 翌日に明け（fixed も同じ）
3. 翌日を手で早番にしてから夜勤を外す → 翌日の早番は**残る**（v2 の改善）
4. 翌日が明けのまま夜勤を外す → 両方消える
5. 何も無いセルに null → 例外にならず 0 行
6. 他店舗の staff_id → `P0001` `assign_shift: staff not found`
7. 他店舗の pattern_id → `P0001` `assign_shift: pattern not found`

anon の EXECUTE 拒否は既存の `pg_proc` 走査で固定される。あわせて「A には B の shifts / required_nums / date_notes が見えない」を 3 件足す（AGENTS.md「テーブルを足したらここにも足す」の取りこぼし）。

### 5.3 `applyAssign()`（Client の reducer。5.2 と同じ規則）

```ts
export function applyAssign(shifts: ShiftMap, patternsById: Map<string, Pattern>, a: AssignInput): ShiftMap {
  const next = new Map(shifts)
  const current = next.get(cellKey(a.staffId, a.date))
  if (current) {
    const oldPair = patternsById.get(current.patternId)?.pairPatternId
    const tomorrow = addDays(a.date, 1)
    if (oldPair && next.get(cellKey(a.staffId, tomorrow))?.patternId === oldPair) next.delete(cellKey(a.staffId, tomorrow))
    next.delete(cellKey(a.staffId, a.date))
  }
  if (!a.patternId) return next
  next.set(cellKey(a.staffId, a.date), { ...a, patternId: a.patternId })
  const newPair = patternsById.get(a.patternId)?.pairPatternId
  if (newPair) next.set(cellKey(a.staffId, addDays(a.date, 1)), { staffId: a.staffId, date: addDays(a.date, 1), patternId: newPair, fixed: a.fixed })
  return next
}
```

翌日が表示期間外なら Map に入っても描かれないだけで、Server の再描画で消える。

### 5.4 sticky テーブル（`CalendarTable.module.css`）

v1 `sticky_table.scss` を CSS Modules で再現する（AGENTS.md「sticky テーブルなど Mantine にないレイアウトだけ CSS Modules」）。

- 素の `<table>` を使う（Mantine `Table` の枠線・余白のスタイルと sticky の指定が競合するため。001 §4.6）
- ページを縦の flex にし、`height: calc(100dvh - var(--app-shell-header-height) - var(--app-shell-padding) * 2)`。表のコンテナは `flex: 1; min-height: 0; overflow: auto`（v1 の `--vh` ハックは `dvh` で不要。ヘッダ高さは Mantine の CSS 変数で受け、56 を直書きしない）
- `thead th { position: sticky; top: 0 }`、2 行目 / 3 行目は `top` をそれぞれの高さ分ずらす。`th:first-child { position: sticky; left: 0; z-index: 2 }`
- 列幅: 先頭 95px、日付 50px（v1）。`table-layout: fixed; border-collapse: separate`
- 色はパターン色（ユーザーデータ）だけ inline style。枠線・背景（whitesmoke 等）は Mantine の CSS 変数（`--mantine-color-gray-1` など）で書き、hex を直書きしない

### 5.5 Zod（抜粋）

```ts
// date.ts
export const dateStringSchema = z.string({ error: '日付が正しくありません' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: '日付が正しくありません' })
  .refine(isDateString, { error: '日付が正しくありません' })

// shifts.ts
export const assignShiftSchema = z.object({
  tenantId: tenantIdSchema, staffId: staffIdSchema, date: dateStringSchema,
  patternId: patternIdSchema.nullable(),
  fixed: z.boolean({ error: '下書き / 確定が正しくありません' }),
})

// requiredNums.ts（NumberInput の '' は 0 に寄せる。v1 の「空欄は 0」）
const numSchema = z.preprocess((v) => (v === '' ? 0 : v),
  z.int({ error: '必要人数を入力してください' }).min(0, …).max(99, …))
export const saveRequiredNumsSchema = z.object({
  tenantId: tenantIdSchema, date: dateStringSchema,
  nums: z.record(patternIdSchema, numSchema),
})
export const setDefaultRequiredNumsSchema = z.object({ tenantId: tenantIdSchema, start: dateStringSchema, end: dateStringSchema })
  // month 周期はちょうど 31 日になりうるので `<=`（`< 31` だと 1/1..1/31 を弾いてしまう）
  .refine((v) => v.end >= v.start && daysBetween(v.start, v.end) <= MAX_TERM_DAYS, { error: '期間が正しくありません' })

// dateNotes.ts
export const DATE_NOTE_MAX_LENGTH = 12
export const saveDateNoteSchema = z.object({
  tenantId: tenantIdSchema, date: dateStringSchema,
  note: z.string({ error: 'メモの形式が正しくありません' }).trim().max(DATE_NOTE_MAX_LENGTH, { error: `メモは${DATE_NOTE_MAX_LENGTH}文字以下で入力してください` }),
})
```

`YYYY-MM-DD` は辞書順 = 日付順なので `end >= start` の比較は文字列のままでよい。

### 5.6 ポップオーバーの操作

- パターンボタン押下 → `assign(patternId, fixed)` → Popover を閉じる
- 「空」→ `assign(null, fixed)`
- SegmentedControl を変えたとき、そのセルにアサインがあれば同じパターンで `assign(currentPatternId, newFixed)`（v1 の「ラジオ変更で自動的に押し直す」）。無ければ値だけ変える
- transition 中はボタンを `disabled`（連打防止。Server Function は逐次実行されるので順序は保たれるが、二重の楽観更新を避ける）

### 5.7 期間ドロップダウンの中の `DateInput`

`Toolbar` の期間ボタンは `Popover`、その中の開始日は `@mantine/dates` の `DateInput`。`DateInput` のカレンダーも `Popover` で、既定では **Portal に描かれる**ため、
カレンダーの日付をクリックすると外側の `Popover` には「外側クリック」に見えて閉じてしまう（`DateInput` も一緒に unmount される）。
`DateInput` に `popoverProps={{ withinPortal: false }}` を渡してカレンダーを外側のドロップダウンの DOM の中に描く。
実装時にこれで足りなければ、`Popover` ではなく `Modal`（期間の変更）に切り替える。

### 5.8 退職者の shifts の絞り込みはクエリではなく TS で

`listShifts` は `tenant_id` + `date` の範囲だけで読む（`shifts_tenant_date_idx` に乗る）。在籍スタッフの id で `.in('staff_id', ids)` を付けると
PostgREST の GET の URL に id が並び、在籍者が多い店舗で URL が長くなりすぎる（uuid 1 件 37 文字。200 人で 7KB 超）。
退職者のシフトは期間内でも少数なので、page.tsx が在籍スタッフの `Set` で絞ってから Client に渡す。

---

## 6. 手順

1. ブランチ `007-shifts-calendar`（`006-settings` から）
2. `npm i @holiday-jp/holiday_jp`
3. **スキーマ**: `functions.sql` に `assign_shift` → `rm supabase/migrations/*.sql` → `db schema declarative sync --no-apply --name init_schema --strict-coverage` → unmanaged を追記 → `db reset` → pgTAP を足して `plan(38)` → `plan(68)`（実装後の件数。§10.4 の 10 / 11 とレビュー対応で増えた）→ `test db` → `gen types`
4. **lib**（Vitest を先に書く）: `calendar/dateString` → `dateRange` → `today` → `holidays` → `shifts/key` / `applyAssign` / `satisfaction` → validation 4 ファイル → `patterns/colors` / `requiredNums` の追加
5. **queries**: `listActiveStaffsWithPatternIds` / `listShifts` / `listRequiredNums` / `listDateNotes`
6. **actions**: `assignShift` → `saveDateNote` → `saveRequiredNums` → `setDefaultRequiredNums`
7. **UI**: `searchParams.ts` / `page.tsx` → `ShiftsClient` + `Toolbar`（期間移動が先に動く状態にする）→ `CalendarTable` + CSS → `ShiftCell` + `PatternPopover` → `RequiredNumCell` + Modal → `DateNoteCell` + Modal → フッタ / 0 件の案内
8. AGENTS.md の追記（§4）
9. `format:check` / `lint` / `typecheck` / `test` / `build` / `test db`
10. ブラウザで §1 の完了条件を seed 店舗（4 周期を設定で切り替えながら）と新規店舗（0 件の案内）で通す。390px も。`shifts` / `required_nums` / `date_notes` は psql で確認。ペアの 4 ケース（5.2 の 1〜4）を画面でも再現する
11. 実装ログをこのファイルに追記して確認を取る

---

## 7. スコープ外

- 一括操作（すべて確定 / 下書きに戻す / 下書きクリア。全体・スタッフ単位）、デフォルト勤務パターンをセット、シフトコピー、集計モーダル（008）
- URL 共有（009）、PDF / CSV（010）
- 自動アサイン、スタッフグループ、スタッフ上限のロックパネル（001 §1 / §7.3）
- 直近の表示期間の記憶（3.1）
- 確定セルの文字色を輝度で決める改善（3.12）
- 必要人数の一括入力モーダル（v1 の `_bulk_edit`。ルートが無く、到達できない残骸）

---

## 8. 001 / 006 からの変更点（まとめ）

| 項目 | 001 / 006 | 007 |
| --- | --- | --- |
| 半月の前後移動 | v1 の −13 / +16（001 は「前半 ↔ 後半で切替」とだけ） | 前半 ↔ 後半を明示的に書く（3.3） |
| 書き込み後の再描画 | `revalidatePath('/tenants/<id>', 'layout')`（005 / 006） | シフト表の Action は `refresh()`（3.5）。設定側は据え置き |
| 必要人数の保存 | v1 は delete + import | upsert 1 回（3.6） |
| ポップオーバーの候補 | v1 は選択可能なパターンだけ | + 現在アサイン中のパターン（3.7） |
| 祝日 | 001「`@holiday-jp/holiday_jp`」 | Server だけで使い、日付配列を渡す（3.8） |
| アサイン済み数 | v1 は Ruby / JS で母集団が違った | 表示中の在籍スタッフの shifts から数える（3.11） |
| 期間の状態 | v1 は URL → cookie → 月初 | URL → 月初。cookie 無し（3.1） |

---

## 9. セルフレビューでの修正（2026-09-18）

初稿を読み直し、前提を実物（`node_modules` / v1 のコード / npm のパッケージ）で確かめて直した点。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | pgTAP の現在の件数を 36 と書いていたが、`select plan(38)` で 38 件 | §6 を `plan(38)` → `plan(48)` に修正 |
| 2 | `dayKeyFor()` を server-only の `holidays.ts` に置いていたが、日別モーダルの「デフォルト人数をセット」は Client で `holiday` キーを判定する | `weekdays.ts` へ移し、`holidays.ts` は `holidaysIn()` だけにする（§3.8 / §4） |
| 3 | `holiday_jp.holidays[date]` と書いていたが、型が 1,300 件超のリテラルの object なので添字アクセスは型エラーになる。`isHoliday()` は `string` も受けるが `Object.keys().includes()` の線形探索 | `Object.hasOwn(holiday_jp.holidays, date)` で引く。CommonJS（`export =`）だが `esModuleInterop: true` で default import できることを tsconfig で確認（§2） |
| 4 | 「0 件のときは案内を出す」が、表を出さないのか読めなかった。v1 を確かめると `shifts/_tutorial` は index から render されていない残骸で、表は空でも描かれる | 「表の上に案内、表は空のまま描く」に確定（§1 / §2 / §4） |
| 5 | `listShifts` が退職者の行も返し、Client で捨てる前提になっていた。3.11 の「表示中の在籍スタッフから数える」と食い違う | `listShifts(tenantId, staffIds, start, end)` で表示する在籍スタッフの分だけ読む（§4） |
| 6 | sticky テーブルの高さに「ヘッダ 56px」を直書きしていた。AGENTS.md の「色・寸法は theme / CSS 変数」に反する。Mantine は `--app-shell-header-height` を出している（`AppShell.css` で確認） | flex 列 + CSS 変数に書き換え。`<table>` は素の要素にする理由も追記（§5.4） |
| 7 | month の前後移動で開始日が月末のときに日がずれる（`1/31 → 2/28 → 3/28`）ことを書いていなかった | v1 と同じ挙動として §5.1 に明記し、「1 日始まりならずれない」を Vitest に入れる |
| 8 | pgTAP の fixture に「B 側の shifts / required_nums / date_notes」と「A のペアパターン」が必要なことを書いていなかった | §5.2 に追記 |

確かめて問題が無かったもの:

- **`refresh()`**: `next/cache` から export されている（`cache.d.ts` 7 行目）。Server Action 専用で、`runAction` の try / catch の中で呼んでも例外は出ない
- **`security invoker` + `set search_path = ''`**: 既存の `reorder_positions` と同じ属性。`assign_shift` も揃える（SQL の骨子は既に `public.` を全部付けている）
- **Mantine `DateInput`**: `onChange` は `DateStringValue`（= `string`）で、`YYYY-MM-DD` の持ち回りと相性がよい。`Popover` に `onDismiss` / `clickOutsideEvents` がある
- **Zod 4**: `z.preprocess` / `z.record(keySchema, valueSchema)` がある。`z.record` の不正キーは `invalid_key` になり、`toActionError` が汎用文言に落とす（006 §10.7 の 2）
- **`on conflict do update` と RLS**: `shifts_member_all` が `for all` なので、INSERT の WITH CHECK も UPDATE の USING / WITH CHECK も通る
- **RLS 越境の見え方**: 他店舗の staff は `assign_shift` の最初の `exists` で見えず `staff not found`、他店舗の pattern は `pattern not found`。どちらも「存在しない」と同じ文言で存在を漏らさない

### 2 回目のレビュー（2026-09-18）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | **期間ドロップダウン（Popover）の中に `DateInput` を置くと、カレンダーの日付を押した瞬間に外側の Popover が閉じる。** `DateInput` のカレンダーは Portal に描かれるので、外側から見ると「外側クリック」になる。このまま作ると開始日を選べない | `popoverProps={{ withinPortal: false }}` でカレンダーを外側の DOM の中に描く。駄目なら `Modal` に切り替える（§5.7）。`DateInput` に `popoverProps` があることを d.ts で確認 |
| 2 | **1 回目のレビューで `listShifts(tenantId, staffIds, …)` にした修正が、在籍者の多い店舗で URL を長くする。** `.in('staff_id', ids)` は PostgREST の GET クエリに uuid を並べるので、200 人で 7KB を超える | クエリは `tenant_id` + `date` の範囲だけにし、在籍スタッフでの絞り込みは page.tsx の TS で行う（§4 / §5.8） |

確かめて問題が無かったもの:

- **連打時の `useOptimistic`**: Server Action はクライアントで逐次実行される（`server-actions.md` Sequential dispatch）。1 つ目の `refresh()` で基底値が入れ替わっても、
  React はまだ pending の transition の楽観更新を新しい基底値の上に再適用するので、2 つ目のセルが一瞬戻ることはない
- **1 クリックごとの再描画コスト**: `refresh()` は現在ルート（tenant layout + page）を再描画するので 1 クリックあたり 6 クエリ。v1 も 1 クリック 1 リクエスト + 行の再描画で、規模は同じ。
  `revalidatePath` にしても現在ページの再描画は同じで、他ページの無効化が増えるだけ
- **`on conflict do update` と RLS**: 衝突する翌日の行は同一スタッフ（= 同一テナント）なので SELECT / UPDATE ポリシーを通る。他テナントの行と衝突することは `unique (staff_id, date)` の staff が自テナントである以上ない
- **pgTAP の 3（翌日を手で早番にしてから夜勤を外す）の手順**: 夜勤 → 翌日に明け → 翌日を早番に（明け はペアを持たないので明けだけ消えて早番が入る）→ 夜勤を外す → 旧ペア = 明け ≠ 早番 なので残る。SQL の分岐どおりに再現できる
- **月末始まりの month の前後移動**（`1/31 → 2/28 → 3/28`）: v1 と同じ。§5.1 に明記済み

### 3 回目のレビュー（2026-09-18）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | **`assign_shift` の `p_pattern_id uuid` に「空」で `null` を渡すと TypeScript が通らない。** `gen types` は既定値の無い引数を `Args: { …: string }` の必須・非 null で出す（`reorder_positions` の生成結果で確認）。実装に入ってから引数の順序と SQL を変えることになる | 引数を `p_pattern_id uuid default null` にして末尾へ。生成型は `p_pattern_id?: string` になり、Action は「空」のときキーを省く（§3.2 / §5.2 / §4） |

確かめて問題が無かったもの:

- **`--app-shell-padding`**: `AppShell.css` が `padding-top: calc(var(--app-shell-header-offset) + var(--app-shell-padding))` で使っている。§5.4 の高さ計算に使える
- **Server Action の応答**: `refresh()` を呼んだ Action の応答は「戻り値 + 現在ルートの RSC Payload」を 1 つの Flight ストリームで返し、クライアントが seeded navigation として commit する（`server-actions.md`）。`useOptimistic` の transition はこの commit で終わる

疑ったが変えなかったもの:

- **アサイン直後に「›」を押したときの競合**: Action の応答（旧 `?start` の RSC）と nuqs の遷移（新 `?start`）が前後しうる。Server Action は逐次実行だが遷移は別系統で、
  Next がどちらを最終状態にするかは文書化されていない。起きても表示が一瞬旧期間に戻るだけで DB は正しく、v1（Ajax + ページ遷移）にも同じ窓がある。
  実装後にブラウザで試し、旧期間に戻る挙動が再現したら期間ナビをアサインの transition 中だけ `disabled` にする

---

## 10. 実装ログ（2026-09-18）

ブランチ `007-shifts-calendar`（`006-settings` から）。Next 16.3.5 / Mantine 9.6 / Supabase CLI 2.117 / `@holiday-jp/holiday_jp` 2.5.1。

### 10.1 成果物

§4 の構成どおり。プランに無かった追加・変更:

| パス | 内容 |
| --- | --- |
| `src/lib/calendar/dateString.ts` | **プランより広い**。`isDateString` / `addDays` / `addMonths` / `startOfMonth` / `endOfMonth` / `dayOfMonth` / `withDayOfMonth` / `wday` / `datesBetween` / `daysBetween` / `formatMonthDay` / `formatJapaneseMonthDay`。dayjs を使うのはこのファイルだけ（AGENTS.md の規約） |
| `src/lib/shifts/key.ts` の `toShiftMap()` | **追加**。`ShiftCell[]`（Server から届く形）→ `ShiftMap` の変換。page と `useOptimistic` の基底値が共有する |
| `src/lib/shifts/satisfaction.ts` | プランは `assignedCounts` / `isSatisfied` だけだったが、`requiredCounts`（行 → 日付×パターン）と `countAt`（既定 0）も置いた。日別モーダルの「現在値 / アサイン済」も同じ関数で引く |
| `src/lib/calendar/weekdays.ts` の `dayKeyFor()` | プランどおり（§9 の 2 で `holidays.ts` から移した）。`holidays.ts` は `holidaysIn` / `isHolidayDate` だけ |
| `_components/DateHeaderCell.tsx` / `DateNoteCell.tsx` / `RequiredNumCell.tsx` / `StaffNameCell.tsx` | プランどおりに分割。セル 1 つあたりの JSX を小さく保つため |
| `_components/PatternPopover.module.css` | **追加**。40px 角のパターンボタンは Mantine の `Button` では作れない（v1 の `ul.pattern-list li`） |
| `CalendarTable.module.css` の `.menuButton` / `.menuIcon` | スタッフ名と「人数」の見出しが同じ見た目のメニューボタンなので共有する |
| `ShiftsClient` の props | プラン §4 は `range: { start, end, dates }` を渡す形だったが、**`start` だけ渡して Client が `dateRange()` で組み直す**ことにした。日付配列を RSC のペイロードに載せずに済み、前後移動の計算にも同じ関数を使える（Server は queries のために同じ関数で範囲を出す） |
| `defaultRequiredNum()` の引数 | プランは `(pattern, dayKey)` だったが `(value: RequiredNumsByDay, key: DayKey)` にした。`parseRequiredNums()` の結果だけを受ける純関数にして、Server / Client の両方から呼べるようにするため |

### 10.2 プランどおり確認できたこと

- `assign_shift` は `security invoker` のまま RLS が効き、pgTAP 23 件（assign_shift 16 件 + anon の実行拒否 1 件 + shifts / required_nums / date_notes の可視性 3 件 + required_nums / date_notes の書き込み境界 3 件）が PASS。38 → 61 件
- 生成 migration には `GRANT EXECUTE ... TO "anon"` が出るが、`unmanaged/restrict_anon_grants.sql` が末尾で外す。ブラウザから anon キーで RPC を叩くと `42501 permission denied for function assign_shift`
- `p_pattern_id uuid default null` にしたので生成型が `p_pattern_id?: string` になり、「空」はキーを省いて呼べる（§9 の 3 回目のレビューの予想どおり）
- `popoverProps={{ withinPortal: false }}` で期間ドロップダウン内のカレンダーが閉じなくなる（§5.7）。カレンダーの日付を押してもドロップダウンは開いたまま、`更新` で遷移できる
- `refresh()` で現在ルートだけ再描画され、`useOptimistic` の transition がその描画で終わる。1 クリックで期間分のセルが再取得される
- 祝日が曜日より優先される: 火曜のデフォルトを 1 にして一括セットすると、火曜の 9/8・9/15・9/29 は 1、**火曜かつ国民の休日の 9/22 は 0**（DB で確認）
- sticky はヘッダ 3 行と先頭列の両方が効く（横 347px・縦 120px スクロール後も `top`/`left` のオフセットが 0）
- 高さ計算は Mantine の CSS 変数で解ける（900px のビューポートで `.page` が 812px = 900 − 56 − 16×2）

### 10.3 検証結果

```
npm run format:check / lint / typecheck / build → OK
npm test        → 28 files / 210 tests passed（007 で追加したのは 12 ファイル / 88 件）
npx supabase db reset && npx supabase test db → 61 tests PASS
```

ブラウザ（Chrome / Playwright、1280px と 390px）で seed 店舗と新規店舗を通した。**シフト表で console エラー 0 件**。

| 検証 | 結果 |
| --- | --- |
| 初期表示（1 か月） | `9/1 〜 9/30`、30 列 × 在籍 8 名。日曜・土曜・祝日（9/21〜9/23）の色分けが v1 と同じ |
| 前後の期間 | `?start=2026-10-01` → `10/1 〜 10/31`、戻ると `9/1 〜 9/30`。移動中は LoadingOverlay が出てナビが disabled |
| 4 周期 | 1週間 `9/13〜9/19`（7 列）/ 2週間 `9/13〜9/26`（14 列）/ 半月 `9/16〜9/30`（15 列）/ 1か月。半月の前後は `9/1〜9/15` ↔ `9/16〜9/30` |
| 開始日の指定 | ドロップダウン → カレンダーで 20 日 → `更新` → `?start=2026-09-20`、`9/20 〜 10/19` |
| 不正な `?start=` | `2026-02-30` / `zzz` のどちらも当月（`9/1 〜 9/30`）にフォールバック |
| セルのアサイン | 早番（下書き）→ 確定に切替（`data-fixed=true`、塗り + 白文字 + 太字）→ リロード後も保持 |
| ペア 1（セット） | 夜勤 → 翌日に自動で「明け」 |
| ペア 2（翌日が別パターン） | 翌日を手で早番に → 夜勤を外す → **早番が残る**（v1 は消えていた。001 §4.4 の改善） |
| ペア 3（翌日がペア） | 夜勤 + 明け → 夜勤を外す → 両方消える |
| ポップオーバー | 同じセルを 2 回押すと閉じる / Esc / 外クリック / × で閉じる。候補はそのスタッフの選択可能パターン + 「空」 |
| 人数行 | アサインすると即 ✓ → !（v1 と同じく過剰でも `!`）。休みパターンのアサインは判定に影響しない |
| 日別モーダル | 出勤日 4 件だけが並ぶ（休み 2 件は出ない）。早番を 2 にして保存 → ✓ が ! に |
| デフォルト人数をセット | 確認 → 「デフォルト人数を設定しました」。火曜が 1、祝日は 0（10.2） |
| 日付メモ | 保存すると表に出る。空にして保存すると消える（ペンのアイコンに戻る） |
| 0 件の案内（新規店舗） | 「初期設定を完了してください。」+ STEP1 / STEP2。表は空のまま描かれる |
| 404 | `/tenants/not-a-uuid/shifts`、他店舗の uuid、`%2e%2e%2f%2e%2e` の 3 経路すべて 404。dev のログに 22P02 は 0 件 |
| anon から RPC | `42501 permission denied for function assign_shift` |
| 認証済みトークンで越境 RPC | 存在しない / 他店舗の `p_staff_id` → `P0001 assign_shift: staff not found`、`p_pattern_id` → `pattern not found`、他店舗の `p_tenant_id` → `staff not found`（存在を漏らさない）。Action の `RPC_MESSAGES` がこの文言を「スタッフが見つかりません」「勤務パターンが見つかりません」に写す |
| 390px | ページ全体の横スクロールなし（表のコンテナだけがスクロール）。ポップオーバーも開く |

### 10.4 セルフレビューとブラウザ検証での修正

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **`dayjs` は存在しない日付を黙って繰り上げる。** `dayjs('2026-02-30').isValid()` は true で 3/2 になり、`2026-13-01` は 2027/1/1 になる。`?start=` の検証を `isValid()` で書くと、不正な日付が別の月の表として開く | `isDateString()` を「整形し直して元の文字列に戻るか」で判定する（`customParseFormat` プラグインを足さずに済む）。AGENTS.md にも注意を追記 | `node -e` で挙動を実測 → Vitest 5 件（`2026-02-30` / `2026-13-01` / `2026-00-10` / `2026-09-31` / 平年の `2025-02-29`）。ブラウザで `?start=2026-02-30` が当月に落ちることも確認 |
| 2 | **pgTAP の fixture が既存テストを壊した。** B 側のシフトを `2026-09-17` に置いたら、既存の「他テナントの staff を混ぜると複合 FK 違反（23503）」が `unique (staff_id, date)` の 23505 を先に出して落ちた | B の fixture を `2026-10-01` にずらし、理由をコメントに書いた | `npx supabase test db`（58 件 PASS） |
| 3 | **pgTAP の「失敗しても B の shifts は増えていない」が無意味だった。** A の文脈では RLS で B の行が常に 0 件に見えるので、ロールバックの有無を区別できない | 「not found で失敗した呼び出しは 1 行も作らない」（A 自身の行を見る）に変更 | 同上 |
| 4 | **nuqs に `startTransition` を渡していなかった。** 自前で `startTransition(() => { void setQuery(...) })` と書くと、`setQuery` の Promise を捨てているので transition が即終わり、LoadingOverlay が一瞬で消える | `useQueryStates(parsers, { shallow: false, startTransition })` に渡す（nuqs の d.ts の記述どおり） | ブラウザで移動中にオーバーレイが出て、移動後に消えることを確認 |
| 5 | **`DatesProvider` の `firstDayOfWeek` を 0 で固定していた。** 店舗設定が月曜始まりでも、開始日のカレンダーは日曜始まりで出る | `startOfWeek` を渡す | typecheck（`DayOfWeek` 型）とブラウザ |
| 6 | **Escape でポップオーバーが閉じなかった。** Mantine の Escape 処理はドロップダウンの keydown なので、フォーカスがセルに残っていると働かない（v1 の tippy は Escape で閉じていた） | `trapFocus` + `returnFocus` を付ける。キーボードでパターンボタンを操作できるようにもなる | ブラウザで Esc → 閉じる（修正前は閉じなかった） |
| 7 | **白い勤務パターンのボタンが枠線ごと見えなかった。** 枠線にパターン色を当てるので、`#FFFFFF` の「休み」はボタンの形が消える（v1 も同じだったが、ポップオーバーでは枠線が唯一の手がかり） | 白のときだけ既定の枠線色に落とす。セルの描画は v1 のまま（白いパターンは白いセル） | スクリーンショットで「休み」「明け」の枠線を確認 |
| 8 | 開いているセルをもう一度押しても閉じなかった（v1 の tippy は click でトグル） | `openCell` で同じセルなら閉じる | ブラウザ |
| 9 | `ShiftCell` に使っていない `disabled` prop、「人数」の見出しがスタッフ名用のクラスを使い回していた | prop を削除、クラス名を `.menuButton` / `.menuIcon` に変えて両方で共有 | lint / typecheck |
| 10 | **`required_nums` / `date_notes` は pgTAP で SELECT の境界しか固定していなかった。** 003 から在るテーブルだが書き込むのは 007 が最初で、AGENTS.md の「テーブルを足したらここにも足す」が実質守られていなかった | 「別テナントの行は追加できない（42501）」2 件と「自テナント + 他テナントの pattern は複合 FK 違反（23503）」1 件を追加（58 → 61 件） | `npx supabase test db` |
| 11 | 10 の追加時、`required_nums` の複合 FK テストが 23503 ではなく **23505**（`unique (pattern_id, date)`）で落ちた。B の fixture と同じ日付を使っていたため、一意制約が FK より先に出る | テストの日付を fixture と別の日にした。どちらのエラーでも INSERT は拒否されるのでアプリの安全性は変わらないが、テストが意図した経路を見るようにした | 同上 |

### 10.5 008 以降への申し送り

- **ツールバーの右側は空の `Group`** にしてある（008 の集計・ツール、009 の共有、010 の PDF / CSV をここに足す）。スタッフ名のメニューも「スタッフ情報を編集」だけなので、一括操作 3 件は `StaffNameCell` に足す
- **`applyAssign()` は `assign_shift`（SQL）と同じ規則を TS で書いたもの。** どちらかを変えるときは両方を変え、Vitest（`applyAssign.test.ts`）と pgTAP（`rls_tenant_isolation.sql` の assign_shift 節）のケースを突き合わせる。テストは同じ並び（1〜5）にしてある
- **008 の「デフォルト勤務パターンをセット」** は `dayKeyFor()` + `isHolidayDate()`（Server）を使う。006 §10.6 の申し送りどおり、スタッフが選択できないパターンを指すデフォルトに出会いうるので、スキップするか選択肢を絞るかを決める
- **`setDefaultRequiredNums` は表示期間を Zod で 31 日以内に制限**している。`dateRange()` が返す期間は最長 31 日（month 周期）なので正しいが、008 のコピー（≤31 日）も同じ上限を共有できる
- **`shifts` の読み取りは `tenant_id` + `date` の範囲だけ**で、退職者の除外は page.tsx の TS で行う（§5.8）。010 の PDF / CSV も同じ形にする

### 10.6 コードレビューでの修正（2026-09-18）

実装を別の目で読み直してもらった。**correctness とテナント境界の欠陥は無し**（4 周期の期間計算、`applyAssign` と `assign_shift` の意味の一致、TZ、hooks の使い方、Map のキー、5 本のクエリと 4 本の Action の境界、複合 FK、migration と anon の revoke を確認済み）。指摘は低優先度の 7 件で、うち 5 件を直した。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **「空」ボタンが真っ白で、ボタンだと分からない。** v1 は Bulma の `is-light`（薄いグレー）だったので、白いパターンボタンと区別が付いていた | `.emptyButton` を追加。最初 `--mantine-color-default` を当てたが**ライトテーマでは白**だったので、セルの「担当可」と同じ `--mantine-color-default-hover` に直した | v1 の `_pattern_popover.html.slim` で `is-light` を確認。ブラウザで `getComputedStyle` が `rgb(248, 249, 250)` になることを確認 |
| 2 | **ポップオーバーの `disabled={isPending}` は到達しない。** `assign()` が transition を始める前に `setActiveCell(null)` するので、`isAssigning` が true になる描画でポップオーバーは unmount されている。§5.6 の「連打防止」は実在しなかった | 死んでいた prop と CSS（`:disabled`）を削除し、`isAssigning` も使わないので捨てた。ポップオーバーを開いたままにする選択肢もあるが、v1 も `tippy.hideAllPoppers()` で閉じていたので閉じる側に寄せる | lint / typecheck |
| 3 | **`ShiftCell` が `Popover.Target` の注入する props を捨てていた**（`aria-haspopup` / `aria-expanded` / `aria-controls` / `id` / マージ済み `className`）。スクリーンリーダーに「ダイアログが開く」ことが伝わらない。**v1 のセルには `aria-haspopup` / `aria-expanded` があった** | `ElementProps<'button', 'onClick'>` を継承して `...rest` を素通しし、`className` は自分のものと連結する。さらに**閉じているセルにも `aria-haspopup="dialog"` を静的に置いた**（v1 は全セルに付けていた。開いている間は注入値が上書きする） | ブラウザで閉じたセル → `dialog`、開いたセル → `dialog` / `aria-expanded=true` / `aria-controls` あり |
| 4 | **他店舗の `tenantId` を非 RPC の 3 Action に渡すと「処理に失敗しました」になる。** RLS 違反は 0 行ではなく 42501 の例外なので、`assign_shift` 側（not found）と粒度が合わず §1 の完了条件から外れていた | `failIfForbidden()`（42501 → 「店舗が見つかりません」）を足し、`required_nums` / `date_notes` の書き込みに通した。`setDefaultRequiredNums` は 0 行になる経路なので、`tenants` を 1 件読んで「出勤日の勤務パターンがありません」と「店舗が見つかりません」を切り分ける | 認証済み JWT で REST を直接叩き、42501 が返ることを確認（レビュー側で実測） |
| 5 | **「ペアを持つパターンを別の非 null パターンで置き換える」経路が Vitest と pgTAP のどちらにも無かった。** 実際の編集でいちばん多く、SQL / TS の重複がいちばん危ない分岐 | 両方に 2 ケース追加（置き換えで翌日のペアが消える / 翌日がペア以外なら残る）。pgTAP は 61 → 68 件。Vitest の `4b` / `4c` と対応させた | `npm test` / `npx supabase test db`、ブラウザでも 夜勤+明け → 早番で置き換え → 翌日が空になることを確認 |
| 6 | `.sunday` が使われていない（`DateHeaderCell` は日曜にも `.holiday` を当てている） | クラスを削除し、`.holiday` が日曜も兼ねることをコメントに書いた | lint / ブラウザ（色は変わらず） |
| 7 | プランの記述と実装の齟齬 4 件（§6 の pgTAP 件数、§5.5 の `< 31`（コードは `<= 31` が正しい。month 周期はちょうど 31 日になりうる）、§1 の `_lib/`、§4 のアサイン失敗時の文言） | プラン側を実装に合わせて修正（コードは変えていない） | — |

対応しなかった指摘: なし（7 件のうち 7 番はプラン修正、他 6 件はコード修正）。

修正後の再検証:

```
npm run format:check / lint / typecheck / build → OK
npm test        → 28 files / 212 tests passed
npx supabase test db → 68 tests PASS
```

ブラウザでもセルの aria、ペアの置き換え、「空」ボタンの背景、Esc / 外クリック / トグルを再確認した（console エラー 0 件）。

### 10.7 2 回目のレビューでの修正（2026-09-18）

10.6 で入れた修正を含めて、実装をもう一度読み直し、疑わしい経路を実機で再現した。
**correctness とテナント境界の欠陥は無し。**ユーザーに見える不具合 3 件を直した。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | **期間ドロップダウンの「更新」ボタンがカレンダーに覆われ、押せなかった。** 開始日の入力欄に触れるとカレンダーが開き、その真下にある「更新」を覆う。手入力の導線が実質死んでいた（Enter は確定も閉じるもせず、Escape はドロップダウンごと閉じて入力を捨てる。唯一通るのはドロップダウン内の余白を押してカレンダーを閉じてから押す、という発見しにくい道）。§5.7 で `withinPortal: false` にしたことの副作用 | **入力欄と「更新」を同じ行に並べた**（`Group align="flex-end"`）。カレンダーは入力欄の下に開くので、横に置けば重ならない。Modal に替える案（§5.7 の代替）も試算したが、カレンダーは Portal でも浮いて下の要素を覆うので解決しない | 1280px と 390px で「ボタン中央の座標にある要素」を hit-test。カレンダー未展開 / 展開後 / 手入力後のすべてで「押せる」。手入力（`2026/11/05`）→ 更新 とカレンダー選択 → 更新 の両方で遷移することを確認 |
| 2 | **日別必要人数モーダルが古い勤務パターンから復帰しなかった。** 別タブでパターンを削除してから保存すると複合 FK 違反が汎用の「処理に失敗しました」になり、モーダルは消えたパターンの行を表示したまま、読み直しもしない。手でリロードするまで何度でも失敗する（同じ状況をアサインは「勤務パターンが見つかりません」+ `router.refresh()` で正しく扱っていた） | Action に `failFromRequiredNumsError()`（23503 → 「勤務パターンが見つかりません」）を足し、モーダルは失敗時に `router.refresh()` する。あわせて**送る値を `rows`（Server の props）から組む**ようにした（`nums` state は入力値だけを持つ）。読み直すと消えたパターンの行が落ち、他の入力値は保ったまま再保存すれば通る | 別タブ相当で SQL 削除 → 1 回目は「勤務パターンが見つかりません」+ 行数 5 → 4、早番に入れた 2 は保持、2 回目で「更新しました」、DB に 2 が入ることを確認 |
| 3 | **`<th>` に `scope` が無かった。** 930 セルのグリッドで、支援技術がセルと日付・スタッフ名を結び付けられない（v1 にも無かったので退行ではないが、グリッドを作るのはこのマイルストーン） | 日付の 3 行に `scope="col"`、スタッフ名に `scope="row"` | ブラウザで 4 か所の属性を確認 |

測って問題なしと判断したもの（変更しなかった）:

| 確認 | 結果 |
| --- | --- |
| セルごとの `wday()` | 30 人 × 31 日 = 930 セルで 1 描画あたり 0.44ms。日付ごとに 1 回へ減らしても 0.06ms で、React の再描画に埋もれる |
| ポップオーバー開閉時の 930 セル再描画 | ページ内計測で 11〜16ms（初回だけ 241ms。floating-ui の遅延読み込み分） |
| 違うセルへの 5 連続アサイン | 5 件すべて保存された（Server Action の逐次ディスパッチ） |
| 祝日データの範囲外 | 2051 年（データは 2050 年まで）と 1969 年のどちらも描画され、エラーなし |
| 開始日への不正な手入力 | `2026/02/30` は Mantine が `2026/03/02` に正規化して遷移、`あああ` は元の値に戻る。`isDateString` と Zod があるのでサーバーに不正な日付は届かない |
| メモの文字数 | JS の `length` は Postgres の `char_length` 以上なので、Zod を通って DB の CHECK に落ちる値は存在しない（絵文字だけ早めに弾かれるが、005 / 006 の他の項目と同じ扱い） |

修正後の再検証:

```
npm run format:check / lint / typecheck / build → OK
npm test        → 28 files / 212 tests passed
npx supabase db reset && npx supabase test db → 68 tests PASS
```

ブラウザでペアの 4 ケースを含む主要導線を再確認した（console エラー 0 件）。

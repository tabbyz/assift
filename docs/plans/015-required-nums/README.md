# 015: 必要人数の作り直し

- 前提: 006（勤務パターン設定）/ 007（必要人数の行と日別モーダル）/ 011（充足はフッター）/ 012（自動アサイン）/ 014（初期設定）
- デザイン案（画面イメージ）: `https://claude.ai/artifact/TJCo69jgJgDLBMmRhY1R8S`

## 1. 目的と完了条件

### 目的

必要人数の「デフォルト」を、**ユーザーが手で焼き付けるテンプレート**から、**読むときに解決される既定値**に変える。
あわせて入力欄を勤務パターンのフォームから出し、勤務 × 曜日の行列 1 枚に集める。

いまの作りは `patterns.default_required_nums`（勤務 × 曜日）と `required_nums`（勤務 × 日付）の二重持ちで、
両者をつなぐのは操作メニューの「デフォルト人数をセット」だけ。そのため「翌月は必要人数が全部 0」「既定を直しても既存の期間に届かない」
「再セットすると日別の手直しが全部消える」「未設定と 0 人を区別できない」が同時に起きている（§2）。

### 完了条件

- [ ] 表示期間を翌月に動かすだけで必要人数が入っている（セット操作が要らない）
- [ ] 設定の既定値を変えると、**手で触っていない日**に伝わる。**触った日は残る**
- [ ] 「未設定」と「0 人」が区別できる。フッターは未設定を `—` で出し、自動アサインは未設定を枠にしない
- [ ] `設定 > 必要人数` の 1 画面で、全勤務 × 全曜日を見渡して編集できる
- [ ] 「どの曜日も同じ人数にする」で、初回の店舗が勤務ごとに 1 つ入れるだけで済む（`QuickRequiredNums` の置き換え）
- [ ] 操作メニューの「デフォルト人数をセット」が無くなり、「この期間の個別の変更を元に戻す」になる
- [ ] フッターで不足・過剰・未設定が見分けられる（案 C。赤 / 青 + `+1` / 灰の `—`）
- [ ] 既存店舗は移行後も表の見た目が変わらない（`npx supabase db reset` + 移行の pgTAP で確認）
- [ ] `lint` / `typecheck` / `test` / `supabase test db` が通る

## 2. 確認済みの前提（いまの仕組み）

### 2.1 二重持ちと手動の焼き付け

| 層 | 実体 |
| --- | --- |
| 既定値 | `patterns.default_required_nums` jsonb（`{"0".."6","holiday": number}`。`supabase/schemas/public/tables/patterns.sql:11`） |
| 実値 | `required_nums (tenant_id, pattern_id, date, num)`。行が無い組は 0（`lib/shifts/satisfaction.ts` の `countAt`） |
| つなぎ | `setDefaultRequiredNums()`（`shifts/actions.ts:186`）が期間 × 出勤日パターンを **upsert で全上書き** |

`required_nums.sql:1` のコメントは「既定値は patterns.default_required_nums、上書き分をここに持つ」と書いているが、
**実装はフォールバックしていない**。読み取り（`lib/queries/requiredNums.ts`）は行のあるものだけを返す。

この結果として:

1. 翌月を開くと必要人数が 0。フッターは 011 の規則で 0/0 を出さないため何も表示されず、`isSatisfied` は等号なので全日「充足」になり、
   気付けるのは自動アサインを開いて「必要人数が設定されていません」と言われたときだけ
2. 既定値を後から直しても焼き付け済みの期間には届かない。届かせる操作（再セット）は期間全日の upsert なので、**日別の手直しを全部消す**。
   確認は「現在の期間に一括でデフォルトの必要人数をセットします。よろしいですか？」だけで、取り消しが無い（自動アサインには `rollback_assist_run` がある）
3. `setDefaultRequiredNums` は 出勤日パターン数 × 日数 行を書く。読み取りの `listRequiredNums` は `pageAll()` を通していないので、
   出勤日パターンが 32 件を超えると `max_rows`（1000）で**黙って歯抜けになる**

### 2.2 「未設定」を表現できない

`defaultRequiredNum()` は `value[key] ?? 0`、`hasRequiredNums()` は `num > 0` の行があるかで判定する。
そのため「0 人でよい」と「まだ決めていない」が同じ値になり、014 §2.4 でも「空欄のままセットしても『必要人数なし』のまま変わらない」と踏んでいる。
`ShiftsClient.tsx:272` が `defaultRequiredNums` のキー数まで覗いて初回判定しているのは、モデルが表現できていないことの裏返し。

### 2.3 入力欄の置き場

既定値の入力は勤務パターンの編集フォームの中（`settings/patterns/_components/RequiredNumsInput.tsx`。曜日 + 祝の 8 列）。
「土曜は全部で何人？」に答えるには勤務を 1 件ずつ開いて頭の中で転置する必要がある。日別モーダルは勤務 × 1 日の表で見せているのに、設定側だけ縦割り。
014 で `QuickRequiredNums`（「1日に何人ずつ必要ですか？」）を別経路・別 Action・別スキーマで足したのは、この 8 列グリッドが初回に重すぎたため。

### 2.4 文言

「必要スタッフ人数のデフォルト値」/「必要人数は『自動アサイン機能』を使用する場合に設定が必要です（デフォルト値を設定しておくとシフト表画面にて一括でセットできるため便利です）」
は v1 の文言のままで、**まだ見ていない一括操作の都合**を先に説明している。「デフォルト」も作る側の語彙。

### 2.5 数の意味が 3 つある

| 見る側 | 扱い |
| --- | --- |
| 人間（表） | 目標。`isSatisfied` は等号なので**過剰も `!`**。011 で「2/0 が読めない」と指摘され、0/0 の非表示だけで凌いでいる |
| 自動アサイン | ハード上限（012 H10 `≤ max(0, required − assigned)`）かつ最優先のソフト目標 |
| 未設定 | 0 人と同じ = 枠なし |

## 3. 決定事項

### 3.1 既定値は読むときに解決する — **決定（2026-10-05）**

```
必要人数(date, pattern) = 上書き行(date, pattern) ?? 既定[曜日キー(date)] ?? 未設定
```

保存するのは**上書きだけ**。`required_nums` の行は「この日だけ変えた」の記録になる。これで §2.1 の 1〜3 が同時に消える。

- 翌月は最初から正しい人数（セット操作が不要）
- 既定を直すと上書きの無い日に全部伝わり、上書きした日は残る
- 行数は「手で変えた日」の数で止まるので `max_rows` の心配がほぼ無くなる（`pageAll()` は保険として通す。§5.2）

**却下した案**: 既定値を日付行に展開し続ける（= いまの形の自動化。シフト表を開いた副作用で書き込みが走り、`refresh()` の意味が壊れる）。
`required_nums` を捨てて既定値だけにする（日別の上書きが v1 から使われている中心機能なので不可）。

### 3.2 未設定は `null`。0 人は `0` — **決定（2026-10-05）**

v1 の `nums[key] || 0` を切る。解決後の型は `number | null` にし、`null` は:

- フッター: `3/—`（配置はあるが必要人数は決めていない）。配置も 0 なら 011 のとおり何も出さない
- 充足判定: 対象外（`!` を出さない）
- 自動アサイン: 枠にしない。ただし期間の出勤日パターンが**すべて未設定**なら「必要人数が決まっていません」+ 設定への導線（いまの「デフォルト人数をセット」の位置）

### 3.3 スキーマは変えない — **決定（2026-10-05）**

`patterns.default_required_nums`（jsonb）と `required_nums`（行）はそのまま使う。変わるのは**意味と読み方**だけなので、
テーブル・RPC の差分 migration は不要（§5.6 のデータ移行だけ 1 本積む）。

### 3.4 編集画面は `設定 > 必要人数` の 1 枚（勤務 × 曜日の行列） — **決定（2026-10-05）**

設定のナビに項目を足し、行 = 勤務（色 + 名前）、列 = 日〜土 + 祝 + 合計の行列にする。
ナビは既存の並び（`lib/tenants/navigation.ts` の `settingsLinks()`）を変えず、**「勤務パターン」の直後に 1 項目足すだけ**にする:
`スタッフ / 勤務パターン / 必要人数 / 自動アサイン制約 / 店舗情報`。勤務パターンのすぐ下に置くのは、必要人数が勤務ごとの数だから。勤務パターンのフォームからは入力欄を外し、
読み取り専用の 1 行サマリ（`ランチ 2/1/1/1/1/2/3（祝 3）`）とリンクだけ残す。

### 3.5 「どの曜日も同じ人数にする」トグルで `QuickRequiredNums` を畳む — **決定（2026-10-05）**

行列の上にスイッチを置き、ON のあいだは列が 1 本（勤務ごとに 1 つの数）になる。保存時は全曜日 + 祝に同じ値を書く（`uniformRequiredNums`）。
これは `QuickRequiredNums` の中身そのものなので、**`src/components/requiredNums/` の共有部品 1 つ・入口 2 つ**に畳む
（`components/restrictions/` と `components/setup/` と同じ形）。自動アサインのモーダルからはこの部品を開くだけにする。

スイッチの初期値は「既定値がすべて同じ、または全部未設定」なら ON。1 つでも曜日差があれば OFF（勝手に平らにしない）。

### 3.6 操作メニューは「元に戻す」に置き換える — **決定（2026-10-05）**

「デフォルト人数をセット」を消し、「この期間の個別の変更を元に戻す」（= 期間の上書き行を delete）にする。
確認の文言は**日付を並べる**: 「10/10・10/12 の 2 日分を、基本の人数に戻します。」（§3.7。多いときは先頭いくつか + 「ほか N 日」）。
上書きが 0 件なら項目を無効にして理由を出す。

### 3.7 不足と過剰を分ける — **決定（2026-10-05）**

| 状態 | フッター |
| --- | --- |
| 充足 | `3/3`（既定の文字色） |
| 不足 | `2/3` 赤 |
| 過剰 | `4/3` 青 + `+1` |
| 未設定 | `3/—` 灰 |
| どちらも 0 | 出さない（011 のまま） |

`isSatisfied` の等号判定は内部では残すが、**表示は不足・過剰・未設定の 3 値**にする（`satisfaction.ts` に `coverageState()` を足す）。
色だけで区別せず、過剰には符号を付ける（AGENTS.md のアクセシビリティ方針）。

**追記（2026-10-05）— 見せ方は案 C（いまの `2/3`）で確定。** `2/3` が「引き算をさせる表示」である点は認識したうえで、
幅が最小で済むこと（31 列 × 390px）と、011 で決めた「数字だけ」の方針を変えないことを優先した。
比較に使った 4 案はデザイン案の「フッターの見せ方 — 4 案」に残す（将来の再検討用）。

| 案 | 中身 | 長所 / 短所 |
| --- | --- | --- |
| A あと何人 | 不足だけ `あと1`（赤）、過剰 `+1`（青）、充足は薄い `✓`、未設定 `—` | 問題のある日にだけ ink が乗り、スキャンが速い / 「3/3」で確かめたい人は日別モーダルを開く |
| B 2 段 | 上に配置（15px）、下に `／ 必要`（11px 灰） | 位置で読める。31 列でも縦に揃う / 行が 1 段ぶん高くなる |
| **C いまの案（採用）** | `2/3` を 1 行 | 幅は最小 / 読み分けが要る |
| D 色面 + 2 段 | B に加えて、不足・過剰のマスを淡い色面で塗る | 数字を読まずに一覧できる / 表の色（勤務パターン）と競合しうる |

**上書きの点（`3/3·`）は却下（2026-10-05）。** 点の意味を教える場所が画面に無く、ユーザーには伝わらない。
不足の赤とも視覚的に競合する。「どの日を個別に変えたか」は、

- 日別モーダルの札（その日を開けば分かる。§4.3）
- 操作メニューの「この期間の個別の変更を元に戻す」の**確認モーダルに日付を並べる**（「10/10・10/12 の 2 日分を基本に戻します」）。
  戻す直前なので説明が要らず、期間も確定している

の 2 つで足りる。フッターには状態（4 つ）だけを置く。

### 3.8 数の意味は「目標」のまま。min–max は入れない — **決定（2026-10-05。申し送り）**

本当の解は下限・上限の 2 値（「2 人は要る、4 人までなら入れていい」）だが、012 のモデル（H10）と表の見せ方の両方に波及するので今回は入れない。
今回やるのは「過剰が読めるようにする」ところまで。自動アサインの上限は必要人数のまま変えない。

### 3.9 文言から「デフォルト」を外す — **決定（2026-10-05）**

| いま | これから |
| --- | --- |
| 必要スタッフ人数のデフォルト値 | 基本の人数 |
| デフォルト人数をセット | （消す。代わりに「この期間の個別の変更を元に戻す」） |
| デフォルト人数は勤務パターン設定画面で設定できます | 基本の人数は「必要人数」の設定で変えられます |
| 必要人数は「自動アサイン機能」を使用する場合に設定が必要です（…） | 曜日ごとに、1 日に何人入ってほしいかを決めます。シフト表の下の「配置 / 必要」と AI シフト作成がこの人数を見ます。 |

既定値の画面での呼び名は **「基本」**（基本の人数 / 基本 3 人 / 基本に戻す）に決めた（2026-10-05）。
「既定」「デフォルト」は内部の語として設計・コードにだけ残す。「default」の意味の漢字は「規定」ではなく「既定」だが、
画面では硬いので使わない。

機能の呼び名は、**この表で新しく書く文言の中だけ**「AI シフト作成」にする（コードの `assist` / プランの「自動アサイン」は内部の名前）。
既にある画面の「自動作成」（014 の `EmptyNotice` / 初回の案内 / `AssistModal` など）は今回触らない。呼び名の統一は §7 の申し送り。

日別モーダルで既定と違う値が入っている行には「この日だけ変更」の札と「基本の人数に戻す」を出す。

### 3.10 設定画面は規則だけを持つ。日別の情報はシフト表に置く — **決定（2026-10-05）**

`設定 > 必要人数` に「個別に変えている日」の一覧を置く案を**却下した**。設定は店舗の規則の画面で、時間の文脈を持たないため。

- `/settings/*` はどの画面も「いつの話か」を聞かない。ここに日付の一覧が入ると「この画面はいつの状態を見ているのか」が生まれる。
  期間を持つのはシフト表（`?start=` と作成周期）だけ
- 期間が無いので一覧の範囲が決まらない（過去の日も含めて無限に伸びる）。「直近 N 件」で切ると、切った根拠と残りの行き先が無くなる。
  期間指定なしで `required_nums` を読むのは `max_rows` の対象でもある
- **一覧に置く「戻す」が一番危うい。** どの月のシフト表がどう変わるかを見ないまま書き込みが起きる。
  これは 015 で消そうとしている「デフォルト人数をセット」の問題（表を見ずに表を書き換える）を、場所を変えて再発させる
- 設定の Action は `revalidatePath('/tenants/<id>', 'layout')` なので、設定画面が日別データを読むと、既定値の保存ごとに一覧も読み直すことになる

「上書きが見えない」への答えは、**日付のある画面**に 3 つ置く。

| 問い | 置き場所 |
| --- | --- |
| 基本の人数を変えたのに、なぜこの日は変わらない？ | 日別モーダルを開けば札で分かる。まとめては「元に戻す」の確認モーダルの日付一覧（§3.7） |
| この日は何人にしたんだっけ | 日別モーダルの「この日だけ変更（基本 3 人）」の札と「基本に戻す」（§4.3） |
| まとめて戻したい | 操作メニュー「この期間の個別の変更を元に戻す」（§3.6。期間が画面に出ていて、結果がその場で見える） |

設定画面に残すのは**データではなく規則の説明 1 行**だけ: 「特定の日だけ変えた分は、ここを変えてもそのまま残ります。」（日付を 1 つも含まない）

## 4. 画面

デザイン案（アートボード 5 枚）: `https://claude.ai/artifact/TJCo69jgJgDLBMmRhY1R8S`

### 4.1 `設定 > 必要人数`（PC）

- 見出し「必要人数」/ 説明「曜日ごとに、1 日に何人入ってほしいかを決めます。シフト表の下の『配置 / 必要』と AI シフト作成がこの人数を見ます。」
- **セクションの見出しと説明は置かない**（`SettingsSection` の `title` 省略 = 枠だけ）。
  このページはフォーム 1 枚なので、ページの見出しと説明がそのままセクションの見出しになる。
  「必要人数」→「基本の人数」のように見出しと説明が 2 段重なると、同じことを 2 回言うことになる
- 枠の中: スイッチ「どの曜日も同じ人数にする」+ 行列（行 = 勤務、列 = 日〜土・祝・合計）。
  未設定のマスは `—` のプレースホルダ。曜日見出しの横に「以降の曜日にコピー」（いまの `RequiredNumsInput` から持ち込む）
- 行列の下に注意 2 行: 「人が要らない曜日は『0』を入力します。人数が未定の場合は空欄にしてください。」/
  「ここで設定した内容は、シフト表画面で日毎に上書きできます。」（§3.10。**日別の一覧は置かない**）
- 保存・キャンセルは `SettingsSection` の footer

### 4.2 390px

行列は横に伸ばさず、**勤務ごとのカード**にして曜日を縦に並べる（8 行）。スイッチ ON のときはカードが 1 行になる。

### 4.3 日別モーダル

列は「必要人数 / アサイン済」のまま。既定と違う行に「この日だけ変更」の札、その行に「戻す」。
下部の案内を §3.9 の文言に。「デフォルト人数をセット」ボタンは消す（既定に戻すのが各行の「戻す」になる）。

### 4.4 シフト表のフッター

§3.7 の 4 状態（案 C。`3/3` `2/3` 赤 `4/3 +1` 青 `3/—` 灰）。上書きの点は置かない。未設定の `—` が出るのは「設定したことがない店」だけなので、
そのときはフッターの左端のラベルに設定へのリンクを出す。どの日もタップで日別モーダルが開き、そこで人数を変えたり「基本に戻す」まで行ける。

### 4.5 自動アサインのモーダル

「必要人数が設定されていません」の代わりに、§3.5 の共有部品（勤務ごとに 1 つ入れる形）をその場に出す。入れると**保存されるのは既定値だけ**で、
期間への焼き付けは起きない（解決で入る）。

### 4.6 アクセシビリティ

- 行列のマスは `aria-label` に「ランチ・土曜の必要人数」を入れる（曜日だけだと勤務が分からない）
- フッターの状態は色だけで出さない（不足は「あと 1」や数字の色 + `aria-label` の「未充足」、過剰は `+1`）
- 数値入力は `NumberInput` のまま（`clampBehavior="strict"` / `allowDecimal={false}`）

## 5. 設計の要点

### 5.1 解決は純関数（`src/lib/shifts/requiredNums.ts`）

```ts
export type RequiredNum = number | null
export type RequiredOverride = { patternId: string; date: string; num: number }

/** 上書き ?? 既定[曜日キー] ?? null。出所も返す（日別モーダルの札と「元に戻す」の確認が使う。§3.7） */
export type ResolvedRequiredNum = { num: RequiredNum; source: 'override' | 'default' | 'unset' }

export function resolveRequiredNum(
  overrides: Map<string, number>,   // cellKey(patternId, date)
  defaults: RequiredNumsByDay,
  date: string,
  dayKey: DayKey
): ResolvedRequiredNum
```

- `lib/patterns/requiredNums.ts` の `parseRequiredNums` / `RequiredNumsByDay` はそのまま使う（既定値の読み方は変えない）
- `defaultRequiredNum()`（`?? 0`）は**削除**。呼び出し側は `null` を扱う
- 曜日キーは `dayKeyFor(date, isHoliday)` のまま（祝日は `holiday` 優先）。祝日は Server が期間分の配列にして渡す（`lib/calendar/holidays.ts` は `server-only`）

### 5.2 読み取り

- `lib/queries/requiredNums.ts` は**上書き行だけ**を返す（クエリは同じ。意味が変わる）。`.order('date')` + `pageAll()` を付ける（保険）
- `shifts/page.tsx` が `patterns`（既定値）・上書き行・祝日の 3 つから解決済みの `CountsByDate` を組んで Client に渡す。
  Client は解決を知らない（いまと同じ形のまま `number | null` になるだけ）
- `shifts/page.tsx` は同時に **期間内の上書き日の一覧**（`{ date, patternId }[]` か日付の `Set`）も渡す。
  日別モーダルの札（`source === 'override'`）と、「元に戻す」の確認に出す日付（§3.6）がこれを使う
- `lib/assist/load.ts` も同じ解決を通す（クライアントは引数で受ける規約のまま。`.eq('tenant_id', …)` を維持）
- 公開共有ページ（`/share/[code]`）は必要人数を出さない（009）ので変更なし。
  エクスポート（010。`lib/export/` / `lib/shifts/table.ts`）も必要人数を読んでいないので影響なし（確認済み）

### 5.3 `null` の持ち回り

| ファイル | 変更 |
| --- | --- |
| `lib/shifts/satisfaction.ts` | `CountsByDate` の値を `number \| null` に。`countAt` は `null` を返しうる。`isSatisfied` は `null` の組を飛ばす。`coverageAt` は `required` を `number \| null` に。`coverageState(coverage): 'ok' \| 'short' \| 'over' \| 'unset' \| 'none'` を追加 |
| `shifts/_lib/assist.ts` | `shortageByPattern` は `null` を 0 扱いで飛ばす。`hasRequiredNums(rows, ids)` は**解決後の値**に対する `hasAnyRequired`（1 件でも非 null があるか）に変える |
| `lib/assist/problem.ts` | 枠数は `max(0, required − assigned)`。`required === null` の組は枠にしない（ペアの着地日の制約も立てない） |
| `lib/assist/reasons.ts` / `levers.ts` | 文言に「必要人数が未設定」を足す |
| `shiftTable/` | フッターのセルが 4 状態を描く（案 C） |

出所（`source`）は数と別に持ち回る。`CountsByDate` は数だけのまま（集計に使う）。フッターは出所を見ないので、
上書きの有無が要るのは**日別モーダルの行**（`rows`）と、「元に戻す」の確認に出す**期間内の上書き日の一覧**だけ。

### 5.4 Action

| Action | 変更 |
| --- | --- |
| `shifts/actions.ts` `saveRequiredNums` | 数字が来た勤務は upsert（**0 も「0 人」として保存**）。**空欄（`''`）が来た勤務は行を delete**（= 基本に戻す）。再描画は `refresh()` のまま（007 §3.5） |
| `shifts/actions.ts` `resetRequiredNums`（新） | 期間 × 出勤日パターンの上書き行を delete。件数を返して通知に出す |
| `shifts/actions.ts` `setDefaultRequiredNums` / `setUniformDefaultRequiredNums` | **削除** |
| `settings/required-nums/actions.ts` `saveDefaultRequiredNums`（新） | 行列 1 枚分（勤務 id → 曜日 → 人数）を 1 回で保存。`uniform` のときは全曜日に同じ値。再描画は `revalidatePath('/tenants/<id>', 'layout')`（設定なので） |

- `saveDefaultRequiredNums` は勤務ごとの `update` を `Promise.all` で流す（いまの `setUniformDefaultRequiredNums` と同じ理由で RPC にしない。
  途中で止まっても入った勤務の既定が正しく残るだけ）。対象は `kind = 'workday'` のみ
- 検証は `lib/validation/requiredNums.ts` に集約。`saveDefaultRequiredNumsSchema`（`z.record(patternIdSchema, requiredNumsSchema)`）を追加し、
  `setDefaultRequiredNumsSchema` / `setUniformDefaultRequiredNumsSchema` を削除。leaf には `{ error }` を付ける（006 §3.12）
- `requireUser()` → `requireTenant(tenantId)` の順は変えない
- 日別モーダルの「基本に戻す」は**専用の Action を作らない**。入力欄を空欄にして保存すれば行が消える（上の規則）

### 5.5 移行（差分 migration 1 本）

既存の `required_nums` 行は全部「上書き」になるので、そのままだと**既定を直しても既存期間に届かない**状態が残る。
焼き付け済みの行のうち「その日の曜日キーの既定値と一致するもの」を削除する:

```sql
delete from public.required_nums rn
using public.patterns p
where rn.pattern_id = p.id
  and rn.num = coalesce(
    (p.default_required_nums ->> extract(dow from rn.date)::int::text)::int,
    0)
```

- 祝日の判定は DB に持っていない（`@holiday-jp/holiday_jp` はアプリ側）。**祝日の行は消さない**（`extract(dow …)` の一致だけで判定し、
  祝日に当たる日は上書きとして残す）。残っても「既定と同じ値の上書き」なので表示は変わらず、ユーザーが「戻す」で消せる
- `num = 0` かつ既定が未設定の行も消える（= 未設定に戻る）。これは意図した変化（§3.2）で、表では `0/0` が出なくなるだけ
- `extract(dow …)` は numeric を返すので **`::int::text`** にする（`::text` だけだと `0` 以外の表記になりうる）。キーは JS と同じ 0=日 … 6=土
- 生成 migration の末尾に `unmanaged/restrict_anon_grants.sql` を追記するのは**新しいテーブル・関数を足したときだけ**なので、今回は不要
- この migration は**宣言的スキーマの差分ではない**（データの移行）。`declarative sync` では出ないので、
  生成された差分 migration の末尾に手で足すか、データ移行だけの migration を 1 本足す（AGENTS.md の「適用済みは書き換えない」に従う）

### 5.6 消すもの

- `settings/patterns/_components/RequiredNumsInput.tsx` と `.module.css`（行列へ移る）
- `shifts/_components/QuickRequiredNums.tsx`（共有部品へ）
- `defaultRequiredNum()` / `setDefaultRequiredNums()` / `setUniformDefaultRequiredNums()` / `setDefaultRequiredNumsSchema` / `setUniformDefaultRequiredNumsSchema`
- `ToolsMenu` の「デフォルト人数をセット」、日別モーダルの「デフォルト人数をセット」ボタン
- `ShiftsClient.tsx` の `quickRequiredNumPatterns`（「必要人数もデフォルトも 1 件も無い」の判定。解決後は「全部 null」で一意に決まる）と
  `applyUniformRequiredNums`。`hasRequiredNums()` は `hasAnyRequired()` に置き換え、`_lib/assist.test.ts` も直す

### 5.7 部品の置き場

```
src/components/requiredNums/
  RequiredNumsMatrix.tsx        行列（PC）/ カード（390px）。uniform スイッチを含む
  RequiredNumsMatrix.module.css sticky な勤務名の列
  useRequiredNumsMatrix.ts      入力状態（勤務 id → 曜日 → number | '')
src/lib/shifts/requiredNums.ts  resolveRequiredNum / 行列の状態 → 保存の形（Vitest）
src/app/(protected)/tenants/[tenantId]/settings/required-nums/{page.tsx,actions.ts,_components/}
```

## 6. テスト

### 6.1 Vitest

- `resolveRequiredNum`: 上書きあり / 既定あり / どちらも無い（null）/ 祝日は `holiday` 優先 / 上書きの 0 は 0（既定に落ちない）/ `source` が 3 値で返る
- 期間内の上書き日の一覧: 既定と同じ値の上書きも「上書き」として数える（戻せることを示すため）
- `coverageState`: 充足・不足・過剰・未設定・どちらも 0
- `isSatisfied` / `coverageAt`: `null` の組を飛ばす
- `shortageByPattern` / `buildProblem`: `null` の組は枠にしない。ペアの着地日も立たない
- 行列の状態 → 保存の形: uniform ON で全曜日に同じ値 / 空欄が未設定（キーを持たない）になる
- `saveDefaultRequiredNumsSchema`: 空欄・範囲外・未知の勤務 id・勤務 0 件

### 6.2 pgTAP

- 移行 SQL は pgTAP で**そのままは検証できない**（`db reset` は migrations → seed の順で、seed は移行の後に入る）。
  代わりに、移行と同じ条件の SELECT を関数に切り出さず、**pgTAP の中でテスト用の行を入れてから同じ DELETE 文を流す**形で固定する
  （`supabase/tests/required_nums_migration.sql`。本番の migration と SQL が二重になるので、文面を migration からコピーした旨をコメントに書く）
- `required_nums` のテナント境界は `rls_tenant_isolation.sql` のまま（テーブルを足さないので追加なし）

### 6.3 手動（ローカル）

1. 既定だけ入れた店で**翌月・翌々月**を開く → セット操作なしで必要人数が出る
2. 日別で 1 日を直す → 設定で既定を変える → 直した日だけ残り、他は新しい既定になる。日別モーダルに「この日だけ変更」の札が出る
3. 「この期間の個別の変更を元に戻す」→ 件数の通知、表が既定に戻る
4. 未設定の店 → フッターは `—`、自動アサインは共有部品を出す。入れるとその場で必要人数が出る（期間への書き込みは起きない）
5. 不足・過剰・充足・未設定の 4 状態が 1 画面に並ぶ期間を作って読めるか
6. 390px で行列がカードになる / `supabase db reset` 後の seed で 1〜5 を通す

## 7. スコープ外（申し送り）

- 下限・上限の 2 値（§3.8）。時間帯別の必要人数
- 月・季節・イベント単位の既定（「12 月は 1 人増」）。いまは日別の上書きで表現する
- 必要人数のコピー（別店舗・別期間から）。014 §7 の「2 店舗目をコピーして作る」と一緒に考える
- フッターの `—` を出す店への常設の案内（初回だけで足りるかを見てから）
- 上書きの一覧（「個別に変えた日」を期間をまたいで見渡す画面）。設定には置かない（§3.10）ので、
  必要になったらシフト表側（期間を持つ画面）で考える
- 機能の呼び名の統一。015 では必要人数まわりの新しい文言だけ「AI シフト作成」にし、既にある「自動作成」は残す（§3.9）。
  画面全体を揃えるなら、012 / 014 の文言をまとめて直す別の作業にする
- 「デフォルト勤務パターンをセット」（008。スタッフの既定の勤務パターン）の呼び名。必要人数側を「基本」にすると
  同じ概念が 2 つの呼び名になるので、いずれそろえる（今回は触らない）

## 8. 実装の順序

1. `lib/shifts/requiredNums.ts`（解決の純関数）+ Vitest
2. `satisfaction.ts` を `number | null` に + `coverageState` + Vitest
3. 読み取り（`queries/requiredNums.ts` / `shifts/page.tsx` / `assist/load.ts`）を解決経由に
4. フッターの 4 状態（`shiftTable/`）と日別モーダルの「この日だけ変更 / 基本に戻す」
   — **2〜4 は型が変わるので一続きで進める**（途中では `typecheck` が通らない）
5. `components/requiredNums/` の行列 + `settings/required-nums/`（page / actions / ナビ）
6. 自動アサインのモーダルを共有部品に差し替え、`QuickRequiredNums` を削除
7. `ToolsMenu` を「元に戻す」に差し替え、古い Action とスキーマを削除
8. 移行 migration + pgTAP、`db reset` → `gen types` → 手動の通し

## 9. プランのレビュー（2026-10-05）

### 9.1 1 回目（通し読み）

| # | 指摘 | 直したこと |
| --- | --- | --- |
| 1 | 日別モーダルの保存で「既定と同じ値なら上書きを delete」にしていた。**ユーザーが明示的に 3 人と入れた意図**（基本が 3 人でも、この日は確かに 3 人と決めた）を勝手に捨てる。PostgREST では delete と upsert が別リクエストなので、途中で失敗すると一部だけ適用される | 保存は upsert だけにし、delete は明示の「基本に戻す」（`clearRequiredNums`）に分けた（§5.4） |
| 2 | 「元に戻す」の確認に日付を並べる（§3.6）と決めたのに、その一覧をどこから渡すかが §5.2 に無かった | `shifts/page.tsx` が期間内の上書き日も渡すことを明記（§5.2） |
| 3 | 移行 SQL の `extract(dow from rn.date)::text` は numeric の文字列化なので、jsonb のキー（`"0"`〜`"6"`）と一致しない可能性がある | `::int::text` にした（§5.5） |
| 4 | 移行 SQL を pgTAP で検証する、と書いていたが **`db reset` は migrations → seed の順**なので、seed の行は移行の後に入る。そのままでは何も検証できない | テスト内でデータを入れてから同じ DELETE を流す形に変更。SQL が二重になる点はコメントで明示（§6.2） |
| 5 | データ移行を「差分 migration 1 本」と書いていたが、`declarative sync` はデータ移行を生成しない | 生成 migration の末尾に足すか、データ移行だけの migration を 1 本足す、と明記（§5.5） |
| 6 | 消すものに `ShiftsClient` の `quickRequiredNumPatterns` / `applyUniformRequiredNums` と `hasRequiredNums` のテストが入っていなかった | §5.6 に追記 |
| 7 | 完了条件が「不足と過剰が別の**記号**として読める」だったが、採用した案 C は色と太字で分ける | 文言を直した（§1） |
| 8 | エクスポート（010）への影響が未確認だった | `lib/export/` / `lib/shifts/table.ts` は必要人数を読んでいないことを確認し、§5.2 に記録 |
| 9 | 実装順序 2〜4 は型が変わるので、途中では `typecheck` が通らない | §8 に「一続きで進める」と明記 |

### 9.2 残した論点

- **フッターは案 C（いまの `2/3`）のまま**。「引き算をさせる」課題は残っているので、使ってみて読めなければ案 A（あと何人）に替える。
  比較用のアートボードは残してある（§3.7）
- 移行で「`num = 0` かつ既定が未設定」の行を消す = その日が「0 人」から「未設定」に変わる。
  いまの意味では 0 と未設定は同じ（どちらも枠が無い）ので実害は無いが、**移行後にその日を 0 と決め直したい店は手で入れ直す**ことになる
- 390px の行列（勤務ごとのカード）は、勤務が 5 件を超えると縦に長い。実機で触ってから詰める
- `settings/required-nums` という URL でよいか（`settings/staffing` などの案もある）。ナビの位置は決めた（§3.4）

## 10. 実装ログ（2026-10-05）

### 10.1 ここまで（§8 の 1〜4）

| 段階 | 成果物 |
| --- | --- |
| 1 | `src/lib/shifts/requiredNums.ts`（`resolveRequiredNum` / `buildRequiredByDate` / `resolveRequiredRows` / `overriddenDates` / `toOverrideMap`）+ `requiredNums.test.ts`（13 件） |
| 2 | `satisfaction.ts` を必要人数 `null` 対応に（`requiredAt` / `CoverageState` / `hasCoverage` を追加、`DateCoverage.satisfied` → `state`）+ テスト更新 |
| 3 | `queries/requiredNums.ts`（上書きだけを `pageAll` + `order` で読む）/ `assist/load.ts`（基本の人数も読んで解決。未設定は行にしない）/ `shifts/page.tsx`（`requiredOverrides` を渡す）/ `_lib/assist.ts`（`hasRequiredNums` → `hasAnyRequired`、不足の数え方） |
| 4 | フッターの 4 状態（`CalendarTable` + `ShiftTable.module.css` の `data-state`）/ 日別モーダル（「この日だけ変更」の札・「基本 n 人に戻す」・未設定のプレースホルダ `—`）/ `saveRequiredNums`（数字は upsert・空欄は delete） |

検証: `npm test` 674 件 / `npm run typecheck` / `npm run lint`（警告 2 件。1 件は §8 の 7 で使う `overriddenDatesInRange`、1 件は既存）。

### 10.2 プランから変えたこと

| # | プラン | 実装 | 理由 |
| --- | --- | --- | --- |
| 1 | `CountsByDate` の値を `number \| null` に | `CountsByDate`（配置）は数のまま。必要人数は別型 `RequiredByDate` | `null` を持つのは必要人数だけ。配置まで `null` を許すと、数えるたびに意味のない分岐が増える |
| 2 | Server（`page.tsx`）が解決して渡す | **Client（`ShiftsClient`）が解決する**。Server 側は `assist/load.ts` が自前で解決 | 基本の人数（`patterns.defaultRequiredNums`）と祝日は既に Client に届いており、日別モーダルは出所（`source`）も要る。Server で解決すると「解決後の数」と「上書き」の両方を送ることになる |
| 3 | `RequiredNumRow` は `satisfaction.ts` | `shifts/requiredNums.ts` に移した | 行の形は解決の話。`satisfaction.ts` は数える側に専念させる |
| 4 | 日別の空欄は `0` として上書き | **空欄は「この日の上書きを消す」**。0 人は `0` と入力 | 未設定の勤務を触らずに保存しただけで `0` の上書きが入ってしまう（基本を変えても届かない日が増える）。設定画面の「空欄＝未定」とも規則がそろう |
| 5 | 充足は「既定の文字色」 | 緑のまま（011 の見た目を変えない）。不足＝赤・過剰＝青 + `+1`・未設定＝灰 | フッターの色は 011 で決めたもので、今回変える理由が無い |
| 6 | 「基本に戻す」に専用 Action | 入力を空欄にして保存するだけ | #4 の規則があれば足りる。Action を増やさない |

### 10.3 ここまで（§8 の 5〜7）

| 段階 | 成果物 |
| --- | --- |
| 5 | `components/requiredNums/RequiredNumsMatrix`（行列。設定と AI シフト作成で共有）/ `lib/patterns/requiredNumsMatrix`（状態と保存の形。テスト 17 件）/ `settings/required-nums/`（page・client）/ ナビに「必要人数」（勤務パターンの直後） |
| 6 | AI シフト作成のモーダルは `AssistRequiredNums`（同じ行列を 1 列で出す）に差し替え、`QuickRequiredNums` を削除。保存は設定と同じ `saveDefaultRequiredNums` |
| 7 | 操作メニューを「この期間の個別の変更を元に戻す（N 日）」に差し替え（`resetRequiredNums`。確認に日付を並べ、0 件なら押せない）。`setDefaultRequiredNums` / `setUniformDefaultRequiredNums` / それらのスキーマ / `defaultRequiredNum` / `uniformRequiredNums` を削除 |

検証: `npm test` 689 件 / `npm run typecheck` / `npm run lint`（既存の警告 1 件のみ）。

プランから変えたこと（続き）:

| # | プラン | 実装 | 理由 |
| --- | --- | --- | --- |
| 7 | 390px は勤務ごとのカード | 行列のまま**横スクロール**（勤務名の列は左に残す） | 006 で「必要人数の 8 列だけ表内で横スクロール」を許している。スイッチ ON のときは 1 列になるので、初回の店はスクロール自体が起きない。カードは実機で詰まってから |
| 8 | `settings/required-nums/actions.ts` に Action を置く | テナント直下の `actions.ts` へ | 設定と AI シフト作成の 2 ルートから呼ぶため（AGENTS.md「ルートをまたぐ Action はグループ直下」） |
| 9 | `QuickRequiredNums` を共有部品に畳む | 共有の行列 + 薄い `AssistRequiredNums`（状態と「この人数で入れる」だけ） | モーダル側の文言と余白はモーダルの持ち物。行列だけを共有する |

### 10.4 ここまで（§8 の 8）

| 成果物 | 中身 |
| --- | --- |
| `supabase/migrations/20261005150000_resolve_required_nums.sql` | 焼き付けられた行（その日の曜日の基本と同じ値）を消すデータ移行 |
| `supabase/tests/required_nums_migration.sql` | テスト内で行を入れてから同じ DELETE を流す（§6.2 のとおり。SQL は migration からの写し） |
| 勤務パターンのフォーム | 必要人数の入力欄を外し、1 行サマリ（`日 1 ・ 月 2 …`）+ 設定へのリンクに。`RequiredNumsInput` は削除 |

検証: `npx supabase db reset` → `npx supabase test db`（171 件すべて通過）/ `gen types` に差分なし（スキーマを変えていない）/
`npm run build` 通過（`/tenants/[tenantId]/settings/required-nums` が出る）/ `npm test` 692 件 / `typecheck` / `lint`。

**ローカルの通し（Chromium で seed の店舗にログイン）**:

| 確かめたこと | 結果 |
| --- | --- |
| シフト表を開く（焼き付けの行は無い） | **セット操作なしで必要人数が出る**（`0/5` `2/5`）。平日 5・土日 4・祝日（10/12）4 と、曜日と祝日の列が効いている |
| `設定 > 必要人数` | 行列が出る。スイッチ ON で 1 列（人数）になり、合計も追従する |
| コンソールエラー | なし |

移行 SQL について 1 つ、プランから判断を変えた（§10.5 の 10）。

### 10.5 プランから変えたこと（続き）

| # | プラン | 実装 | 理由 |
| --- | --- | --- | --- |
| 10 | 祝日の行は消さない（SQL で祝日を判定できないため） | **曜日の一致だけで消す**（祝日の行も条件に合えば消える） | 焼き付けは祝日に `holiday` の値を入れていたので、曜日の値と一致するのは「`holiday` と その曜日が同じ」ときだけ。そのときは消しても解決後の数が変わらない。`holiday` が無い店の祝日（焼き付けは 0）だけが「0 人 → 未設定」に変わるが、どちらも枠が無い点は同じ |

### 10.6 残り・気づき

- **空の月はフッターが赤で埋まる**（配置 0 / 必要 5 が全日に出る）。事実としては正しいが、
  案 C（`2/3`）だと「まだ何も入れていない月」と「本当に足りない月」の見分けが付きにくい。
  §3.7 の案 A（あと何人 / 充足は薄い ✓）に替えるかは、しばらく使ってから決める
- スマホ幅（390px）の行列は実機で未確認（横スクロールの手触り）
- 自動アサインの通し（必要人数が未設定の店で枠が立たないこと）は Vitest で固定済み。ローカルの実行はまだ

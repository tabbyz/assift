# 012: 自動アサイン（AI）

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md`）で「Phase 1 に含まない」としていた自動アサインエンジン。
v1 の `AssistModule#assist!`（1 手先しか見ないグリーディ・バックトラック無し・結果の説明無し）は参考にせず、一から設計する。
制約の設定 UI（`settings/restrictions`）は 006 で済んでいる。

> 001 §6 のマイルストーン表では 012 = データ移行 / 013 = カットオーバーだったが、011 が「シフト表のリデザイン」に使われたのに合わせ、
> 本プランを 012 とし、移行・カットオーバーは 013 / 014 に繰り下げる。
> AGENTS.md の「本番に初回 push（マイルストーン 013）」は、繰り下げ後は 014 に当たる。013 / 014 の実装時に AGENTS.md も更新する。

**状態: 実装済み（確認待ち。2026-09-26）。LLM を含む評価も済み（§10.7）。実装ログは §10。**

---

## 1. 目的と完了条件

### 目的

- 店長が「必要人数」と「スタッフの条件」を入れておけば、**表示期間の不足枠を AI が下書きで埋める**。手で埋めるのは残りだけにする
- v1 の自動アサインが自ら「精度に課題」と注記していた原因は 3 つ: (1) 全体を見ないグリーディ、(2) 埋められなかった理由が出ない、
  (3) 店長の意図（「田中さんは土日に多め」「新人は山田さんと同じ日に」）を伝える手段が無い。
  v2 は (1) を**全体最適を解くソルバー**で、(2)(3) を **LLM（GPT-6）の言語能力**で解く（§3.1 / §5.1）
- **保存されるシフトはハード制約に 1 件も違反しない**ことを、TypeScript の検証器（Vitest で固定）が保証する。
  ソルバーの解も LLM の出力も「候補」であり、検証を通ったものだけを書く
- 結果は「何枠埋めたか / 埋められなかった枠とその理由 / AI のコメントと提案」で見せ、ワンタップで元に戻せる（v1 の `assist_token` の後継）
- 費用は 1 実行あたり数円〜十数円、所要時間は 30 秒以内を目標にする（§5.9）

### 完了条件

- ツールバーの「AI で作成」（§3.7）を押すと、モーダルに **表示期間・不足枠の合計（パターン別）・在籍スタッフ数・制約の件数**と
  「AI への指示（任意）」の入力欄が出る。必要人数が期間に 1 件も無ければ実行できず、「デフォルト人数をセット」への導線が出る
- 「作成する」→ 進行状況（準備 / 指示を解釈 / 割り当てを計算 / 検証 / コメントを作成）が見え、完了で結果に切り替わる:
  `38 / 42 枠を配置しました`、埋められなかった枠の一覧（日付・パターン・理由）、指示の解釈（守れたもの / 守れなかったもの）、
  AI のコメント、「元に戻す」「別の案を作る」「閉じる」
- 表には新しく入った下書きが表示され、それらは**すべて**ハード制約 H1〜H11（§5.3）を満たす。既存のシフト（下書き・確定とも）は 1 件も変わらない
- 「元に戻す」→ その実行で入った下書きだけが消える（店長がその後に確定へ変えたセルは残る）。通知に件数が出る
- 「別の案を作る」→ 前の実行を元に戻し、指示を追記して再実行できる。解に余地があれば前の案と 1 割以上のセルが違う案が出る
  （目的関数のペナルティで誘導する。§3.10）。1 割未満しか変えられなかったときは「前回とほぼ同じ案です」と結果に出る
- 同じ店舗で 2 つ同時には実行できない。実行が途中で死んでも（関数の打ち切り等）次の実行を妨げない
- 店舗ごとの 1 日の実行回数が上限（`ASSIST_DAILY_LIMIT`、既定 10）に達すると「本日の上限に達しました」で実行できない。ローカルでは環境変数で上限を上げてテストできる
- 他店舗の `tenantId` / `runId` を Action に渡すと「店舗が見つかりません」等で失敗し、行は変わらない。
  pgTAP に `assist_runs` の境界と `rollback_assist_run`（自テナントは通る / 他テナントは not found / anon は 42501）が入って PASS
- 検証器（`lib/assist/validate.ts`）の Vitest が H1〜H11 それぞれの違反と境界（週の境目・期間の前後・ペア・期間外の既存シフト）を固定している。
  ソルバーの解を検証器に通して違反 0 になることを、固定の問題（3 規模 × 数 seed）で Vitest が確かめる
- `scripts/assist-eval/` で 3 規模の店舗（8 / 15 / 30 人 × 1 か月）に対して実行し、**充足率・違反 0・偏りの指標・トークン・費用・所要時間**を表にできる
  （API を使うので手動実行。CI には入れない）
- LLM のキー（`AI_GATEWAY_API_KEY`）が無い環境ではボタンが「現在利用できません」になり、他の機能に影響しない
- `npm run format:check` / `lint` / `typecheck` / `test` / `build`、`npx supabase test db` が通る。`npm run build` 後の `.nft.json` にソルバーの `.wasm` が入っている

---

## 2. 確認済みの前提

### 2.1 v1 の自動アサイン（反面教師）

| 項目 | v1 の挙動 |
| --- | --- |
| 入口 | ツールバー「ツール」の末尾「自動アサイン」→ モーダル（α 版の注意 + 「必要人数が要る」「既存には影響しない」）→ POST `assist/do` |
| 対象 | 表示期間 × workday パターンの `required − assigned` 件を Task にする。dayoff パターンは対象外 |
| 週の扱い | 期間を**週の始まり（`start_of_week`）〜週の終わり**に広げてカレンダーを組み、週上限は期間外のシフトも数える |
| 適格性 | 当日空き / ペアなら翌日も空き / `available_wdays` / `available_patterns` / `max_work_week`（workday の週合計）/ 制約 4 種 |
| 順序 | Task を「アサイン可能スタッフ数 × max_work_week/7 の合計 × rand(0.8..1.2)」で昇順（難しい枠から）。スタッフはアサイン数が少ない順 |
| 探索 | 純グリーディ。1 枠に最初に適格だった 1 人。バックトラック無し。ペアを張ったら翌日の同パターンの Task を 1 件消す |
| 保存 | `shift.update(staff, assist_token)` を Task ごとに発行。`fixed = false` |
| 取り消し | `Shift.where(assist_token:).destroy_all`（**テナントを絞っていない**。確定へ変えた行も消える） |
| 再実行 | 「別のパターンで再実行」= token で削除 → rand 込みで再実行 |
| 結果表示 | flash に token を載せ、成功メッセージに「別のパターンで再実行 / アサイン前の状態に戻す / 完了」。**未充足の件数も理由も出ない** |
| 指示・公平性 | 無し |

### 2.2 v2 の現状（この機能が読む・書くもの）

| 項目 | 現状 |
| --- | --- |
| `shifts` | `unique (staff_id, date)`。`fixed`。`assist_token` は移行しない（001 §3.1「`assist_run_id` として再設計」）。**列を足す** |
| `restrictions` | 4 種別。`days` 1..7。`max_work_consecutive` の `pattern1_id` は任意（null = 勤務日全体）。並びは処理に影響しない（006） |
| `staffs` | `available_wdays smallint[]`、`max_work_week` 0..7。`staff_patterns`（選択可能）、`staff_default_patterns`（曜日別デフォルト。008 は「未アサインの日だけ埋める」ツール） |
| `patterns` | `kind`（workday / dayoff）、`pair_pattern_id`（翌日に自動で入る。`assign_shift` は翌日を上書き）、`default_required_nums` |
| `required_nums` | (pattern, date) → num。行が無い = 0。**workday だけが対象**（`satisfaction.ts`） |
| 期間 | `dateRange()` は最長 31 日。`start_of_week` は tenant 設定 |
| 祝日 | Server だけ（`lib/calendar/holidays.ts`）。`dayKeyFor(date, isHoliday)` |
| 一括 INSERT | `insertPlannedShifts()`（`upsert` + `ignoreDuplicates` + `count: 'exact'`）が「既存は上書きしない」を DB に任せている。**同じ形の upsert を `run.ts` に書いて `assist_run_id` を足す**（ルートの `actions.ts` から lib へは import しない） |
| 再描画 | シフト表内で完結する書き込みは `refresh()`（AGENTS.md の表） |
| Server Action | 応答は 1 回。実行上限は page の `maxDuration`（Vercel Fluid compute の既定 300 秒。Hobby の上限 300 秒 / Pro 800 秒）。クライアントが切断しても関数は止まらない（打ち切りはオプトイン） |
| Anthropic SDK | `@anthropic-ai/sdk` 0.128.0。`peerDependencies.zod: ^3.25 || ^4`（Zod 4 と共存）。`messages.parse` + `zodOutputFormat`、`strict: true` ツール、`toolRunner`。構造化出力とツール使用は同一リクエストで併用できる |
| OpenAI SDK | **Zod 4 互換は未確認**（確認済みなのは上の Anthropic SDK のみ）。採用するのは `openai` SDK + Responses API + `zodTextFormat`（§5.10）なので、スパイク（§8.1）で Zod 4 スキーマの `parse` が通ることを確かめる |
| モデル | **GPT-6 Sol**（`gpt-6-sol`、$2 / $10 per MTok、キャッシュ入力 $0.20）/ **GPT-6 Luna**（`gpt-6-luna`、$0.10 / $0.50）。2026-09-22 公開、1,050,000 context、128K 出力、`reasoning.effort` none〜max、構造化出力・関数呼び出し対応（推論ありの関数呼び出しは Responses API）。比較用: `claude-opus-5`（$5 / $25）、`claude-sonnet-5`（$2 / $10） |
| Vercel AI Gateway | GA。トークン料金の上乗せなし（BYOK も無料）。Responses API（構造化出力・`reasoning.effort`）に対応。GPT-6 Sol / Luna は公開当日に掲載。ゲートウェイは本文を保持しない。リージョン指定は `us` / `eu` のみ。予算はチーム / プロジェクト / キー単位（BYOK は対象外） |
| OpenAI のデータ扱い | API の入出力は学習に使わない。不正利用監視のため既定 30 日保持。ZDR は審査制。日本のデータレジデンシーは審査 + 契約変更 + 料金 10% 増（`jp.api.openai.com`） |
| ソルバー | `highs`（HiGHS の WASM 版）1.15.3、MIT、4.0MB、2026-09 更新。MIP、`time_limit`、`mip_rel_gap`、LP 形式の文字列で投入できる。Node では `.wasm` をパッケージ隣から自動で読む |

### 2.3 リサーチの結論（詳細と出典は §9）

**競合の「AI 自動作成」は、割り当て本体が数理最適化かルールベース。** Shiftmation・らくしふは自ら「数理最適化」と明記、oplus はルールベース、
Airシフトは「店長の修正を機械学習」（2018）。海外も Deputy / Planday / When I Work / Sling / Homebase は最適化かポイント制、7shifts は過去 8〜10 週からの ML。
**LLM は Legion（GPT 系）・XShift・Soon が「自然言語で編集指示 → 差分プレビュー → 確認」の UI として使うだけ。**
国内で生成 AI を中核に置いた製品は TeamSpirit AI シフトエージェント（2026 年 8 月末提供開始）が初で、それも法令違反は別レイヤーで止める。
CTC の ORLM-Shift、シフッタの整理も「LLM が入力を解釈してソルバーに渡すハイブリッドが本番運用の現実解」。

**LLM に勤務表を直接書かせる研究結果は厳しい。** SCHEDBench（2026-08、ナース勤務表を含む 1,132 問・13 モデル、ツール無しで表を出力）は
全モデル平均の**実行可能解率 15.2%**、最良（GPT-5.5）でも 55.9%、ナース勤務表の Hard は 0%。ConstraintBench は最良で制約充足 65%。
典型的な失敗は**人数の数え間違い・週上限や連勤などの大域制約の違反・矛盾があっても「できた」と言う**こと。
ZebraLogic は探索空間が 10^10 を超えると推論モデルでも精度が 4 割台に落ちる（5 人 × 7 日 × 3 択でもう 10^16）。
**検証結果を返して修正させるループは、外部の正しい検証器があれば改善するが頭打ちになる**（LLM-Modulo: 10 回で 4.4% → 20.6%、
VRR-Stop: 2 回目で頂点、以降は正しい案を壊す）。一方、**LLM に「小さくて型のある成果物」だけを書かせ、解くのはソルバー**にすると
2 回程度で収束する（TravelPlanner を Z3 で 4.4% → 90%+、スケジューリング DSL で 23.7% → 55.3%、テンプレート方式で約 90%）。

**UX の共通パターン**: 空きセルだけ埋める / 下書きで出す / 埋まらなかった枠を一覧で残す（例外にしない）/ 実行単位で戻せる /
手入力・固定セルは触らない / 過不足を数字と色で常時表示。理由の提示はほぼ未実装で、研究側は「どの制約で候補が全滅したかはソルバーが出し、
LLM は文章化」（TRACE-CS、Why Not?）。assift の 4 種の制約はすべて競合にも対応行があり、「土日どちらか休み」を明示的に持つ製品は無い。

### 2.4 問題の大きさ

| 規模 | 不足枠（目安） | 0/1 変数（4 パターン想定） | 問題文（LLM に渡す場合） |
| --- | --- | --- | --- |
| 8 人 × 7 日 | 42 | 〜200 | ~0.3K tok |
| 8 人 × 31 日 | 186 | 〜1,000 | ~0.6K tok |
| 15 人 × 31 日 | 217 | 〜1,900 | ~0.8K tok |
| 30 人 × 31 日 | 248 | 〜3,700 | ~1.2K tok |

ナース勤務表のベンチマーク（INRC-II は 30〜120 人 × 4〜8 週）の最小規模以下。この規模の MILP / CP は厳密解法で数秒（SCHEDBench は CP-SAT 20 秒を正解判定に使っている）。

---

## 3. 事前に確認したい決定

> 2026-09-25 に回答をもらった項目は見出しに **決定** を付けた。§3.9 は「制約をどう指定するか」からの再検討を経て 2026-09-26 に決定（v1 踏襲 + トグルは次の段階）。

### 3.1 アーキテクチャ: 割り当てを誰が決めるか — **決定: B**

| 案 | 割り当て | LLM の役割 | 精度 | 費用 / 所要時間（1 実行） | 備考 |
| --- | --- | --- | --- | --- | --- |
| A. LLM が書く | LLM が枠ごとの担当を出力。TS の検証器が違反を落とし、違反と残りを返して修正させる（最大 3〜4 往復） | 割り当て・説明 | **未知**。研究では 15〜65%（検証ループで改善するが頭打ち）。保存分の違反 0 は検証器が保証するが、**充足率が読めない** | ¥100〜500 / 1〜5 分（thinking 次第） | 依頼の字面どおり。実行は `after()` + ポーリングが必須 |
| **B. ソルバーが解く（決定）** | TS でハード制約を MILP に写し、HiGHS（WASM）が全体最適を解く。検証器は最後の門番 | (1) 店長の自然言語の指示を「重み付きの条件」に翻訳、(2) 結果と埋まらなかった理由の文章化と改善提案 | **ハード制約は構造的に 0 違反、不足は最小**（最適性ギャップ ≤ 2%） | **¥5〜15 / 5〜30 秒** | 競合・研究の定石。LLM の出力は小さく型が付く（Zod）ので検証しやすい |
| C. B + LLM の仕上げ | B の解を LLM が見て「人の目で気になる点」の入れ替えを提案。検証器が守る | B + 批評 | B と同等（提案は検証器を通る分だけ入る） | B + ¥50〜100 / +30〜60 秒 | 効果が測りにくい。**次の段階**の候補として残す |

**決定: B（2026-09-25）。** 依頼は「最新の LLM を使った実用的な精度」だが、リサーチの結論は「精度を出すなら LLM にセルを書かせない」で一致している。
v1 が B 級だったのは「ロジックだから」ではなく「1 手先しか見ないグリーディだったから」で、B のソルバーは全体最適を解く別物
（Shiftmation・らくしふが「数理最適化」と呼んでいるもの）。LLM は**人の言葉を条件に変える／結果を人の言葉で説明する**ところで使い、
これは競合が LLM を使い始めている唯一の場所でもある。

A を選ぶなら、評価スクリプト（§6.3）で充足率と費用を測ってから UI を作る順序にしたい。また **B を選んでも、評価スクリプトに
「A 方式（LLM 直接 + 検証器）」のランナーを 1 本足して同じ問題で比較する**ことを提案する（検証器は共有なので追加コストは小さい。
数字で納得したうえで決めたい）。

### 3.2 ソルバーの実装 — **決定: HiGHS（2026-09-25）**

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| **HiGHS（`highs` npm、WASM）決定** | ハード制約を MILP（0/1 変数）で宣言し、不足・偏り・好みの重み付き和を最小化 | 宣言的で読める。最適性ギャップが出る。決定的。条件の追加は項を足すだけ | 依存が 1 つ増える（4MB）。Vercel での `.wasm` の同梱（`outputFileTracingIncludes` / `serverExternalPackages`）を確かめる必要 |
| TS のローカルサーチ | 貪欲で初期解 → 焼きなまし / タブーで改善。検証器を評価関数に使う | 依存なし。常に何か返す | 品質のチューニングが要る。最適性の保証なし。コード量は MILP と同程度 |

**決定: HiGHS。実装の最初に半日のスパイク**（30 人 × 31 日の固定問題で `next build` → `.nft.json` に `.wasm` が入る / ローカルと Vercel preview で 10 秒以内に解ける）を置き、
落ちたらローカルサーチに切り替える。どちらでも検証器・LLM・UI は変わらない（§5.2 の境界）。

**2026-09-25 の計測（リポジトリ外のスクラッチで `highs` 1.15.3 を Node で実行。H2 / H5〜H10 と公平性 3 項を入れた MILP、`mip_rel_gap: 0.02`）:**

| 規模 | 変数 / 制約 | 不足の最小化だけ | 公平性つき（中心を定数） | 公平性つき（中心を自由変数） |
| --- | --- | --- | --- | --- |
| 15 人 × 31 日 | 1,045 / 1,237 | – | – | 最適 3.1 秒 |
| 30 人 × 31 日 | 2,202 / 2,417 | 最適 0.08 秒 | **最適 0.6 秒** | 10 秒で打ち切り（解は出る） |
| 50 人 × 31 日 | 3,529 / 3,923 | 最適 0.13 秒 | **最適 0.9 秒** | 10 秒で打ち切り（不足 6 で止まる） |

- 公平性の「中心」を自由変数にすると証明に時間がかかる。**中心は事前に計算した定数にする**（または 1 段目で不足を最小化 → 2 段目で不足を固定して公平性、の 2 段。どちらも 1 秒前後）。§5.4 に反映
- `types.d.ts` が同梱されていて、`tsc --strict` で `import loadHighs from 'highs'` → `highs.solve(lp, options)` の型が通る
- `solve()` は同期で CPU を占有する。1 秒前後なので許容するが、Fluid compute は 1 インスタンスで複数リクエストを捌くため、`time_limit` は 5 秒に抑える（超えても暫定解は返る）
- 未確認: Next のバンドル（`serverExternalPackages`）と Vercel での `.wasm` の同梱。スパイクで見る

### 3.3 モデルと effort — **決定: GPT-6（2026-09-25）**

| 用途 | 決定 | 理由 |
| --- | --- | --- |
| 指示の解釈（`interpret`） | `gpt-6-sol`、`reasoning.effort: 'medium'`、構造化出力 | 曖昧な日本語を型に落とす判断力が要る。出力は小さい（〜500 tok）ので費用は思考分だけ。$2 / $10 |
| 結果の説明（`explain`） | `gpt-6-luna`、`reasoning.effort: 'low'`（または `none`）、構造化出力 | 材料（数字・理由）は決定的に揃っているので文章化だけ。$0.10 / $0.50 |

- GPT-6 Sol / Luna は 2026-09-22 公開（1,050,000 context、128K 出力、構造化出力・関数呼び出し対応、`reasoning.effort` は none〜max）。
  **推論ありで関数呼び出しを使うには Responses API**（Chat Completions は `reasoning_effort: none` のときだけ）。本プランは構造化出力しか使わないが、Responses API に揃える
- 公開直後で日本語の実績が無いので、評価スクリプト（§6.3）に「指示の例文 20 本」を入れて翻訳の正解率を測ってから確定する。
  比較対象として `claude-opus-5` / `claude-sonnet-5` も同じ問題で走らせる（B 案では LLM の担当が小さいので、差は費用と日本語の精度に出る）
- モデル ID は環境変数で差し替えられるようにし、日付付きの版があればそれを固定する

### 3.4 実行方式 — **決定: 同期の Server Action**

| 案 | 内容 | 向く条件 |
| --- | --- | --- |
| **同期の Server Action（決定）** | `useTransition` で待つ。進行状況はクライアント側の段階表示（経過秒 + 段階名） | B なら 5〜30 秒。実装が最小。ページを離れても関数は完走し、結果は `assist_runs` に残るので戻れば見える |
| `after()` + ポーリング | Action は run id を即返し、`after()` で続ける。2 秒ごとに `getAssistRun` | 30 秒を超える（A 案、または C 案）とき |

**決定: 同期（2026-09-25）。** 決め手は RLS。同期ならログイン中のセッションで DB を読み書きでき、他の機能と同じ認可のまま動く。
Inngest のようなジョブ基盤はジョブ側からの HTTP 呼び出しで動くのでユーザーの cookie が無く、service_role で動かして全クエリに `tenant_id` を手で重ねる規律になる
（`publicShare.ts` と同じ）。5〜30 秒の処理にその代償は見合わない。

ただし **`runAssist()` はリクエスト文脈（cookie）に依存させない**: DB クライアント・店舗 id・期間・指示を引数で受け、中のクエリは必ず店舗 id を条件に入れる。
同期版は Server Action がユーザーのクライアントを渡す。次の合図が出たら Inngest（他プロジェクトで実績あり）へ移し、service_role のクライアントを渡す形にする:

- cron 起点の処理（「来月の下書きを夜間に全店舗ぶん作る」）
- 案 C や対話的な修正で LLM の往復が増えて 1 分を超える
- 評価で p95 が 30 秒を超える

移すときは AGENTS.md の service_role の例外に追記し、`/api/inngest` を proxy の保護対象から外し、preview の Deployment Protection の bypass を設定する。

### 3.5 LLM（OpenAI、Vercel AI Gateway 経由）に送るデータ — **決定: スタッフ名を送る**

| 案 | 内容 |
| --- | --- |
| **スタッフ名を送る（決定）** | 指示に「田中さんは…」と書けるようにする。送る内容（スタッフ名・勤務条件・期間のシフト）をモーダルに明示し、規約・プライバシーポリシー（011 静的ページ）に追記 |
| 匿名化して送る | `S1..Sn` のコードだけ。指示の中の名前はサーバーで置換（表記ゆれに弱い） |

OpenAI API は入力を学習に使わない。不正利用監視のため 30 日保持。ゲートウェイは本文を保持しない（§3.11）。
どちらの経路でもスタッフ名は海外（米国）で処理されるので、規約・プライバシーポリシーに「AI（OpenAI）に送る」旨と越境の記載を足す（011 静的ページ）。

### 3.6 実行回数の上限 — **決定: 店舗ごと 1 日 10 回（環境変数で変更可）**

| 案 | 内容 |
| --- | --- |
| **店舗ごと 1 日 10 回（決定）** | `assist_runs` の当日（JST）の行を数えるだけ（成功・失敗を問わず。連打を防ぐ）。超えたら「本日の上限に達しました」。費用の事故止め。上限は `ASSIST_DAILY_LIMIT`（既定 10）で変えられ、ローカル・preview では大きくしてテストする |
| 無制限 | B なら 1 回 ¥5〜15 なので致命的ではない |
| プラン連動 | サブスクリプション（別マイルストーン）で |

### 3.7 入口 — **決定: ツールバーに可視ボタン「AI で作成」**

| 案 | 内容 |
| --- | --- |
| **ツールバーに可視ボタン「AI で作成」（決定）** | `IconSparkles` + `default` compact-sm。「共有」「操作」と並ぶ 3 つ目の動詞。目玉機能で、期間に 1 回使う |
| 操作メニューの先頭 | 可視の動詞を増やさない（011 の方針）。見つけにくい |

### 3.8 表の中の印 — **決定: 推奨どおり**

**決定: 直近の実行で入ったセルに、結果を閉じるまで左上に 4px の点**（`assist_run_id = 最新 run` かつ `acknowledged_at` / `rolled_back_at` が共に null。§4.5）。
011 の「記号を減らす」に反するので、閉じたら消す。店長が「AI が入れたもの」を見直すための一時的な印。

### 3.9 制約のハード / ソフト — **決定: v1 踏襲（2026-09-26）**

**決定（v1 と同じ）**: `restrictions` の 4 種・`available_wdays`・`staff_patterns`・`max_work_week`・ペア・既存セルは**すべてハード**。
必要人数は「超えない」がハード、「満たす」は最優先のソフト（不足を許容して報告する。競合・CP-WSP と同じ）。
店長の指示は既定でソフト（「必ず」「絶対」と書かれたときだけハード）。ハードな指示で解が無くなったら、**ハードな指示をすべてソフトに落として 1 回だけ解き直し**（§5.1 の 4）、
守れなかった指示だけを結果に「守れなかった」と出す（どの指示が原因かを個別に探索しない。解いた結果の違反量で分かる）。

競合には「制約ごとに重要度」を付けられるもの（Shiftmation）があるが、006 の UI にトグルを足すのは**次の段階**にする（§7）。
必要人数の充足がソフト（不足を許容して報告）なので全部ハードでも解が無くなることはなく、「なるべく」系のルールは指示（既定でソフト）で表現できるため。
ただし後から安く足せるよう、`model.ts` の内部表現は「制約 = hard フラグ付きの条件オブジェクト」（012 では restrictions 由来は常に true。
Directive の hard/soft と同じ機構）にしておく（§5.2）。将来のトグルは `restrictions.hard` 列 + 006 の UI + フラグの素通しだけで済み、ソルバーの作り直しは発生しない。

### 3.10 「別の案を作る」 — **決定: 推奨どおり（2026-09-26 修正: ハード制約 → ソフト項）**

**決定**: 前の run を元に戻し、目的関数に「前の案と同じセル」への小さなペナルティ（§5.4）を足して解き直す。
当初は「1 割以上のセルが違う」をハード制約（ハミング距離）にする案だったが、解の余地が無い店舗で infeasible になるか、
不足を増やしてでも変えてしまうため、レビューを受けてソフト化した（2026-09-26）。不足の重み（1000）に対してペナルティは
十分小さくするので、充足を犠牲にせず、余地があれば自然に 1 割以上変わる。1 割未満しか変えられなかったときは結果に
「前回とほぼ同じ案です」と出す（「1 割」は前案の `'assign'` 行のうち、新案に同じ `(staff, date, pattern)` が無い行の割合）。
前の案の割り当ては rollback で `shifts` から消えるため、`assist_runs.result.plan`（§5.8）に保存したものを使う。
決定的なので同じ入力からは同じ案が出る（Planday・オフィスステーションが注意書きにしている「毎回変わる」を避ける）。指示の追記もここから。

### 3.11 接続先 — **決定: Vercel AI Gateway（システムクレジット。BYOK は使わない）**

コードの差は `baseURL` とモデル ID の接頭辞だけ（§5.10）なので、決定はいつでも覆せる。

| | OpenAI 公式 API（直接） | Vercel AI Gateway |
| --- | --- | --- |
| 料金 | 定価 | **定価のまま上乗せなし**（BYOK も無料）。クレジット購入時に決済手数料 ~3%、クレジットは 1 年で失効 |
| 費用の上限 | 組織単位の上限のみ | **チーム / プロジェクト / API キーごとに予算**（超えたら 402）。ただし BYOK の消費は予算の対象外 |
| 障害時 | 自前で再試行 | 同じモデルの別プロバイダーへ再試行 + **モデルの代替**（例: `anthropic/claude-sonnet-5`）を設定できる |
| 新モデル | 当日 | GPT-6 Sol / Luna は公開当日（9/22）に載った。API のパラメータは追随待ちになることがある（`reasoning.effort` の `max` が一覧に無い等） |
| プロンプトの保存 | OpenAI: 学習には使わない。不正利用監視のため 30 日保持（`store: false` でも）。ZDR は審査制 | ゲートウェイ自体は本文を保持しない（メタデータのみ 30 日）。先の OpenAI 側は同じ。Pro 以上ならリクエスト単位の ZDR ルーティングが無料 |
| 日本リージョン | 審査 + 契約変更 + **料金 10% 増**で日本での処理・保存を選べる（`jp.api.openai.com`） | **`us` / `eu` のみ**。ゲートウェイの処理自体も任意の Vercel リージョンで行われる |
| レイテンシ | 東京 → 米国 | 東京 → ゲートウェイ → 米国。1 ホップ増えるが、生成時間（5〜15 秒）に対して無視できる |
| 運用 | キー 1 本 | Vercel の画面で使用量・費用・遅延をリクエスト単位で見られる。アカウント・クレジット管理が 1 つ増える |

**決定: Vercel AI Gateway をシステムクレジットで使う（BYOK は使わない。2026-09-25）。** 理由は、予算上限が §3.6 の「費用の事故止め」をそのまま担うこと、
障害時に Claude へ切り替えられること、評価（§6.3）で他社モデルをコード変更なしに比べられること。BYOK を使わないのは、
予算の対象外になることと、失敗時にシステムクレジットへ黙って切り替わって自社の OpenAI 契約（ZDR 等）から外れうるため。

運用の設定: クレジットを購入し、このプロジェクト用の API キーに月額の予算を付ける（初期値 $30。超えると 402 になり、Action は「AI の利用上限に達しました」を返す）。
モデルの代替に `anthropic/claude-sonnet-5` を設定し、OpenAI 側の障害時にも動くようにする。

**直接に切り替える条件**: 日本国内での処理・保存が要件になった場合（ゲートウェイは今日時点で us / eu しか指定できない）。
その場合は OpenAI の日本リージョン（審査・+10%）か Azure OpenAI の Japan East を使う。
なお**どちらの経路でもスタッフ名は海外に出る**ので、規約・プライバシーポリシーへの記載は同じく必要（§3.5）。
海外に出したくなければ、名前を `S1..Sn` に置き換えて送る案（§3.5 の匿名化）に切り替える。

---

## 4. 画面

### 4.1 入口

ツールバー右の「共有」の左に「AI で作成」（§3.7）。実行中は `Toolbar` の `disabled` が立ち、他の操作と同じく押せない。
LLM のキー（§5.10）が無ければツールチップ「現在利用できません」で disabled。

### 4.2 実行前 `AssistModal`（状態: `ready`）

```
AI でシフトを作成                                  2026年10月
────────────────────────────────────────────────
不足   42 枠   早番 12 · 日勤 8 · 遅番 14 · 夜勤 8
対象   在籍スタッフ 8 人 · 自動アサイン制約 4 件 [設定]
規則   入っているマスは残る · 下書きで入る · 必要人数は超えない

AI への指示（任意）
┌────────────────────────────────────────────┐
│ 例: 田中さんは土日に多めに。新人の佐藤さんは   │
│ 必ず山田さんと同じ日に入れる                  │
└────────────────────────────────────────────┘
□ この指示を店舗の既定として保存する

スタッフ名・勤務条件・この期間のシフトを AI（OpenAI）に送ります（学習には使われません）

                                  [キャンセル]  [作成する]
```

- 不足 0 枠 / 在籍 0 人 / 出勤日パターン 0 件なら「作成する」は無効。必要人数が期間に 1 件も無ければ
  「必要人数が設定されていません」+「デフォルト人数をセット」（既存 Action）
- 指示は 500 文字まで。店舗の既定（`tenants.assist_notes`）があれば初期値に入れる
- 不足の内訳は `satisfaction.ts`（`requiredCounts` / `assignedCounts`）から Client で数える（サーバー呼び出しなし）
- 在籍スタッフ数は page が既に読んでいる `staffs` から。**制約の件数は page.tsx が `restrictions` を新たに読んで渡す**（表の描画には使っておらず、現状の page は読んでいない）

### 4.3 実行中（状態: `running`）

```
AI でシフトを作成                                  2026年10月
────────────────────────────────────────────────
✓ 準備（不足 42 枠・候補を集計）
✓ 指示を解釈
● 割り当てを計算中…                                        0:07
○ 検証
○ コメントを作成
```

同期実行なので段階はサーバーからは届かない。**経過時間で進める見込み表示**（準備 → 解釈 → 計算 → 検証 → コメント）と経過秒。
30 秒を超えたら「時間がかかっています…」。**「閉じる（実行は続きます）」を出す**: Action は完走するので（§3.4）、
完了時にモーダルが開いていれば結果へ切り替え、閉じたまま同じページにいれば通知を出して結果のモーダルを開き直す
（実行を始めたのは数秒前の本人なので割り込みにならない）。ページを離れていれば §4.5 の未 acknowledge の再表示で拾う。ユーザーを 30 秒拘束しない。

### 4.4 結果（状態: `done`）

```
AI でシフトを作成                                  2026年10月
────────────────────────────────────────────────
38 / 42 枠を配置しました                          下書きで入っています

埋められなかった枠（4）
  10/3（土）  遅番 ×1   候補 2 人がいずれも週上限（5日）
  10/10（土） 遅番 ×1   候補 2 人がいずれも週上限（5日）
  10/17（土） 夜勤 ×1   「夜勤は週1まで」で候補なし
  10/24（土） 遅番 ×1   候補 2 人がいずれも週上限（5日）

指示の解釈
  ✓ 田中 → 土日を優先（できれば）
  ✓ 佐藤 → 山田と同じ日に（必ず）
  – 「元気がない人の負荷を軽く」は条件にできませんでした

AI のコメント
  土曜の遅番は選択可能なスタッフが 2 人しかおらず、週上限にかかって
  4 枠が残りました。土曜の遅番を担当できるスタッフを 1 人増やすか、
  上限を 6 日にすると埋まります。

                     [元に戻す]  [別の案を作る]  [閉じる]
```

- 「元に戻す」→ 確認 → `rollbackAssistRun` → 通知「38 件の下書きを取り消しました」
- 「別の案を作る」→ 指示欄を開いた `ready` へ（前の指示 + 追記）。実行時に前の run を元に戻してから始める（§3.10）
- 「閉じる」→ `acknowledgeAssistRun`（点を消す。§3.8）
- 失敗は赤の説明（「AI の応答が得られませんでした」「計算が時間内に終わりませんでした」等）と「もう一度」。書き込み前の失敗なら表は変わっていない旨を書く。
  「別の案を作る」からの失敗は前の案がすでに戻っている（§5.1）ので、その旨を書く

### 4.5 表の中

- 直近の run のセルに 4px の点（§3.8）。閉じるまで。**点と自動再表示の条件はどちらも「`acknowledged_at` と `rolled_back_at` が共に null」**
  （元に戻した run のモーダルが再訪時に開き直したり、確定に変えて残ったセルの点が消せなくなるのを防ぐ）
- 操作メニューに「AI の作成を元に戻す（10/1 10:12）」が、その run の下書きが残っている間だけ出る
- ページを開いたとき、未 acknowledge（上の条件）の succeeded な run が表示期間にあれば結果モーダルを開く（実行中に離れて戻ったケース）
- running の run があるままページを開いたときは何も出さない（開始しようとすると「実行中の自動アサインがあります」。完了後に開き直せば上の再表示で拾う）

---

## 5. 設計の要点

### 5.1 全体の流れ（案 B）

```
Client  AssistModal ── startAssist({ tenantId, start, instructions, saveNotes, retryOfRunId? }) ──▶ Server Action（同期）
                                                                                       │ Zod → requireUser → requireTenant → dateRange(start) → 上限（§3.6）
                                                                                       │ assist_runs に running を 1 行（同時実行は partial unique で弾く）
                                                                                       ▼
                                                                   runAssist()  lib/assist/run.ts（server-only）
                                                                     1. 読む: staffs(+patterns,+defaults) / patterns / restrictions /
                                                                        required_nums(P + 1 日) / shifts(文脈期間 C) / 祝日 / tenants.assist_notes
                                                                     2. buildProblem()            純関数。不足枠・候補（H1〜H4）・週・既存の集計
                                                                     3. interpret()  ← LLM        指示があるときだけ。自然言語 → Directive[]（Zod）
                                                                     4. buildModel() + solve()    MILP を組んで HiGHS。infeasible ならハード指示をソフトに落として 1 回だけ再解
                                                                     5. validatePlan()            H1〜H11 の逐次受理（最後の門番。落ちた行は記録して捨てる）
                                                                     6. explainUnfilled()         純関数。埋まらなかった枠ごとに、候補がどの制約で消えたか
                                                                     7. shifts に upsert（ignoreDuplicates, assist_run_id）→ 読み戻して
                                                                        result.plan / filled を確定 → assist_runs を succeeded に
                                                                     8. explain()   ← LLM         数字と理由を渡して、要約と提案を日本語で。
                                                                        result に追記（失敗したら説明無しのまま）
                                                                                                        │
Client  ◀── ActionResult<{ runId, result }> ─────────────────────────────────────────────┘  refresh()
```

- 2・4・5・6 は LLM を使わない純関数（Vitest）。3・8 だけが LLM。**指示が無ければ LLM の呼び出しは 8 の 1 回**
- **保存（7）を説明（8）より先にする**: ソルバーの成果は不安定な LLM 呼び出しより先に永続化する。`explain` が失敗・タイムアウトしても
  run は succeeded で結果は見られる（説明が無いだけ。§5.6）。`maxDuration` で切られても解を失わない
- 5 は 4 の解に対する二重チェック。MILP が正しければ何も落ちないが、モデルのバグを**黙って保存しない**ための門番（落ちたら `console.warn` + `result.rejected` に残す）
- 途中で失敗したら `assist_runs.status = failed`、`error` を書く。7 の前なら `shifts` は触っていない（`retryOfRunId` の rollback を除く）
- 期間はエクスポート（010）と同じく**クライアントから `end` を受けず**、`start` から `dateRange()` で組み直す（`assist_runs` の check 制約と二重の守り）。
  `required_nums` は**ペアの着地日（P.end + 1）の H10 判定に要るので P + 1 日を読む**
- **`Plan` にはペア行も含める**（`source: 'assign' | 'pair'`）。validate・upsert・件数の分子が同じ集合を見る
- 「n / m 枠」の分子は solver の解の件数ではなく、**7 の後に `assist_run_id` で読み戻した行**から数える
  （P 内の枠に入った行だけを分子にし、ペアの dayoff 行や P 外の行は数えない）。solve 中の手動アサインと衝突した行は
  `ignoreDuplicates` で黙って落ち、読み戻しにも現れない（スナップショットとのレースで必要人数を僅かに超えうるが、確率と実害から許容する）。
  **読み戻しで親とペアが片方だけになった組（レースで片方だけ衝突）は、残った側も削除する**。`result.plan` も読み戻した行から書く
- **「別の案を作る」は前 run の id を `retryOfRunId` で渡す**。`requireTenant` の後に `rollback_assist_run` を呼んでから解き、
  ペナルティ項（§5.4）は前 run の `result.plan` から組む。新しい実行が失敗すると前の案も戻らないが、
  「別の案」を押した時点で前の案は捨てる意図なので許容する（もう一度実行すればよい）

### 5.2 モジュールの境界

```
src/lib/assist/
  problem.ts        buildProblem(input): Problem      不足枠 / 候補 / 週 / 既存の集計（純関数）
  validate.ts       validatePlan(problem, plan)       H1〜H11 の逐次受理（純関数）
  reasons.ts        explainUnfilled(problem, plan)    枠ごとの理由（純関数）
  directives.ts     Directive の Zod スキーマと重みへの変換
  model.ts          buildModel(problem, directives, options): LpModel   MILP（純関数。LP 形式の文字列を組む）
  solver/highs.ts   solve(model, { timeLimit, gap }): Solution          HiGHS の薄い包み（server-only）
  llm/client.ts     OpenAI SDK のクライアント（ゲートウェイ / 直接の切り替え。キー無しなら null）
  llm/interpret.ts  自然言語 → Directive[]（構造化出力）
  llm/explain.ts    結果 → { summary, advice[] }（構造化出力）
  llm/prompts.ts    固定文
  run.ts            runAssist()（server-only。上の 1〜8）
  pricing.ts        単価表と概算
  metrics.ts        充足率・偏りの指標（評価と結果表示で共有）
  weights.ts        目的関数の重み（評価で調整する定数）
```

`Problem` → `Plan`（`{ staffId, date, patternId, source: 'assign' | 'pair' }[]`。**ペア行も明示的に含める**）→ `validatePlan` の形は**ソルバーの実装に依存しない**。
HiGHS をローカルサーチに替えても `solver/` の中だけが変わる（§3.2）。A 案を試すときも `llm/solveDirect.ts` が `Plan` を返す形にすれば同じ検証器・同じ UI で比較できる。
制約は `model.ts` の内部で hard フラグ付きの条件オブジェクトに正規化する（012 では restrictions 由来は常に hard。
将来の「必須 / できれば」トグル（§3.9 / §7）はこのフラグの素通しで足せる）。
指示の上限（500 字）などの定数は規約どおり `src/lib/validation/assist.ts` の Zod スキーマに集約し、
モーダル・`startAssist`・`assist_runs` / `tenants` の check 制約（§5.8）で同じ値を使う。

### 5.3 ハード制約（検証器 `validate.ts` と MILP の両方が持つ）

対象期間 P（表示期間）に対し、文脈期間 C = [min(週初(P.start), P.start − 7), max(週末(P.end), P.end + 7)] のシフトを読む。
週上限は C の中で週ごとに数え、連続勤務は前後 7 日まで辿る（`days ≤ 7`）。

| # | 制約 | 定義 | MILP での形 |
| --- | --- | --- | --- |
| H1 | 空きセル・1 日 1 枠 | `(staff, date)` にシフトが無い（下書きも確定も）。既存は上書きせず、新規同士も同じセルに 2 件入れない | 埋まっているセルの変数を作らない。空きセルは `Σ_p x[s,d,p] ≤ 1`（**これが無いと新規同士の重複を許す**） |
| H2 | ペアの翌日 | パターンにペアがあれば `(staff, date+1)` も空き。翌日が P の外でも書く（`assign_shift` と同じ） | 翌日が埋まっていれば変数を作らない。`Σ_p x[s,d+1,p] + Σ_{p:ペア有} x[s,d,p] ≤ 1` |
| H3 | 勤務できる曜日 | `wday(date) ∈ staff.available_wdays` | 変数を作らない |
| H4 | 選択可能なパターン | `pattern ∈ staff_patterns(staff)` | 変数を作らない |
| H5 | スタッフの週上限 | 週（`start_of_week` 基準）内の workday シフト数（既存 + 新規 + workday のペア）`≤ max_work_week` | 週ごとに `Σ x + Σ(workday のペア項) ≤ max − 既存` |
| H6 | `deny_pattern_pair(p1,p2)` | 同じスタッフで `d` が p1 かつ `d+1` が p2 になる日が無い（既存との組み合わせも見る） | `x[s,d,p1] + x[s,d+1,p2] ≤ 1`。既存が p1 / p2 の側は変数を作らない |
| H7 | `max_work_week(p1, n)` | 週内の p1 の数 `≤ n` | 週ごとに `Σ x[s,·,p1] ≤ n − 既存` |
| H8 | `max_work_consecutive(p1?, n)` | p1 指定: p1 が連続する日数 `≤ n`（別パターンで途切れる）。未指定: workday が連続する日数 `≤ n` | 長さ `n+1` の全ての窓で `Σ(新規 + 既存 + ペア) ≤ n` |
| H9 | `sat_or_sun_dayoff` | 土曜 `d` と翌日曜 `d+1` の両方が workday にならない | `work[s,d] + work[s,d+1] ≤ 1` |
| H10 | 必要人数を超えない | `(date, pattern)` の配置数 `≤ max(0, required − assigned)`。**ペアで入る行も配置数に数える**（充足にも超過にも。2026-09-26 決定）。dayoff パターンは枠にしない。workday のペア先に枠が無い日は親パターンを置けない（理由は「ペア先に枠が無い」） | `Σ_s x[s,d,p] + Σ_{s,q: pair(q)=p} x[s,d−1,q] + u[d,p] = 枠数`、`u ≥ 0`（不足変数）。**ペアが着地しうる `(date, pattern)` は枠が 0 でも制約を立てる** |
| H11 | 参照の妥当性 | 在籍スタッフだけ。`'assign'` 行はこの店舗の workday パターンで P 内の日付、`'pair'` 行は親のペア先パターンで親の翌日（P.end + 1 まで）。知らない id は捨てる | （検証器のみ。LLM 出力への備え） |

MILP では、ペアで翌日に入る行を**着地日のそのパターンの行として数える**（H5〜H10 共通。新しい変数は増やさず、親の変数の項として書く）。
検証器は `Plan` のペア行を通常の行として検査するので、自然に同じ扱いになる。

**検証器の受理は逐次**: 割り当てを (date, pattern, 入力順) で並べ、既存 + 受理済みに対して H1〜H11 を満たすものだけ受理する。
**親とペアは 1 単位で受理・棄却する**（親だけ・ペアだけを保存しない。`assign_shift` を 1 トランザクションにしたのと同じ理由）。
違反は `{ assignment, reasons[] }` として返す。逐次受理は常に部分集合を返すので、「保存される集合はどの順で見ても違反 0」が保証される。

### 5.4 ソフト目標（MILP の目的関数。重みは `weights.ts`、評価で調整）

最小化する重み付き和。初期値は目安。

| 項 | 内容 | 初期の重み |
| --- | --- | --- |
| 不足 | `Σ u[d,p]`（埋められなかった枠） | 1000 / 枠 |
| 店長の指示（ソフト） | Directive ごとの違反量 | 20 × 指示の強さ（1〜5） |
| 勤務日数の偏り | 各スタッフの `勤務日数（P 内の既存 + 新規）/ max_work_week` の中心からの L1 偏差（既存込みにして月全体を均す。`max_work_week = 0` のスタッフは対象外）（`T_s/cap_s − c ≤ dev_s`、`c − T_s/cap_s ≤ dev_s`）。**中心 `c` は自由変数にせず、`不足枠の合計 / Σ max_work_week` から事前に計算した定数**にする（§3.2 の計測: 自由変数だと 30 人で 10 秒を超える） | 30 |
| 土日祝の偏り | 土日祝の勤務日数の L1 偏差 | 20 |
| パターンの偏り | パターンごとの担当回数の L1 偏差（夜勤などの負荷の高い枠が偏らない） | 10 |
| デフォルト勤務パターン | `staff_default_patterns[s][dayKey(d)] = p` なら `x[s,d,p]` にボーナス | −5 |
| 前の案との一致（「別の案を作る」のみ） | 前の run の割り当て（`result.plan`）と同じ `x[s,d,p]` へのペナルティ（§3.10。不足の重みより十分小さく、充足を犠牲にしない） | 1 |

不足を圧倒的に重くするのは「埋められるのに公平性のために空ける」を避けるため。指示の「必ず」は制約に昇格させる（§3.9）。

### 5.5 店長の指示 → Directive（`llm/interpret.ts`）

LLM に渡すもの: スタッフ一覧（`S1 田中 …`）、パターン一覧（`P1 早番 …`）、期間・曜日・祝日、指示の本文。
返すもの（OpenAI SDK の `zodTextFormat`。数値の範囲は SDK が外して送るので Zod で再検証）:

```ts
type Directive =
  | { type: 'prefer_pattern' | 'avoid_pattern'; staff: 'S3'; pattern: 'P1'; wdays?: number[]; dates?: string[]; strength: 1|2|3|4|5; hard: boolean }
  | { type: 'prefer_work' | 'prefer_off'; staff; wdays?; dates?; strength; hard }
  | { type: 'limit_workdays' | 'min_workdays'; staff; count: number; scope: 'week' | 'period'; hard }
  | { type: 'limit_weekends'; staff; count; hard }
  | { type: 'same_days' | 'different_days'; staffA; staffB; strength; hard }
  | { type: 'fill_first'; dates?; pattern?; strength }          // この日 / このパターンを優先して埋める
// + interpretations: { text: string; directive?: index; note?: string }[]   // 画面に出す「解釈」。条件にできなかったものは directive 無し
```

- 未知のコード・在籍でないスタッフ・dayoff パターンは捨てて `interpretations` に「条件にできませんでした」を残す
- 指示が無ければこの呼び出しをしない
- `strength` は「多め」「できれば」→ 2〜3、「必ず」「絶対」→ `hard: true`。判断基準はプロンプトに例で書く
- **期間の日付や曜日の特定は LLM に任せない**: 「10/3」「第 2 週」のような表現は `dates` に候補を返させ、TS 側で P の中に絞る

### 5.6 埋まらなかった理由（`reasons.ts`、純関数）と説明（`llm/explain.ts`）

各不足枠について、H1〜H4 を満たす候補ごとに「最終の解に入れたら何が壊れるか」（H5〜H10 のどれか。「ペア先が埋まっている / ペア先に枠が無い」を含む）を求め、集計する:
`候補 2 人: 週上限 2` / `候補なし（土曜に勤務できる人がいない）` / `候補 3 人: 連勤上限 1 · 遷移禁止 1 · 別の枠に配置 1`。
「別の枠に配置」は、その候補を動かしても不足の合計が減らないことをソルバーの最適性から言えるので、そう書く。
ただし**最適で解けたときだけ**この表現を使い、時間切れで gap が残ったときは「他の枠との兼ね合いで配置されませんでした」に弱める（`result.solver.status` で分岐）。

LLM（GPT-6 Luna、`effort: 'low'`）には数字と理由の一覧・偏りの指標・指示の解釈結果を渡し、
`{ summary: string（≤200 字）, advice: string[]（≤3） }` を返させる。**数字は LLM に書かせず、テンプレートの数字を上書きしない**
（「38 / 42 枠」は TS が出す）。API が失敗したら説明無しで結果を返す（書き込みは済んでいる）。

### 5.7 実行方式と失敗の扱い

- 同期の Server Action（§3.4）。`shifts/page.tsx` に `export const maxDuration = 300` は**書かない**（Fluid の既定と同じ。書くなら Pro で 800 にする理由があるとき）
- `assist_runs` の同時実行は `create unique index assist_runs_one_running_idx on assist_runs (tenant_id) where status = 'running'`。23505 は「実行中の自動アサインがあります」
- 1 日の上限（§3.6）: `startAssist` が `assist_runs` の当日（JST）の件数を数え、`ASSIST_DAILY_LIMIT`（既定 10）以上なら「本日の上限に達しました」。ゲートウェイの予算超過（402）は「AI の利用上限に達しました」に写す
- 関数が打ち切られると `running` が残る。`startAssist` は `running` かつ `updated_at < now() − 10 分` の行を `failed`（`error = 'timed out'`）にしてから始める
- HiGHS は `time_limit: 5`（§3.2: Fluid は 1 インスタンスで複数リクエストを捌くので CPU 占有を抑える）、`mip_rel_gap: 0.02`。時間切れでも実行可能解があればそれを使い、`result.solver.status` に残す
- OpenAI SDK: `timeout` 60 秒、`maxRetries` 2。refusal / `incomplete`（`max_output_tokens`）は失敗として扱う。`interpret` の失敗は「指示を解釈できませんでした」で**中断**（黙って無視して作らない）、`explain` の失敗は説明無しで続ける
- `runAssist()` は文脈非依存にする（§3.4）。Inngest へ移す条件と手順も §3.4

### 5.8 データモデル

```sql
create type public.assist_run_status as enum ('running', 'succeeded', 'failed');

create table public.assist_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  status          public.assist_run_status not null default 'running',
  instructions    text check (char_length(instructions) <= 500),
  models          jsonb,        -- { interpret: 'gpt-6-sol', explain: 'gpt-6-luna', via: 'gateway' | 'direct', solver: 'highs 1.15.3' }
  request         jsonb,        -- Problem の要約と Directive[]（評価・デバッグ用。スタッフ名を含む）
  result          jsonb,        -- { requested, filled, unfilled: [{date, patternId, count, reason}], rejected: [...], plan: [{staffId, date, patternId, source}], interpretations, summary, advice, metrics, solver }
  usage           jsonb,        -- { interpret: {input, output, cache_read}, explain: {...}, cost_usd, elapsed_ms: {...} }
  error           text,
  acknowledged_at timestamptz,  -- 結果モーダルを閉じた（表の点を消す）
  rolled_back_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, tenant_id),
  check (end_date >= start_date and end_date - start_date < 31)
);
create index assist_runs_tenant_created_idx on public.assist_runs (tenant_id, created_at desc);
create unique index assist_runs_one_running_idx on public.assist_runs (tenant_id) where status = 'running';

alter table public.shifts add column assist_run_id uuid;
alter table public.shifts add foreign key (assist_run_id, tenant_id) references public.assist_runs (id, tenant_id) on delete set null (assist_run_id);
create index shifts_assist_run_id_idx on public.shifts (assist_run_id);

alter table public.tenants add column assist_notes text check (char_length(assist_notes) <= 500);
```

- RLS は他テーブルと同じ二層（`assist_runs_restrict_same_tenant` + `assist_runs_member_all`）。GRANT は `select, insert, update`
- `assist_runs` にも他テーブルと同じ `private.set_updated_at` トリガを付ける（§5.7 の stale 判定が `updated_at` を見る）
- `result.plan` は保存した割り当て（ペア行を含む）。rollback で `shifts` からは消えるため、「別の案を作る」のペナルティ項（§3.10）と評価がここを読む
- `rollback_assist_run(p_tenant_id, p_run_id) returns integer`（security invoker）: `delete from shifts where assist_run_id = p_run_id and tenant_id = p_tenant_id and fixed = false` → 行数を返し、`rolled_back_at = now()`。店舗が見えなければ `tenant not found`、run が無ければ `run not found`。
  **対象は `status = 'succeeded'` の run だけ**（running を戻すと完了後に行だけ残る。running / failed も `run not found`）
- pgTAP: A の run は A から消せる / B の run id を渡すと not found / running の run は not found / anon は 42501 / `shifts.assist_run_id` に他テナントの run を入れると 23503
- 上の SQL は差分の説明。宣言的スキーマでは `alter table` ではなく `tables/assist_runs.sql` を新設し、`tables/shifts.sql` / `tables/tenants.sql` の `create table` に列と FK を書き、enum は `types.sql` に置く
- 手順は AGENTS.md どおり `migrations/` を空にして `init_schema` を作り直し、`unmanaged/restrict_anon_grants.sql` を追記、`db reset` → `test db` → `gen types`

### 5.9 費用と所要時間の見積もり（案 B）

| 段階 | モデル / 実装 | 入力 / 出力（目安） | 費用 | 時間 |
| --- | --- | --- | --- | --- |
| 読み取り + 問題の構築 | TS | – | – | < 1 秒 |
| 指示の解釈（指示があるときだけ） | GPT-6 Sol, medium | 3K / 0.5K + thinking 2〜5K | $0.025〜0.06 | 5〜15 秒 |
| 解く | HiGHS（WASM） | 30 人 × 31 日で 〜3.7K 変数 | – | 1〜5 秒（上限 5 秒） |
| 検証 + 理由 | TS | – | – | < 1 秒 |
| 説明 | GPT-6 Luna, low | 3K / 0.6K | $0.001 | 2〜5 秒 |
| **合計** | | | **$0.03〜0.06（¥4〜9）** | **5〜30 秒** |

参考: 案 A（Claude 直接 + 検証器、Opus 5 high、3〜4 往復）は $1〜3（¥150〜450）/ 1〜5 分の見込み。thinking の量は実測しないと決まらない。

### 5.10 LLM の呼び方（共通）

- 公式の `openai` SDK を直接使う（Vercel AI SDK は入れない。チャット UI が無く、必要なのは構造化出力だけ）。
  **Responses API** + `zodTextFormat(schema)`（`client.responses.parse({ model, instructions: 固定文, input, text: { format: zodTextFormat(schema, 'name') }, reasoning: { effort }, max_output_tokens, store: false })`）
- **`max_output_tokens` は `interpret` が 16000、`explain` が 4000。** Responses API は推論トークンも上限に含めるので、§5.9 の見積もり（thinking 2〜5K）で 4000 にすると `incomplete` で失敗する
- **`store: false` を必ず付ける**（Responses API は既定で応答を 30 日保存する。取得し直す用途は無い）
- `output_parsed` が null / `status` が `incomplete`（`max_output_tokens`）/ refusal なら失敗として扱う
- `usage` を run に記録し、`pricing.ts` の単価表で概算する
- **接続先は Vercel AI Gateway**（§3.11）: `baseURL: 'https://ai-gateway.vercel.sh/v1'`、キーは `AI_GATEWAY_API_KEY`、モデル ID は `openai/gpt-6-sol` / `openai/gpt-6-luna`。
  直接に戻す必要が出たときは `OPENAI_API_KEY` + 接頭辞なしの ID に切り替えられるよう、差を `llm/client.ts` の 2 行に閉じ込める
- 環境変数（`.env.example` に追記）: `AI_GATEWAY_API_KEY`（必須）、`ASSIST_DAILY_LIMIT`（既定 10）、`ASSIST_INTERPRET_MODEL` / `ASSIST_EXPLAIN_MODEL`（既定 `openai/gpt-6-sol` / `openai/gpt-6-luna`）
- モデル名は `ASSIST_INTERPRET_MODEL` / `ASSIST_EXPLAIN_MODEL` で上書きできる（評価用。`anthropic/claude-sonnet-5` のようにゲートウェイ経由で他社も指せる）
- `AI_GATEWAY_API_KEY` が無ければ `llm/client.ts` は null を返し、ボタンは「現在利用できません」

### 5.11 ソルバーの同梱（HiGHS）

- `next.config.ts`: `serverExternalPackages: ['highs']`（Emscripten のローダーをバンドルしない。`@react-pdf/renderer` と同じ理由）、
  `outputFileTracingIncludes: { '/tenants/*/shifts': ['node_modules/highs/build/**'] }`（`.wasm`。フォントと同じ手順で `.nft.json` を確認）。
  **キーの形は未確認**: 既存の前例（[next.config.ts:15](../../../next.config.ts#L15)）は API ルートのみで、route group 配下の page ルートに効く書き方はスパイクで `.nft.json` を見て確かめる
- ローダーはモジュールスコープで 1 回だけ `await loadHighs()` し、リクエスト間で使い回す（コールドスタート以外は 0 ms）
- LP 形式の文字列で投入する（変数名 `x_s3_d12_p1`）。結果は `Columns[name].Primal > 0.5` を採用

---

## 6. テスト

### 6.1 Vitest（純関数）

- `problem.test.ts`: 不足枠（`required − assigned`、dayoff 除外、0 以下は枠にしない）、候補（H1〜H4）、文脈期間 C の境界、週の切り方（`start_of_week` 0..6）、ペア着地日（P.end + 1）の枠
- `validate.test.ts`: H1〜H11 の違反 1 件ずつ + 逐次受理（同じ週に 6 件来たら 5 件目まで）+ **同じセルに新規 2 件** + ペア（翌日が期間外 / 翌日が埋まっている / **workday のペアが枠を消費する・超えない** / **親とペアの単位受理: 片方だけ通らない**）+ 連続勤務が期間の前から続く + 土日が期間の境目にまたがる
- `model.test.ts`: 小さな問題（3 人 × 7 日）で生成される制約行を固定。`solve → validatePlan` で違反 0（HiGHS をテストで実行する。WASM は Node で動く）
- `model.solve.test.ts`: 固定の問題 3 規模 × seed で「不足が最小 = 候補の無い枠の数と一致」「余地のある問題では別の案がハミング距離 ≥ 10%」「余地の無い問題では同じ案 + 『ほぼ同じ』のフラグ」（§3.10）
- `directives.test.ts`: Directive → 制約 / 目的関数の項。未知コード・dayoff パターンの除外
- `reasons.test.ts`: 理由の集計文
- `metrics.test.ts`: 充足率・偏差

### 6.2 pgTAP

- `assist_runs` の SELECT / INSERT / UPDATE の境界、`rollback_assist_run` の 4 ケース（自テナント / 他テナント / running / anon）、`shifts.assist_run_id` の複合 FK

### 6.3 評価スクリプト（手動。API を使う）

- `scripts/assist-eval/fixtures/{small,medium,large}.json`（seed と同じ形の店舗: 8 / 15 / 30 人 × 1 か月、制約 4 種、指示 3 パターン）
- `npx tsx scripts/assist-eval/run.ts --fixture large --engine solver --repeat 3`
  / `--engine llm-direct`（§3.1 の比較用。`llm/solveDirect.ts` + 同じ検証器）
- 出力: 充足率 / 検証で落ちた件数 / 偏りの指標 / 指示の遵守（解釈の一覧を目視）/ トークン / 概算費用 / 所要時間（段階別）
- **重み（§5.4）・effort・モデルはこれで決める**。結果は §10 実装ログに表で残す

### 6.4 手動（ローカル）

- seed 店舗（8 人 × 6 パターン × 制約 4 件）で 10 月を実行 → 結果 → 表 → 元に戻す → 別の案 → 指示あり（「青木さんは土日に多め」「必ず岩本さんと川田さんは同じ日」）
- 必要人数 0 / スタッフ 0 / 候補 0 の枠だけ / API キー無し / 実行中の二重起動（2 タブ）/ ペア付きパターン（夜勤 → 明け）あり / 390px 幅

---

## 7. スコープ外（次の段階）

- 案 C: 解を Claude が批評して入れ替えを提案する仕上げ（§3.1）
- 結果を見てからの対話的な修正（「土曜の遅番は佐藤さんに」→ 差分だけ適用）。`assist_runs.request` に Directive を残すので、次回は「前回の解釈 + 追記」から始められる
- 制約ごとの「必須 / できれば」トグル（006 の UI）と、スタッフごとの最低勤務日数。トグルに備えて `model.ts` の内部表現は hard フラグ付きにしておく（§3.9 / §5.2）
- スタッフ本人からの希望休の収集（ログイン機能が無い）。当面は店長が「休み」パターンを先に入れておけば H1 で避けられる
- 実行回数の課金・プラン連動
- 部分的な再実行（特定スタッフ / 特定週だけ）。Shiftmation の「一部を固定して再作成」相当
- 過去の期間の模倣（「前月と同じ曜日パターンを優先」）。ソフト項を 1 つ足せば入るので、要望が出てから

---

## 8. 実装の順序

1. **スパイク（半日）**: `highs` を入れ、30 人 × 31 日の固定問題を LP 形式で組んで `next build` → `.nft.json`（`outputFileTracingIncludes` のキーの形を含む。§5.11）と解く時間を確認。
   あわせて **`openai` SDK + Zod 4**（Responses API の `parse` + `zodTextFormat`）が通ることを確認（§2.2 で確認済みなのは Anthropic SDK のみ）。落ちたら §3.2 の代替へ
2. スキーマ: `assist_runs` / `shifts.assist_run_id` / `tenants.assist_notes` / `rollback_assist_run` → sync → `db reset` → pgTAP → `gen types`
3. 純関数: `problem` → `validate` → `model` → `reasons` → `metrics`（Vitest を先に書く）
4. `solver/highs.ts` + `model.solve.test.ts`
5. LLM: `client` → `directives` + `interpret` → `explain`（プロンプトは `prompts.ts`）
6. `run.ts` と Server Actions（`startAssist` / `rollbackAssistRun` / `acknowledgeAssistRun`。店舗の既定の指示は `startAssist` の `saveNotes` で書き、専用 Action は作らない）+ `lib/queries/assistRuns.ts`
7. 評価スクリプトと fixtures → 重み・effort・モデルの調整
8. UI: `AssistModal`（3 状態）→ ツールバー → 表の点 → 操作メニューの「元に戻す」→ 未 acknowledge の run の自動表示
9. 手動検証（§6.4）→ 実装ログ

---

## 9. リサーチの要点と出典（2026-09-25）

### 9.1 競合

| サービス | 方式 | 入力・制約 | 結果の見せ方 / 戻し方 | 出典 |
| --- | --- | --- | --- | --- |
| Shiftmation | 数理最適化（「最短 5 秒」） | 希望・管理者指定（固定セル）・時間帯別必要人数・デイラベル・グループ・月間労働時間。**連勤と公休は必須、他は重要度を付ける** | 過不足を数字と色・グラフ。変更履歴と巻き戻し。一部を固定して再作成（2020/12）。複数案 | https://shiftmation.com/ https://www.shiftmation.com/spec/spec.html |
| Airシフト（リクルート） | 独自アルゴリズム + 店長の修正を機械学習（2018） | 希望シフト・必要人数（曜日 × 時間帯）。300 人の店長ヒアリングで「相性・人間関係」を店長は見ている → 「納得感」を目標 | （FAQ は 403 で未確認） | https://airregi.jp/shift/ https://www.bcnretail.com/market/detail/20180829_82824.html |
| らくしふ | 数理最適化（数秒） | 労務・モデルシフト・希望・スキル・時間単位の必要人数・禁止条件・夜勤明け | **複数案を提案して選ばせる** | https://rakushifu.jp/function/ai-gen/ |
| oplus | ルールベース | 業務 × 曜日の必要人数（日付上書き）、インターバル、出勤日数の均等化、連勤アラート、段階的な割り当て、相性、連勤パターン | 過不足の可視化。再割り当て | https://opluswork.com/aishift |
| ジョブカン | ルールベース（2016） | 曜日 × パターンの必要人数、パターン割当回数の上限、**固定セル（対象外指定）** | 保存するまで確定しない | https://jobcan.ne.jp/functions/shift/ |
| freee / KING OF TIME / オフィスステーション | 同一エンジン（OEM） | 業務習熟度 1〜5、時間帯別目標、インターバル。**登録済みの日は上書きしない**。「都度結果が変わる」と注意書き | – | https://www.officestation.jp/helpcenter/75848/ |
| TeamSpirit AI シフトエージェント | 生成 AI（2026/8 末。内部方式は非公開） | 組織・スキル・資格・休暇希望・連勤制限。「プロンプト調整」 | 複数案。36 協定違反をアラート、14 日以上の連勤をブロック | https://corp.teamspirit.com/news/release/2026/06/aisift/ |
| Deputy | 最適化（Auto Build + Auto Fill） | 空きだけ埋める。優先度: 最安 / **均等な時間** / 過去の好み。疲労ルール | 直後数秒だけ Undo | https://www.deputy.com/features/auto-scheduling |
| 7shifts | ML（過去 8〜10 週） | 可用性・OT・**連勤上限**・売上予測 | 埋められなかったシフトは Open Shifts に残して通知 | https://www.usecarly.com/blog/sevenshifts-ai/ |
| When I Work | ポイント制 | 未公開の Open Shift だけ。**週末はランダム化して公平化** | Save / Revert | https://help.wheniwork.com/articles/auto-assign-shifts/ |
| Planday | 最適化（Acceptable / Good / Optimal の 3 段） | 可用性 3 段・契約・労働時間ルール。「**ソフトな指針であり被覆を優先**」 | プレビュー → Apply（取り消し不可）。埋まらない理由をカテゴリで | https://help.planday.com/en/articles/30439 |
| Homebase / Connecteam / Sling | ポイント制 / 最適化 | 時間が少ない人を優先 / 不人気シフトの均等分配 / 対象を選んで部分実行 | Undo ボタン | https://www.joinhomebase.com/employee-scheduling/auto-scheduling https://connecteam.com/employee-scheduling-app/auto-scheduling/ https://support.getsling.com/en/articles/5203721 |
| Legion / XShift / Soon | 既存エンジン + LLM の自然言語 UI | 「Put John on Tuesday」→ **差分プレビュー → 確認**。権限内で動作。「結果は必ず確認して」 | 👍👎 フィードバック | https://legion.co/gen-ai-faq/ https://www.xshift.ai/ai-copilot |
| CTC ORLM-Shift / シフッタ / NITI | 最適化 AI + 生成 AI（解釈）/ 業界整理 / 最適化のみ | 「20 人 × 1 か月の組合せは LLM 単体では扱えない」「LLM が入力を解釈してソルバーに渡すのが本番運用の現実解」 | – | https://www.ctc-g.co.jp/keys/blog/detail/ai-shift-optimization https://shiftta.com/blog/ai-shift-scheduling-comparison/ |

### 9.2 研究

| 文献 | 内容 | 出典 |
| --- | --- | --- |
| SCHEDBench（2026-08） | 1,132 問・13 モデル。全モデル平均の実行可能解率 15.2%、最良 55.9%、INRC Hard 0%。制約の並び順を変えるだけで違反率が動く | https://arxiv.org/abs/2608.00991 |
| ConstraintBench（2026） | 200 問。最良で制約充足 65%。shift scheduling では休息・連勤の違反。自己申告の目的関数値が誤る | https://arxiv.org/html/2602.22465v1 |
| ZebraLogic（ICML 2025） | 探索空間 ≥ 10^10 で o1 42.5%、GPT-4o 0.5%。自己検証は 2 回目で低下 | https://arxiv.org/abs/2502.01100 |
| R-ConstraintBench（2025） | 制約の相互作用で実行可能性が崩れる（GPT-5 で実世界 0.66） | https://arxiv.org/abs/2508.15204 |
| NATURAL PLAN（2024） | カレンダー調整で最良 48.9%。自己修正で全モデルが低下 | https://arxiv.org/abs/2406.04520 |
| LLM-Modulo（2024） | 外部検証器 + 生成のループ。TravelPlanner 4.4% → 20.6%（10 回） | https://arxiv.org/abs/2402.01817 https://arxiv.org/abs/2405.20625 |
| 自己修正の限界（ICLR 2024 / 2025） | 外部の正しい検証器が無いと精度は下がる（16% → 2%）。検証器があっても頭打ち（37〜38%） | https://arxiv.org/abs/2310.01798 https://arxiv.org/abs/2402.08115 |
| VRR-Stop（2026） | 検証・修復ループは 2 回目で頂点。55% の事例で正しい案を壊す | https://arxiv.org/html/2607.17641v1 |
| Hao et al.（NAACL 2025） | TravelPlanner を LLM → Z3 で 90〜95%。修復は平均 2.22 回 | https://arxiv.org/html/2404.11891v3 |
| SDDL（2026-08）/ SMILO（2025-11） | LLM に小さな DSL / テンプレートだけ書かせると 23.7% → 55.3%、約 90% | https://arxiv.org/abs/2608.18409 https://arxiv.org/abs/2511.02364 |
| CP-WSP（2026） | CP-SAT。14 ハード + 15 ソフトを宣言。不足は `max(0, deficit)` で常に解がある | https://arxiv.org/html/2607.05177 |
| TRACE-CS / Why Not?（2024〜26） | 「なぜこの割り当てでないのか」を最小非充足集合で出し LLM は文章化 | https://arxiv.org/abs/2409.03671 https://arxiv.org/html/2603.00469 |
| OR-Tools 従業員スケジューリング | 本プランの制約族の標準的な定式化（連続・遷移・週末・要求） | https://developers.google.com/optimization/scheduling/employee_scheduling |
| Timefold「LLMs can't optimize schedules, but AI can」 | 10 人 × 1 週で 10^63。LLM は入力の構造化・ツール呼び出し・説明に | https://timefold.ai/blog/llms-cant-optimize-schedules-but-ai-can |
| Anthropic「Building effective agents」「Harness design」 | 検証は独立した評価器に。エージェントは自分の結果を過大評価する | https://www.anthropic.com/engineering/building-effective-agents https://www.anthropic.com/engineering/harness-design-long-running-apps |

### 9.3 実行環境

| 項目 | 確認結果 | 出典 |
| --- | --- | --- |
| Vercel 関数の実行時間 | Fluid compute 既定 300 秒。上限 Hobby 300 / Pro 800（GA）/ 1800（Beta、関数ごと） | https://vercel.com/docs/functions/configuring-functions/duration |
| Server Action と `maxDuration` | page の `maxDuration` がその page の Server Action 全部に効く | Next 16 docs `maxDuration.md` |
| `after()` | Server Function 内で使え、`cookies()` も呼べる。Vercel では `waitUntil` で `maxDuration` まで延命 | Next 16 docs `after.md` |
| クライアント切断 | 既定では関数は止まらない（打ち切りは `supportsCancellation` でオプトイン） | https://vercel.com/docs/functions/functions-api-reference |
| メモリ | 既定 2GB / 1 vCPU | https://vercel.com/docs/functions/limitations |
| Anthropic 料金・機能 | Opus 5 $5/$25、Sonnet 5 $2/$10、Opus 5.5 $4/$20。構造化出力は全現行モデル。ツールと併用可 | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/build-with-claude/structured-outputs |
| GPT-6 Sol / Luna | $2/$10、$0.10/$0.50。Responses API で構造化出力・`reasoning.effort`。2026-09-22 公開 | https://developers.openai.com/api/docs/models/gpt-6-sol https://developers.openai.com/api/docs/models/gpt-6-luna |
| OpenAI のデータ扱い | 学習に使わない。30 日保持。ZDR 審査制。日本レジデンシー（審査・+10%） | https://developers.openai.com/api/docs/guides/your-data https://help.openai.com/en/articles/10503543-data-residency-for-the-openai-api |
| Vercel AI Gateway | 上乗せなし、予算、代替モデル、本文を保持しない、リージョンは us / eu | https://vercel.com/docs/ai-gateway/pricing https://vercel.com/docs/ai-gateway/faq https://vercel.com/docs/ai-gateway/security-and-compliance/regional-inference https://vercel.com/docs/ai-gateway/sdks-and-apis/responses |
| `highs`（npm） | 1.15.3、MIT、4.0MB、2026-09-11 更新。MIP / `time_limit` / `mip_rel_gap` | https://github.com/lovasoa/highs-js |

---

## 10. 実装ログ

2026-09-26。§8 の順序どおり（スパイク → スキーマ → 純関数 → ソルバー → LLM → run / Actions → 評価 → UI → 手動検証）。

### 10.1 作ったもの

| 場所 | 内容 |
| --- | --- |
| `supabase/schemas/public/tables/assist_runs.sql` ほか | `assist_runs`（§5.8 のとおり）/ `shifts.assist_run_id`（複合 FK）/ `tenants.assist_notes` / enum `assist_run_status` / RPC `rollback_assist_run` |
| `supabase/tests/rls_tenant_isolation.sql` | 108 → 126 件。assist_runs の SELECT / INSERT / UPDATE / DELETE の境界、running の二重作成（23505）、期間の check、複合 FK（23503）、rollback の 自テナント / 他テナントの run / 他テナントの店舗 / running / anon |
| `src/lib/assist/` | `problem` / `validate` / `model` + `lp`（LP 形式の組み立て）/ `solver/highs` / `engine`（解く + 緩めて解き直す）/ `directives` / `reasons` / `metrics` / `weights` / `pricing` / `result`（jsonb の Zod）/ `load` / `runs` / `run` / `llm/{client,structured,interpret,explain,prompts,solveDirect}` / `testing/fixtures` |
| `src/lib/queries/assistRuns.ts` | 直近の run（点・自動の再表示・「元に戻す」の可否） |
| `src/lib/validation/assist.ts` | 指示 500 字・Action の入力 |
| `shifts/actions.ts` | `startAssist` / `rollbackAssistRun` / `acknowledgeAssistRun` |
| `shifts/_components/AssistModal.tsx` | `useAssist`（状態: ready / running / done / failed）+ モーダル。ツールバーの「AI で作成」、操作メニューの「AI の作成を元に戻す（9/26 14:56）」、セルの点（`data-marked`） |
| `scripts/assist-eval/` | `npm run assist:eval`。solver / llm-direct / 指示の例文 20 本 |
| `next.config.ts` | `serverExternalPackages: ['highs']`、`outputFileTracingIncludes['/tenants/*/shifts']` |

依存: `highs` 1.15.3、`openai` 7.23.0、`tsx`（dev。評価スクリプト用）。

### 10.2 スパイク（§8.1）の結果

- `highs` は Node で `import loadHighs from 'highs'` → `solve(lp, { time_limit, mip_rel_gap, output_flag: false })` がそのまま動く。型も通る
- `openai` の `zodTextFormat` は **Zod 4 のスキーマで通る**（nullable・判別共用体とも JSON Schema に落ち、`$parseRaw` が Zod で検証する）
- **`.nft.json`（§5.11 の未確認点）**: `/tenants/*/shifts` のキーで route group 配下のページに効く（ダミーのファイルを入れて確認）。
  ただし `serverExternalPackages` にした `highs` は、トレーサが `highs.mjs` から `highs.wasm` まで**自力で拾う**（include を外してビルドしても入る）。
  ローダーの書き方が変わったときの保険として include は残した。最終ビルドの `page.js.nft.json` に `highs/build/highs.wasm` が入っていることを確認
- Vercel preview での所要時間は未確認（デプロイしていない）

### 10.3 プランから変えたこと

1. **2 段で解く**（`solver/highs.ts`）。1 段目は不足の合計だけを `mip_rel_gap: 0` で最小化し、2 段目は「不足の合計 ≤ 1 段目の値」を足して
   公平性・指示・デフォルト・前案ペナルティを `mip_rel_gap: 0.02` で解く。1 段で解くと、不足が多い店舗では相対ギャップ 2% が
   不足 1 枠（重み 1000）より大きくなり、**埋められる枠を残したまま止まりうる**（不足 60 枠なら目的関数 ~60,000 の 2% = 1,200）。
   1 段目が Optimal なら不足の最小性が証明されるので、§5.6 の「別の枠に配置済み」の根拠もここに置いた（`shortageOptimal`）。
   2 段目が時間内に解を出せなければ 1 段目の解を使う。評価の 9 問すべてで両段とも Optimal、合計 0.2〜3.4 秒
2. **文脈期間 C = [P.start − 7, P.end + 8]**。プランの式は左端が常に P.start − 7 になる。右端はペアの着地日（P.end + 1）を含む
   連勤の窓（長さ 8）の末尾まで既存を読むため 1 日延ばした
3. **勤務日数の偏りの重み 30 → 90**（§10.5）
4. **指示の LLM 出力は判別共用体にせず平らな object**（`directives.ts`）。strict モードは全列 required なので、型ごとの必須列は TS が確かめる。
   数値の範囲も LLM のスキーマに付けない（範囲外 1 つで応答全体の parse が落ちるより、その指示だけ「条件にできませんでした」にする）
5. 指示の意味を決めたもの:
   - `same_days(A, B)` は「A が勤務する日は B も勤務」（A ⊆ B）。対称にすると先輩が新人の日にしか入れなくなる
   - 日の指定が無い「必ず〜を優先」（`prefer_pattern` / `prefer_work`）は期間の全日に効いてしまうので、強さ 5 のソフトに落とす
   - 週単位の `min_workdays` は P に丸ごと入る週だけ（端の週は P の外を動かせない）
   - `fill_first` は不足の重みへの上乗せ。不足の合計は 1 段目で決まるので「どの枠を残すか」の優先度として効く
6. **固定の問題は JSON ではなく seed から決定的に作る**（`lib/assist/testing/fixtures.ts`、mulberry32）。Vitest と評価スクリプトが同じ関数を使う
7. `engine.ts`（解く + 緩めて解き直す）・`lp.ts`・`load.ts`・`runs.ts`・`result.ts` を §5.2 に足した。`load.ts` / `runs.ts` / `run.ts` は
   クライアントを引数で受けるので、すべてのクエリに `tenant_id` を書いた（AGENTS.md に追記）
8. **書き込んだあとに失敗したら、その run の下書きを消してから failed にする**（`run.ts`）。§5.1 は「7 の前なら shifts は触っていない」までだったが、
   7 と 8 の間（run を succeeded にする UPDATE）で落ちると行だけ残り、failed の run は元に戻せない
9. 「別の案を作る」の実行前の画面は、いまの表（前の案で埋まっている）の不足では止めない。前の案の実行時の不足枠を「前の案を戻したあと」として出す
   （手動検証で見つけた。最初は不足 0 で「作成する」が押せなかった）
10. 押せないときの理由を 1 行出す（「必要人数はすべて満たされています」など。390px で灰色のボタンだけになっていた）

### 10.4 検証

| コマンド | 結果 |
| --- | --- |
| `npx supabase db reset` → `npx supabase test db` | 126 / 126 PASS |
| `npm test` | 57 files / 521 tests PASS（自動アサインは 9 files / 109 tests。HiGHS を実際に解く） |
| `npm run lint` / `npm run typecheck` / `npm run build` | 通る。`.nft.json` に `highs.wasm` |
| `npm run format:check` | **自分の変更は通るが、全体は落ちる**: HEAD の時点で `.agents/skills/interface-design/*`・`ShareModal.tsx`・`holdToToggle.test.ts`・`SimpleShell.tsx` の 5 ファイルが未整形（本マイルストーンでは触っていない） |

**ローカル DB での通し（`runAssist()` を dev ユーザーのセッション = anon + RLS で直接呼ぶ。LLM なし）**: seed の店舗に 10 月の必要人数を入れて
146 / 146 枠（ペア込み 177 行）、手で入れた確定セルは上書きされない、1 行を確定に変えてから「別の案」→ 前の案の下書きだけ消えて確定の 1 行は残る、
running の二重作成は「実行中の自動アサインがあります」、rollback で 176 行が消える。

**画面（dev サーバー + headless Chromium。`AI_GATEWAY_API_KEY` にダミーを入れてボタンを有効にし、指示なしで実行）**:

| 操作 | 結果 |
| --- | --- |
| 「AI で作成」→ 実行前 | 不足 177 枠（早番 31 · 日勤 84 · 遅番 31 · 夜勤 31）· 在籍 8 人 · 制約 4 件 |
| 作成する → 実行中 → 結果 | 段階表示（「指示を解釈（指示なし）」は済み扱い）→ `177 / 177 枠を配置しました`。説明はダミーキーの 401 で落ち、**説明無しで結果が出る**（サーバーは warn だけ） |
| 表の点 | 結果を開いている間 207 セル（ペアの明けを含む）→ 閉じると 0。再読み込みしてもモーダルは開かない |
| 操作メニュー「AI の作成を元に戻す（9/26 14:59）」 | 通知「208 件の下書きを取り消しました」、表は空に戻る |
| 「別の案を作る」→ 作成する | 前の案を戻して作り直す。閉じずに再読み込みすると結果が自動で開き直り、点も出る |
| 必要人数を増やした店舗 | `180 / 208 枠`、埋められなかった枠 28 件（「候補 8 人: 別の枠に配置済み 6 · 週上限（5日） 2」など） |
| 指示ありで実行（ダミーキー） | 「指示を解釈できませんでした。時間をおいてもう一度お試しください」「シフト表は変わっていません」。run は failed、表は変わらない |
| 390px | ツールバーの「AI で作成」はアイコンだけ、横スクロールなし。モーダルも収まる |
| コンソールエラー | なし |

### 10.5 評価（`npm run assist:eval -- --fixture all --repeat 3`、solver のみ）

重みの調整: プランの初期値（勤務日数の偏り 30）では、5 日上限の人の 1 日のずれが 6 にしかならず、土日祝（20 / 日）・パターン（10 / 回）に負けて
**偏りを入れない場合とほぼ同じ**（稼働率の σ 0.09〜0.12）だった。30 / 90 / 90 + パターン 5 / 偏りなし を 6 問で比べ、90 にすると
medium / large の σ が 0.015〜0.047 に下がり、充足は変わらず、所要時間も同じだったので 90 にした（`weights.ts`）。

| fixture | seed | engine | 充足 | 充足率 | 検証で落ちた | 稼働率 min–max (σ) | 土日祝 min–max | tokens in/out | 費用 $ | 時間 ms | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small | 1 | solver | 95/111 | 85.6% | 0 | 0.508–0.828 (0.093) | 1–4 | - | 0.0000 | solve 377 | Optimal → Optimal |
| small | 2 | solver | 99/108 | 91.7% | 0 | 0.587–0.828 (0.086) | 1–5 | - | 0.0000 | solve 374 | Optimal → Optimal |
| small | 3 | solver | 86/108 | 79.6% | 0 | 0.497–0.768 (0.09) | 1–6 | - | 0.0000 | solve 231 | Optimal → Optimal |
| medium | 1 | solver | 195/199 | 98.0% | 0 | 0.677–0.753 (0.025) | 0–5 | - | 0.0000 | solve 1180 | Optimal → Optimal |
| medium | 2 | solver | 213/218 | 97.7% | 0 | 0.753–0.813 (0.015) | 1–6 | - | 0.0000 | solve 1101 | Optimal → Optimal |
| medium | 3 | solver | 203/220 | 92.3% | 0 | 0.508–0.828 (0.091) | 1–5 | - | 0.0000 | solve 609 | Optimal → Optimal |
| large | 1 | solver | 422/422 | 100.0% | 0 | 0.723–0.768 (0.018) | 0–6 | - | 0.0000 | solve 3073 | Optimal → Optimal |
| large | 2 | solver | 405/415 | 97.6% | 0 | 0.542–0.768 (0.041) | 0–5 | - | 0.0000 | solve 2197 | Optimal → Optimal |
| large | 3 | solver | 401/417 | 96.2% | 0 | 0.542–0.768 (0.047) | 0–5 | - | 0.0000 | solve 1806 | Optimal → Optimal |

- 充足率 80〜100%。不足は fixture の作り（夜勤を毎日 1 人・週 1 日まで・選べるのは約 4 割）から来る構造的なもので、
  制約と夜勤を外した問題では「不足 = 候補数だけで決まる下限」に一致する（`model.solve.test.ts`）
- **検証で落ちた行は全問 0**（MILP と検証器の規則が一致している）
- small の σ が下がりきらないのは、平日だけ・週 3 日のパートと夜勤の人がいて取り分が構造的にずれるため
- 「別の案」: 余地のある問題では前案から 1 割以上変わる（テストで固定）。seed 店舗の通しでは 100% 変わった（全員が全パターンを選べる店舗は同点の解が多い）

### 10.6 未検証・申し送り

- ~~LLM を一度も呼べていない~~ → §10.7 で実施
- 説明（Luna）の提案に、設定では直せない言い回しが混ざる（例: 「夜勤のペア先が埋まる制約を見直し」。ペアは制約ではなく割り当ての結果）。
  `EXPLAIN_INSTRUCTIONS` に「設定画面の項目名で書く」例を足して評価し直す
- Vercel preview での `.wasm` の読み込みと所要時間（§3.2 の「10 秒以内」）は未確認。ローカルは 30 人 × 31 日で 1.8〜3.4 秒
- **規約・プライバシーポリシーへの「AI（OpenAI）に送る」旨と越境の記載（§3.5）はしていない**（リポジトリに規約のページがまだ無い）。公開前に必要
- Vercel AI Gateway の予算（$30 / 月）とモデルの代替（`anthropic/claude-sonnet-5`）の設定は運用作業（§3.11）
- 実行中は Next の Server Action が 1 本ずつ直列に処理されるので、閉じて表を触ってもアサインは実行が終わるまで待たされる。
  ツールバーは実行中は押せない（§4.1）。30 秒を超える運用になったら §3.4 の条件でジョブ基盤へ移す
- AGENTS.md の「本番に初回 push（マイルストーン 013）」の繰り下げ（→ 014）は冒頭の注記どおり 013 / 014 の実装時に直す

### 10.7 LLM を含む評価（2026-09-26、`AI_GATEWAY_API_KEY` を設定して実施）

**指示の解釈（`npm run assist:eval -- --interpret`、`openai/gpt-6-sol`・effort medium）: 20 / 20**（全 20 本で $0.053）。
初回は 19 / 20 だったが、外れた 1 本（「水上さんは土日少なめ」→ 土日の `prefer_off`（ソフト））は日数の無い「少なめ」の読みとして妥当で、
`limit_weekends` だけを正解にしていた期待値の誤りだった。読みが 2 通りある例は型を配列で書けるようにした（`instructions.ts`）。
強さ・ハードの判断（「必ず」「NG」「しないで」→ hard、「なるべく」→ 2、「できるだけ埋めて」→ `fill_first`）、名前の揺れ（「平岡くん」）、
一覧に無い人（「佐藤さん」）・条件にできない文（「元気がない人の負荷を軽く」「いつもありがとう」）の除外もすべて期待どおり。
**§3.3 のモデルは GPT-6 Sol（解釈）/ Luna（説明）で確定**としてよい。Claude との比較は、Sol で正解率・費用とも十分なので行っていない。

**通し（指示 3 文 + 解く + 説明、`--fixture all --instructions … --explain`）:**

| fixture | 充足 | 稼働率 σ | tokens in/out | 費用 | 解釈 / 解く / 説明 (ms) |
| --- | --- | --- | --- | --- | --- |
| small | 90/111 | 0.096 | 2968/611 | $0.0039 | 3554 / 266 / 3045 |
| medium | 190/199 | 0.05 | 2887/583 | $0.0048 | 4364 / 900 / 2426 |
| large | 418/422 | 0.036 | 3003/695 | $0.0053 | 5154 / 2663 / 3134 |

1 実行 **$0.004〜0.005（¥0.6〜0.8）/ 7〜11 秒**。§5.9 の見積もり（¥4〜9 / 5〜30 秒）より費用は 1 桁安い（推論トークンが見積もりより少ない）。
指示なしなら説明の 1 回だけ（〜$0.001）。説明は数字を入力のとおりに書き、捏造は見られなかった（3 規模とも）。

**画面から（実キー・seed 店舗・指示 3 文）**: 押してから結果まで 9.6 秒。`180 / 208 枠`、指示の解釈は
「青木 隆行 → 土日の勤務を優先（できれば） 9日中 9日」「川田 真里奈 → 玉井 周平と同じ日に（必ず）」「「元気がない人の負荷を軽くしてあげて」は条件にできませんでした」、
AI のコメントと提案 2 件が出る。

**案 A（LLM 直接 + 検証器、`--engine llm-direct`、GPT-6 Sol・effort high・最大 3 往復）との比較（small seed 1）:**

| engine | 充足 | 稼働率 σ | 費用 | 時間 |
| --- | --- | --- | --- | --- |
| solver（案 B） | 95/111 | 0.093 | $0（LLM なし） | 0.4 秒 |
| llm-direct（案 A） | 89/111 | 0.201 | $0.375（¥56） | 6 分 7 秒 |

案 A は 3 往復しても検証で落ちる行が残り（数字は検証を通った行だけ）、充足・公平性とも下回り、費用は約 90 倍・時間は約 900 倍。
medium / large は 1 回 $1 以上・10 分以上かかる見込みで結論が変わらないので回していない。**§3.1 の決定 B を数字でも確認した。**
案 A の呼び出しは 60 秒の既定タイムアウトでは終わらなかったので、`callStructured` に呼び出しごとの `request`（タイムアウト・再試行）を足し、
評価の案 A だけ 10 分・再試行なしにした（本番の解釈・説明は 60 秒・再試行 2 回のまま）。

## 11. 結果画面の作り直し（2026-09-26。デザイン案 B2）

結果のモーダル（§4.4）が読まれていなかった。埋まらなかった枠を 1 行ずつ文章で並べ、LLM のコメントは数字の繰り返しと
「〜を見直してください」の一般論だった。デザイン案（Artifact「AIシフト作成 結果画面の案」の B2 / スマホ ①〜③）に沿って作り直す。

### 11.1 決めたこと

1. **結果はモーダルではなく、表の横のパネル**（PC）/ **下からのシート**（スマホ。しまうと下端のバーに残る）。
   実行前・実行中・失敗は今のモーダルのまま。結果が出たらモーダルを閉じてパネルを開く
2. **埋まらなかった枠は「パターン × 日」の小さな表**（数字は足りない人数）。見えるのは 14 日分で、残りは横スクロール。押しても何も起きない
3. **LLM のコメント（`llm/explain.ts`）をやめる。** 代わりに「効く一手」を TS が出す: 条件を 1 つずつ緩めて解き直し、
   **何枠増えるか（+N 枠）が付けられたものだけ、上位 2 件**。どれにも当たらない「人が足りない日」は 1 行にまとめる
4. 一手を選ぶと、その一手で埋まるセルを**表に点線（+早番）**で出し、小さな表の該当マスに緑の枠を付ける。
   一手を選んでいる間は**表のほかのセル（と点線の無い行のスタッフ名）を薄くし**、点線のセル（2px・淡い塗り）だけを浮かせる。
   **表の下の「配置 / 必要人数」は、人数が変わる日だけ「3/5（打ち消し線）→ 4/5」**にする（どの日が良くなるかを列で拾える）。
   点滅（ずっと / 一度だけ）・「追加」の印・パネルからの移動ボタンも描いて比べ、この組み合わせにした（Artifact の「効く一手の点線の見せ方」）
5. **指示の一手は「この指示を外して作り直す」で実行できる。** 制約の一手は店舗の設定を変えることになるので「制約を開く」だけ

### 11.2 効く一手（`lib/assist/levers.ts`）

- **試算は「今の案を残したまま、空いた枠をどれだけ足せるか」**（増分）。保存した計画を既存シフトとして問題を組み直し
  （`buildProblem({ ...input, shifts: [...input.shifts, ...saved] })`）、1 つの条件だけ緩めて解く。
  全体を解き直すと、ほかのセルの入れ替わりまで起きて「+N」と点線が実行後の表と合わなくなる。増分なら試算の行がそのまま実行の結果になる
- 候補（多くても 5 件）:
  - **ハードな指示**（「必ず」）を外す。緩めて解き直した実行（`relaxed`）では、ソフトになった指示は不足の数に効かない（1 段目は不足だけを最小化する）ので候補にしない
  - **制約**（restrictions）: 週の上限・連勤は日数を 1 増やす、翌日の組み合わせ・土日のどちらか休みは外す。**理由の集計（breakdown）に名前が出た制約だけ**
- 試算の問題は残りの枠だけなので小さい（1 件あたり 1 段目 + 2 段目、上限 2 秒。一手の実行も同じ上限で解く）
- **「+N 枠」は今の案を変えずに足せる数**。同じ日に 2 枠空いていても 1 人は 1 枠しか埋められないので、
  ほかの人を動かせば埋まる枠は数えない（全体を解き直した数より少なく出ることがある）。点線と実行後の表を一致させるための割り切り
- 結果の jsonb に `levers: { kind, label, action, relaxedTo, directiveIndex, gain, byPattern, rows }[]`（上位 2 件）を持つ。`rows` が点線のセル
- 試算に失敗しても run は成功のまま（一手が出ないだけ）
- 「人が足りない日」は理由の集計から出す（候補が全員「別の枠に配置済み」の枠の日。`understaffedDates()`）

### 11.3 「この指示を外して作り直す」（`applyAssistLever`）

1. 確認ダイアログ
2. 前の run の、いま残っている下書きを読む（= 残す行）。**前の run は元に戻さない**
3. いまの表（前の下書きを含む）で問題を組み、前の run の指示からその 1 件を外して解く（LLM は呼ばない）。
   試算は「前の実行の表 + 保存した計画」で組んだので、表が変わっていなければ**同じ LP になり、同じ解が出る**。
   上限に届いたときの解は上限で変わるので、**時間の上限も試算と同じ 2 秒にする**
4. 新しい行を新しい run として保存し、run を succeeded にしてから、**前の run の下書きの `assist_run_id` を新しい run に付け替える**
   （前の run は acknowledged にする）。「元に戻す」は両方を消す（表は最初の実行の前に戻る）。
   分母（137）と理由は「残す行を除いた表」で数えるので、最初の実行と同じ数字になる。
   元に戻してから作り直す（「別の案」と同じ）方式にしないのは、途中で失敗すると前の下書きまで消えるため
5. 新しい run の指示の本文からは、外した指示の原文（解釈の `text`）を取り除く（見つからなければ本文はそのまま）。
   run の `request` に指示・解釈・外した指示の添字（`disabledDirectives`）を保存し、解釈の一覧では「外した」と出す
6. 「別の案を作る」は、指示の本文が前の run と同じなら**前の run の指示をそのまま使う**（LLM を呼ばない。外した指示が戻らない）。
   本文を変えたら今までどおり解釈し直す
7. 店舗の既定の指示（`tenants.assist_notes`）は変えない。1 日の回数には数える

### 11.4 スコープ外

- 表のフッターをパターンごとの行に分ける（デザイン案の表の見た目）。小さな表で足りるので見送る
- スタッフの設定（選択できるパターン・勤務できる曜日・週の上限）を一手にすること。1 つの設定に絞れない

### 11.5 実装ログ（2026-09-26）

| 場所 | 内容 |
| --- | --- |
| `src/lib/assist/levers.ts` | `leverCandidates()`（純関数）/ `whatIfBase()` / `evaluateLevers()`。上位 2 件 |
| `src/lib/assist/instructions.ts` | `removeInstructionSpan()`（外した指示の原文を本文から取り除く） |
| `src/lib/assist/reasons.ts` | `understaffedDates()`（人が足りない日） |
| `src/lib/assist/run.ts` | `directives`（前の run の指示をそのまま使う）/ `keep`（前の下書きを残して解き、最後に付け替える `moveDrafts`）/ 試算。LLM の説明を削除。`request` に解釈と `disabledDirectives` を保存 |
| `src/lib/assist/runs.ts` | `loadPreviousPlan` → `loadPreviousRun`（結果・指示）/ `loadRunDrafts` |
| `src/lib/assist/result.ts` | `levers` / `assistRequestSchema` / 解釈の `removed`。`summary` / `advice` を削除（古い run の jsonb は Zod が読み飛ばす） |
| `shifts/actions.ts` | `applyAssistLever`。`startAssist` は本文が前の案と同じなら前の指示を使う |
| `shifts/_components/AssistPanel.tsx` | 結果のパネル（PC）/ シート + 下端のバー（スマホ、`max-width: 48em`）/ 小さな表 / 効く一手 |
| `shifts/_components/AssistModal.tsx` | `useAssist` に結果（`result`）・選んだ一手・シートの開閉・`applyLever` を足し、モーダルから結果の画面を外した。実行中の最後の段階は「改善案を試算」 |
| `ShiftCell` / `CalendarTable` / `cellStyle.ts` | 点線のセル（`data-ghost`、`ghostStyle()`） |
| 削除 | `llm/explain.ts`、`EXPLAIN_INSTRUCTIONS`、`ASSIST_EXPLAIN_MODEL`、評価の `--explain`（→ `--levers`） |

**プランから変えたこと**

1. **一手の実行は「元に戻してから作り直す」ではなく、前の下書きを残したまま足して最後に付け替える**（§11.3 を書き直した）。
   元に戻してから解くと、途中で失敗したときに前の下書きまで消える（「別の案」は今もそう）。付け替えは run を succeeded にしたあとに置き、
   失敗しても例外にしない（表は正しく、前の下書きが前の run に残るだけ）
2. 試算の行へのボーナス（`preferPlan`）はやめた。試算と実行は同じ LP になる（表の行の並びは結果に効かない）ので要らない。
   手動の通しで、実行後の表が点線と一致することを確認した
3. 試算は増分なので、**全体を解き直せば埋まる枠より少なく出ることがある**（同じ日に 2 枠空いていても、1 人は 1 枠しか埋められない。
   全体を解き直せば、ほかの人を動かして 2 枠とも埋まることがある）。「今の案を変えずに足せる数」と割り切った。Vitest に理由を書いた

**検証**

| コマンド | 結果 |
| --- | --- |
| `npm test` | 59 files / 536 tests PASS（追加: `levers` 7・`instructions` 4・`understaffedDates` 1・パネルの純関数 3） |
| `npm run lint` / `npm run typecheck` / `npm run build` | 通る。`.nft.json` に `highs.wasm` |
| `npm run assist:eval -- --fixture all --levers` | 試算は 1〜23 ms（small「夜勤 は1週間に 1日 まで」+5・medium「土日のどちらかは休み」+4・large は不足 0） |

**画面（seed 店舗の 10 月、実キー、headless Chromium）**:

| 操作 | 結果 |
| --- | --- |
| 指示「青木さんは今月入れない。」で作成 | 4.7 秒。モーダルが閉じてパネルが開く。`114 / 146 枠`、小さな表（14 日分・横スクロール）、効く一手 2 件（「青木 隆行 → 期間中 0日まで（必ず）」+17・「早番 は1週間に 2日 まで」を 3 日に +4） |
| 一手を選ぶ | 青木さんの行に点線 22 セル（ペアの明けを含む）、小さな表の該当マスに緑の枠 |
| この指示を外して作り直す → 確認 | 0.4 秒。`131 / 146`（+17）。**青木さんの行が点線どおりに入った**。前の run の下書き 0 行・確認済み、新しい run 159 行。本文は空になり、解釈は「（外しました）」 |
| 別の案を作る（本文はそのまま） | LLM を呼ばずに前の指示を使い、外した指示は戻らない（`136 / 146`、`disabledDirectives: [0]`） |
| 元に戻す | 通知「… 件の下書きを取り消しました」、パネルが閉じ、10 月の表は実行前（1 行）に戻る |
| 390px | 下からのシート（85%）。しまうと下端に「AI の結果 131 / 146 枠 · 15 枠が未配置」。一手を押すとシートがしまって表に点線、下端に一手と「制約を開く」 |

**申し送り**

- dev サーバー（`next dev`）で、編集を重ねたあとシフト表の最初の描画が「MantineProvider was not found」（`AppShell`）の 500 になることがあった。
  `npm run build` + `next start` では 12 月（結果なし）・10 月（結果あり）・9 月（§11 より前の結果）とも再現しない。dev の再起動で消える見込み
- §11 より前の run（`summary` / `advice` を持つ）はパネルに一手が出ないだけで開ける（9 月の未確認の run で確認）

### 11.6 レビューでの修正（2026-09-26）

実装をプランと突き合わせて見つけたもの。

1. **期間を移っても結果のパネルが前の期間のまま残った。** 結果を `useState(pending)` の初期値でしか読んでおらず、
   期間の移動（nuqs、同じページのまま再描画）で `ShiftsClient` が作り直されないため。移動先の未確認の結果も開かなかった（§4.5 に反する）。
   → サーバーの「未確認の run の id」が変わったら結果を差し替える（`useAssist`。描画中に前回の id と比べる）。
   モーダルだったころも同じ作りだったが、閉じていれば見えなかった
2. **一手を選んだまま表を編集すると、そのたびに最初の点線まで表がスクロールした。** 点線のセルが `shifts` から作られ、
   スクロールの effect がそれに依存していたため。→ 一手を選んだときだけスクロールする
3. **試算（2 秒）と一手の実行（既定の 5 秒）で時間の上限が違った。** 上限に届かなければ同じ解だが、届くと点線とずれうる。
   → 一手の実行も `WHAT_IF_TIME_LIMIT` で解く（§11.2 / §11.3 に追記）


検証: `npm test`（59 files / 536 tests）・lint・typecheck・build が通る。本番ビルドの画面で、9 月（未確認の run あり）→ 10 月でパネルが消え、
9 月に戻るとまた開くことを確認。2 は画面では確かめていない（ローカルの実行回数が上限を超えていたため）。effect が依存するのは
選んだ一手のオブジェクトだけで、アサインの `refresh()` では run の id が変わらず結果も差し替わらないので、編集では動かない

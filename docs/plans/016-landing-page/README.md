# 016: LP（トップページ）

`/` の仮の LP（002 で置いた「タイトル + ログインボタン」）を本実装に置き換える。

デザイン案は Artifact「assift LP 案A 作業台」（https://claude.ai/artifact/83KYVC3DY8QABJ3UoJK6rM ）。
3 案の比較 → 方向性の議論（参考: STORES）→ 案A のブラッシュアップ → 文言の見直しを経て、v21 以降を見た目と文言の正とする。
**Artifact と本プランが食い違うときは本プランを優先する**（Artifact は単一の HTML なので、色の値や部品の作りはアプリの規約に合わせて置き換える。§4）。

> 番号: 001 §6 では LP などの静的ページを 011 としていたが、011 はシフト表のリデザインに使われた。
> 本プランを 016 とし、データ移行・カットオーバーはその後ろに繰り下げる。
> AGENTS.md の「本番は 016 で設定する」は番号を外して「カットオーバーで設定する」に直す。

**状態: 実装済み（確認待ち。2026-10-06）。実装ログは §6。**

---

## 1. 目的と完了条件

### 目的

- 初めて来た店長が、**最初の画面で「何ができて、自分の手間がどう減るか」を掴み**、そのまま無料登録に進める
- 説明より先に**本物のシフト表に触れてもらう**（デモデータ。保存しない）。アプリと同じ部品で描くので、見た目が実物とずれない
- 情報は必要なだけ。白黒を基本にし、色はシフト表のマス（パターン色）からだけ持ってくる

### 完了条件

- 未ログインで `/` を開くと LP が出る。ログイン済みなら `/tenants` へ redirect する（005 §申し送り）
- ヒーロー: 見出し「シフト表づくりに、／もう時間はかけない。」は**どの画面幅でも 2 行**。サブコピー・CTA・マイクロコピー
- 触れるデモ: 来週（月〜日）× 7 人の表。マスを押すとアプリと同じポップオーバー（下書き / 確定・パターン）、長押しで下書き⇔確定、
  「AIで作成」で不足の枠が順に埋まり結果が出る、「元に戻す」「すべて確定」「共有」。フッターに配置 / 必要人数（不足は赤）
- できること（4 枚）・スタッフの画面・はじめ方（3 ステップ）・料金（計算スライダー）・よくある質問（5 問）・最後の CTA・フッター
- 見出しは文節の途中で折り返さない（§4.4）。和文と英数字の間に空白を入れない
- 360 / 390 / 768 / 1024 / 1280px で横にはみ出さない
- ルートの 404 の導線を `/` に変える（009 §7.1 の申し送り）
- `npm run format:check` / `lint` / `typecheck` / `test` / `build` が通る

---

## 2. 決めたこと（デザインの議論から）

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| トーン | 白黒が基本。少しポップ、派手ではない（参考: STORES） | 3 案比較の後、ユーザーの選択 |
| 色 | ページの chrome は黒・白・薄いグレー。色を持つのはシフト表のマス（早番の橙・遅番の藍・有給の緑）だけ | 製品の色がそのままアクセントになる。色を増やさない（theme.ts の方針と同じ） |
| ポップさ | マスを小さな「スタンプ」として少し傾けて配る（ヒーロー右・スタッフの画面の図・最後の CTA） | 製品の中にある要素だけで遊ぶ |
| 書体 | 見出し・本文とも Zen Kaku Gothic New（角ゴシック。見出しは 900） | 丸ゴシックはポップ過ぎた（ユーザー指摘） |
| 面 | 大きな角丸（28px / 18px）の薄いグレー。ボタンは黒いピル。黒い面は最後の CTA だけ | |
| 見出し | 常体（「〜できる」「〜使える」）。料金だけ「10人までは、無料で使えます」 | ユーザー指定 |
| 和欧間 | 空白を入れない（AIで作成 / URLで送る / 10人） | ユーザー指定。製品側の表記の統一は別件 |
| 導入実績・v1 向けの案内 | 載せない | ユーザー指定 |
| 料金 | 10 人まで 0 円、11 人目から 1 人あたり月 100 円 | ユーザー指定（v1 の 5 人ごと 250 円から変更） |
| ロゴ | 4 マス（早番の橙・遅番の藍・グレー・有給の緑）+ 「assift」 | ロゴ色見本（https://claude.ai/artifact/WT1BP2K3cCXZvc5b9ttm3S ）の 1。グレーは #D4D5D9 相当 |

### 2.1 文言（確定）

| 場所 | 文言 |
| --- | --- |
| ヒーロー見出し | シフト表づくりに、／もう時間はかけない。 |
| サブコピー | スタッフの都合や勤務の上限を守って、AIが下書きを作ります。／あとは内容を確認して、URLで送るだけ。 |
| CTA | 無料ではじめる（マイクロコピー: スタッフ10人まで無料・クレジットカード不要） |
| デモ | 札「さわって試せます」、下に右寄せで「デモ用のデータです。保存されません」 |
| できること | 見出し「シフト表が早く作れる、／4つのしくみ」。カード: 下書きのまま置いておける / 足りない日がすぐ分かる / 組み合わせはAIが考える / URLを送るだけで共有できる |
| スタッフの画面 | 見出し「スタッフは、／リンクを開くだけ」。アプリも登録も要りません / いつ開いても最新の表 / リンクには公開期限があります |
| はじめ方 | 見出し「3ステップで、すぐ使える」。説明「ひな形を選んで、スタッフの名前を貼るだけ。登録したその日から、シフト表を作れます。」。業種を選ぶ / 勤務パターンを確かめる / スタッフの名前を貼り付ける |
| 料金 | 見出し「10人までは、無料で使えます」。0円・11人目からは1人100円／月・計算スライダー |
| よくある質問 | 見出し「使う前に気になること」。5 問（スタッフのアカウント / スマホだけで / AIが勝手に確定 / 夜勤明け / 複数店舗） |
| 最後の CTA | 来月のシフト表から、／assiftで。 |

**事実確認したこと**: 共有ページには下書きも出る（009）ので「確定だけが見える」とは書かない。
AI は人を増やせないので「足りない枠を AI が埋める」とは書かない（埋まらない枠は理由つきで残る。012）。
ボタン名は製品と同じ「AIで作成」。

---

## 3. 構成

```
src/app/
  page.tsx                                   削除（(public)/(site)/page.tsx へ）
  not-found.tsx                              導線を「トップへ戻る」（/）に
  (public)/
    share/[code]/                            変更なし（LP のヘッダ / フッタを被せない。009 §7.1）
    (site)/
      layout.tsx                             フォント（next/font）+ ヘッダー + フッター
      page.tsx                               ログイン済みなら /tenants。来週の日付と祝日を組んでデモへ
      Site.module.css                        LP の面・スタンプ・見出しの組み（Mantine に無いものだけ）
      _components/
        SiteHeader.tsx / SiteFooter.tsx / Logo.tsx
        Stamp.tsx                            スタンプ（cellStyle を使う）
        ShiftDemo.tsx                        'use client'。触れるデモ
        PriceCalculator.tsx                  'use client'。Slider
        （各セクション）
      _lib/
        demoData.ts                          デモの店（パターン・スタッフ・初期シフト・必要人数）
        demoAssist.ts (+test)                デモ用の割り当て（貪欲）
        demoWeek.ts (+test)                  来週の月曜
src/components/shiftTable/
  ShiftCell.tsx / PatternPopover.tsx(+css) / holdToToggle.ts(+test)
                                             shifts/_components・_lib から移す（LP のデモと共有するため）
src/lib/billing/pricing.ts (+test)           月額の計算（10 人まで 0 円、超えた分 × 100 円）
```

### 3.1 なぜ `(public)/(site)/` か

009 §7.1 の申し送りどおり。公開シフト表（`/share/[code]`）は AppShell 無しの全画面テーブルで、LP のヘッダ / フッタが付くと
縦の高さ計算（`.page` の 100dvh）が崩れる。LP 側を入れ子のグループに寄せ、後で足す静的ページ（規約・プライバシーなど）も同じ layout に入れる。

### 3.2 ログイン済みの redirect

`page.tsx` で `getAuthUser()` → `redirect('/tenants')`。proxy には足さない（proxy は 3 段の合成にとどめる。AGENTS.md）。
cookie を読むので `/` は動的になる。デモの「来週」も描画時に決まるので、静的にする利点は無い。

### 3.3 デモはアプリの部品で描く

- 表は `ShiftTable.module.css` の `.table` / `.dateHead` / `.cell` / `.footRow`、セルは `ShiftCell`、ポップオーバーは `PatternPopover`、
  見出しは `DateHeaderCell` / `dateToneClass`、凡例は `PatternDescriptionList`
- 状態は `ShiftMap` / `applyAssign`（アサインの規則）/ `assignedCounts` + `coverageAt`（充足）。AI で入ったマスは `marked`（左上の点。012 §3.8）
- 列幅だけ LP 用に広げる（コンテナクエリで 7 列を枠いっぱいに。最小はアプリと同じ 56px）
- **AI はデモ用の貪欲法**（実物はソルバー。012）。守る条件: 出られない曜日・週の上限・遅番の翌日に早番を入れない・5 連勤しない。
  結果は「19 / 20枠を下書きで配置しました。」「◯/◯（◯）遅番1枠は、条件に合うスタッフがいません」
- 日付は**来週の月〜日**（JST）。祝日はサーバーで `holidaysIn()` して渡す（クライアントに祝日データを送らない。AGENTS.md）

`ShiftCell` / `PatternPopover` / `holdToToggle` は今 `shifts/_components`・`_lib`（ルート専用）にある。LP からルート専用の部品を import しないため、
`src/components/shiftTable/` へ移す（中身は変えない。`CalendarTable` の import だけ直す）。

---

## 4. 実装の規約との対応

### 4.1 色

Artifact の hex は Mantine の変数に置き換える（theme.ts に集約する方針）。

| Artifact | アプリ |
| --- | --- |
| 墨 #121214 / ボタン | `var(--mantine-color-dark-9)` 相当。ボタンは `color="dark"`（theme の既定） |
| 薄いグレーの面 #f3f3f4 | `var(--mantine-color-gray-1)` |
| 本文の灰 #5d5f66 | `var(--mantine-color-dimmed)` |
| ロゴのグレー #d4d5d9 | `var(--mantine-color-gray-4)` |
| 不足の赤 / 充足の緑 | `red-9` / `green-9`（シフト表のフッターと同じ） |
| パターン色 | `PATTERN_COLORS` から引き、`cellStyle()` で塗る |

### 4.2 書体

`next/font/google` の `Zen_Kaku_Gothic_New`（weight 400 / 500 / 700 / 900、`subsets: ['latin']`、`variable: '--font-site'`）を
`(site)/layout.tsx` だけで読む。アプリの他の画面は今のシステムフォントのまま。デモの表はアプリと同じシステムフォントで描く（実物と同じ見た目）。

### 4.3 Mantine と CSS Modules

レイアウト・ボタン・Accordion（FAQ）・Slider（料金）は Mantine。スタンプの傾き・トレー・カードの角丸・スマホの枠・
2 行固定の見出し・文節の折り返しは Mantine に無いので `Site.module.css` に書く。Server の page では Mantine のドット記法を使わない。

### 4.4 見出しの折り返し

`word-break: auto-phrase` は Chrome だけなので使わない。見出しは文節ごとに `display: inline-block` の span に分け、
切れ目でだけ折り返す。ヒーローは 2 行を `display: block; white-space: nowrap` にし、文字の大きさを画面幅から決める
（長い方の行が 10 文字）。

---

## 5. 範囲外

- 利用規約・プライバシーポリシー・特商法・お問い合わせのページ（フッターは既存の `/terms` `/privacy` へのリンクだけ。
  サインアップ画面が既に同じリンクを張っている）
- OGP 画像・favicon の差し替え
- 製品側の和欧間の表記の統一（「AI で作成」など）
- LP のダークモード（アプリは `defaultColorScheme="light"`）

---

## 6. 実装ログ

### 6.1 やったこと

| 対象 | 内容 |
| --- | --- |
| `src/app/page.tsx` | 削除（仮の LP） |
| `(public)/(site)/layout.tsx` | `Zen_Kaku_Gothic_New`（400 / 500 / 700 / 900）を `--font-site` で読み、ヘッダー + フッターで包む |
| `(public)/(site)/page.tsx` | `getAuthUser()` → `/tenants` へ redirect。`dateRange('week', 1, demoWeekStart(todayJst()))` と `holidaysIn()` でデモの週を組む |
| `(public)/(site)/_components/` | Hero / DemoSection + ShiftDemo / Features / StaffView / SetupSteps / Pricing + PriceCalculator / Faq / FinalCta / SiteHeader / SiteFooter / Logo / Stamp / Phrases / SectionHeading |
| `(public)/(site)/_lib/` | `demoData`（デモの店）/ `demoAssist`（貪欲法。+test）/ `demoWeek`（来週の月曜。+test） |
| `src/lib/billing/pricing.ts` | `FREE_STAFF_LIMIT` / `PRICE_PER_STAFF_YEN` / `monthlyPriceYen()`（+test） |
| `src/components/shiftTable/` | `ShiftCell` / `PatternPopover`（+css）/ `holdToToggle`（+test）を `shifts/_components`・`_lib` から移した。中身は import の相対パスだけ変更。`CalendarTable` の import を直した |
| `src/app/not-found.tsx` | 「店舗へ戻る」（`/tenants`）→「トップへ戻る」（`/`）。未ログインは LP、ログイン済みは LP の redirect で店舗へ |
| `AGENTS.md` | ディレクトリ表（`(site)`・`shiftTable` の中身・`billing`）、「本番は 016 で設定する」→「カットオーバーで設定する」 |

### 6.2 Artifact から変えたところ

- **色は Mantine の変数に置き換えた**（§4.1）。ボタンは theme の既定（`color="dark"`）、黒い面は `dark-8`、ロゴのグレーは `gray-4`
- **デモはアプリの部品で描き直した**。ツールバーの期間は `formatPeriodTitle`（`10/12 〜 10/18`）、フッターは「配置 / 必要人数」、
  スタッフ名の勤務日数はアプリと同じバッジ、AI で入ったマスは左上の点（012 §3.8）。凡例の「淡い色 = 下書き／濃い色 = 確定」の 1 行は
  アプリに無いので外した（「できること」の 1 枚目が同じことを説明している）
- **デモの週は描画した日の「来週」**（Artifact は 2026/10/12 固定）。スマホの画面の例もデモの週の木〜日を出す。
  「組み合わせはAIが考える」の図は日付を書かず「日曜の遅番1枠は…」にした（週によって日付が変わるため）
- **フッターのリンクは利用規約・プライバシーだけ**（特商法・お問い合わせは静的ページのマイルストーンで。§5）

### 6.3 検証

| 項目 | 結果 |
| --- | --- |
| `npm run lint` | エラー 0（警告 1 は既存の `reasons.test.ts`） |
| `npm run typecheck` | 通過 |
| `npm test` | 73 ファイル / 709 件通過（追加: `pricing` 3 件・`demoWeek` 4 件・`demoAssist` 3 件。`holdToToggle` は移動） |
| `npm run format:check` | 今回の変更は通過。今回触っていない既存の未整形 5 ファイル（`.agents` の 2 つ・`AssistPanel.module.css`・`ShareModal.tsx`・`SimpleShell.tsx`）が残る |
| `npm run build` | 通過。`/` は動的（cookie を読むため） |
| 画面（ローカルの Supabase + dev） | 1280 / 390px で横にはみ出さない。「AIで作成」→ 19 / 20 枠、10/18（日）遅番 1 枠が残る（2026/10/6 時点の来週）。マスを押すとアプリと同じポップオーバー。コンソールエラー無し |
| ログイン済みで `/` | `/tenants/<id>/shifts` へ送られる |
| 既存のシフト表 | 移した `ShiftCell` / `PatternPopover` でセルのポップオーバーが開く |
| `npx supabase test db` | スキーマは触っていないので未実行 |

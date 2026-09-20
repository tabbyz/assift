# assift interface

シフト表の作業台。店長が次の期間を埋めて固めて渡す。華やかさより一覧性と操作効率。

## Direction

- Feel: 壁のシフト表 + 鉛筆とインク。紙の作業台。Linear 的な密度。カード型 SaaS ではない
- Depth: **fills-and-gaps**。表の骨格は 3 本の線（ヘッダー下 / 名前列の右 / フッター上）だけで、マスの区切りはセル間の 3px の白。影はポップオーバー / モーダルだけ（Mantine 既定）
- Spacing base: **4px**。chrome は 8、セル間の白は 3、セクション間は 16
- Radius: chrome は `defaultRadius: 'sm'`（4px。`src/theme.ts` の 1 行で動く）。**表の中は別の層**で、セル 3px・勤務日数バッジ 5px
- Type: システム日本語（theme の fontFamily）。セルは 13px。日付の数字は 17px/700。充足と件数は `tabular-nums`
- Hierarchy: 表が焦点。chrome は線とウェイト。色はパターン（ユーザー）と不足（赤）と土日祝だけ
- Palette: 保存済みのパターン色（Material 20 色）から **tint（淡塗り）/ ink（文字）を導出**する（`lib/patterns/colors.ts`）。DB のパレットは触らない
- 状態がよい色は green（公開中、充足、成功通知）。chrome には使わない。色を省略した Button（保存・登録）は dark fill。副操作は `variant="default"`
- Signature: セルがスタンプ（**下書き = 淡塗り、確定 = ベタ塗り**）。穴は表の下の充足行（`2/6` が穴）

## Surfaces

- Canvas / 表: `--mantine-color-body`（空の担当可）。担当不可: 45° の斜線ハッチ（`gray-3` / `gray-0`）
- AppShell ヘッダー（店舗）: `--mantine-color-body`。下は Mantine 既定の 1px `gray-3`
- 期間ツールバー: `--mantine-color-gray-0`。日付ヘッダー・充足フッターと同じ面。店舗（白）と表の枠（gray-0）のあいだに段差を 1 つ置く
- Header / sticky 日付: `--mantine-color-gray-0`。日曜・祝日は `red-0`、土曜は `blue-0`（**土日祝の面を塗るのはヘッダーだけ**。本文は白のままにしてパターン色と競合させない）
- Footer / sticky 充足: `--mantine-color-gray-0`
- 罫線: ヘッダー下・名前列の右・フッター上が `--mantine-color-gray-5`、ヘッダー内の縦罫が `--mantine-color-default-border`。**本文には引かない**（週の区切り線も無し）
- 不足: `--mantine-color-red-9` / 充足: `--mantine-color-green-9`
- 日曜・祝日: `--mantine-color-red-8` / 土曜: `--mantine-color-blue-8`（カレンダー言語。「祝」とは書かない）
- 今日: 数字の直下に 24×3px のカプセル（`--mantine-color-gray-7`）。2 桁のインク（約 20px）に丸い端を足した幅。曜日と数字の箱のあいだは 1px、数字の下は 3px（線は一番下。インクから約 2px）。メモは数字の直下に寄せ、下の罫線との間は 5px。全列同じ余白なので隣の日付は下がらない。数字の色は変えない
- 確定セルの文字: 輝度 > 0.55 は `#1C1917`、それ以外は `#FFFFFF`。白パターンは継承

## Density

| 要素                                  | 値                                   |
| ------------------------------------- | ------------------------------------ |
| AppShell header                       | 48px                                 |
| AppShell padding（店舗配下）          | 0（表が端まで。chrome は 8px inset） |
| 名前列                                | 132px                                |
| 日付列                                | 56px                                 |
| 日付ヘッダー（今日バー+曜日+日+メモ） | ~63px sticky                         |
| 充足フッター                          | 31px sticky（下端）                  |
| シフトセル高さ / 行の高さ             | 35px / 38px（セル間の白は 3px）      |
| コントロール                          | compact-sm / 28–32px                 |

## Navigation

ヘッダーに常設の行き先は右の `設定` だけ（文字。歯車にしない）。スタッフ一覧へ入る。表へ戻るのは設定ナビの `シフト表へ`。設定内は頻度順: スタッフ → 勤務パターン、線の下に自動アサイン制約 → 店舗情報（末尾）。左ナビは戻り `シフト表へ`（矢印・dimmed）、その下に見出し `設定`。設定項目は NavLink。期間はページタイトル（`2026年9月` / `9月 前半` / `9/14 〜 9/20`）。

ツールバーの可視動詞: `共有` と `操作`。どちらも `default` compact-sm で、左に 16px のアイコン（共有は外へ出す矢印、操作はレンチ）。`操作` の中身は頻度順: 一括 → デフォルトセット → コピー（末尾）。集計は表の左上（名前列ヘッダー、`default` compact-sm）。「スタッフ」列見出しは出さない（a11y 名だけ残す）。

## Component patterns

- Date column header — 曜日 10px/700 muted · 日 17px/700 · メモ 10px（**メモがある日だけ文字。空の日のペンはホバー時だけ**）。列内は中央揃え。**セル全体が 1 つのボタンで、押すと日付メモ**（必要人数はフッターから開く）
- Coverage footer — 表の下に 1 行。名前列に `配置 / 必要人数`（11px dimmed 右寄せ）、各列に `2/6` 11.5px tabular（不足は red-9/700、充足は green-9/600）。0/0 の日は出さない。**必要人数を開く唯一の入口**
- Staff header — ラベルなし。保護ルートは `default` compact-sm「集計」（操作と同じ。押せることを見せる）。セル内は天地左右中央。公開表は空
- Count modal header — パターン列の見出しは凡例と同じ淡塗り + ink。白いパターンは塗らない（列罫が輪郭）。勤務日・休みの見出しは gray-0（本文は白のまま）。スタッフが多いときは見出しを固定して表の中を縦スクロール。パターンが多いときは名前・勤務日・休みまでを固定して横スクロール（右端と見出しの下線は 2px gray-3）
- Staff name — 名前 13px/600 + 勤務日数バッジ（`4日`。min-width 36px で 1 桁と 2 桁の幅を揃える）。`⋮` はホバー / フォーカスだけ
- Shift cell — 35px h · 3px radius · セル間 3px。空の担当可は白、担当不可は斜線ハッチ。空の「+」は 18px、ホバー / フォーカスだけ。**下書きは tint 塗り + ink 文字 · 確定は base 塗り + 太字**。白いパターンだけ中立の枠線（下書き破線 / 確定実線）。**アサイン済みを 500ms 長押しすると下書きと確定が入れ替わる**（下端の 2px が currentColor で伸びる。指が 10px を超えて動いたら中止。空セルはポップオーバーのまま）
- Toolbar title — 16px/650、前後は 28px ActionIcon
- Primary nav — 13px、現在地は ink + 650 + gray-1 の面（radius sm）、非現在地は dimmed
- Copy modal — コピー元 / コピー先を 1 つの枠（gray-3 の線）に 2 行で並べ、区切り線の上に 22px の丸い下向き矢印。行はラベル 12px/650 gray-6 · 期間名 15px/650 · `9/1（火） 〜 9/30（水）` 12px gray-6（土 blue-8 / 日 red-8）· 右に 28px `default` の `‹ ›`。勤務パターンは凡例と同じ札（32px・3px 角、選択中は `chipStyle()` + チェック、外すと白地 + 10px の色の四角。印は 14px の枠に収め、チェックに替えても札の幅は変えない）。規則は入っているマスは残る、の 1 行。塗りボタンは `シフトをコピー`

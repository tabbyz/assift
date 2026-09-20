# 010: エクスポート（PDF / CSV）

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §4.5 / §6）のマイルストーン 010。
007〜009 で作ったシフト表に **PDF 出力**と **CSV エクスポート**を足す。どちらも 009 で作った共有メニューの中に入る。
LP などの静的ページは 011、データ移行は 012。

---

## 1. 目的と完了条件

### 目的

- v1 の `ShiftsController#index` の `format.pdf` / `format.csv`（`index.pdf.slim` + `shifts/pdf.scss` / `index.csv.ruby`）を移植する
- **このリポジトリで最初の Route Handler** を作る。Server Action（`ActionResult` を返す）とは失敗の返し方が違うので、
  2 本のルートが共有する入口（認証 → 店舗 → 期間 → 表の読み取り）を 1 か所に決めて、以降のエクスポートが同じ形で足せるようにする
- wkhtmltopdf（外部バイナリ + HTML/CSS）を `@react-pdf/renderer`（Node のライブラリ + React 要素）に置き換える。
  **日本語フォントを自前で同梱する**必要がある（react-pdf の組み込みフォントは Helvetica だけで、日本語は 1 文字も出ない）
- CSV の文字コード（既定 CP932 / `?encoding=utf8` で BOM 付き UTF-8）を v1 と**バイト単位で**そろえる。
  012 の移行検証が「v1 と v2 の CSV を突き合わせる」（001 §5）ので、ここがずれると検証手段ごと失われる
- 005 で用意しておいた旧 URL（`/tenants/<token>/shifts.pdf` → `/api/tenants/<uuid>/shifts/pdf`）の**着地点を作る**

### 完了条件

- 共有メニューに区切り線を挟んで「**PDFファイルを作成**」「**CSVエクスポート**」が並ぶ（v1 の並びと同じ）
- 「PDFファイルを作成」を押すと**別タブ**で PDF が開く。表示中の期間そのもので、日付行 / メモ行 / 在籍スタッフ × 日のセル / 凡例が v1 と同じ見た目で出る
- **スタッフ 14 人以上で 2 ページ目に改ページ**され、2 ページ目にも見出し・日付行・凡例が付く（v1 の `each_slice(13)`）
- 確定は**パターン色で塗って白文字 + 太字**、下書きは**白地 + 上辺の色帯**（v1 / v2 の画面と同じ規則）
- **漢字・かな・外字（髙 﨑 濵 など）が豆腐にならない**。PDF のファイルサイズが数百 KB に収まる（フォントがサブセット化されている）
- 「CSVエクスポート」で `shifts_20260901-20260930.csv` がダウンロードされ、**Excel（Windows）で文字化けしない**
- `?encoding=utf8` を付けると BOM 付き UTF-8 で落ちてくる（v1 と同じ隠しパラメータ）
- CP932 で表せない文字（絵文字など）が `〓` になり、行がずれない
- 他店舗の `tenantId` / 存在しない `tenantId` を URL に入れると 404。未ログインは proxy が `/login?next=` へ送る
- 旧 URL `/tenants/<22文字トークン>/shifts.pdf?start_date=2026-09-01` が新 URL へ 308 され、そのまま PDF が出る
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` が通る（スキーマは触らないので `db reset` / pgTAP は不要）

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| v1 `format.pdf` | `render pdf: "勤務シフト表_YYYYMMDD-YYYYMMDD", orientation: "Landscape", page_size: "A4"`。wicked_pdf の既定は `Content-Disposition: inline` で、ツールバーのリンクが `target: :blank` なので**別タブで開く** |
| v1 `format.csv` | `send_data render_to_string, filename: "shifts_YYYYMMDD-YYYYMMDD.csv", type: :csv`（= `attachment`） |
| v1 のツールバー | 共有ドロップダウンの中に `URLでシフト表を共有` / `hr` / `PDFファイルを作成`（`target: :blank`）/ `CSVエクスポート`。どちらのリンクにも `v: Time.now.to_i` のキャッシュバスターが付く |
| v1 PDF の構造 | `items.each_slice(13).with_index` でスタッフ 13 人ごとに `page-break-after`。**見出し・表・凡例が毎ページ繰り返される**。`items` にはスタッフグループの行も含まれていたが、グループは v2 で廃止（001 §7.3）なので 13 = スタッフ 13 人 |
| v1 PDF の見出し | `シフト表`（左）/ `9月1日 〜 9月30日` / 店舗名（右寄せ） |
| v1 PDF のセル | 確定 = パターン色で塗り + 白文字（白いパターンだけ既定色）+ **太字**、下書き = `background-color: #fff !important` + `color: #333 !important` + 上辺 1.5mm の色帯。未アサインは白 |
| v1 PDF の凡例 | 説明が入っているパターンだけ `名前：説明` を ` / ` 区切りで横に並べ、右端に `© assift`。**枠線は無い** |
| v1 PDF の寸法 | 本文 3mm / 日付 4mm / メモ 1.8mm / 見出し 5mm、行高 11mm、スタッフ名列 19mm、外枠 1mm・内側 0.6mm。余白は wkhtmltopdf の既定（10mm） |
| v1 PDF の日付ヘッダ | **日（`%-d`）が上、曜日が下**。日曜・祝日は `#ff3860`、土曜は `#209cee` |
| v1 **web** の日付ヘッダ | **曜日が上、日が下**（`index.html.slim`）。**v1 自身が PDF と web で逆**になっている（§3.8 で決める） |
| v1 CSV | 1 行目 = `""` + `%Y-%m-%d` の日付、2 行目 = `""` + メモ（**メモが 1 件も無くても必ず出す**）、以降 = スタッフ名 + パターン名。`staffs.enabled` を `position` 順 |
| v1 CSV の文字コード | `CSV.generate(bom?).encode(encoding, invalid: :replace, undef: :replace, replace: "〓")`。既定 CP932、`?encoding=utf8` で BOM 付き UTF-8。**UI からは切り替えられない**（URL を手で書くしかない隠し機能） |
| v1 CSV の改行 | Ruby `CSV.generate` の既定 `row_sep` は `"\n"`（LF） |
| v1 のフォント | `pdf.scss` の `@font-face` は残っているが、`body.pdf { font-family: sans-serif; }` に **`NOTE: Rails 6にアップデート後、"Noto Sans JP"が読み込めないため`** と書かれている。実際は wkhtmltopdf が OS のフォントで描いていた |
| `@react-pdf/renderer` | 4.9.0。peer は `react ^19` を含む。`renderToBuffer(doc): Promise<Buffer>` / `Font.register` / `Font.registerHyphenationCallback` / `Document` の `title` / `Page` の `size` `orientation` / `Text` の `fixed` `render` を型で確認した |
| react-pdf の実測（スパイク） | 実フォントで A4 横のシフト表を描いて測った（§8.9）。**31 日 × 100 人（8 ページ）= 1009ms / 304KB**、31 日 × 14 人 = 311ms / 63KB。`fontkit.openSync` は 2ms。CID-keyed CFF のサブセット化は正しく効く |
| `@react-pdf/renderer` の外部化 | **Next の自動 opt-out リストに既に入っている**（`serverExternalPackages.md` の一覧）。`next.config.ts` に足す必要は無い（001 §4.5 の「`serverExternalPackages` に追加」は不要だった） |
| `Font.register` の `src` | 型は `string`。`@react-pdf/font` の `_load()` は「標準 14 フォント名 → data URL → URL（`fetch`）→ **それ以外は `fontkit.open(src)` = ファイルパス**」の順に解決する（`lib/index.js` を読んで確認）。**ファイルシステムのパスを渡せる** |
| `outputFileTracingIncludes` | ルート glob（picomatch）→ プロジェクトルートからの glob。`src/` を使っていても書き方は変わらない（`output.md`）。**`[tenantId]` はそのまま書くと文字クラスとして解釈される**（ドキュメントの例も `\\[\\[\\.\\.\\.slug\\]\\]` とエスケープしている） |
| Route Handler | `app/` 配下の `route.ts`。**既定でキャッシュされない**。`RouteContext<'/path'>` がグローバルに生える（`next typegen` 後）。`notFound()` は Route Handler でも使えて 404 を返す（`not-found.md` §Serving a 404 from a Route Handler） |
| proxy | `PROTECTED_PREFIXES` に **`/api/tenants` が既に入っている**（`utils/supabase/proxy.ts`）。未ログインは `/login?next=/api/...` へ redirect される |
| 旧 URL | `legacyUrl.ts` の `EXPORT_PATHS` が `shifts.pdf` → `pdf` / `shifts.csv` → `csv` を持ち、`start_date` → `start` の書き換えもある。**他のクエリ（`encoding` / `v`）は順序ごと残る** |
| 既存のクエリ | `listActiveStaffs` / `listPatterns` / `listShifts`（`pageAll` 経由）/ `listDateNotes` がそのまま使える。`getTenant` は `cache()` 済み |
| 期間の計算 | `dateRange(cycle, startOfWeek, start)` が正規化まで含めて返す。**戻り値は最長 31 日**（`month` でも 28〜31 日） |
| 表示期間の既定 | `?start=` が無い / 実在しない日付なら `defaultStart(todayJst())`（JST 今日の月初）。`shifts/page.tsx` と同じ |
| `public/` | **空**。フォントを置く場所はまだ無い |
| `iconv-lite` | 0.7.3。`cp932` に対応。未マッピング文字は `defaultCharSingleByte`（既定 `?`）に落ちる。**`〓` は CP932 で 2 バイトなので、このオプションでは指定できない**（§5.4） |

---

## 3. 事前に確認した決定

### 3.1 期間は `?start=` だけを受け、範囲はサーバーが計算する

`?start=&end=` を受けない。店舗の `shift_cycle` / `start_of_week` から `dateRange()` で組み直す。

- 画面に出ている表とエクスポートが**必ず一致する**。クライアントが `end` を作ると、周期の正規化（週初へ丸める / 月の前半後半）を 2 か所に持つことになる
- **範囲を任意に広げられない**。`dateRange()` の戻り値は最長 31 日なので、`?start=` をいくらいじっても 10 年分の PDF は作れない。
  Zod で `refineTerm` を掛ける必要すら無く、構造的に上限が決まる
- `?start=` が壊れていても失敗させない。`isDateString` で弾いて `defaultStart(todayJst())` に落とす（`shifts/page.tsx` と同じ）。
  旧 URL のブックマークやメールのリンクから来た人に、エラーではなく今月の表を見せるほうがよい

リンク側は **`range.start`（正規化後）** を渡す。`dateRange()` は正規化済みの値に対して冪等なので、サーバーが計算し直しても同じ期間になる。

### 3.2 失敗の返し方を Route Handler の分だけ決める（Server Action の `ActionResult` は持ち込まない）

`ActionResult` はクライアントが `notifications.show()` で出すための形で、ブラウザが直接開く GET には使えない。この 2 本は次の 3 通りだけにする。

| 状況 | 返すもの | 理由 |
| --- | --- | --- |
| 未ログイン | `401` + `ログインが必要です`（`text/plain`） | 通常は proxy が `/login?next=` へ送るので**到達しない保険**。到達したときに沈黙しないようにだけしておく |
| `tenantId` が uuid でない / 店舗が見えない | `notFound()`（404） | `shifts/page.tsx` と同じ。RLS で見えない店舗も存在しない店舗も区別しない（存在を漏らさない） |
| それ以外の例外 | そのまま投げる（500） | DB エラーやフォント読み込み失敗は握り潰さない。ログに出す |

`?start=` の不正は**失敗にしない**（§3.1）。したがってこの 2 本には「入力が悪い」経路が無く、Zod スキーマも要らない。

**ルート自身が認証を見るのは、`app/api/` が `(protected)/layout.tsx` の外にあるから**。
保護ルートのページは layout の `getAuthUser()` に守られているが、Route Handler にはそれが掛からない。
守りは proxy（redirect）とこのルート（401）の 2 枚になる。

`getAuthUser()` は JWT をローカル検証するだけなので、`getTenant()` の RLS が実質の認可になる（AGENTS.md の「認可ロールは profiles を信頼する」はロール判定の話で、ここは所有関係の話）。

**404 のボディは設計しない**（`notFound()` が返すものに任せる）。ここに到達する経路は「他人の店舗 id を URL に入れた」か
「壊れた id」しかなく、旧 URL のブックマークは `legacyUrl.ts` が正しい uuid に書き換えるので普通の利用では踏まない。
`/api/` 配下に画面を用意するより、踏まない前提を書いておくほうがよい。

### 3.3 読み取りは既存のクエリを合成した 1 本にまとめる（service_role は使わない）

`lib/queries/shiftTable.ts` の **`getShiftTable(tenant: Tenant, range: DateRange)`** が `listActiveStaffs` / `listPatterns` /
`listShifts` / `listDateNotes` を `Promise.all` で呼び、`ShiftTable`（`lib/shifts/table.ts`）に畳む。

**`tenantId` ではなく `tenant` を受ける。** `ShiftTable.tenantName` の出どころを隠さないため（§8.12 G2）。
呼び出し元の `loadShiftExport` は `getTenant()` の結果を既に持っているので、渡すだけで済む。
`tenantId` だけを受けて中でもう一度 `getTenant()` を呼ぶ形は、`cache()` のおかげで動きはするが
「なぜ 2 回読むのか」が読み手に説明できない。

- **`createClient()`（anon + RLS）を使う。** 009 の `publicShare.ts` が service_role なのは「未ログインで開く公開ページには RLS が使えない」からで、
  ここはログイン済みのユーザー文脈なので例外を増やす理由が無い（AGENTS.md の「RLS を通らない読み取りは `publicShare.ts` だけ」をそのまま守る）
- 退職者の行は `shifts` から TS 側で落とす（007 §5.8 / 009 §5.4 と同じ）。`.in('staff_id', ids)` は URL に uuid が並ぶ
- `listShifts` は `pageAll()` 経由なので、31 日 × 100 人でも `max_rows`（1000）に切られない
- 祝日は Server で解決して `holidays: string[]` に入れる（`holidays.ts` は `server-only`）

`ShiftTable` は **`lib/shifts/table.ts`（`server-only` でない純粋な型）** に置く。CSV の生成関数は純関数で Vitest の対象にしたいので、
型を `lib/queries/`（`import 'server-only'`）から引くと依存の向きが濁る。

```ts
export type ShiftTable = {
  tenantName: string
  start: string
  end: string
  dates: string[]
  holidays: string[]
  staffs: { id: string; name: string }[]
  patterns: { id: string; name: string; description: string | null; colorHex: string }[]
  shifts: ShiftCell[]
  notes: { date: string; note: string }[]
}
```

### 3.4 日本語フォントは同梱し、**ファイルパス**で登録する（自オリジンへの fetch はしない）

react-pdf の組み込みフォントは標準 14 フォントだけで、**日本語は 1 文字も描けない**（豆腐にすらならず、幅ゼロで消える）。
001 §4.5 は「`public/fonts` に置いて自オリジン URL から読み込む」としていたが、**ファイルシステムのパスに変える**。

| 理由 | 中身 |
| --- | --- |
| preview デプロイで壊れる | Vercel の Deployment Protection が有効だと、自分自身への `fetch` が認証画面の HTML を返し、`fontkit.create` が壊れたバイナリを掴む |
| 往復が無駄 | 同じサーバーが持っているファイルを HTTP で取りに行く。コールドスタートのたびに数 MB のダウンロードが乗る |
| 絶対 URL が要る | `fetch` には絶対 URL が要るので `requestOrigin()` に依存する。フォントの読み込みがリクエストヘッダに依存するのは筋が悪い |
| `public/` に置く必要が無い | 読み取りはサーバーだけ。`public/` に置くと 4MB のフォントが誰でも CDN から落とせる状態になる（実害は無いが意味も無い） |

**置き場所**: `assets/fonts/`（プロジェクトルート。`public/` でも `src/` でもない）。

```ts
Font.register({
  family: 'Noto Sans JP',
  fonts: [
    { src: path.join(process.cwd(), 'assets/fonts/NotoSansJP-Regular.otf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'assets/fonts/NotoSansJP-Bold.otf'), fontWeight: 700 },
  ],
})
```

**ファイルは `outputFileTracingIncludes` で明示的にバンドルへ入れる。** `@react-pdf/renderer` は外部パッケージとして
ネイティブ `require` されるので、Next のトレーサはフォントへの参照（実行時に組み立てる文字列）を追えない。

```ts
// next.config.ts
outputFileTracingIncludes: {
  // `[tenantId]` はそのまま書くと picomatch の文字クラスになる。`*` は `/` をまたがない
  '/api/tenants/*/shifts/pdf': ['assets/fonts/**'],
},
```

**選ぶフォント**: `notofonts/noto-cjk` の `Sans/SubsetOTF/JP/NotoSansJP-{Regular,Bold}.otf`（**4.53MB / 4.66MB**。SIL OFL 1.1）。

- 「Subset」は**言語別サブセット**（中国語・韓国語専用グリフを落としたもの）で、日本語のグリフは Adobe-Japan1 をフル収録している。
  Pan-CJK 版（15.7MB）の 1/3 以下で、`髙` `﨑` `濵` のような人名漢字も入っている
- **グリフのサブセット化はしない。** スタッフ名はユーザーが入れる日本語で、どの漢字が来るか事前に決められない。
  JIS 第 1・第 2 水準だけに絞ると、人名の異体字が豆腐になって初めて気付く壊れ方をする
- Google Fonts の `ofl/notosansjp` は**可変フォント 1 本（9.15MB）だけ**になっていて、静的インスタンスが無い。
  react-pdf / fontkit は可変軸を指定しないので、可変フォントを 2 回登録しても両方 wght=400 になり**太字が作れない**
- **Bold も同梱する。** 確定セルの太字は v1 にも v2 の画面（`.cell[data-fixed='true'] { font-weight: 700 }`）にもある。
  とくに**白（`#FFFFFF`）のパターン**では、塗りも文字色も下書きと同じになるので**太字が確定と下書きを分ける唯一の手がかり**になる
- OFL の条項どおり `assets/fonts/LICENSE.txt` にライセンス全文を置く

リポジトリに約 9.2MB の binary が増える。PDF に埋め込まれるのは**使った字だけ**（pdfkit がサブセット化する）。
**この 2 点はプラン作成時にスパイクで実測して確かめた**（§8.9）: 31 日 × 100 人（8 ページ）で **304KB / 1.0 秒**、
`髙` `﨑` `濵` `𠮟` `①` のグリフはすべて存在する（17,936 glyphs）。

### 3.5 CJK を折り返すために `registerHyphenationCallback` を入れる

**これが無いと表が崩れる。** react-pdf の行分割はスペースとハイフンしか改行機会にしないので、
空白の無い日本語は 1 語として扱われ、セル幅を越えても折り返さずにはみ出す。

A4 横・31 日の表だと日付 1 列は約 23.6pt。本文 8.5pt で 6 文字のパターン名は約 51pt あり、**2 倍以上はみ出す**。
v1 は HTML だったのでブラウザが任意の位置で折り返していた（`overflow: hidden` で 11mm に収めていた）。

```ts
// 日本語は 1 文字ずつを改行機会にする（= ブラウザの CJK 折り返しと同じ）。
// ラテン文字だけの語は分割しない（英字のパターン名が 1 文字ずつ縦に割れるのを避ける）
Font.registerHyphenationCallback((word) => (HAS_CJK.test(word) ? Array.from(word) : [word]))
```

セル側には `overflow: 'hidden'` を当てて、3 行を越えた分は v1 と同じように切る。

スパイクで効果を数値で確かめた（§8.9）: 同じ表で show-text 命令が **232 → 654** に増える
（= 無しでは 1 セル 1 行のまま＝折り返さずはみ出し、有りで約 3 行に割れる）。

**折り返しを入れたら行高が足りるかは別問題で、`lineHeight: 1` が要る**（§5.5 / §8.9 F4）。

### 3.6 CSV は「純関数で文字列を作る → バイト列に変換する」の 2 段にする

```
toShiftCsv(table): string          純関数。Vitest で v1 の出力と突き合わせる
encodeCsv(text, encoding): Buffer  iconv-lite。CP932 か BOM 付き UTF-8
```

分けるのは、**CSV の中身と文字コードで壊れ方が違う**から。中身（行の並び・引用符）は Vitest で固定でき、
文字コード（CP932 に無い文字・BOM）は「Excel で開く」でしか最終確認できない。1 つの関数にすると前者のテストに `iconv-lite` が要る。

**改行は LF のまま（v1 と同じ）。** RFC 4180 と Excel の書き出しは CRLF だが、
012 の移行検証が「v1 と v2 の CSV を突き合わせる」（001 §5）なので、改行を変えると全行が差分になって検証の道具にならなくなる。
Excel は LF だけの CSV も問題なく開く。

### 3.7 CP932 で表せない文字は `〓` に置き換える（v1 と同じ）

iconv-lite の未マッピング文字は既定で `?` になる。`defaultCharSingleByte` オプションは名前のとおり**1 バイト文字しか指定できない**ので、
`〓`（CP932 では 0x81AC の 2 バイト）は指定できない。

そこで **エンコードの前に文字単位で置き換える**。判定は往復で行う（`decode(encode(ch)) !== ch` なら表せていない）。

```ts
for (const ch of text) { /* コードポイント単位。絵文字（サロゲートペア）も 1 文字として扱う */ }
```

`?` で済ませない理由は 2 つ。(1) 012 のバイト比較が絵文字入りの店舗で差分だらけになる。
(2) `?` はユーザーが自分で入力した可能性がある文字なので、「変換できなかった」ことが読み手に伝わらない。

### 3.8 PDF の日付ヘッダは **v2 の画面と同じ並び**（曜日が上、日が下）にする

v1 は **web が「曜日 → 日」、PDF が「日 → 曜日」**で、自分自身で食い違っている。
どちらを選んでも「v1 パリティ」なので、**v2 の画面（`DateHeaderCell`）に合わせる**。印刷した表と画面が同じ読み方になるほうがよい。

赤・青は Mantine の `red-6`（`#fa5252`）/ `blue-6`（`#228be6`）に合わせる（v1 PDF の `#ff3860` / `#209cee` ではなく、v2 の画面と同じ色）。

**PDF は Mantine の外側なので hex を直書きする**（AGENTS.md「色は `theme.ts` に集約」の例外）。
`lib/pdf/styles.ts` に集めて、対応する CSS 変数名をコメントで書く。`@mantine/core` の `DEFAULT_THEME` を import すれば
値を引けるが、PDF のためだけに UI ライブラリ全体をルートのバンドルへ引き込むことになるので採らない。

### 3.9 `components/shiftTable/` は PDF では再利用できない（共有するのは規則だけ）

`DateHeaderCell` / `ShiftTable.module.css` / `cellStyle()` は DOM と CSS Modules 前提で、react-pdf の `View` / `Text` には渡せない。
PDF は独立した描画として書き、**判断の規則だけ** `lib/` 経由で共有する。

| 共有するもの | どこから |
| --- | --- |
| 白いパターンの文字色 | `fixedTextColor()`（`lib/patterns/colors.ts`） |
| 凡例の枠線色（白は既定色に落とす） | `outlineColor()`（同上） |
| 曜日ラベル | `WEEKDAY_LABELS`（`lib/calendar/weekdays.ts`） |
| 祝日 | `holidaysIn()`（`lib/calendar/holidays.ts`。Server で解決済み） |
| 日付の整形 | `dayOfMonth()` / `formatJapaneseMonthDay()`（`lib/calendar/dateString.ts`） |
| セルの引き当て | `toShiftMap()` / `cellKey()`（`lib/shifts/key.ts`） |

`cellStyle()` は `CSSProperties` を返すので react-pdf の `Style` にはそのまま渡せない。**型を緩めて共用しない**（`borderColor` の
解釈も両者で違う）。PDF 用に `pdfCellStyle()` を別に書き、白の扱いだけ `fixedTextColor()` に寄せる。

### 3.10 キャッシュバスターは付けず、`Cache-Control` で止める

v1 はリンクに `v: Time.now.to_i` を付けて、ブラウザが古い PDF を再利用するのを防いでいた。v2 は付けない。

- **`Date.now()` を href に入れるとハイドレーション不一致になる**（Server と Client で別の値が出る）
- Route Handler は既定でキャッシュされないが、**止めるのはブラウザ側**なので、レスポンスに
  `Cache-Control: private, no-store` を付けるほうが直接的。URL も安定する

### 3.11 v1 から変えるところ

| 変更 | 理由 |
| --- | --- |
| 日付ヘッダの並び（曜日 → 日） | v1 自身が web と PDF で逆。v2 の画面にそろえる（§3.8） |
| 凡例のパターン名に色枠を付ける | 009 §3.6 で公開ページ・画面の凡例に入れたのと同じ。PDF にはポップオーバーが無く、凡例が色と名前を結ぶ唯一の手がかりになる。白は `outlineColor()` が既定の枠線色に落とす |
| 複数ページのときだけ `1 / 3` を footer に出す | v1 には無い。印刷した紙が 3 枚以上になると順序が分からなくなる。**`Text` の `render` コールバックは使わず**、`chunkRows()` の添字と `chunks.length` をそのまま埋める（ページ分割を自分で持っているので、react-pdf にページ番号を数えさせる必要が無い。§8.12 G1）。1 ページのときは出さない |
| キャッシュバスターを `Cache-Control` に置き換える | §3.10 |
| CSV の `Content-Type` に charset を明示 | v1 は `text/csv` だけ。`text/csv; charset=Shift_JIS` / `charset=utf-8` を付ける。`attachment` なので実害は無いが、正しい情報を出さない理由も無い |
| スタッフグループの行は出さない | グループ機能は廃止（001 §7.3）。v1 PDF の `tr.group` とグループ見出しの分岐ごと落とす |
| 文字数の切り詰めをしない | v1 は `truncate(staff.name, length: 10)` をビューで掛けていた。v2 は DB の CHECK が同じ長さを保証していて、012 が移行時に切り詰める（001 §5）。ビューで二重に持たない |

---

## 4. 成果物

### 新規

```
assets/fonts/NotoSansJP-Regular.otf            notofonts/noto-cjk Sans/SubsetOTF/JP（4.53MB）
assets/fonts/NotoSansJP-Bold.otf               同上（4.66MB）
assets/fonts/LICENSE.txt                       SIL Open Font License 1.1
src/lib/shifts/table.ts                        ShiftTable（PDF / CSV が共有する形。server-only ではない）
src/lib/queries/shiftTable.ts                  getShiftTable(tenant, range)（既存クエリの合成。RLS 経由）
src/lib/export/request.ts                      loadShiftExport / unauthorizedResponse / EXPORT_HEADERS
src/lib/export/filename.ts                     csvFilename / pdfFilename / contentDisposition（RFC 5987）
src/lib/export/filename.test.ts
src/lib/csv/shiftCsv.ts                        toShiftCsv / csvField（純関数）
src/lib/csv/shiftCsv.test.ts
src/lib/csv/encode.ts                          CSV_ENCODINGS / resolveCsvEncoding / encodeCsv
src/lib/csv/encode.test.ts
src/lib/pdf/fonts.ts                           registerPdfFonts（パス登録 + hyphenation callback）
src/lib/pdf/paginate.ts                        PDF_ROWS_PER_PAGE / chunkRows
src/lib/pdf/paginate.test.ts
src/lib/pdf/styles.ts                          StyleSheet.create（v1 pdf.scss の移植。mm → pt）
src/lib/pdf/pdfCellStyle.ts                    pdfCellStyle（確定 = 塗り + 白文字 / 下書き = 上辺の帯）
src/lib/pdf/pdfCellStyle.test.ts
src/lib/pdf/ShiftPdfDocument.tsx               Document / Page / ヘッダ / 表 / 凡例
src/app/api/tenants/[tenantId]/shifts/pdf/route.ts
src/app/api/tenants/[tenantId]/shifts/csv/route.ts
docs/plans/010-export/README.md
```

### 変更

```
package.json                                   @react-pdf/renderer / iconv-lite を dependencies に追加
next.config.ts                                 outputFileTracingIncludes（PDF ルートに assets/fonts/**）
src/app/(protected)/tenants/[tenantId]/shifts/_components/ShareMenu.tsx
                                               MenuDivider + PDF / CSV の項目（props に tenantId / start を追加）
src/app/(protected)/tenants/[tenantId]/shifts/_components/Toolbar.tsx
                                               ShareMenu に range.start を渡す
AGENTS.md                                      ディレクトリ図に api/ 配下・lib/{pdf,csv,export}/・assets/fonts/ を足し、
                                               「Route Handler」の節（失敗の返し方・フォントのトレース）を追記
```

### 文言（v1 から移植）

| 場所 | 文言 |
| --- | --- |
| メニュー項目 | `PDFファイルを作成` / `CSVエクスポート` |
| PDF 見出し | `シフト表` / `9月1日 〜 9月30日` / 店舗名 |
| PDF の Title メタデータ | `シフト表 9月1日 〜 9月30日`（v1 の `<title>`。**別タブで開いたときブラウザのタブに出るのはこれ**。§5.5） |
| PDF 凡例 | `名前：説明` を ` / ` 区切り、右端に `© assift` |
| PDF ファイル名 | `勤務シフト表_20260901-20260930.pdf` |
| CSV ファイル名 | `shifts_20260901-20260930.csv` |
| 未ログイン（保険） | `ログインが必要です` |

---

## 5. 設計の要点

### 5.1 `lib/export/request.ts`

```ts
import 'server-only'

/** どちらのエクスポートも同じ（ブラウザに古い PDF / CSV を再利用させない。§3.10） */
export const EXPORT_CACHE_CONTROL = 'private, no-store'

/** 未ログイン。通常は proxy が /login?next= へ送るのでここには来ない（§3.2） */
export function unauthorizedResponse(): Response

/**
 * 認証 → 店舗 → 期間 → 表の読み取り。
 *
 * **`null` が意味するのは「未ログイン」の 1 つだけ**（呼び出し側が 401 にする）。
 * 見えない店舗・uuid でない id はここで `notFound()` を投げて戻ってこないので、
 * 呼び出し側で理由を切り分ける分岐は要らない（`requireTenant` と同じ考え方）。
 */
export async function loadShiftExport(
  tenantId: string,
  startParam: string | null
): Promise<ShiftTable | null>
```

1. `getAuthUser()` → 無ければ `null`
2. `isUuid(tenantId)` でなければ `notFound()`（uuid でない値を Postgres に投げると 22P02 でログが汚れる。006 §3.11）
3. `getTenant(tenantId)` → 無ければ `notFound()`
4. `startParam` が `isDateString` を満たせばそれ、でなければ `defaultStart(todayJst())`
5. `dateRange(tenant.shift_cycle, tenant.start_of_week, start)` → `getShiftTable(tenant, range)`

`ActionError` / `runAction` は使わない（§3.2）。**両ルートともこの 1 本しか呼ばない**ので、認可の抜けはここだけ見ればよい。

`?start=` 以外のクエリ（旧 URL が運んでくる `?v=`、未知のパラメータ）は**読まずに無視する**。
CSV だけが `?encoding=` を追加で読む。

### 5.2 Route Handler

```ts
// src/app/api/tenants/[tenantId]/shifts/csv/route.ts
export async function GET(request: NextRequest, ctx: RouteContext<'/api/tenants/[tenantId]/shifts/csv'>) {
  const { tenantId } = await ctx.params
  const params = request.nextUrl.searchParams
  const table = await loadShiftExport(tenantId, params.get('start'))
  if (!table) return unauthorizedResponse()

  const encoding = resolveCsvEncoding(params.get('encoding'))
  const body = encodeCsv(toShiftCsv(table), encoding)
  return new Response(body, { headers: { ... } })
}
```

PDF 側は `renderToBuffer(<ShiftPdfDocument table={table} />)`。

- **`runtime` は既定（nodejs）のまま**。`edge` にすると `fs`（フォント）が無い。明示的に `export const runtime = 'nodejs'` を書いて、
  あとから誰かが edge に変えない印にする
- `renderToBuffer` は Node の `Buffer` を返す。`Response` の `BodyInit` は `ArrayBufferView` を受けるのでそのまま渡せるが、
  型の当たりが悪ければ `new Uint8Array(buffer)` にする
- `renderToStream` にはしない。ストリームのほうが最初のバイトは早いが、途中で失敗したときに壊れた PDF を返してしまう。
  31 日 × 100 人でも数 MB なのでバッファで足りる

**ヘッダ**:

| | PDF | CSV |
| --- | --- | --- |
| `Content-Type` | `application/pdf` | `text/csv; charset=Shift_JIS`（`utf8` なら `charset=utf-8`） |
| `Content-Disposition` | `inline`（v1 と同じく別タブで開く） | `attachment` |
| `Cache-Control` | `private, no-store` | 同左 |

### 5.3 `lib/export/filename.ts`

```ts
export function csvFilename(start: string, end: string): string  // shifts_20260901-20260930.csv
export function pdfFilename(start: string, end: string): string  // 勤務シフト表_20260901-20260930.pdf
export function contentDisposition(disposition: 'inline' | 'attachment', filename: string): string
```

**PDF のファイル名は日本語**なので、`Content-Disposition` に生で書けない（ヘッダは Latin-1）。
RFC 5987 の `filename*=UTF-8''<percent-encoded>` を使い、古いクライアント向けに ASCII の `filename=` も併記する。

```
inline; filename="shifts_20260901-20260930.pdf"; filename*=UTF-8''%E5%8B%A4%E5%8B%99...
```

ASCII フォールバックは CSV と同じ `shifts_...` にする（日本語を落とした結果が `_20260901-20260930.pdf` のような
読めない名前になるより、意味が通る）。テスト: 年またぎ / 1 桁月日 / パーセントエンコードの結果 / `"` が入り込まないこと。

### 5.4 `lib/csv/`

```ts
// shiftCsv.ts（純関数）
export function toShiftCsv(table: ShiftTable): string
```

1. 1 行目: `''` + `table.dates`（`YYYY-MM-DD` のまま。`formatMonthDay` にしない）
2. 2 行目: `''` + 各日のメモ（無ければ空文字）。**メモが 1 件も無くても出す**（v1 と同じ。列構造を安定させる）
3. 以降: スタッフ名 + 各日のパターン名（未アサインは空文字）
4. 行区切りは `\n`、フィールド区切りは `,`

`csvField(value)` は Ruby の `CSV` と同じ規則で引用する: **`,` `"` CR LF のいずれかを含むときだけ** `"` で囲み、中の `"` を `""` にする。
スタッフ名（10 文字）・パターン名（6 文字）・メモ（12 文字）には `,` も `"` も入りうる。

```ts
// encode.ts
export const CSV_ENCODINGS = { cp932: 'cp932', utf8: 'utf8' } as const
export function resolveCsvEncoding(value: string | null): CsvEncoding  // v1 と同じ「utf8 のときだけ UTF-8」
export function encodeCsv(text: string, encoding: CsvEncoding): Buffer
```

- `utf8`: `'﻿' + text` を UTF-8 で（BOM）
- `cp932`: §3.7 のとおり未マッピング文字を `〓` にしてから `iconv.encode(text, 'cp932')`
- `resolveCsvEncoding` は **`lookup()` を使うまでもない**（`utf8` との単純比較。v1 も `params[:encoding] == "utf8"`）
- **`iconv-lite` は Next の自動外部化リストに入っていない**ので、react-pdf と違ってバンドルされる（§2）。
  `require('../encodings')` は静的なのでバンドルできるはずだが、もしエンコーディング表を読めずに落ちたら
  **そのときだけ `serverExternalPackages` に足す**。「react-pdf に要らなかったから誰にも要らない」ではない

テスト: 日付行 / 空のメモ行 / 未アサインの空セル / `,` と `"` の引用 / スタッフ 0 人 / メモが 1 件も無いとき /
CP932 のバイト列（`あ` = `0x82A0`）/ BOM（`0xEF 0xBB 0xBF`）/ 絵文字 → `〓` / サロゲートペアの漢字（`𠮟`）→ `〓` /
CP932 に**ある**丸数字（`①`）はそのまま通ること。

### 5.5 `lib/pdf/`

**`fonts.ts`**: モジュールのトップレベルで 1 回だけ `Font.register` と `Font.registerHyphenationCallback` を呼ぶ
（ESM はプロセスごとに 1 回しか評価されない）。フォントの読み込み自体は react-pdf が描画時に遅延で行う。

**`paginate.ts`**: `PDF_ROWS_PER_PAGE = 13`（v1 の `each_slice(13)`）と `chunkRows(rows, size)`。
**スタッフが 0 人でも 1 ページ返す**（見出しと日付行だけの PDF。空の PDF より状況が分かる）。テストはこの境界（0 / 13 / 14 / 27）。

**`styles.ts`**: v1 `pdf.scss` の mm を pt に直す（1mm = 2.8346pt）。

| v1 | pt |
| --- | --- |
| 本文 3mm / 日付 4mm / メモ 1.8mm / 見出し 5mm | 8.5 / 11.3 / 5.1 / 14.2 |
| 行高 11mm / スタッフ名列 19mm | 31.2 / 53.9 |
| 外枠 1mm / 内側 0.6mm / 下書きの帯 1.5mm | 2.8 / 1.7 / 4.3 |
| ページ余白（wkhtmltopdf 既定 10mm） | 28.3 |
| **`line-height`（v1 は本文もメモも 1.0）** | **`lineHeight: 1`** |

**`lineHeight: 1` を落とすと全セルで 3 行目が切れる**（§8.9 F4。実測で確かめた）。
Noto Sans CJK は `ascent 1160 / descent −288`（`unitsPerEm` 1000）で、**react-pdf が使う自然な行高が 1.448 倍**ある。

```
8.5pt × 1.448 × 3 行 = 36.9pt  >  行高 31.2pt   → 切れる
8.5pt × 1.0   × 3 行 = 25.5pt  ≤  行高 31.2pt   → 収まる
```

v1 の CSS が `font-size: 3mm; line-height: 3mm`（= 1.0）だったのは CJK の行間を潰すためで、**寸法表の中で唯一
「移し忘れると静かに壊れる」値**。メモ行（5.1pt）も同じ理由で 1.0 にする。

A4 横は 841.89 × 595.28pt。余白を引いて 785pt、スタッフ名列 54pt を除いた 731pt を日数で割る（31 日なら 23.6pt/列）。
日付列は `flex: 1` にして等分する。

**`pdfCellStyle.ts`**: 下書きの色帯は v1 のように絶対配置の `span` を重ねず、**`borderTopWidth` / `borderTopColor`** で描く
（`cellStyle()` が web でやっているのと同じ考え方）。ファイル名を `cellStyle.ts` にしない
（`components/shiftTable/cellStyle.ts` と基底名が衝突して、import 行を見ても web 用か PDF 用か分からなくなる）。
戻り値の型（react-pdf の `Style`）は **`import type` で引く**。値 import にすると Vitest が react-pdf を読み込む。

```ts
export function pdfCellStyle(pattern: { colorHex: string } | undefined, fixed: boolean): Style
// 未アサイン: undefined
// 下書き:     { borderTopWidth: 4.3, borderTopColor: colorHex }
// 確定:       { backgroundColor: colorHex, color: fixedTextColor(colorHex), fontWeight: 700 }
```

**`ShiftPdfDocument.tsx`**: `chunkRows(table.staffs, 13)` を `<Page size="A4" orientation="landscape">` に 1 つずつ描く。
各ページの構成は v1 と同じで、**見出し・表・凡例が毎ページ繰り返される**。

- **`<Document title={`シフト表 ${dates}`}>`**（v1 の `<title>`）。`Content-Disposition: inline` で別タブに開くと、
  ブラウザのタブに出るのは**ファイル名ではなく PDF の Title メタデータ**で、指定しないと URL がそのまま出る
- 見出し: `シフト表` / `formatJapaneseMonthDay(start) 〜 formatJapaneseMonthDay(end)` / 店舗名（右）
- 日付行: `WEEKDAY_LABELS[wday]` の下に `dayOfMonth`。日曜（`wday === 0`）と祝日は赤、土曜は青
- メモ行: **期間内にメモが 1 件でもあるときだけ**（v1 と同じ。CSV は常に出すのと非対称だが、どちらも v1 に合わせる）
- セル: `toShiftMap()` で引いて `pdfCellStyle()`、`overflow: 'hidden'`
- 凡例: 説明のあるパターンだけ。名前を `outlineColor()` の枠で囲み、`名前：説明` を ` / ` 区切り。右端に `© assift`（+ 複数ページなら `1 / 3`）

react-pdf に `<table>` は無いので `View` の `flexDirection: 'row'` で組む。**文字は必ず `<Text>` の中**に置く。

### 5.6 `ShareMenu` への追加

props に **`tenantId` と `start`** を足す（`Toolbar` は両方すでに持っている）。URL の組み立てはこのコンポーネントの中で閉じる。

```tsx
const exportUrl = (kind: 'pdf' | 'csv') => `/api/tenants/${tenantId}/shifts/${kind}?start=${start}`
```

```tsx
<MenuItem leftSection={<IconLink size={16} />} onClick={onOpenShare}>URLでシフト表を共有</MenuItem>
<MenuDivider />
<MenuItem component="a" href={exportUrl('pdf')} target="_blank" rel="noopener"
          leftSection={<IconFileTypePdf size={16} />}>PDFファイルを作成</MenuItem>
<MenuItem component="a" href={exportUrl('csv')}
          leftSection={<IconFileTypeCsv size={16} />}>CSVエクスポート</MenuItem>
```

- **`next/link` を使わない。** Route Handler は Next のページではないので、クライアント遷移させてはいけない。素の `<a>` にする
- `Toolbar` から `range.start`（正規化後）を渡す（§3.1）
- `target="_blank"` には `rel="noopener"`（ESLint の `react/jsx-no-target-blank`）
- 期間移動・一括操作の最中は `ShareMenu` の `ActionIcon` 自体が `disabled` なので、ドロップダウンごと開かない（009 のまま）
- アイコンは `IconFileTypePdf` / `IconFileTypeCsv`（`@tabler/icons-react` に存在を確認）

### 5.7 AGENTS.md への追記

「Server Actions」の次に **「Route Handler」** の短い節を足す。

- 置き場所は `src/app/api/`。書き込みは持たず、ファイルを返す GET だけ
- **`ActionResult` を返さない。** 未ログイン 401 / 見えない店舗は `notFound()` / それ以外は throw（§3.2）
- `createPrivilegedClient()` を使わない。エクスポートはユーザー文脈なので `createClient()`（anon + RLS）
- 実行時に読むファイル（フォント）は `outputFileTracingIncludes` に書く。**ルート glob の `[tenantId]` は `*` に置き換える**
- `Cache-Control: private, no-store` を付ける。リンク側にキャッシュバスターを入れない（ハイドレーション不一致）

ディレクトリ図にも `lib/pdf/` `lib/csv/` `lib/export/` と `assets/fonts/` を足す。

---

## 6. 手順

1. `npm i @react-pdf/renderer iconv-lite`。`assets/fonts/` にフォント 2 本と `LICENSE.txt` を置く
2. `lib/shifts/table.ts`（型）→ `lib/queries/shiftTable.ts`（合成クエリ）
3. `lib/export/filename.ts` + Vitest（RFC 5987 の結果を固定する）
4. `lib/export/request.ts`（認証・店舗・期間・読み取り）
5. `lib/csv/shiftCsv.ts` / `encode.ts` + Vitest。**ここまでで `npm test` が通る**
6. `api/tenants/[tenantId]/shifts/csv/route.ts`。**CSV を先に通す**（フォントも react-pdf も要らないので、
   Route Handler の骨格・認可・ファイル名・ヘッダだけを切り分けて確かめられる）
7. `lib/pdf/`（`fonts` → `paginate` + Vitest → `styles` → `cellStyle` + Vitest → `ShiftPdfDocument`）
8. `api/tenants/[tenantId]/shifts/pdf/route.ts` + `next.config.ts` の `outputFileTracingIncludes`
9. `ShareMenu` / `Toolbar` に項目を足す
10. 検証: `npm run lint` / `npm run typecheck` / `npm test` / **`npm run build`** + ブラウザ
    - **CSV**: Excel（Windows）で開いて文字化けしない。`?encoding=utf8` で BOM 付き UTF-8 になる。
      `file` / `xxd` で先頭バイトを確認。スタッフ名に `,` と `"` と絵文字を入れて、列がずれず絵文字が `〓` になる
    - **PDF**: 1 か月（31 日）× スタッフ 14 人以上で**2 ページに割れる**。2 ページ目にも見出し・日付行・凡例が出る。
      確定が塗り + 白文字 + 太字、下書きが白地 + 上辺の帯。**白のパターンで確定と下書きが太字で見分けられる**
    - **フォント**: スタッフ名に `髙` `﨑` `濵` `𠮟`、パターン名に `①` を入れて**豆腐が出ない**。
      出力 PDF が数百 KB に収まる（サブセット化が効いている。スパイクの実測は 8 ページで 304KB）
    - **折り返しと行高**: 6 文字のパターン名・10 文字のスタッフ名・12 文字のメモが、セルからはみ出さず複数行に折り返り、
      **3 行目が下で切れていない**（`lineHeight: 1` が効いている。§5.5）
    - **週の周期**（7 列）と**月の周期**（28〜31 列）の両方で列幅が破綻しない
    - **PDF のタブ名**: 別タブで開いたときタブに `シフト表 9月1日 〜 9月30日` が出る（URL ではない）
    - **モバイル（実機）**: iPhone の Safari で「PDFファイルを作成」が別タブで開き、「CSVエクスポート」が
      ファイルとして保存できる。メニューが 390px 幅で崩れない（009 と同じ確認幅）
    - **旧 URL**: `/tenants/<22文字トークン>/shifts.pdf?start_date=2026-09-01` が 308 されて PDF が出る。`.csv?encoding=utf8` も同様
    - **認可**: 他人の店舗の `tenantId` を URL に入れると 404。未ログイン（別ブラウザ）で開くと `/login?next=/api/...` へ飛ぶ
    - **`?start=` の異常系**: 無い / `2026-02-30` / `abc` のいずれでも今月の表が出る（エラーにならない）
    - **スタッフ 0 人 / パターン 0 個**の店舗でも PDF が 1 ページ出て、CSV がヘッダ 2 行で出る
    - `npm run build` 後に `.next/standalone` 相当のトレースへフォントが入っていること（`ls .next/server/app/api/.../*.nft.json` を確認）。
      **入っていないときの症状は豆腐ではなく 500**（`fontkit.open` が ENOENT を投げる）なので、`.nft.json` を見るのが唯一の事前確認になる
    - レスポンスヘッダが `Cache-Control: private, no-store` で、PDF が `inline`、CSV が `attachment`
11. プランに実装ログを追記してからコミットの確認を取る

---

## 7. スコープ外

- 集計（アサイン数）の PDF / CSV 出力（v1 にも無い。008 §7）
- 公開共有ページ（`/share/[code]`）からの PDF / CSV（v1 に無い。URL を知っているだけの人にファイルを配らない）
- CSV の文字コードを選ぶ UI（v1 も URL の隠しパラメータだけ。§3.11 の表には入れず、v1 のまま据え置く）
- Excel（.xlsx）出力・印刷用 CSS（v1 に無い）
- PDF のテンプレート設定（用紙・向き・行数の店舗ごとの設定）
- `?debug=true`（v1 が PDF を HTML で出していた開発用の裏口）
- 自動アサイン（Phase 1 全体のスコープ外）

### 7.1 後続マイルストーンへの申し送り

- **011（静的ページ）**: `(public)` グループに LP を足すときも、`/api/` 配下は関係しない（proxy の `PROTECTED_PREFIXES` に
  `/api/tenants` があり、LP からは参照しない）。**`assets/fonts/` を `public/` に移さない**こと。移すと約 9.2MB が CDN から
  誰でも落とせるようになり、`outputFileTracingIncludes` も効かなくなる
- **012（移行）**: 移行検証の「v1 と v2 の CSV を突き合わせる」（001 §5）は**バイト比較でよい**。改行（LF）・日付書式（`%Y-%m-%d`）・
  引用規則・`〓` への置換を v1 に合わせてある。差が出るとすれば「v1 が 10 文字を超えるスタッフ名を `truncate` していた行」で、
  012 が DB 側で切り詰めるので、切り詰め後は一致するはず
- **013（カットオーバー）**: `assets/fonts/**` がデプロイに含まれていないと、**PDF ルートが全リクエストで 500 になる**
  （`fontkit.open` の ENOENT。豆腐にはならない）。本番で 1 回 PDF を開いて確かめる。
  生成時間はローカルのスパイクで 31 日 × 100 人 = 約 1 秒だったので、コールドスタートを足しても Vercel の既定タイムアウトに収まるはず。
  レスポンスも 304KB で、Vercel の 4.5MB 上限には遠い
- **Phase 2**: PDF を `renderToStream` にする余地がある。大きな店舗で初バイトまでの時間が問題になったときに検討する

---

## 8. プランのセルフレビュー（2026-09-20）

実装前に観点を変えながらプランを読み直した記録。

### 8.1 1 回目: 確かめて、そのままでよかったもの

- **`/api/tenants` は既に保護されている**。`utils/supabase/proxy.ts` の `PROTECTED_PREFIXES` に入っていて（005 で先に入れてあった）、
  未ログインは `/login?next=/api/tenants/.../shifts/pdf` へ飛ぶ。`config.matcher` の除外は `_next/static` と画像・フォントの**拡張子**なので、
  `/api/...`（拡張子なし）は matcher に掛かる
- **旧 URL の着地点が既にある**。`legacyUrl.ts` の `EXPORT_PATHS` が `shifts.pdf` → `pdf` を持ち、`start_date` → `start` も書き換える。
  `encoding` のような他のクエリは順序ごと残るので、v1 の `?encoding=utf8` のブックマークもそのまま動く
- **`dateRange()` が期間の上限を構造的に保証する**。`?start=` をどういじっても 31 日を超える範囲は作れないので、
  エクスポートに `refineTerm` 相当の検査は要らない
- **`notFound()` は Route Handler で使える**（`not-found.md` に「Serving a 404 from a Route Handler」の節がある）。
  `page.tsx` と同じ書き方で 404 にできる
- **`formatJapaneseMonthDay()` が既にある**（`9月18日`）。v1 PDF の見出し `%-m月%-d日` にそのまま使える

### 8.2 プランを直したところ

| 直した点 | 理由 |
| --- | --- |
| フォントを URL ではなく**ファイルパス**で登録する（§3.4） | 001 §4.5 は「自オリジン URL から読み込む」だったが、`@react-pdf/font` の実装を読むと非 URL 文字列は `fontkit.open()` = ファイルパスになる。自分自身への fetch は preview の Deployment Protection で認証 HTML を掴む |
| `serverExternalPackages` への追加を**やめた**（§2） | `@react-pdf/renderer` は Next の自動 opt-out リストに既に入っている。書いても無害だが、要らない設定を足すと「なぜ必要か」が誰にも説明できなくなる |
| `outputFileTracingIncludes` のキーを `/api/tenants/*/shifts/pdf` にする（§3.4） | picomatch の glob なので `[tenantId]` は文字クラスとして解釈される。ドキュメントの例もブラケットをエスケープしている |
| `registerHyphenationCallback` を**必須**として §3.5 に独立させた | 最初は「必要なら入れる」程度に書いていた。列幅 23.6pt に 51pt の文字列が入るので、無いと表が崩れる。プランに書かないと実装時に気付けない |
| CSV を「文字列を作る」「バイト列にする」の 2 段に分けた（§3.6） | 1 つの関数にすると、行の並びのテストに `iconv-lite` が必要になる |
| 改行を CRLF にせず LF のままにした（§3.6） | 一度は「Excel 向けなら RFC 4180 の CRLF」と考えたが、012 の検証手段（v1 と v2 の CSV 比較）が全行差分になる。Excel は LF でも開ける |
| Bold フォントを**同梱する**ことにした（§3.4） | 4.66MB を節約するために Regular だけにしようとしたが、**白のパターンでは太字が確定と下書きを分ける唯一の手がかり**だと気付いた（塗りも文字色も下書きと同じになる） |
| キャッシュバスターを `Cache-Control` に置き換えた（§3.10） | v1 の `v: Time.now.to_i` をそのまま移すと、href に `Date.now()` が入ってハイドレーション不一致になる |

### 8.3 2 回目のレビュー（v1 パリティを 1 行ずつ突き合わせる）

`index.csv.ruby` と `index.pdf.slim` を上から順に読み直した。

- **CSV のメモ行は無条件に出す**が、**PDF のメモ行は `@events.present?` のときだけ**。非対称だが v1 がそうなっている。
  CSV は列構造が安定するほうが機械処理に都合がよく、PDF は空行が縦を食うので、どちらも理由のある挙動として写す（§5.4 / §5.5 に明記）
- **CSV の日付は `%Y-%m-%d`**（`2026-09-01`）で、画面の `9/1` ではない。`formatMonthDay()` を使いたくなるので §5.4 に釘を刺した
- **v1 PDF は毎ページ凡例まで繰り返す**（`p.footer` がループの中）。「凡例は最終ページだけ」と誤読しかけた
- **v1 PDF の `truncate`** は v2 では不要（DB の CHECK + 012 の切り詰め）。§3.11 に「変えるところ」として明記した
- **v1 PDF の日付ヘッダが web と逆**だった。これは v1 のバグに近い不整合なので、v2 の画面に合わせる判断を §3.8 に独立させた

### 8.4 3 回目のレビュー（セキュリティ・認可）

- **service_role を使わない**ことを §3.3 に明記した。009 で `publicShare.ts` という例外を作ったばかりなので、
  「エクスポートも DB 直読でいいのでは」と流れる余地を先に塞いでおく
- **`isUuid()` の検査を `getTenant()` より前に置く**（§5.1）。`page.tsx` と同じ理由（22P02 でログが汚れる）
- **認可の入口を `loadShiftExport()` 1 本に絞った**。ルートが 2 本あって両方が個別に認証を書くと、片方だけ抜ける
- **`?start=` を失敗にしない**ので、エクスポートに「入力が悪い」経路が無い。攻撃面はルートパラメータの `tenantId` だけになる
- 404 と 401 の使い分けを表にした（§3.2）。「未ログインを 404 にする」案も考えたが、到達したときにデバッグできなくなるのでやめた

### 8.5 4 回目のレビュー（コードを書くつもりで寸法と型をなぞる）

- **A4 横で 31 列の幅を実際に計算した**: 841.89 − 56.7（余白）− 53.9（名前列）= 731pt ÷ 31 = 23.6pt/列。
  本文 8.5pt だと 1 行 2.8 文字しか入らない。6 文字のパターン名は 3 行になり、行高 31.2pt にぎりぎり収まる。
  **この計算が §3.5（折り返し）の根拠**なので §5.5 に残した。
  — ただしこの時点の計算は**行高を 1.0 と暗黙に仮定していた**。CJK フォントの自然な行高が 1.448 倍であることに
  気付いたのは 6 回目（§8.9 F4）で、**4 回目のこの計算は「ぎりぎり収まる」ではなく「はみ出す」が正解だった**
- **`cellStyle()`（web）を PDF で使い回さない**ことを §3.9 に書いた。`CSSProperties` と react-pdf の `Style` は別物で、
  型を緩めて共用すると「web で効いているつもりの指定が PDF では無視される」壊れ方をする
- **下書きの色帯は `borderTopWidth` で描く**。v1 は絶対配置の `span` を重ねていたが、react-pdf でも web でも border で足りる
- **`renderToBuffer` の戻りは `Buffer`**（型定義で確認）。`Response` にそのまま渡せるはずだが、渡せなければ `new Uint8Array()` と §5.2 に逃げ道を書いた
- **`Font.register` はモジュールのトップレベルで 1 回**。リクエストごとに呼ぶと FontSource が積み上がる
- **日本語ファイル名は RFC 5987**。`Content-Disposition` に生の日本語を入れるとヘッダが壊れる。ASCII フォールバックも併記する（§5.3）

### 8.6 4 回目で確かめて、変えなかったもの

- **`ShiftTable` と 009 の `SharedShiftTable` を統合しない**。形は近い（`start` / `end` / `staffs` / `patterns` / `shifts` / `notes`）が、
  公開ページは `holidays` を自前で解決し、`dates` も自分で作っている。統合すると 009 のコードを触ることになり、
  010 の検証範囲が公開ページまで広がる。**013 の本番 push 前に触る範囲は狭く保つ**
- **`lib/export/` を作る**（`lib/actions/` に入れない）。`lib/actions/` は Server Action の枠組みで、
  `ActionResult` を返さない Route Handler の道具を混ぜると「`runAction` を使わないのはなぜか」が読めなくなる
- **CSV に UI を付けない**。v1 と同じ隠しパラメータのままにする。メニューに項目が 2 つ並ぶと、
  ほとんどの人には違いが分からない（「Excel用」と「UTF-8」のどちらを押すべきかは、押してみるまで分からない）
- **PDF をストリームにしない**。失敗したときに壊れたファイルを返すほうが、数百 ms 遅いことより悪い

### 8.7 5 回目のレビュー（実装順序と検証手段）

- **CSV を先に通す**順序にした（§6-6）。Route Handler の骨格・認可・ファイル名・ヘッダを、
  フォントと react-pdf という 2 つの未知から切り離して確かめられる。PDF で詰まったときに「ルート側は正しい」と言い切れる
- **`npm run build` を検証に入れた**。`outputFileTracingIncludes` は dev では効かない（dev は `process.cwd()` にファイルがある）ので、
  **ビルドしないとフォントの取りこぼしに気付けない**。`.nft.json` を見る手順も足した
- **豆腐の検証に具体的な字を書いた**（`髙` `﨑` `濵` `𠮟` `①`）。「日本語が出ること」だけだと、
  常用漢字しか試さずにサブセットの穴を見逃す
- **週の周期（7 列）でも確かめる**。31 列だけ見ていると、列が少ないときに `flex: 1` が伸びすぎる不具合を見逃す
- **スタッフ 0 人**を検証に入れた。v1 は `each_slice` が空になって中身のない PDF を返していた。v2 は 1 ページ返す（§5.5）

### 8.8 収束の判断（1 回目）

5 回目で新しい指摘が「検証手順の具体化」だけになり、設計の決定（§3）は 2 回目以降変わっていない。
残る不確かさは**実装しないと分からないもの**に絞られたので、そこだけスパイクで潰してから実装に入る（§8.9）。

### 8.9 6 回目のレビュー（スパイクで実測する）

「実装しないと分からない」と書いた項目を、使い捨ての scratchpad（`@react-pdf/renderer` 4.9.0 + 実フォント、プロジェクトには触れない）で測った。
**ここで F4 が見つかった。プランの寸法表どおりに実装していたら、全セルで文字が切れていた。**

| 測ったこと | 結果 | プランへの反映 |
| --- | --- | --- |
| CID-keyed CFF のサブセット化 | **動く**。31 日 × 14 人 = 311ms / 63KB、31 日 × 100 人（8 ページ）= **1009ms / 304KB** | §3.4。退避路（可変 TTF）が不要になった |
| グリフ網羅 | 17,936 glyphs。`髙` `﨑` `濵` `𠮟`（サロゲートペア）`①` すべて有り | §3.4 |
| `fontkit.openSync` | **2ms**（遅延解析） | 「コールドスタートのフォント解析」の懸念を取り下げた |
| hyphenation callback | show-text 命令が **232 → 654**（無しでは折り返さない） | §3.5 に数値を追記 |
| Vercel のレスポンス上限 4.5MB | 304KB で遠い | §7.1 |

**F4（`lineHeight` の欠落。§5.5 に反映）**: 寸法表に v1 の font-size と行高だけを写し、**`line-height` を落としていた**。
Noto Sans CJK は `ascent 1160 / descent −288` で自然な行高が **1.448 倍**あり、8.5pt × 1.448 × 3 行 = 36.9pt が
行高 31.2pt を超える。v1 の `line-height: 3mm`（= 1.0）は CJK の行間を潰すための指定で、
**寸法表の中で唯一「移し忘れると静かに壊れる」値**だった。スパイクが動いたのは偶然 `lineHeight: 1` を書いていたから。

**F1（§7.1 の誤り）**: 「フォントが入っていなければ豆腐が出る」と書いていたが、ファイルが無ければ `fontkit.open` が
**ENOENT を投げて 500** になる。豆腐が出るのは「ファイルはあるがグリフが無い」ときだけで、症状が逆だった。

**F3（退避路が要件を落としていた）**: 「CFF が壊れたら可変 TTF に切り替える。その場合 Bold は諦める」と書いたが、
§3.4 で **Bold は白パターンの確定/下書きを分ける唯一の手がかり**だと決めている。退避路が黙って要件を捨てていた。
CFF が動くことを実測したので、**この退避路ごと削除した**。

**F5（`<Document title>` の欠落。§5.5 に反映）**: `Content-Disposition: inline` で別タブに開くと、ブラウザのタブに出るのは
ファイル名ではなく **PDF の Title メタデータ**。v1 も `<title>` を持っていた。

**F6（モバイル検証の欠落。§6-10 に反映）**: 009 には 390px の確認があったのに落としていた。
iOS Safari の `target="_blank"` + `inline` PDF と CSV のダウンロードは実機でしか分からない。

**F2**: フォントサイズを MiB で書いていた（実ファイルは 4,533,028 バイト）。10 進に直した。

### 8.10 6 回目で確かめて、変えなかったもの

- **`loadShiftExport` の戻り値は `ShiftTable | null` のまま**。「`null` は未ログインだけ」という契約が読み手に伝わりにくいのは確かだが、
  判別可能な union にすると呼び出し 2 か所のために型が増える。**`requireTenant` と同じで「先に弾いておけば以降は 1 通りになる」形**なので、
  JSDoc でその契約を明示するほうに寄せた（§5.1）
- **404 のボディを設計しない**（§3.2）。到達経路が「他人の店舗 id」か「壊れた id」しかなく、旧 URL のブックマークは
  `legacyUrl.ts` が正しい uuid に書き換えるので普通の利用では踏まない
- **PDF 生成中に新規タブが白いままなのは許容する**（§8.11）。v1 も同じで、1 秒前後。
  ローディング表示を出すにはクライアント側で fetch → blob に作り替えることになり、`target="_blank"` の素直さを失う

### 8.11 残る制約（実装時に踏まえる）

- **`registerHyphenationCallback` はグローバル**。react-pdf のフォント設定はプロセス単位なので、
  将来ほかの PDF を足すときに同じ規則が適用される
- **PDF の色（赤・青）が Mantine の変数と二重管理になる**（§3.8）。`theme.ts` の色を変えたら `lib/pdf/styles.ts` も直す。
  `theme.other.calendarColors` に切り出して CSS からも引く案は、007 の CSS を触ることになるので採らなかった
- **PDF 生成中は新規タブが白いまま**（約 1 秒 + コールドスタート）。モバイルでは固まったように見えうる。
  気になるようなら Phase 2 でストリーミングかローディング表示を検討する
- **スパイクは Next の外で測った**。`@react-pdf/renderer` は Next の自動外部化でネイティブ `require` されるので
  `react-server` 条件を踏まないはずだが、`ShiftPdfDocument.tsx` の JSX は Next がバンドルする。
  **§6-8（PDF ルートを通す）が実質この確認**になる

### 8.12 7 回目のレビュー（初見の実装者として読み、文書としての整合を見る）

「このプランだけ渡されたとき、手が止まる箇所はないか」という観点で読み直した。**設計の決定（§3）は 1 つも変わらず、
出たのは接合部の詰めだけ**だった。

| # | 指摘 | 直したところ |
| --- | --- | --- |
| G1 | 複数ページの `1 / 3` に `Text` の `render` コールバックを使うと書いていたが、**ページ分割は `chunkRows()` で自分が持っている**。react-pdf にページ番号を数え直させる必要は無く、添字と `chunks.length` を埋めれば決定的になる | §3.11 |
| G2 | `getShiftTable(tenantId, range)` の戻りに `tenantName` が入っているのに、**その出どころが書いていなかった**。実装者は「中でもう一度 `getTenant()` を呼ぶのか」で迷う。`getShiftTable(tenant, range)` にして呼び出し元が持っている値を渡す | §3.3 / §5.1 / §4 |
| G3 | `iconv-lite` は react-pdf と違って**自動外部化リストに入っていない**。§2 で「react-pdf に `serverExternalPackages` は不要」と書いたので、一般則と誤読されうる | §5.4 |
| G4 | `ShareMenu` の props を `exportHref`（実体はベースパス）にしていた。`tenantId` + `start` のほうが `Toolbar` の持ち物と一致する | §5.6 / §4 |
| G5 | `lib/pdf/cellStyle.ts` が `components/shiftTable/cellStyle.ts` と基底名で衝突する。`pdfCellStyle.ts` に改名。`Style` 型は `import type` で引く（値 import だと Vitest が react-pdf を読む） | §5.5 / §4 |
| G6 | 「なぜルート自身が認証を見るのか」が書いていなかった（**`app/api/` は `(protected)/layout.tsx` の外**） | §3.2 |

### 8.13 収束の判断（最終）

- **6 回目（スパイク）は設計を壊す欠陥を 1 つ見つけた**（F4 = `lineHeight` の欠落。そのまま実装していたら全セルで文字が切れていた）
- **7 回目は接合部の命名と署名だけ**で、§3 の決定にも §5 の構造にも触っていない
- 指摘の質が「壊れる」→「迷う」に落ちたので、**ここで収束と判断する**。これ以上はレビューではなく実装で潰すべき段階

残る未確認は §8.11 の 1 点（Next のバンドル下での react-pdf）だけで、これは**書いてみないと分からない種類**のもの。
§6 の手順が CSV → PDF の順になっているので、そこで詰まっても切り分けられる。

---

## 9. 実装ログ（2026-09-20）

ブランチ `009-share` のまま実装（010 用のブランチは切っていない）。Next 16.3.5 / React 19.2.8 /
`@react-pdf/renderer` 4.9.0 / `iconv-lite` 0.7.3。スキーマは触っていないので `db reset` / pgTAP は実行していない。

### 9.1 成果物

§4 の構成どおり。プランと変えたのは次の 6 点だけ。

| パス | プランとの差 |
| --- | --- |
| `src/lib/pdf/mm.ts` | **追加**。`mm()`（mm → pt）を `styles.ts` から切り出した。`pdfCellStyle.ts` も帯の幅にこれを使うが、あちらは Vitest の対象なので react-pdf を読ませられない（§8.12 G5 と同じ理由）。`2.8346` を 2 か所に書くより 1 ファイル増やすほうがよい |
| `src/lib/pdf/pdfCellStyle.ts` | `pdfDraftBandStyle()` を**追加**し、帯を `borderTopWidth` から**絶対配置の `View`** に変えた（§9.4 の F8）。`pdfCellStyle()` は確定のときだけ style を返す形になった |
| `src/lib/pdf/fonts.ts` | 折り返しのコールバックを「1 文字ずつ」から「**文字の間にソフトハイフンのパートを挟む**」に変えた（§9.4 の F7）。CJK 判定（`HAS_CJK`）は不要になったので消した |
| `src/lib/export/filename.ts` | `pdfAsciiFilename()` を**追加**。`contentDisposition()` の第 3 引数（ASCII フォールバック）を呼び出し側が渡す形にした。PDF ルートで `csvFilename().replace(/\.csv$/, '.pdf')` と書くほうが読めない |
| `src/lib/csv/encode.ts` | `csvContentType()` を**追加**。§3.11 の「CSV の `Content-Type` に charset を明示」を関数にしただけだが、§5.4 の API 一覧には無かった |
| `src/app/api/tenants/[tenantId]/shifts/pdf/route.tsx` | 拡張子が **`.tsx`**（JSX を書くため）。`pageExtensions` の既定に `tsx` が入っているので Route Handler でもそのまま動く |

### 9.2 プランどおり確認できたこと

- **`Font.register` にファイルパスを渡せる**（§3.4）。`assets/fonts/` の絶対パスで登録し、自オリジンへの `fetch` は無し
- **`@react-pdf/renderer` に `serverExternalPackages` は要らなかった**（§2）。`iconv-lite` もバンドルされたまま動いた（`.nft.json` に `iconv-lite` が出ないのは、外部化されずにバンドルへ取り込まれたということ）
- **`outputFileTracingIncludes` のキーは `/api/tenants/*/shifts/pdf`** で当たる。`npm run build` 後の
  `.next/server/app/api/tenants/[tenantId]/shifts/pdf/route.js.nft.json` にフォント 2 本と `LICENSE.txt` が入った。CSV 側には入らない
- **`notFound()` は Route Handler で 404 を返す**。他店舗・存在しない uuid・uuid でない文字列がすべて 404
- **`renderToBuffer` の戻りは `Buffer`**。`new Uint8Array(buffer)` で `Response` に渡した
- **`dateRange()` が期間の上限を構造的に保証する**。`?start=2020-01-15` でも `?start=2099-12-01` でも日付は 31 列で止まる
- **旧 URL がそのまま着地する**。`/tenants/<22文字>/shifts.pdf?start_date=…&v=123` → 308 → PDF、`.csv?…&encoding=utf8` → 308 → BOM 付き UTF-8
- **`Document title` がタブに出る**（§8.9 F5）。生成 PDF の Title メタデータは `シフト表 9月1日 〜 9月30日`
- **`chunkRows` はスタッフ 0 人でも 1 ページ返す**。見出し + 日付行 + `© assift` だけの PDF が出る（CSV はヘッダ 2 行）
- スパイクの実測（§8.9）どおりの速度・サイズ。本番ビルドで 31 日 × 16 人（2 ページ）= **125KB / 0.5 秒**

### 9.3 検証結果

```
npm run lint / typecheck / build / format:check → OK
npm test → 42 files / 344 tests passed（010 で 5 ファイル / 43 件を追加）
```

ブラウザ検証は本番ビルド（`next start`）に対して行い、PDF は macOS の PDFKit でページを切り出して画像化して見た。
画面操作は headless Chrome を CDP で駆動（1400px / 390px）。

| 検証 | 結果 |
| --- | --- |
| 共有メニュー | `URLでシフト表を共有` / 区切り線 / `PDFファイルを作成` / `CSVエクスポート`（v1 と同じ並び）。href は `/api/tenants/<id>/shifts/{pdf,csv}?start=2026-09-01`、PDF だけ `target="_blank" rel="noopener"` |
| 390px | メニューが viewport 内に収まり、横スクロールしない |
| PDF の見た目 | 見出し（`シフト表` / `9月1日 〜 9月30日` / 店舗名）・日付行・メモ行・セル・凡例・`© assift`。**枠線の太さと地色も v1 の pdf.scss どおり** |
| 改ページ | 16 人 → 2 ページ（13 + 3）。**2 ページ目にも見出し・日付行・メモ行・凡例**。footer に `1 / 2` `2 / 2` |
| 日付ヘッダ | 曜日が上、日が下（§3.8）。日曜・祝日が赤（9/21 敬老の日 / 9/22 国民の休日 / 9/23 秋分の日）、土曜が青 |
| セル | 確定 = パターン色 + 白文字 + 太字 / 下書き = 白地 + 上辺の帯。**白のパターン（休み）は太字だけで確定と下書きが見分けられる** |
| 折り返し | 6 文字のパターン名（`早番①②③`）が 3 行、10 文字のスタッフ名（`長谷川 小次郎`）が 2 行、12 文字のメモ（`避難訓練と面談日`）が 3 行。**3 行目が切れず、ハイフンも入らない** |
| フォント | `髙` `﨑` `濵` `𠮟`（サロゲートペア）`①` がすべて出る（豆腐なし）。絵文字はグリフが無いので `.notdef`（v1 は OS のフォントで色付き絵文字が出ていた。スコープ外） |
| 周期 | 月（30 列）と週（7 列）の両方で列幅が破綻しない |
| 空の店舗 | スタッフ 0 人・パターン 0 個で PDF が 1 ページ（ページ番号は出ない）、CSV がヘッダ 2 行 |
| CSV（CP932） | Excel 向けの Shift_JIS。`あ` = `0x82A0`、絵文字 = `〓`（`0x81AC`）、`髙﨑濵①` はそのまま。行がずれない |
| CSV（`?encoding=utf8`） | 先頭 `EF BB BF` + UTF-8。`Content-Type: text/csv; charset=utf-8` |
| CSV の中身 | 1 行目 = 空 + `YYYY-MM-DD`、2 行目 = 空 + メモ（**メモ 0 件でも出る**）、以降 = スタッフ名 + パターン名。`"棚卸し,""要確認"""` の引用も v1 と同じ |
| ヘッダ | PDF = `inline` + RFC 5987（`filename*=UTF-8''%E5%8B%A4…`）+ ASCII の `shifts_….pdf`、CSV = `attachment`。どちらも `Cache-Control: private, no-store` |
| 認可 | 他店舗・存在しない uuid・`not-a-uuid` はすべて 404。未ログインは proxy が `/login?next=/api/tenants/…` へ 307 |
| `?start=` の異常系 | 無し / `2026-02-30` / `abc` のいずれでも今月（`2026-09-01`〜）の表が出る。エラーにしない |
| 旧 URL | `?start_date=` → `?start=` に書き換わり、`encoding` / `v` は残ったまま 308 → 200 |

**モバイル実機（iPhone Safari）の確認は行っていない**（§6-10 の F6）。390px の headless Chrome までは見たので、
`target="_blank"` の inline PDF と CSV のダウンロードだけが未確認。013 のカットオーバー前に実機で見る。

ローカル DB に入れた検証用データ（スタッフ 8 人・9 月のシフト・メモ 3 件・店舗 2 件）は検証後に削除し、
もともとあった 4 件のシフトを元の値に戻してある。

### 9.4 実装して分かったこと（プランに無かったこと）

**F7: 1 文字ずつ返すハイフネーションは、改行位置に `-` を挿す。**
§3.5 の `Array.from(word)` をそのまま書いたら、`早番①②③` が `早-` / `番-` / `①-` と割れた。
`@react-pdf/textkit` はコールバックが返したパートの境目を**ペナルティ節点**にし、そこで折り返すと
`insertGlyph(…, HYPHEN, …)` でハイフンを 1 文字足す（`breakLines()`）。しかも `hyphenWidth = 5` を食うので
1 行 1 文字しか入らなくなる。§8.9 のスパイクは「show-text 命令が 232 → 654 に増えた」ことしか見ておらず、
**折り返しの中身を読んでいなかった**ので気付けていなかった。

解は `wrapWords()` の実装にあった: パートは `removeSoftHyphens()` を通ってから `join('')` で元の文字列に戻る。
そこで**文字の間にソフトハイフンのパートを挟む**と、

- 描画される文字列は元のまま（ソフトハイフンは取り除かれる）
- 空文字のパートは `s.trim() === ''` で**幅 0 のグルー**になる = ハイフンの付かない改行機会
- 空文字は falsy なので `if (syllables[index + 1] && hyphenated)` が偽になり、ペナルティ節点が付かない

ついでに**語の種類で分けるのをやめた**。§3.5 は「ラテン文字だけの語は分割しない」としていたが、それは
1 文字ずつ縦に割れるのを避けるための条件で、ソフトハイフン方式では入る分だけ入る（`Alexander` → `Alex` / `ande` / `r`）。
v2 の画面（`ShiftTable.module.css`）がセルにもスタッフ名にも `word-break: break-all` を当てているので、こちらのほうが画面と揃う。

**F8: yoga の `height` は border-box。帯を `borderTopWidth` で描くと 3 行目が切れる。**
§5.5 は「v1 のように絶対配置の `span` を重ねず `borderTopWidth` で描く」としていたが、実装して測ると
行の高さ 11mm（31.2pt）から**行の罫線 0.6mm と帯 1.5mm が引かれて**セルの文字領域が 25.2pt しか残らず、
本文 8.5pt × `lineHeight: 1` × 3 行 = 25.5pt が 0.3pt 足りない。`@react-pdf/textkit` の `typesetter()` は
高さが足りないと `truncateMode` に関わらず `truncate()` するので、**症状は「はみ出す」ではなく「`…` に丸められる」**。

これは §8.9 の F4（`lineHeight` の欠落）と同じ種類の見落としで、F4 の計算が「行の高さ 31.2pt にぎりぎり収まる」で
止まっていて、**罫線と帯を引いていなかった**。v1 が帯を絶対配置にしていたのは（おそらく）同じ問題を踏んだからで、
プランは v1 の実装を「web と同じ考え方」で上書きしようとして、v1 が持っていた理由を落としていた。

**F9: `color` / `fontWeight` / `lineHeight` は `View` から `Text` に継承される。**
`pdfCellStyle()` がセルの `View` に当てた色と太さがそのまま文字に効くか分からなかったので、
最小の PDF を描いてコンテンツストリームを inflate して確かめた（`1 0 0 scn` が出る / `Helvetica-Bold` が選ばれる）。
`@react-pdf/layout` の `BASE_INHERITABLE_PROPERTIES` に `color` `fontWeight` `lineHeight` `textAlign` が入っている。
`undefined` の値はスタイルの合成（`mergeStyles`）で捨てられるので、`fixedTextColor()` が `undefined` を返す
白いパターンでは Page の既定色がそのまま残る（意図どおり）。

**F10: iconv-lite の CP932 は往復比較で「表せない文字」を判定できる。**
`decode(encode(ch)) !== ch` は `U+301C`（波ダッシュ）のような Ruby でも未定義の文字だけを弾き、
`U+FF5E`（全角チルダ）や `①` `髙` `﨑` `濵` は素通しする。Ruby の CP932 と同じ挙動になった。
1 文字ずつ往復すると 10 万文字で 120ms かかるので、**先に文字列全体を往復して一致すればそのまま返す**
（一致するなら全文字が表せている）。実データではこちらしか通らない。

**F11: 検証用に一時的な `distDir` が要った。**
`npm run build` は `.next` を作り直すので、動いている `next dev` と衝突する。
`distDir: process.env.BUILD_DIST_DIR ?? '.next'` を一時的に足して別ディレクトリへビルドし、検証後に戻した
（`next build` は `tsconfig.json` の `include` にその distDir の型パスを書き足すので、そちらも戻した）。
**最後に素の `npm run build` を 1 回通して**、コミットする設定でビルドが通ることと `.nft.json` の中身を確認している。

### 9.5 プランのままにしたこと

- **`loadShiftExport()` の戻り値は `ShiftTable | null`**（§8.10）。実装しても「`null` は未ログインだけ」で読み違えなかった
- **`ShiftTable` と 009 の `SharedShiftTable` を統合しない**（§8.6）。009 のコードは 1 行も触っていない
- **CSV の文字コードに UI を付けない**（§7）。`?encoding=utf8` の隠しパラメータのまま
- **PDF をストリームにしない**（§8.6）。本番ビルドで 0.5 秒だったので Phase 2 送り
- **`components/shiftTable/` を PDF で再利用しない**（§3.9）。共有したのは `fixedTextColor` / `outlineColor` /
  `WEEKDAY_LABELS` / `holidaysIn` / `dayOfMonth` / `formatJapaneseMonthDay` / `toShiftMap` / `cellKey` の 8 つだけ

---

## 10. 実装後のレビュー（2026-09-20、1 巡目）

§1 の完了条件・§3 の決定・§4 の成果物・§5 の設計を 1 項目ずつコードと突き合わせた。
**設計の決定（§3）はすべてそのまま実装できていた**が、v1 パリティの細部で 2 つずれていたので直した。

### 10.1 直したところ

| # | ずれ | 直し方 |
| --- | --- | --- |
| R1 | **凡例のコロンが抜けていた。** §4 の文言表と §5.5 が `名前：説明` としているのに、009 の `PatternDescriptionList`（画面・公開ページ）を見ながら書いたので「枠 + 説明」になっていた。§3.11 の「変えるところ」にコロンを外す変更は入っていない | `<Text>：{pattern.description}</Text>` にし、枠の `marginRight` を外して `早番：7-15時` と続くようにした。**画面の凡例（コロン無し）とは違う**が、PDF は v1 の文言を写す約束なのでプランの側に寄せた |
| R2 | **メモ行の上罫線がスタッフ名列にも引かれていた。** v1 は `tr.event-area th:not(:first-child)` で日付セルだけに付けている。実装では行の `View` に `borderTopWidth` を当てていたので、表の左上（名前列）にも線が出ていた | `styles.noteRow` を `styles.noteCellBorderTop` に変え、日付セル側に移した |

どちらも本番ビルドで再描画して目視で確認した。

### 10.2 突き合わせて問題が無かったところ

- **寸法**（§5.5 の表）: `mm()` の出力が `8.5 / 11.3 / 5.1 / 14.2 / 31.2 / 53.9 / 2.8 / 1.7 / 4.3 / 28.3` と 1 つ残らず一致
- **文字数の上限と折り返しが噛み合っている**: DB の CHECK は パターン名 6 / スタッフ名 10 / メモ 12 / 説明 10。
  31 日の列幅（21.9pt）で本文 8.5pt なら 2 文字 × 3 行 = 6 文字、メモ 5.1pt なら 4 文字 × 3 行 = 12 文字、
  名前列（48.3pt）なら 5 文字 × 2 行 = 10 文字。**上限いっぱいでも `…` に丸められない**
- **v1 の罫線**: 外枠 1mm / 内側 0.6mm / 名前列の右だけ 1mm / 本体 1 行目の上だけ 1mm / 最終列は右罫線なし、がすべて一致（R2 を除く）
- **ヘッダの組み立て**: `padding-top: 2mm` / `margin-bottom: 4mm` / `.dates { margin-left: 4mm }` / 店舗名は右寄せ
- **`Content-Disposition` に外から値が入らない**: ASCII フォールバックも日本語名も `table.start` / `table.end` 由来で、
  `dateRange()` が返す `YYYY-MM-DD` しか通らない。店舗名のようなユーザー入力はヘッダに載らない（PDF の本文だけ）
- **`?encoding=` の判定は v1 と同じ完全一致**（`UTF8` / `utf-8` は CP932 に落ちる）
- §8.10 の「プランのままにする」判断 4 件は、実装してもどれも覆らなかった

### 10.3 プラン自体の食い違い（実装は §5 に従った）

- §4 は `lib/export/request.ts` の export を **`EXPORT_HEADERS`** と書いているが、§5.1 のシグネチャは
  **`EXPORT_CACHE_CONTROL`**。ヘッダ一式ではなく `Cache-Control` の値 1 つしか共有しないので §5.1 を採った

### 10.4 検証の限界（言葉どおりには確かめていないもの）

- **「Excel（Windows）で文字化けしない」** は、CP932 のバイト列（`あ` = `0x82A0`、`〓` = `0x81AC`、BOM の有無）を
  `xxd` と `iconv` で確かめたところまで。macOS 上なので **Excel では開いていない**
- **モバイルは 390px の headless Chrome まで**。iOS Safari の実機（`target="_blank"` の inline PDF / CSV の保存）は未確認
- **`process.cwd()` 起点のフォントパスは Vercel では未検証**。`.nft.json` に入っていることまでは確認した（013 で本番確認）

---

## 11. 実装後のレビュー（2026-09-20、2 巡目）

「プランの記述と合っているか」ではなく「**壊れる入力はないか**」で読み直した。
**§3.11 の前提が 1 つ崩れていた**ので直した。

### 11.1 R3: `chunkRows()` はページ分割を持っていなかった（ページ番号が嘘をつく）

§3.11 は「ページ分割を自分で持っているので、react-pdf にページ番号を数えさせる必要が無い」として
`chunkRows()` の添字と `chunks.length` を footer に埋めていた。**この前提が成り立っていなかった。**

`<Page>` は入り切らない内容を勝手に次の紙へ送る。凡例が 1 行増えて紙からあふれると:

- **ほぼ白紙の紙が 1 枚増える**（凡例の最終行だけが載り、`© assift` とページ番号は元の紙に残る）
- 紙の枚数と `chunks.length` がずれるので、**印刷した紙に `1 / 2`・(番号なし)・`2 / 2` と刷られる**。
  ページ番号を足した目的（§3.11「紙が 3 枚以上になると順序が分からなくなる」）がそのまま壊れる

再現条件を実測した（31 日 / スタッフ 13 人 / メモ行あり）。**説明つきパターンが 12 件**で紙があふれる
（説明は 10 文字。DB の CHECK 上限）。パターン数に上限は無く、色は 20 色なので**現実に届く**。

| 条件 | 修正前 | 修正後 |
| --- | --- | --- |
| 13 人 / 説明 11 件 | 1 枚 | 1 枚 |
| 13 人 / 説明 12 件 | **2 枚**（2 枚目は凡例の続きだけ、番号なし） | 1 枚 |
| 16 人 / 説明 12 件 | **3 枚**（`1 / 2`・白紙・`2 / 2`） | 2 枚（`1 / 2`・`2 / 2`） |
| 16 人 / 説明 20 件（全パターン） | 3 枚 | 2 枚。**凡例 4 行すべて出る（欠けない）** |

直し方: **`<Page wrap={false}>`**。1 チャンク = 紙 1 枚が保証され、§3.11 の前提が本当になる。
あふれた分は次の紙へ送られず切れるが、**react-pdf の改ページ判定は実際の余白より保守的**で、
20 パターン全部に 10 文字の説明を入れても凡例 4 行が紙に収まった（実測）。
切れるのは凡例の 5 行目以降（= 説明つきパターン 21 件以上）だけで、そこまで行くと
修正前は白紙が 2 枚増えていたので、どちらにしても壊れる領域。**表（本体）は行数が固定なので切れない。**

### 11.2 そのほか、壊れる入力を探して問題が無かったところ

- **`encodeCsv` の全文往復ショートカット**: CP932 は状態を持たない DBCS なので、
  「全文の往復が一致する」⟺「全文字が表せる」。文字単位の判定と結果が変わる入力は作れない
- **`Content-Disposition` に外部の文字列が入らない**: ファイル名は `dateRange()` 由来の `YYYY-MM-DD` のみ。
  店舗名・スタッフ名・パターン名はヘッダに出ない（PDF の本文だけ）
- **`?start=` をどういじっても日付は 31 列で止まる**（`dateRange()` の構造的な上限）
- **表の高さは入力で変わらない**: 行数 13 は固定、メモは 12 文字 = 3 行が上限、日付行も固定。
  あふれうるのは凡例だけ（= R3 の範囲）
- **`csvField` の引用条件**は Ruby CSV と同じ（`,` `"` CR LF）。`\r` 単独も引用する

---

## 12. 実装後のレビュー（2026-09-20、3 巡目）と収束の判断

2 巡目で**指摘の重さが上がった**（見た目のずれ → 印刷が壊れる）ので、収束とは判断せず、
2 巡目と同じ問い（**壊れる入力はないか**）を残りの軸に当てた。

### 12.1 潰した軸（新しい指摘なし）

すべて「スタッフ 13 人 / 20 パターン全部に 10 文字の説明 / 全セル埋め / 年またぎ / 20 文字の店舗名」の最悪ケース。

| 軸 | 結果 |
| --- | --- |
| 4 つの作成周期（`week` 7 列 / `two_week` 14 列 / `half_month` 15 列 / `month` 31 列） | **すべて紙 1 枚**。13 人目まで出る、凡例 20 件すべて出る、`© assift` も出る |
| 年またぎの見出し（`12月27日 〜 1月9日`）+ 20 文字の店舗名 | 1 行に収まる（折り返さない） |
| 14 人以上（2 チャンク）× 説明 20 件 | 紙 2 枚。`1 / 2` と `2 / 2`。**白紙の紙は出ない**（R3 の修正が効いている） |
| スタッフ 0 人・パターン 0 個 | 紙 1 枚（`wrap={false}` にしても変わらない） |
| 年またぎの CSV | `shifts_20261228-20270127.csv` / 18 行（ヘッダ 2 + スタッフ 16） |

`wrap={false}` が**表**を切ることは 4 周期のいずれでも起きなかった（行数 13・行高・日付行・メモ行がすべて固定長のため）。

### 12.2 収束と判断する

- 1 巡目（プラン照合）: R1 / R2 — どちらも見た目・文言のずれ
- 2 巡目（壊れる入力）: **R3 — 印刷したページ番号が嘘をつく**。重さが上がったので収束と判断しなかった
- 3 巡目（2 巡目の問いを残りの軸へ）: **指摘ゼロ**

2 巡目で重くなった問いを最後まで当てて何も出なかったので、ここで収束とする。

### 12.3 残る前提とリスク（収束させずに申し送る）

- **`wrap={false}` は「表は紙からはみ出さない」前提の上に立っている。** いまは行数 13・行高 11mm・
  メモ 12 文字（3 行）がすべて固定なので成り立つが、**この前提を崩す変更をすると表が黙って切れる**
  （修正前は次の紙へ送られていたので気付けた）。`PDF_ROWS_PER_PAGE` や行高、メモの上限、余白を変えるときは
  最悪ケース（§12.1）を描き直すこと
- **凡例は説明つきパターン 21 件以上で切れる。** パターン数に上限は無い（色が 20 色というだけ）。
  20 件までは実測で収まる。ここを超える店舗が出たら、凡例だけ最終ページに 1 回出すなどを検討する
- **401 の経路は一度も実行していない。** proxy が先に redirect するので到達しない（§3.2 のとおり「保険」）
- 未検証のまま残るもの: Vercel 上の `process.cwd()` 起点のフォントパス（013）/ iOS Safari 実機 /
  Excel（Windows）で実際に開くこと（CP932 のバイト列までは確認済み）

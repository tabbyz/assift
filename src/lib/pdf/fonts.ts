import 'server-only'
import path from 'node:path'
import { Font } from '@react-pdf/renderer'

/**
 * PDF の日本語フォント（010 §3.4 / §3.5）。
 *
 * react-pdf の組み込みフォントは標準 14 フォント（Helvetica など）だけで、**日本語は 1 文字も描けない**。
 * `notofonts/noto-cjk` の言語別サブセット（Adobe-Japan1 をフル収録。`髙` `﨑` `濵` も入っている）を同梱する。
 *
 * **URL ではなくファイルシステムのパスで登録する。** `@react-pdf/font` の `_load()` は
 * 「標準 14 フォント名 → data URL → URL → それ以外は `fontkit.open(src)`」の順に解決するので、
 * パスを渡せる。自オリジンへの `fetch` は preview の Deployment Protection で認証 HTML を掴む。
 *
 * **ファイルは `next.config.ts` の `outputFileTracingIncludes` でバンドルに入れる。**
 * ここでパスを実行時に組み立てるので、Next のトレーサは参照を追えない。
 * 入っていないときの症状は豆腐ではなく **500**（`fontkit.open` の ENOENT）。
 */
export const PDF_FONT_FAMILY = 'Noto Sans JP'

const FONT_DIR = path.join(process.cwd(), 'assets/fonts')

Font.register({
  family: PDF_FONT_FAMILY,
  fonts: [
    { src: path.join(FONT_DIR, 'NotoSansJP-Regular.otf'), fontWeight: 400 },
    // Bold は確定セルの太字に要る。**白のパターンでは太字が確定と下書きを分ける唯一の手がかり**（§3.4）
    { src: path.join(FONT_DIR, 'NotoSansJP-Bold.otf'), fontWeight: 700 },
  ],
})

/**
 * ソフトハイフン。`wrapWords()` が各パートから取り除くので、**空文字のパート**になる（下記）。
 */
const SOFT_HYPHEN = '\u00AD'

/**
 * **これが無いと表が崩れる**（§3.5）。react-pdf の行分割はスペースとハイフンしか改行機会にしないので、
 * 空白の無い日本語は 1 語として扱われ、セル幅（31 日で約 23.6pt）を越えてもはみ出したまま描かれる。
 *
 * **1 文字ずつに分けるだけでは駄目だった**（実装時に判明）。`@react-pdf/textkit` は
 * コールバックが返したパートの境目を「ペナルティ節点」にし、**そこで折り返すとハイフンを 1 文字挿入する**
 * （`breakLines()` の `insertGlyph(..., HYPHEN, ...)`）。`早番①②③` が `早-` `番-` `①-` と割れてしまう。
 *
 * そこで**文字の間にソフトハイフンのパートを挟む**。`wrapWords()` が各パートに `removeSoftHyphens()` を
 * 掛けるのでそのパートは空文字になり、
 *
 * - 描画される文字列は元のまま（パートを `join('')` で戻すため）
 * - 空文字は `s.trim() === ''` で**幅 0 のグルー**になる = ハイフンの付かない改行機会
 * - 空文字は falsy なので、直前の文字にペナルティ節点が付かない（= ハイフンが挿入されない）
 *
 * 語の種類で分けない（= CSS の `word-break: break-all`）。v2 の画面の
 * `ShiftTable.module.css` がセルにもスタッフ名にも `word-break: break-all` を当てているので、
 * 英字の名前もそこで折り返す。
 *
 * **react-pdf のフォント設定はプロセス単位**なので、将来ほかの PDF を足すときも同じ規則が効く（§8.11）。
 */
Font.registerHyphenationCallback((word) =>
  Array.from(word).flatMap((char, index) => (index === 0 ? [char] : [SOFT_HYPHEN, char]))
)

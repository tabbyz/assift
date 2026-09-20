import { StyleSheet } from '@react-pdf/renderer'
// この import が `Font.register` / `Font.registerHyphenationCallback` を走らせる
// （family 名だけを直書きすると、登録ごと消えて Helvetica = 豆腐になる）
import { PDF_FONT_FAMILY } from './fonts'
import { mm } from './mm'

/**
 * v1 `shifts/pdf.scss` の移植（010 §5.5）。wkhtmltopdf は mm で書けたが、react-pdf の単位は pt。
 *
 * **PDF は Mantine の外側なので hex を直書きする**（AGENTS.md「色は theme.ts に集約」の例外。§3.8）。
 * 対応する CSS 変数はコメントに書く。`@mantine/core` の `DEFAULT_THEME` を import すれば値は引けるが、
 * PDF のためだけに UI ライブラリ全体をルートのバンドルへ引き込むことになる。
 */

/** 本文 3mm = 8.5pt。以下 v1 の font-size と同じ */
const FONT_SIZE = mm(3)
const DATE_FONT_SIZE = mm(4)
const NOTE_FONT_SIZE = mm(1.8)
const HEADER_FONT_SIZE = mm(5)

/** 行高 11mm。スタッフ名列 19mm */
const ROW_HEIGHT = mm(11)
const NAME_COL_WIDTH = mm(19)

/** 外枠 1mm / 内側 0.6mm（下書きの上辺の帯は `pdfCellStyle.ts` が持つ） */
const OUTER_BORDER = mm(1)
const INNER_BORDER = mm(0.6)

/** 余白は wkhtmltopdf の既定（10mm） */
const PAGE_PADDING = mm(10)

const OUTER_BORDER_COLOR = '#555'
const INNER_BORDER_COLOR = '#DDD'
/** v1 の whitesmoke（ヘッダ・スタッフ名列の地） */
const HEADER_BG = '#F5F5F5'
const TEXT_COLOR = '#333'

/** v2 の画面と同じ色（`--mantine-color-red-6` / `--mantine-color-blue-6`）。v1 PDF の #ff3860 / #209cee ではない */
const HOLIDAY_COLOR = '#FA5252'
const SATURDAY_COLOR = '#228BE6'

/** 凡例の区切り `/`（v1 の `.pattern-description:before { color: #999 }`） */
const MUTED_COLOR = '#999'

/**
 * **`lineHeight: 1` を落とすと全セルで 3 行目が切れる**（§5.5）。
 * Noto Sans CJK は `ascent 1160 / descent −288` で、react-pdf が使う自然な行高が 1.448 倍ある:
 * 8.5pt × 1.448 × 3 行 = 36.9pt > 行高 31.2pt。v1 の `line-height: 3mm`（= 1.0）は
 * CJK の行間を潰すための指定で、寸法表の中で唯一「移し忘れると静かに壊れる」値だった。
 */
const LINE_HEIGHT = 1

export const styles = StyleSheet.create({
  page: {
    padding: PAGE_PADDING,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: TEXT_COLOR,
  },

  // 見出し（v1 `.header`）
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    fontSize: HEADER_FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    paddingTop: mm(2),
    marginBottom: mm(4),
  },
  headerLeft: { flexDirection: 'row' },
  headerDates: { marginLeft: mm(4) },
  headerTenantName: { maxWidth: '40%', textAlign: 'right' },

  // 表（v1 `.calendar`）
  table: { borderWidth: OUTER_BORDER, borderColor: OUTER_BORDER_COLOR },
  row: { flexDirection: 'row' },

  /** 日付行・メモ行・スタッフ名列の地 */
  headerCell: { backgroundColor: HEADER_BG },

  /** 先頭列（スタッフ名）。日付列と違って幅を固定する */
  nameCell: {
    width: NAME_COL_WIDTH,
    borderRightWidth: OUTER_BORDER,
    borderRightColor: OUTER_BORDER_COLOR,
  },
  staffName: {
    justifyContent: 'center',
    paddingHorizontal: mm(1),
    textAlign: 'center',
    overflow: 'hidden',
  },

  /** 日付列は等分する（31 日なら 23.6pt、7 日なら 104pt） */
  dateCol: { flex: 1 },
  dateColBorder: { borderRightWidth: INNER_BORDER, borderRightColor: INNER_BORDER_COLOR },

  dateCell: {
    alignItems: 'center',
    paddingTop: mm(1.5),
    paddingBottom: mm(2),
    fontSize: DATE_FONT_SIZE,
    lineHeight: LINE_HEIGHT,
  },
  /** 日（数字）の上に曜日を置く。v1 PDF は逆（日 → 曜日）だが、v2 の画面にそろえる（§3.8） */
  dateWday: { marginBottom: mm(0.7) },
  holiday: { color: HOLIDAY_COLOR },
  saturday: { color: SATURDAY_COLOR },

  /** メモ行の上罫線は日付セルだけに付ける（v1 `tr.event-area th:not(:first-child)`。名前列には引かない） */
  noteCellBorderTop: { borderTopWidth: INNER_BORDER, borderTopColor: INNER_BORDER_COLOR },
  noteCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: mm(1),
    paddingBottom: mm(2),
    paddingHorizontal: mm(0.25),
    fontSize: NOTE_FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: '#000',
    textAlign: 'center',
    overflow: 'hidden',
  },

  /** スタッフの行。1 行目だけ太い罫線でヘッダと切る（v1 `tbody tr:first-child td`） */
  staffRow: {
    height: ROW_HEIGHT,
    borderTopWidth: INNER_BORDER,
    borderTopColor: INNER_BORDER_COLOR,
  },
  firstStaffRow: { borderTopWidth: OUTER_BORDER, borderTopColor: OUTER_BORDER_COLOR },

  shiftCell: { justifyContent: 'center', textAlign: 'center', overflow: 'hidden' },

  // 凡例（v1 `.footer`）
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: mm(3) },
  legend: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: mm(2) },
  /** 名前を色の枠で囲む（009 §3.6 の凡例と同じ。PDF にはポップオーバーが無い） */
  legendName: {
    borderWidth: 0.5,
    borderColor: INNER_BORDER_COLOR,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  legendSeparator: { color: MUTED_COLOR, paddingHorizontal: mm(2) },
  footerRight: { flexDirection: 'row', flexShrink: 0 },
  pageNumber: { marginLeft: mm(4), color: MUTED_COLOR },
})

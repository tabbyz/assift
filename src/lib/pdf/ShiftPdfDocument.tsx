import { Document, Page, Text, View } from '@react-pdf/renderer'
import { dayOfMonth, formatJapaneseMonthDay, wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { outlineColor } from '@/lib/patterns/colors'
import { cellKey, toShiftMap } from '@/lib/shifts/key'
import type { ShiftTable } from '@/lib/shifts/table'
import { chunkRows } from './paginate'
import { pdfCellStyle, pdfDraftBandStyle } from './pdfCellStyle'
import { styles } from './styles'

type Staff = ShiftTable['staffs'][number]
type Pattern = ShiftTable['patterns'][number]

/**
 * PDF 本体（v1 `index.pdf.slim`）。**見出し・表・凡例がページごとに繰り返される**。
 *
 * `components/shiftTable/` は DOM と CSS Modules 前提で react-pdf には渡せないので、
 * 描画は独立に書き、**判断の規則だけ** `lib/` 経由で共有する（010 §3.9）。
 * react-pdf に `<table>` は無いので `View` の `flexDirection: 'row'` で組み、文字は必ず `<Text>` の中に置く。
 */
export function ShiftPdfDocument({ table }: { table: ShiftTable }) {
  const period = `${formatJapaneseMonthDay(table.start)} 〜 ${formatJapaneseMonthDay(table.end)}`
  const holidays = new Set(table.holidays)
  const shifts = toShiftMap(table.shifts)
  const patternsById = new Map(table.patterns.map((pattern) => [pattern.id, pattern]))
  const notesByDate = new Map(table.notes.map((note) => [note.date, note.note]))
  const pages = chunkRows(table.staffs)

  return (
    // 別タブで開いたときブラウザのタブに出るのは**ファイル名ではなく Title メタデータ**（v1 の <title>）
    <Document title={`シフト表 ${period}`}>
      {pages.map((staffs, index) => (
        /*
         * **`wrap={false}` が要る。** これが無いと `<Page>` は入り切らない分を勝手に次の紙へ送るので、
         * ページ分割は `chunkRows()` の持ち物ではなくなる（§3.11 の前提が崩れる）。
         * 実測では「説明つきパターン 12 件 + スタッフ 13 人 + メモ行」で凡例の最終行だけが送られ、
         * `© assift` とページ番号は元の紙に残ったまま **ほぼ白紙の紙が 1 枚増え**、
         * 3 枚の紙に `1 / 2`・(番号なし)・`2 / 2` が刷られていた。
         * `wrap={false}` なら 1 チャンク = 紙 1 枚が保証され、番号も常に正しくなる。
         * 凡例は紙をはみ出す分だけ切れるが、20 パターン全部に説明を入れても 4 行で収まる（実測）。
         */
        <Page key={index} size="A4" orientation="landscape" wrap={false} style={styles.page}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text>シフト表</Text>
              <Text style={styles.headerDates}>{period}</Text>
            </View>
            <Text style={styles.headerTenantName}>{table.tenantName}</Text>
          </View>

          <View style={styles.table}>
            <DateRow dates={table.dates} holidays={holidays} />
            {notesByDate.size > 0 && <NoteRow dates={table.dates} notesByDate={notesByDate} />}
            {staffs.map((staff, row) => (
              <StaffRow
                key={staff.id}
                staff={staff}
                dates={table.dates}
                first={row === 0}
                shifts={shifts}
                patternsById={patternsById}
              />
            ))}
          </View>

          <Legend patterns={table.patterns} page={index + 1} pageCount={pages.length} />
        </Page>
      ))}
    </Document>
  )
}

/** 日付行。**曜日が上、日が下**（v1 PDF は逆だが v2 の画面にそろえる。010 §3.8） */
function DateRow({ dates, holidays }: { dates: string[]; holidays: Set<string> }) {
  return (
    <View style={styles.row}>
      <View style={[styles.nameCell, styles.headerCell]} />
      {dates.map((date, index) => {
        const day = wday(date)
        const tone =
          holidays.has(date) || day === 0 ? styles.holiday : day === 6 ? styles.saturday : undefined

        return (
          <View
            key={date}
            style={[
              styles.dateCol,
              columnBorder(index, dates.length),
              styles.headerCell,
              styles.dateCell,
              tone,
            ]}
          >
            <Text style={styles.dateWday}>{WEEKDAY_LABELS[day]}</Text>
            <Text>{dayOfMonth(date)}</Text>
          </View>
        )
      })}
    </View>
  )
}

/** メモ行。**期間内にメモが 1 件でもあるときだけ**出す（v1 と同じ。CSV は常に出すのと非対称） */
function NoteRow({ dates, notesByDate }: { dates: string[]; notesByDate: Map<string, string> }) {
  return (
    <View style={styles.row}>
      <View style={[styles.nameCell, styles.headerCell]} />
      {dates.map((date, index) => (
        <View
          key={date}
          style={[
            styles.dateCol,
            columnBorder(index, dates.length),
            styles.headerCell,
            styles.noteCellBorderTop,
            styles.noteCell,
          ]}
        >
          <Text>{notesByDate.get(date) ?? ''}</Text>
        </View>
      ))}
    </View>
  )
}

function StaffRow({
  staff,
  dates,
  first,
  shifts,
  patternsById,
}: {
  staff: Staff
  dates: string[]
  first: boolean
  shifts: ReturnType<typeof toShiftMap>
  patternsById: Map<string, Pattern>
}) {
  return (
    <View style={[styles.row, styles.staffRow, first ? styles.firstStaffRow : undefined]}>
      <View style={[styles.nameCell, styles.headerCell, styles.staffName]}>
        <Text>{staff.name}</Text>
      </View>
      {dates.map((date, index) => {
        const shift = shifts.get(cellKey(staff.id, date))
        const pattern = shift ? patternsById.get(shift.patternId) : undefined
        const fixed = shift?.fixed ?? false
        const band = pdfDraftBandStyle(pattern, fixed)

        return (
          <View
            key={date}
            style={[
              styles.dateCol,
              columnBorder(index, dates.length),
              styles.shiftCell,
              pdfCellStyle(pattern, fixed),
            ]}
          >
            {/* 下書きの色帯。絶対配置なのでセルの文字領域を狭めない（v1 と同じ） */}
            {band && <View style={band} />}
            <Text>{pattern?.name ?? ''}</Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * 凡例（v1 `.footer`）。説明が入っているパターンだけを ` / ` 区切りで横に並べ、右端に `© assift`。
 *
 * 名前を色の枠で囲むのは v1 から変えたところ（009 §3.6 の画面・公開ページの凡例と同じ）。
 * PDF にはポップオーバーが無く、凡例が色と名前を結ぶ唯一の手がかりになる。
 *
 * ページ番号は v1 に無いが、紙が 3 枚以上になると順序が分からなくなるので複数ページのときだけ出す。
 * **`Text` の `render` コールバックは使わない**（ページ分割は `chunkRows()` で自分が持っている。§3.11）。
 */
function Legend({
  patterns,
  page,
  pageCount,
}: {
  patterns: Pattern[]
  page: number
  pageCount: number
}) {
  const described = patterns.filter((pattern) => pattern.description)

  return (
    <View style={styles.footer}>
      <View style={styles.legend}>
        {described.map((pattern, index) => (
          <View key={pattern.id} style={styles.legendItem}>
            {index > 0 && <Text style={styles.legendSeparator}>/</Text>}
            <View style={[styles.legendName, { borderColor: outlineColor(pattern.colorHex) }]}>
              <Text>{pattern.name}</Text>
            </View>
            {/* v1 の `名前：説明`。枠は 009 の凡例に合わせた追加で、コロンは v1 のまま残す */}
            <Text>：{pattern.description}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footerRight}>
        <Text>© assift</Text>
        {pageCount > 1 && (
          <Text style={styles.pageNumber}>
            {page} / {pageCount}
          </Text>
        )}
      </View>
    </View>
  )
}

/** 日付列の右罫線。最後の列だけ付けない（v1 `th:not(:last-child)` / `td:not(:last-child)`） */
function columnBorder(index: number, length: number) {
  return index === length - 1 ? undefined : styles.dateColBorder
}

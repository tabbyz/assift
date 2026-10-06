'use client'

import { Button, Group, Popover, Text, UnstyledButton } from '@mantine/core'
import { wday } from '@/lib/calendar/dateString'
import type { DateRange } from '@/lib/calendar/dateRange'
import { hasCoverage, type DateCoverage } from '@/lib/shifts/satisfaction'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import { DateHeaderCell, dateToneClass } from '@/components/shiftTable/DateHeaderCell'
import { DateNoteCell } from './DateNoteCell'
import type { BulkKind } from '../_lib/bulkOperations'
import { PatternPopover, type PopoverPattern } from '@/components/shiftTable/PatternPopover'
import { ShiftCell } from '@/components/shiftTable/ShiftCell'
import { StaffNameCell } from './StaffNameCell'
import classes from '@/components/shiftTable/ShiftTable.module.css'

export type CalendarStaff = {
  id: string
  name: string
  availableWdays: number[]
  patternIds: string[]
}
export type CalendarPattern = { id: string; name: string; colorHex: string }

export type ActiveCell = { staffId: string; date: string }

type Props = {
  tenantId: string
  range: DateRange
  today: string
  holidays: Set<string>
  staffs: CalendarStaff[]
  patternsById: Map<string, CalendarPattern>
  shifts: ShiftMap
  notesByDate: Map<string, string>
  coverageByDate: Map<string, DateCoverage>
  workdaysByStaffId: Map<string, number>
  /** 直近の自動アサインで入ったセル（`cellKey`）。結果を閉じるまで点を出す（012 §3.8） */
  assistCells: Set<string>
  /** 選んでいる効く一手で埋まるセル（`cellKey` → パターン）。点線で出し、ほかのセルを薄くする（012 §11.1） */
  assistGhosts: Map<string, string>
  /** 選んでいる効く一手で埋まったあとの充足。人数が変わる日だけ（フッターの「3/5 → 4/5」） */
  previewCoverageByDate: Map<string, DateCoverage>
  activeCell: ActiveCell | null
  draftFixed: boolean
  onOpenCell: (cell: ActiveCell) => void
  onCloseCell: () => void
  onAssign: (cell: ActiveCell, patternId: string | null, fixed: boolean) => void
  onDraftFixedChange: (cell: ActiveCell, fixed: boolean) => void
  onOpenNote: (date: string) => void
  onOpenRequiredNum: (date: string) => void
  onOpenCount: () => void
  onStaffBulk: (kind: BulkKind, staff: CalendarStaff) => void
  bulkDisabled: boolean
  popoverPatterns: (cell: ActiveCell) => PopoverPattern[]
  /** 初めて開いたときの案内を出すセル（014 §4.7）。出さないときは null */
  coachCell: ActiveCell | null
  onCoachDismiss: () => void
}

/** フッターに出す数字。必要人数が未設定なら `3/—`、多く入っていれば `4/3 +1`（015 §3.7） */
function coverageText(coverage: DateCoverage): string {
  const required = coverage.required === null ? '—' : coverage.required
  const over =
    coverage.state === 'over' && coverage.required !== null
      ? ` +${coverage.assigned - coverage.required}`
      : ''
  return `${coverage.assigned}/${required}${over}`
}

const COVERAGE_STATE_LABELS = {
  ok: '充足',
  short: '不足',
  over: '過剰',
  unset: '必要人数は未設定',
  none: '',
} as const

/** 色だけで状態を伝えない（015 §4.6） */
function coverageLabel(date: string, coverage: DateCoverage | undefined): string {
  if (!hasCoverage(coverage)) return `${date} の必要人数`
  const required = coverage.required === null ? '未設定' : coverage.required
  return `${date} の必要人数（配置 ${coverage.assigned} / 必要 ${required} ${COVERAGE_STATE_LABELS[coverage.state]}）`
}

/**
 * シフト表本体。
 *
 * 日付ヘッダーは「見出し」に徹して 曜日・日・メモ だけを持ち、押すと日付メモが開く。
 * **配置 / 必要人数は列の集計なので表の下のフッター**に置き、必要人数もそこから開く（011）。
 */
export function CalendarTable({
  tenantId,
  range,
  today,
  holidays,
  staffs,
  patternsById,
  shifts,
  notesByDate,
  coverageByDate,
  workdaysByStaffId,
  assistCells,
  assistGhosts,
  previewCoverageByDate,
  activeCell,
  draftFixed,
  onOpenCell,
  onCloseCell,
  onAssign,
  onDraftFixedChange,
  onOpenNote,
  onOpenRequiredNum,
  onOpenCount,
  onStaffBulk,
  bulkDisabled,
  popoverPatterns,
  coachCell,
  onCoachDismiss,
}: Props) {
  return (
    <table className={classes.table} data-previewing={assistGhosts.size > 0 || undefined}>
      <thead>
        <tr className={classes.dateRow}>
          <th className={classes.staffHeader} scope="col" aria-label="スタッフ">
            <Button variant="default" size="compact-sm" onClick={onOpenCount}>
              集計
            </Button>
          </th>
          {range.dates.map((date) => {
            const note = notesByDate.get(date)
            return (
              <th key={date} scope="col">
                {/*
                  ヘッダーは日付メモだけの入口。必要人数はフッター（数字のある場所）から開く。
                  セル全体が 1 つのボタンなので、曜日・日付・メモのどこを押しても同じ動作になる
                */}
                <UnstyledButton
                  className={[classes.dateHead, dateToneClass(date, holidays.has(date))]
                    .filter(Boolean)
                    .join(' ')}
                  data-today={date === today || undefined}
                  onClick={() => onOpenNote(date)}
                  aria-label={note ? `${date} のメモ: ${note}` : `${date} のメモを追加`}
                >
                  <div className={classes.dateMain}>
                    <DateHeaderCell date={date} />
                  </div>
                  <DateNoteCell note={note} />
                </UnstyledButton>
              </th>
            )
          })}
        </tr>
      </thead>

      <tbody>
        {staffs.map((staff) => (
          <tr
            key={staff.id}
            data-ghost-row={
              range.dates.some((date) => assistGhosts.has(cellKey(staff.id, date))) || undefined
            }
          >
            <th scope="row">
              <StaffNameCell
                tenantId={tenantId}
                staffId={staff.id}
                name={staff.name}
                workdays={workdaysByStaffId.get(staff.id) ?? 0}
                onBulk={(kind) => onStaffBulk(kind, staff)}
                disabled={bulkDisabled}
              />
            </th>
            {range.dates.map((date) => {
              const shift = shifts.get(cellKey(staff.id, date))
              const pattern = shift ? patternsById.get(shift.patternId) : undefined
              const ghostId = assistGhosts.get(cellKey(staff.id, date))
              const enabled = staff.availableWdays.includes(wday(date))
              const isActive = activeCell?.staffId === staff.id && activeCell.date === date
              const fixedLabel = pattern ? (shift?.fixed ? '確定' : '下書き') : ''
              const label = [staff.name, date, pattern?.name, fixedLabel].filter(Boolean).join(' ')

              const cell = (
                <ShiftCell
                  pattern={pattern}
                  fixed={shift?.fixed ?? false}
                  enabled={enabled}
                  label={label}
                  marked={Boolean(pattern) && assistCells.has(cellKey(staff.id, date))}
                  ghost={ghostId ? patternsById.get(ghostId) : undefined}
                  onClick={() => onOpenCell({ staffId: staff.id, date })}
                  holdKey={cellKey(staff.id, date)}
                  onToggleFixed={
                    pattern && shift
                      ? () => onAssign({ staffId: staff.id, date }, shift.patternId, !shift.fixed)
                      : undefined
                  }
                />
              )

              return (
                <td key={date}>
                  {isActive ? (
                    <Popover
                      opened
                      position="bottom-end"
                      shadow="md"
                      withinPortal
                      trapFocus
                      returnFocus
                      onDismiss={onCloseCell}
                    >
                      <Popover.Target>{cell}</Popover.Target>
                      <Popover.Dropdown p="xs">
                        <PatternPopover
                          patterns={popoverPatterns({ staffId: staff.id, date })}
                          selectedPatternId={shift?.patternId ?? null}
                          fixed={draftFixed}
                          onFixedChange={(fixed) =>
                            onDraftFixedChange({ staffId: staff.id, date }, fixed)
                          }
                          onAssign={(patternId) =>
                            onAssign({ staffId: staff.id, date }, patternId, draftFixed)
                          }
                          onClose={onCloseCell}
                        />
                      </Popover.Dropdown>
                    </Popover>
                  ) : coachCell?.staffId === staff.id && coachCell.date === date ? (
                    // 初めて開いたときだけ（014 §4.7）。セルを押すと案内は閉じてパターンのポップオーバーに替わる
                    // モーダル（z-index 200）より下に置く。既定の 300 だと自動作成などのモーダルの上に残る
                    // 吹き出しはマスの左端に揃え、矢印はマスの左右中央から出す。
                    // 既定の offset（8px + 矢印の半分）だとマスから離れて見えるので、矢印の先がマスの下端に触れるくらいまで寄せる
                    <Popover
                      opened
                      position="bottom-start"
                      offset={2}
                      withArrow
                      arrowPosition="center"
                      arrowSize={10}
                      shadow="md"
                      withinPortal
                      zIndex={150}
                    >
                      <Popover.Target>{cell}</Popover.Target>
                      <Popover.Dropdown p="sm" maw={260}>
                        <Text size="sm" fw={600}>
                          マスを押すと、勤務を入れられます
                        </Text>
                        <Group justify="flex-end" mt="xs">
                          <Button size="xs" onClick={onCoachDismiss}>
                            わかりました
                          </Button>
                        </Group>
                      </Popover.Dropdown>
                    </Popover>
                  ) : (
                    cell
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>

      {/* 充足。縦スクロールしても下端に残る（CSS の `.footRow`） */}
      <tfoot>
        <tr className={classes.footRow}>
          <th className={classes.footLabel} scope="row">
            配置 / 必要人数
          </th>
          {range.dates.map((date) => {
            const coverage = coverageByDate.get(date)
            const preview = previewCoverageByDate.get(date)
            const shown = preview ?? coverage
            return (
              <td key={date}>
                <UnstyledButton
                  className={classes.footCell}
                  data-state={hasCoverage(shown) ? shown.state : undefined}
                  data-preview={preview ? true : undefined}
                  onClick={() => onOpenRequiredNum(date)}
                  aria-label={
                    preview
                      ? `${coverageLabel(date, coverage)}。選んでいる一手で ${coverageText(preview)}`
                      : coverageLabel(date, coverage)
                  }
                >
                  {preview && hasCoverage(coverage) && (
                    <span className={classes.footBefore}>
                      {coverage.assigned}/{coverage.required}
                    </span>
                  )}
                  {hasCoverage(shown) ? `${shown.assigned}/${shown.required}` : ' '}
                </UnstyledButton>
              </td>
            )
          })}
        </tr>
      </tfoot>
    </table>
  )
}

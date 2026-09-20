'use client'

import { Button, Popover, UnstyledButton } from '@mantine/core'
import { wday } from '@/lib/calendar/dateString'
import type { DateRange } from '@/lib/calendar/dateRange'
import type { DateCoverage } from '@/lib/shifts/satisfaction'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import { DateHeaderCell, dateToneClass } from '@/components/shiftTable/DateHeaderCell'
import { DateNoteCell } from './DateNoteCell'
import type { BulkKind } from '../_lib/bulkOperations'
import { PatternPopover, type PopoverPattern } from './PatternPopover'
import { ShiftCell } from './ShiftCell'
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
}

/** 0/0（必要人数も配置も無い日）は数字を出さない。全列に出すと指標として読まれなくなる */
function hasCoverage(coverage: DateCoverage | undefined): coverage is DateCoverage {
  return coverage !== undefined && (coverage.required > 0 || coverage.assigned > 0)
}

function coverageLabel(date: string, coverage: DateCoverage | undefined): string {
  if (!hasCoverage(coverage)) return `${date} の必要人数`
  const state = coverage.satisfied ? '充足' : '未充足'
  return `${date} の必要人数（${coverage.assigned}/${coverage.required} ${state}）`
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
}: Props) {
  return (
    <table className={classes.table}>
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
          <tr key={staff.id}>
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
            return (
              <td key={date}>
                <UnstyledButton
                  className={classes.footCell}
                  data-short={hasCoverage(coverage) && !coverage.satisfied ? true : undefined}
                  onClick={() => onOpenRequiredNum(date)}
                  aria-label={coverageLabel(date, coverage)}
                >
                  {hasCoverage(coverage) ? `${coverage.assigned}/${coverage.required}` : ' '}
                </UnstyledButton>
              </td>
            )
          })}
        </tr>
      </tfoot>
    </table>
  )
}

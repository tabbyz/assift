'use client'

import {
  Menu,
  MenuDivider,
  MenuDropdown,
  MenuItem,
  MenuLabel,
  MenuTarget,
  Popover,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { IconDotsVertical, IconUsersGroup } from '@tabler/icons-react'
import { wday } from '@/lib/calendar/dateString'
import type { DateRange } from '@/lib/calendar/dateRange'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import { DateHeaderCell } from './DateHeaderCell'
import { DateNoteCell } from './DateNoteCell'
import { PatternPopover, type PopoverPattern } from './PatternPopover'
import { RequiredNumCell } from './RequiredNumCell'
import { ShiftCell } from './ShiftCell'
import { StaffNameCell } from './StaffNameCell'
import classes from './CalendarTable.module.css'

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
  holidays: Set<string>
  staffs: CalendarStaff[]
  patternsById: Map<string, CalendarPattern>
  shifts: ShiftMap
  notesByDate: Map<string, string>
  satisfiedByDate: Map<string, boolean>
  activeCell: ActiveCell | null
  draftFixed: boolean
  onOpenCell: (cell: ActiveCell) => void
  onCloseCell: () => void
  onAssign: (cell: ActiveCell, patternId: string | null, fixed: boolean) => void
  onDraftFixedChange: (cell: ActiveCell, fixed: boolean) => void
  onOpenNote: (date: string) => void
  onOpenRequiredNum: (date: string) => void
  onSetDefaultRequiredNums: () => void
  /** ポップオーバーに出す候補（選択可能なパターン + 現在アサイン中。007 §3.7） */
  popoverPatterns: (cell: ActiveCell) => PopoverPattern[]
}

/** シフト表本体（v1 `shifts/index.html.slim` の table.calendar） */
export function CalendarTable({
  tenantId,
  range,
  holidays,
  staffs,
  patternsById,
  shifts,
  notesByDate,
  satisfiedByDate,
  activeCell,
  draftFixed,
  onOpenCell,
  onCloseCell,
  onAssign,
  onDraftFixedChange,
  onOpenNote,
  onOpenRequiredNum,
  onSetDefaultRequiredNums,
  popoverPatterns,
}: Props) {
  return (
    <table className={classes.table}>
      <thead>
        <tr className={classes.dateRow}>
          <th />
          {range.dates.map((date) => (
            // scope: 930 セルのグリッドなので、支援技術がセルと日付・スタッフ名を結べるようにする
            <th key={date} scope="col">
              <DateHeaderCell date={date} isHoliday={holidays.has(date)} />
            </th>
          ))}
        </tr>

        <tr className={classes.noteRow}>
          <th />
          {range.dates.map((date) => (
            <th key={date} scope="col">
              <DateNoteCell
                date={date}
                note={notesByDate.get(date)}
                onClick={() => onOpenNote(date)}
              />
            </th>
          ))}
        </tr>

        <tr className={classes.countRow}>
          <th>
            <Menu position="bottom-start" withinPortal>
              <MenuTarget>
                <UnstyledButton className={classes.menuButton} aria-label="必要人数のメニュー">
                  <Text size="sm">人数</Text>
                  <IconDotsVertical size={14} className={classes.menuIcon} />
                </UnstyledButton>
              </MenuTarget>
              <MenuDropdown>
                <MenuLabel>一括操作</MenuLabel>
                <MenuDivider />
                <MenuItem
                  leftSection={<IconUsersGroup size={16} />}
                  onClick={onSetDefaultRequiredNums}
                >
                  デフォルト人数をセット
                </MenuItem>
              </MenuDropdown>
            </Menu>
          </th>
          {range.dates.map((date) => (
            <th key={date} scope="col">
              <RequiredNumCell
                date={date}
                satisfied={satisfiedByDate.get(date) ?? true}
                onClick={() => onOpenRequiredNum(date)}
              />
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {staffs.map((staff) => (
          <tr key={staff.id}>
            <th scope="row">
              <StaffNameCell tenantId={tenantId} staffId={staff.id} name={staff.name} />
            </th>
            {range.dates.map((date) => {
              const shift = shifts.get(cellKey(staff.id, date))
              const pattern = shift ? patternsById.get(shift.patternId) : undefined
              const enabled = staff.availableWdays.includes(wday(date))
              const isActive = activeCell?.staffId === staff.id && activeCell.date === date
              const label = `${staff.name} ${date}${pattern ? ` ${pattern.name}` : ''}`

              const cell = (
                <ShiftCell
                  pattern={pattern}
                  fixed={shift?.fixed ?? false}
                  enabled={enabled}
                  label={label}
                  onClick={() => onOpenCell({ staffId: staff.id, date })}
                />
              )

              return (
                <td key={date}>
                  {/*
                    Popover は開いているセルだけ mount する（007 §3.9）。
                    31 日 × 在籍スタッフ分すべてを包むと floating-ui のフックがその数だけ動く
                  */}
                  {isActive ? (
                    <Popover
                      opened
                      position="bottom-end"
                      shadow="md"
                      withinPortal
                      /*
                       * trapFocus: ドロップダウンにフォーカスを移す。これが無いとフォーカスが
                       * セルに残り、Mantine の Escape 処理（ドロップダウンの keydown）が働かない
                       * （v1 の tippy は Escape で閉じていた）。returnFocus で元のセルに戻す。
                       */
                      trapFocus
                      returnFocus
                      onDismiss={onCloseCell}
                    >
                      <Popover.Target>{cell}</Popover.Target>
                      <Popover.Dropdown p="xs">
                        <PatternPopover
                          patterns={popoverPatterns({ staffId: staff.id, date })}
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
    </table>
  )
}

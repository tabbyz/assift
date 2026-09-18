'use client'

import 'dayjs/locale/ja'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Box, LoadingOverlay, Text } from '@mantine/core'
import { DatesProvider, type DayOfWeek } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useQueryStates } from 'nuqs'
import { dateRange, nextStart, prevStart } from '@/lib/calendar/dateRange'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { dayKeyFor } from '@/lib/calendar/weekdays'
import { defaultRequiredNum, type RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import type { PatternKind } from '@/lib/patterns/kinds'
import { applyAssign, type AssignInput } from '@/lib/shifts/applyAssign'
import { cellKey, toShiftMap, type ShiftCell } from '@/lib/shifts/key'
import {
  assignedCounts,
  countAt,
  isSatisfied,
  requiredCounts,
  type RequiredNumRow,
} from '@/lib/shifts/satisfaction'
import { assignShift, setDefaultRequiredNums } from '../actions'
import { shiftsParsers } from '../searchParams'
import { CalendarTable, type ActiveCell } from './CalendarTable'
import { DateNoteModal } from './DateNoteModal'
import { PatternDescriptionList } from './PatternDescriptionList'
import { RequiredNumModal, type RequiredNumRowInput } from './RequiredNumModal'
import { SetupNotice } from './SetupNotice'
import { Toolbar } from './Toolbar'
import classes from './CalendarTable.module.css'

export type ShiftsPattern = {
  id: string
  name: string
  description: string | null
  colorHex: string
  kind: PatternKind
  pairPatternId: string | null
  defaultRequiredNums: RequiredNumsByDay
}

export type ShiftsStaff = {
  id: string
  name: string
  availableWdays: number[]
  patternIds: string[]
}

type Props = {
  tenantId: string
  cycle: ShiftCycle
  startOfWeek: number
  start: string
  holidays: string[]
  staffs: ShiftsStaff[]
  patterns: ShiftsPattern[]
  shifts: ShiftCell[]
  requiredNums: RequiredNumRow[]
  dateNotes: { date: string; note: string }[]
}

/**
 * シフト表の状態を持つ Client（007 §4）。
 *
 * - セルの更新は `useOptimistic` + `applyAssign`（SQL と同じ規則の純関数）で即時反映する
 * - 期間は nuqs の `?start=`。Server の再フェッチが必要なので `shallow: false`
 * - ポップオーバーは開いているセルだけ mount する（`activeCell`）
 */
export function ShiftsClient(props: Props) {
  const { tenantId, cycle, startOfWeek, start, staffs, patterns } = props
  const router = useRouter()

  const [isNavigating, startNavigation] = useTransition()
  // startTransition を渡すと、Server Component の再描画が届くまで isNavigating が true のままになる
  const [, setQuery] = useQueryStates(shiftsParsers, {
    shallow: false,
    startTransition: startNavigation,
  })
  // isPending は使わない: assign は先にポップオーバーを閉じるので、待つ UI が無い
  const [, startAssign] = useTransition()

  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [draftFixed, setDraftFixed] = useState(false)
  const [noteDate, setNoteDate] = useState<string | null>(null)
  const [requiredNumDate, setRequiredNumDate] = useState<string | null>(null)

  const range = useMemo(() => dateRange(cycle, startOfWeek, start), [cycle, startOfWeek, start])
  const holidays = useMemo(() => new Set(props.holidays), [props.holidays])
  const patternsById = useMemo(() => new Map(patterns.map((p) => [p.id, p])), [patterns])
  const workdayPatterns = useMemo(() => patterns.filter((p) => p.kind === 'workday'), [patterns])
  const workdayPatternIds = useMemo(() => workdayPatterns.map((p) => p.id), [workdayPatterns])

  const baseShifts = useMemo(() => toShiftMap(props.shifts), [props.shifts])
  const pairOf = (patternId: string) => patternsById.get(patternId)?.pairPatternId ?? null
  const [shifts, addOptimisticAssign] = useOptimistic(baseShifts, (current, input: AssignInput) =>
    applyAssign(current, pairOf, input)
  )

  const notesByDate = useMemo(
    () => new Map(props.dateNotes.map((note) => [note.date, note.note])),
    [props.dateNotes]
  )
  const required = useMemo(() => requiredCounts(props.requiredNums), [props.requiredNums])
  const assigned = useMemo(() => assignedCounts(shifts), [shifts])
  const satisfiedByDate = useMemo(
    () =>
      new Map(
        range.dates.map((date) => [date, isSatisfied(date, workdayPatternIds, required, assigned)])
      ),
    [range.dates, workdayPatternIds, required, assigned]
  )

  const navigate = (nextValue: string) => {
    void setQuery({ start: nextValue })
  }

  const assign = (cell: ActiveCell, patternId: string | null, fixed: boolean) => {
    setActiveCell(null)
    startAssign(async () => {
      addOptimisticAssign({ ...cell, patternId, fixed })
      const result = await assignShift({ tenantId, ...cell, patternId, fixed })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        // 失敗の主因は「別タブでスタッフ / パターンが消された」= この画面が古いこと（006 §10.8）
        router.refresh()
      }
    })
  }

  const openCell = (cell: ActiveCell) => {
    // 開いているセルをもう一度押したら閉じる（v1 の tippy は click でトグルだった）
    if (activeCell?.staffId === cell.staffId && activeCell.date === cell.date) {
      setActiveCell(null)
      return
    }
    setActiveCell(cell)
    // 下書き / 確定の初期値は、そのセルの現在の状態に合わせる
    setDraftFixed(shifts.get(cellKey(cell.staffId, cell.date))?.fixed ?? false)
  }

  /** 下書き ↔ 確定の切替。アサイン済みなら同じパターンで押し直す（v1 の UX） */
  const changeDraftFixed = (cell: ActiveCell, fixed: boolean) => {
    setDraftFixed(fixed)
    const current = shifts.get(cellKey(cell.staffId, cell.date))
    if (current) assign(cell, current.patternId, fixed)
  }

  const popoverPatterns = (cell: ActiveCell) => {
    const staff = staffs.find((s) => s.id === cell.staffId)
    const available = new Set(staff?.patternIds ?? [])
    // 現在アサイン中のパターンは、選択可能から外されていても候補に残す（007 §3.7）
    const assignedPatternId = shifts.get(cellKey(cell.staffId, cell.date))?.patternId
    if (assignedPatternId) available.add(assignedPatternId)
    return patterns.filter((pattern) => available.has(pattern.id))
  }

  const confirmSetDefaultRequiredNums = () =>
    modals.openConfirmModal({
      title: 'デフォルト人数をセット',
      children: (
        <Text size="sm">
          現在の期間に一括でデフォルトの必要人数をセットします。よろしいですか？
        </Text>
      ),
      labels: { confirm: 'セットする', cancel: 'キャンセル' },
      onConfirm: () =>
        startAssign(async () => {
          const result = await setDefaultRequiredNums({
            tenantId,
            start: range.start,
            end: range.end,
          })
          notifications.show(
            result.ok
              ? { message: 'デフォルト人数を設定しました', color: 'green' }
              : { message: result.error, color: 'red' }
          )
        }),
    })

  const requiredNumRows = (date: string): RequiredNumRowInput[] => {
    const dayKey = dayKeyFor(date, holidays.has(date))
    return workdayPatterns.map((pattern) => ({
      patternId: pattern.id,
      name: pattern.name,
      required: countAt(required, date, pattern.id),
      defaultNum: defaultRequiredNum(pattern.defaultRequiredNums, dayKey),
      assigned: countAt(assigned, date, pattern.id),
    }))
  }

  const needsSetup = patterns.length === 0 || staffs.length === 0

  return (
    <DatesProvider
      settings={{ locale: 'ja', firstDayOfWeek: startOfWeek as DayOfWeek, weekendDays: [0, 6] }}
    >
      <div className={classes.page}>
        <Toolbar
          tenantId={tenantId}
          cycle={cycle}
          startOfWeek={startOfWeek}
          range={range}
          onPrev={() => navigate(prevStart(cycle, range))}
          onNext={() => navigate(nextStart(cycle, range))}
          onPickStart={navigate}
          disabled={isNavigating}
        />

        {needsSetup && (
          <SetupNotice
            tenantId={tenantId}
            hasPattern={patterns.length > 0}
            hasStaff={staffs.length > 0}
          />
        )}

        <Box className={classes.scroller} pos="relative">
          <LoadingOverlay visible={isNavigating} zIndex={4} />
          <CalendarTable
            tenantId={tenantId}
            range={range}
            holidays={holidays}
            staffs={staffs}
            patternsById={patternsById}
            shifts={shifts}
            notesByDate={notesByDate}
            satisfiedByDate={satisfiedByDate}
            activeCell={activeCell}
            draftFixed={draftFixed}
            onOpenCell={openCell}
            onCloseCell={() => setActiveCell(null)}
            onAssign={assign}
            onDraftFixedChange={changeDraftFixed}
            onOpenNote={setNoteDate}
            onOpenRequiredNum={setRequiredNumDate}
            onSetDefaultRequiredNums={confirmSetDefaultRequiredNums}
            popoverPatterns={popoverPatterns}
          />
        </Box>

        <PatternDescriptionList patterns={patterns} />
      </div>

      {noteDate && (
        <DateNoteModal
          tenantId={tenantId}
          date={noteDate}
          note={notesByDate.get(noteDate) ?? ''}
          onClose={() => setNoteDate(null)}
        />
      )}

      {requiredNumDate && (
        <RequiredNumModal
          tenantId={tenantId}
          date={requiredNumDate}
          rows={requiredNumRows(requiredNumDate)}
          onClose={() => setRequiredNumDate(null)}
        />
      )}
    </DatesProvider>
  )
}

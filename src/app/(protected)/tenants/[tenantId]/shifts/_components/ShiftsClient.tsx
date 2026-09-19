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
import type { ActionResult } from '@/lib/actions/result'
import {
  assignShift,
  clearDraftShifts,
  setDefaultPatterns,
  setDefaultRequiredNums,
  setShiftsFixed,
} from '../actions'
import { shiftsParsers } from '../searchParams'
import { BULK_COPY, type BulkKind } from '../_lib/bulkOperations'
import { failure, outcome, type Notice } from '../_lib/notices'
import { CalendarTable, type ActiveCell } from './CalendarTable'
import { CopyModal } from './CopyModal'
import { CountModal } from './CountModal'
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
  // 一括操作は楽観更新しないので、完了まで表を覆う（008 §3.3）
  const [isBulkPending, startBulk] = useTransition()

  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [draftFixed, setDraftFixed] = useState(false)
  const [noteDate, setNoteDate] = useState<string | null>(null)
  const [requiredNumDate, setRequiredNumDate] = useState<string | null>(null)
  const [countOpened, setCountOpened] = useState(false)
  const [copyOpened, setCopyOpened] = useState(false)

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

  /**
   * 一括操作の実行（008 §5.7）。楽観更新はせず、`refresh()` が返す描画で表が置き換わる。
   * 失敗時は画面が古い可能性があるので読み直す（007 と同じ理由）。通知の文言は Action の戻り値から呼び出し側が決める。
   */
  const runBulk = <T,>(action: () => Promise<ActionResult<T>>, notice: (data: T) => Notice) =>
    startBulk(async () => {
      const result = await action()
      if (!result.ok) {
        notifications.show(failure(result.error))
        router.refresh()
        return
      }
      notifications.show(notice(result.data))
    })

  /** 一括操作の確認。`staff` を渡すとそのスタッフだけ（スタッフ名のメニュー）、省略で表示期間の全員（ツールメニュー） */
  const confirmBulk = (kind: BulkKind, staff?: { id: string; name: string }) => {
    const copy = BULK_COPY[kind]
    const term = { tenantId, start: range.start, end: range.end, staffId: staff?.id }
    const action = () =>
      kind === 'clear' ? clearDraftShifts(term) : setShiftsFixed({ ...term, fixed: kind === 'fix' })

    modals.openConfirmModal({
      title: copy.title,
      children: <Text size="sm">{copy.confirm(staff?.name)}</Text>,
      labels: { confirm: '実行する', cancel: 'キャンセル' },
      onConfirm: () =>
        runBulk(action, ({ affected }) => outcome(affected, copy.success, copy.nothing)),
    })
  }

  const confirmSetDefaultPatterns = () =>
    modals.openConfirmModal({
      title: 'デフォルト勤務パターンをセット',
      children: (
        <Text size="sm">
          スタッフ毎に設定されたデフォルトの勤務パターンをセットします。
          ※アサイン済みのシフトは上書きされません。
        </Text>
      ),
      labels: { confirm: 'セットする', cancel: 'キャンセル' },
      onConfirm: () =>
        runBulk(
          () => setDefaultPatterns({ tenantId, start: range.start, end: range.end }),
          ({ inserted }) =>
            outcome(
              inserted,
              'デフォルトの勤務パターンをセットしました',
              'すべてアサイン済みのため、追加したシフトはありません'
            )
        ),
    })

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
        runBulk(
          () => setDefaultRequiredNums({ tenantId, start: range.start, end: range.end }),
          () => ({ message: 'デフォルト人数を設定しました', color: 'green' })
        ),
    })

  /**
   * コピー結果を見せるための移動（008 §3.6）。**コピー先の開始日が表示期間の外**にあるときだけ、その日へ移る。
   *
   * 開始日が表示期間の中にある場合は動かない。終了日だけがはみ出す（31 日の From を 30 日の月へ）ときに
   * 開始日へ移ると、月の周期では表示の起点が 1 日からずれてしまう（`dateRange('month')` は開始日を丸めない）。
   * はみ出しはコピーモーダルが通知に添える。週・半月の周期では丸めた期間が今と同じなら移動しても変わらないので、それも動かない。
   */
  const showCopyResult = (toStart: string) => {
    if (toStart >= range.start && toStart <= range.end) return
    if (dateRange(cycle, startOfWeek, toStart).start === range.start) return
    navigate(toStart)
  }

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
          onOpenCount={() => setCountOpened(true)}
          onBulk={confirmBulk}
          onSetDefaultPatterns={confirmSetDefaultPatterns}
          onOpenCopy={() => setCopyOpened(true)}
          disabled={isNavigating || isBulkPending}
        />

        {needsSetup && (
          <SetupNotice
            tenantId={tenantId}
            hasPattern={patterns.length > 0}
            hasStaff={staffs.length > 0}
          />
        )}

        <Box className={classes.scroller} pos="relative">
          <LoadingOverlay visible={isNavigating || isBulkPending} zIndex={4} />
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
            onStaffBulk={confirmBulk}
            // 期間移動中は無効にしない: メニューには「スタッフ情報を編集」もあり、007 では移動中も開けた
            bulkDisabled={isBulkPending}
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

      {countOpened && (
        <CountModal
          range={range}
          staffs={staffs}
          patterns={patterns}
          workdayPatternIds={workdayPatternIds}
          shifts={shifts}
          onClose={() => setCountOpened(false)}
        />
      )}

      {copyOpened && (
        <CopyModal
          tenantId={tenantId}
          cycle={cycle}
          startOfWeek={startOfWeek}
          range={range}
          patterns={patterns}
          onClose={() => setCopyOpened(false)}
          onCopied={showCopyResult}
        />
      )}
    </DatesProvider>
  )
}

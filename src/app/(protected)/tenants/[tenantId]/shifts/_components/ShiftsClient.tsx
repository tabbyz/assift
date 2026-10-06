'use client'

import 'dayjs/locale/ja'
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Box, LoadingOverlay, Text } from '@mantine/core'
import { DatesProvider, type DayOfWeek } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useQueryStates } from 'nuqs'
import { dateRange, nextStart, prevStart } from '@/lib/calendar/dateRange'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { dayKeyFor } from '@/lib/calendar/weekdays'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import type { PatternKind } from '@/lib/patterns/kinds'
import { applyAssign, type AssignInput } from '@/lib/shifts/applyAssign'
import { cellKey, toShiftMap, type ShiftCell } from '@/lib/shifts/key'
import { countShifts } from '@/lib/shifts/count'
import {
  buildRequiredByDate,
  formatOverriddenDates,
  overriddenDates,
  resolveRequiredNum,
  toOverrideMap,
  type RequiredNumRow,
} from '@/lib/shifts/requiredNums'
import { assignedCounts, countAt, coverageAt, type DateCoverage } from '@/lib/shifts/satisfaction'
import type { ActionResult } from '@/lib/actions/result'
import { formatJstMonthDayTime } from '@/lib/calendar/datetime'
import type { LatestAssistRun } from '@/lib/queries/assistRuns'
import {
  assignShift,
  clearDraftShifts,
  setDefaultPatterns,
  resetRequiredNums,
  setShiftsFixed,
} from '../actions'
import { shiftsParsers } from '../searchParams'
import { ghostCells, hasAnyRequired, previewCoverage, shortageByPattern } from '../_lib/assist'
import { BULK_COPY, type BulkKind } from '../_lib/bulkOperations'
import { failure, outcome, type Notice } from '../_lib/notices'
import { AssistModal, useAssist } from './AssistModal'
import { AssistMobileBar, AssistPanel } from './AssistPanel'
import panelClasses from './AssistPanel.module.css'
import { CalendarTable, type ActiveCell } from './CalendarTable'
import { CopyModal } from './CopyModal'
import { CountModal } from './CountModal'
import { DateNoteModal } from './DateNoteModal'
import { PatternDescriptionList } from '@/components/shiftTable/PatternDescriptionList'
import { saveDefaultRequiredNums } from '../../actions'
import { RequiredNumModal, type RequiredNumRowInput } from './RequiredNumModal'
import { EmptyNotice } from './EmptyNotice'
import { useFirstVisitCoach } from './useFirstVisitCoach'
import { ShareModal, type ShareItem } from './ShareModal'
import { Toolbar } from './Toolbar'
import classes from '@/components/shiftTable/ShiftTable.module.css'

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
  /** JST の今日。共有の公開期限の判定に使う（端末の TZ で判定しない。009 §3.2） */
  today: string
  holidays: string[]
  staffs: ShiftsStaff[]
  patterns: ShiftsPattern[]
  shifts: ShiftCell[]
  /** 必要人数の**上書き**だけ（015 §3.1。基本の人数は patterns の defaultRequiredNums） */
  requiredOverrides: RequiredNumRow[]
  dateNotes: { date: string; note: string }[]
  shares: { enabled: ShareItem[]; expired: ShareItem[] }
  /** 自動アサイン（012） */
  assist: {
    /** LLM のキーがあるか。無ければボタンは「現在利用できません」 */
    available: boolean
    /** 店舗の既定の指示 */
    notes: string
    restrictionCount: number
    latest: LatestAssistRun | null
  }
}

/**
 * シフト表の状態を持つ Client（007 §4）。
 *
 * - セルの更新は `useOptimistic` + `applyAssign`（SQL と同じ規則の純関数）で即時反映する
 * - 期間は nuqs の `?start=`。Server の再フェッチが必要なので `shallow: false`
 * - ポップオーバーは開いているセルだけ mount する（`activeCell`）
 */
export function ShiftsClient(props: Props) {
  const { tenantId, cycle, startOfWeek, start, today, staffs, patterns, shares } = props
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
  const [shareOpened, setShareOpened] = useState(false)

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
  // 上書き ?? 基本[曜日] ?? 未設定（015 §3.1）。基本も祝日も Client に届いているのでここで解決する
  const overrides = useMemo(() => toOverrideMap(props.requiredOverrides), [props.requiredOverrides])
  const required = useMemo(
    () => buildRequiredByDate({ dates: range.dates, patterns, overrides, holidays }),
    [range.dates, patterns, overrides, holidays]
  )
  const assigned = useMemo(() => assignedCounts(shifts), [shifts])
  const coverageByDate = useMemo(
    () =>
      new Map(
        range.dates.map((date) => [date, coverageAt(date, workdayPatternIds, required, assigned)])
      ),
    [range.dates, workdayPatternIds, required, assigned]
  )
  const workdaysByStaffId = useMemo(() => {
    const workdayIds = new Set(workdayPatternIds)
    return new Map(
      countShifts(shifts, staffs, workdayIds, range.dates).map((row) => [
        row.staff.id,
        row.workdays,
      ])
    )
  }, [shifts, staffs, workdayPatternIds, range.dates])

  const navigate = (nextValue: string) => {
    void setQuery({ start: nextValue })
  }

  const coach = useFirstVisitCoach(tenantId)
  // 表示中の期間が空で、入れられるスタッフと勤務があるときだけ、最初のスタッフの期間初日に出す
  const coachEligible =
    coach.active && shifts.size === 0 && staffs.length > 0 && patterns.length > 0
  const coachCell =
    coachEligible && !activeCell ? { staffId: staffs[0].id, date: range.dates[0] } : null

  const assign = (cell: ActiveCell, patternId: string | null, fixed: boolean) => {
    setActiveCell(null)
    // 案内を出していたら、最初の 1 つで閉じて次からは出さない。
    // 「できました」の通知は出さない（入れた勤務がその場でマスに見えるので、重ねて伝えなくてよい）
    if (coachEligible && patternId) coach.finish()
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

  /**
   * AI シフト作成の中で必要人数を聞いたとき（015 §3.5）。保存するのは**基本の人数だけ**で、
   * 表示中の期間へは解決で届く（焼き付けは起きない）。設定画面と同じ Action を使う
   */
  const saveAssistRequiredNums = (nums: Record<string, RequiredNumsByDay>) =>
    runBulk(
      () => saveDefaultRequiredNums({ tenantId, nums }),
      () => ({ message: '必要人数を入れました', color: 'green' })
    )

  /** 「この期間の個別の変更を元に戻す」（015 §3.6）。確認にはどの日が戻るかを並べる */
  const confirmResetRequiredNums = () =>
    modals.openConfirmModal({
      title: 'この期間の個別の変更を元に戻す',
      children: (
        <Text size="sm">
          {formatOverriddenDates(overriddenDatesInRange)} の {overriddenDatesInRange.length}{' '}
          日分を、基本の人数に戻します。基本の人数は変わりません。
        </Text>
      ),
      labels: { confirm: '元に戻す', cancel: 'キャンセル' },
      onConfirm: () =>
        runBulk(
          () => resetRequiredNums({ tenantId, start: range.start, end: range.end }),
          () => ({ message: '基本の人数に戻しました', color: 'green' })
        ),
    })

  /**
   * コピー結果を見せるための移動（008 §3.6）。**コピー先の開始日が表示期間の外**にあるときだけ、その日へ移る。
   *
   * 開始日が表示期間の中にある場合は動かない。終了日だけがはみ出す（31 日の From を 30 日の月へ）ときに
   * 開始日へ移ると、月の周期では表示の起点が 1 日からずれてしまう（`dateRange('month')` は開始日を丸めない）。
   * 週・半月の周期では丸めた期間が今と同じなら移動しても変わらないので、それも動かない。
   */
  const showCopyResult = (toStart: string) => {
    if (toStart >= range.start && toStart <= range.end) return
    if (dateRange(cycle, startOfWeek, toStart).start === range.start) return
    navigate(toStart)
  }

  const requiredNumRows = (date: string): RequiredNumRowInput[] => {
    const dayKey = dayKeyFor(date, holidays.has(date))
    return workdayPatterns.map((pattern) => {
      const resolved = resolveRequiredNum(
        overrides,
        pattern.defaultRequiredNums,
        pattern.id,
        date,
        dayKey
      )
      return {
        patternId: pattern.id,
        name: pattern.name,
        required: resolved.num,
        // 「この日だけ変更（基本 3 人）」の札に出す基本の人数（015 §4.3）
        defaultNum: pattern.defaultRequiredNums[dayKey] ?? null,
        overridden: resolved.source === 'override',
        assigned: countAt(assigned, date, pattern.id),
      }
    })
  }

  // 「この期間の個別の変更を元に戻す」の確認に並べる日（015 §3.6）。高々 31 日 × 勤務数なので useMemo は要らない
  const overriddenDatesInRange = overriddenDates(range.dates, workdayPatternIds, overrides)

  const needsSetup = patterns.length === 0 || staffs.length === 0

  // ---- 自動アサイン（012 §4） ----------------------------------------------
  const latestAssist = props.assist.latest
  const assist = useAssist({
    tenantId,
    start: range.start,
    defaultNotes: props.assist.notes,
    pending: latestAssist && !latestAssist.acknowledged ? latestAssist.view : null,
  })
  // 直近の実行で入ったセルの点。結果を閉じるまで（§3.8）
  const assistCells = useMemo(
    () => new Set(latestAssist && !latestAssist.acknowledged ? latestAssist.cellKeys : []),
    [latestAssist]
  )
  // 選んでいる効く一手で埋まるセル。表に点線で出す（§11.1）
  const assistResult = assist.result
  const selectedLever =
    assistResult && assist.selectedLever !== null
      ? assistResult.levers[assist.selectedLever]
      : undefined
  const assistGhosts = useMemo(
    () => (selectedLever ? ghostCells(selectedLever, shifts) : new Map<string, string>()),
    [selectedLever, shifts]
  )
  // フッターの「3/5 → 4/5」（§11.1）
  const assistPreviewCoverage = useMemo(
    () =>
      selectedLever
        ? previewCoverage(selectedLever, shifts, workdayPatternIds, required, assigned)
        : new Map<string, DateCoverage>(),
    [selectedLever, shifts, workdayPatternIds, required, assigned]
  )
  // 一手を選んだとき、点線が画面の外にあれば最初の 1 つまで表をスクロールする（スマホは 4 日分しか見えない）。
  // 点線は表の編集でも描き直るが、そのたびに動かすと編集中のセルから視線が飛ぶので、選んだときだけにする
  useEffect(() => {
    if (!selectedLever) return
    document
      .querySelector('[data-ghost="true"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selectedLever])
  const shortage = useMemo(
    () => shortageByPattern(range.dates, workdayPatterns, required, assigned),
    [range.dates, workdayPatterns, required, assigned]
  )
  const patternNames = useMemo(
    () => new Map(patterns.map((pattern) => [pattern.id, pattern.name])),
    [patterns]
  )
  // 期間に 1 つでも「決まっている」必要人数があるか（015 §3.2。全部未設定なら自動アサインは走らせない）
  const requiredNumsSet = useMemo(
    () => hasAnyRequired(required, range.dates, workdayPatternIds),
    [required, range.dates, workdayPatternIds]
  )
  const assistUndo =
    latestAssist && latestAssist.draftCount > 0
      ? {
          label: `AI の作成を元に戻す（${formatJstMonthDayTime(latestAssist.view.createdAt)}）`,
          onClick: () => assist.rollback(latestAssist.view),
        }
      : null

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
          onOpenShare={() => setShareOpened(true)}
          onBulk={confirmBulk}
          onSetDefaultPatterns={confirmSetDefaultPatterns}
          onResetRequiredNums={confirmResetRequiredNums}
          resetRequiredNumsCount={overriddenDatesInRange.length}
          onOpenCopy={() => setCopyOpened(true)}
          assistAvailable={props.assist.available}
          onOpenAssist={assist.openNew}
          assistUndo={assistUndo}
          disabled={
            isNavigating ||
            isBulkPending ||
            assist.running ||
            assist.isRollingBack ||
            assist.isApplying
          }
        />

        {needsSetup && (
          <EmptyNotice
            tenantId={tenantId}
            hasPattern={patterns.length > 0}
            hasStaff={staffs.length > 0}
          />
        )}

        {/* 表と凡例を縦に積み、結果のパネルはその右に下端まで伸ばす（§11） */}
        <div className={panelClasses.layout}>
          <div className={panelClasses.main}>
            <Box className={classes.scroller} pos="relative">
              <LoadingOverlay visible={isNavigating || isBulkPending} zIndex={4} />
              <CalendarTable
                tenantId={tenantId}
                range={range}
                today={today}
                holidays={holidays}
                staffs={staffs}
                patternsById={patternsById}
                shifts={shifts}
                notesByDate={notesByDate}
                coverageByDate={coverageByDate}
                workdaysByStaffId={workdaysByStaffId}
                assistCells={assistCells}
                assistGhosts={assistGhosts}
                previewCoverageByDate={assistPreviewCoverage}
                activeCell={activeCell}
                draftFixed={draftFixed}
                onOpenCell={openCell}
                onCloseCell={() => setActiveCell(null)}
                onAssign={assign}
                onDraftFixedChange={changeDraftFixed}
                onOpenNote={setNoteDate}
                onOpenRequiredNum={setRequiredNumDate}
                onOpenCount={() => setCountOpened(true)}
                onStaffBulk={confirmBulk}
                // 期間移動中は無効にしない: メニューには「スタッフ情報を編集」もあり、007 では移動中も開けた
                bulkDisabled={isBulkPending}
                popoverPatterns={popoverPatterns}
                coachCell={coachCell}
                onCoachDismiss={coach.finish}
              />
            </Box>
            <PatternDescriptionList patterns={patterns} />
          </div>
          {assistResult && (
            <AssistPanel
              assist={assist}
              run={assistResult}
              tenantId={tenantId}
              holidays={holidays}
              workdayPatterns={workdayPatterns}
              patternNames={patternNames}
            />
          )}
        </div>

        {assistResult && (
          <AssistMobileBar
            assist={assist}
            run={assistResult}
            tenantId={tenantId}
            holidays={holidays}
            workdayPatterns={workdayPatterns}
            patternNames={patternNames}
          />
        )}
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

      {shareOpened && (
        <ShareModal
          tenantId={tenantId}
          cycle={cycle}
          range={range}
          today={today}
          shares={shares}
          onClose={() => setShareOpened(false)}
        />
      )}

      <AssistModal
        assist={assist}
        tenantId={tenantId}
        cycle={cycle}
        range={range}
        shortage={shortage}
        hasRequiredNums={requiredNumsSet}
        staffCount={staffs.length}
        workdayPatternCount={workdayPatterns.length}
        restrictionCount={props.assist.restrictionCount}
        requiredNumPatterns={workdayPatterns.map((pattern) => ({
          id: pattern.id,
          name: pattern.name,
          colorHex: pattern.colorHex,
          defaultRequiredNums: pattern.defaultRequiredNums,
        }))}
        onSaveRequiredNums={saveAssistRequiredNums}
        savingRequiredNums={isBulkPending}
      />

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

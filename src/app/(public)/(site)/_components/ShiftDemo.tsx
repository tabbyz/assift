'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Button, Group, Popover, Text } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { IconArrowBackUp, IconShare2, IconSparkles } from '@tabler/icons-react'
import { formatMonthDay, wday } from '@/lib/calendar/dateString'
import { applyAssign } from '@/lib/shifts/applyAssign'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import { assignedCounts, coverageAt, hasCoverage } from '@/lib/shifts/satisfaction'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { DateHeaderCell, dateToneClass } from '@/components/shiftTable/DateHeaderCell'
import { PatternDescriptionList } from '@/components/shiftTable/PatternDescriptionList'
import { PatternPopover } from '@/components/shiftTable/PatternPopover'
import { ShiftCell } from '@/components/shiftTable/ShiftCell'
import tableClasses from '@/components/shiftTable/ShiftTable.module.css'
import { theme } from '@/theme'
import { planDemoAssist } from '../_lib/demoAssist'
import {
  DEMO_PATTERNS,
  DEMO_RULES,
  DEMO_STAFFS,
  DEMO_STORE_NAME,
  demoInitialShifts,
  demoNotes,
  demoRequired,
} from '../_lib/demoData'
import classes from './ShiftDemo.module.css'

type Props = {
  /** 来週の月〜日（Server が JST で決める） */
  dates: string[]
  /** `dates` のうち祝日（祝日データはクライアントに送らない。AGENTS.md） */
  holidays: string[]
  /** ツールバーの期間タイトル（`formatPeriodTitle`） */
  title: string
}

type ActiveCell = { staffId: string; date: string }
type Message = { title: string; detail?: string; tone: 'ok' | 'info' }

const patternsById = new Map(DEMO_PATTERNS.map((p) => [p.id, p]))
const isWorkday = (patternId: string) => patternsById.get(patternId)?.kind === 'workday'
const WORK_PATTERN_IDS = DEMO_PATTERNS.filter((p) => p.kind === 'workday').map((p) => p.id)
/** デモにペア（夜勤 → 明け）は無い */
const noPair = () => null
/** AI のマスを 1 つずつ出す間隔 */
const STEP_MS = 60

function dateLabel(date: string): string {
  return `${formatMonthDay(date)}（${WEEKDAY_LABELS[wday(date)]}）`
}

/**
 * LP の触れるデモ（016 §3.3）。アプリのシフト表と同じ部品・同じ規則で描く。データはページの中だけで、保存しない。
 *
 * - マスを押す → `PatternPopover`（下書き / 確定・パターン）。アサイン済みの長押しで下書き ⇔ 確定
 * - AIで作成 → 不足の枠をデモ用の貪欲法で 1 マスずつ埋める（実物はソルバー。012）。入ったマスには点（012 §3.8）
 * - 元に戻す（AI が入れて、まだ触っていないマスだけ消す）/ すべて確定 / 共有（文言だけ）
 */
export function ShiftDemo({ dates, holidays, title }: Props) {
  const holidaySet = useMemo(() => new Set(holidays), [holidays])
  const required = useMemo(() => demoRequired(dates, holidaySet), [dates, holidaySet])
  const notes = useMemo(() => demoNotes(dates), [dates])

  const [shifts, setShifts] = useState<ShiftMap>(() => demoInitialShifts(dates))
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [draftFixed, setDraftFixed] = useState(false)
  const [aiCells, setAiCells] = useState<Set<string>>(() => new Set())
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const reduceMotion = useReducedMotion()
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const counts = useMemo(() => assignedCounts(shifts), [shifts])
  const workdaysByStaff = useMemo(() => {
    const result = new Map<string, number>()
    for (const shift of shifts.values()) {
      if (isWorkday(shift.patternId)) {
        result.set(shift.staffId, (result.get(shift.staffId) ?? 0) + 1)
      }
    }
    return result
  }, [shifts])

  const forgetAi = (key: string) => {
    setAiCells((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const assign = (cell: ActiveCell, patternId: string | null, fixed: boolean) => {
    setActiveCell(null)
    setShifts((prev) => applyAssign(prev, noPair, { ...cell, patternId, fixed }))
    forgetAi(cellKey(cell.staffId, cell.date))
  }

  const openCell = (cell: ActiveCell) => {
    if (running) return
    if (activeCell?.staffId === cell.staffId && activeCell.date === cell.date) {
      setActiveCell(null)
      return
    }
    setActiveCell(cell)
    setDraftFixed(shifts.get(cellKey(cell.staffId, cell.date))?.fixed ?? false)
  }

  /** 下書き ⇔ 確定。アサイン済みなら同じパターンで押し直す（アプリと同じ） */
  const changeDraftFixed = (cell: ActiveCell, fixed: boolean) => {
    setDraftFixed(fixed)
    const current = shifts.get(cellKey(cell.staffId, cell.date))
    if (current) assign(cell, current.patternId, fixed)
  }

  const runAssist = () => {
    setActiveCell(null)
    const plan = planDemoAssist({
      dates,
      staffs: DEMO_STAFFS,
      shifts,
      required,
      patternIds: DEMO_RULES.patternIds,
      isWorkday,
      rest: DEMO_RULES.rest,
      maxConsecutive: DEMO_RULES.maxConsecutive,
    })
    const left = plan.shortages.reduce((n, s) => n + s.count, 0)
    const total = plan.adds.length + left

    if (total === 0) {
      setMessage({ title: '足りない枠はありません。', tone: 'info' })
      return
    }

    const finish = () => {
      setRunning(false)
      const detail =
        plan.shortages.length > 0
          ? `${plan.shortages
              .map((s) => `${dateLabel(s.date)}${patternsById.get(s.patternId)?.name}${s.count}枠`)
              .join('、')}は、条件に合うスタッフがいません`
          : '出られない曜日・週の勤務日数・遅番の翌日の早番を考えて入れました'
      setMessage({
        title: `${plan.adds.length} / ${total}枠を下書きで配置しました。`,
        detail,
        tone: 'ok',
      })
    }

    const put = (index: number) => {
      const cell = plan.adds[index]
      if (!cell) {
        finish()
        return
      }
      const key = cellKey(cell.staffId, cell.date)
      setShifts((prev) => new Map(prev).set(key, cell))
      setAiCells((prev) => new Set(prev).add(key))
      timer.current = window.setTimeout(() => put(index + 1), STEP_MS)
    }

    setMessage({ title: '割り当てを考えています…', tone: 'info' })
    if (reduceMotion) {
      setShifts((prev) => {
        const next = new Map(prev)
        for (const cell of plan.adds) next.set(cellKey(cell.staffId, cell.date), cell)
        return next
      })
      setAiCells((prev) => {
        const next = new Set(prev)
        for (const cell of plan.adds) next.add(cellKey(cell.staffId, cell.date))
        return next
      })
      finish()
      return
    }
    setRunning(true)
    put(0)
  }

  const undoAssist = () => {
    setActiveCell(null)
    const count = aiCells.size
    setShifts((prev) => {
      const next = new Map(prev)
      for (const key of aiCells) next.delete(key)
      return next
    })
    setAiCells(new Set())
    setMessage({ title: `AIが入れた${count}枠を消しました。`, tone: 'info' })
  }

  const fixAll = () => {
    setActiveCell(null)
    setShifts((prev) => {
      const next: ShiftMap = new Map()
      for (const [key, cell] of prev) next.set(key, { ...cell, fixed: true })
      return next
    })
    setAiCells(new Set())
    setMessage({
      title: 'すべて確定しました。',
      detail: '共有のURLを送れば、スタッフがスマホで見られます',
      tone: 'ok',
    })
  }

  const share = () => {
    setActiveCell(null)
    setMessage({
      title: '共有のURLを発行しました（デモ）。',
      detail: 'スタッフはログインせずにスマホで開けます',
      tone: 'info',
    })
  }

  const hasDraft = [...shifts.values()].some((s) => !s.fixed)

  return (
    <div
      className={classes.demo}
      // 表はアプリと同じシステムフォントで描く（LP の書体を持ち込まない）
      style={{ '--mantine-font-family': theme.fontFamily } as CSSProperties}
    >
      <Group className={classes.toolbar} justify="space-between" gap="xs">
        <div>
          <Text fz={12} c="dimmed" lh={1.4}>
            {DEMO_STORE_NAME}
          </Text>
          <Text fz={16} fw={650} lh={1.4}>
            {title}
          </Text>
        </div>
        <Group gap={6}>
          <Button
            size="compact-sm"
            leftSection={<IconSparkles size={16} />}
            onClick={runAssist}
            disabled={running}
          >
            AIで作成
          </Button>
          {aiCells.size > 0 && !running && (
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconArrowBackUp size={16} />}
              onClick={undoAssist}
            >
              元に戻す
            </Button>
          )}
          <Button
            size="compact-sm"
            variant="default"
            onClick={fixAll}
            disabled={running || !hasDraft}
          >
            すべて確定
          </Button>
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconShare2 size={16} />}
            onClick={share}
            disabled={running}
          >
            共有
          </Button>
        </Group>
      </Group>

      <div className={classes.result} data-tone={message?.tone} role="status" hidden={!message}>
        {message && (
          <>
            <Text component="span" fz={13} fw={650}>
              {message.title}
            </Text>
            {message.detail && (
              <Text component="span" fz={13} c="dimmed">
                {message.detail}
              </Text>
            )}
          </>
        )}
      </div>

      <div className={classes.scroll}>
        <table className={`${tableClasses.table} ${classes.table}`}>
          <thead>
            <tr className={tableClasses.dateRow}>
              <th scope="col" aria-label="スタッフ" />
              {dates.map((date) => {
                const note = notes.get(date)
                return (
                  <th key={date} scope="col">
                    <div
                      className={[tableClasses.dateHead, dateToneClass(date, holidaySet.has(date))]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className={tableClasses.dateMain}>
                        <DateHeaderCell date={date} />
                      </div>
                      <div className={tableClasses.noteCell}>{note}</div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {DEMO_STAFFS.map((staff) => (
              <tr key={staff.id}>
                <th scope="row">
                  <div className={tableClasses.menuButton}>
                    <span className={tableClasses.staffNameText}>{staff.name}</span>
                    <span className={tableClasses.workdays}>
                      {workdaysByStaff.get(staff.id) ?? 0}日
                    </span>
                  </div>
                </th>
                {dates.map((date) => {
                  const cell = { staffId: staff.id, date }
                  const key = cellKey(staff.id, date)
                  const shift = shifts.get(key)
                  const pattern = shift ? patternsById.get(shift.patternId) : undefined
                  const fixedLabel = pattern ? (shift?.fixed ? '確定' : '下書き') : ''
                  const label = [staff.name, dateLabel(date), pattern?.name, fixedLabel]
                    .filter(Boolean)
                    .join(' ')
                  const isActive = activeCell?.staffId === staff.id && activeCell.date === date

                  const button = (
                    <ShiftCell
                      pattern={pattern}
                      fixed={shift?.fixed ?? false}
                      enabled={staff.availableWdays.includes(wday(date))}
                      label={label}
                      marked={Boolean(pattern) && aiCells.has(key)}
                      onClick={() => openCell(cell)}
                      holdKey={`demo:${key}`}
                      onToggleFixed={
                        pattern && shift && !running
                          ? () => assign(cell, shift.patternId, !shift.fixed)
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
                          onDismiss={() => setActiveCell(null)}
                        >
                          <Popover.Target>{button}</Popover.Target>
                          <Popover.Dropdown p="xs">
                            <PatternPopover
                              patterns={DEMO_PATTERNS}
                              selectedPatternId={shift?.patternId ?? null}
                              fixed={draftFixed}
                              onFixedChange={(fixed) => changeDraftFixed(cell, fixed)}
                              onAssign={(patternId) => assign(cell, patternId, draftFixed)}
                              onClose={() => setActiveCell(null)}
                            />
                          </Popover.Dropdown>
                        </Popover>
                      ) : (
                        button
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className={tableClasses.footRow}>
              <th className={tableClasses.footLabel} scope="row">
                配置 / 必要人数
              </th>
              {dates.map((date) => {
                const coverage = coverageAt(date, WORK_PATTERN_IDS, required, counts)
                return (
                  <td key={date}>
                    <div
                      className={tableClasses.footCell}
                      data-state={hasCoverage(coverage) ? coverage.state : undefined}
                    >
                      {hasCoverage(coverage) ? `${coverage.assigned}/${coverage.required}` : ' '}
                    </div>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <PatternDescriptionList patterns={DEMO_PATTERNS} />
    </div>
  )
}

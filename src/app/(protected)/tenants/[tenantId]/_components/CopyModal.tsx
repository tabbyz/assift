'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ActionIcon, Button, Group, Modal, Stack, Text, UnstyledButton } from '@mantine/core'
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates'
import { readLocalStorageValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  IconArrowDown,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconHistory,
  IconInfoCircle,
  IconLock,
} from '@tabler/icons-react'
import { chipStyle } from '@/components/shiftTable/cellStyle'
import { dateRange, prevStart, type DateRange } from '@/lib/calendar/dateRange'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { copyEnd, daysBetween, formatMonthDay, wday } from '@/lib/calendar/dateString'
import { isWhitePattern, NEUTRAL_OUTLINE } from '@/lib/patterns/colors'
import type { PatternKind } from '@/lib/patterns/kinds'
import { termIssue } from '@/lib/validation/date'
import {
  COPY_TERM_MESSAGES,
  copyConditionsSchema,
  type CopyConditions,
} from '@/lib/validation/shifts'
import { copyShifts } from '../actions'
import {
  isPeriod,
  lastSourceSuggestion,
  stepPeriod,
  termTitle,
  titleIsRange,
  weekdayLabel,
  weekdayNote,
  type Term,
} from '../_lib/copyPlan'
import { failure, outcome } from '../_lib/notices'
import { MODAL_DATE_PICKER_PROPS } from './datePickerProps'
import classes from './CopyModal.module.css'

export type CopyPattern = { id: string; name: string; colorHex: string; kind: PatternKind }

type Props = {
  tenantId: string
  cycle: ShiftCycle
  startOfWeek: number
  range: DateRange
  patterns: CopyPattern[]
  onClose: () => void
  /** 実際に行が入ったときだけ呼ぶ。コピー先の開始日が表示期間の外なら、呼び出し側が移動する（008 §3.6） */
  onCopied: (toStart: string) => void
}

/** 期間で選ぶ（既定）/ 日付を指定（011 §8.2） */
type Mode = 'period' | 'custom'

const storageKey = (tenantId: string) => `assift:copyShifts:${tenantId}`

/** 前回条件を読む。壊れていれば無かったことにする */
function readStoredConditions(tenantId: string): CopyConditions | null {
  const parsed = copyConditionsSchema.safeParse(
    readLocalStorageValue({ key: storageKey(tenantId) })
  )
  return parsed.success ? parsed.data : null
}

/**
 * 前回条件から戻すのは勤務パターンの選択だけ（011 §8.2 の 3）。消えたパターンは落とす。
 * 何も残らなければ全選択（何も選ばれていない状態では始めない。v1 も cookie が無いときは全選択）
 */
function initialPatternIds(stored: CopyConditions | null, patterns: CopyPattern[]): string[] {
  const all = patterns.map((pattern) => pattern.id)
  if (!stored) return all
  const existing = new Set(all)
  const restored = stored.patternIds.filter((id) => existing.has(id))
  return restored.length > 0 ? restored : all
}

/** 送信が通ったときだけ保存する（v1 の cookie と同じ。開いただけ・キャンセルでは残さない） */
function saveConditions(tenantId: string, conditions: CopyConditions) {
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(conditions))
  } catch {
    // プライベートモードなどで書けなくても、コピー自体は済んでいる
  }
}

/** `9/1（火）`。曜日だけのときは括弧を付けない。土日だけ表と同じ色にする（祝日の赤は期間外の祝日データを持たないので付けない） */
function DateLabel({ date, withDate = true }: { date: string; withDate?: boolean }) {
  const day = wday(date)
  const tone = day === 0 ? classes.sun : day === 6 ? classes.sat : undefined
  const weekday = <span className={tone}>{weekdayLabel(date)}</span>
  if (!withDate) return weekday
  return (
    <span className={classes.dateLabel}>
      {formatMonthDay(date)}（{weekday}）
    </span>
  )
}

/** `9/1（火） 〜 9/30（水）`。期間名が範囲表記のときは曜日だけ */
function TermDates({ term, title }: { term: Term; title: string }) {
  const withDate = !titleIsRange(title, term)
  return (
    <>
      <DateLabel date={term.start} withDate={withDate} /> 〜{' '}
      <DateLabel date={term.end} withDate={withDate} />
    </>
  )
}

type LegProps = {
  label: string
  children: ReactNode
  /** コピー先の行だけ。枠の区切り線の上に下向きの矢印を載せる */
  withArrow?: boolean
  stepper?: { name: string; onStep: (direction: -1 | 1) => void }
}

/** コピー元 / コピー先の 1 行 */
function Leg({ label, children, withArrow, stepper }: LegProps) {
  return (
    <div className={classes.leg}>
      {withArrow && (
        <span className={classes.hop} aria-hidden>
          <IconArrowDown size={14} stroke={2} />
        </span>
      )}
      <div className={classes.legLabel}>{label}</div>
      <div className={classes.legBody}>{children}</div>
      {stepper && (
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant="default"
            size={28}
            aria-label={`${stepper.name}を前の期間へ`}
            onClick={() => stepper.onStep(-1)}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            size={28}
            aria-label={`${stepper.name}を次の期間へ`}
            onClick={() => stepper.onStep(1)}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      )}
    </div>
  )
}

/** 押す前に読ませる規則（共有モーダルの注意と同じ組み。011 §8.2 の 6） */
function CopyFacts() {
  const facts: { icon: typeof IconLock; body: ReactNode }[] = [
    {
      icon: IconLock,
      body: (
        <>
          コピー先にシフトが<b>入っているマス</b>はそのまま残ります
        </>
      ),
    },
  ]
  return (
    <ul className={classes.facts}>
      {facts.map(({ icon: Icon, body }, index) => (
        <li key={index}>
          <Icon size={16} aria-hidden className={classes.factIcon} />
          <span>{body}</span>
        </li>
      ))}
    </ul>
  )
}

/** 表の凡例と同じ札。選択中は淡塗り + チェック、外したものは白地 + 色の四角 */
function PatternChip({
  pattern,
  selected,
  onToggle,
}: {
  pattern: CopyPattern
  selected: boolean
  onToggle: () => void
}) {
  return (
    <UnstyledButton
      className={classes.chip}
      aria-pressed={selected}
      data-selected={selected || undefined}
      style={selected ? chipStyle(pattern.colorHex) : undefined}
      onClick={onToggle}
    >
      <span className={classes.mark} aria-hidden>
        {selected ? (
          <IconCheck size={14} stroke={2.6} />
        ) : (
          <span
            className={classes.swatch}
            style={{
              backgroundColor: pattern.colorHex,
              borderColor: isWhitePattern(pattern.colorHex) ? NEUTRAL_OUTLINE : pattern.colorHex,
            }}
          />
        )}
      </span>
      {pattern.name}
    </UnstyledButton>
  )
}

const PATTERN_GROUPS: { kind: PatternKind; label: string }[] = [
  { kind: 'workday', label: '勤務' },
  { kind: 'dayoff', label: '休み' },
]

/**
 * シフトコピー（v1 `shifts/copy/_index.html.slim`。011 §8 で作り直し）。
 *
 * 既定は「期間で選ぶ」: コピー元 / コピー先を `‹ ›` で期間ごと動かす。コピー先は常に表示中の期間から始め、
 * コピー元はその 1 つ前の期間。任意の日付は「日付を指定」に切り替えて選ぶ。
 * 曜日のずれはその場で出し、押す前に結果が読めるようにする。
 *
 * 日付は `DatePickerInput` の **`dropdownType="modal"`** で選ぶ（`MODAL_DATE_PICKER_PROPS`）。
 * `DateInput`（手入力できる方）だと入力欄にフォーカスした時点でカレンダーが下に開き、勤務パターンの
 * 札を覆う。その状態で札を押すとクリックがカレンダーの日付に吸われ、
 * **コピー先の日付が黙って変わる**（実測。008 §10.4）。
 */
export function CopyModal({
  tenantId,
  cycle,
  startOfWeek,
  range,
  patterns,
  onClose,
  onCopied,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 前回条件と既定値は mount 時に 1 回だけ読む（開いている間は追わない）。
  // `useLocalStorage` は開いた時点で既定値を書き戻してしまい、
  // 「前回コピーした条件」ではなく「前回開いた期間の既定値」が残る（008 §10.11）
  const [initial] = useState(() => {
    const stored = readStoredConditions(tenantId)
    const previous = dateRange(cycle, startOfWeek, prevStart(cycle, range))
    const from = { start: previous.start, end: previous.end }
    return {
      from,
      patternIds: initialPatternIds(stored, patterns),
      suggestion: lastSourceSuggestion(stored, cycle, startOfWeek, from),
    }
  })

  const [mode, setMode] = useState<Mode>('period')
  // 日付指定の範囲ピッカーは 1 回目のクリックで `[開始, null]` を返す。途中の状態も表示に要るので持っておく
  const [from, setFrom] = useState<DatesRangeValue<string>>([initial.from.start, initial.from.end])
  const [toStart, setToStart] = useState(range.start)
  const [patternIds, setPatternIds] = useState(initial.patternIds)

  const fromTerm: Term | null = from[0] && from[1] ? { start: from[0], end: from[1] } : null
  // 正は Zod（サーバー）。同じ termIssue と同じ文言で、押す前に理由が見えるようにし、直るまで送らせない
  const issue = fromTerm ? termIssue(fromTerm.start, fromTerm.end) : null
  const toTerm: Term | null =
    fromTerm && issue !== 'order'
      ? { start: toStart, end: copyEnd(fromTerm.start, fromTerm.end, toStart) }
      : null
  // 開始日が同じなら、コピー元の行がすべて自分自身と衝突して 0 件になるだけ
  const same = fromTerm !== null && fromTerm.start === toStart

  const toPeriod = dateRange(cycle, startOfWeek, toStart)
  const toPeriodTitle = termTitle(cycle, startOfWeek, toPeriod)
  const fromTitle = fromTerm ? termTitle(cycle, startOfWeek, fromTerm) : ''
  const canSubmit =
    patterns.length > 0 && patternIds.length > 0 && fromTerm !== null && issue === null && !same

  const suggestion =
    initial.suggestion &&
    (initial.suggestion.start !== fromTerm?.start || initial.suggestion.end !== fromTerm?.end)
      ? initial.suggestion
      : null

  const stepFrom = (direction: -1 | 1) => {
    if (!fromTerm) return
    const next = stepPeriod(cycle, startOfWeek, fromTerm, direction)
    setFrom([next.start, next.end])
  }
  const stepTo = (direction: -1 | 1) =>
    setToStart(stepPeriod(cycle, startOfWeek, toPeriod, direction).start)

  // 期間に戻すときは、それぞれの開始日を含む期間へそろえる
  const switchMode = () => {
    if (mode === 'custom') {
      const source = dateRange(cycle, startOfWeek, from[0] ?? initial.from.start)
      setFrom([source.start, source.end])
      setToStart(toPeriod.start)
    }
    setMode(mode === 'period' ? 'custom' : 'period')
  }

  const applySuggestion = (term: Term) => {
    setFrom([term.start, term.end])
    // 期間で表せないコピー元（途中で切れた範囲）は日付指定で見せる
    if (!isPeriod(cycle, startOfWeek, term)) setMode('custom')
  }

  const allSelected = patterns.length > 0 && patternIds.length === patterns.length
  const toggle = (id: string) =>
    setPatternIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )

  const submit = () => {
    if (!fromTerm) return
    const conditions = { fromStart: fromTerm.start, fromEnd: fromTerm.end, toStart, patternIds }
    startTransition(async () => {
      const result = await copyShifts({ tenantId, ...conditions })
      if (!result.ok) {
        notifications.show(failure(result.error))
        router.refresh()
        return
      }
      saveConditions(tenantId, conditions)
      onClose()

      // コピー先がすべて埋まっていたときは緑の成功で流さず、移動もしない（008 §10.7 / §10.11）
      notifications.show(
        outcome(
          result.data.inserted,
          'シフトをコピーしました',
          'コピー先がすべてアサイン済みのため、追加したシフトはありません'
        )
      )
      if (result.data.inserted > 0) onCopied(toStart)
    })
  }

  return (
    <Modal opened onClose={onClose} title="シフトをコピー" size="md">
      <Stack gap="md">
        <div>
          <div className={classes.route}>
            {mode === 'period' && fromTerm ? (
              <>
                <Leg label="コピー元" stepper={{ name: 'コピー元', onStep: stepFrom }}>
                  <div className={classes.legTitle}>{fromTitle}</div>
                  <div className={`${classes.legDates} ${classes.num}`}>
                    <TermDates term={fromTerm} title={fromTitle} />
                  </div>
                </Leg>
                <Leg label="コピー先" withArrow stepper={{ name: 'コピー先', onStep: stepTo }}>
                  <div className={classes.legTitle}>{toPeriodTitle}</div>
                  {toTerm && (
                    <div className={`${classes.legDates} ${classes.num}`}>
                      <TermDates term={toTerm} title={toPeriodTitle} />
                    </div>
                  )}
                </Leg>
              </>
            ) : (
              <>
                <Leg label="コピー元">
                  <DatePickerInput
                    type="range"
                    aria-label="コピー元の期間"
                    allowSingleDateInRange
                    value={from}
                    onChange={setFrom}
                    leftSection={<IconCalendar size={16} />}
                    error={issue ? COPY_TERM_MESSAGES[issue] : null}
                    rightSection={
                      fromTerm ? (
                        <span className={`${classes.days} ${classes.num}`}>
                          {daysBetween(fromTerm.start, fromTerm.end)}日
                        </span>
                      ) : null
                    }
                    rightSectionWidth={52}
                    rightSectionPointerEvents="none"
                    {...MODAL_DATE_PICKER_PROPS}
                  />
                </Leg>
                <Leg label="コピー先" withArrow>
                  <Group gap={10} wrap="nowrap">
                    <DatePickerInput
                      aria-label="コピー先の開始日"
                      value={toStart}
                      onChange={(value) => value && setToStart(value)}
                      leftSection={<IconCalendar size={16} />}
                      w={160}
                      {...MODAL_DATE_PICKER_PROPS}
                    />
                    <span className={`${classes.toEnd} ${classes.num}`}>
                      〜 {toTerm && !issue ? <DateLabel date={toTerm.end} /> : '—'}
                    </span>
                  </Group>
                </Leg>
              </>
            )}
          </div>

          <div className={classes.metaRow}>
            {same ? (
              <span className={`${classes.metaNote} ${classes.metaError}`}>
                <IconInfoCircle size={14} aria-hidden />
                コピー元とコピー先が同じです
              </span>
            ) : fromTerm && !issue ? (
              <span className={`${classes.metaNote} ${classes.num}`}>
                <IconCalendar size={14} aria-hidden className={classes.metaIcon} />
                {weekdayNote(fromTerm.start, toStart)}
              </span>
            ) : (
              <span />
            )}
            {/* 文字ボタンは本文より一段軽く（期間名・札が主役） */}
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              fw={500}
              c="gray.7"
              onClick={switchMode}
            >
              {mode === 'period' ? '日付を指定' : '期間で選ぶ'}
            </Button>
          </div>

          {suggestion && (
            <div className={classes.metaRow}>
              <span className={`${classes.metaNote} ${classes.num}`}>
                <IconHistory size={14} aria-hidden className={classes.metaIcon} />
                前回のコピー元：{termTitle(cycle, startOfWeek, suggestion)}
              </span>
              <Button
                variant="subtle"
                color="dark"
                size="compact-sm"
                onClick={() => applySuggestion(suggestion)}
              >
                これを使う
              </Button>
            </div>
          )}
        </div>

        {/*
          勤務パターンが 1 件も無い店舗では、選ぶものが無いのに Zod が
          「コピー対象の勤務パターンを選択してください」と言う行き止まりになる（008 §10.9）。
          理由を書いて送信できないようにし、登録先へ案内する
        */}
        {patterns.length === 0 ? (
          <div className={classes.empty}>
            <Text size="sm" c="dimmed">
              勤務パターンが無いので、写すものがありません
            </Text>
            <Button
              component={Link}
              href={`/tenants/${tenantId}/settings/patterns`}
              variant="subtle"
              color="dark"
              size="compact-sm"
              rightSection={<IconArrowRight size={14} />}
            >
              勤務パターンを登録
            </Button>
          </div>
        ) : (
          <div>
            <div className={classes.sectionHead}>
              <span className={classes.sectionLabel}>
                コピーする勤務パターン
                <span className={classes.count}>
                  {patternIds.length}/{patterns.length}
                </span>
              </span>
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                fw={500}
                c="gray.7"
                onClick={() => setPatternIds(allSelected ? [] : patterns.map((p) => p.id))}
              >
                {allSelected ? 'すべて外す' : 'すべて選ぶ'}
              </Button>
            </div>
            {PATTERN_GROUPS.map(({ kind, label }) => {
              const group = patterns.filter((pattern) => pattern.kind === kind)
              if (group.length === 0) return null
              return (
                <div key={kind} className={classes.group}>
                  <span className={classes.groupLabel}>{label}</span>
                  <div className={classes.chips}>
                    {group.map((pattern) => (
                      <PatternChip
                        key={pattern.id}
                        pattern={pattern}
                        selected={patternIds.includes(pattern.id)}
                        onToggle={() => toggle(pattern.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {/* フッターに置くとボタンが折り返すので、札の下に出す */}
            {patternIds.length === 0 && (
              <Text size="xs" c="dimmed" mt={6} pl={40}>
                コピーする勤務パターンを選んでください
              </Text>
            )}
          </div>
        )}

        <CopyFacts />

        <Group justify="flex-end" gap={8}>
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={isPending}
            disabled={!canSubmit}
            leftSection={<IconCopy size={16} />}
          >
            シフトをコピー
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

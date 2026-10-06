'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ActionIcon,
  Anchor,
  Button,
  Drawer,
  LoadingOverlay,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronUp,
  IconInfoCircle,
  IconMinus,
  IconHelpCircle,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import type { AssistInterpretation, AssistLever, AssistRunView } from '@/lib/assist/result'
import { tightenRestrictionDays } from '@/lib/restrictions/describe'
import { datesBetween, wday } from '@/lib/calendar/dateString'
import { formatJstMonthDayTime } from '@/lib/calendar/datetime'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { gridSpan, leverEffect, leverSlots, unfilledGrid } from '../_lib/assist'
import type { AssistController } from './AssistModal'
import classes from './AssistPanel.module.css'

/** スマホのシートに切り替える幅（Mantine の sm） */
const MOBILE_QUERY = '(max-width: 48em)'

type Props = {
  assist: AssistController
  run: AssistRunView
  tenantId: string
  holidays: Set<string>
  /** 出勤日のパターン（表示順）。小さな表の行 */
  workdayPatterns: { id: string; name: string }[]
  patternNames: Map<string, string>
}

/**
 * 自動アサインの結果（012 §11）。PC は表の右のパネル、スマホは下からのシート。
 * 焦点は「どこが空いたか（小さな表）」→「足りない枠を埋めるには」の順。
 */
export function AssistPanel(props: Props) {
  const { assist } = props
  const mobile = useMediaQuery(MOBILE_QUERY)

  if (!mobile) {
    return (
      <aside className={classes.panel} aria-label="AI の作成結果">
        <LoadingOverlay visible={assist.isApplying} zIndex={5} />
        <ResultBody {...props} mobile={false} />
      </aside>
    )
  }

  return (
    <Drawer
      opened={assist.sheetOpened}
      onClose={() => assist.setSheetOpened(false)}
      position="bottom"
      size="85%"
      withCloseButton={false}
      padding={0}
      // 見出しは本文に出すので、ダイアログの名前（aria-labelledby）用の title は画面から隠す
      title="AI の作成結果"
      classNames={{ content: classes.sheet, header: classes.srOnly }}
    >
      <LoadingOverlay visible={assist.isApplying} zIndex={5} />
      <ResultBody {...props} mobile />
    </Drawer>
  )
}

/**
 * スマホでシートをしまったときの下端のバー（§11.1 の ② / ③）。表の下に置き、表の高さを削る（表の上には重ねない）。
 * 一手を選んでいればその一手と実行ボタン、選んでいなければ結果の要約（押すとシートが開く）。
 */
export function AssistMobileBar({ assist, run, tenantId, patternNames }: Props) {
  const mobile = useMediaQuery(MOBILE_QUERY)
  if (!mobile || assist.sheetOpened) return null

  const lever = assist.selectedLever === null ? undefined : run.levers[assist.selectedLever]
  const unfilled = run.requested - run.filled

  if (!lever || assist.selectedLever === null) {
    return (
      <UnstyledButton
        className={classes.peek}
        onClick={() => assist.setSheetOpened(true)}
        aria-label="AI の作成結果を開く"
      >
        <span className={classes.grabber} aria-hidden />
        <span className={classes.peekRow}>
          <IconSparkles size={18} aria-hidden />
          <span className={classes.peekTitle}>AI の結果</span>
          {unfilled > 0 && (
            <span className={`${classes.short} ${classes.num}`}>{unfilled} 枠が未配置</span>
          )}
          <IconChevronUp size={20} className={classes.peekIcon} aria-hidden />
        </span>
      </UnstyledButton>
    )
  }

  const index = assist.selectedLever
  return (
    <section className={classes.bar} aria-label="選んだ一手">
      <span className={classes.grabber} aria-hidden />
      <div className={classes.leverHead}>
        <div className={classes.leverText}>
          <span className={classes.leverKind}>{leverKind(lever)}</span>
          <span className={classes.leverTitle}>{tightenRestrictionDays(lever.label)}</span>
          <span className={classes.leverSub}>{leverEffect(lever, patternNames)}（表の点線）</span>
        </div>
        <span className={`${classes.gain} ${classes.num}`}>+{lever.gain} 枠</span>
      </div>
      <div className={classes.barActions}>
        <Button
          variant="default"
          size="md"
          leftSection={<IconChevronLeft size={16} />}
          onClick={() => assist.setSheetOpened(true)}
        >
          結果に戻る
        </Button>
        <LeverAction
          lever={lever}
          onApply={() => assist.applyLever(run, index)}
          loading={assist.isApplying}
          tenantId={tenantId}
          size="md"
        />
      </div>
    </section>
  )
}

function ResultBody({
  assist,
  run,
  tenantId,
  holidays,
  workdayPatterns,
  patternNames,
  mobile,
}: Props & { mobile: boolean }) {
  const unfilledTotal = run.unfilled.reduce((sum, slot) => sum + slot.count, 0)
  const busy = assist.isRollingBack || assist.isApplying
  const selected = assist.selectedLever === null ? undefined : run.levers[assist.selectedLever]

  const pick = (index: number) => {
    if (mobile) {
      // スマホは表と並べて見られないので、選んだらシートをしまって表の点線を見せる（§11.1 の ②）
      assist.showLever(index)
      assist.setSheetOpened(false)
      return
    }
    assist.selectLever(index)
  }

  return (
    <div className={classes.body} data-mobile={mobile || undefined}>
      {mobile && <span className={classes.grabber} aria-hidden />}
      <div className={classes.scroll}>
        <div className={classes.header}>
          <IconSparkles size={18} aria-hidden />
          <span className={classes.title}>AI の作成結果</span>
          <span className={classes.muted}>{formatJstMonthDayTime(run.createdAt)}</span>
          {mobile ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xl"
              ml="auto"
              onClick={() => assist.setSheetOpened(false)}
              aria-label="シートをしまう"
            >
              <IconChevronDown size={20} />
            </ActionIcon>
          ) : (
            <ActionIcon
              variant="subtle"
              color="gray"
              ml="auto"
              onClick={assist.closeResult}
              disabled={busy}
              aria-label="パネルを閉じる"
            >
              <IconX size={18} />
            </ActionIcon>
          )}
        </div>

        {run.similarToPrevious && (
          <Notice icon={<IconInfoCircle size={16} />}>
            前回とほぼ同じ案です（条件を満たす別の割り当てがほとんどありません）
          </Notice>
        )}
        {run.relaxed && (
          <Notice icon={<IconAlertTriangle size={16} />}>
            「必ず」の指示をすべて守れる割り当てが無かったため、できるだけ守る形で作りました
          </Notice>
        )}

        {unfilledTotal > 0 ? (
          <UnfilledSection
            run={run}
            total={unfilledTotal}
            holidays={holidays}
            workdayPatterns={workdayPatterns}
            highlight={selected ? leverSlots(selected) : null}
          />
        ) : (
          <p className={classes.allFilled}>
            <IconCheck size={16} aria-hidden />
            すべての枠を埋めました
          </p>
        )}

        {run.levers.length > 0 && (
          <section
            className={`${classes.section} ${classes.divided}`}
            aria-label="足りない枠を埋めるには"
          >
            <div className={classes.sectionHead}>
              <span className={`${classes.sectionTitle} ${classes.sectionTitleRow}`}>
                <IconHelpCircle
                  size={16}
                  stroke={1.75}
                  className={classes.promptIcon}
                  aria-hidden
                />
                足りない枠を埋めるには
              </span>
            </div>
            {run.levers.map((lever, index) => {
              const isSelected = !mobile && assist.selectedLever === index
              return (
                <div key={index} className={classes.lever} data-selected={isSelected || undefined}>
                  <UnstyledButton
                    className={classes.leverMain}
                    onClick={() => pick(index)}
                    aria-pressed={mobile ? undefined : isSelected}
                  >
                    <span className={classes.leverText}>
                      <span className={classes.leverKind}>{leverKind(lever)}</span>
                      <span className={classes.leverTitle}>
                        {tightenRestrictionDays(lever.label)}
                      </span>
                      <span className={classes.leverSub}>{leverEffect(lever, patternNames)}</span>
                    </span>
                    <span className={`${classes.gain} ${classes.num}`}>+{lever.gain} 枠</span>
                  </UnstyledButton>
                  {isSelected && (
                    <div className={classes.leverActions}>
                      <LeverAction
                        lever={lever}
                        onApply={() => assist.applyLever(run, index)}
                        loading={assist.isApplying}
                        tenantId={tenantId}
                        size="compact-sm"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

        {run.interpretations.length > 0 && (
          <section className={classes.section} aria-label="指示の解釈">
            <span className={classes.sectionTitle}>指示</span>
            <ul className={classes.interpretations}>
              {run.interpretations.map((item, index) => (
                <InterpretationItem key={index} item={item} />
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className={classes.footer}>
        <Button
          variant="default"
          size={mobile ? 'md' : 'sm'}
          onClick={() => assist.rollback(run)}
          loading={assist.isRollingBack}
          disabled={assist.isApplying}
        >
          元に戻す
        </Button>
        <Button
          variant="default"
          size={mobile ? 'md' : 'sm'}
          onClick={() => assist.retry(run)}
          disabled={busy}
        >
          別の案を作る
        </Button>
        <Button
          size={mobile ? 'md' : 'sm'}
          className={classes.closeButton}
          onClick={assist.closeResult}
          disabled={busy}
        >
          完了
        </Button>
      </div>
    </div>
  )
}

function leverKind(lever: AssistLever): string {
  return lever.kind === 'directive' ? 'AI への指示' : '自動アサイン制約'
}

/** 指示は外して作り直す。制約は今回だけ緩め、店舗の設定を変える導線は残す */
function LeverAction({
  lever,
  onApply,
  loading,
  tenantId,
  size,
}: {
  lever: AssistLever
  onApply: () => void
  loading: boolean
  tenantId: string
  size: 'compact-sm' | 'md'
}) {
  if (lever.kind === 'directive') {
    return (
      <Button size={size} className={classes.apply} onClick={onApply} loading={loading}>
        この指示を外して作り直す
      </Button>
    )
  }
  return (
    <div className={classes.leverApply}>
      <Button size={size} className={classes.apply} onClick={onApply} loading={loading}>
        条件を緩めて作り直す
      </Button>
      <Anchor component={Link} href={`/tenants/${tenantId}/settings/restrictions`} size="sm">
        設定を表示
      </Anchor>
    </div>
  )
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={classes.notice}>
      {icon}
      <Text size="sm">{children}</Text>
    </div>
  )
}

function dayTone(date: string, holidays: Set<string>): string | undefined {
  const day = wday(date)
  if (day === 0 || holidays.has(date)) return classes.sun
  if (day === 6) return classes.sat
  return undefined
}

/** 表の CSS 変数（px）。測れないときはパネル幅での既定 */
function readPx(el: HTMLElement, name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(el).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

/**
 * 不足している枠の「パターン × 日」（§11.1）。
 * 行名の隣の数字はそのパターンの合計。1 日が読める幅を保ち、続く日は半分だけ見える。押しても何も起きない。
 */
function UnfilledSection({
  run,
  total,
  holidays,
  workdayPatterns,
  highlight,
}: {
  run: AssistRunView
  total: number
  holidays: Set<string>
  workdayPatterns: { id: string; name: string }[]
  highlight: Set<string> | null
}) {
  const dates = datesBetween(run.startDate, run.endDate)
  const rows = unfilledGrid(run.unfilled, workdayPatterns, dates)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [span, setSpan] = useState({ visibleDays: dates.length, visibleGaps: dates.length + 1 })
  const overflows = span.visibleDays < dates.length

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => {
      const next = gridSpan(
        el.clientWidth,
        dates.length,
        readPx(el, '--label-width', 56),
        readPx(el, '--grid-gap', 2),
        readPx(el, '--min-day', 22)
      )
      setSpan((prev) =>
        prev.visibleDays === next.visibleDays && prev.visibleGaps === next.visibleGaps ? prev : next
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [dates.length])

  return (
    <section className={classes.section} aria-label="不足している枠">
      <div className={classes.sectionHead}>
        <span className={`${classes.shortage} ${classes.short}`}>
          <span className={classes.num}>{total}</span> 枠不足しています
        </span>
      </div>
      <div
        ref={scrollerRef}
        className={classes.gridScroller}
        style={
          {
            '--visible-days': span.visibleDays,
            '--visible-gaps': span.visibleGaps,
          } as CSSProperties
        }
        tabIndex={0}
        aria-label={
          overflows ? '不足している枠の表（横にスクロールできます）' : '不足している枠の表'
        }
      >
        <table className={classes.grid}>
          <thead>
            <tr>
              <th className={classes.gridCorner} scope="col">
                <span className={classes.srOnly}>パターン</span>
              </th>
              {dates.map((date) => (
                <th key={date} scope="col" className={classes.gridDay}>
                  <span className={dayTone(date, holidays)}>
                    <span className={classes.gridWday}>{WEEKDAY_LABELS[wday(date)]}</span>
                    <span className={classes.gridDate}>{Number(date.slice(8, 10))}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.patternId}>
                <th scope="row" className={classes.gridLabel}>
                  <span className={classes.gridLabelRow}>
                    <span className={classes.gridName}>{row.name}</span>
                    <span className={`${classes.gridTotal} ${classes.num}`}>{row.total}</span>
                  </span>
                </th>
                {row.counts.map((count, index) => {
                  const hit = highlight?.has(`${dates[index]}|${row.patternId}`) ?? false
                  return (
                    <td
                      key={dates[index]}
                      className={classes.gridCell}
                      data-short={count > 0 || undefined}
                      data-hit={(hit && count > 0) || undefined}
                    >
                      {count > 0 ? count : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function InterpretationItem({ item }: { item: AssistInterpretation }) {
  const icon =
    item.status === 'kept' ? (
      <IconCheck size={14} stroke={2.4} className={classes.kept} aria-label="守れた" />
    ) : item.status === 'broken' ? (
      <IconX size={14} stroke={2.4} className={classes.broken} aria-label="守れなかった" />
    ) : item.status === 'removed' ? (
      <IconMinus size={14} className={classes.muted} aria-label="外した" />
    ) : (
      <IconMinus size={14} className={classes.muted} aria-label="条件にできなかった" />
    )
  const body =
    item.status === 'unsupported'
      ? `「${item.text}」は条件にできませんでした`
      : item.status === 'removed'
        ? `${item.label ?? item.text}（外しました）`
        : (item.label ?? item.text)
  return (
    <li>
      {icon}
      <span>
        {body}
        {item.detail && <span className={classes.detail}>{item.detail}</span>}
      </span>
    </li>
  )
}

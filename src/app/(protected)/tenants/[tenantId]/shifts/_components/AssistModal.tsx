'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconCheck,
  IconCircle,
  IconInfoCircle,
  IconRefresh,
  IconShieldLock,
  IconSparkles,
  IconUsersGroup,
} from '@tabler/icons-react'
import type { AssistRunView } from '@/lib/assist/result'
import { tightenRestrictionDays } from '@/lib/restrictions/describe'
import type { DateRange } from '@/lib/calendar/dateRange'
import { formatPeriodTitle } from '@/lib/calendar/periodTitle'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { ASSIST_INSTRUCTIONS_MAX_LENGTH } from '@/lib/validation/assist'
import { acknowledgeAssistRun, applyAssistLever, rollbackAssistRun, startAssist } from '../actions'
import {
  ASSIST_SLOW_MS,
  ASSIST_STAGES,
  currentStage,
  formatElapsed,
  type Shortage,
} from '../_lib/assist'
import { failure, outcome } from '../_lib/notices'
import classes from './AssistModal.module.css'
import { QuickRequiredNums } from './QuickRequiredNums'

type Phase =
  | { kind: 'ready'; retryOf: AssistRunView | null }
  | { kind: 'running'; startedAt: number; withInstructions: boolean; retry: boolean }
  | { kind: 'failed'; message: string; retried: boolean }

/**
 * 自動アサインの流れ（012 §4 / §11）。ShiftsClient が持ち、モーダルが閉じていても実行は続く。
 *
 * - 実行前・実行中・失敗はモーダル。**結果はモーダルではなく表の横のパネル**（スマホは下からのシート。§11.1）
 * - 実行は同期の Server Action。完了したらモーダルを閉じてパネルを開く。閉じていた場合は通知する（§4.3）
 * - 表示中の期間に未確認（閉じていない・元に戻していない）の結果があればパネルを開く（§4.5）。期間を移ったら差し替える
 * - パネルを閉じると acknowledge（表の点が消える。§3.8）
 */
export function useAssist({
  tenantId,
  start,
  defaultNotes,
  pending,
}: {
  tenantId: string
  /** 表示期間の開始日。サーバーが dateRange() で期間を組み直す */
  start: string
  defaultNotes: string
  /** ページを開いた時点で未確認の結果 */
  pending: AssistRunView | null
}) {
  const router = useRouter()
  const [opened, setOpened] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'ready', retryOf: null })
  /** パネルに出す結果。閉じる・元に戻すと null */
  const [result, setResult] = useState<AssistRunView | null>(pending)
  /** 選んでいる効く一手（結果の `levers` の添字）。表に点線が出る */
  const [selectedLever, setSelectedLever] = useState<number | null>(null)
  /** スマホのシートを開いているか（しまうと下端のバーに残る） */
  const [sheetOpened, setSheetOpened] = useState(true)
  // サーバーの「未確認の run」が変わったら結果を差し替える（§11.5 の見直し）。期間の移動は同じページのまま
  // 再描画されるので、初期値だけだと前の期間の結果が残り、移動先の未確認の結果も開かない。
  // 閉じる・元に戻す・実行・一手の実行はどれも refresh() で id が変わるので、ここでも同じ結果に揃う
  const pendingId = pending?.id ?? null
  const [syncedPendingId, setSyncedPendingId] = useState(pendingId)
  if (pendingId !== syncedPendingId) {
    setSyncedPendingId(pendingId)
    setResult(pending)
    setSelectedLever(null)
    setSheetOpened(true)
  }
  const [instructions, setInstructions] = useState(defaultNotes)
  const [saveNotes, setSaveNotes] = useState(false)
  // 完了時にモーダルが開いているかは、Action の await の後で読む（クロージャの値は古い）
  const openedRef = useRef(opened)
  useEffect(() => {
    openedRef.current = opened
  })
  const [, startRun] = useTransition()
  const [isRollingBack, startRollback] = useTransition()
  const [isApplying, startApply] = useTransition()

  const showResult = (run: AssistRunView) => {
    setResult(run)
    setSelectedLever(null)
    setSheetOpened(true)
  }

  const openNew = () => {
    if (phase.kind !== 'running') {
      setPhase({ kind: 'ready', retryOf: null })
      setInstructions(defaultNotes)
      setSaveNotes(false)
    }
    setOpened(true)
  }

  const run = () => {
    if (phase.kind !== 'ready') return
    const retryOf = phase.retryOf
    const text = instructions.trim()
    setPhase({
      kind: 'running',
      startedAt: Date.now(),
      withInstructions: text.length > 0,
      retry: retryOf !== null,
    })
    // 前の結果は置き換わる（「別の案」は前の案を戻してから解く）
    setResult(null)
    setSelectedLever(null)

    startRun(async () => {
      const response = await startAssist({
        tenantId,
        start,
        instructions: text,
        saveNotes,
        retryOfRunId: retryOf?.id ?? null,
      })
      if (response.ok) {
        const wasOpened = openedRef.current
        setOpened(false)
        setPhase({ kind: 'ready', retryOf: null })
        showResult(response.data.run)
        if (!wasOpened) notifications.show({ message: 'AI の作成が終わりました', color: 'green' })
        return
      }
      setPhase({ kind: 'failed', message: response.error, retried: retryOf !== null })
      if (!openedRef.current) {
        notifications.show(failure(response.error))
        setOpened(true)
      }
      // 「別の案」の失敗は前の案がすでに戻っている。画面を読み直す
      router.refresh()
    })
  }

  /** パネルを閉じる = 結果を確認した（点を消す） */
  const closeResult = () => {
    if (!result) return
    const runId = result.id
    setResult(null)
    setSelectedLever(null)
    startRun(async () => {
      const response = await acknowledgeAssistRun({ tenantId, runId })
      if (!response.ok) notifications.show(failure(response.error))
    })
  }

  /** 元に戻す。確認してから、その実行で入った下書きだけを消す */
  const rollback = (target: { id: string }) =>
    modals.openConfirmModal({
      title: 'AI の作成を元に戻す',
      children: (
        <Text size="sm">
          この実行で入った下書きを取り消します。確定に変えたシフトと、手で入れたシフトは残ります。
        </Text>
      ),
      labels: { confirm: '元に戻す', cancel: 'キャンセル' },
      onConfirm: () =>
        startRollback(async () => {
          const response = await rollbackAssistRun({ tenantId, runId: target.id })
          if (!response.ok) {
            notifications.show(failure(response.error))
            router.refresh()
            return
          }
          notifications.show(
            outcome(
              response.data.deleted,
              `${response.data.deleted} 件の下書きを取り消しました`,
              '取り消す下書きはありませんでした'
            )
          )
          // 元に戻した run はパネルにも出さない（acknowledge は不要。元に戻した run は再表示されない）
          if (result?.id === target.id) {
            setResult(null)
            setSelectedLever(null)
          }
        }),
    })

  /** 効く一手の実行（§11.3）。前の下書きは残したまま、空いた枠を埋め直す */
  const applyLever = (target: AssistRunView, leverIndex: number) => {
    const lever = target.levers[leverIndex]
    if (!lever) return
    const temporary = lever.kind === 'restriction'
    const change =
      temporary && lever.action === 'relax' && lever.relaxedTo !== null
        ? `${tightenRestrictionDays(lever.label)}を、今回だけ${lever.relaxedTo}日までに緩めて、空いている枠を埋め直します。`
        : temporary
          ? `${tightenRestrictionDays(lever.label)}を、今回だけ外して、空いている枠を埋め直します。`
          : `「${lever.label}」を外して、空いている枠を埋め直します。`
    modals.openConfirmModal({
      title: temporary ? 'シフトを再作成' : 'この指示を外して作り直す',
      children: (
        <Stack gap="xs">
          <Text size="sm">{change}</Text>
          <Text size="sm" c="dimmed">
            AIで作成した後に手動で内容を変更した場合は、点線通りにシフトが入らないことがあります。
          </Text>
        </Stack>
      ),
      labels: { confirm: '空いている枠を埋め直す', cancel: 'キャンセル' },
      onConfirm: () =>
        startApply(async () => {
          const response = await applyAssistLever({ tenantId, runId: target.id, leverIndex })
          if (!response.ok) {
            notifications.show(failure(response.error))
            router.refresh()
            return
          }
          const next = response.data.run
          const added = next.filled - target.filled
          showResult(next)
          notifications.show(
            temporary
              ? outcome(
                  added,
                  `今回だけ緩めて ${added} 枠を足しました`,
                  '今回だけ緩めましたが、足せる枠はありませんでした'
                )
              : outcome(
                  added,
                  `指示を外して ${added} 枠を足しました`,
                  '指示を外しましたが、足せる枠はありませんでした'
                )
          )
        }),
    })
  }

  return {
    opened,
    phase,
    running: phase.kind === 'running',
    instructions,
    setInstructions,
    saveNotes,
    setSaveNotes,
    isRollingBack,
    isApplying,
    openNew,
    run,
    /** モーダルを閉じる（実行中なら実行は続く） */
    close: () => setOpened(false),
    rollback,
    result,
    closeResult,
    selectedLever,
    /** 一手を選ぶ / もう一度押して外す */
    selectLever: (index: number) =>
      setSelectedLever((current) => (current === index ? null : index)),
    /** 一手を選ぶ（スマホ: 選んだらシートをしまうので、押し直しで外さない） */
    showLever: (index: number) => setSelectedLever(index),
    sheetOpened,
    setSheetOpened,
    applyLever,
    /** 結果から: 前の案を捨てて、指示を追記して作り直す（§3.10） */
    retry: (previous: AssistRunView) => {
      setPhase({ kind: 'ready', retryOf: previous })
      setInstructions(previous.instructions)
      setSaveNotes(false)
      setOpened(true)
    },
    /** 失敗から: 同じ指示でもう一度 */
    again: () => setPhase({ kind: 'ready', retryOf: null }),
  }
}

export type AssistController = ReturnType<typeof useAssist>

type Props = {
  assist: AssistController
  tenantId: string
  cycle: ShiftCycle
  range: DateRange
  shortage: Shortage
  hasRequiredNums: boolean
  staffCount: number
  workdayPatternCount: number
  restrictionCount: number
  onSetDefaultRequiredNums: () => void
  /** 必要人数もデフォルトも無いとき、その場で聞く勤務（014 §3.8）。聞かないときは null */
  quickRequiredNumPatterns: { id: string; name: string }[] | null
  onApplyRequiredNums: (nums: Record<string, number | ''>) => void
  applyingRequiredNums: boolean
}

export function AssistModal(props: Props) {
  const { assist, cycle, range } = props
  const { phase } = assist

  return (
    <Modal
      opened={assist.opened}
      onClose={assist.close}
      size="lg"
      title={
        <Group gap={10} wrap="nowrap">
          <IconSparkles size={18} aria-hidden />
          <Text fw={650} size="md">
            AI でシフトを作成
          </Text>
          <span className={classes.titlePeriod}>{formatPeriodTitle(cycle, range)}</span>
        </Group>
      }
    >
      {phase.kind === 'ready' && <ReadyView {...props} retryOf={phase.retryOf} />}
      {phase.kind === 'running' && <RunningView phase={phase} onClose={assist.close} />}
      {phase.kind === 'failed' && (
        <Stack gap="md">
          <Alert
            color="red"
            variant="light"
            icon={<IconAlertTriangle size={16} />}
            title={phase.message}
          >
            {phase.retried
              ? '前の案はすでに元に戻しています。もう一度作成できます。'
              : 'シフト表は変わっていません。'}
          </Alert>
          <Group justify="flex-end" gap={8}>
            <Button variant="default" onClick={assist.close}>
              閉じる
            </Button>
            <Button onClick={assist.again} leftSection={<IconRefresh size={16} />}>
              もう一度
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

function ReadyView({
  assist,
  tenantId,
  shortage,
  hasRequiredNums,
  staffCount,
  workdayPatternCount,
  restrictionCount,
  onSetDefaultRequiredNums,
  quickRequiredNumPatterns,
  onApplyRequiredNums,
  applyingRequiredNums,
  retryOf,
}: Props & { retryOf: AssistRunView | null }) {
  // 「別の案」は前の案を戻してから解くので、いまの表（前の案で埋まっている）の不足では止めない。
  // 表示も前の案の実行時の不足枠にする
  const total = retryOf ? retryOf.requested : shortage.total
  // 押せない理由は必ず言葉で出す（灰色のボタンだけにしない）
  const blockedReason =
    workdayPatternCount === 0
      ? '勤務日のパターンがありません'
      : staffCount === 0
        ? '在籍スタッフがいません'
        : total === 0 && hasRequiredNums
          ? '必要人数はすべて満たされています'
          : null
  const blocked = total === 0 || staffCount === 0 || workdayPatternCount === 0
  const length = assist.instructions.length

  const fact = (label: string, value: ReactNode) => (
    <>
      <dt className={classes.factLabel}>{label}</dt>
      <dd className={classes.factValue}>{value}</dd>
    </>
  )

  return (
    <Stack gap="md">
      {retryOf && (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />} p="xs">
          <Text size="sm">
            前の案（{retryOf.filled}{' '}
            枠）を元に戻してから、別の割り当てを作ります。指示を追記できます。
          </Text>
        </Alert>
      )}

      {!hasRequiredNums && quickRequiredNumPatterns && (
        <QuickRequiredNums
          patterns={quickRequiredNumPatterns}
          onApply={onApplyRequiredNums}
          loading={applyingRequiredNums}
        />
      )}

      {!hasRequiredNums && !quickRequiredNumPatterns && (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />} p="xs">
          <Group justify="space-between" gap="xs">
            <Text size="sm">必要人数が設定されていません</Text>
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<IconUsersGroup size={16} />}
              onClick={onSetDefaultRequiredNums}
            >
              デフォルト人数をセット
            </Button>
          </Group>
        </Alert>
      )}

      <dl className={classes.facts}>
        {fact(
          '不足',
          <>
            <span className={`${classes.total} ${classes.num}`}>{total} 枠</span>
            {retryOf ? (
              <span className={classes.muted}>前の案を戻したあと</span>
            ) : (
              shortage.byPattern.length > 0 && (
                <span className={`${classes.muted} ${classes.num}`}>
                  {shortage.byPattern.map((item) => `${item.name} ${item.count}`).join(' · ')}
                </span>
              )
            )}
          </>
        )}
        {fact(
          '対象',
          <>
            在籍スタッフ {staffCount} 人 · 自動アサイン制約 {restrictionCount} 件{' '}
            <Anchor component={Link} href={`/tenants/${tenantId}/settings/restrictions`} size="sm">
              設定
            </Anchor>
          </>
        )}
        {fact('規則', '入っているマスは残る · 下書きで入る · 必要人数は超えない')}
      </dl>

      <Stack gap={6}>
        <Textarea
          label="AI への指示（任意）"
          placeholder="例: 田中さんは土日に多めに。新人の佐藤さんは必ず山田さんと同じ日に入れる"
          value={assist.instructions}
          onChange={(event) => assist.setInstructions(event.currentTarget.value)}
          autosize
          minRows={3}
          maxRows={8}
          maxLength={ASSIST_INSTRUCTIONS_MAX_LENGTH}
          description={
            <span className={classes.num}>
              {length}/{ASSIST_INSTRUCTIONS_MAX_LENGTH}
            </span>
          }
          inputWrapperOrder={['label', 'input', 'description', 'error']}
        />
        <Checkbox
          size="xs"
          label="この指示を店舗の既定として保存する"
          checked={assist.saveNotes}
          onChange={(event) => assist.setSaveNotes(event.currentTarget.checked)}
        />
      </Stack>

      <div className={classes.privacy}>
        <IconShieldLock size={14} aria-hidden />
        <span>
          スタッフ名・勤務条件・この期間のシフトを AI（OpenAI）に送ります（学習には使われません）
        </span>
      </div>

      <Group justify="flex-end" gap={8}>
        {blockedReason && (
          <Text size="xs" c="dimmed" mr="auto">
            {blockedReason}
          </Text>
        )}
        <Button variant="default" onClick={assist.close}>
          キャンセル
        </Button>
        <Button onClick={assist.run} disabled={blocked} leftSection={<IconSparkles size={16} />}>
          作成する
        </Button>
      </Group>
    </Stack>
  )
}

/** 経過時間で進める見込み表示（§4.3）。1 秒ごとに描き直す */
function RunningView({
  phase,
  onClose,
}: {
  phase: Extract<Phase, { kind: 'running' }>
  onClose: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const elapsed = now - phase.startedAt
  const current = currentStage(elapsed, phase.withInstructions)

  return (
    <Stack gap="md">
      <ol className={classes.stages} aria-live="polite">
        {ASSIST_STAGES.map((stage, index) => {
          const skipped = stage.key === 'interpret' && !phase.withInstructions
          const state =
            skipped || index < current ? 'done' : index === current ? 'current' : 'pending'
          return (
            <li key={stage.key} className={classes.stage} data-state={state}>
              <span className={classes.stageIcon} aria-hidden>
                {state === 'done' ? (
                  <IconCheck size={16} stroke={2.4} />
                ) : state === 'current' ? (
                  <Loader size={14} color="dark" />
                ) : (
                  <IconCircle size={12} />
                )}
              </span>
              <span>
                {stage.label}
                {skipped ? '（指示なし）' : state === 'current' ? '中…' : ''}
              </span>
              {state === 'current' && <span className={classes.num}>{formatElapsed(elapsed)}</span>}
            </li>
          )
        })}
      </ol>

      {elapsed > ASSIST_SLOW_MS && (
        <Text size="sm" c="dimmed">
          時間がかかっています…
        </Text>
      )}

      <Group justify="space-between" gap={8}>
        <Text size="xs" c="dimmed">
          閉じても実行は続きます。終わったらお知らせします。
        </Text>
        <Button variant="default" onClick={onClose}>
          閉じる（実行は続きます）
        </Button>
      </Group>
    </Stack>
  )
}

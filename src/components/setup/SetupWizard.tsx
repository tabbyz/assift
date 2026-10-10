'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { type StaffAdditionRetry, openStaffAdditionModal } from '@/components/billing/staffAddition'
import { IconCheck } from '@tabler/icons-react'
import type { ActionResult } from '@/lib/actions/result'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import type { TenantListItem } from '@/lib/queries/tenants'
import { parseStaffNames } from '@/lib/setup/parseStaffNames'
import { shiftsHref } from '@/lib/tenants/navigation'
import {
  fromSavedPatterns,
  type SavedPattern,
  type SetupPatternsInput,
  selectedPatterns,
} from '@/lib/setup/patternsState'
import type { Industry, SetupPatternsState } from '@/lib/setup/templates'
import { asksStartOfWeek } from '@/lib/validation/setup'
import { PatternsStep } from './PatternsStep'
import { DeleteStoreLink, SetupDone, SetupPaused } from './SetupDone'
import { SetupHeader } from './SetupHeader'
import { type PreviewPattern, SetupMiniPreview, SetupPreview } from './SetupPreview'
import { StaffStep } from './StaffStep'
import { type StoreValues, StoreStep } from './StoreStep'
import classes from './Setup.module.css'

type StoreInput = { name: string; shiftCycle: ShiftCycle; startOfWeek: number | null }
type SetupResult = ActionResult<{ redirectTo: string | null }>

type Common = { tenants: TenantListItem[]; email: string; today: string }

type Props = Common &
  (
    | {
        /** `/tenants/new`: ステップ 1 だけ。店舗を作ったら `/setup` へ移る */
        mode: 'new'
        canCancel: boolean
        createTenant: (
          input: StoreInput
        ) => Promise<ActionResult<{ tenantId: string; redirectTo: string }>>
      }
    | {
        /** `/tenants/<id>/setup`: ステップ 2・3（「もどる」でステップ 1 も） */
        mode: 'resume'
        tenant: { id: string; name: string; shiftCycle: ShiftCycle; startOfWeek: number }
        initialStep: 2 | 3
        savedPatterns: SavedPattern[]
        updateSetupTenant: (input: StoreInput & { tenantId: string }) => Promise<SetupResult>
        saveSetupPatterns: (
          input: SetupPatternsInput & { tenantId: string }
        ) => Promise<SetupResult>
        completeSetup: (
          input: { tenantId: string; names: string[] },
          options?: { acknowledgedPeak?: number }
        ) => Promise<ActionResult<{ redirectTo: string }>>
        deleteTenant: (input: { tenantId: string }) => Promise<ActionResult<{ redirectTo: string }>>
      }
  )

type View = 'store' | 'patterns' | 'staff' | 'done' | 'paused'

const STEP_OF: Partial<Record<View, 1 | 2 | 3>> = { store: 1, patterns: 2, staff: 3 }

/**
 * 同じタブで進めてきたかの印（014 §4.5）。無ければ「おかえりなさい」を出す。
 * 着地するステップはデータから決めるので、読めない環境では案内を出さないだけ
 */
const progressKey = (tenantId: string) => `assift-setup-progress:${tenantId}`

function markProgress(tenantId: string) {
  try {
    window.sessionStorage.setItem(progressKey(tenantId), '1')
  } catch {
    // プライベートウィンドウなど。案内が出ないだけ
  }
}

function hasProgress(tenantId: string): boolean {
  try {
    return window.sessionStorage.getItem(progressKey(tenantId)) !== null
  } catch {
    return true
  }
}

/**
 * 開いた時点で「再開」だったか（同じタブで進めてきた印が無かったか）。ページを読み込んでいるあいだは 1 回読んだ値を保つ:
 * 読んだ直後に印を付けるので、読み直すと「再開ではない」に変わってしまう。
 * アンマウントで捨てない（開発時の StrictMode はマウントをやり直すので、捨てると 2 回目の読みで消える）
 */
const resumedOnLoad = new Map<string, boolean>()

function readResumed(tenantId: string): boolean {
  if (!resumedOnLoad.has(tenantId)) {
    resumedOnLoad.set(tenantId, !hasProgress(tenantId))
    markProgress(tenantId)
  }
  return resumedOnLoad.get(tenantId)!
}

const subscribeNothing = () => () => {}

/**
 * シフト表へは全体の読み込みで移る。店舗の枠（`[tenantId]/layout.tsx`）は準備中のあいだ描かれておらず、
 * クライアント遷移だと共通の layout が使い回されて、完成後もヘッダーの無い表になる（014 実装ログ）
 */
function openShifts(path: string) {
  window.location.assign(path)
}

const savedSnapshot = (state: SetupPatternsState | null) =>
  state ? JSON.stringify(selectedPatterns(state)) : null

/** 初期設定のウィザード（014 §4）。ヘッダー・ステップ・主ボタン・完成イメージを持つ */
/** 「次へ」を押したときに足りないもの。`field` は入力欄の id（`setup-field-<field>`）に対応する */
export type SetupIssue = {
  field: 'name' | 'startOfWeek' | 'industry' | 'workday' | 'names'
  message: string
}

/** 足りない入力欄へスクロールし、見えている最初の入力か選択肢にフォーカスを移す */
function focusIssue(field: SetupIssue['field']) {
  const el = document.getElementById(`setup-field-${field}`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const target = el.matches('input, textarea')
    ? el
    : Array.from(el.querySelectorAll<HTMLElement>('input, textarea, button')).find(
        (node) => node.offsetParent !== null
      )
  target?.focus({ preventScroll: true })
}

export function SetupWizard(props: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const tenantId = props.mode === 'resume' ? props.tenant.id : null

  const initialPatterns =
    props.mode === 'resume' && props.savedPatterns.length > 0
      ? fromSavedPatterns(props.savedPatterns)
      : null
  const [view, setView] = useState<View>(
    props.mode === 'resume' ? (props.initialStep === 2 ? 'patterns' : 'staff') : 'store'
  )
  const [store, setStore] = useState<StoreValues>(() =>
    props.mode === 'resume'
      ? {
          name: props.tenant.name,
          shiftCycle: props.tenant.shiftCycle,
          startOfWeek: asksStartOfWeek(props.tenant.shiftCycle) ? props.tenant.startOfWeek : null,
        }
      : { name: '', shiftCycle: 'month', startOfWeek: null }
  )
  const [patterns, setPatterns] = useState<SetupPatternsState | null>(initialPatterns)
  const [industry, setIndustry] = useState<Industry | null>(null)
  // 最後に保存した勤務（「あとで続ける」で保存が要るか・「次へ」で保存し直すかを決める）
  const [saved, setSaved] = useState<string | null>(() => savedSnapshot(initialPatterns))
  const [namesText, setNamesText] = useState('')
  // 再開の案内。サーバーでは出さず（false）、ハイドレーションのあとに sessionStorage を読む
  const resumedOnOpen = useSyncExternalStore(
    subscribeNothing,
    () => (tenantId ? readResumed(tenantId) : false),
    () => false
  )
  const [resumeDismissed, setResumeDismissed] = useState(false)
  const resumed = resumedOnOpen && !resumeDismissed

  const parsedNames = useMemo(() => parseStaffNames(namesText), [namesText])
  const selected = patterns ? selectedPatterns(patterns) : null
  const dirty = patterns !== null && JSON.stringify(selected) !== saved

  // ステップが変わったら見出しにフォーカスを移す（スクリーンリーダーが新しい問いを読む。014 §4.9）
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
    window.scrollTo({ top: 0 })
  }, [view])

  // iOS Safari は、キーボードを閉じたあと画面の下に固定した要素（主ボタン）の押せる位置が、
  // 一度スクロールするまで見た目とずれたままになる（押しても反応しない）。
  // キーボードが閉じて表示領域が広がったら 1px 動かして戻し、位置を合わせ直させる
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let lastHeight = viewport.height
    const onResize = () => {
      if (viewport.height > lastHeight + 100) {
        const y = window.scrollY
        window.scrollTo(window.scrollX, y > 0 ? y - 1 : y + 1)
        window.scrollTo(window.scrollX, y)
      }
      lastHeight = viewport.height
    }
    viewport.addEventListener('resize', onResize)
    return () => viewport.removeEventListener('resize', onResize)
  }, [])

  const go = (next: View) => {
    setResumeDismissed(true)
    setShowIssue(false)
    setView(next)
  }

  const fail = (message: string): void => {
    notifications.show({ message, color: 'red' })
  }

  // ---------------------------------------------------------------------------
  // 足りないもの（014 §4.8）。「次へ」は押せるままにし、押したときに入力欄の場所で知らせる。
  // 最初から注意を出さない（何も入れていない画面で叱られているように見える）
  // ---------------------------------------------------------------------------
  const issue = ((): SetupIssue | null => {
    if (view === 'store') {
      if (store.name.trim() === '') return { field: 'name', message: 'お店の名前を入れてください' }
      if (asksStartOfWeek(store.shiftCycle) && store.startOfWeek === null)
        return { field: 'startOfWeek', message: '何曜日から始まるか選んでください' }
    }
    if (view === 'patterns') {
      if (!selected) return { field: 'industry', message: '業種を選んでください' }
      if (!selected.patterns.some((row) => row.kind === 'workday'))
        return { field: 'workday', message: '働く日の勤務を 1 つ以上残してください' }
    }
    if (view === 'staff') {
      if (parsedNames.names.length === 0)
        return { field: 'names', message: '名前を 1 人以上入れてください' }
      if (parsedNames.errors.length > 0)
        return { field: 'names', message: '10文字を超える名前を直してください' }
      if (parsedNames.tooMany) return { field: 'names', message: '100人ずつ入れてください' }
    }
    return null
  })()
  // 「次へ」を押したあとだけ出す。ステップを移ったら消す
  const [showIssue, setShowIssue] = useState(false)
  const shownIssue = showIssue ? issue : null
  const issueFor = (field: SetupIssue['field']) =>
    shownIssue?.field === field ? shownIssue.message : null

  // ---------------------------------------------------------------------------
  // 書き込み
  // ---------------------------------------------------------------------------
  const savePatterns = async (): Promise<boolean> => {
    if (props.mode !== 'resume' || !selected) return false
    const result = await props.saveSetupPatterns({ tenantId: props.tenant.id, ...selected })
    if (!result.ok) {
      fail(result.error)
      return false
    }
    if (result.data.redirectTo) {
      openShifts(result.data.redirectTo)
      return false
    }
    setSaved(JSON.stringify(selected))
    return true
  }

  const next = () => {
    if (issue) {
      setShowIssue(true)
      focusIssue(issue.field)
      return
    }
    startTransition(async () => {
      if (view === 'store') {
        if (props.mode === 'new') {
          const result = await props.createTenant(store)
          if (!result.ok) return fail(result.error)
          markProgress(result.data.tenantId)
          // push だと「戻る」でこのフォームに戻り、もう一度押すと店舗が二重にできる（014 §4.1）
          router.replace(result.data.redirectTo)
          return
        }
        const result = await props.updateSetupTenant({ tenantId: props.tenant.id, ...store })
        if (!result.ok) return fail(result.error)
        if (result.data.redirectTo) return openShifts(result.data.redirectTo)
        go('patterns')
        return
      }
      if (view === 'patterns') {
        // 保存済みから何も変えていなければ書き直さない
        if (dirty && !(await savePatterns())) return
        go('staff')
        return
      }
      if (view === 'staff') await complete({})
    })
  }

  // ステップ 3 の完了。上限・料金のモーダルで決めたあとのやり直しもここ（確認した人数を渡す）
  const complete = async (options: { acknowledgedPeak?: number }) => {
    if (props.mode !== 'resume') return
    const result = await props.completeSetup(
      { tenantId: props.tenant.id, names: parsedNames.names },
      options
    )
    if (!result.ok) {
      // 在籍の上限（全店舗の合計）・料金が上がる追加（019 §5.3・§13）。まとめて貼った人数をモーダルに見せる
      if (
        openStaffAdditionModal(result, { adding: parsedNames.names.length, retry: retryComplete })
      )
        return
      return fail(result.error)
    }
    go('done')
  }
  const retryComplete: StaffAdditionRetry = (options) => startTransition(() => complete(options))

  const back = () => {
    if (view === 'patterns') go('store')
    if (view === 'staff') go('patterns')
  }

  // 「あとで続ける」（014 §4.5）。ステップ 2 は保存していない変更を保存してから、ステップ 3 は入力を捨ててよいか確かめてから
  const leave = () => {
    const pause = () => go('paused')
    const confirmDiscard = (message: string) =>
      modals.openConfirmModal({
        title: 'あとで続ける',
        children: <Text size="sm">{message}</Text>,
        labels: { confirm: '終わる', cancel: '入力にもどる' },
        onConfirm: pause,
      })

    if (view === 'patterns' && dirty) {
      if (issue) return confirmDiscard('いまの変更は保存されません。終わりますか？')
      startTransition(async () => {
        if (await savePatterns()) pause()
      })
      return
    }
    if (view === 'staff' && namesText.trim() !== '')
      return confirmDiscard('入力した名前は保存されません。終わりますか？')
    pause()
  }

  const confirmDelete = () => {
    if (props.mode !== 'resume') return
    modals.openConfirmModal({
      title: 'この店舗を削除',
      children: (
        <Text size="sm">
          「{props.tenant.name}」を削除します。入力した内容も消えます。よろしいですか？
        </Text>
      ),
      labels: { confirm: '削除する', cancel: 'やめる' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        startTransition(async () => {
          const result = await props.deleteTenant({ tenantId: props.tenant.id })
          if (!result.ok) return fail(result.error)
          notifications.show({ message: '店舗を削除しました', color: 'green' })
          router.push(result.data.redirectTo)
        }),
    })
  }

  // ---------------------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------------------
  const step = STEP_OF[view] ?? null
  const previewPatterns: PreviewPattern[] = selected?.patterns ?? []
  const previewNames = view === 'staff' || view === 'done' ? parsedNames.names : []
  const nextLabel = view === 'staff' ? 'これで完成' : '次へ'
  const otherTenants = props.tenants.filter((tenant) => tenant.id !== tenantId)

  return (
    <div className={classes.page}>
      <SetupHeader
        step={step}
        tenant={
          props.mode === 'resume'
            ? { id: props.tenant.id, name: store.name || props.tenant.name }
            : null
        }
        tenants={props.tenants}
        email={props.email}
        onLeave={
          props.mode === 'resume' && (view === 'patterns' || view === 'staff') ? leave : undefined
        }
        leaveDisabled={isPending}
      />

      <div className={classes.body}>
        <div className={classes.form}>
          <div className={classes.content}>
            <Stack gap="lg" maw={560} mx="auto">
              {resumed && step && (
                <Alert
                  color="green"
                  variant="light"
                  icon={<IconCheck size={18} />}
                  withCloseButton
                  onClose={() => setResumeDismissed(true)}
                >
                  <b>おかえりなさい。</b>前回の続きから始めます。
                </Alert>
              )}

              {view === 'store' && (
                <StoreStep
                  values={store}
                  onChange={setStore}
                  errors={{ name: issueFor('name'), startOfWeek: issueFor('startOfWeek') }}
                  headingRef={headingRef}
                />
              )}
              {view === 'store' && props.mode === 'resume' && (
                <DeleteStoreLink onDelete={confirmDelete} deleting={isPending} />
              )}

              {view === 'patterns' && (
                <>
                  <PatternsStep
                    state={patterns}
                    onChange={setPatterns}
                    industry={industry}
                    onIndustryChange={setIndustry}
                    fromSaved={saved !== null}
                    error={issueFor('industry') ?? issueFor('workday')}
                    headingRef={headingRef}
                  />
                  {patterns && (
                    <Box hiddenFrom="md">
                      <SetupMiniPreview
                        title="シフト表ではこう見えます"
                        cycle={store.shiftCycle}
                        startOfWeek={store.startOfWeek}
                        today={props.today}
                        patterns={previewPatterns}
                        staffNames={[]}
                      />
                    </Box>
                  )}
                </>
              )}

              {view === 'staff' && (
                <>
                  <StaffStep
                    text={namesText}
                    onChange={setNamesText}
                    parsed={parsedNames}
                    error={issueFor('names')}
                    headingRef={headingRef}
                  />
                  {parsedNames.names.length > 0 && (
                    <Box hiddenFrom="md">
                      <SetupMiniPreview
                        title="シフト表ではこう並びます"
                        cycle={store.shiftCycle}
                        startOfWeek={store.startOfWeek}
                        today={props.today}
                        patterns={previewPatterns}
                        staffNames={parsedNames.names}
                      />
                    </Box>
                  )}
                </>
              )}

              {view === 'done' && props.mode === 'resume' && (
                <SetupDone
                  storeName={store.name}
                  patternCount={previewPatterns.length}
                  staffCount={parsedNames.names.length}
                  onOpen={() => openShifts(shiftsHref(props.tenant.id))}
                  headingRef={headingRef}
                />
              )}

              {view === 'paused' && (
                <SetupPaused
                  savedThrough={saved !== null ? 2 : 1}
                  storeName={store.name}
                  patternCount={selected?.patterns.length ?? 0}
                  otherTenants={otherTenants}
                  onContinue={() => go(saved !== null ? 'staff' : 'patterns')}
                  onDelete={confirmDelete}
                  deleting={isPending}
                  headingRef={headingRef}
                />
              )}
            </Stack>
          </div>

          {step && (
            <div className={classes.footer}>
              <Stack gap={6} maw={560} mx="auto">
                <Group gap="sm" wrap="nowrap">
                  {(view === 'patterns' || view === 'staff') && (
                    <Button variant="default" size="md" onClick={back} disabled={isPending}>
                      もどる
                    </Button>
                  )}
                  {view === 'store' && props.mode === 'new' && props.canCancel && (
                    <Button
                      variant="subtle"
                      color="gray"
                      size="md"
                      onClick={() => router.push('/tenants')}
                      disabled={isPending}
                    >
                      キャンセル
                    </Button>
                  )}
                  <Button size="md" flex={1} onClick={next} loading={isPending}>
                    {nextLabel}
                  </Button>
                </Group>
                {/* どのステップでも見える場所に置く。「あとで直せる」と分かれば、迷っても先へ進める */}
                <Text size="xs" c="dimmed" ta="center">
                  入力した内容は、あとからいつでも変更できます
                </Text>
              </Stack>
            </div>
          )}
        </div>

        <Box visibleFrom="md" className={classes.preview}>
          <SetupPreview
            storeName={store.name}
            cycle={store.shiftCycle}
            startOfWeek={store.startOfWeek}
            today={props.today}
            patterns={previewPatterns}
            staffNames={previewNames}
            activeStep={view === 'done' ? null : step}
          />
        </Box>
      </div>
    </div>
  )
}

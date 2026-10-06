'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  CopyButton,
  Group,
  Menu,
  MenuDivider,
  MenuDropdown,
  MenuItem,
  MenuTarget,
  Modal,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconEye,
  IconLink,
  IconLinkOff,
  IconPencil,
  IconPlus,
} from '@tabler/icons-react'
import { formatMonthDay } from '@/lib/calendar/dateString'
import { formatJstMonthDayTime, formatJstYear } from '@/lib/calendar/datetime'
import type { DateRange } from '@/lib/calendar/dateRange'
import { formatPeriodTitle } from '@/lib/calendar/periodTitle'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import {
  isShareEnabled,
  SHARE_GRACE_DAYS,
  SHARE_ENDING_SOON_DAYS,
  shareDaysLeft,
  shareLastDay,
} from '@/lib/shares/expiry'
import { SHARE_EXPIRED_MESSAGE } from '@/lib/validation/shares'
import { createShare, deleteShare } from '../actions'
import { failure } from '../_lib/notices'
import { splitCurrentShare } from '../_lib/shareSections'
import { sharePeriodLabel, splitShareUrl, splitYearPrefix } from '../_lib/shareLabels'
import classes from './ShareModal.module.css'

/** 一覧の 1 行。URL は Server（`page.tsx`）が `requestOrigin()` で組んだ絶対 URL */
export type ShareItem = {
  id: string
  url: string
  startDate: string
  endDate: string
  createdAt: string
}

type Props = {
  tenantId: string
  cycle: ShiftCycle
  range: DateRange
  /** JST の今日（Server から渡す。端末の TZ で判定しない。009 §3.2） */
  today: string
  shares: { enabled: ShareItem[]; expired: ShareItem[] }
  onClose: () => void
}

/** 確認ダイアログなど、単独で読まれる場所の期間。年を必ず付ける */
function term(share: ShareItem): string {
  return sharePeriodLabel({ start: share.startDate, end: share.endDate })
}

/** `11/6` のように公開される最後の日 */
function lastDayLabel(endDate: string): string {
  return formatMonthDay(shareLastDay(endDate))
}

function daysLeftLabel(days: number): string {
  return days === 0 ? '今日まで' : `あと${days}日`
}

/** `2026年10月のシフト表を共有`。年だけ薄くして、月（周期の言葉）を立てる */
function ShareTitle({ cycle, range }: { cycle: ShiftCycle; range: DateRange }) {
  const { year, rest } = splitYearPrefix(formatPeriodTitle(cycle, range))
  return (
    <>
      {year && <span className={classes.titleYear}>{year}</span>}
      {rest}のシフト表を共有
    </>
  )
}

/**
 * 発行前に読ませる注意（011 §7）。押したあとは URL の下の 1 行に縮めるので、
 * ここは「押す前に知っておくこと」だけを 3 行で書く。見出し語だけ太くする。
 */
function BeforeIssueFacts() {
  const facts: { icon: typeof IconEye; body: ReactNode }[] = [
    {
      icon: IconEye,
      body: (
        <>
          URLを知っている人は<b>誰でも</b>見られます。ログインは不要です
        </>
      ),
    },
    {
      icon: IconPencil,
      body: (
        <>
          <b>下書き</b>も表示され、共有後の変更もそのまま反映されます
        </>
      ),
    },
    {
      icon: IconClock,
      body: (
        <>
          表示期間が終わってから<b className={classes.num}>{SHARE_GRACE_DAYS + 1}日後</b>に無効になります
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

/**
 * 一覧の行のコピー。主役の URL 欄（文字付きの塗り）とは別で、`…` と同じ subtle のアイコンにする。
 * 結果はツールチップだけに頼らない（スマホでは出ない）。押すと 2 秒だけ緑のチェックに変わる
 */
function CopyIconButton({ url }: { url: string }) {
  return (
    <CopyButton value={url} timeout={2000}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'コピーしました' : 'URLをコピー'} withArrow position="top">
          <ActionIcon
            variant="subtle"
            color={copied ? 'green' : 'gray'}
            aria-label={copied ? 'コピーしました' : 'URLをコピー'}
            onClick={copy}
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  )
}

/**
 * 発行時刻。期間と同じ年なら月日だけにする（`9/16 9:41`）。
 * 年が違うときだけ `2025/12/28 9:41` と足す。
 */
function issuedAt(createdAt: string, startDate: string): string {
  const label = formatJstMonthDayTime(createdAt)
  const year = formatJstYear(createdAt)
  return year === startDate.slice(0, 4) ? label : `${year}/${label}`
}

/** 発行日時と公開期限を 1 行にする。終わりが近いときだけ期限を橙にする */
function OtherShareMeta({ share, today }: { share: ShareItem; today: string }) {
  const days = shareDaysLeft(share.endDate, today)
  const until = `${lastDayLabel(share.endDate)} まで`
  return (
    <span className={`${classes.meta} ${classes.num}`}>
      {issuedAt(share.createdAt, share.startDate)} に発行 ·{' '}
      {days <= SHARE_ENDING_SOON_DAYS ? (
        <span className={classes.soon}>{`${until} · ${daysLeftLabel(days)}`}</span>
      ) : (
        until
      )}
    </span>
  )
}

type ActionsProps = {
  share: ShareItem
  loading: boolean
  disabled: boolean
  onStop: () => void
  /** 「この期間の URL」だけ。同じ期間の 2 本目は禁止しないが、主導線からは外す（011 §6.2） */
  onCreateAnother?: () => void
  /** 「この期間の URL」は外に「開く」を出しているので、メニューには入れない */
  withOpen?: boolean
}

function ShareActions({
  share,
  loading,
  disabled,
  onStop,
  onCreateAnother,
  withOpen,
}: ActionsProps) {
  return (
    <Menu position="bottom-end" withinPortal>
      <MenuTarget>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="URLの操作"
          loading={loading}
          disabled={disabled}
        >
          <IconDots size={16} />
        </ActionIcon>
      </MenuTarget>
      <MenuDropdown>
        {withOpen && (
          <MenuItem
            component="a"
            href={share.url}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconExternalLink size={14} />}
          >
            URLを開く
          </MenuItem>
        )}
        {onCreateAnother && (
          <MenuItem leftSection={<IconPlus size={14} />} onClick={onCreateAnother}>
            別のURLを発行
          </MenuItem>
        )}
        <MenuDivider />
        <MenuItem color="red" leftSection={<IconLinkOff size={14} />} onClick={onStop}>
          共有停止
        </MenuItem>
      </MenuDropdown>
    </Menu>
  )
}

/**
 * URL 共有（v1 `shares/_index.html.slim`）。発行・一覧・停止をこのモーダルで完結させる。
 *
 * 主役は表示中の期間の URL（011 §7 案 A-3）。期間はタイトルに出し、本文の最上部は
 * 「発行前: 注意 3 行 → 幅いっぱいの発行ボタン」「発行後: URL + コピー → 公開状態 → 注意 1 行」。
 * 注意は押す前に読ませ、押したあとは縮める。塗りボタンは常に 1 つ（発行かコピー）。
 * ほかの期間の共有中は線で区切った行、期限切れは末尾の折りたたみ。
 *
 * 一覧は Server が読んで props で渡す（009 §3.1）。発行・停止は `refresh()` なので、
 * モーダルを開いたまま props が入れ替わって一覧が更新される。
 */
export function ShareModal({ tenantId, cycle, range, today, shares, onClose }: Props) {
  const router = useRouter()
  const [isCreating, startCreate] = useTransition()
  const [isDeleting, startDelete] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expiredOpened, { toggle: toggleExpired }] = useDisclosure(false)

  const expired = !isShareEnabled(range.end, today)
  const { current, others } = splitCurrentShare(shares.enabled, range)
  const baseYear = range.start.slice(0, 4)
  const listTerm = (share: ShareItem) =>
    sharePeriodLabel({ start: share.startDate, end: share.endDate }, baseYear)

  // 発行直後の自動コピーはしない。`await` を挟むと Safari はクリップボードへの書き込みを拒むので、
  // コピー欄を発行ボタンと同じ場所に出すことで代わりにする（011 §6.3）
  const create = () =>
    startCreate(async () => {
      const result = await createShare({ tenantId, start: range.start, end: range.end })
      if (!result.ok) {
        notifications.show(failure(result.error))
        // 失敗の主因はこの画面が古いこと（別タブでの削除、日付が変わって期限切れになった）。
        // 読み直せば一覧と発行ボタンの可否が現在の状態に戻る（007 / 008 と同じ作法）
        router.refresh()
        return
      }
      notifications.show({ message: '共有用URLを発行しました', color: 'green' })
    })

  const stop = (share: ShareItem) =>
    modals.openConfirmModal({
      title: '共有停止',
      children: (
        <Text size="sm">{term(share)}の共有を停止します。送ったURLは開けなくなります。</Text>
      ),
      labels: { confirm: '停止する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        setDeletingId(share.id)
        startDelete(async () => {
          // finally で必ず解く: Action の呼び出し自体が失敗（オフライン、デプロイ跨ぎ）すると
          // await が投げるので、成功パスだけで解くとその行が永久に loading のままになる
          try {
            const result = await deleteShare({ tenantId, shareId: share.id })
            if (!result.ok) {
              notifications.show(failure(result.error))
              // 別タブで停止済みの行が一覧に残っている状態。読み直して消す
              router.refresh()
              return
            }
            notifications.show({ message: '共有を停止しました', color: 'green' })
          } finally {
            setDeletingId(null)
          }
        })
      },
    })

  // 1 件ずつ停止する。実行中に別の行を押すと deletingId が移り、
  // 先の行が押せる見た目に戻って二重に停止してしまう（2 回目は「共有が見つかりません」）
  const actionsProps = (share: ShareItem) => ({
    share,
    loading: isDeleting && deletingId === share.id,
    disabled: isDeleting,
    onStop: () => stop(share),
  })

  const currentSection = current ? (
    <CurrentShare
      share={current}
      today={today}
      actions={
        <ShareActions
          {...actionsProps(current)}
          loading={isCreating || (isDeleting && deletingId === current.id)}
          disabled={isDeleting || isCreating}
          onCreateAnother={create}
        />
      }
    />
  ) : expired ? (
    // disabled のボタンに説明を兼ねさせない（薄くて読めない。011 §6.2）
    <Stack gap={2}>
      <Text size="sm" fw={600}>
        {SHARE_EXPIRED_MESSAGE}
      </Text>
      <Text size="xs" c="dimmed">
        公開期限の {lastDayLabel(range.end)} を過ぎています
      </Text>
    </Stack>
  ) : (
    // 読み下ろした先にボタンを置く。発行後はこのブロックが URL 欄に入れ替わる
    <Stack gap={14}>
      <BeforeIssueFacts />
      <Button
        fullWidth
        h={40}
        onClick={create}
        loading={isCreating}
        leftSection={<IconLink size={16} />}
      >
        共有用URLを発行
      </Button>
    </Stack>
  )

  return (
    <Modal opened onClose={onClose} title={<ShareTitle cycle={cycle} range={range} />} size="md">
      <Stack gap="md">
        {currentSection}

        {(others.length > 0 || shares.expired.length > 0) && (
          <div className={classes.lists}>
            {others.length > 0 && (
              <div>
                <div className={classes.sectionLabel}>
                  ほかの共有中
                  <span className={classes.count}>{others.length}</span>
                </div>
                {others.map((share) => (
                  <div key={share.id} className={classes.row}>
                    <div className={classes.rowText}>
                      <span className={`${classes.period} ${classes.num}`}>{listTerm(share)}</span>
                      <OtherShareMeta share={share} today={today} />
                    </div>
                    <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                      <CopyIconButton url={share.url} />
                      <ShareActions {...actionsProps(share)} withOpen />
                    </Group>
                  </div>
                ))}
              </div>
            )}

            {shares.expired.length > 0 && (
              <div>
                {/* 見出しは「ほかの共有中」と同じ字。矢印は件数の後ろに置き、左端を揃える */}
                <UnstyledButton
                  className={`${classes.sectionLabel} ${classes.expiredToggle}`}
                  aria-expanded={expiredOpened}
                  onClick={toggleExpired}
                >
                  公開期限が過ぎた共有
                  <span className={classes.count}>{shares.expired.length}</span>
                  <IconChevronRight
                    size={12}
                    stroke={2.2}
                    aria-hidden
                    className={expiredOpened ? classes.chevOpen : classes.chev}
                  />
                </UnstyledButton>
                {/*
                  行は共有中と同じ組み（左端・区切り線・2 行）にして、色だけ一段薄くする。
                  期限切れは解除できない（v1 と同じ。URL は既に無効）。押すと 404 なのでリンクも操作も置かない
                */}
                <Collapse expanded={expiredOpened}>
                  {shares.expired.map((share) => (
                    <div key={share.id} className={classes.row}>
                      <div className={classes.rowText}>
                        <span className={`${classes.period} ${classes.endedPeriod} ${classes.num}`}>
                          {listTerm(share)}
                        </span>
                        <span className={`${classes.meta} ${classes.endedMeta} ${classes.num}`}>
                          {issuedAt(share.createdAt, share.startDate)} に発行 ·{' '}
                          {lastDayLabel(share.endDate)} で公開終了
                        </span>
                      </div>
                    </div>
                  ))}
                </Collapse>
              </div>
            )}
          </div>
        )}
      </Stack>
    </Modal>
  )
}

/**
 * 発行後の「この期間の URL」。URL + コピー → 公開状態と操作 → 注意 1 行。
 *
 * URL は入力欄ではなく文字で出し、オリジンを薄く・コードを濃くする。
 * `user-select: all` なので 1 回のクリックで全体が選ばれ、クリップボードが拒まれる環境
 * （古いアプリ内ブラウザなど）でも手で渡せる。省略（ellipsis）は先頭側に掛け、コードは切らない。
 */
function CurrentShare({
  share,
  today,
  actions,
}: {
  share: ShareItem
  today: string
  actions: ReactNode
}) {
  const { prefix, code } = splitShareUrl(share.url)
  const days = shareDaysLeft(share.endDate, today)
  const soon = days <= SHARE_ENDING_SOON_DAYS
  return (
    <div>
      <Box className={classes.urlField}>
        {/*
          1 本のインライン文字列にする（flex の子に分けると、選択したときに span の間へ改行が入る）。
          外側を rtl にして先頭側を省略し（`…host:3000/share/L3Jg…`）、中身は dir="ltr" で並びを保つ
        */}
        <span className={classes.url} title={share.url}>
          <bdi dir="ltr">
            {prefix}
            <span className={classes.urlCode}>{code}</span>
          </bdi>
        </span>
        <CopyButton value={share.url} timeout={2000}>
          {({ copied, copy }) => (
            <Button
              size="xs"
              h={32}
              style={{ flexShrink: 0 }}
              leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              onClick={copy}
            >
              {copied ? 'コピー済み' : 'コピー'}
            </Button>
          )}
        </CopyButton>
      </Box>

      <Group justify="space-between" gap={8} wrap="nowrap" mt={8}>
        <span className={`${classes.status} ${soon ? classes.statusSoon : ''} ${classes.num}`}>
          <span className={classes.dot} aria-hidden />
          公開中 · {lastDayLabel(share.endDate)} まで
          <span className={classes.daysLeft}>{daysLeftLabel(days)}</span>
        </span>
        <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button
            component="a"
            href={share.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            color="gray"
            size="compact-sm"
            h={28}
            leftSection={<IconExternalLink size={14} />}
          >
            開く
          </Button>
          {actions}
        </Group>
      </Group>

      {/* 全文は発行前に読んでいる。別の日に開き直した人のために「誰でも見られる」だけは残す */}
      <Text size="xs" c="dimmed" mt={6}>
        URLを知っている人は誰でも見られます
      </Text>
    </div>
  )
}

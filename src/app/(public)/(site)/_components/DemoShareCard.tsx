'use client'

import { useEffect, useId, useRef } from 'react'
import { Button, CloseButton, Text } from '@mantine/core'
import { IconArrowDown, IconCopy } from '@tabler/icons-react'
import classes from './ShiftDemo.module.css'

/** デモの共有 URL（見た目だけ。コードは実物と同じ 8 文字・同じ字の集合から選んだ固定値） */
const DEMO_SHARE_URL = 'assift.com/share/a8Kx3mQp'

type Props = {
  onClose: () => void
  /** 「スタッフの画面を見る」。閉じてから `StaffView` へスクロールする */
  onShowStaffView: () => void
}

/**
 * デモの「共有」を押したときのカード（016 §13）。実物の共有モーダル（`ShareModal`）の発行後の形をなぞる。
 *
 * - 画面全体ではなくデモの枠の上にだけ重ねる（LP で画面が暗くなると、本当に何かを発行したように見えて身構える）
 * - URL は開いても 404 なので、コピーは見た目だけにする（押せない。読み上げにも出さない）。
 *   代わりに「スタッフの画面を見る」で、すぐ下の `StaffView`（スタッフが開くページの例）へつなぐ
 * - 枠の上下中央に出す。画面の外にはみ出したら、はみ出した分だけスクロールする
 * - 閉じるのは ×・枠の外・Esc。開いたら主ボタンへフォーカスを移す
 */
export function DemoShareCard({ onClose, onShowStaffView }: Props) {
  const titleId = useId()
  const card = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  // 親の再描画ごとに onClose が作り直されても、フォーカスを奪い直さない
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    // 枠の上下中央に出すので、スマホ（表が縦に長い）では画面の外にはみ出すことがある。
    // そのときだけ、カードが画面の中央に来るように寄せる（'nearest' だと画面の端に張り付く）
    const rect = card.current?.getBoundingClientRect()
    if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      card.current?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    }
    // スクロールはこちらで済ませたので、フォーカスでは動かさない
    primary.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={classes.shareLayer}>
      <div className={classes.shareBackdrop} onClick={onClose} aria-hidden="true" />
      <div ref={card} className={classes.shareCard} role="dialog" aria-labelledby={titleId}>
        <div className={classes.shareHead}>
          <Text id={titleId} fz={15} fw={650} lh={1.4}>
            共有のURLを発行しました
            <Text span c="dimmed" fz={13} fw={400}>
              （デモ）
            </Text>
          </Text>
          <CloseButton size="sm" aria-label="閉じる" onClick={onClose} />
        </div>
        <div className={classes.shareUrlField}>
          <span className={classes.shareUrl}>{DEMO_SHARE_URL}</span>
          <span className={classes.shareCopy} aria-hidden="true">
            <IconCopy size={14} />
            コピー
          </span>
        </div>
        <Text fz={13} c="dimmed" lh={1.5}>
          スタッフはログインなしで開けます
        </Text>
        <Button
          ref={primary}
          size="sm"
          fullWidth
          rightSection={<IconArrowDown size={16} />}
          onClick={onShowStaffView}
        >
          スタッフの画面を見る
        </Button>
      </div>
    </div>
  )
}

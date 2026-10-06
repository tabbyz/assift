'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type Ref } from 'react'
import { UnstyledButton, type ElementProps } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { cellStyle, ghostStyle, type CellPattern } from './cellStyle'
import classes from './ShiftTable.module.css'
import {
  HOLD_FEEDBACK_DELAY_MS,
  HOLD_TO_TOGGLE_MS,
  consumeHoldClick,
  markHoldToggle,
  movedPastHold,
} from './holdToToggle'

type Props = ElementProps<'button', 'onClick'> & {
  /** アサイン済みのパターン。無ければ空のセル */
  pattern?: CellPattern
  fixed: boolean
  /** その曜日に勤務できるスタッフか（v1 の `data-enabled`） */
  enabled: boolean
  label: string
  /** 直近の自動アサインで入ったセル。左上に 4px の点（012 §3.8） */
  marked?: boolean
  /** 自動アサインの効く一手を選んでいるとき、このセルに入るパターン（空のセルだけ。012 §11.1） */
  ghost?: CellPattern
  onClick: () => void
  /** アサイン済みのときだけ。長押しで下書きと確定を入れ替える */
  onToggleFixed?: () => void
  /** 長押し直後の click を、このセルだけ捨てるためのキー（`staffId:date`） */
  holdKey: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * `Popover.Target` は子を cloneElement して `aria-haspopup` / `aria-expanded` /
 * `aria-controls` / `id` とマージ済みの `className` を渡してくる。受け取って素通しする。
 * v1 のセルにも `aria-haspopup` / `aria-expanded` が付いていた。
 */

/**
 * シフト表の 1 セル（v1 の `_staff.html.slim` + `shifts/pattern.scss`）。
 *
 * 担当可（白。空はホバー / フォーカスで「+」）/ 担当不可（斜線）/
 * 下書き（淡塗り）/ 確定（ベタ塗り + 太字）の 4 通り。
 * 色の規則は `cellStyle()` に置いて公開ページと共有する。
 *
 * タップはパターンのポップオーバー。アサイン済みを長押しすると、ポップオーバーを開かずに
 * 下書きと確定を入れ替える。空のセルに長押しは無く、離したときにポップオーバーが開く。
 */
export function ShiftCell({
  pattern,
  fixed,
  enabled,
  label,
  marked,
  ghost,
  onClick,
  onToggleFixed,
  holdKey,
  ref,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  ...rest
}: Props) {
  const assigned = Boolean(pattern)
  const showGhost = !pattern && ghost !== undefined
  const { holding, pointerProps } = useHoldToggle(holdKey, onToggleFixed)
  const paint = showGhost ? ghostStyle(ghost.colorHex) : cellStyle(pattern, fixed)
  const holdStyle: CSSProperties | undefined = holding
    ? ({
        ...paint,
        '--hold-ms': `${HOLD_TO_TOGGLE_MS - HOLD_FEEDBACK_DELAY_MS}ms`,
      } as CSSProperties)
    : paint

  return (
    <UnstyledButton
      // 閉じているセルにも付ける（v1 は全セルに `aria-haspopup` を置いていた）。
      // 開いている間は rest の注入値（dialog / aria-expanded / aria-controls）が上書きする
      aria-haspopup="dialog"
      {...rest}
      ref={ref}
      className={className ? `${classes.cell} ${className}` : classes.cell}
      data-assigned={assigned}
      data-enabled={enabled ? 'true' : 'false'}
      data-fixed={fixed}
      data-holding={holding || undefined}
      data-marked={marked || undefined}
      data-ghost={showGhost || undefined}
      onClick={(event) => {
        if (consumeHoldClick(holdKey)) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        onClick()
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        pointerProps.onPointerDown(event)
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        pointerProps.onPointerMove(event)
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        pointerProps.onPointerUp()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        pointerProps.onPointerCancel()
      }}
      onPointerLeave={pointerProps.onPointerLeave}
      onContextMenu={(event) => {
        onContextMenu?.(event)
        // 長押しの途中でブラウザのメニューが出ると、切替より先に指が取られる
        if (onToggleFixed) event.preventDefault()
      }}
      aria-label={showGhost ? `${label}（AI の提案: ${ghost.name}）` : label}
      style={holdStyle}
    >
      {pattern
        ? pattern.name
        : showGhost
          ? `+${ghost.name}`
          : enabled && <IconPlus size={18} className={classes.cellPlus} />}
    </UnstyledButton>
  )
}

/**
 * アサイン済みセルの長押し。
 * 指が動いた・離れた・スクロールで pointer がキャンセルされたら、切替はしない。
 */
function useHoldToggle(key: string, onToggle: (() => void) | undefined) {
  const onToggleRef = useRef(onToggle)
  const keyRef = useRef(key)
  useEffect(() => {
    onToggleRef.current = onToggle
    keyRef.current = key
  })
  const timer = useRef<number | null>(null)
  const feedback = useRef<number | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const [holding, setHolding] = useState(false)

  const clearTimers = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (feedback.current !== null) window.clearTimeout(feedback.current)
    timer.current = null
    feedback.current = null
  }

  const stop = () => {
    clearTimers()
    origin.current = null
    setHolding(false)
  }

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (feedback.current !== null) window.clearTimeout(feedback.current)
    }
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!onToggleRef.current || event.button !== 0) return
    clearTimers()
    origin.current = { x: event.clientX, y: event.clientY }
    feedback.current = window.setTimeout(() => {
      feedback.current = null
      setHolding(true)
    }, HOLD_FEEDBACK_DELAY_MS)
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (feedback.current !== null) {
        window.clearTimeout(feedback.current)
        feedback.current = null
      }
      origin.current = null
      setHolding(false)
      if (!onToggleRef.current) return
      markHoldToggle(keyRef.current)
      onToggleRef.current()
    }, HOLD_TO_TOGGLE_MS)
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!origin.current) return
    if (movedPastHold(origin.current, { x: event.clientX, y: event.clientY })) stop()
  }

  return {
    holding,
    pointerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stop,
      onPointerCancel: stop,
      // 端を押したままセルの外へ出たときは、10px に届く前でもやめる
      onPointerLeave: stop,
    },
  }
}

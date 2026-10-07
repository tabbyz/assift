import { cellStyle } from '@/components/shiftTable/cellStyle'
import { DEMO_PATTERNS } from '../_lib/demoData'
import classes from '../Site.module.css'

type Props = {
  patternId: string
  /** 確定（ベタ塗り）か下書き（淡塗り）か。アプリのセルと同じ規則 */
  fixed?: boolean
  size?: 'md' | 'lg'
  /** 浮いている飾り（影を付ける） */
  floating?: boolean
}

/**
 * シフト表のマスをスタンプにしたもの。LP のポップさはこれだけで出す（016 §2）。
 * 色は `cellStyle()`（アプリのセルと同じ）。
 */
export function Stamp({ patternId, fixed = false, size = 'md', floating = false }: Props) {
  const pattern = DEMO_PATTERNS.find((p) => p.id === patternId)
  if (!pattern) return null
  return (
    <span
      className={classes.stamp}
      data-fixed={fixed}
      data-size={size}
      data-floating={floating || undefined}
      style={cellStyle(pattern, fixed)}
    >
      {pattern.name}
    </span>
  )
}

import { createTheme } from '@mantine/core'
import { PATTERN_COLORS } from '@/lib/patterns/colors'

/**
 * 色・半径・フォントはここに集約する。コンポーネント側で直接 hex を書かない。
 * primary の teal は v1 の primary（#00d1b2）に最も近い組み込み色。
 */
export const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'sm',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif',
  other: {
    patternColors: PATTERN_COLORS,
  },
})

import { createTheme } from '@mantine/core'
import { PATTERN_COLORS } from '@/lib/patterns/colors'

/**
 * 色・半径・フォントはここに集約する。コンポーネント側で直接 hex を書かない。
 * primary の teal は v1 の primary（#00d1b2）に最も近い組み込み色。
 */
/** 日付ピッカーの表示書式。ルートをまたいで同じにする（008 §10.15） */
const DATE_VALUE_FORMAT = 'YYYY/MM/DD'

export const theme = createTheme({
  // `DateInput.extend()` は使わない: このファイルは Server（root layout）からも読まれ、
  // `@mantine/dates` のコンポーネントは Server 側のバンドルでは静的メソッドを持たない。素のオブジェクトで足りる
  components: {
    DateInput: { defaultProps: { valueFormat: DATE_VALUE_FORMAT } },
    DatePickerInput: { defaultProps: { valueFormat: DATE_VALUE_FORMAT } },
  },
  primaryColor: 'teal',
  defaultRadius: 'sm',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif',
  other: {
    patternColors: PATTERN_COLORS,
  },
})

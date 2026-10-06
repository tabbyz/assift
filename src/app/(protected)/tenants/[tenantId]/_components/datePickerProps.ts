import { getDefaultZIndex } from '@mantine/core'

/**
 * モーダルの中で使う日付ピッカーの共通 props（008 §10.4）。表示書式は theme の defaultProps（`src/theme.ts`）。
 *
 * ポップオーバー型のカレンダーは下の要素を覆い、クリックを吸う。別モーダルに出せば重なりようがない。
 * 外側の Modal より 1 つ上に重ねる（DOM 順でも上になるが、明示しておく）。
 */
export const MODAL_DATE_PICKER_PROPS = {
  dropdownType: 'modal',
  modalProps: { zIndex: getDefaultZIndex('modal') + 1 },
} as const

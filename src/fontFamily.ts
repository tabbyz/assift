/**
 * アプリの書体（システムフォント）。`theme.ts` と、Mantine を読まない `global-error.tsx`（023）が共有する。
 * Mantine にも何にも依らない素の値だけを置く（global-error は他が壊れていても描けなければならない）
 */
export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif'

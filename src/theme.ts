import { createTheme } from '@mantine/core'
import { PATTERN_COLORS } from '@/lib/patterns/colors'

/**
 * 色・半径・フォントはここに集約する。コンポーネント側で直接 hex を書かない。
 * primary は gray。ブランド色で chrome を塗らず、パターン色と不足の赤に役割を残す。
 * 状態がよい色は green（公開中、充足、成功通知）。chrome には使わない。
 * Button・Checkbox・Switch・Chip の既定色は dark。色を省略した filled が gray の 6 番に落ちないようにする。
 * `variant="default"` は色を見ないので、操作・集計などの副操作はそのまま残る。
 */
/** 日付ピッカーの表示書式。ルートをまたいで同じにする（008 §10.15） */
const DATE_VALUE_FORMAT = 'YYYY/MM/DD'

export const theme = createTheme({
  // `DateInput.extend()` は使わない: このファイルは Server（root layout）からも読まれ、
  // `@mantine/dates` のコンポーネントは Server 側のバンドルでは静的メソッドを持たない。素のオブジェクトで足りる
  components: {
    Button: { defaultProps: { color: 'dark' } },
    Checkbox: { defaultProps: { color: 'dark' } },
    Switch: { defaultProps: { color: 'dark' } },
    /*
     * Chip の既定の角丸は xl（ピル型）。ほかの chrome と同じ控えめな角丸にする。
     * 選択中の先頭のチェックマークは出さない（塗りで選択が分かる）。選択中はチェック分だけ左右の余白が詰まるので、未選択と同じ余白に戻す
     */
    Chip: {
      defaultProps: { color: 'dark', radius: 'sm' },
      // 関数（`vars`）は使えない: theme は Server（root layout）から Client の MantineProvider へ渡る
      styles: {
        iconWrapper: { display: 'none' },
        label: { paddingInline: 'var(--chip-padding)' },
      },
    },
    /*
     * リンクは **本文色 + 下線**。
     * Mantine の既定は `--mantine-color-anchor`（= primary の 6 番）で、この店は primaryColor が gray なので
     * `--mantine-color-dimmed` と**同じ #868e96** になり、説明文の中に置くと押せると分からない。
     * 白地でのコントラストも 3.5:1 しかなく、小さい文字の 4.5:1 に届かない。
     * ブランド色を増やさない方針（このファイル冒頭）なので、色ではなく下線でリンクだと示す。
     * 役割のある色（削除の赤など）は呼び出し側の `c` が優先されるのでそのまま残る
     */
    Anchor: { defaultProps: { underline: 'always', c: 'var(--mantine-color-text)' } },
    /*
     * 通知の入れ物は既定で幅 100%・最大 440px まで常に広がる。短い成功文でも閉じるボタンが右端に寄る。
     * 幅は文の長さに合わせ、長い文だけ画面端と 440px で止める。
     */
    Notifications: {
      styles: {
        root: {
          width: 'max-content',
          maxWidth:
            'min(var(--notifications-container-width), calc(100% - var(--mantine-spacing-md) * 2))',
        },
      },
    },
    DateInput: { defaultProps: { valueFormat: DATE_VALUE_FORMAT } },
    DatePickerInput: { defaultProps: { valueFormat: DATE_VALUE_FORMAT } },
  },
  primaryColor: 'gray',
  /*
   * chrome（ボタン・入力・モーダル・ポップオーバー・メニュー）の角丸。
   * `sm` = 4px。ここを 1 行変えると Mantine コンポーネント全体の丸みが動く。
   *
   * **表の中は別の層**として手書きの CSS が持つ（セル 3px・勤務日数バッジ 5px）。
   * 表は密度が主役なので、chrome を丸めすぎるとマスの四角さと喧嘩する。
   */
  defaultRadius: 'sm',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif',
  other: {
    patternColors: PATTERN_COLORS,
  },
})

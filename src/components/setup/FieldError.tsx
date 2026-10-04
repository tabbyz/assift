import { Text } from '@mantine/core'

/**
 * 選択肢のまとまり（ボタンの並び）の下に出す注意。入力欄は Mantine の `error` を使う。
 * 置き場所はどれも `gap={8}` の Stack の中。既定は -4 で入力欄のエラーと同じくらい（約 4px）まで詰める
 */
export function FieldError({ message, mt = -4 }: { message: string | null; mt?: number }) {
  if (!message) return null
  return (
    <Text size="sm" c="var(--mantine-color-error)" role="alert" mt={mt}>
      {message}
    </Text>
  )
}

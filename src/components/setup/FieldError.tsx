import { Text } from '@mantine/core'

/** 選択肢のまとまり（ボタンの並び）の下に出す注意。入力欄は Mantine の `error` を使う */
export function FieldError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Text size="sm" c="var(--mantine-color-error)" role="alert">
      {message}
    </Text>
  )
}

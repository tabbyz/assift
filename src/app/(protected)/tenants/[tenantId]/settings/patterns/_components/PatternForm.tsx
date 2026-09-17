'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { Button, Group, Paper, Stack, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { PATTERN_NAME_MAX_LENGTH } from '@/lib/validation/patterns'
import { createPattern } from '../actions'

/**
 * 勤務パターンの登録フォーム（005 は名前だけ）。
 * 設定画面（006）とチュートリアルの両方から使う。一覧は Action の revalidatePath で
 * Server が描き直すので、ここでは状態を持たない。
 */
export function PatternForm({ tenantId }: { tenantId: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await createPattern({ tenantId, name })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(undefined)
      setName('')
      // 一覧は Action の revalidatePath がこの画面ごと描き直す（router.refresh() は不要）
      notifications.show({
        message: `「${result.data.name}」を登録しました。続けて登録できます`,
        color: 'green',
      })
    })
  }

  return (
    <Paper withBorder p="lg">
      <form onSubmit={submit}>
        <Stack gap="md">
          <FormErrorAlert message={error} />
          <TextInput
            label="勤務パターン名"
            placeholder="例）早番"
            description={`${PATTERN_NAME_MAX_LENGTH}文字以内で入力`}
            maxLength={PATTERN_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            autoFocus
          />
          <Group justify="flex-end">
            <Button type="submit" loading={isPending}>
              登録する
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}

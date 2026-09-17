'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { Button, Group, Paper, Stack, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { STAFF_NAME_MAX_LENGTH } from '@/lib/validation/staffs'
import { createStaff } from '../actions'

/** スタッフの登録フォーム（005 は名前だけ）。設定画面（006）とチュートリアルで共有する */
export function StaffForm({ tenantId }: { tenantId: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await createStaff({ tenantId, name })
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
            label="スタッフ名"
            placeholder="例）山田 太郎"
            description={`${STAFF_NAME_MAX_LENGTH}文字以内で入力`}
            maxLength={STAFF_NAME_MAX_LENGTH}
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

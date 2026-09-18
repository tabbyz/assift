'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { formatJapaneseMonthDay } from '@/lib/calendar/dateString'
import { DATE_NOTE_MAX_LENGTH } from '@/lib/validation/dateNotes'
import { saveDateNote } from '../actions'

type Props = { tenantId: string; date: string; note: string; onClose: () => void }

/** 日付メモ（v1 `events/_edit.html.slim`）。空にして保存すると削除される */
export function DateNoteModal({ tenantId, date, note, onClose }: Props) {
  const [value, setValue] = useState(note)
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveDateNote({ tenantId, date, note: value })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      onClose()
    })
  }

  return (
    <Modal opened onClose={onClose} title={formatJapaneseMonthDay(date)} size="sm">
      <form onSubmit={submit}>
        <Stack gap="md">
          <Alert variant="light" color="teal" p="xs">
            イベントなどの情報をメモできます。
          </Alert>

          <TextInput
            label="メモ"
            description={`最大${DATE_NOTE_MAX_LENGTH}文字まで`}
            maxLength={DATE_NOTE_MAX_LENGTH}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            data-autofocus
          />

          <Group justify="flex-end">
            <Button type="submit" loading={isPending}>
              保存
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

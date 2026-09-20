'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Container,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { LinkButton } from '@/components/LinkButton'
import { SHIFT_CYCLE_OPTIONS, type ShiftCycle } from '@/lib/calendar/shiftCycle'
import { TENANT_NAME_MAX_LENGTH } from '@/lib/validation/tenants'
import { createTenant } from '../actions'

export function NewTenantForm({ isFirst }: { isFirst: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [shiftCycle, setShiftCycle] = useState<ShiftCycle>('month')
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await createTenant({ name, shiftCycle })
      if (!result.ok) {
        setError(result.error)
        return
      }
      notifications.show({ message: '店舗を作成しました', color: 'green' })
      router.push(result.data.redirectTo)
    })
  }

  return (
    <Container size={560} py="xl">
      <Stack gap="lg">
        {isFirst ? (
          <Stack gap={4}>
            <Title order={2}>assift へようこそ</Title>
            <Text c="dimmed">まず最初にあなたの店舗を作成しましょう。</Text>
          </Stack>
        ) : (
          <Title order={2}>店舗を追加</Title>
        )}

        <FormErrorAlert message={error} />

        <Paper withBorder p="lg">
          <form onSubmit={submit}>
            <Stack gap="md">
              <TextInput
                label="店舗名"
                placeholder="例）ひまわり保育園"
                description={`${TENANT_NAME_MAX_LENGTH}文字以内で入力`}
                maxLength={TENANT_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                required
                autoFocus
              />
              <Select
                label="シフト表の作成周期"
                data={SHIFT_CYCLE_OPTIONS}
                value={shiftCycle}
                onChange={(value) => value && setShiftCycle(value as ShiftCycle)}
                allowDeselect={false}
                required
              />
              <Group justify="flex-end" gap="xs">
                {!isFirst && (
                  <LinkButton href="/tenants" variant="subtle" color="gray">
                    キャンセル
                  </LinkButton>
                )}
                <Button type="submit" loading={isPending}>
                  店舗を作成
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  )
}

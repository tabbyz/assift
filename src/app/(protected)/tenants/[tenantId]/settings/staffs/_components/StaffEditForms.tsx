'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { Button, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { SettingsSection } from '@/components/SettingsSection'
import { updateStaffConditions, updateStaffName } from '../actions'
import {
  STAFF_CONDITIONS_DESCRIPTION,
  StaffConditionFields,
  type StaffConditionValues,
  StaffNameInput,
  type StaffPatternOption,
} from './StaffFields'

type Props = {
  tenantId: string
  staffId: string
  patterns: StaffPatternOption[]
  initialName: string
  initialConditions: StaffConditionValues
}

/**
 * スタッフの編集。基本情報と勤務条件をセクションごとに保存する（ほかの設定画面と同じく、保存ボタンは枠の下端）。
 * 戻るのはパンくずから（セクションごとにキャンセルは置かない）
 */
export function StaffEditForms({
  tenantId,
  staffId,
  patterns,
  initialName,
  initialConditions,
}: Props) {
  return (
    <Stack gap="lg">
      <NameSection tenantId={tenantId} staffId={staffId} initialName={initialName} />
      <ConditionsSection
        tenantId={tenantId}
        staffId={staffId}
        patterns={patterns}
        initialConditions={initialConditions}
      />
    </Stack>
  )
}

function NameSection({
  tenantId,
  staffId,
  initialName,
}: Pick<Props, 'tenantId' | 'staffId' | 'initialName'>) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateStaffName({ tenantId, staffId, name })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(undefined)
      notifications.show({ message: '基本情報を保存しました', color: 'green' })
    })
  }

  return (
    <form onSubmit={submit}>
      <SettingsSection
        title="基本情報"
        footer={
          <Button type="submit" loading={isPending}>
            保存
          </Button>
        }
      >
        <Stack gap="md">
          <FormErrorAlert message={error} />
          <StaffNameInput value={name} onChange={setName} />
        </Stack>
      </SettingsSection>
    </form>
  )
}

function ConditionsSection({
  tenantId,
  staffId,
  patterns,
  initialConditions,
}: Pick<Props, 'tenantId' | 'staffId' | 'patterns' | 'initialConditions'>) {
  const [conditions, setConditions] = useState(initialConditions)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateStaffConditions({ tenantId, staffId, ...conditions })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(undefined)
      notifications.show({ message: '勤務条件を保存しました', color: 'green' })
    })
  }

  return (
    <form onSubmit={submit}>
      <SettingsSection
        title="勤務条件"
        description={STAFF_CONDITIONS_DESCRIPTION}
        footer={
          <Button type="submit" loading={isPending}>
            保存
          </Button>
        }
      >
        <Stack gap="md">
          <FormErrorAlert message={error} />
          <StaffConditionFields values={conditions} onChange={setConditions} patterns={patterns} />
        </Stack>
      </SettingsSection>
    </form>
  )
}

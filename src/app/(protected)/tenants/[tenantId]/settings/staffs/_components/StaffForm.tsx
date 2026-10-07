'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { LinkButton } from '@/components/LinkButton'
import { openStaffLimitModal } from '@/components/billing/StaffLimitModal'
import { SettingsSection } from '@/components/SettingsSection'
import { WEEKDAY_VALUES } from '@/lib/calendar/weekdays'
import { createStaff } from '../actions'
import {
  STAFF_CONDITIONS_DESCRIPTION,
  StaffConditionFields,
  type StaffConditionValues,
  StaffNameInput,
  type StaffPatternOption,
} from './StaffFields'

type Props = {
  tenantId: string
  patterns: StaffPatternOption[]
}

/** v1 の新規フォームは全曜日・全パターンにチェックが入った状態 */
function emptyConditions(patterns: StaffPatternOption[]): StaffConditionValues {
  return {
    availableWdays: [...WEEKDAY_VALUES],
    maxWorkWeek: 5,
    availablePatternIds: patterns.map((pattern) => pattern.id),
    defaultPatterns: {},
  }
}

/** スタッフの新規登録（設定画面）。2 つのセクションを「追加」1 回で送る。編集は `StaffEditForms` */
export function StaffForm({ tenantId, patterns }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [conditions, setConditions] = useState(() => emptyConditions(patterns))
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitStaff()
  }

  const submitStaff = () =>
    startTransition(async () => {
      const result = await createStaff({ tenantId, name, ...conditions })
      if (!result.ok) {
        // 在籍の上限（019 §5.3）。トライアルを始めたらそのまま追加をやり直す
        if (result.code === 'staff_limit') {
          setError(undefined)
          openStaffLimitModal({ onTrialStarted: () => submitStaff() })
          return
        }
        setError(result.error)
        return
      }
      setError(undefined)
      notifications.show({ message: '登録しました', color: 'green' })
      router.push(`/tenants/${tenantId}/settings/staffs`)
    })

  return (
    <form onSubmit={submit}>
      <Stack gap="lg">
        <FormErrorAlert message={error} />

        <SettingsSection title="基本情報">
          <StaffNameInput value={name} onChange={setName} autoFocus />
        </SettingsSection>

        <SettingsSection title="勤務条件" description={STAFF_CONDITIONS_DESCRIPTION}>
          <StaffConditionFields values={conditions} onChange={setConditions} patterns={patterns} />
        </SettingsSection>

        {/* 2 つのセクションをまとめて送るので、どちらの枠にも入れずフォームの最後に置く */}
        <Group justify="flex-end" gap="xs">
          <LinkButton
            href={`/tenants/${tenantId}/settings/staffs`}
            variant="subtle"
            color="gray"
            // 送信中に押すと、書き込みは走ったまま遷移して通知とエラー表示を取りこぼす
            disabled={isPending}
          >
            キャンセル
          </LinkButton>
          <Button type="submit" loading={isPending}>
            追加
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

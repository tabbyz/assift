'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { SettingsSection } from '@/components/SettingsSection'
import { SHIFT_CYCLE_OPTIONS, type ShiftCycle } from '@/lib/calendar/shiftCycle'
import { START_OF_WEEK_OPTIONS } from '@/lib/calendar/weekdays'
import { INDUSTRIES, INDUSTRY_LABELS, type Industry, isIndustry } from '@/lib/setup/templates'
import {
  INDUSTRY_NOTE_MAX_LENGTH,
  normalizeIndustry,
  TENANT_NAME_MAX_LENGTH,
} from '@/lib/validation/tenants'
import { deleteTenant } from '../../../../actions'
import { updateTenant } from '../actions'

type Props = {
  tenantId: string
  name: string
  shiftCycle: ShiftCycle
  startOfWeek: number
  industry: Industry | null
  industryNote: string | null
}

const INDUSTRY_OPTIONS = INDUSTRIES.map((value) => ({ value, label: INDUSTRY_LABELS[value] }))

export function GeneralSettingsClient(props: Props) {
  const router = useRouter()
  const [name, setName] = useState(props.name)
  const [shiftCycle, setShiftCycle] = useState<ShiftCycle>(props.shiftCycle)
  const [startOfWeek, setStartOfWeek] = useState(String(props.startOfWeek))
  const [industry, setIndustry] = useState<Industry | null>(props.industry)
  const [industryNote, setIndustryNote] = useState(props.industryNote ?? '')
  const [error, setError] = useState<string>()
  const [isSaving, startSave] = useTransition()
  const [isDeleting, startDelete] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // 業種は変えたときだけ送る（034 §4.3）。比べる相手は props（保存のあと revalidatePath で新しい値になる）。
    // 両方を normalizeIndustry に通して、一言の '' と null を同じに扱う
    const next = normalizeIndustry({ industry, industryNote })
    const current = normalizeIndustry({
      industry: props.industry,
      industryNote: props.industryNote,
    })
    const industryChanged =
      next.industry !== current.industry || next.industryNote !== current.industryNote
    startSave(async () => {
      const result = await updateTenant({
        tenantId: props.tenantId,
        name,
        shiftCycle,
        startOfWeek: Number(startOfWeek),
        ...(industryChanged ? next : {}),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(undefined)
      notifications.show({ message: '店舗情報を更新しました', color: 'green' })
    })
  }

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: '店舗を削除',
      children: <Text size="sm">本当に削除しますか？この操作は取り消せません。</Text>,
      labels: { confirm: '削除する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        startDelete(async () => {
          const result = await deleteTenant({ tenantId: props.tenantId })
          if (!result.ok) {
            notifications.show({ message: result.error, color: 'red' })
            return
          }
          notifications.show({ message: '店舗を削除しました', color: 'green' })
          router.push(result.data.redirectTo)
        }),
    })

  return (
    <Stack gap="lg">
      <Title order={2}>店舗情報</Title>

      <FormErrorAlert message={error} />

      <form onSubmit={submit}>
        <SettingsSection
          footer={
            <Button type="submit" loading={isSaving}>
              保存
            </Button>
          }
        >
          <Stack gap="md">
            <TextInput
              label="店舗名"
              placeholder="例）ひまわり保育園"
              description={`${TENANT_NAME_MAX_LENGTH}文字以内で入力`}
              maxLength={TENANT_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
            />
            <Select
              label="シフト表の作成周期"
              data={SHIFT_CYCLE_OPTIONS}
              value={shiftCycle}
              onChange={(value) => value && setShiftCycle(value as ShiftCycle)}
              allowDeselect={false}
              required
            />
            <Select
              label="カレンダーの週の始まり"
              data={START_OF_WEEK_OPTIONS}
              value={startOfWeek}
              onChange={(value) => value && setStartOfWeek(value)}
              allowDeselect={false}
              required
            />
            <Select
              label="業種"
              description="勤務パターンは変わりません"
              placeholder="選んでいません"
              data={INDUSTRY_OPTIONS}
              value={industry}
              onChange={(value) => setIndustry(isIndustry(value) ? value : null)}
              clearable
            />
            {industry === 'other' && (
              <TextInput
                label="お店の業種（任意）"
                placeholder="例）ホテル"
                maxLength={INDUSTRY_NOTE_MAX_LENGTH}
                value={industryNote}
                onChange={(event) => setIndustryNote(event.currentTarget.value)}
              />
            )}
          </Stack>
        </SettingsSection>
      </form>

      <SettingsSection title="店舗を削除">
        <Stack gap="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              削除すると、この店舗に関連するすべてのデータが削除されます。
            </Text>
            <Text size="sm" c="red">
              この操作は元には戻せません。
            </Text>
          </Stack>
          <Group>
            <Button color="red" variant="outline" onClick={confirmDelete} loading={isDeleting}>
              削除する
            </Button>
          </Group>
        </Stack>
      </SettingsSection>
    </Stack>
  )
}

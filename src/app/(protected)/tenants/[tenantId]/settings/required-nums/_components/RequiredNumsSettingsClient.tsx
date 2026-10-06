'use client'

import { type FormEvent, useState, useTransition } from 'react'
import Link from 'next/link'
import { Anchor, Button, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { SettingsSection } from '@/components/SettingsSection'
import { RequiredNumsMatrix } from '@/components/requiredNums/RequiredNumsMatrix'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import { isUniform, toMatrix, toSavePayload } from '@/lib/patterns/requiredNumsMatrix'
import { saveDefaultRequiredNums } from '../../../../actions'

type Props = {
  tenantId: string
  /** 出勤日の勤務だけ */
  patterns: { id: string; name: string; colorHex: string; defaultRequiredNums: RequiredNumsByDay }[]
}

/**
 * `設定 > 必要人数`（015 §4.1）。
 *
 * セクションの見出しと説明は置かない（`SettingsSection` の `title` 省略 = 枠だけ）。
 * フォーム 1 枚のページなので、ページの見出しと説明がそのままセクションの見出しになる。
 */
export function RequiredNumsSettingsClient({ tenantId, patterns }: Props) {
  const [matrix, setMatrix] = useState(() => toMatrix(patterns))
  // 「全部同じ」または「全部空」なら 1 列で始める。曜日差があれば曜日ごと（015 §3.5）
  const [uniform, setUniform] = useState(() => isUniform(toMatrix(patterns)))
  const [error, setError] = useState<string>()
  const [isSaving, startSave] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startSave(async () => {
      const result = await saveDefaultRequiredNums({ tenantId, nums: toSavePayload(matrix) })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(undefined)
      notifications.show({ message: '必要人数を保存しました', color: 'green' })
    })
  }

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>必要人数</Title>
        <Text size="sm" c="dimmed">
          曜日ごとに、1 日に何人入ってほしいかを決めます。シフト表の下の「配置 / 必要人数」と AI
          シフト作成がこの人数を見ます。
        </Text>
      </Stack>

      <FormErrorAlert message={error} />

      {patterns.length === 0 ? (
        <SettingsSection>
          <Text size="sm" c="dimmed">
            出勤日の勤務がありません。先に
            <Anchor component={Link} href={`/tenants/${tenantId}/settings/patterns`} size="sm">
              勤務パターン
            </Anchor>
            を登録してください。
          </Text>
        </SettingsSection>
      ) : (
        <form onSubmit={submit}>
          <SettingsSection
            footer={
              <Button type="submit" loading={isSaving}>
                保存
              </Button>
            }
          >
            <Stack gap="md">
              <RequiredNumsMatrix
                patterns={patterns}
                value={matrix}
                onChange={setMatrix}
                uniform={uniform}
                onUniformChange={setUniform}
                disabled={isSaving}
              />
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  人が要らない曜日は「0」を入力します。人数が未定の場合は空欄にしてください。
                </Text>
                <Text size="sm" c="dimmed">
                  ここで設定した内容は、シフト表画面で日毎に上書きできます。
                </Text>
              </Stack>
            </Stack>
          </SettingsSection>
        </form>
      )}
    </Stack>
  )
}

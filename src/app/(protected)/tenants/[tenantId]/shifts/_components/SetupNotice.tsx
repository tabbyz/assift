'use client'

import Link from 'next/link'
import { Alert, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconCheck, IconExclamationCircle } from '@tabler/icons-react'

type Props = { tenantId: string; hasPattern: boolean; hasStaff: boolean }

/**
 * 勤務パターン / スタッフが無いときの案内（v1 `shifts/_tutorial.html.slim` の文言）。
 * 表は空のまま描き、その上にこれを出す。
 */
export function SetupNotice({ tenantId, hasPattern, hasStaff }: Props) {
  const steps = [
    {
      done: hasPattern,
      step: 'STEP1',
      label: '勤務パターン',
      href: `/tenants/${tenantId}/settings/patterns`,
    },
    {
      done: hasStaff,
      step: 'STEP2',
      label: 'スタッフ',
      href: `/tenants/${tenantId}/settings/staffs`,
    },
  ]

  return (
    <Stack gap="xs" px={8} pb="sm">
      <Alert variant="light" color="gray" icon={<IconExclamationCircle size={16} />} p="xs">
        <Text size="sm">初期設定を完了してください。</Text>
      </Alert>

      {steps.map((step) => (
        <UnstyledButton key={step.step} component={Link} href={step.href}>
          <Paper withBorder p="sm" bg="var(--mantine-color-gray-light)">
            <Group justify="space-between">
              <Text size="sm">
                <b>{step.step}</b> クリックして<b>{step.label}</b>を登録
              </Text>
              {step.done && <IconCheck size={18} />}
            </Group>
          </Paper>
        </UnstyledButton>
      ))}
    </Stack>
  )
}

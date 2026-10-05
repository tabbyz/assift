'use client'

import Link from 'next/link'
import {
  Anchor,
  Group,
  Menu,
  MenuDropdown,
  MenuLabel,
  MenuTarget,
  Progress,
  Stack,
  Text,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { IconUserCircle } from '@tabler/icons-react'
import { LogoutMenuItem } from '@/components/LogoutMenuItem'
import { TenantSwitcher } from '@/components/TenantSwitcher'
import type { TenantListItem, TenantSummary } from '@/lib/queries/tenants'

type Props = {
  /** 1〜3。完成・「ここまで保存しました」では null（進み具合を出さない） */
  step: 1 | 2 | 3 | null
  /** 店舗ができたあと（/setup）。店舗切替に出す */
  tenant: TenantSummary | null
  tenants: TenantListItem[]
  email: string
  /** 「あとで続ける」。ステップ 2・3 だけ渡す */
  onLeave?: () => void
  leaveDisabled?: boolean
}

const STEP_LABELS = ['お店のこと', '勤務の種類', 'スタッフ'] as const

/**
 * 初期設定のヘッダー（014 §5.7）。ウィザードが自分の中に描く（layout はステップを知れないため。§3.7）。
 * 設定・シフト表へのリンクは置かない。店舗切替は店舗が 2 つ以上のときだけ
 */
export function SetupHeader({ step, tenant, tenants, email, onLeave, leaveDisabled }: Props) {
  return (
    <Stack
      component="header"
      gap={6}
      px="md"
      pt={8}
      pb={step ? 12 : 8}
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group justify="space-between" wrap="nowrap" mih={40}>
        <Group gap="xs" wrap="nowrap" miw={0}>
          <UnstyledButton component={Link} href="/tenants">
            <Text fw={700} size="sm">
              assift
            </Text>
          </UnstyledButton>
          {tenant && tenants.length > 1 ? (
            <TenantSwitcher tenant={tenant} tenants={tenants} />
          ) : (
            <Text size="sm" c="dimmed">
              かんたん設定
            </Text>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          {onLeave && (
            <Anchor
              component="button"
              type="button"
              size="sm"
              onClick={onLeave}
              disabled={leaveDisabled}
              mih={40}
            >
              あとで続ける
            </Anchor>
          )}
          <Menu position="bottom-end" withinPortal>
            <MenuTarget>
              <UnstyledButton
                aria-label="アカウント"
                p="xs"
                style={{ display: 'flex', lineHeight: 0 }}
              >
                <IconUserCircle size={20} />
              </UnstyledButton>
            </MenuTarget>
            <MenuDropdown>
              <MenuLabel>{email}</MenuLabel>
              <LogoutMenuItem />
            </MenuDropdown>
          </Menu>
        </Group>
      </Group>

      {step && (
        <Stack gap={4}>
          <VisuallyHidden>{`3 つのうち ${step} つ目: ${STEP_LABELS[step - 1]}`}</VisuallyHidden>
          <Group grow gap={6}>
            {STEP_LABELS.map((label, i) => (
              <Progress key={label} value={i < step ? 100 : 0} size={6} color="dark" aria-hidden />
            ))}
          </Group>
          <Group grow gap={6} aria-hidden>
            {STEP_LABELS.map((label, i) => (
              <Text
                key={label}
                size="xs"
                c={i + 1 === step ? undefined : 'dimmed'}
                fw={i + 1 === step ? 700 : 400}
              >
                {label}
              </Text>
            ))}
          </Group>
        </Stack>
      )}
    </Stack>
  )
}

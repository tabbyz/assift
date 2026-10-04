'use client'

import type { RefObject } from 'react'
import Link from 'next/link'
import { Anchor, Button, List, ListItem, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconCheck, IconDeviceFloppy } from '@tabler/icons-react'
import type { TenantListItem } from '@/lib/queries/tenants'
import classes from './Setup.module.css'

type DoneProps = {
  storeName: string
  patternCount: number
  staffCount: number
  onOpen: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
}

/** 完成（014 §4.4） */
export function SetupDone({ storeName, patternCount, staffCount, onOpen, headingRef }: DoneProps) {
  return (
    <Stack gap="lg" align="center" ta="center" pt="lg">
      <ThemeIcon size={64} radius={32} color="green" variant="light">
        <IconCheck size={36} stroke={2.5} />
      </ThemeIcon>
      <Title order={2} fz={24} ref={headingRef} tabIndex={-1} className={classes.heading}>
        準備ができました
      </Title>
      <Text>
        {storeName}のシフト表を、勤務 {patternCount} 種類・スタッフ {staffCount} 人で用意しました。
      </Text>
      <Paper withBorder p="md" ta="left" w="100%">
        <Stack gap={6}>
          <Text fw={700}>このあと、必要になったらお聞きすること</Text>
          <List size="sm">
            <ListItem>何人ずつ必要か（AI でシフトを作るとき）</ListItem>
          </List>
          <Text size="sm" c="dimmed">
            働ける曜日や週に何日までかは、スタッフの画面でいつでも設定できます。
          </Text>
        </Stack>
      </Paper>
      <Button size="lg" fullWidth onClick={onOpen}>
        シフト表をひらく
      </Button>
    </Stack>
  )
}

type PausedProps = {
  /** 保存済みのステップ（1 = 店舗だけ、2 = 勤務まで） */
  savedThrough: 1 | 2
  storeName: string
  patternCount: number
  /** ほかの店舗（自分以外） */
  otherTenants: TenantListItem[]
  onContinue: () => void
  onDelete: () => void
  deleting: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
}

/** 「あとで続ける」を押したあと（014 §4.5） */
export function SetupPaused({
  savedThrough,
  storeName,
  patternCount,
  otherTenants,
  onContinue,
  onDelete,
  deleting,
  headingRef,
}: PausedProps) {
  const items = [
    { label: `お店のこと（${storeName}）`, done: true },
    {
      label: savedThrough >= 2 ? `勤務の種類（${patternCount}種類）` : '勤務の種類　← 次はここから',
      done: savedThrough >= 2,
    },
    { label: savedThrough >= 2 ? 'スタッフ　← 次はここから' : 'スタッフ', done: false },
  ]
  return (
    <Stack gap="lg" pt="md">
      <Stack gap="xs" align="center" ta="center">
        <ThemeIcon size={56} radius={28} color="gray" variant="light">
          <IconDeviceFloppy size={30} />
        </ThemeIcon>
        <Title order={2} fz={22} ref={headingRef} tabIndex={-1} className={classes.heading}>
          ここまで保存しました
        </Title>
        <Text c="dimmed">
          次にassiftを開くと、続きから始まります。ほかの端末から開いても大丈夫です。
        </Text>
      </Stack>

      <Paper withBorder p="md">
        <List spacing={6} listStyleType="none">
          {items.map((item) => (
            <ListItem
              key={item.label}
              icon={
                <ThemeIcon
                  size={22}
                  radius="sm"
                  color={item.done ? 'dark' : 'gray'}
                  variant={item.done ? 'filled' : 'outline'}
                >
                  {item.done ? <IconCheck size={14} stroke={3} /> : <span />}
                </ThemeIcon>
              }
            >
              {item.label}
            </ListItem>
          ))}
        </List>
      </Paper>

      <Button size="md" variant="default" onClick={onContinue}>
        このまま続ける
      </Button>

      {otherTenants.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            ほかの店舗を開く
          </Text>
          {otherTenants.map((tenant) => (
            // 先読みすると proxy が「その店舗を開いた」と記録してしまう（005 §3.3）
            <Anchor
              key={tenant.id}
              component={Link}
              href={`/tenants/${tenant.id}`}
              prefetch={false}
              size="sm"
            >
              {tenant.name}
              {!tenant.ready && '（準備中）'}
            </Anchor>
          ))}
        </Stack>
      )}

      <DeleteStoreLink onDelete={onDelete} deleting={deleting} />
    </Stack>
  )
}

/** 準備中の店舗を消す口。設定画面はガードで開けないので、ここでしか消せない（014 §4.5） */
export function DeleteStoreLink({
  onDelete,
  deleting,
}: {
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <Text size="sm" ta="center" pt="md">
      <Anchor component="button" type="button" c="red" onClick={onDelete} disabled={deleting}>
        この店舗を削除する
      </Anchor>
    </Text>
  )
}

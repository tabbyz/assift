'use client'

import type { RefObject } from 'react'
import { Alert, List, ListItem, Stack, Text, Textarea, Title } from '@mantine/core'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { type ParsedStaffNames, SETUP_STAFFS_MAX } from '@/lib/setup/parseStaffNames'
import { STAFF_NAME_MAX_LENGTH } from '@/lib/validation/staffs'
import classes from './Setup.module.css'

type Props = {
  text: string
  onChange: (text: string) => void
  parsed: ParsedStaffNames
  headingRef: RefObject<HTMLHeadingElement | null>
}

/** 初期設定のステップ 3: スタッフ（014 §4.3）。入力中の名前はどこにも保存しない（§3.3） */
export function StaffStep({ text, onChange, parsed, headingRef }: Props) {
  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <Title order={2} fz={22} ref={headingRef} tabIndex={-1} className={classes.heading}>
          働く人の名前を入れてください
        </Title>
        <Text c="dimmed">
          <b>1行に1人</b>ずつ。LINE や Excel からまとめて貼り付けてもOKです。
        </Text>
      </Stack>

      <Stack gap={6}>
        <Textarea
          label="スタッフの名前"
          placeholder={'山田 花子\n佐藤 健\n鈴木 美咲'}
          value={text}
          onChange={(event) => onChange(event.currentTarget.value)}
          autosize
          minRows={6}
          maxRows={14}
          size="md"
          autoFocus
        />
        <Text aria-live="polite">
          <Text span fz={22} fw={700}>
            {parsed.names.length}
          </Text>{' '}
          人
        </Text>
      </Stack>

      {parsed.errors.length > 0 && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={18} />}
          title={`${STAFF_NAME_MAX_LENGTH}文字を超える名前があります`}
        >
          <List size="sm">
            {parsed.errors.map((error) => (
              <ListItem key={error.line}>
                {error.line}行目「{error.name}」
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      {parsed.tooMany && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
          一度に入れられるのは{SETUP_STAFFS_MAX}人までです。{SETUP_STAFFS_MAX}
          人ずつ入れて、残りはあとでスタッフの画面から足してください。
        </Alert>
      )}

      {/* 同じ名前は止めない（佐藤さんが 2 人いる店もある）。注意だけ出す（014 §4.3） */}
      {parsed.duplicates.length > 0 && (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle size={18} />}>
          <Stack gap={4}>
            {parsed.duplicates.map((duplicate) => (
              <Text key={duplicate.name} size="sm">
                同じ名前「{duplicate.name}」が{duplicate.lines.length}人います（
                {duplicate.lines.join('・')}行目）。
              </Text>
            ))}
            <Text size="sm">区別がつくように直すのがおすすめです。このままでも進めます。</Text>
          </Stack>
        </Alert>
      )}

      <Text size="sm" c="dimmed">
        「土日は入れない」などの条件は、スタッフの画面でいつでも設定できます。
      </Text>
    </Stack>
  )
}

import { Alert, Stack, Text } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { listPatterns } from '@/lib/queries/patterns'
import { PatternForm } from '../../settings/patterns/_components/PatternForm'

export default async function TutorialPatternPage({
  params,
}: PageProps<'/tenants/[tenantId]/tutorial/pattern'>) {
  const { tenantId } = await params
  const patterns = await listPatterns(tenantId)

  return (
    <Stack gap="lg">
      <Alert color="teal" variant="light">
        {patterns.length === 0 ? (
          <Stack gap="xs">
            <Text>はじめにあなたの店舗の勤務パターンを登録しましょう。</Text>
            <Text size="sm">
              <b>早番</b>、<b>日勤</b>、<b>有給</b>
              など、いま使用しているシフト表の形式にあわせて自由に登録できます。（あとで追加/編集もできます）
            </Text>
          </Stack>
        ) : (
          <Stack gap="xs" align="flex-start">
            <Text size="sm">登録済みのパターン（あとで編集できます）</Text>
            <Text fw={700}>{patterns.map((pattern) => pattern.name).join('、')}</Text>
            <Text size="sm">ひと通り追加したら次へ進みましょう。</Text>
            <LinkButton href={`/tenants/${tenantId}/tutorial/staff`} color="teal" mt="xs">
              次のSTEPへ
            </LinkButton>
          </Stack>
        )}
      </Alert>

      <PatternForm tenantId={tenantId} />
    </Stack>
  )
}

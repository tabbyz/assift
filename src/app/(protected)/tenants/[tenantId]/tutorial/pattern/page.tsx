import { notFound } from 'next/navigation'
import { Alert, Stack, Text } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { listPatterns } from '@/lib/queries/patterns'
import { isUuid } from '@/utils/uuid'
import { PatternForm } from '../../settings/patterns/_components/PatternForm'

export default async function TutorialPatternPage({
  params,
}: PageProps<'/tenants/[tenantId]/tutorial/pattern'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を throw する（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const patterns = await listPatterns(tenantId)

  return (
    <Stack gap="lg">
      <Alert color="gray" variant="light">
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
            <LinkButton href={`/tenants/${tenantId}/tutorial/staff`} mt="xs">
              次のSTEPへ
            </LinkButton>
          </Stack>
        )}
      </Alert>

      {/* 設定画面と同じフォーム（v1 もチュートリアルで settings の _form を使い回していた。006 §3.5） */}
      <PatternForm
        tenantId={tenantId}
        pairOptions={patterns.map((pattern) => ({ value: pattern.id, label: pattern.name }))}
        afterCreate="reset"
      />
    </Stack>
  )
}

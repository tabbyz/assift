import { Alert, Card, Stack, Text } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'
import {
  RESTRICTION_KINDS,
  RESTRICTION_KIND_DESCRIPTIONS,
  RESTRICTION_KIND_EXAMPLES,
  RESTRICTION_KIND_LABELS,
  requiresWorkdayPattern,
} from '@/lib/restrictions/kinds'

type Props = {
  tenantId: string
  /** 出勤日の勤務パターン件数。0 件だとパターンを選ぶ種別は登録できない（006 §3.7） */
  workdayPatternCount: number
}

/** v1 の select_kind。4 種類をカードで並べる */
export function KindSelector({ tenantId, workdayPatternCount }: Props) {
  const hasWorkdayPattern = workdayPatternCount > 0

  return (
    <Stack gap="md">
      {!hasWorkdayPattern && (
        <Alert color="yellow" variant="light">
          出勤日の勤務パターンを先に登録してください。
        </Alert>
      )}

      {RESTRICTION_KINDS.map((kind) => {
        const disabled = requiresWorkdayPattern(kind) && !hasWorkdayPattern
        const example = RESTRICTION_KIND_EXAMPLES[kind]

        return (
          <Card key={kind} withBorder padding="md" opacity={disabled ? 0.5 : undefined}>
            <Stack gap={4}>
              {disabled ? (
                <Text fw={700} c="dimmed">
                  {RESTRICTION_KIND_LABELS[kind]}
                </Text>
              ) : (
                <LinkAnchor
                  href={`/tenants/${tenantId}/settings/restrictions/new?kind=${kind}`}
                  fw={700}
                >
                  {RESTRICTION_KIND_LABELS[kind]}
                </LinkAnchor>
              )}
              <Text size="sm">{RESTRICTION_KIND_DESCRIPTIONS[kind]}</Text>
              {example && (
                <Text size="xs" c="dimmed">
                  {example}
                </Text>
              )}
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}

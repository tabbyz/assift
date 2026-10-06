import { Stack, Text, Title } from '@mantine/core'
import { Phrases } from './Phrases'
import classes from '../Site.module.css'

type Props = {
  kicker: string
  /** `Phrases` の書式（`|` で文節、`\n` で改行） */
  title: string
  description?: string
  /** 下の余白。既定はセクションの本体との間（52px） */
  mb?: number
}

/** セクションの見出し（小さなラベル + 見出し + 説明） */
export function SectionHeading({ kicker, title, description, mb = 52 }: Props) {
  return (
    <Stack gap={14} maw="36em" mb={mb}>
      <Text className={classes.kicker}>{kicker}</Text>
      <Title order={2} className={classes.sectionTitle}>
        <Phrases>{title}</Phrases>
      </Title>
      {description && (
        <Text c="dimmed" fz={16}>
          {description}
        </Text>
      )}
    </Stack>
  )
}

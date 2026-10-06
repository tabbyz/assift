import { Container, Group, Text, Title } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'
import { Phrases } from './Phrases'
import { Stamp } from './Stamp'
import classes from '../Site.module.css'

/** ヒーロー。見出しは 2 行固定（016 §4.4）。右のスタンプは広い画面だけ */
export function Hero() {
  return (
    <section className={classes.hero}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }} pos="relative">
        <Title order={1} className={classes.heroTitle}>
          <span className={classes.heroLine}>シフト表づくりに、</span>
          <span className={classes.heroLine}>もう時間はかけない。</span>
        </Title>
        <Text className={classes.lead} mt={26}>
          <Phrases>
            {
              'スタッフの都合や|勤務の上限を守って、|AIが下書きを作ります。\nあとは内容を確認して、|URLで送るだけ。'
            }
          </Phrases>
        </Text>
        <Group gap="md" mt={36}>
          <LinkButton
            href="/signup"
            size="lg"
            radius="xl"
            rightSection={<IconArrowRight size={18} stroke={2.4} />}
          >
            無料ではじめる
          </LinkButton>
          <Text className={classes.micro}>
            スタッフ{FREE_STAFF_LIMIT}人まで無料・クレジットカード不要
          </Text>
        </Group>
        <div className={classes.heroStamps} aria-hidden="true">
          <Stamp patternId="late" size="lg" floating />
          <Stamp patternId="early" fixed size="lg" floating />
          <Stamp patternId="off" fixed size="lg" floating />
          <Stamp patternId="paid" fixed size="lg" floating />
        </div>
      </Container>
    </section>
  )
}

import { Container, Group, Text, Title } from '@mantine/core'
import { IconArrowDown, IconArrowRight } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'
import { DEMO_ID } from '../_lib/sectionIds'
import { Phrases } from './Phrases'
import classes from '../Site.module.css'

/** ヒーロー。中央寄せ（016 §15）で、すぐ下のデモまでを 1 つの塊に見せる。見出しは狭い画面で 2 行・PC で 1 行（016 §4.4・§16） */
export function Hero() {
  return (
    <section className={classes.hero}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <a href="#price" className={classes.badge}>
          スタッフ{FREE_STAFF_LIMIT}人まで無料・カード登録不要
          <IconArrowRight size={14} stroke={2.2} aria-hidden />
        </a>
        <Title order={1} className={classes.heroTitle}>
          <span className={classes.heroLine}>
            毎月の<span className={classes.kern}>シ</span>
            <span className={classes.kernMore}>フ</span>ト表を
            <span className={classes.kernComma}>、</span>
          </span>
          <span className={classes.heroLine}>最短で。</span>
        </Title>
        <Text className={classes.lead} mt={22}>
          <Phrases>
            {'assift（アシフト）は、|シフト表を効率よく\n作成することだけを|追求したサービスです。'}
          </Phrases>
        </Text>
        <Group gap="sm" mt={32} justify="center">
          <LinkButton
            href="/signup"
            size="lg"
            radius="xl"
            rightSection={<IconArrowRight size={18} stroke={2.4} />}
          >
            無料ではじめる
          </LinkButton>
          <LinkButton
            href={`#${DEMO_ID}`}
            size="lg"
            radius="xl"
            variant="default"
            className={classes.demoButton}
            rightSection={<IconArrowDown size={18} stroke={2.4} />}
          >
            デモをさわる
          </LinkButton>
        </Group>
      </Container>
    </section>
  )
}

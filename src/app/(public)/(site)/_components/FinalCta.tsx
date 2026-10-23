import { Container, Stack, Text, Title } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'
import classes from '../Site.module.css'

/** 最後の CTA。全幅の薄いグレーの帯（016 §14） */
export function FinalCta() {
  return (
    <section className={classes.final}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <Stack gap={28} align="center">
          <Title order={2} className={classes.finalTitle}>
            {/* 文節の組みは Phrases と同じ。「シフト」はヒーローと同じく手で詰める。広い画面では改行しない */}
            <span className={classes.nb}>
              来月の<span className={classes.kern}>シ</span>
              <span className={classes.kernMore}>フ</span>ト表から、
            </span>
            <br className={classes.finalBreak} />
            <span className={classes.nb}>assiftで。</span>
          </Title>
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
        </Stack>
      </Container>
    </section>
  )
}

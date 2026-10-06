import { Container, Group, SimpleGrid, Text, Title } from '@mantine/core'
import { INDUSTRIES, INDUSTRY_LABELS } from '@/lib/setup/templates'
import { Phrases } from './Phrases'
import { SectionHeading } from './SectionHeading'
import classes from '../Site.module.css'

/** はじめ方。初期設定（014）の 3 ステップをそのまま説明する */
export function SetupSteps() {
  return (
    <section className={classes.section}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <SectionHeading
          kicker="はじめ方"
          title="3ステップで、|すぐ使える"
          description="選んだ業種と貼り付けた名前から、最初のシフト表ができあがります。"
        />
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={20}>
          <Step num={1} title="業種を選ぶ">
            <Text c="dimmed" fz={14.5}>
              業種に合った勤務パターンのひな形が入ります。名前や時間はあとで変えられます。
            </Text>
            <Group gap={6} mt={8}>
              {INDUSTRIES.filter((industry) => industry !== 'other').map((industry) => (
                <span key={industry} className={classes.tag} data-active={industry === 'food'}>
                  {INDUSTRY_LABELS[industry]}
                </span>
              ))}
            </Group>
          </Step>
          <Step num={2} title="勤務パターンを|確かめる">
            <Text c="dimmed" fz={14.5}>
              早番・遅番・公休などのひな形を確かめます。夜勤の翌日を「明け」にする組み合わせも、ここで決められます。
            </Text>
          </Step>
          <Step num={3} title="スタッフの名前を|貼り付ける">
            <Text c="dimmed" fz={14.5}>
              メモ帳やスプレッドシートから、名前をまとめて貼り付けられます。1行に1人です。
            </Text>
          </Step>
        </SimpleGrid>
      </Container>
    </section>
  )
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className={`${classes.panel} ${classes.step}`}>
      <span className={classes.stepNum} aria-hidden="true">
        {num}
      </span>
      <Title order={3} fz={19} fw={900} lh={1.4}>
        <Phrases>{title}</Phrases>
      </Title>
      {children}
    </div>
  )
}

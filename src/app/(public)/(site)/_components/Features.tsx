import { Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { Phrases } from './Phrases'
import { SectionHeading } from './SectionHeading'
import { Stamp } from './Stamp'
import classes from '../Site.module.css'

/** できること（4 枚）。図はアイコンではなく、アプリの中にあるもの（マス・充足・AI の結果・共有の URL）で描く */
export function Features() {
  return (
    <section id="features" className={classes.section}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <SectionHeading kicker="できること" title={'シフト表が早く作れる、\n4つのしくみ'} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={20}>
          <FeatureCard
            title="下書きのまま|置いておける"
            body="淡い色は下書き、濃い色は確定。迷っている日は淡い色のまま残しておき、決まったら確定にします。"
          >
            <Stack gap={0} align="center">
              <Stamp patternId="early" />
              <Text className={classes.figureCaption}>下書き</Text>
            </Stack>
            <Text c="dimmed" fz={20} aria-hidden="true">
              →
            </Text>
            <Stack gap={0} align="center">
              <Stamp patternId="early" fixed />
              <Text className={classes.figureCaption}>確定</Text>
            </Stack>
          </FeatureCard>

          <FeatureCard
            title="足りない日が|すぐ分かる"
            body="曜日ごとの必要人数を入れておくと、表の下に「配置 / 必要」が出ます。足りない日は数字が赤くなります。"
          >
            <div className={classes.coverageRow}>
              {['水', '木', '金', '土', '日'].map((day) => (
                <small key={day}>{day}</small>
              ))}
              {['4/4', '4/4', '4/4', '5/5', '4/5'].map((value, i) => (
                <span key={i} className={classes.coverageCell} data-short={i === 4 || undefined}>
                  {value}
                </span>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard
            title="組み合わせは|AIが考える"
            body="出られない曜日や、週に何日まで・何連勤までといった条件を守って、下書きを作ります。埋められなかった枠には理由が付き、ワンタップで元に戻せます。"
          >
            <Stack gap={10} w="100%" maw={330}>
              <Group gap={6} justify="center">
                <Stamp patternId="early" />
                <Stamp patternId="late" />
                <Stamp patternId="early" />
              </Group>
              <div className={classes.aiNote}>
                <Text fz={13} fw={700} lh={1.6}>
                  19 / 20枠を下書きで配置しました
                </Text>
                <Text fz={12.5} c="dimmed" lh={1.6}>
                  日曜の遅番1枠は、条件に合うスタッフがいません
                </Text>
              </div>
            </Stack>
          </FeatureCard>

          <FeatureCard
            title="URLを送るだけで|共有できる"
            body="スタッフは登録なしでスマホから見られます。壁に貼るPDF（A4横）と、給与計算に回すCSVも出せます。"
          >
            <span className={classes.linkPill}>
              <span>https://…/share/7Kq2mWfa</span>
              <span className={classes.linkPillButton}>コピー</span>
            </span>
            <Group gap={8} justify="center" w="100%">
              <span className={classes.fileTag}>PDF</span>
              <span className={classes.fileTag}>CSV</span>
            </Group>
          </FeatureCard>
        </SimpleGrid>
      </Container>
    </section>
  )
}

function FeatureCard({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <div className={`${classes.panel} ${classes.card}`}>
      <Title order={3} className={classes.cardTitle}>
        <Phrases>{title}</Phrases>
      </Title>
      <Text c="dimmed" fz={15}>
        {body}
      </Text>
      <div className={classes.figure} aria-hidden="true">
        {children}
      </div>
    </div>
  )
}

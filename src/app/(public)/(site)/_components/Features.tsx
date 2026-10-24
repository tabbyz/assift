import { Fragment, type CSSProperties } from 'react'
import { Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { cellStyle } from '@/components/shiftTable/cellStyle'
import { DEMO_PATTERNS } from '../_lib/demoData'
import { Phrases } from './Phrases'
import { SectionHeading } from './SectionHeading'
import { Stamp } from './Stamp'
import classes from '../Site.module.css'

/** 曜日ごとのいつもの勤務（2 枚目の図）。いつもの勤務は下書きで入る */
const WEEK_DAYS = ['月', '火', '水', '木', '金']
const WEEK_ROWS: [string, string[]][] = [
  ['佐藤', ['early', 'early', 'off', 'early', 'early']],
  ['鈴木', ['late', 'late', 'late', 'off', 'late']],
  ['高橋', ['off', 'early', 'early', 'late', 'off']],
]

/**
 * 同じシフト表を PC とスマホで（3 枚目の図）。マスは文字を入れない色の帯。
 * スマホは PC の左 4 日を写すので、同じ表に見える
 */
const DEVICE_ROWS: [string, boolean][][] = [
  [
    ['early', true],
    ['early', true],
    ['off', true],
    ['late', true],
    ['late', true],
    ['early', true],
    ['off', true],
  ],
  [
    ['late', false],
    ['off', true],
    ['early', false],
    ['off', true],
    ['early', false],
    ['late', false],
    ['late', true],
  ],
  [
    ['off', true],
    ['late', false],
    ['paid', true],
    ['early', false],
    ['early', true],
    ['off', true],
    ['early', true],
  ],
  [
    ['late', true],
    ['early', true],
    ['late', true],
    ['off', true],
    ['late', true],
    ['late', false],
    ['off', true],
  ],
  [
    ['early', false],
    ['late', true],
    ['early', false],
    ['late', true],
    ['off', true],
    ['early', true],
    ['late', false],
  ],
]

const patternsById = new Map(DEMO_PATTERNS.map((p) => [p.id, p]))

/**
 * できること（4 枚。016 §26）。AI は 1 枚にまとめ、ほかは「まとめて入る → どこでも作れる → 送るだけ」。
 * 図はアイコンではなく、アプリの中にあるもの（マス・AI の結果・共有の URL）で描く
 */
export function Features() {
  return (
    <section id="features" className={classes.section}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <SectionHeading kicker="できること" title={'シフト表が早く作れる、\n4つのしくみ'} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={20}>
          <FeatureCard
            title="組み合わせは|AIが考える"
            body="出られない曜日や、週に何日まで・何連勤までといった条件を守って、下書きを作ります。「田中さんは土日に多めに」のような指示も、日本語でそのまま書けます。"
          >
            <Stack gap={10} w="100%" maw={330}>
              <div className={classes.aiPrompt}>
                <Text fz={11} fw={700} c="dimmed" lh={1.5}>
                  AIへの指示
                </Text>
                <Text fz={13} lh={1.5}>
                  田中さんは土日に多めに。
                </Text>
              </div>
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
            title="いつものシフトは|まとめて入る"
            body="スタッフごとに曜日のいつもの勤務を決めておけば、空いている日にまとめて入ります。前の期間のシフトを、そのままコピーすることもできます。"
          >
            <Stack gap={0} align="center" w="100%">
              <div className={classes.weekGrid}>
                <span />
                {WEEK_DAYS.map((day) => (
                  <small key={day}>{day}</small>
                ))}
                {WEEK_ROWS.map(([name, cells]) => (
                  <Fragment key={name}>
                    <b>{name}</b>
                    {cells.map((patternId, i) => (
                      <Stamp key={i} patternId={patternId} />
                    ))}
                  </Fragment>
                ))}
              </div>
              <Text className={classes.figureCaption}>曜日ごとのいつもの勤務が、まとめて入る</Text>
            </Stack>
          </FeatureCard>

          <FeatureCard
            title="スマホでも|PCでも作れる"
            body="同じシフト表を、どちらからでも直せます。すき間時間はスマホで、じっくり作るときはPCで。"
          >
            <div className={classes.devices}>
              <div className={classes.laptop}>
                <div className={classes.laptopScreen}>
                  <MiniTable rows={DEVICE_ROWS} />
                </div>
                <div className={classes.laptopBase} />
              </div>
              <div className={classes.phoneMini}>
                <MiniTable rows={DEVICE_ROWS.map((row) => row.slice(0, 4))} />
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            title="URLを送るだけで|共有できる"
            body="スタッフは登録なしでスマホから見られます。PDFとCSVでエクスポートもできます。"
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

/** 3 枚目の図の表。色はアプリのセルと同じ `cellStyle()`（確定はベタ塗り、下書きは淡塗り） */
function MiniTable({ rows }: { rows: [string, boolean][][] }) {
  return (
    <div className={classes.miniTable} style={{ '--cols': rows[0].length } as CSSProperties}>
      {rows.flatMap((row, r) =>
        row.map(([patternId, fixed], c) => (
          <span key={`${r}-${c}`} style={cellStyle(patternsById.get(patternId), fixed)} />
        ))
      )}
    </div>
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

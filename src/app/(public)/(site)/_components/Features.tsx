import { Fragment } from 'react'
import { Container, Group, SimpleGrid, Text, Title } from '@mantine/core'
import { IconDeviceLaptop, IconDeviceMobile, IconSparkles } from '@tabler/icons-react'
import { cellStyle } from '@/components/shiftTable/cellStyle'
import { DEMO_PATTERNS } from '../_lib/demoData'
import { Phrases } from './Phrases'
import { SectionHeading } from './SectionHeading'
import { Stamp } from './Stamp'
import classes from '../Site.module.css'

const patternsById = new Map(DEMO_PATTERNS.map((p) => [p.id, p]))

/** AI への指示が効いた 1 週間（1 枚目の図）。AI が入れるのは下書き */
const AI_DAYS = ['月', '火', '水', '木', '金', '土', '日']
const AI_ROWS: [string, string[]][] = [
  ['田中', ['off', 'early', 'off', 'off', 'late', 'early', 'late']],
  ['佐藤', ['early', 'off', 'late', 'early', 'paid', 'off', 'early']],
  ['鈴木', ['late', 'late', 'early', 'paid', 'early', 'late', 'off']],
]

/**
 * スタッフのいつもの勤務（2 枚目の図。016 §29）。シフト表の絵が続くので、ここはスタッフのカードにする。
 * 曜日の並びは `AI_DAYS` と同じ月〜日
 */
const USUAL_WEEK = ['early', 'early', 'off', 'late', 'late', 'early', 'off']
const USUAL_WORKDAYS = USUAL_WEEK.filter((id) => patternsById.get(id)?.kind === 'workday').length

/**
 * できること（4 枚。016 §26）。AI は 1 枚にまとめ、ほかは「一度決めるだけ → どこでも作れる → 送るだけ」。
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
            body="出られない曜日や、週に何日まで・何連勤までといった条件を守って、下書きを作ります。「田中さんは土日を多めに」のような指示も、日本語でそのまま書けます。"
          >
            {/* 指示の札は土日の列の上に添え、札の先で土日を指す。指示が効いたマス（田中さんの土日）は枠で囲む（016 §28） */}
            <div className={classes.aiTable}>
              <span className={classes.aiTag}>
                <IconSparkles size={13} stroke={2.2} />
                田中さんは土日を多めに。
              </span>
              <span className={classes.aiTagTip} />
              <span />
              {AI_DAYS.map((day) => (
                <small
                  key={day}
                  data-tone={day === '土' ? 'saturday' : day === '日' ? 'holiday' : undefined}
                >
                  {day}
                </small>
              ))}
              {AI_ROWS.map(([name, cells]) => (
                <Fragment key={name}>
                  <b>{name}</b>
                  {cells.map((patternId, i) => (
                    <span
                      key={i}
                      className={classes.aiCell}
                      data-hit={(name === '田中' && i >= 5) || undefined}
                    >
                      <Stamp patternId={patternId} />
                    </span>
                  ))}
                </Fragment>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard
            title="固定のシフトは|一度決めるだけ"
            body="スタッフごとに曜日のいつもの勤務を決めておけば、空いている日にまとめて入ります。前の期間のシフトを、そのままコピーすることもできます。"
          >
            <div className={classes.staffCard}>
              <div className={classes.staffCardHead}>
                <span
                  className={classes.avatar}
                  style={cellStyle(patternsById.get('early'), false)}
                >
                  佐
                </span>
                <div>
                  <b>佐藤さん</b>
                  <small>いつもの勤務</small>
                </div>
                <span className={classes.staffCardDays}>週{USUAL_WORKDAYS}日</span>
              </div>
              <div className={classes.staffCardWeek}>
                {USUAL_WEEK.map((patternId, i) => (
                  <div key={i}>
                    <small data-tone={i === 5 ? 'saturday' : i === 6 ? 'holiday' : undefined}>
                      {AI_DAYS[i]}
                    </small>
                    <Stamp patternId={patternId} />
                  </div>
                ))}
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            title="スマホでも|PCでも作れる"
            body="同じシフト表を、スマホからでもPCからでも直せます。スマホでも使える機能はPCと同じです。"
          >
            {/* 白い枠を左右に分け、使う場面を 1 つずつ置く（016 §30）。図の幅が狭いときだけ文言を折り返す（.halves のコンテナクエリ） */}
            <div className={classes.halves}>
              <div className={classes.half}>
                <IconDeviceMobile size={56} stroke={1.4} />
                <span className={classes.halfLabel}>
                  すき間時間は
                  <br />
                  スマホで
                  <small>
                    休憩中に
                    <br />
                    1マスだけ直す
                  </small>
                </span>
              </div>
              <div className={classes.half}>
                <IconDeviceLaptop size={56} stroke={1.4} />
                <span className={classes.halfLabel}>
                  じっくりは
                  <br />
                  PCで
                  <small>
                    閉店後に
                    <br />
                    1か月分を組む
                  </small>
                </span>
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

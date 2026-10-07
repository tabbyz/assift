import { Container, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { dayOfMonth, formatMonthDay, wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { cellStyle } from '@/components/shiftTable/cellStyle'
import { DEMO_PATTERNS, DEMO_STORE_NAME } from '../_lib/demoData'
import { STAFF_VIEW_ID } from '../_lib/sectionIds'
import { SectionHeading } from './SectionHeading'
import { Stamp } from './Stamp'
import classes from '../Site.module.css'

const POINTS = [
  { title: 'アプリも登録も要りません', body: 'スマホのブラウザで開けます。' },
  { title: 'いつ開いても最新の表', body: '直したシフトも、同じリンクにそのまま反映されます。' },
  { title: 'リンクには公開期限があります', body: '古い表がいつまでも残りません。' },
]

const ROWS: [string, string[]][] = [
  ['佐藤', ['late', 'late', 'early', 'off']],
  ['鈴木', ['off', 'early', 'late', 'late']],
  ['高橋', ['early', 'early', 'off', 'early']],
  ['田中', ['late', 'off', 'late', 'early']],
  ['渡辺', ['early', 'late', 'paid', 'late']],
]

const patternsById = new Map(DEMO_PATTERNS.map((p) => [p.id, p]))

type Props = {
  /** スマホの画面の例に出す 4 日（デモの週の木〜日） */
  dates: string[]
  holidays: string[]
}

function dateLabel(date: string): string {
  return `${formatMonthDay(date)}（${WEEKDAY_LABELS[wday(date)]}）`
}

/** 曜日の色はアプリのヘッダーと同じ（日曜・祝日は赤、土曜は青） */
function tone(date: string, holidays: Set<string>): string | undefined {
  if (holidays.has(date) || wday(date) === 0) return 'holiday'
  if (wday(date) === 6) return 'saturday'
  return undefined
}

/** スタッフの画面（共有ページ）の説明と、スマホの枠に入れた例（静的な絵） */
export function StaffView({ dates, holidays }: Props) {
  const holidaySet = new Set(holidays)
  return (
    <section
      id={STAFF_VIEW_ID}
      className={classes.section}
      // デモの共有カードから送られてくる。sticky のヘッダーに見出しが隠れないようにずらす
      style={{ scrollMarginTop: 'var(--site-anchor-offset)' }}
    >
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={20}>
          <Stack justify="center" gap={0} pr={{ md: 24 }}>
            <SectionHeading
              kicker="スタッフの画面"
              title={'スタッフは、\nリンクを開くだけ'}
              description="LINEのグループにURLを貼れば、全員が同じ表を見られます。"
              mb={28}
            />
            <Stack gap={16}>
              {POINTS.map((point) => (
                <Group key={point.title} gap={12} wrap="nowrap" align="flex-start">
                  <span className={classes.checkDot} aria-hidden="true">
                    <IconCheck size={14} stroke={3} />
                  </span>
                  <div>
                    <Text fw={700} fz={15}>
                      {point.title}
                    </Text>
                    <Text c="dimmed" fz={15}>
                      {point.body}
                    </Text>
                  </div>
                </Group>
              ))}
            </Stack>
          </Stack>

          <div className={`${classes.panel} ${classes.staffArt}`}>
            <Stamp patternId="late" fixed floating />
            <Stamp patternId="early" floating />
            <div className={classes.phone} role="img" aria-label="スタッフが開く共有ページの例">
              <div className={classes.phoneScreen}>
                <div className={classes.phoneHead}>
                  <Text fz={11} c="dimmed">
                    {DEMO_STORE_NAME}
                  </Text>
                  <Text fz={15} fw={700} c="black">
                    {dateLabel(dates[0])}〜{dateLabel(dates[dates.length - 1])}
                  </Text>
                </div>
                <div className={classes.phoneRow} data-head="true">
                  <span />
                  {dates.map((date) => (
                    <span key={date} data-tone={tone(date, holidaySet)}>
                      {WEEKDAY_LABELS[wday(date)]}
                      <b>{dayOfMonth(date)}</b>
                    </span>
                  ))}
                </div>
                {ROWS.map(([name, cells]) => (
                  <div key={name} className={classes.phoneRow}>
                    <Text component="span" fz={12} fw={600} c="black">
                      {name}
                    </Text>
                    {cells.map((patternId, i) => {
                      const pattern = patternsById.get(patternId)
                      return (
                        <span
                          key={i}
                          className={classes.phoneCell}
                          style={cellStyle(pattern, true)}
                        >
                          {pattern?.name}
                        </span>
                      )
                    })}
                  </div>
                ))}
                <div className={classes.phoneFoot}>早番 9-17時・遅番 17-23時</div>
              </div>
            </div>
          </div>
        </SimpleGrid>
      </Container>
    </section>
  )
}

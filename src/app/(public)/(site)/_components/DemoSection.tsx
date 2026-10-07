import { Container, Group, Text, Title } from '@mantine/core'
import { IconHandFinger } from '@tabler/icons-react'
import { Phrases } from './Phrases'
import { ShiftDemo } from './ShiftDemo'
import classes from '../Site.module.css'

type Props = { dates: string[]; holidays: string[]; title: string }

/**
 * 触れるデモの面（薄いグレーのトレー）。中身は `ShiftDemo`。
 * 上の見出しは塗らない（016 §7）。黒い塗りのラベルは「AIで作成」と同じ見た目になり、押せそうに見えた
 */
export function DemoSection({ dates, holidays, title }: Props) {
  return (
    <section className={classes.section} aria-labelledby="demo-title">
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <div className={`${classes.panel} ${classes.tray}`}>
          <div className={classes.trayHead}>
            <Group gap={6} className={classes.kicker}>
              <IconHandFinger size={17} stroke={1.8} aria-hidden />
              さわれるデモ
            </Group>
            <Title order={2} id="demo-title" className={classes.trayTitle}>
              <Phrases>来週のシフト表を、|ここで|作ってみてください</Phrases>
            </Title>
            <Text c="dimmed" fz={14.5} lh={1.75}>
              <Phrases>
                マスを押すと|勤務を入れられます。|「AIで作成」で|空いた枠を|埋められます。
              </Phrases>
            </Text>
          </div>
          <ShiftDemo dates={dates} holidays={holidays} title={title} />
        </div>
      </Container>
    </section>
  )
}

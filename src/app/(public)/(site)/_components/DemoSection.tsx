import { Container } from '@mantine/core'
import { ShiftDemo } from './ShiftDemo'
import classes from '../Site.module.css'

type Props = { dates: string[]; holidays: string[]; title: string }

/**
 * 触れるデモの節。中身は `ShiftDemo`（ブラウザのウィンドウ風の枠。016 §15）。後ろに薄い方眼を敷く。
 * 「さわれるデモ」は枠の上辺に触る前だけ出す（`ShiftDemo`。016 §24）。読み上げには節の名前で伝える
 */
export function DemoSection({ dates, holidays, title }: Props) {
  return (
    <section className={classes.demoStage} aria-label="さわれるデモ">
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <ShiftDemo dates={dates} holidays={holidays} title={title} />
      </Container>
    </section>
  )
}

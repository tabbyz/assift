import { Container } from '@mantine/core'
import { ShiftDemo } from './ShiftDemo'
import classes from '../Site.module.css'

type Props = { dates: string[]; holidays: string[]; title: string }

/** 触れるデモの面（薄いグレーのトレー）。中身は `ShiftDemo` */
export function DemoSection({ dates, holidays, title }: Props) {
  return (
    <section className={classes.section} aria-label="シフト表のデモ">
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <div className={`${classes.panel} ${classes.tray}`}>
          <span className={classes.trayTag}>さわって試せます</span>
          <ShiftDemo dates={dates} holidays={holidays} title={title} />
          <p className={classes.trayNote}>デモ用のデータです。保存されません</p>
        </div>
      </Container>
    </section>
  )
}

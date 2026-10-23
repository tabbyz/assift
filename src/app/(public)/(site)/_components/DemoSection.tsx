import { Container, Group } from '@mantine/core'
import { IconHandFinger } from '@tabler/icons-react'
import { DEMO_ID } from '../_lib/sectionIds'
import { ShiftDemo } from './ShiftDemo'
import classes from '../Site.module.css'

type Props = { dates: string[]; holidays: string[]; title: string }

/**
 * 触れるデモの節。中身は `ShiftDemo`（ブラウザのウィンドウ風の枠。016 §15）。後ろに薄い方眼を敷く。
 * 枠の上辺に「さわれるデモ」の小さなラベルだけを置く（016 §10）。右端の「最初からやり直す」は `ShiftDemo` が並べる（016 §11）。何をすればいいかはデモの中の状況の行と波紋が言う。
 * ラベルは塗らない（016 §7）。黒い塗りは「AIで作成」と同じ見た目になり、押せそうに見えた
 */
export function DemoSection({ dates, holidays, title }: Props) {
  return (
    <section
      id={DEMO_ID}
      className={classes.demoStage}
      aria-labelledby="demo-label"
      // ヒーローの「デモをさわる」から送られてくる。sticky のヘッダーに枠が隠れないようにずらす
      style={{ scrollMarginTop: 'var(--site-anchor-offset)' }}
    >
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <ShiftDemo
          dates={dates}
          holidays={holidays}
          title={title}
          label={
            <Group id="demo-label" gap={6} wrap="nowrap" className={classes.demoLabel}>
              <IconHandFinger size={16} stroke={1.8} aria-hidden />
              さわれるデモ
            </Group>
          }
        />
      </Container>
    </section>
  )
}

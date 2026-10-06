import Link from 'next/link'
import { PATTERN_COLORS } from '@/lib/patterns/colors'
import classes from '../Site.module.css'

const hex = (name: string) => PATTERN_COLORS.find((c) => c.name === name)?.hex

/** 4 マスのうち 3 つはシフト表のパターン色（早番の橙・遅番の藍・有給の緑）、1 つは空きのグレー（016 §2） */
const MARK_COLORS = [hex('Deep Orange'), hex('Indigo'), 'var(--mantine-color-gray-4)', hex('Green')]

export function Logo() {
  return (
    <Link href="/" className={classes.logo} aria-label="assift トップ">
      <span className={classes.mark} aria-hidden="true">
        {MARK_COLORS.map((color, i) => (
          <span key={i} style={{ backgroundColor: color }} />
        ))}
      </span>
      assift
    </Link>
  )
}

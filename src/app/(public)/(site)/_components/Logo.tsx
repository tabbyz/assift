import Link from 'next/link'
import { AssiftLogo } from '@/components/brand/AssiftLogo'
import classes from '../Site.module.css'

export function Logo() {
  return (
    <Link href="/" className={classes.logo} aria-label="assift トップ">
      <AssiftLogo height={24} />
    </Link>
  )
}

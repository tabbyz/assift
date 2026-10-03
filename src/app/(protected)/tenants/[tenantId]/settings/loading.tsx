import { Center, Loader } from '@mantine/core'
import classes from './loading.module.css'

/**
 * 設定の本文を読み込む間の表示。layout の children だけが差し替わるので、ナビは残る。
 * 動的ルートは loading.tsx があると部分 prefetch が効き、クリックした瞬間に遷移が始まる。
 * 速い遷移で光らないよう表示を遅らせる（CSS）
 */
export default function SettingsLoading() {
  return (
    <Center py="xl" className={classes.delayed}>
      <Loader size="sm" role="status" aria-label="読み込み中" />
    </Center>
  )
}

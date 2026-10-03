import { Group, Paper, Skeleton, Stack, VisuallyHidden } from '@mantine/core'
import classes from './loading.module.css'

/**
 * 設定の本文を読み込む間の骨組み。layout の children だけが差し替わるので、ナビは残る。
 * 動的ルートは loading.tsx があると部分 prefetch が効き、クリックした瞬間に遷移が始まる。
 * 形は一覧（タイトル + 追加ボタン + 行）に合わせる。速い遷移で光らないよう表示を遅らせる（CSS）
 */
export default function SettingsLoading() {
  return (
    <Stack gap="md" className={classes.delayed} aria-busy>
      <VisuallyHidden>読み込み中</VisuallyHidden>
      <Group justify="space-between">
        <Skeleton height={32} width={180} />
        <Skeleton height={30} width={80} />
      </Group>
      <Paper withBorder p="md">
        <Stack gap="md">
          {[70, 55, 62, 48, 58].map((width, index) => (
            <Skeleton key={index} height={16} width={`${width}%`} />
          ))}
        </Stack>
      </Paper>
    </Stack>
  )
}

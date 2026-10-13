'use client'

import { useState } from 'react'
import { setNonce } from 'get-nonce'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { theme } from '@/theme'

type Props = {
  /** proxy が作った CSP の nonce（022）。Mantine が足す `<style>` に付ける */
  nonce: string | undefined
  children: React.ReactNode
}

/**
 * root layout の Provider 群。`MantineProvider` の `getStyleNonce` は関数なので Server Component（layout）からは渡せず、
 * nonce を文字列で受けてここで関数にする。
 *
 * **nonce は最初に受けた値だけを使う。** Server Action の `refresh()` / `revalidatePath` の描き直しは root layout も描き直し、
 * そのリクエストは proxy で新しい nonce を得る。しかし文書の CSP の nonce は最初の HTML のままなので、新しい値を
 * `<style>` に付けると止まる（022 §4.4）。文書の寿命の間、nonce は変わらない。
 *
 * `<style>` を足すのは Mantine（`getStyleNonce`）と、Modal / Drawer が使う react-remove-scroll（`get-nonce` の `setNonce`）の 2 系統。
 * ほかのライブラリが `<style>` を足すようになったら、ここで nonce を渡す口を探す（022 §8 のレビュー 6 回目）
 */
export function AppProviders({ nonce, children }: Props) {
  // 関数ごと state に持つ（最初の nonce に固定し、描き直しでも同じ関数を渡す）
  const [getStyleNonce] = useState(() => {
    // Modal / Drawer のスクロール固定（react-remove-scroll → react-style-singleton）は Mantine の外で `<style>` を足し、
    // nonce は `get-nonce` のモジュール変数からしか読まない。**描画の段階**で渡す（effect にしない）: effect は子から先に走るので、
    // 最初から開いている Modal の `<style>` が親の effect より前に足される。`setNonce` は冪等なので StrictMode の二重実行でも害は無い。
    // ブラウザだけ: サーバーでは `<style>` を足さず、モジュール変数はリクエストをまたぐ
    if (nonce && typeof document !== 'undefined') setNonce(nonce)
    return nonce ? () => nonce : undefined
  })
  return (
    <MantineProvider theme={theme} forceColorScheme="light" getStyleNonce={getStyleNonce}>
      <ModalsProvider>
        <NuqsAdapter>
          {children}
          <Notifications position="top-right" />
        </NuqsAdapter>
      </ModalsProvider>
    </MantineProvider>
  )
}

'use client'

import type { ErrorPageProps } from '@/components/ErrorPanel'
import { ERROR_TEXT, errorDigest } from '@/components/errorText'
import { FONT_FAMILY } from '@/fontFamily'

/**
 * root layout 自身の例外（023 §3.3）。root layout を置き換えるので `<html>` / `<body>` を自前で描く。
 *
 * **Mantine を使わない。** `MantineProvider` が足す `<style>` には CSP の nonce が要るが、nonce を渡す root layout が壊れていて、
 * Client Component のここでは `headers()` も読めない（022）。素の HTML と `style` 属性（`style-src-attr 'unsafe-inline'`）だけで描く。
 * 文言は `ErrorPanel` と共有する（`errorText.ts`）。
 *
 * **やり直しは `retry()` ではなく全体の読み込み。** `retry()` で root layout が描き直されると、`AppProviders` はそのとき初めて
 * マウントされ、その RSC のリクエストの新しい nonce を受け取る。文書の CSP は global-error を描いたときの nonce のままなので、
 * Mantine の `<style>` が全部止まる（022 §4.4 と同じ落とし穴。Playwright で確認した。023 §5）。
 *
 * **「戻る」は置かない。** root layout はすべてのページを包むので、どこへ移っても同じ layout を通る。一時的な失敗なら
 * 読み込み直しで足り、続く失敗ならどのページも開けない（管理画面のホストでは `/` が 404 で、戻り先をホストで分ける手間にも見合わない）
 */
export default function GlobalError({ error }: ErrorPageProps) {
  const digest = errorDigest(error)
  return (
    <html lang="ja">
      <head>
        {/* Next の viewport・metadata は root の境界の内側で描かれ、ここに差し替わると外れる。viewport は自分で書く（無いとスマホで 980px 幅に縮む） */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* noindex は書かない: SSR で root layout が落ちると Next は中身の無い 500 の HTML（noindex 付き）を返し、この画面はブラウザで描かれる */}
        <title>エラーが発生しました | assift</title>
      </head>
      <body style={styles.body}>
        <main style={styles.main}>
          <h1 style={styles.title}>{ERROR_TEXT.title}</h1>
          <p style={styles.dimmed}>{ERROR_TEXT.description}</p>
          <p style={styles.actions}>
            <button type="button" onClick={() => window.location.reload()} style={styles.button}>
              {ERROR_TEXT.retry}
            </button>
          </p>
          <p style={styles.small}>
            {ERROR_TEXT.contactPrefix}
            <a href={`mailto:${ERROR_TEXT.contactEmail}`} style={styles.mail}>
              {ERROR_TEXT.contactEmail}
            </a>
            {ERROR_TEXT.contactSuffix(digest)}
          </p>
          {digest && <p style={styles.digest}>{ERROR_TEXT.digest(digest)}</p>}
        </main>
      </body>
    </html>
  )
}

/**
 * Mantine の CSS 変数が無いので値を直書きする（`lib/pdf/styles.ts` と同じ事情）。コメントは対応する Mantine の値。
 * 書体は `theme.ts` と共有の `fontFamily.ts`（`theme.ts` は `@mantine/core` を読むので、ここからは読まない）。
 * `boxSizing` は Mantine の CSS（`* { box-sizing: border-box }`）が無い前提で書く
 */
const styles = {
  body: {
    margin: 0,
    fontFamily: FONT_FAMILY,
    color: '#000', // --mantine-color-text（light）
    background: '#fff', // --mantine-color-body（light）
    lineHeight: 1.55, // --mantine-line-height
  },
  main: {
    maxWidth: 540,
    margin: '0 auto',
    padding: '32px 16px',
    boxSizing: 'border-box',
    textAlign: 'center',
  }, // Container size="sm" py="xl"
  title: { fontSize: 26, lineHeight: 1.35, margin: '0 0 16px' }, // Title order={2}
  dimmed: { color: '#868e96', margin: '0 0 16px' }, // --mantine-color-dimmed
  actions: { margin: '0 0 16px' },
  button: {
    font: 'inherit',
    fontSize: 14, // Button size="sm"
    fontWeight: 600,
    height: 36,
    padding: '0 18px',
    boxSizing: 'border-box',
    border: 'none',
    borderRadius: 4, // theme.defaultRadius = sm
    background: '#2e2e2e', // Button color="dark"（theme.ts の既定）= --mantine-color-dark-6
    color: '#fff',
    cursor: 'pointer',
  },
  mail: { color: '#000' }, // リンクは本文色 + 下線（theme.ts の Anchor）
  small: { fontSize: 14, color: '#868e96', margin: '0 0 8px' }, // Text size="sm" c="dimmed"
  digest: { fontSize: 12, color: '#868e96', fontFamily: 'monospace', margin: 0 }, // Text size="xs" ff="monospace"
} satisfies Record<string, React.CSSProperties>

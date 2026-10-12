import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

/**
 * `AppProviders` の `setNonce()`（`get-nonce`）は、Modal / Drawer のスクロール固定（react-remove-scroll → react-style-singleton）が
 * 読む `get-nonce` と**同じモジュール**でなければ効かない（モジュール変数に書くだけ。022 §8 のレビュー 6・7 回目）。
 * 依存の更新で `get-nonce` が 2 本に分かれる（`npm ls get-nonce` が nest する）と、Modal を開いた瞬間に nonce 無しの `<style>` が足されて
 * 本番でだけ止まる。ここで守るのはその 1 点（パッケージのディレクトリが 1 つ）だけ。バンドラの束ね方まで含めた実物の確認は
 * Playwright でモーダルを開く手順（022 §6-4）が担う
 */
describe('get-nonce は 1 本', () => {
  it('アプリからの解決と react-style-singleton からの解決が同じパッケージ', () => {
    const fromApp = require.resolve('get-nonce/package.json')
    const singletonDir = dirname(require.resolve('react-style-singleton/package.json'))
    const fromSingleton = require.resolve('get-nonce/package.json', { paths: [singletonDir] })
    expect(fromSingleton).toBe(fromApp)
  })
})

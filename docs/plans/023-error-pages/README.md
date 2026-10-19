# 023: エラー画面（error.tsx / global-error.tsx）

- 前提: 009 §8.4（公開ページのクエリが失敗したときの受け皿は「必要になったら別途」とした）/ 020（管理画面のホスト）/ 022（CSP）
- 参照: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`、`01-app/01-getting-started/10-error-handling.md`

## 1. 目的と完了条件

いまアプリに `error.tsx` が 1 つも無く、Server Component の描画が例外を投げると（Supabase の一時的な障害、`SUPABASE_SECRET_KEY` の設定漏れなど）
Next の既定の英語の画面（`Application error: a server-side exception has occurred…`）が出る。戻り先もやり直しのボタンも無い。
公開前に、日本語で「やり直す / 戻る / 問い合わせる」が分かる画面にする。

- [x] ルートの `app/error.tsx`: root layout より下のすべての描画の例外を受ける。日本語・やり直し・トップへ・問い合わせ先・エラー番号（digest）
- [x] 店舗の `tenants/[tenantId]/error.tsx`: シフト表・設定・初期設定の例外を、**店舗の枠（TenantShell）を残したまま**出す
- [x] 管理画面の `-/error.tsx`: 戻り先を管理画面にする（管理画面のホストでは `/` が 404。020 §4.2）
- [x] `app/global-error.tsx`: root layout 自身の例外。自前の `<html>` / `<body>`。Mantine に頼らない（§3.3）
- [x] CSP の違反が出ない（`next start` + Playwright。022 §6）
- [x] `lint` / `typecheck` / `test` が通る

## 2. 範囲

### 作る

| ファイル | 受ける例外 | 戻り先 |
| --- | --- | --- |
| `src/app/global-error.tsx` | root layout（`headers()`・`assertNonce()`）。root layout を置き換える | なし（§3.3） |
| `src/app/error.tsx` | root layout より下の全部（LP・認証・公開シフト表・アカウント・`(protected)/layout.tsx`・`[tenantId]/layout.tsx`） | `/` |
| `src/app/(protected)/tenants/[tenantId]/error.tsx` | 店舗の page と `settings/layout.tsx`・初期設定。`[tenantId]/layout.tsx` 自身は受けない（同じ層の layout は境界の外）→ `app/error.tsx` | 枠のナビ（本文には「やり直す」だけ） |
| `src/app/-/error.tsx` | 管理画面（`(console)/layout.tsx` の `requireAdminPage()` を含む） | `/-`（ユーザー一覧、未ログインならログインへ送られる） |
| `src/components/ErrorPanel.tsx` | 上の 3 つ（global-error 以外）が共有する本文（Client） | props |
| `src/components/errorText.ts` | 文言と `errorDigest()`。`ErrorPanel` と global-error が共有する（Mantine に依らない素の値） | — |
| `src/fontFamily.ts` | 書体の文字列。`theme.ts` と global-error が共有する | — |

### 作らない

- **エラー収集サービス（Sentry など）・`instrumentation.ts` の `onRequestError`**: サーバーの例外は Vercel の Runtime Logs に digest 付きで残る。
  画面に digest を出しておけば、問い合わせから突き合わせられる。収集の仕組みは別のプランで
- **セグメントごとの細かい境界**（設定のナビを残す `settings/error.tsx` など）: 店舗の枠のヘッダーから設定にもシフト表にも移れるので足りる
- **`(site)` の枠（LP のヘッダー・フッター）を残す境界**: LP は DB をほとんど読まない。ルートの画面で足りる
- **Server Action の失敗**: `runAction` が `ActionFailure` に変えて通知で出す（境界には来ない）。`redirect()` / `notFound()` も境界の対象外（Next が処理する）
- **Route Handler（PDF / CSV / Webhook / cron）**: HTML ではない。いまの決まり（010・019）のまま

## 3. 設計

### 3.1 文言と中身

```
問題が発生しました
ページを表示できませんでした。時間をおいてもう一度お試しください。
[もう一度読み込む]  [トップへ戻る]
解決しない場合は support@assift.com まで、下のエラー番号を添えてお問い合わせください。
エラー番号: 1234567890
```

- **`error.message` は出さない。** 本番の Server Component の例外は Next が汎用の英文に差し替える（中身を漏らさない）。
  Client Component の例外は元の message が届くが、英語の技術的な文言なので利用者に見せても役に立たない
- **digest があるときだけエラー番号を出す。** Server Component の例外にだけ付き、Vercel のログの digest と一致する。Client の例外には無い
- 問い合わせ先は `CONTACT_EMAIL`（規約と同じ）
- 「もう一度読み込む」は `retry()`（Next 16.3 で安定。境界の子を**サーバーから取り直して**描き直す。`reset()` は取り直さないので使わない）。
  `retry()` は `router.refresh()` を transition で走らせるので、`useTransition` で包んでボタンに `loading` を出す（連打させない）
- **「戻る」は全体の読み込み（素の `<a>`）。** Next の境界はパスが変わったときにしか解けない（`error-boundary.js` の `getDerivedStateFromProps`）。
  クライアント遷移だと、店舗の layout で落ちて `/` → 直近の店舗（同じパス）に戻ったときや、LP で落ちて `/` を押したとき（いまのパス）に、
  取り直しが成功しても境界が残り、押しても何も変わらない（§5 のレビュー 1 回目）
- 店舗の境界は「トップへ戻る」を出さない: 枠のヘッダーに店舗の切り替え・設定・シフト表があり（ただし落ちた画面そのものへの遷移はパスが変わらず境界が解けないので、同じ画面はやり直しで直す）、`/` は `/tenants` → 直近の店舗（= いま落ちた店舗）に戻ってくるだけになるため。
  準備中の店舗（`setup_completed_at` が null）は枠が無いのでやり直しと問い合わせ先だけになるが、初期設定の画面で落ちるのはまれで、境界から準備中かは分からないので分けない
- 見た目は `not-found.tsx` と揃える（`Container size="sm" py="xl"` に中央寄せの `Stack`）。アイコンは付けない

### 3.2 `error.tsx` は Client Component

- `'use client'` 必須。本文は `ErrorPanel` に寄せ、各 `error.tsx` は戻り先を渡すだけにする
- `metadata` は export できない。タイトルはページ側のまま（`シフト表 | 店舗名` の中にエラーが出る形）にし、`<title>` は足さない
- 例外のログは書かない（`useEffect(() => console.error(error))` はガイドの例にあるが、React 19 は境界が捕まえた例外を既定で `console.error` する。二重になる）

### 3.3 `global-error.tsx` は Mantine を使わない

root layout を**置き換える**ので、`AppProviders`（`MantineProvider`）も `@mantine/core/styles.css` も無い。

- `MantineProvider` を自前で置くと、Mantine が足す `<style>`（CSS 変数）に CSP の nonce が要る。nonce は root layout が `headers()` で読んで渡しているが、
  `global-error` は Client Component なので `headers()` を読めない（そもそも root layout が壊れている）。nonce の無い `<style>` は本番で止まる
- そこで**素の HTML + `style` 属性**で描く（`style-src-attr 'unsafe-inline'` で許されている。022 §3）。要素は見出し・文・ボタン・問い合わせ先だけ。
  色・大きさは hex と px を直書きし、対応する Mantine の値をコメントに書く（`lib/pdf/styles.ts` と同じ）。書体は `src/fontFamily.ts`（`theme.ts` と共有。`theme.ts` は `@mantine/core` を読むので global-error からは読まない）。文言は `errorText.ts`
- `<meta name="viewport">` を自分で書く: Next の viewport・metadata は root の境界の内側で描かれ、global-error に差し替わると DOM から外れる。
- タイトルは React 19 の `<title>`（`metadata` は使えない）。`<html lang="ja">`。`noindex` は書かない: SSR で root layout が落ちると、Next は中身の無い 500 の HTML
  （root の metadata と `noindex` 付き）を返し、この画面はブラウザで描かれる。DOM の `<title>` は描いた後この 1 つだけになる（レビュー 2 回目で確かめた）
- **「戻る」は置かない。** root layout はすべてのページを包むので、どこへ移っても同じ layout を通る。一時的な失敗なら読み込み直しで足り、
  続く失敗ならどのページも開けない。管理画面のホストでは `/` が 404 で、パスから戻り先を選んでも proxy の rewrite（`/404`）の先ではホストと食い違う（レビュー 1 回目）
- **「もう一度読み込む」も `retry()` ではなく `window.location.reload()`**（§5 で見つけた）。`retry()` で root layout が描き直されると `AppProviders` が
  そこで初めてマウントされ、その RSC のリクエストの**新しい** nonce を受け取る。文書の CSP は global-error を描いたときの nonce のままなので、
  Mantine の `<style>` が全部止まる（022 §4.4 と同じ落とし穴）
- `assertNonce()` が開発で投げる例外もここに来る（本番はログだけ）。開発では Next の dev overlay が先に出るので、この画面は本番の確認でだけ見る

### 3.4 なぜ境界をこの 3 か所にするか

`error.tsx` は**同じ層の layout を包まない**（ガイド）。

- `app/error.tsx` は root layout の children を包むので、`(protected)/layout.tsx`（`getAuthUser()`）・`[tenantId]/layout.tsx`（店舗・課金の読み取り）の例外も受ける。
  `(protected)` に置くと `(protected)/layout.tsx` の例外を受けられない。ルートに 1 枚が最も漏れが無い
- `[tenantId]/error.tsx` は `[tenantId]/layout.tsx`（TenantShell）の**内側**に入るので、シフト表で落ちても枠が残り、設定や別の店舗へ移れる
- 管理画面は `/` へ戻すと管理画面のホストでは 404 になるので、`-/error.tsx` で戻り先を変える（`(console)` の外に置くので `requireAdminPage()` の例外も受ける）

## 4. 確認

1. `npm run build && npm run start`（本番の方針）。一時的に例外を投げるページ・分岐を足し（確認後に消す）、Playwright で開く:
   - 公開側のページ（Server の例外 → `app/error.tsx`。digest が出る / `error.message` が出ない）
   - Client Component の描画の例外（digest が出ない）
   - ログイン → シフト表（Server の例外 → 店舗の境界。枠が残る）
   - 管理画面（戻り先が `/-/users`）
   - root layout の例外（`global-error.tsx`。素の HTML で描ける）
   - 各画面で `securitypolicyviolation` が 0 件、「もう一度読み込む」で例外が止んでいれば元の画面に戻る
2. スマホ幅（375px）で崩れない
3. `lint` / `typecheck` / `test`

## 5. 実装ログ

### 2026-10-12 実装

| ファイル | 中身 |
| --- | --- |
| `src/components/ErrorPanel.tsx` / `errorText.ts` | 本文（見出し・説明・やり直し・戻る・問い合わせ先・エラー番号）と文言。`ErrorPageProps`（Next は error の props の型を生成しないので、ここで 1 回書く） |
| `src/app/error.tsx` | 戻り先 `/` |
| `src/app/(protected)/tenants/[tenantId]/error.tsx` | 戻り先なし（枠のナビ） |
| `src/app/-/error.tsx` | 戻り先 `/-`（`ADMIN_ROOT`） |
| `src/app/global-error.tsx` | 素の HTML + `style` 属性。`<title>`。やり直しは全体の読み込み。戻るは無い（§3.3） |
| `src/fontFamily.ts` | 書体の文字列。`theme.ts` と global-error が共有する（global-error から `@mantine/core` を読まない） |

### 確認

`npm run build && npm run start`（本番の方針）で、一時的に例外を投げるページ（公開側・店舗・管理画面。cookie があるときだけ投げる）と
Client Component の描画の例外、root layout の例外（リクエストヘッダがあるときだけ投げる）を足し、Playwright（375px）で開いた。
一時的な変更は確認後に消した（diff に残っていない）。

| 確かめたこと | 結果 |
| --- | --- |
| 公開側の Server の例外 | 500。`app/error.tsx` が出る。エラー番号（digest）が出て、Server のログの digest と一致。`error.message` は出ない。戻り先 `/` |
| Client Component の描画の例外 | エラー番号は出ない（digest が無い）。message も出ない |
| 店舗の Server の例外（直接開く・シフト表からのクライアント遷移） | 500。TenantShell のヘッダーが残ったまま本文にだけ出る。「戻る」は無い |
| 管理画面の Server の例外 | 戻り先が `/-/users` |
| root layout の例外（`/terms`・`/-/login`） | 500。`global-error.tsx` が素の HTML で出る。タイトル `エラーが発生しました \| assift`。戻り先は `/` と `/-/users` |
| 「もう一度読み込む」（例外が止んだあと） | 公開側・店舗は `retry()` で元の画面に戻る。global-error は全体の読み込みで戻る |
| CSP | すべての画面で `securitypolicyviolation` 0 件。375px で横にはみ出さない |

- **global-error で `retry()` を使うと、戻った画面で `style-src-elem` の違反が出た**（`/terms` で 4 件・`/-/login` で 2 件。Mantine の `<style>`）。
  §3.3 のとおり全体の読み込みに変えて 0 件になった。`app/error.tsx` と店舗の境界の `retry()` は root layout（`AppProviders`）を描き直さないので違反は出ない
- `npm run lint`（既存の warning 1 件のみ）/ `npm run typecheck` / `npm test`（95 ファイル・908 件）を通した。Prettier の指摘 2 件（`ShareModal.tsx`・`AssistPanel.module.css`）は main からのもの
- スキーマは触っていないので `supabase test db` と `gen types` は不要
- プレビュー（Vercel）での確認は未了。例外を起こす口が無いので、見るなら一時的なコミットが要る（§4 と同じ確認で足りると考えている）

### 2026-10-12 レビュー 1 回目（8 件。6 件を反映、2 件は見送り）

| 指摘 | 対応 |
| --- | --- |
| ルートの境界の「トップへ戻る」が効かないことがある（店舗の layout で落ちると `/` → 同じ店舗に戻る。LP で落ちると同じパス）。境界はパスが変わらないと解けない | 反映。「戻る」を全体の読み込み（`Button component="a"`）にした（§3.1）。Next の `error-boundary.js` で解ける条件を確かめた |
| 管理画面の「ユーザー一覧へ」も同じ（`/-/users` で落ちた・`/-/login` から戻される） | 反映。全体の読み込みにし、行き先を `/-`（`ADMIN_ROOT`）、文言を「管理画面のトップへ」にした |
| global-error の戻り先をパスで選ぶと、proxy の rewrite（`/404`）の先でホストと食い違って 404 に行く | 反映。global-error から「戻る」を外した（root layout はどのページも包むので、戻り先も同じく落ちる。§3.3） |
| 「もう一度読み込む」に loading が無い（`retry()` は `router.refresh()`。店舗では数秒かかりうる） | 反映。`useTransition` で包んで `loading`。遅いページで `data-loading` が付くのを確かめた |
| global-error が `ErrorPanel` の文言を書き写している | 反映。`components/errorText.ts` に寄せた |
| global-error の「トップへ戻る」が管理画面では一覧へ行くのに文言が食い違う | 3 件目で「戻る」ごと外したので解消 |
| 準備中の店舗（枠が無い）で初期設定が落ちると、やり直しと問い合わせ先しか無い | 見送り（§3.1 のとおり）。境界から準備中かは分からず、`/` や `/tenants` は同じ店舗の `/setup` に戻ってくるだけで、置ける行き先が無い |
| global-error の hex・px が `theme.ts` の外（AGENTS.md の UI 規約） | 一部反映。Mantine の CSS 変数が無いので値は直書きのまま（PDF と同じ例外）。各値に対応する Mantine の値をコメントし、書体は `theme.ts` から引いた。AGENTS.md の該当行に例外として書いた |

確認: 本番ビルドで §4 の通しをやり直した（一時的な変更は消した）。加えて、店舗の layout の例外 → ルートの境界 →「トップへ戻る」で同じ店舗に戻って枠ごと描けること、
管理画面の「管理画面のトップへ」で `/-/users` に行けること、LP の「トップへ戻る」で LP に行けることを見た。すべて違反 0 件

### 2026-10-12 レビュー 2 回目（5 件。3 件を反映、2 件は実測で否定）

| 指摘 | 対応 |
| --- | --- |
| 店舗の境界のコメント「枠のナビから移れる」は、落ちた画面そのもの（ナビの同じ項目・同じ店舗）では成り立たない（パスが変わらず境界が解けない） | 反映。コメントと §3.1 を直した。同じ画面の復旧は「もう一度読み込む」が受け持つ |
| global-error の `noindex` が Next の `noindex` と重なる | 反映（外した）。SSR の HTML を見ると、root layout が落ちたときの応答は中身の無い 500 の HTML（Next の `noindex` 付き）で、global-error はブラウザで描かれる。こちらの `noindex` は意味が無い |
| SSR の root の metadata の `<title>` と global-error の `<title>` が 2 つ並び、順序次第で通常のタイトルが出る | 否定。SSR の HTML には global-error が入らず（上）、描いた後の DOM の `<title>` は global-error の 1 つだけ（Playwright で数えた） |
| `main` が content-box なので Mantine の Container より 32px 広い | 実測では 540px（境界の幅）で差は無かったが、Mantine の CSS が無い前提で `boxSizing: 'border-box'` を明示した（ボタンも） |
| global-error が書体のために `theme.ts`（`@mantine/core`・`PATTERN_COLORS`）を丸ごと読む。最後の砦の画面に依存を持ち込む | 反映。書体を `src/fontFamily.ts` に出し、`theme.ts` と global-error が読む。`theme.ts` の「読むのは AppProviders / ShiftDemo だけ」は元に戻した |

確認: 本番ビルドで §4 とレビュー 1 回目の通しをやり直し、すべて違反 0 件

### 2026-10-12 レビュー 3 回目（2 件。すべて反映）

| 指摘 | 対応 |
| --- | --- |
| global-error に差し替わると Next の `<meta name="viewport">` が外れ、スマホで 980px 幅に縮む | 反映（`<head>` に書いた）。DOM から外れるのは実測で確かめた（外すと `meta[name=viewport]` が無い）。ただし Chromium のスマホ相当（iPhone 13）では、外したままでも幅は 390px のままで崩れなかった（最初の HTML の指定が残る）。Safari の挙動は確かめていないので、文書として正しい形にそろえた |
| 境界が受ける値は `Error` とは限らない（Next の型は `error: unknown`）。`throw null` で `error.digest` を読むとエラー画面自身が落ちる | 反映。`ErrorPageProps.error` を `unknown` にし、digest は `errorDigest()`（`errorText.ts`。文字列かまで見る。Vitest 3 件）で取り出す。`throw null` で `app/error.tsx` が落ちずに出る（エラー番号なし）のを本番ビルドで確かめた |

確認: 本番ビルドで §4・レビュー 1 回目の通し（16 項目）をやり直し、すべて違反 0 件

### 2026-10-12 レビュー 4 回目（1 件。反映）

コードの指摘は 0 件（`retry()` を `useTransition` で包んだときの `loading`・境界が解ける条件・`errorDigest()`・`/-` の redirect・
global-error の依存と直書きの値を Next 16.3.5 の実装と突き合わせて問題なし）。

| 指摘 | 対応 |
| --- | --- |
| §3.3 に「書体は `theme.ts` から引く」が残り、§2 の表に `fontFamily.ts` が無い（レビュー 2 回目の変更に追いついていない）。AGENTS.md の `theme.ts` の行も書体の置き場とずれる | 反映。§2・§3.3 を直し、AGENTS.md の `theme.ts` の行に「書体の文字列は fontFamily.ts」を足した |

### 2026-10-12 レビュー 5 回目（0 件）

指摘なし。収束した。`npm run lint`（既存の warning 1 件のみ）/ `npm run typecheck` / `npm test`（96 ファイル・911 件）を通した。

### 2026-10-12 プレビューの最初のデプロイが 500（§6）

`src/lib/supabase/buildEnv.ts`（+ Vitest 5 件）と `next.config.ts` の呼び出し、AGENTS.md の「PR の流れ」に 1 項目。

- `.env.local` を外して `VERCEL=1 npx next build` → 設定の読み込みでビルドが止まり、名前と直し方が出る
- `.env.local` ありで `VERCEL=1 npx next typegen` → 通る（`.env*` は `next.config.ts` より先に読まれる）
- `.env.local` 無しで `VERCEL` 無し → 通る（ローカルには影響しない）
- Vercel: `fa9c119` の Redeploy がこのチェックで止まった（ログに名前と直し方）。最初の 1 回は「Git information retrieval failed」でビルド前に失敗しており、無関係
- PR を閉じて開き直したら、Vercel の Environment Variables に `claude/023-error-pages` 専用の値が入った。原因の説明（時間差 → ブランチ専用の値が作られていない）、
  エラー文、AGENTS.md をこれに合わせて直した

## 6. 追加: プレビューが 500 になる（PR #28 で見つけた）

PR #28 のプレビュー（`9a51ab3`）が、proxy を通るすべての URL で素の `Internal Server Error`（500）になった。

- proxy の外（`/favicon.ico` は 200、`/api/stripe/webhook` は 405）は動き、500 の応答には CSP のヘッダも無い → proxy の途中で投げている。
  エラー画面（error.tsx）は React の描画の中の例外しか受けないので出ない
- 同じ proxy の PR #26・#27 のプレビューは 200。ローカルの本番ビルドも動く → コードではなく環境変数
- **原因: このブランチ専用の環境変数が Vercel に無かった。** プレビューの `NEXT_PUBLIC_SUPABASE_URL` などは、Supabase Branching が PR のブランチ DB を
  作るときに Vercel へ**そのブランチ専用**の値として入れる（Vercel の Environment Variables の Preview には、`claude/next-work-notes` 専用の値しか無かった。
  Preview 全体に効く値は無く、Supabase の Vercel 連携の「Preview に同期」はオフ。Branching を使うときはオフが正しいと Supabase の画面に書いてある）。
  PR #28 では Supabase Preview のチェックが成功したのに、`claude/023-error-pages` 専用の値が作られていなかった。
  `NEXT_PUBLIC_` はビルド時に埋め込まれるので、proxy の `getSupabasePublicEnv()` が全リクエストで投げる
- 最初は「push で作られたデプロイが、PR の作成後に届く値より先に組まれた（時間差）」と考えたが、ブランチ DB ができてから何時間も後の
  Redeploy（`fa9c119`）でも 2 つとも無かった（下の対応 1 のチェックで止まった）ので否定した
- **直し方: PR を閉じて開き直す。** ブランチ DB が作り直され（Supabase のプロジェクト id が変わる）、ブランチ専用の値が入った（Vercel の画面で確かめた）。そのあと Redeploy

対応:

1. **ビルドを失敗させる**（`src/lib/supabase/buildEnv.ts` の `assertSupabaseBuildEnv()` を `next.config.ts` の先頭で呼ぶ）。Vercel のビルド（`VERCEL=1`）で
   2 つのどちらかが無ければ、直し方（PR を開き直す → Supabase Preview の完了後に Redeploy）を添えて投げる。黙って「Ready」の壊れたデプロイを作るより、失敗で知らせる。
   - `SUPABASE_SECRET_KEY` は見ない: 実行時に読む値で、無くても壊れるのは公開シフト表などの一部（proxy は止まらない）。統合が同期する名前を確かめられていないので、必須にして毎回のビルドを落とす危険を取らない
   - Vercel の外（ローカルの `npm run build`・`next typegen`）は見ない
2. **AGENTS.md の「PR の流れ」に書く**（ブランチ専用の値の仕組みと、無いときの直し方）

## 7. 追加: 問い合わせ先をフォームへ（2026-10-19。031）

- `ErrorPanel` の問い合わせ先をアドレスからお問い合わせフォーム（`/contact?digest=…`）に替えた。URL に店舗があれば店舗の id も引き継ぐ（`ErrorPanel` が `useParams` で読む。どの境界で受けても同じ）。`/contact` 自身で落ちたときはアドレス。リンクは「戻る」と同じく素の `<a>`
- 管理画面のパス（`/-`）ではアドレスのまま。`ErrorPanel` が `usePathname()` で決める（`-/error.tsx` も、root の `error.tsx` が `-/layout.tsx` の例外を受けたときも同じ）。管理画面のホストでは `/-` の外が 404 でフォームを開けない
- global-error はアドレスのまま（root layout が落ちていてフォームも動かない。クローラーにも読まれない）

# 031: お問い合わせフォーム（Missive で受ける）

- 前提: 016-terms §7 2026-10-13（連絡先 `support@assift.com`。Google Workspace のエイリアス）/ 017（委託先と外国への移転・お問い合わせの内容）/
  018 §2（窓口は `support@` の 1 つ）/ 022（CSP）/ 023（エラー画面の問い合わせ先とエラー番号）/ 024 §4（Resend。差出人 `noreply@assift.com`・Receiving は使わない）/
  020（管理画面。問い合わせの利用者をユーザー id で引く）/ 030 §3-6（告知の Reply-To は `support@`）
- 参照: `scripts/announce/send.ts`（Resend の REST を `fetch` で呼ぶ形・`Idempotency-Key`）/
  Missive の公式ドキュメント（2026-10-18 に取得。`administration/billing-and-plans`（+ faq）・`core-features/connected-accounts/email-accounts/gmail-google-workspace`（+ `configuring-google-aliases`）・
  `core-features/understanding-label-types`・`advanced-features/rules/conditions`・`core-features/connected-accounts/email-accounts/spam-and-blocking`・`ai/overview`・`ai/setup`・`ai/mcp/server`（+ faq）・
  `administration/security`（+ faq）、`missiveapp.com/privacy`・`missiveapp.com/gdpr`、ドキュメントの質問の窓口（`?ask=`）の回答。§5・§5.1）/
  Vercel BotID のドキュメント（`withBotId`・`initBotId`・`checkBotId`。§4.6）/ `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`（`bodySizeLimit`。§4.7）
- 経緯: 2026-10-18 の相談で、問い合わせの受信箱は **Missive**、入口は**自作のフォーム**に決めた（AI の自動応答・Help Scout・Plain と比べた結果）。
  同じ日のたたき台のレビューで、「開いていた画面」（`?from=`）を外し、迷惑な投稿の対策を BotID 中心に改め、画像の添付を足した（§3-9・11・12）

**状態: たたき台（2026-10-18）。§9 の未決を決めてから実装する。ヘルプ記事はリリース後に別のプランで検討する（範囲外）。**

## 1. 目的と完了条件

サイトに `support@assift.com` を載せるのをやめ、問い合わせの入口を**フォーム**に絞る。届いた問い合わせは **Missive**（iOS アプリ）で受けて返す。

狙いは 2 つ。迷惑メールを増やさないこと（新しく集められるのを防ぐ。もう出回っている分は減らない。§3-1）と、問い合わせに要る情報（誰の・どの店舗の・エラー番号・画面のスクリーンショット）を最初から揃えること。

- [ ] `/contact` から送ると、Missive に 1 件の会話として届き、Missive から返すと**相手のアドレスに**届く（Reply-To。§4.5・§8）
- [ ] ログイン中に送ると、アカウント・店舗・エラー番号が本文の末尾に自動で付く（§4.4）
- [ ] 画像を 3 枚まで添付でき、縮小された JPEG としてメールに付く（§4.7）
- [ ] BotID・回数の制限・ハニーポットが掛かっている（§4.6）
- [ ] サイトの `mailto:` が、§4.8 の表のとおりフォームへのリンクに置き換わっている（残すのは表のとおり）
- [ ] CSP（022）を変えずに動く（外部のスクリプト・iframe を足さない。BotID は同一オリジン。§4.6）
- [ ] プライバシーポリシー（委託先に Missive・お問い合わせの内容に自動で付く情報と添付）が実装と食い違わない（§6）
- [ ] `lint` / `typecheck` / `test` が通る（スキーマは触らないので `supabase test db` は変化なし）

## 2. 範囲

### する

| # | 内容 | 節 |
| --- | --- | --- |
| 1 | `/contact`（フォームのページ）と送信の Server Action | §4.2〜4.5 |
| 2 | 迷惑な投稿の対策（BotID・回数の制限・ハニーポット） | §4.6 |
| 3 | 画像の添付（縮小・種類の確認） | §4.7 |
| 4 | サイトの問い合わせ先の置き換えと、入口（フッター・アカウントのメニュー）の追加 | §4.8 |
| 5 | Missive の設定（手作業の手順） | §5 |
| 6 | プライバシーポリシーの改定 | §6 |

### しない

- **ヘルプ記事**（`/help`）: リリース後に別のプランで検討する（2026-10-18）。フォームの「送る前に関係する記事の候補を出す」もそのときに足す
- **AI による自動応答**（お客さんに AI が答える機能）: 件数が増えてから検討する
- **画像以外の添付**（PDF・Office・動画）: ウイルスを運ぶ口になる。動画や大きなファイルが要るようになったら Storage に上げる方式を別に検討する（§3-12）
- **問い合わせの DB への保存**: 個人情報の置き場を増やさない。送れなければ画面に失敗を返し、利用者がやり直す（§3-6）
- **受け付けの自動返信メール**: 未ログインのフォームから任意のアドレスへメールを送れる口になる（§3-7）
- **送信までの時間のチェック**: ボットは待ち時間をランダムに入れられ、自動入力で素早く送る人を誤って弾く（§3-11）
- **Cloudflare Turnstile・reCAPTCHA**: BotID で足りる見込み。BotID が CSP と合わないときだけ Turnstile と比べ直す（§4.6）
- **`info@assift.com` の廃止**: v1 からの問い合わせを受けるため残す（016-terms §7 のまま）

## 3. 決定（案。2026-10-18）

| # | 項目 | 案 | 理由 |
| --- | --- | --- | --- |
| 1 | アドレスを載せる場所 | **特商法の表記と global-error だけに残す**。ほかはフォームへのリンク（§4.8） | アドレスは規約・ポリシー・030 の告知・Stripe の公開情報で既に出回っており、消しても届く迷惑メールは減らない。新しく集められるのを減らすのが目的。特商法の表記は法令の確認まで残す（§9-2）。global-error はアプリが落ちたとき（フォームも動かない）にしか描かれず、クローラーが読まない |
| 2 | 受信箱 | **Missive**（Productive を想定。§5・§9-1） | iOS / Android / Mac にアプリがある。自分の鍵（OpenAI・Anthropic・Gemini）で AI の下書きを上乗せなしで使える。1 人で対応する前提に合う（2026-10-18 の比較）。**無料プランは無い**（トライアルの 30 日のあとは、プランを選ぶまで止まる。§5.1） |
| 3 | フォームから受信箱への渡し方 | **メール**（Resend で `support@assift.com` へ送る）。Missive の API は使わない | 受信箱の SaaS を替えても転送先を変えるだけで済む。Missive の API は Productive 以上で、縛られる |
| 4 | ページ | **`/contact` の 1 つ**（`(public)/(site)/contact`）。ログインの有無で中身を変える | 入口が 1 つなら案内が簡単。ログイン中に (site) のヘッダーの「ログイン」を押しても proxy が `/tenants` へ送るので害は無い（`GUEST_ONLY_PATHS`） |
| 5 | ログイン中の返信先 | アカウントのメールアドレスを使い、入力させない | 本人確認が済んだアドレスにしか返さない。打ち間違いが無い |
| 6 | 保存 | DB に保存しない。送信の失敗は画面に返す | §2。やり直しで二重に届かないよう `Idempotency-Key` を付ける（§4.5） |
| 7 | 自動返信 | **送らない**。完了の画面に「ご入力のアドレスへ返信します」と書く | 未ログインのフォームに他人のアドレスを入れると、私たちから他人へメールを送れてしまう（踏み台）。バウンス・迷惑メールの報告が増えると Resend が送信を止め、**認証メールまで止まる**（030 §6.3） |
| 8 | メールの形式 | **テキストだけ**（HTML を作らない） | 自分の受信箱に送るだけで、見た目は要らない。利用者の入力を HTML に埋め込まないので、エスケープの漏れが起きない |
| 9 | 自動で付ける情報 | ユーザー id・メールアドレス・店舗（id と名前。RLS で見えるものだけ）・エラー番号・ブラウザ（User-Agent）。**押す前に開いていた画面（`?from=`）は付けない** | 「どの店舗の話か」が聞き返しの理由で一番多い。エラー番号はログを探すのに直接使える。メニューはどの画面にもあり、押した画面と困っている画面が同じとは限らないので、開いていた画面は検証の手間のわりに役に立たない（要るなら本文に書いてもらう）。契約の状態はユーザー id から管理画面（020）で引けるので本文に入れない。Stripe の id など、本人に見せない値は入れない（返信の引用で相手に戻りうる。§4.4） |
| 10 | 環境 | 送るのは `RESEND_API_KEY` と `CONTACT_INBOX` があるときだけ。開発で無ければコンソールに出して成功にする | プレビューから本番の受信箱に届かないようにする（§4.9） |
| 11 | 迷惑な投稿の対策 | **Vercel BotID**（見えない判定）+ **Vercel Firewall の回数の制限** + **ハニーポット**。時間のチェックはしない | ハニーポットと時間のチェックだけで守るのは古い。ブラウザを丸ごと動かすボットは見えない欄も待ち時間も避ける。今の主流は見えない判定と回数の制限の重ね掛け。BotID は自分のドメインから判定のスクリプトを配るので CSP を変えずに済む見込みで、`src/instrumentation-client.ts`（既にある）に組み込める。ハニーポットはタダなので残す。AI が書いた文面の投稿はどれでも止まらず、受信側の迷惑メールフィルタに任せる |
| 12 | 添付 | **画像だけ（PNG・JPEG・WebP）・最大 3 枚**。ブラウザで長い辺 1,600px の JPEG に縮小し、Server Action（`FormData`）で受けて **Resend の添付としてメールに付ける**。Storage には上げない | スクリーンショットがあると一度で伝わる。メールに付ければ assift に保存場所が増えず、未ログインの人に Storage へ書かせる口も作らない。縮小すれば 3 枚でも Vercel の関数の上限（1 リクエスト 4.5MB）に収まる。ブラウザで描き直すので、写真の位置情報（EXIF）も落ちる |

## 4. 設計

### 4.1 流れ

```
ログイン中（アプリの各所のリンク: ?tenant=…&digest=…&topic=…）─┐
                                                               ├→ /contact → sendContact（Server Action・FormData）
未ログイン（フッター・LP）────────────────────────────────────┘        ├ BotID → ハニーポット → Zod → 添付の確認（§4.7）→ 自動で付ける情報（§4.4）
                                                                      └ Resend（POST /emails・添付つき）→ support@assift.com（Google Workspace）→ Missive
                                                                           差出人 noreply@assift.com / Reply-To = 相手のアドレス
```

### 4.2 ファイル

| ファイル | 役割 |
| --- | --- |
| `src/app/(public)/(site)/contact/page.tsx` | Server。`getAuthUser()` でログインの有無を見て、`loadContactSearchParams` の値と一緒に Client へ渡す。`metadata` は `title: 'お問い合わせ'` と `description` |
| `.../contact/searchParams.ts` | nuqs。`tenant`（uuid）・`digest`・`topic` |
| `.../contact/actions.ts` | `sendContact(formData)`（`'use server'`）。ファイルを受けるので `FormData`（AGENTS.md の例外どおり） |
| `.../contact/_components/ContactForm.tsx` | Client。フォーム・添付の選択とプレビュー・送信中の `loading`・完了の表示 |
| `.../contact/_lib/resizeImage.ts` | Client。画像を長い辺 1,600px の JPEG に描き直す（`createImageBitmap` + `canvas.toBlob`） |
| `src/lib/validation/contact.ts` | Zod（種類・本文・メール・上限の定数）+ テスト |
| `src/lib/contact/path.ts` | `contactHref({ tenantId, digest, topic })`。アプリの各所のリンクが使う + テスト |
| `src/lib/contact/attachments.ts` | 添付の確認（枚数・大きさ・先頭のバイトで種類を判定・送るファイル名を決める）の純関数 + テスト |
| `src/lib/contact/render.ts` | 件名と本文を組む純関数 + テスト |
| `src/lib/contact/send.ts` | `server-only`。Resend の REST を `fetch` で呼ぶ（SDK は足さない。030 と同じ） |

### 4.3 フォームの項目

| 項目 | ログイン中 | 未ログイン | 決まり |
| --- | --- | --- | --- |
| 種類 | ○ | ○ | `Select`。「使い方」「料金・契約」「不具合」「退会・データ」「その他」。`topic` で初期値を入れる（課金の画面からは「料金・契約」）。未選択（`null`）に日本語の `{ error }` を付ける |
| メールアドレス | ―（アカウントのものを表示） | ○ | `lib/validation/auth.ts` のメールのスキーマを使い回す |
| 内容 | ○ | ○ | 1〜5,000 文字（§9-5）。エラー番号は本文の初期値に入れず、自動で付ける情報に入れる（消されない） |
| 画像（任意） | ○ | ○ | 3 枚まで（§4.7）。Mantine の `FileButton`。選んだらすぐ縮小し、小さなプレビューと「削除」を出す |
| ハニーポット | ○ | ○ | 人には見えない入力欄（§4.6） |

- 送信ボタンの近くにプライバシーポリシーへのリンクを置く（「送信いただいた内容は、プライバシーポリシーに従って取り扱います」）。同意のチェックボックスは置かない（利用目的は公表済み）
- 完了の画面: 「送信しました。ご入力のアドレス（…）へ返信します。数日たっても届かない場合は、迷惑メールのフォルダをご確認ください」。返信の目安（「〇営業日以内」）は §9-4
- 失敗の画面: 「送信できませんでした。時間をおいてもう一度お試しください。」に続けて、**このときだけ**アドレスを出す（「解決しない場合は support@assift.com へ」）。Client の state でしか描かれないので、クローラーは読まない

### 4.4 自動で付ける情報（ログイン中だけ）

本文の末尾に区切り線を引いて付ける。**サーバーで確かめた値だけ**を書く（URL から来た値はそのまま信じない）。

| 項目 | 出どころ | 確かめ方 |
| --- | --- | --- |
| ユーザー id・メールアドレス | `getAuthUser()`（JWT） | ― |
| 店舗 | `?tenant=` | `createClient()`（RLS）で `tenants` を読み、見えたときだけ id と名前を書く。見えなければ書かない |
| エラー番号 | `?digest=` | 英数字だけ・長さの上限。エラー画面から来たときだけ付く |
| ブラウザ | `headers()` の `user-agent` | 長さの上限で切る |

- 未ログインで送ったときは「未ログイン」とブラウザだけを書く（`?tenant=` があっても読まない。見えないので）。エラー番号は未ログインでも付ける（ログイン画面などのエラーもありうる）
- 返信の引用で相手に戻っても困らない値だけにする（本人の情報）。Stripe の Customer id・管理画面の URL・内部のメモは入れない

### 4.5 メール

| 項目 | 値 |
| --- | --- |
| `from` | `assift <noreply@assift.com>`（024 で検証済みの差出人。認証メールと同じ） |
| `to` | `CONTACT_INBOX`（本番は `support@assift.com`） |
| `reply_to` | 相手のアドレス（ログイン中はアカウントのもの） |
| `subject` | `[お問い合わせ] {種類}：{内容の先頭 30 文字}`。改行・制御文字は空白に置き換える。Missive のルール（§5）がこの頭で拾う |
| `text` | 内容 + 区切り線 + 自動で付ける情報（添付の枚数も書く） |
| `attachments` | `[{ filename: 'image-1.jpg', content: <base64> }, …]`（§4.7） |
| `Idempotency-Key` | `contact/{requestId}`。`requestId` はフォームを開いたときにクライアントが作る uuid（`crypto.randomUUID()`）で、送信の連打・やり直しで二重に届かない（Resend は 24 時間、同じ鍵の再送を 1 通にする） |

- Gmail は差出人と件名でスレッドをまとめるので、件名に内容の先頭を入れて問い合わせごとに分ける。Missive は件名ではなく Reply-To などのヘッダで会話をまとめる（`core-features/conversations/faq`）。Reply-To は問い合わせの相手ごとに違うので、別の人の問い合わせが 1 つの会話に混ざることは無い見込み（§8 で確かめる）
- Missive は差出人（`noreply@`）を連絡先として表示するはず。誰からかは件名と本文の先頭（「返信先: …」）で分かるようにする
- **Missive で返信したときの宛先が Reply-To になるかは、公式ドキュメントに書かれていない**（ドキュメントの質問の窓口の回答も「見つからない。送る前に下書きの宛先を確かめて」。2026-10-18）。トライアルで確かめる（§8）。ならなければ §9-7

### 4.6 迷惑な投稿の対策

ログインの有無にかかわらず、すべての送信に掛ける。

| 段 | 内容 | 失敗したとき |
| --- | --- | --- |
| 1. BotID | `next.config.ts` を `withBotId()` で包む（判定のスクリプトを自分のドメインから配るリライトが足される）。`src/instrumentation-client.ts` で `initBotId({ protect: [{ path: '/contact', method: 'POST' }] })`。Action の先頭で `checkBotId()` | 失敗を返して送らない（「送信できませんでした」。人が誤判定されたときにやり直せるように、黙って成功にしない） |
| 2. 回数の制限 | **Vercel Firewall のレート制限**（`/contact` への POST を IP ごとに 10 分で 5 回など）。コードは書かない | Vercel が 429 を返す。Action は失敗の表示になる |
| 3. ハニーポット | 画面の外に置いた入力欄（`website`。`tabIndex={-1}`・`autoComplete="off"`・`aria-hidden`。`type="hidden"` にはしない）。値が入っていればボット | **成功を返して送らない**（ボットに判定の手がかりを与えない） |

- BotID は Basic（無料）から始める。Deep Analysis（Pro で 1,000 回の判定ごとに $1）は送信のときだけ走るので、月 100 件でも約 $0.1。Basic で止まらない投稿が目立ったら有効にする（§9-10）
- **BotID と CSP（022）の相性は未確認**。スクリプトは `instrumentation-client`（Next が nonce を付ける）から足されるので `'strict-dynamic'` で通り、送信も同一オリジン（`connect-src 'self'`）で済む見込み。`npm run build && npm run start` で `securitypolicyviolation` が 0 件か確かめてから採用する（§8）。方針を広げる必要があれば Turnstile と比べ直す
- BotID のリライト先のパスも proxy を通る（matcher から外さない。外すなら実在するパスに完全一致で書く決まり。AGENTS.md「proxy」）。CSP のヘッダが JS の応答に付いても害は無い
- 開発での BotID の振る舞い（素通りになるか）は導入時に確かめる
- 2 は Pro の Firewall でレート制限のルールが使えるか、料金がかかるかを確かめる（§9-3）。使えなければ、回数を数える置き場（DB の表など）が要るので別に決める

### 4.7 添付

| 項目 | 決まり |
| --- | --- |
| 種類 | PNG・JPEG・WebP（ファイル選択の `accept`）。ブラウザで JPEG に描き直すので、届くのは JPEG だけ |
| 枚数 | 3 枚まで |
| 縮小（ブラウザ） | 長い辺 1,600px・JPEG の品質 0.85。1 枚 200〜500KB が目安。描き直すので EXIF（位置情報など）は落ちる |
| 大きさの上限（サーバー） | 1 枚 1.5MB・合計 4MB（縮小を経ずに送られたものを弾く） |
| 種類の確認（サーバー） | ファイル名・ブラウザの申告する種類（`File.type`）は信じず、**先頭のバイト**で JPEG（`FF D8 FF`）を確かめる。それ以外は失敗にする |
| 送るファイル名 | サーバーが決める（`image-1.jpg`…）。利用者のファイル名は使わない（制御文字・長さ・個人名の混入を避ける） |
| プレビュー | `FileReader.readAsDataURL` の `data:` の URL で描く。`URL.createObjectURL`（`blob:`）は使わない（`img-src` に `blob:` が無い。022） |

- **Server Action の大きさの上限**: Next の既定は 1MB。`next.config.ts` の `experimental.serverActions.bodySizeLimit` を `'4mb'` にする。**全部の Server Action に効く**（ほかの Action も 4MB までのリクエストを受ける）。Vercel の関数の上限（4.5MB）より小さく、各 Action は Zod で中身を確かめるので害は小さい。受け入れたトレードオフとする
- iPhone の写真（HEIC）: iOS の Safari は `accept` に HEIC が無いと JPEG に変えて渡すことが多い。`createImageBitmap` で読めるかを実機で確かめる（§8）。読めなければ「この画像は添付できません」と出す
- Resend の添付の上限（1 通 40MB）には余裕で収まる

### 4.8 問い合わせ先の置き換え

| 場所 | いま | 置き換え後 |
| --- | --- | --- |
| `ErrorPanel`（各 `error.tsx`） | `mailto:` + エラー番号 | `/contact?digest=…` へのリンク。エラー番号は画面にも残す |
| `global-error.tsx` | `mailto:` | **そのまま**（§3-1） |
| `StaffLimitLock`・`StaffLimitModal`（個別契約） | `mailto:` | `/contact?topic=billing&tenant=…` |
| `BillingClient`（個別契約・解約予定の取り消し） | `mailto:` | `/contact?topic=billing` |
| 規約・ポリシーのページの末尾（運営者の行） | `mailto:` | 「お問い合わせ」へのリンク |
| ポリシー「お問い合わせ窓口」 | アドレス | フォームへのリンク（§6） |
| 特商法の表記「メールアドレス」 | `mailto:` | 当面そのまま（§9-2） |
| フッター（`FooterLinks`） | ― | 「お問い合わせ」を足す |
| アカウントのメニュー（`TenantShell`。PC とスマホ） | ― | 「お問い合わせ」を足す（`/contact?tenant=…`） |
| 030 の告知メール | Reply-To `support@` | そのまま（メールで、サイトではない） |

- `CONTACT_EMAIL`（`components/billing/contact.ts`）は global-error・特商法の表記・失敗の表示が使うので残す
- アプリの中からのリンクは `next/link` でよい（Next のページ）。他店舗の先読みの心配は無い（`/contact` は 1 つ）

### 4.9 環境変数

| 変数 | Production | Preview | 開発 |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | 入れる（送信だけの権限の鍵を新しく作る） | 確かめるときだけ入れる | 無し |
| `CONTACT_INBOX` | `support@assift.com` | 確かめるときだけ自分のアドレス | 無し |

- どちらかが無いとき: 開発（`NODE_ENV === 'development'`）はメールの中身（添付は枚数と大きさだけ）を `console.info` に出して成功にする。ほかは例外（画面は失敗の表示。§4.3）
- `.env.example` に 2 つを足す（値は空）。Preview に入れるのは「Preview 全体」の値でよい（Supabase がブランチごとに入れる値とは別）
- BotID は環境変数を使わない（Deep Analysis は Vercel のダッシュボードで切り替える）

## 5. Missive の設定（手作業）

受信は今の Google Workspace のまま（MX は触らない。024・026）。Missive は Gmail の公式の OAuth の API でつなぎ、ラベルを双方向に同期する。

1. Missive のトライアルを始める（**最初の組織に 30 日、Productive の機能**。カードは要らない。トライアル中は**直近 30 日の履歴だけ**見える）
2. **Settings > Accounts > Add account > Gmail or Google Workspace** で `admin@sundbox.app`（`support@` と `info@` はこのエイリアス）をつなぐ。個人のアカウントとして足す（1 人なので共有にしない）。取り込む履歴は「No history」か「1 month」でよい
3. **エイリアス**: Google の管理コンソールのエイリアス（済み）と、Gmail の「Send mail as」（`support@`。016-terms §7 で済み）の両方が要る。Missive にだけ足すと Gmail が差出人を元のアドレスに書き換える（Missive に「"From" address reverted」と出る）。
   両方そろっていれば、**`support@` 宛てのメールに返信するとき Missive が `support@` を差出人に選ぶ**（ドキュメントの質問の窓口の回答。§8 で確かめる）
4. **assift のメールを分ける**: **Gmail のフィルタ**で、宛先が `support@assift.com` か `info@assift.com` のメールに「assift」のラベルを付ける。Gmail のフィルタは Missive より先にサーバーで走り、ラベルは Missive（iOS を含む）に出る。
   これは Starter でも使える（Missive のルールは Productive 以上）。`sundbox.app` のほかのメールと受信箱を分けたいときは、フィルタで「受信トレイをスキップ」も付ける
5. **通知**: iOS アプリを入れる。**Starter では「このラベルだけ通知」ができない**（通知の設定は種類ごとで、ラベルごとではない。ドキュメントの質問の窓口の回答）。`sundbox.app` のほかのメールの通知を止めるには、Productive のルールの「Silence notifications」を使う（§9-1）
6. よく使う返信を Missive の canned responses（定型文）にする
7. **迷惑な投稿を「Mark as spam」で弾かない**: Missive の迷惑メールの扱いは**差出人のアドレスかドメインをブロック**する。フォームのメールの差出人は全部 `noreply@assift.com` なので、ブロックすると**以後のフォームの問い合わせがすべて届かなくなる**（`assift.com` のドメインならなおさら）。フォームの迷惑な投稿は削除するだけにする
8. AI の下書きを使うなら §5.1

### 5.1 Missive について確かめたこと（公式ドキュメント。2026-10-18）

| 項目 | 内容 |
| --- | --- |
| プラン | Starter（年払いで月 $14 / 月払いで $18。5 人まで。連携・ルール・API・AI なし）/ Productive（$24 / $30。50 人まで。すべてあり・分析は基本）/ Business（$36 / $45）。1 人あたり。**無料プランは無い** |
| トライアルの後 | プランを選ぶまで組織が止まる（送れない・過去の会話が隠れる・通知が止まる）。止まったままだと、つないだアカウントが外れ、データはいずれ消える |
| プランの変更 | 組織の持ち主がパソコンから（スマホのアプリではできない） |
| AI | Productive 以上。**OpenAI・Anthropic・Google Gemini** のどれか。自分の鍵なら上乗せなし、Missive のクレジットなら 25% 上乗せ（最初に $5 分の無料枠）。プロバイダは組織に 1 つずつ足し、使える人を絞れる。返信の下書き・要約・翻訳・定型文の検索、届いたメールで AI を走らせるルール（AI Rules）もある |
| MCP サーバー | `https://mcp.missiveapp.com`。Claude などから会話の検索・下書き・送信ができる（Productive 以上・管理者が有効にする）。考える AI は接続した側のもので、Missive のクレジットは使わない。「Send messages」の権限を渡さなければ下書きまでに留められる |
| 運営会社 | **Heliom Inc.（カナダ・ケベック）** |
| データの置き場所 | Amazon Web Services。サーバーは現在すべて **US East 1（米国・バージニア北部）**（`administration/security/faq`）。データベースは Crunchy Data（米国） |
| 安全管理 | SOC 2 Type II（報告書は請求すれば出す）。Google の OAuth API の検証（Gmail につなぐサービスに必須の外部監査）を通過。通信は TLS、保存時も暗号化 |
| 委託先（Missive のもの） | AWS・Google・Cloudflare・Crunchy Data・Stripe・Segment・Mixpanel・Anthropic（Missive 自身のサポート）など。いずれも米国（ニュースレターの Campaign Monitor だけ豪州） |
| データ処理の取り決め（DPA） | `privacy@missiveapp.com` に頼めば結べる |

## 6. プライバシーポリシーの改定

| 箇所 | いま | 改定 |
| --- | --- | --- |
| 2. 取得する情報「お問い合わせの内容」 | メールアドレスと、お問い合わせいただいた内容 | 「添付された画像」と、「ログイン中に送った場合は、アカウントと店舗の識別子、ブラウザの種類」を足す |
| 6. 委託先 | Google（米国）：お問い合わせのメールの受信と保管 | 「Missive（カナダ。データは米国のサーバーに保存）：お問い合わせへの対応」を足す（運営は Heliom Inc.。§5.1）。Google の行は残す（受信は Workspace のまま） |
| 6. 委託先（Vercel） | サーバー・AI の中継・アクセス解析 | 「不正な送信の判定」を足すか確かめる（BotID はブラウザの情報を判定に使う。Deep Analysis は Vercel が提携する事業者の仕組みを使う） |
| 6. 外国の制度 | 米国の制度へのリンク | **カナダ**の制度（個人情報保護委員会「外国における個人情報の保護に関する制度等の調査」のカナダの頁）へのリンクを足す。データの置き場所は米国なので、米国のリンクはそのまま |
| 6. 基準に適合する体制 | 委託先と取り決めている | Missive とは DPA を結ぶ（§5.1。`privacy@missiveapp.com`）。SOC 2 Type II の報告書も取り寄せておく |
| 窓口 | `support@assift.com` | フォームへのリンク。氏名と住所の開示の文は残す |

- **時期が問題**（§9-9）: ポリシーは 10/30 に制定し、PDF は 10/28 に確定する（030・029）。Missive を使い始める前にポリシーを直す必要がある
- AI の下書き（§5.1）を使うなら、問い合わせの内容が AI の提供元（自分の鍵なら OpenAI・Anthropic・Google のどれか）に渡る。委託先の「AI の提供元：AI を使う機能」で読めるか、文を足すかを決める。
  Missive のクレジットで使うと、Missive の米国の提供元のアカウントを通る（自分の鍵なら直接）。MCP サーバー経由（Claude などから下書き）でも、接続した側の AI に内容が渡る
- スクリーンショットにはスタッフの名前などが写り込む。店舗から委託を受けた情報（ポリシー 4.）を、問い合わせへの対応に使う範囲で受け取ることになる。4. の「店舗が assift を利用するために必要な範囲」で読めるかを確かめる

## 7. 実装の順番

1. §9 を決める。Missive のトライアルで §5 と §8 の Missive の項目を確かめる（コードの前に、別のアドレスから `support@` に Reply-To と添付付きのメールを送れば確かめられる）。
   トライアルは 1 回きり（人に付く）で 30 日なので、**始めるのは実装に取りかかる直前**にする（リリース後。§9-9）
2. `lib/validation/contact.ts`・`lib/contact/{path,attachments,render}.ts` とテスト
3. `lib/contact/send.ts`・`contact/actions.ts`・`bodySizeLimit`
4. `/contact` のページとフォーム・`_lib/resizeImage.ts`
5. BotID（`withBotId`・`initBotId`・`checkBotId`）と CSP の確認（§4.6）
6. §4.8 の置き換えと入口
7. ポリシーの改定（§6）
8. Vercel の環境変数と Firewall のルール（§4.6・§4.9）
9. 確かめる（§8）。AGENTS.md（ディレクトリ・Route・環境変数・`bodySizeLimit`・BotID）と関係するプラン（016 / 017 / 018 / 022 / 023）の記述をそろえる

## 8. 確かめ方

- Vitest: スキーマ（日本語のエラー・上限）、件名の改行と制御文字の置き換え、`?digest=` の判定、添付（枚数・大きさ・先頭のバイト・JPEG でないものを弾く・送るファイル名）、`contactHref`
- 開発: 送るとコンソールにメールの中身が出る。ログイン中は店舗の名前が付き、他人の店舗の id を `?tenant=` に入れても付かない
- プレビュー（`RESEND_API_KEY` と `CONTACT_INBOX` を自分のアドレスで入れる）: 届いたメールの差出人・Reply-To・件名・本文・添付。同じフォームで 2 回押しても 1 通
- 添付: iPhone の Safari でスクリーンショットと写真（HEIC）を選び、縮小されて届く。3 枚で 1MB を超える画像でも送れる（`bodySizeLimit`）。届いた JPEG に位置情報が無い
- Missive（ドキュメントに書かれていない・回答だけのものを実機で確かめる）:
  - 返信の宛先が **Reply-To（相手のアドレス）**になる（§4.5。書かれていない）
  - 返信の差出人に `support@` が自動で選ばれ、相手に `support@` から届く（"From" address reverted が出ない。§5-3）
  - 別の人の問い合わせが 1 つの会話にまとまらない。同じ人の 2 件目は別の会話になる（件名が違うので）か、まとまっても困らない
  - Gmail のフィルタの「assift」のラベルが iOS アプリに出る。通知がどう来るか（Starter で決めるなら §9-1）
  - 添付の画像が見られる
- CSP: `npm run build && npm run start` で `/contact` を開き、画像を選んで送るまでに `securitypolicyviolation` が 0 件（022 §6）。BotID のスクリプトと送信が同一オリジンで成功する
- BotID: 本番相当（Vercel のプレビュー）で人が送ると通り、`curl` で Action を直接叩くと弾かれる
- ハニーポットに値を入れると成功の表示になるが届かない

## 9. 未決（利用者が決める）

| # | 項目 | 選択肢 | おすすめ |
| --- | --- | --- | --- |
| 1 | Missive のプラン | (a) Starter（年払いで月 $14）/ (b) Productive（年払いで月 $24）/ (c) `support@` 専用の Workspace のユーザーを作って Starter でつなぐ | **(b)**。ラベルで分けるのは Starter でも Gmail のフィルタでできるが、Starter は**ラベルごとに通知を絞れない**ので、`admin@sundbox.app` に届く `sundbox.app` のメールまで通知される（§5-5）。Productive ならルールでほかの通知を止められ、AI と MCP サーバーも使える。(c) は Workspace の 1 人分が増え、合計は Productive とほぼ同じ |
| 2 | 特商法の表記のアドレス | 残す / フォームに置き換える | **残す**（法令を確かめるまで。施行規則でメールアドレスが要るのは電子メールで広告するとき、という理解だが確認していない） |
| 3 | 回数の制限 | Vercel Firewall / 自前（DB に数える表） / 当面なし | Vercel Firewall（使えて無料なら） |
| 4 | 返信の目安 | 書かない / 「3 営業日以内」など | 1 人で対応するので書くなら余裕を持たせる |
| 5 | 内容の上限 | 2,000 / 5,000 文字 | 5,000 |
| 6 | 添付の枚数 | 1 / 3 / 5 枚 | 3 枚（縮小すれば 4.5MB の上限に余裕がある） |
| 7 | Missive で Reply-To が効かなかったとき | (a) Missive の custom channel（Productive 以上の API）で会話を作る / (b) 返信のたびに宛先を手で直す | 公式ドキュメントに書かれていないので、**コードの前にトライアルで確かめる**。効かなければ (a) を設計し直す（受信箱に縛られる・返信の送り方も作る必要がある） |
| 8 | AI の下書き | 使わない / Missive の AI（自分の鍵。OpenAI・Anthropic・Gemini）/ MCP サーバー（Claude などから下書き） | 運用して返信の手間を感じてから。使うならポリシーの文を確かめてから（§6） |
| 9 | 時期 | (a) 10/28 のポリシー確定までに入れる / (b) リリース後にポリシーを改定して入れる | **(b)**。カットオーバーの前に規約・ポリシーの PDF を動かさない。リリースまでは今の Gmail で受ける |
| 10 | BotID の Deep Analysis | Basic だけ / 最初から Deep Analysis | Basic から。止まらない投稿が目立ったら有効にする（費用は月 $1 未満の見込み） |

## 10. 実装ログ

（実装後に追記する）

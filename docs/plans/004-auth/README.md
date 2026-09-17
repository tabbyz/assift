# 004: 認証・アカウント

Phase 1 全体設計（`docs/plans/001-phase1-architecture/README.md` §4.3）のマイルストーン 004。
Supabase Auth を使って、サインアップ / ログイン / Google ログイン / パスワード再設定 / アカウント管理 を実装する。
店舗・AppShell は 005 なので、ログイン後の着地は 002 の仮ページ `/tenants` のまま。

---

## 1. 目的と完了条件

### 目的

- メール + パスワードでユーザー登録し、確認メールのリンクでアカウントを有効化できる
- ログイン / ログアウト、Google ログイン（OAuth）、パスワード再設定ができる
- アカウント画面でメールアドレス変更・パスワード変更・アカウント削除ができる
- 認証メールの文言を v1（Devise）から移植し、ローカルでは Mailpit で確認できる

### 完了条件

- `/signup` → 確認メール（Mailpit）→ リンク → ログイン状態で `/tenants` に着地する
- `/login` でメール + パスワードのログインと、`next` パラメータへの復帰ができる
- `/password/forgot` → メール → `/password/reset` で新しいパスワードを設定 → `/tenants`
- `/account` でメール変更（両アドレスに確認メール）・パスワード変更（現在のパスワード必須）・アカウント削除（cascade で全データ消える）
- Google ログインは env に client id / secret を入れれば動く配線になっている（ローカルの資格情報は任意）
- `npm run format:check` / `lint` / `typecheck` / `test` / `build` が通る

---

## 2. 確認済みの前提

| 項目 | 確認結果 |
| --- | --- |
| Supabase ローカル | 起動中。`/auth/v1/settings` は `mailer_autoconfirm: true`（= `enable_confirmations = false`）。**004 で true にする** |
| メール | Mailpit `http://127.0.0.1:54324`（API: `/api/v1/messages`）。`[auth.rate_limit] email_sent` はカスタム SMTP 有効時のみ効く |
| auth-js 2.116 | `verifyOtp({ type, token_hash })`、`exchangeCodeForSession(code)`、`signInWithOAuth` は `data.url` を返す、`resend({ type: 'signup', email })`、`signOut({ scope })`、`admin.deleteUser(id)`、`User.new_email`（メール変更の確認待ち）、`User.app_metadata.providers` |
| `EmailOtpType` | `'signup' \| 'invite' \| 'magiclink' \| 'recovery' \| 'email_change' \| 'email'`。Supabase の SSR ガイドは確認メールに `type=email`、再設定に `type=recovery`、変更に `type=email_change` を使う |
| エラーコード | `invalid_credentials` / `email_not_confirmed` / `user_already_exists` / `same_password` / `weak_password` / `over_email_send_rate_limit` / `otp_expired` / `provider_disabled` などが `AuthError.code` に入る |
| `config.toml` | `[auth.email.template.<confirmation\|recovery\|email_change>]` に `subject` と `content_path`。`[auth.external.google]` は `client_id` / `secret` を `env(...)` で参照。`skip_nonce_check = true` がローカル Google ログインに必要 |
| v1 の文言 | ログイン「メールアドレスでログイン」「パスワードを忘れた方」、登録「登録する（無料）」「パスワード（8文字以上）」「利用規約に同意する」、メール件名「【assift】メールアドレスの確認」「【assift】パスワードの再設定について」。**v1 のパスワード最小長は 8** |
| `(protected)/layout.tsx` | `getAuthUser()` が null なら `/login`。proxy も `/tenants` `/account` `/api/tenants` を守る。`/password/*` `/auth/*` は素通し |
| `currentUser()` / `requireUser()` / `requireAdmin()` | 003 で実装済み |

---

## 3. 決定事項

### 3.1 メールリンクは token_hash 方式（サーバー側で `verifyOtp`）

既定の `{{ .ConfirmationURL }}` は PKCE の code をブラウザに返すため、**リンクを別のブラウザ / 端末で開くと code verifier が無くて失敗する**（メールをスマホで開く利用者が多い）。
Supabase の SSR ガイドどおり、テンプレートに `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=...&next=...` を書き、Route Handler で `verifyOtp({ type, token_hash })` する。verifier が不要なので、どの端末で開いてもそのブラウザにセッションが張られる。

`/auth/callback` は 1 本で 2 種類を受ける（001 の URL 設計と `config.toml` の `additional_redirect_urls` を維持）:

| クエリ | 処理 | 用途 |
| --- | --- | --- |
| `token_hash` + `type` | `verifyOtp` | 確認メール / 再設定メール / メール変更メール |
| `code` | `exchangeCodeForSession` | Google OAuth（同一ブラウザで往復するので PKCE で問題ない） |

成功時は `next`（3.7 で検証）へ、失敗時は `/login?error=link` へ redirect。

### 3.2 Action は `redirect()` せず遷移先を返し、クライアントが `router.push` する

`runAction` の `ActionResult` 契約を保つため。Action 内で `redirect()` すると、クライアントの `await action()` の戻り値が
不定になり `r.ok` の分岐が書けない。ログイン系は `{ ok: true, data: { redirectTo } }` を返して `router.push(redirectTo)`。
Google ログインは `signInWithOAuth` の `data.url` を返して `window.location.assign(url)`。

`logout` / `deleteAccount` も同じ形にした（当初は「戻り値を使わないので Action 内で `redirect()` してよい」としていたが、
cookie を消した直後に `/account` を再レンダリングして `(protected)/layout` の `redirect('/login')` が走る経路が増えるだけなので、例外を作らず統一した）。

### 3.3 パスワードは 8 文字以上

v1 の UI（「パスワード（8文字以上）」）に合わせる。`config.toml` の `minimum_password_length` も 8 にし、Zod（UI とサーバー）と GoTrue の両方で同じ下限にする。上限は bcrypt の 72 バイト。

### 3.4 パスワード変更は現在のパスワードを要求する（v1 と同じ）

`updateUser({ password })` はセッションだけで通るが、v1 は `current_password` を求めていた。セッション盗用時にパスワードを乗っ換えられるのを防ぐ意味があるので維持する。
検証は cookie を持たない使い捨てクライアント（`persistSession: false`）で `signInWithPassword` し、成功したら `updateUser`、使い捨てセッションは `signOut({ scope: 'local' })` で閉じる。
Supabase の `secure_password_change`（再認証メール）は UX が重いので使わない。

Google だけでログインしているユーザー（`app_metadata.providers` に `email` が無い）にはパスワード欄を出さず、v1 と同じ注意書きを出す。メール変更も同様に隠す（Google 側のメールと食い違うと次回ログインで別ユーザーになるため）。

### 3.5 メール変更は Supabase の既定（両アドレス確認）

`double_confirm_changes = true` のまま。旧・新の両方に確認メールが届き、両方のリンクを開くと切り替わる。
`/account` では `User.new_email` を「確認待ち」として表示する。

### 3.6 アカウント削除は `createPrivilegedClient().auth.admin.deleteUser`

001 §4.3 のとおり。`requireUser()` で取った自分の id だけを渡す。`auth.users` の cascade で `profiles` → `tenants` → 全データが消える。
削除後は `signOut({ scope: 'local' })` で cookie を消して `/` へ。

### 3.7 `next` の検証（open redirect 対策）

proxy が `/login?next=<pathname>` を付けるので、ログイン後にそこへ戻す。値は **`/` で始まり `//` や `/\` で始まらない相対パス**だけ許可し、それ以外は `/tenants` に落とす（`src/lib/auth/safeNext.ts`、Vitest）。

### 3.8 Google OAuth の設定は env

`[auth.external.google]` を `enabled = true` にし、`client_id` / `secret` は `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` / `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)`。
ローカルに資格情報が無いときはボタンを押すと GoTrue がエラーを返し、画面に「Google ログインは現在利用できません」と出るだけで他は動く。
Google Cloud Console の承認済みリダイレクト URI は `http://127.0.0.1:54321/auth/v1/callback`（ローカル）/ `https://<project>.supabase.co/auth/v1/callback`（本番、013）。

### 3.9 メール文言は v1 を移植

| テンプレート | 件名 | 本文の要点 |
| --- | --- | --- |
| confirmation | 【assift】メールアドレスの確認 | 「assiftにご登録いただきありがとうございます。下記のリンクをクリックして、ユーザー登録を完了してください。」+ 心当たりが無い場合の注意（v1 invitation_instructions から） |
| recovery | 【assift】パスワードの再設定について | v1 reset_password_instructions の 4 文 |
| email_change | 【assift】メールアドレス変更の確認 | 新規。`{{ .Email }}` → `{{ .NewEmail }}` に変更する旨と、両方のリンクを開く必要がある旨 |

差出人は Supabase 側（Custom SMTP、013）で `assift <noreply@assift.com>` にする。

### 3.10 GoTrue のエラーをそのまま見せない

`AuthError.code` を日本語に変換する `authErrorMessage(error)`（`src/lib/auth/authErrorMessage.ts`、Vitest）。未知のコードは「認証に失敗しました」。ログイン失敗は enumeration を避けて「メールアドレスまたはパスワードが正しくありません」に統一する。

### 3.11 再設定リンクの経路を cookie で固定する

再設定リンクを踏むと**通常のセッション**が張られる。`/password/reset` を「ログイン済みなら開ける」にすると、
盗まれた cookie や離席中の端末から、現在のパスワードを知らないまま新しいパスワードを設定できてしまう
（`/account` のパスワード変更が現在のパスワードを要求している意味が消える）。

JWT の `amr` は使わない。実測するとサインアップ確認も再設定も同じ `[{"method":"otp"}]` になり、
しかもセッションが切れるまで残るため「今このフローに居る」の判定にならない。

`/auth/callback`（Route Handler）だけが付けられる短命 cookie `assift-password-recovery`（httpOnly / 15 分）を印にする。
`/password/reset` のページと Action の両方で必須にし、変更に成功したら消す（使い切り）。

### 3.12 サインアップは「登録済み」を隠さない

ログイン失敗はアカウントの存在を区別しない（§3.10）が、登録は区別する。GoTrue が返す `user_already_exists` を
そのまま「このメールアドレスは既に登録されています。ログイン画面からログインしてください」に訳す。
隠すと、既に登録済みの人が永遠に届かない確認メールを待つことになる。v1 も同じ判断
（`SignUpController#create` が「すでにユーザー登録済みです」でログイン画面へ送る）。

### 3.13 パスワードを持たないアカウントに再設定させない

Google だけで登録したユーザーに `updateUser({ password })` が通ると、パスワードは設定されるのに
`app_metadata.providers` は `['google']` のままになり、`/account` は「パスワードは変更できません」を出し続ける
（本人はパスワードでログインできるのに画面からは変えられない）。`providers` に `email` が無ければ
`requireEmailProviderAccount()`（`lib/actions/guards.ts`）で断る。再設定だけでなくアカウント画面の
メールアドレス変更・パスワード変更にも掛ける（フォームを隠すだけでは Action を直接呼べるため）。v1 の「Googleアカウント経由で登録されたためパスワードは変更できません」と同じ扱い。

---

## 4. 成果物

```
supabase/
  config.toml                         enable_confirmations = true、minimum_password_length = 8、
                                      メールテンプレート 3 種、[auth.external.google]
  templates/
    confirmation.html  recovery.html  email_change.html
src/
  lib/
    auth/
      safeNext.ts (+ .test.ts)        next の検証
      authErrorMessage.ts (+ .test.ts) GoTrue エラー → 日本語
      verifyPassword.ts               使い捨てクライアントで現在のパスワードを検証（server-only）
    validation/auth.ts (+ .test.ts)   login / signup / forgot / reset / updateEmail / updatePassword の Zod
  components/
    LinkAnchor.tsx                    Anchor component={Link}（LinkButton と同じ理由で Client）
  app/
    auth/callback/route.ts            token_hash → verifyOtp / code → exchangeCodeForSession
    (auth)/
      layout.tsx                      中央寄せのカード。タイトル → /
      login/       page.tsx  actions.ts  _components/LoginForm.tsx
      signup/      page.tsx  actions.ts  _components/SignupForm.tsx（送信後は「確認メールを送りました」+ 再送）
      password/forgot/  page.tsx  actions.ts  _components/ForgotPasswordForm.tsx
      password/reset/   page.tsx  actions.ts  _components/ResetPasswordForm.tsx（セッション必須）
    (protected)/
      account/     page.tsx  actions.ts  _components/AccountClient.tsx
      tenants/page.tsx                  仮ページに「アカウント」リンクとログアウトを足す（005 で AppShell に移す）
docs/plans/004-auth/README.md           本ファイル（末尾に実装ログ）
AGENTS.md / README.md / .env.example    認証メールの方式、Google の env
```

### 画面と Action

| 画面 | Action | Supabase |
| --- | --- | --- |
| `/login?next=&error=` | `login({ email, password, next })` → `{ redirectTo }` | `signInWithPassword` |
|  | `loginWithGoogle({ next })` → `{ url }` | `signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback?next= } })` |
| `/signup?email=` | `signup({ email, password, agreed })` | `signUp`（確認メール） |
|  | `resendConfirmation({ email })` | `resend({ type: 'signup' })` |
| `/password/forgot?error=` | `requestPasswordReset({ email })` | `resetPasswordForEmail` |
| `/password/reset` | `resetPassword({ password, passwordConfirmation })` → `{ redirectTo: '/tenants' }` | `updateUser({ password })`（recovery セッション） |
| `/account?notice=` | `updateEmail({ email })` | `updateUser({ email })` |
|  | `updatePassword({ currentPassword, password, passwordConfirmation })` | `verifyPassword` → `updateUser({ password })` |
|  | `deleteAccount()` → redirect `/` | `admin.deleteUser` → `signOut` |
|  | `logout()` → redirect `/login` | `signOut` |

`origin` は Action 内で `headers()` の `origin` / `x-forwarded-host` から組む（`src/lib/auth/requestOrigin.ts`）。

---

## 5. 手順

1. `supabase/templates/*.html` と `config.toml` を書き、`npx supabase stop && npx supabase start` で反映。`/auth/v1/settings` で `mailer_autoconfirm: false` と `google: true` を確認
2. `lib/validation/auth.ts`、`lib/auth/*` とテストを書き `npm test`
3. `/auth/callback` Route Handler
4. `(auth)` の layout と 4 画面 + actions
5. `(protected)/account` と仮 `/tenants` の導線
6. `npm run format && lint && typecheck && test && build`
7. `npm run dev` で手動確認: サインアップ → Mailpit のリンク → `/tenants`、ログイン、再設定、アカウント画面
8. 実装ログを本ファイルに追記し、ユーザー確認のうえでコミット

---

## 6. スコープ外

- AppShell / ヘッダーのアカウントメニュー（005）
- LP のメール入力 → `/signup?email=` のプリフィル送信側（011。受け側は本マイルストーンで対応）
- `/terms` `/privacy`（011。サインアップのリンク先は 404 のまま）
- Custom SMTP、本番 Google OAuth の資格情報（013）
- v1 ユーザーの `auth.users` / `auth.identities` への移行（012）
- 招待未承認ユーザー向けの「迷惑メール案内」画面（v1 `sign_up/confirm`）。Supabase は再送 API があるので「確認メールを再送」ボタンで代替する

---

## 7. 実装ログ（2026-09-17）

### 7.1 成果物

§4 の構成どおり。プランに無かった追加・変更:

| パス | 内容 |
| --- | --- |
| `src/lib/actions/result.ts` | `ActionResult<T = undefined>` → **`ActionResult<T = void>`**。戻り値の無い Action を `Promise<ActionResult>` と書くと `runAction(async () => {...})` が `ActionResult<void>` になり `void` → `undefined` で型エラーになった。AGENTS.md の例がこの形なので既定を `void` にした |
| `src/utils/searchParams.ts` | `firstString()`。`?next=` `?error=` `?email=` `?notice=` を 1 度読むだけなので nuqs は使わない |
| `src/lib/auth/requestOrigin.ts` | `headers()` の `origin` / `x-forwarded-*` から自オリジンを組む（Google の `redirectTo`） |
| `src/components/LinkAnchor.tsx` | `Anchor component={Link}` の Client ラッパー（`LinkButton` と同じ理由） |
| `supabase/config.toml` | 上記のほか `[auth.external.google]` に `redirect_uri = ""` `url = ""` `email_optional = false` を明示（CLI の雛形に合わせた） |

### 7.2 プランどおり確認できたこと

- **token_hash 方式のリンクは 3 種類とも `/auth/callback` で検証できた**（確認 `type=email` / 再設定 `type=recovery` / 変更 `type=email_change`）。使用済みリンクを再度開くと `/login?error=link` に落ちる
- GoTrue は `redirect_to` のホスト名が `site_url` と同じなら許可リストに無くても受け付けるので、Google の `redirectTo` に `?next=` を付けても `additional_redirect_urls` の変更は不要だった（`/auth/v1/authorize` → `accounts.google.com` への 302 に `redirect_to=...%2Fauth%2Fcallback%3Fnext%3D...` が入ることを確認）
- メール変更は旧・新の両方に届き（`{{ .Email }}` / `{{ .NewEmail }}` が両方の本文に展開される）、両方のリンクを開くと `auth.users.email` と `profiles.email`（トリガ）が切り替わった。片方だけの時点では `/account` に「変更予定: ...（確認待ち）」が出る
- `admin.deleteUser` で `profiles` の行が cascade で消え、以後その cookie で `/account` を開くと `/login` に戻される
- `verifyPassword()` の使い捨てセッション方式で「現在のパスワード」の検証ができ、変更後は新パスワードでログインできる

### 7.3 プランからの変更・気づき

- **`env(...)` が未設定のまま `supabase start` すると、GoTrue には `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` という文字列がそのまま渡る**（起動時に警告は出ない）。Google 側で client_id 不正になるだけなので動作に支障はないが、013 では本番の Auth 設定（Dashboard）で必ず入れる。ローカルの手順は README に書いた
- メール変更の `token_hash` には `pkce_` という接頭辞が付いていたが、`verifyOtp` はそのまま受け付けた
- `signUp` は確認済みの既存メールに対して `user_already_exists` を返した（enable_confirmations = true でも隠されなかった）。画面には「このメールアドレスは既に登録されています」と出る。プラン §4 の「成功として返す」は未確認ユーザーの再登録時の挙動で、その場合は確認メールが再送される
- proxy はメソッドを見ないので、ログイン済み cookie を持ったまま `/login` `/signup` の Action を POST すると `/tenants` に 307 される。通常の画面遷移では起きない（ログイン済みでこれらの画面は開けない）ので今回は触らない
- ポート 3000 では作業開始前から `next-server`（`npm run dev` と思われる）が動いていたため、検証用の本番ビルドは 3001 で起動した。検証後に停止済み。3000 のプロセスは触っていない

### 7.4 検証結果

```
npm run format:check   → OK
npm run lint           → OK
npm run typecheck      → OK
npm test               → 4 files / 19 tests passed（validation/auth, auth/safeNext, auth/authErrorMessage, actions/error）
npm run build          → OK（/login /signup /password/forgot /password/reset /account /auth/callback /tenants は dynamic）
npx supabase test db   → 22 tests PASS（変更なし）
```

本番ビルド（`npm start`、port 3001）に対する HTTP レベルの確認:

| 操作 | 結果 |
| --- | --- |
| `GET /login` `/signup` `/signup?email=` `/password/forgot` | 200 |
| `GET /password/reset`（セッション無し） | 307 `/password/forgot?error=expired` |
| `GET /account`（未ログイン） | 307 `/login?next=%2Faccount` |
| `GET /auth/callback`（パラメータ無し / 不正な token_hash） | 307 `/login?error=link` |
| 確認メールのリンク | 307 `/tenants` + `sb-*` cookie。続けて `GET /tenants` が 200 でメールアドレスを表示 |
| 再設定メールのリンク | 307 `/password/reset` + cookie。`GET /password/reset` 200 |
| メール変更メールのリンク（旧・新） | いずれも 307 `/account?notice=email_change`。両方後に `/account` が新メールを表示 |

Server Action を `Next-Action` ヘッダで直接呼び出した結果（`ActionResult` の JSON）:

| Action / 入力 | 結果 |
| --- | --- |
| `login` 不正なパスワード | `メールアドレスまたはパスワードが正しくありません` |
| `login` メール形式不正 | `メールアドレスの形式が正しくありません`（Zod） |
| `login` 正常 + `next=/tenants/x/shifts` | `ok`、`redirectTo: /tenants/x/shifts`、cookie 発行 |
| `login` 正常 + `next=//evil.com` | `redirectTo: /tenants`（safeNext） |
| `login` 未確認ユーザー | `メールアドレスの確認が完了していません…` |
| `signup` 規約未同意 / 7 文字 | `利用規約と…同意が必要です` / `パスワードは8文字以上で入力してください` |
| `signup` 正常 / 既存メール | `ok`（Mailpit に確認メール）/ `このメールアドレスは既に登録されています` |
| `resendConfirmation` | `ok`（再送） |
| `loginWithGoogle` | `ok`、`url` は GoTrue の `/authorize?provider=google&redirect_to=…%2Fauth%2Fcallback%3Fnext%3D…` |
| `updatePassword` 現在のパスワード誤り / 確認不一致 / 正常 | `現在のパスワードが正しくありません` / `確認用のパスワードが一致しません` / `ok`（新パスワードでログイン可） |
| `updateEmail` 現在と同じ / 別アドレス | `現在のメールアドレスと同じです` / `ok`（旧・新に 2 通） |
| `logout` | `ok`、`redirectTo: /login`、`sb-*` cookie が `Max-Age=0` で削除 |
| `deleteAccount` | `ok`、`redirectTo: /`。`profiles` 0 行、Admin API で 404 |

ブラウザでの見た目（Mantine のフォーム、通知、確認モーダル）は未確認。`npm run dev` で `/login` から一巡してもらうのが早い。

### 7.5 005 以降への申し送り

- `logout` は `(protected)/account/actions.ts` にある。AppShell のメニューから呼ぶときはここから import する（移動するなら 005 で）
- `/tenants` の仮ページに置いた「アカウント」ボタンと「ログイン中: …」は 005 の AppShell に置き換える
- 確認メールの `next` は `/tenants` に固定している。005 で「店舗が無ければ `/tenants/new`」の redirect が入れば、初回登録者はそのまま店舗作成に着地する
- 013: Supabase Dashboard に Google の client id / secret、Custom SMTP（`assift <noreply@assift.com>`）、メールテンプレート 3 種（`supabase/templates/` と同じ内容。`config.toml` はローカル専用）、`site_url` / redirect URL を設定する

---

## 8. セルフレビューでの修正（2026-09-17）

実装後に差分全体をレビューして直した点。検証は本番ビルド（`npm start`、port 3001）に対する実測。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | `resetPassword` がセッションさえあれば通る。盗まれた cookie / 離席中の端末から、現在のパスワードなしでパスワードを変えられる | §3.11 の再設定 cookie を必須にした（ページと Action の両方） | 通常ログインのセッションで `GET /password/reset` → `/password/forgot?error=expired`、Action も拒否。リンク経由なら通り、2 回目は cookie 消費済みで拒否 |
| 2 | メールアドレス変更の**1 通目**の検証はセッションを返さない（auth-js が `{msg, code}` を `session: null` に変換）。未ログインの端末で開くと保護ページに飛ばされ通知が消える | `type === 'email_change' && !data.session` を公開ページ `/auth/email-change` へ | 1 通目を空の cookie で開いて 307 → `/auth/email-change`、2 通目で `/account?notice=email_change` かつメールアドレスが切り替わる |
| 3 | `verifyPassword` が全失敗を「パスワードが違う」にする。レート制限や通信エラーでも嘘になる | `AuthError` を返すようにし、`currentPasswordErrorMessage()`（純関数・テスト付き）で `invalid_credentials` だけをその文言に | Vitest 4 件（資格情報 / レート制限 / 通信エラー / セッション無し）。誤ったパスワードの文言が変わらないことも実測 |
| 4 | `?error=constructor` などで `Record<string, string>` がプロトタイプ上の値を返し、関数が Client Component に渡って画面が落ちる | `lookup()`（`src/utils/record.ts`、`Object.hasOwn`）経由に統一。`/login` `/password/forgot` `/account` の 3 か所 | `?error=constructor` `__proto__` `toString` がいずれも 200。Vitest 3 件 |
| 5 | `/auth/callback` の失敗が全部 `/login?error=link`。Google のキャンセルも「リンクが期限切れ」になり、ログイン中だと proxy がクエリを捨てて無言になる | `type` とログイン状態で戻り先を分けた（recovery → `/password/forgot?error=expired`、ログイン中 → `/account?error=…`、OAuth → `oauth` / `oauth_cancelled`） | 6 パターンの redirect 先を実測。文言も表示を確認 |
| 6 | `/account` だけ `getUser()`（ネットワーク）で弾くため、proxy の `getClaims()`（JWT）と判定がずれるとログアウトできなくなる | 判定は `getAuthUser()` に統一し、`getUser()` 失敗時は `AccountUnavailable`（ログアウトだけできる画面）を返す | auth コンテナを停止すると `/tenants` は 200、`/account` も 200 で当該パネルを表示（従来は `/login` → `/tenants` に跳ね返っていた） |
| 7 | メールアドレス変更のメールが新旧どちらにも `{{ .Email }}`（= 旧アドレス）で呼びかける | 宛名を `{{ .SendingTo }}` に | 2 通の本文冒頭がそれぞれ `dev@example.com さん` / `dev2@example.com さん` になることを Mailpit で確認 |
| 8 | `signup` のコメントが「既存メールでも成功を返す」と実装と逆 | §3.12 として判断を明記し、コメントを実装に合わせた。文言に「ログイン画面からログインしてください」を追加 | 既存メールで `user_already_exists` の文言が出る |
| 9 | Google だけのユーザーが再設定経由でパスワードを持てるのに `/account` は「変更できません」のまま | §3.13 の guard を `resetPassword` に追加 | DB で Google 専用（identity=google / パスワード無し）を再現し、リンクを踏んでも拒否され `encrypted_password` が null のままであることを確認 |
| 10 | `deleteAccount` の `createPrivilegedClient()` が AGENTS.md の禁止事項と衝突 | AGENTS.md と `createPrivilegedClient.ts` に例外（自分の id のみ、`requireUser()` 由来）を明記 | — |

あわせて直した軽微な点:

- `/tenants` の仮ページが `currentUser()` で `profiles` を読んでいた → 表示はメールアドレスだけなので `getAuthUser()` に
- 「メールを送りました」パネルとエラー Alert が 4 画面で重複 → `src/components/MailSentPanel.tsx` / `FormErrorAlert.tsx` に集約
- `updatePasswordSchema` の `z.object().and()` を 1 つの object + `refine` に。未使用の `*Input` 型 export を削除
- `authErrorMessage` の `validation_failed` が `INVALID_INPUT_MESSAGE` を再定義していたので import に

### 8.1 再検証

```
npm run format:check / lint / typecheck / build → OK
npm test        → 5 files / 26 tests passed
npx supabase db reset && npx supabase test db → 22 tests PASS
```

クリーンな DB での通し確認: signup → 確認メール → `/tenants` 200（新規ユーザーのメールアドレス表示）→ `/account` 200。

### 8.2 残っている既知の挙動

- proxy はメソッドを見ないため、ログイン済みの cookie で `/login` `/signup` の Server Action を POST すると `/tenants` へ 307 される。通常の画面遷移では起きない（ログイン済みでこれらの画面は開けない）
- GoTrue の `sign_in_sign_ups` レート制限はローカルでは発火させられなかった。`currentPasswordErrorMessage()` のレート制限分岐はユニットテストで固定した
- ブラウザでの確認は §9 で実施した

---

## 9. ブラウザでの動作確認（2026-09-17）

`npm run dev`（:3000）に対し、実際の Chrome を Playwright で操作して一巡した。
検証コードはリポジトリに入れていない（scratchpad のみ。E2E を常設するのは「必要になってから」の方針どおり）。

| 画面 / 操作 | 結果 |
| --- | --- |
| `/login` の表示 | フォーム・Google ボタン・2 つのリンクが出る |
| `?error=link` / `?error=oauth_cancelled` | それぞれの文言が出る |
| `?error=constructor` `__proto__` | 警告を出さず通常表示。console エラーなし |
| ログイン失敗 → 成功 | 文言が出たあと `/tenants` に着地 |
| `/signup` の検証 | 規約未同意・8 文字未満をそれぞれ弾く |
| 登録 → 確認メールパネル → 再送 | パネル表示、再送の通知も表示 |
| 確認メールのリンク | ログイン状態で `/tenants`、メールアドレスが出る |
| `/account` | 4 セクションが表示。確認不一致 → 現在のパスワード誤り → 成功、の順に正しい文言 |
| メールアドレス変更 | 通知 → 再読込で「変更予定（確認待ち）」 |
| 変更メール 2 通 | 旧宛は旧アドレス、新宛は新アドレスで呼びかける（§8 の 7） |
| 1 通目を未ログインの別コンテキストで開く | `/auth/email-change` に着地して案内が出る（§8 の 2） |
| ログアウト | `/login` へ |
| `/password/reset` に直接アクセス | 未ログイン・ログイン中のどちらも `/password/forgot` へ（§8 の 1） |
| 再設定メール → リンク → 新パスワード | `/tenants` に着地し、再訪すると `/password/forgot` へ（使い切り） |
| アカウント削除 | 確認モーダル → トップへ。`profiles` は seed の 1 件だけになる |
| スマホ幅（390px） | `/login` `/signup` `/password/forgot` `/account` とも横スクロールなし |

console エラーは全経路で 0 件。

### 9.1 確認中に分かったこと

- **入力エラーは先頭の 1 件だけ出る**。パスワード未入力かつ規約未同意なら、先にパスワードのエラーが出て、直してから規約のエラーが出る。`toActionError` が先頭 issue を返す設計どおりだが、フォームが増えたら項目ごとの表示を検討する余地はある
- **登録直後に「確認メールを再送」を押すと GoTrue の送信間隔制限に当たる**（ローカルは `max_frequency = 1s` なので 1 秒待てば通る）。本番の既定は 60 秒なので、実際には「メールの送信回数が上限に達しました」が出やすい。文言は妥当だが、013 で `max_frequency` を決めるときに再考する
- `/auth/email-change` だけロゴ枠が無かったので `(auth)` グループへ移した（URL は変わらない）

### 9.2 それでも未確認のこと

- Google ログインの実際の往復（Google 側の資格情報がローカルに無い。013 で確認する）
- 実機のスマートフォン。ブラウザのモバイルエミュレーションのみ

---

## 10. 2 回目のレビューでの修正（2026-09-17）

§8 の修正後にもう一度レビューして直した点。

| # | 指摘 | 対応 | 確認方法 |
| --- | --- | --- | --- |
| 1 | `safeNext()` が**タブ文字**を通す。`?next=/%09/evil.com` はデコードすると `/<TAB>/evil.com` で、`//` 始まりでも改行でもないため検査を抜けるが、URL パーサはタブを取り除いてから解釈するので `//evil.com` として解決される。ログイン後の `router.push` と `/auth/callback` の両方に効く実害 | 文字列の形で判定するのをやめ、**実際に `new URL(value, base)` で解決してオリジンが一致したものだけ通す**。`//` 始まりは入口で落とす。戻り値は正規化済みのパス + クエリ + ハッシュ | `login` が返す `redirectTo` と Google の `redirect_to` がどちらも `/tenants` に落ちることを実測。Vitest にタブ・CR・LF・`\`・ユーザー情報付きホストの 7 ケース |
| 2 | `resetPassword` が `getUser()` の `error` を捨てており、一時的な失敗で `providers` が空になると、メールで登録した人にまで「Google で登録されています」と言って再設定を拒む | guard に切り出し、読めなかったときは Google 専用と決めつけず認証エラーとして返す | auth コンテナを止めた状態で実行し、文言が「認証に失敗しました。時間をおいて再度お試しください」になることを確認 |
| 3 | `updateEmail` に Google 専用アカウントのサーバー側チェックが無い（フォームを隠しているだけ）。同じ制限を持つ `resetPassword` はサーバーで断っており不揃い | `requireEmailProviderAccount()` を `updateEmail` / `updatePassword` にも掛けた。アカウント画面向けの文言は別に用意 | Google 専用アカウントのセッションで両 Action を直接呼び、どちらも断られることを確認 |
| 4 | proxy のログイン誘導が `search` を捨て、`next` にパスだけを入れる。`?start=` 付きの深いリンクから飛ばされると戻り先の表示期間が失われる | `next` をパス + クエリで組む | 未ログインで `/tenants/abc/shifts?start=2026-10-01&view=week` を開き、ログイン後に同じ URL（クエリ込み）へ戻ることをブラウザで確認 |

### 10.1 再検証

```
npm run format:check / lint / typecheck / build → OK
npm test        → 5 files / 29 tests passed
npx supabase db reset && npx supabase test db → 22 tests PASS
```

ブラウザ（`npm run dev`）でも、深いリンクからの復帰・アカウント画面の 2 フォーム・`/password/reset` の遮断を再確認した。console エラーは 0 件。

### 10.2 `safeNext` の考え方を変えた理由

初版は「`//` で始まらない `/` 始まりの文字列」を許可リストにしていた。URL の解釈はパーサ側で
タブ・改行の除去やバックスラッシュの読み替えが起きるため、**文字列の見た目と解決結果がずれる**。
禁止パターンを足していく形だと次のずれをまた見落とすので、解決結果そのものを条件にした。

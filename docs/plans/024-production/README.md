# 024: 本番の Supabase（東京）/ Vercel を作る

- 前提: 001 §5.4（カットオーバー手順の 1）/ 003 §10.6（本番に初めて入れたあとの確認）/ 004 §7.5（Auth の Dashboard 設定）/
  017 §7 2026-10-13（Resend）/ 016-terms §7（DNS）/ 020 §10（管理画面のホスト）/ 021 §9.3（本番に対する予行）/ 022 §6（CSP の確かめ方）/ 023 §6（ブランチ専用の環境変数）
- 番号: 021 の「022（カットオーバー）」は、022 = CSP、023 = エラー画面に使われたので **024 以降**と読み替える。
  カットオーバーは本プラン（本番の構築）と、Stripe の live・予行・告知・当日の進行に分ける（§2）
- 予定: 10/14〜10/15（クリティカルパス）
- **作業するのは人間**（Dashboard の操作と秘密の値）。リポジトリの変更は `vercel.json` の関数のリージョンだけ（§4.6）

**状態: プラン（2026-10-14）。§3・§7 の決定は 2026-10-14 に確認。**

## 1. 目的と完了条件

カットオーバーの当日に DNS を切り替えれば本番として動く Supabase と Vercel を、**仮のホスト**（§3-3）で先に動かして確かめておく。
当日にすることを「値の差し替え」（§6）だけにする。

- [ ] Supabase: 本番のプロジェクト（東京。Branching の親）に migration 8 本が入り、003 §10.6 の確認が通る
- [ ] Auth: Site URL・Redirect URLs・メールテンプレート 3 種・Custom SMTP（Resend）・Google OAuth（新しい Google Cloud のプロジェクト）・`config.toml` と同じ値が本番に入っている
- [ ] Resend: `assift.com` が Verified（東京リージョン）。本番から送った確認メールが `assift <noreply@assift.com>` で届き、SPF / DKIM が pass
- [ ] Vercel: 関数が東京（`hnd1`）で動く。Production の環境変数が揃い、仮のホストで開ける
- [ ] 仮のホストで確かめる（§5）: 登録 → 確認メール → ログイン / Google ログイン / パスワード再設定 / 店舗の作成〜シフト表 / PDF・CSV / 共有ページ / 管理画面 / CSP の違反 0 件
- [ ] 管理用アカウントだけが残っている（試しのアカウントと店舗を消した）。021 §9.3 の予行を流せる

## 2. 範囲

### する

| # | 内容 | 根拠 |
| --- | --- | --- |
| 1 | 既存の Supabase プロジェクト（`ap-northeast-1`。データなし・migration 未実行。Branching の親）を本番にする | §3-2 |
| 2 | migration を入れ、003 §10.6 を確かめる | 003 §10.6 |
| 3 | Auth の設定 | 004 §7.5 |
| 4 | Resend（ドメインの検証・API キー）と Supabase の Custom SMTP | 017 §7 |
| 5 | 新しい Google Cloud のプロジェクトで OAuth クライアント | §3-8 |
| 6 | Vercel: 関数のリージョン・Production の環境変数・仮のホスト | §3-3・§3-4 |
| 7 | 管理用アカウント（`is_admin`） | 020 §5.1・021 §9.3 |
| 8 | 仮のホストでの通しの確認 | §5 |

### しない（別の残タスク）

- **Stripe の live**（019 §8.3-1・2: `stripe:setup`・Webhook の登録・Dashboard の設定）。`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / **`CRON_SECRET`** もそちらで入れる（§4.7）
- **021 §9.3 の `--rollback` の予行**。本プランは流せる状態（接続文字列・管理用アカウントだけ）まで
- DNS の切り替え（`assift.com` / `admin.assift.com`）・告知・当日の移行（021 §10）。当日に差し替える値は §6 に置く
- アクセス解析（`@vercel/analytics`。017: 10/30 までに入れる。コードの変更と CSP の確認が要る）
- PITR（リリース後に検討。§3-6）
- Supabase の独自ドメイン（Google の同意画面に `<ref>.supabase.co` が出る。リリース後に検討）

## 3. 決定（2026-10-14）

| # | 項目 | 決定 | 理由 |
| --- | --- | --- | --- |
| 1 | 既存の Supabase の親 | `ap-northeast-1`、データなし、migration 未実行。Vercel の Production の最新デプロイは Ready | 確認済み |
| 2 | 本番のプロジェクト | **既存の親をそのまま本番にする**（新しく作らない） | 東京で空。Branching・Vercel 連携を作り直さずに済む |
| 3 | DNS 切り替え前の確認 | **仮のサブドメイン**を Gehirn DNS に足す（本体 `v2.assift.com`・管理画面 `admin-v2.assift.com`。§3-11・§4.6） | Google OAuth・メールのリンク・cookie・管理画面のホストを本番と同じ形で試せる。`*.vercel.app` では `ADMIN_HOST` と `SITE_URL` が本番と違う形になる |
| 4 | 関数のリージョン | **`vercel.json` に `"regions": ["hnd1"]`**（東京 1 つ）。大阪（`kix1`）を足すマルチリージョンにはしない | §3.1 |
| 5 | 範囲 | Supabase / Vercel / Auth / Resend まで。Stripe の live・予行・解析は別 | §2 |
| 6 | Supabase の設定 | PITR はリリース後に検討 / Spend cap はオンのまま / 送信の上限などは §4.3 の推奨値 | |
| 7 | Resend のリージョン | 東京（`ap-northeast-1`） | ポリシーは「Resend（米国）」（事業者の国）なので矛盾しない |
| 8 | Google OAuth | v2 用に**新しい Google Cloud のプロジェクト**を作る | |
| 9 | Resend のプラン | **最初から Pro** | 当日の再設定の集中で無料プラン（1 日 100 通）を越えない |
| 10 | migration の自動適用（Deploy to production） | **リリースまではオフ**。本プランと当日までの差分は `db push` で手で入れる。オンにするかはカットオーバーのプランで決める | 予行・移行の最中に本番のスキーマが動かない（§4.8） |
| 11 | 仮のホストの名前 | 本体 `v2.assift.com`・管理画面 `admin-v2.assift.com` | Gehirn DNS で未使用か §4.1 で確かめる |

### 3.1 マルチリージョン（東京 + 大阪）にしない理由

- **DB が東京の 1 か所なので、関数を増やしても可用性はほとんど上がらない。** 大阪の関数も東京の DB に問い合わせるので、東京の Supabase が止まれば同じく止まる。
  守れるのは「Vercel の東京リージョンだけが落ち、Supabase は生きている」場合だけ
- 大阪の関数は、DB への往復ごとに東京との距離（数 ms〜10 ms 程度）が乗る。シフト表は 1 回の描画で何本もクエリを投げるので、近いはずの西日本の利用者のほうが遅くなりうる
- リージョンが分かれると、それぞれでコールドスタートが起きる（Fluid compute のインスタンスを共有しない）。利用者数の規模では 1 か所にまとめたほうが温まりやすい
- 1 リージョンでも、Vercel のエッジ（静的ファイル・CDN）は全国から近い所で応答する。関数のリージョンが効くのは SSR・Server Action・Route Handler だけ
- 必要になれば `vercel.json` の配列に足すだけで変えられる（DB の載せ替えとは違い、あとから戻せる）

## 4. 手順（人間が行う）

秘密の値（DB のパスワード・secret key・Resend / Google の secret）は**パスワードマネージャにだけ**置き、チャット・リポジトリ・PR に書かない。

### 4.1 事前に見るもの

- Supabase: Project Settings → General の Region が `ap-northeast-1`。Billing でプランが Pro、Spend cap がオン
- Supabase: Database → Settings の Postgres のメジャー版が **17**（`config.toml` の `major_version = 17`）
- Supabase: Integrations → GitHub の設定で、production branch が `main`、Supabase のディレクトリが `supabase`、**「Deploy to production」がオフ**（migration 未実行と合っているか）
- Vercel: Settings → Environment Variables の **Production** に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` があり、URL がこのプロジェクトの `<ref>.supabase.co` であること
  （Production が Ready なので 2 つの公開値はあるはず。`SUPABASE_SECRET_KEY` の名前は 023 §6 で未確認。連携が別の名前で入れていたら、§4.7 で `SUPABASE_SECRET_KEY` を足す）
- Gehirn DNS: `v2` / `admin-v2` が未使用であること

### 4.2 migration を入れる

初回は手で入れる（中身を dry-run で見てから流せる。連携の自動適用は §4.8 で決める）。

```bash
npx supabase login
npx supabase link --project-ref <ref>          # DB のパスワードを聞かれる
npx supabase migration list                     # Remote が空、Local が 8 本
npx supabase db push --dry-run                  # 8 本が並ぶこと
npx supabase db push                            # seed は流れない（--include-seed を付けない）
npx supabase migration list                     # Local と Remote が 8 本ずつ揃う
```

SQL Editor で確かめる（003 §10.6）:

```sql
-- 2 行（on_auth_user_created / on_auth_user_email_updated）
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname like 'on_auth_user_%';
-- 0
select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
-- 0（public の関数に anon の EXECUTE が残っていない）
select count(*) from information_schema.role_routine_grants where routine_schema = 'public' and grantee = 'anon';
-- public のテーブルがすべて RLS 有効（0 行）
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

あわせて Project Settings → API（Data API）:

- Exposed schemas が `public`（と `graphql_public`）だけ。**`private` を出さない**（AGENTS.md の RLS 4）
- Max rows が **1000**（`config.toml` と同じ。`pageAll()` の前提）

### 4.3 Auth の設定

`config.toml` はローカル専用で、本番には自動では入らない（§4.8 の注意も見る）。Dashboard → Authentication で入れる。

| 画面 | 値 |
| --- | --- |
| URL Configuration → Site URL | `https://v2.assift.com`（仮。当日に `https://assift.com`。§6） |
| URL Configuration → Redirect URLs | `https://v2.assift.com/auth/callback`。プレビュー用の `https://*-sundbox.vercel.app/**` は `config.toml` と同じく残す（ブランチ DB は `config.toml` から作られるが、念のため） |
| Sign In / Providers → Email | Enable、**Confirm email オン**、**Secure email change オン**（`double_confirm_changes`）、Secure password change オフ、パスワードの最小 **8 文字**、要件なし |
| Sign In / Providers → そのほか | Allow new users to sign up オン / Anonymous オフ / Manual linking オフ |
| Sessions | **Refresh token rotation オン**、reuse interval **10 秒**（`enable_refresh_token_rotation = true`。AGENTS.md の proxy の項の前提） |
| JWT の有効期限 | 3600 秒（既定のまま） |
| Emails → Templates | 確認・再設定・メール変更の 3 種。件名は `config.toml`（`【assift】メールアドレスの確認` / `【assift】パスワードの再設定について` / `【assift】メールアドレス変更の確認`）、本文は `supabase/templates/*.html` を貼る。そのほかのテンプレートは使わない |
| Emails → SMTP Settings | §4.4 |
| Rate Limits | **メールの送信 100 通 / 時**（推奨。ローカルの 2 はテスト用。§4.3.1）。トークンの更新 150・サインイン / サインアップ 30・OTP の検証 30（いずれも 5 分あたり。`config.toml` と同じ = 既定） |
| Emails → SMTP Settings → Minimum interval between emails being sent | **60 秒**（ローカルの `max_frequency = "1s"` はテスト用）。Custom SMTP をオンにすると出る欄（§4.4）。出なければ既定のまま |
| MFA | TOTP・電話とも無効（020 §12-4 のとおり入れない） |

#### 4.3.1 メールの上限の考え方

- 送るのは確認・再設定・メール変更だけ（宣伝のメールは送らない。017 §7）。ふだんは 1 時間に数通
- 当日は v1 の利用者が再設定を集中して送りうる（v1 と同じパスワードでログインできるので多くはない見込み）。100 通 / 時ならこれを受け、総当たりのような大量送信は止める
- Resend は**最初から Pro**（§3-9）。無料プランの 1 日 100 通の上限は当日に効かない

### 4.4 Resend と Custom SMTP

1. Resend にサインアップ → Domains → Add Domain: `assift.com`、Region **Tokyo (ap-northeast-1)**
2. 表示されたレコードを Gehirn DNS に足す（DKIM の `resend._domainkey`、送信用のサブドメインの MX と SPF の TXT。**ルートの SPF・MX・DMARC は触らない**。016-terms §7）
3. Verified になったら API Keys → Create: 権限 **Sending access**、ドメイン `assift.com` に限定
4. Supabase → Authentication → Emails → SMTP Settings:
   - Enable custom SMTP オン
   - Sender email `noreply@assift.com`、Sender name `assift`
   - Host `smtp.resend.com`、Port `465`、Username `resend`、Password = 3 の API キー
5. 確かめる: §5 の登録で届いたメールのヘッダーで `spf=pass`・`dkim=pass`（Gmail の「メッセージのソースを表示」）。差出人が `assift <noreply@assift.com>`

### 4.5 Google OAuth（新しい Google Cloud のプロジェクト）

1. Google Cloud Console → 新しいプロジェクト（例: `assift-v2`）
2. Google Auth Platform（OAuth 同意画面）: User type **External**、アプリ名 `assift`、サポートのメール・デベロッパーの連絡先、
   承認済みドメイン `assift.com`、ホームページ `https://assift.com`、プライバシーポリシー `https://assift.com/privacy`、利用規約 `https://assift.com/terms`。
   スコープは既定（`openid` / `email` / `profile`）だけ。**ロゴは載せない**（載せるとブランドの確認の審査が要る）
3. 公開ステータスを **In production** にする（テスト中のままだとテストユーザーしかログインできない）
4. Clients → Create: 種類 **Web application**、
   承認済みの JavaScript 生成元 `https://v2.assift.com`（当日に `https://assift.com` を足す。§6）、
   承認済みのリダイレクト URI **`https://<ref>.supabase.co/auth/v1/callback`**（Supabase のコールバック。アプリの `/auth/callback` ではない。当日も変えない）
5. Supabase → Authentication → Sign In / Providers → Google: Enable、Client ID / Secret を入れる（**ブラウザの自動入力に注意**。2026-10-14 に Client IDs へメールアドレスが自動で入っていた）。
   **Skip nonce checks はオフ**（`config.toml` の `true` はローカルの Google ログインのためだけ。本番は `signInWithOAuth` のリダイレクト方式で、nonce の確認を飛ばす理由が無い）。Allow users without an email もオフ

### 4.6 Vercel

1. **関数のリージョン**: `vercel.json` の `"regions": ["hnd1"]`（本プランの変更）を main に入れる。
   入ったあと Deployments → 最新の Production → Functions（または Runtime Logs）でリージョンが `hnd1` になっていることを見る。
   Settings → Functions の Function Region は、以前に手で `hnd1` + `kix1`（東京 + 大阪）にしてあった（2026-10-14 に確認）。
   `vercel.json` の `regions` が優先され、画面には **Overridden** の札が出る（Dashboard の値は表示されたままだが効かない。想定どおり）。
   将来 `vercel.json` から `regions` を消したときに大阪が戻らないよう、**Dashboard も `hnd1` だけにして Save** する。
   効いているかは Dashboard ではなく、デプロイの詳細（Functions / Runtime Logs のリージョン）で確かめる
2. **仮のホスト**: Settings → Domains → Add
   - `v2.assift.com`（Production。main に結び付ける）
   - `admin-v2.assift.com`（Production）
   - Gehirn DNS にそれぞれ CNAME（Vercel が表示する値。例: `cname.vercel-dns.com.`）を足す → Vercel の画面で Valid Configuration・証明書の発行を待つ
3. **Deployment Protection**: Settings → Deployment Protection が Standard（プレビューだけ守る）であること。仮のホストは Production のドメインなので守られない（外から開ける）。
   ※ 公開前のホストを誰でも開ける状態になる。DB は空で、試しのアカウントは §5 の最後に消す。仮のホストは当日に外す（§6）

### 4.7 Vercel の Production の環境変数

| 名前 | 値 | いつ |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 連携が入れたもの（§4.1 で確かめる） | 済み |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys の secret key（連携が同じ名前で入れていなければ足す。**Sensitive**） | 本プラン |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway のキー（Production にもあるか見る。**Sensitive**） | 本プラン |
| `ADMIN_HOST` | `admin-v2.assift.com`（当日に `admin.assift.com`。§6） | 本プラン |
| `SITE_URL` | `https://v2.assift.com`（当日に `https://assift.com`。§6） | 本プラン |
| `ASSIST_DAILY_LIMIT` / `ASSIST_INTERPRET_MODEL` | 入れない（既定 10 回 / `openai/gpt-6-sol`） | — |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `CRON_SECRET` | **入れない**。Stripe の live のタスクで入れる | 別タスク |

- **`CRON_SECRET` を Stripe より先に入れない**: `vercel.json` の cron は Production でだけ毎晩走る。`CRON_SECRET` だけあると Stripe が無いので毎晩 503 になり、
  Vercel の実行履歴が赤くなる（害は無いが、失敗に慣れると本物の失敗を見落とす）。いまは 401 で止まっている
- 環境変数を変えたら Production を **Redeploy**（`NEXT_PUBLIC_` はビルド時に埋め込まれ、ほかも新しいデプロイから効く）

### 4.8 migration の自動適用と `config.toml` の上書き（確かめること）

- Supabase の GitHub 連携の「Deploy to production」をオンにすると、main へのマージで migration が本番に入る（Vercel のデプロイとどちらが先かは決まっていない）。
  **リリースまではオフのまま**（決定。§3-10。本プランの 1 回と、当日までの差分は `db push` で手で入れる。予行や移行の最中に本番のスキーマが動かない）。
  リリース後にオンにするかは、カットオーバーのプランで決める
- **Branching の連携が、main へのマージで `config.toml` の `[auth]`（`site_url = localhost`・送信の上限 2 など）を本番に上書きしないか**は、
  2026-10-14 に一次資料で確かめられなかった（この環境から supabase.com に届かなかった。検索結果の要約では「本番へのデプロイで config.toml からサービスの設定を更新する」「API / Auth は既定で無視」が混在）。
  **§4.3 を入れたあと、最初に main へマージしたとき**に確かめる（そのマージが `config.toml` を変えるかに関わらず。毎回当てるのか、変わったときだけかも分からない）。
  マージの前に下の画面のスクリーンショットを撮り、マージから数分後に同じ画面と比べる（いずれも Dashboard → Authentication）:

  | 画面 | 上書きされたときの値（`config.toml`） |
  | --- | --- |
  | **URL Configuration**（Site URL / Redirect URLs） | `http://localhost:3000` / localhost と `*-sundbox.vercel.app` だけ |
  | **Rate Limits**（メールの送信） | 2 通 / 時 |
  | Emails → SMTP Settings | Custom SMTP がオフ（`config.toml` に SMTP が無い） |
  | Emails → Templates | 中身は同じなので見分けられない |
  | Sign In / Providers → Google | Client ID が空（`env(...)` が解決されない） |
  | Sign In / Providers → Email の再送間隔 | 1 秒 |

  URL Configuration と Rate Limits が変わっていなければ上書きは無いとみなす。
  変わっていたら、`config.toml` に `[remotes.production]`（`project_id = "<ref>"`）を足して本番の値を書く（秘密は `env(...)`）方式に切り替える

### 4.9 管理用アカウント

1. Supabase → Authentication → Users → Add user → Create new user: 管理専用のメール（**v1 のどのユーザーとも重ならない**もの。021 §9.3）・強いパスワード、**Auto Confirm User オン**
2. SQL Editor:

   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = '<管理用のメール>');
   select id, email, is_admin from public.profiles;   -- 1 行、is_admin = true
   ```

3. `https://admin-v2.assift.com/-/login` でログインできる。**このアカウントで本体にはログインしない**（020 §5.1）

## 5. 仮のホストで確かめる

`https://v2.assift.com`（本体）と `https://admin-v2.assift.com`（管理画面）で行う。試しのアカウントは **v1 に無いメール**を使う（重なると移行が ROLLBACK する。021 §9.3）。

| # | 確かめること | 期待 |
| --- | --- | --- |
| 1 | `/`・`/terms`・`/privacy`・`/law` | 開く。HTML の応答に `Content-Security-Policy` |
| 2 | `/signup` で登録 | 確認メールが Resend から届く（差出人・件名・SPF / DKIM）。リンクが `https://v2.assift.com/auth/callback?...` で、開くとログイン状態になる |
| 3 | ログアウト → `/login` | 2 のパスワードで入れる |
| 4 | パスワード再設定 | 再設定メール → `/password/reset` → 新しいパスワードで入れる |
| 5 | Google ログイン（別の Google アカウント） | 同意画面に `assift` → 戻ってログイン状態。Supabase の Users に provider = google で 1 行 |
| 6 | 店舗の作成 → 初期設定 → シフト表 | アサイン・必要人数・日付メモが保存される。11 人目で上限のモーダル（Stripe 未設定なので申し込みは「現在利用できません」） |
| 7 | AI で作成 | 1 回動く（`AI_GATEWAY_API_KEY`） |
| 8 | PDF / CSV | **PDF が 500 にならず日本語が出る**（010 §617・§960。Vercel でのフォントのパスは初めて確かめる）。`target="_blank"` の inline 表示と CSV のダウンロード（010 §858） |
| 9 | 共有 | 発行した URL が `https://v2.assift.com/share/<code>`（`SITE_URL`）。未ログインのブラウザで開く |
| 10 | 管理画面 | `admin-v2.assift.com/-/login` で入れる / `v2.assift.com/-` と本番の `*.vercel.app/-` が 404 / 一覧に 2 の試しのアカウントが出る（020 §10） |
| 11 | CSP | 1〜10 のページで `securitypolicyviolation` が 0 件（022 §6。Chrome の DevTools のコンソールに `Refused to …` が無い） |
| 12 | cron | `curl -i https://v2.assift.com/api/cron/billing-usage` が 401 |
| 13 | リージョン | Runtime Logs の関数のリージョンが `hnd1` |
| 14 | 片付け | 試しの店舗を消す → 試しのアカウントを Authentication → Users から消す（Google の分も）。SQL で `select count(*) from public.tenants`（0）・`select email from auth.users`（管理用だけ） |

14 のあと、021 §9.3 の予行（`--rollback`）を流せる。接続文字列は Supabase → Connect → **Session pooler**（IPv4 で届く。direct は IPv6 だけ）。
`MIGRATION_DATABASE_URL` に `sslmode=verify-full` を付ける（`.env.example`）。

## 6. 当日（DNS の切り替え）に差し替える値

カットオーバーのプランへ渡す。順番は「Vercel にドメイン → DNS → 値の差し替え → Redeploy」。

| 場所 | 仮（本プラン） | 当日 |
| --- | --- | --- |
| Vercel Domains | `v2.assift.com` / `admin-v2.assift.com` | `assift.com`・`admin.assift.com` を足す（020 §10）。仮の 2 つは外す |
| Gehirn DNS | `v2` / `admin-v2` の CNAME | Web の A / CNAME だけを Vercel へ（016-terms §7。MX・SPF・DKIM・DMARC は触らない）。仮の 2 つを消す |
| Vercel `SITE_URL` | `https://v2.assift.com` | `https://assift.com` |
| Vercel `ADMIN_HOST` | `admin-v2.assift.com` | `admin.assift.com` |
| Supabase Site URL | `https://v2.assift.com` | `https://assift.com` |
| Supabase Redirect URLs | `https://v2.assift.com/auth/callback` | `https://assift.com/auth/callback` を足し、`v2` を消す |
| Google の JavaScript 生成元 | `https://v2.assift.com` | `https://assift.com` を足し、`v2` を消す（リダイレクト URI は Supabase のものなので変えない） |

## 7. 未確定

なし（2026-10-14 に §3-9〜11 として決めた）。

## 8. ファイル

| ファイル | 変更 |
| --- | --- |
| `vercel.json` | `"regions": ["hnd1"]`（§3-4） |
| `docs/plans/024-production/README.md` | 本プラン |

## 9. 実装ログ

（作業のあとに、日時・確かめた結果・つまずいた点を書く。秘密の値は書かない）

### 2026-10-14（関数のリージョン）

- Vercel の Settings → Functions は、以前に手で `hnd1` + `kix1` にしてあった。`vercel.json` の `regions` を入れると **Overridden** の札が出て、Dashboard の値は表示されたまま効かない（§4.6-1）
- PR #36 のデプロイで、関数のリージョンが `hnd1` になっていることを確かめた

### 2026-10-14（Auth の設定前の状態）

設定を入れる前の本番プロジェクトの Authentication:

- URL Configuration: Site URL `https://assift-sundbox.vercel.app/`、Redirect URLs は `assift-sundbox.vercel.app` と `assift-*-sundbox.vercel.app` の 4 件（以前に手で入れたもの）
- Rate Limits: メールの送信 2 通 / 時（Custom SMTP がオフのときの固定値で、編集できない）。ほかは `config.toml` と同じ値
- SMTP: オフ / Templates: Supabase の既定（英語）/ Google: 無効
- **これまでの main へのマージで `config.toml` の `[auth]` は本番に入っていない**（Site URL が `localhost` でなく、テンプレートが日本語でない）。Deploy to production がオフのあいだは上書きされないとみてよい。オンにするとき（カットオーバーのプラン）に §4.8 で確かめる

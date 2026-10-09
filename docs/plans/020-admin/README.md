# 020: 運営者の管理画面（土台とユーザー管理）

- 前提: 003（`profiles.is_admin` / `requireAdmin()`）/ 004（ログイン・`signOut({ scope: 'local' })`）/ 019（トライアル `profiles.trial_end`・
  個別契約 `profiles.max_staffs_count`・権利の規則 `lib/billing/entitlement.ts`）
- v1: `/<ADMIN_PATH>/...`（`@assift.com` のメールの人だけ）。グラフ・一覧・招待の代理承認・一斉メール・メンテナンスモード（v1 分析 §3.5）

**状態: プラン（未実装）。2026-10-09 に範囲を決め、ホスト振り分けを試作で確かめた（§3）。同日に URL を `admin.assift.com/-/...` に決めた（§4.1）。同日にプランのレビューを 3 回行い、指摘が出なくなるまで見直した（主な変更: 確認でホストも見る §5、ログイン後の管理者の判定、seed の管理者）。同日にゼロベースで再レビューし、管理用のアカウントの前提（§5.1）と一覧の集計の順序（§6.1）を直した。**

---

## 1. 目的と完了条件

### 目的

運営者（当面 1 名）が、利用者の状態を確かめ、利用者の画面では変えられない値（トライアルの期間・個別契約の上限）を変えられるようにする。
いまは SQL を直接流しているものを画面にする。

### 完了条件

- `admin.assift.com/-/...` で管理画面が開き、`assift.com/-/...` は本番で 404 になる
- `is_admin` の人だけが入れる（未ログインはログインへ、ログイン済みで管理者でない人は 404）
- ユーザー一覧（検索・ページ送り）と詳細（店舗・スタッフ・契約・上限とその理由）が見られる
- 詳細からトライアルの期間の変更・今すぐ終える・未使用に戻す、個別契約の上限の設定ができ、利用者の画面に反映される

## 2. 範囲

### 作る

| 区分 | 中身 |
| --- | --- |
| 土台 | ホストの振り分け（proxy）・管理画面のログイン / ログアウト・管理者の確認・枠 |
| ユーザー一覧 | メール・登録日・最終ログイン・登録方法・契約の状態（上限を超えてロック中かも）・トライアルの最終日・店舗数・在籍スタッフ数。メールで検索・ページ送り |
| ユーザー詳細 | アカウント・プラン（今の上限とその理由）・店舗ごとの数字とスタッフの一覧 |
| 操作 | トライアルの期間を変える / 今すぐ終える / 未使用に戻す、個別契約の上限（`profiles` の 1 列の更新だけ） |

### 作らない（決定。2026-10-09）

| 機能 | 理由 / 代わり |
| --- | --- |
| 利用者が画面でできる操作（有料プランの解約・Stripe からの取り直し・上限人数 `staff_cap` の変更など。Stripe の API を呼ぶもの全般） | 利用者がポータル・設定でできる。運営側で要るときは Stripe の Dashboard で操作すれば Webhook で写しが追いつく |
| デバッグ専用の機能（時間を進める・テストクロック・状態の強制） | 本番運用相当の機能だけにする。動作確認は 019 §9.3 の手順のまま |
| MFA | 本質ではない。**運用開始（カットオーバー）までに再検討**（§12） |
| 監査ログ | 管理者が 1 名のうちは要らない |
| ユーザーの画面を見る機能（なりすまし） | 実装の費用が高い（全テーブルの書き込みを止めるポリシー・引き換え券・`generateLink` の試作）。要るようになったら別のプランで検討する |
| ダッシュボード・集計 | リリース後に別のプランにする。自動アサインは `assist_runs` からさかのぼって数えられる |

## 3. 試作で確かめたこと（2026-10-09。`next build` + `next start` + Playwright。試作のファイルは消した）

| 確かめたこと | 結果 |
| --- | --- |
| `src/app/%5Fadmin/` が `/_admin` のルートになる（当初の案） | ◯（`app-path-routes-manifest.json` に `/_admin`） |
| `src/app/-/` が `/-` のルートになる（採用した案。§4.1） | ◯（`next typegen` の型に `/-/users`） |
| proxy で Host を見て振り分けられる（`Host: admin.localhost:3000`） | ◯ |
| 振り分け先でクライアント遷移（`next/link`）が RSC で動く | ◯（全体の読み込みにならない） |
| 振り分け先で Server Action が動き、`revalidatePath` で描き直される | ◯（Action は同じホストに POST され、Origin の検査も通る） |
| 本番の振り分けで本体のホストの管理画面のパスを 404 にできる | ◯ |

まだ確かめていないこと: `admin.localhost` での Supabase の cookie（試作の時点で docker が起動せず、Supabase を使わずに確かめた）。実装の最初の手順で確かめる（§10）。

## 4. ホストとパス

### 4.1 方針: rewrite しない。URL は `admin.assift.com/-/...`

管理画面のホストでも、URL は内部のパスのまま（`/-/users`）にする。試作では rewrite（`admin.assift.com/users` → `/-/users`）も動いたが、採らない。

- rewrite すると、`<Link>` と `redirect()` はブラウザのパス、`revalidatePath` は内部のパス（Next のガイド「Using revalidatePath with rewrites」）と、**パスが 2 系統になる**
- プレビューはホストを 1 つしか持てないので、rewrite するとプレビューだけ書き方が変わる。rewrite しなければ、**本番・プレビュー・開発で同じパスのまま動く**。違うのは「どのホストで開けるか」だけ
- URL を見るのは運営者だけなので、`/-` が付いていても困らない

パスの先頭は **`/-/`**（フォルダは `src/app/-/`）。パスの役目は本体の機能とぶつからないことだけなので、言葉を入れず、意味を持たない区切りにする。

- GitLab が同じ目的で使っている形（`gitlab.com/-/profile`。ユーザー名・グループ名とぶつからないよう予約した区切り）
- 「管理画面である」ことはサブドメインの `admin` が表すので、パスに `admin` を重ねない（`admin.assift.com/_admin/...` だと admin が 2 回出る）
- 本体の機能のパスが `-` で始まることはない。`/admin` は店舗内の管理者機能に見え、将来の機能ともぶつかりうるので使わない
- `_admin` のような `_` 始まりは Next の private folder（ルートにならない）になり `%5F` で書く必要があるが、`-` はそのまま書ける
- コードの中の名前（`lib/admin/`・`adminHostDecision()` など）は `admin` のまま

### 4.2 振り分け（`lib/admin/host.ts` の純関数 `adminHostDecision()`）

入力は Host・pathname・`ADMIN_HOST`・本番かどうか（`VERCEL_ENV === 'production'`）。管理画面のパスは `pathname === '/-' || pathname.startsWith('/-/')`（`/-foo` は含めない）。

| 状況 | `/-` 配下 | それ以外 |
| --- | --- | --- |
| `ADMIN_HOST` があり、Host が一致（管理画面のホスト） | 通す | `/-` へ redirect |
| `ADMIN_HOST` があり、Host が違う（本体のホスト。本番のデプロイの `*.vercel.app` もここ） | **404** | 通す |
| `ADMIN_HOST` が無い・本番でない（プレビュー・開発） | 通す（本体と同じホストで開く） | 通す |
| `ADMIN_HOST` が無い・**本番** | **404**（設定漏れで同じオリジンに開かないよう、閉じる側に倒す） | 通す |

- `ADMIN_HOST` は Vercel の Production の環境変数にだけ `admin.assift.com` を入れる。開発で本番と同じ形を試すときは `.env.local` に `ADMIN_HOST=admin.localhost:3000`
  （`next dev` は `localhost` のサブドメインを最初から許しているので、`allowedDevOrigins` は要らない。Next のガイド「allowedDevOrigins」）
- プレビューでは本体と同じオリジンで開くので cookie も共有されるが、データは seed なので受け入れる
- 同じファイルに `isAdminHost(host, env)`（表の「管理画面を開いてよいホストか」だけを返す）を置き、§5 の確認が使う

### 4.3 proxy（`src/proxy.ts`）

今の 3 段の前に 0 段目を足す。404 は存在しないパス（`/404`）へ `NextResponse.rewrite()` し、アプリの `not-found.tsx` を 404 で出す
（素の 404 の Response にしない。proxy の rewrite 先は proxy を通らない。ステータスが 404 になることを §10 で確かめる）。

0. `adminHostDecision()` の結果が 404 / redirect ならそれを返す
1. 〜3. は今のまま（v1 の URL・`updateSession()`・直近の店舗）。`/-` はどの条件にも当たらないので、セッションの更新だけが掛かる

`config.matcher` は変えない（`api/stripe`・`api/cron` は管理画面のホストでも開けるが、署名と `CRON_SECRET` で守られている）。

### 4.4 フォルダ

```
src/app/-/
  layout.tsx                 metadata: robots noindex。確認はしない（ログインページを含むため）
  login/
    page.tsx                 /-/login。ログイン済みの管理者なら /-/users へ
    actions.ts               adminLogin
    _components/AdminLoginForm.tsx
  (console)/
    layout.tsx               requireAdminPage() → AdminShell
    page.tsx                 /- → /-/users へ redirect
    actions.ts               adminLogout
    _components/AdminShell.tsx
    users/
      page.tsx               一覧
      searchParams.ts        q / page（nuqs）
      _components/UsersTable.tsx, UsersSearch.tsx
      [userId]/
        page.tsx             詳細
        actions.ts           トライアル・個別契約の操作
        _components/...
src/lib/admin/
  host.ts                    adminHostDecision（純関数。Vitest）
  paths.ts                   ADMIN_ROOT = '/-' などのパスの定数
  trial.ts                   canEditTrial / canEndTrialNow（純関数。Vitest）
  guard.ts                   server-only。requireAdminPage / requireAdminAction
  client.ts                  server-only。createAdminClient（requireAdminAction を通してから createPrivilegedClient）
  queries.ts                 server-only。一覧・詳細の読み取り
src/lib/validation/admin.ts  操作の Zod スキーマ
```

## 5. 認証・認可

| 層 | すること |
| --- | --- |
| proxy | ホストの振り分けだけ（§4.2）。DB は読まない |
| `(console)/layout.tsx` と各 `page.tsx` | `requireAdminPage()`: 管理画面のホストでなければ `notFound()`、未ログインは `/-/login` へ redirect、管理者でなければ `notFound()`。layout はクライアント遷移で描き直されない（Next の auth ガイド「Partial Rendering」）ので、page でも呼ぶ |
| 読み取り | `lib/admin/queries.ts` の関数は `createAdminClient()` からしかクライアントを得られない。`createAdminClient()` が毎回 `requireAdminAction()` を通す（page は先に `requireAdminPage()` を呼ぶので、ここで落ちるのは確認の書き忘れだけ。そのときは 500 になる） |
| Action | `runAction` → `requireAdminAction()`（ホストの確認 → 既存の `requireAdmin()`。`guards.ts` の `requireAdmin()` はいまどこからも呼ばれていない）→ Zod |

- 管理者の判定は `profiles.is_admin`（`currentUser()`）。DB から読むので、外せばすぐ効く。立てるのは今までどおり SQL だけ
- **確認でホストも見る**（`headers()` の Host を `isAdminHost()` に渡す）。Server Action はどのページからでも呼べる
  （Next は Action の ID が今のページに無ければ、持っているページへ転送する。`selectWorkerForForwarding`）。
  ホストを見ないと、本体のホストの XSS が管理画面の Action の ID を本体のホストへ POST し、**本体のセッション**で呼べる。
  管理者が同じアカウントで本体にもログインしていれば `is_admin` の確認は通ってしまい、ホストを分けた意味が無くなる
- **ログイン**: `adminLogin` は `isAdminHost()` を確かめてから `signInWithPassword`。戻り値の `user.id` で `getProfile()` を読み
  （`currentUser()` は使わない。`getAuthUser()` が `cache()` されていて、同じリクエストで先に呼ばれているとログイン前の値を返す）、
  管理者でなければ `signOut({ scope: 'local' })` して、パスワード違いと同じ文言で断る（管理者かどうかを漏らさない）。成功したら `{ redirectTo: '/-/users' }`
- **メール + パスワードだけ**。Google ログインは、Supabase Auth の Redirect URLs と `/auth/callback` を管理画面のホストにも用意する必要があるので入れない
- **cookie はホスト限定**（`@supabase/ssr` の既定に `domain` が無い）。管理画面のホストでのログインは、本体のホストのログインとは別のセッションになる。
  本体で XSS が起きても管理画面の cookie は読めない（cookie は `httpOnly: false` で JS から読めるので、同じオリジンに置くと盗まれる）
- **ログアウト**: `signOut({ scope: 'local' })`（本体のセッションは切らない）→ `/-/login`

### 5.1 管理用のアカウントは本体で使わない（ゼロベースのレビューで見つけた前提の穴。§12 で決める）

Supabase のセッション（アクセストークン・リフレッシュトークン）は**ホストに縛られない**。`is_admin` は人に付いていて、セッションには付いていない。
したがって、管理者が**同じアカウントで本体にもログインしている**と:

1. 本体の XSS が本体のセッションのトークンを読む（cookie は `httpOnly: false`）
2. 攻撃者が自分のブラウザで、そのトークンを `admin.assift.com` の cookie に入れる
3. `is_admin` の確認は通るので、管理画面に入れる

ホストを分けた守り（§12 の 1）は、**管理用のアカウントの本体のセッションが存在しない**ときにだけ成り立つ。§5 のホストの確認はこの経路を塞げない。

| 案 | 中身 | 費用 |
| --- | --- | --- |
| **A. 管理専用のアカウント（推奨）** | `is_admin` は管理専用のアカウント（店舗を持たない）にだけ立て、そのアカウントでは本体にログインしない。ふだん使いのアカウントには立てない | 0（運用の決まり）。seed も `admin@example.com`（管理専用）と `dev@example.com`（ふだん使い）に分けてある |
| B. セッションを管理画面に結び付ける | 管理画面でのログイン時に JWT の `session_id` を表に記録し、確認でその表にあるセッションだけを通す。本体で作られたセッションは盗まれても通らない | 表 1 つ・migration・pgTAP・ログイン / ログアウト / 確認の書き込みと読み取り |

A は決まりを破れば（管理専用のアカウントで本体にログインすれば）穴が開くが、管理者 1 名なら守れる。B はコードで強制できる。
A で始め、B は MFA と一緒に運用開始までに再検討する（どちらも「管理用のアカウントの資格情報が漏れたとき」の守り）。

## 6. 読み取り

### 6.1 一覧: RPC `public.admin_list_users`

行を取ってから数えると `max_rows`（1000）で黙って切られ、`auth.users` は PostgREST から読めない。そこで、件数をまとめて返す関数を 1 本足す。

```sql
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, providers text[],
  trial_end timestamptz, max_staffs_count integer, staff_cap integer, subscription_status text,
  tenant_count integer, active_staff_count integer, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select p.id, p.email, p.created_at, p.trial_end, p.max_staffs_count, p.staff_cap
      from public.profiles p
     where p_search is null or strpos(lower(p.email), lower(p_search)) > 0
  ),
  page as (
    select * from filtered
     order by created_at desc, id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select pg.id, pg.email, pg.created_at, u.last_sign_in_at,
         coalesce((select array_agg(distinct i.provider order by i.provider)
                     from auth.identities i where i.user_id = pg.id), '{}'),
         pg.trial_end, pg.max_staffs_count, pg.staff_cap, s.status,
         (select count(*) from public.tenants t where t.owner_id = pg.id)::integer,
         private.active_staff_count(pg.id),
         (select count(*) from filtered)
    from page pg
    join auth.users u on u.id = pg.id
    left join public.billing_subscriptions s on s.user_id = pg.id
   order by pg.created_at desc, pg.id;
$$;

revoke execute on function public.admin_list_users(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to service_role;
```

- `security definer` にするのは `auth.users` / `auth.identities` を読むため。呼べるのは **service_role だけ**（`authenticated` から EXECUTE を外す）。
  生成 migration に `GRANT ... TO authenticated` / `anon` が残る場合は、生成ファイルに REVOKE を追記し、`unmanaged/restrict_anon_grants.sql` も末尾に足す（関数を足すため）
- 検索は `ilike` ではなく `strpos`（`%` `_` のエスケープが要らない）。空の検索語は TS で `null` にして渡す
- **先にページの範囲に絞ってから集計する**（`page` の CTE）。`count(*) over ()` で総数を数えると、窓関数の下で全行の副問い合わせ（店舗数・在籍数・登録方法）が走る。
  総数は絞り込みだけの `filtered` を数える
- `total_count` は行に付くので、範囲外のページ（0 行）では総数が分からない。`page` が範囲外なら「該当なし」と 1 ページ目へのリンクを出す
- 「契約の状態」の列は `entitlement()`（TS の純関数）で組み立て、`isOverLimit(entitlement, active_staff_count)` ならロック中の印を付ける。SQL に規則をもう 1 つ書かない（今でも TS と `private.staff_limit` の 2 か所）
- 契約状態での絞り込みは入れない（入れると規則を SQL にもう 1 つ書くことになる。要るようになってから）

### 6.2 詳細（`lib/admin/queries.ts`）

すべて対象の 1 人に絞る（`.eq('id', …)` / `.eq('owner_id', …)` / `.in('tenant_id', 自分の店舗の id)`。`publicShare.ts`・`lib/billing/` と同じ規律）。

| 読むもの | 方法 |
| --- | --- |
| 最終ログイン・メールの確認・登録方法 | `auth.admin.getUserById(userId)` |
| `profiles` の 1 行・`billing_subscriptions` の 1 行 | `.eq('id' / 'user_id', userId)` |
| 店舗 | `tenants` を `.eq('owner_id', userId)` |
| スタッフ（店舗ごと。在籍・退職） | `staffs` を `.in('tenant_id', ids)`。行数が増えうるので `pageAll()` |
| 勤務パターン数・自動アサインの回数と最後の日時 | 店舗ごとに `count: 'exact', head: true` と最新 1 件（店舗は 1 人あたり高々数件） |

`.in('tenant_id', ids)` の id は、その人の店舗だけ（高々数件）なので URL に載せてよい。店舗が 0 件なら `.in()` を呼ばない。

詳細ページは `userId` を `isUuid()` で確かめ、uuid でない・`profiles` に行が無いときは `notFound()`。

## 7. 操作（`users/[userId]/actions.ts`）

すべて `profiles` の 1 列を `createAdminClient()` で `.eq('id', userId)` 更新する（`userId` は `z.guid()`）。更新が 0 行なら「ユーザーが見つかりません」。
成功したら `revalidatePath('/-', 'layout')`（一覧のトライアルの最終日も古くなるので、管理画面全体）。
利用者の画面は DB を読み直すので、次の描画から反映される。

| Action | 書く値 | 条件 |
| --- | --- | --- |
| `setTrialLastDay({ userId, lastDay })` | `trial_end = lastDay の翌日 0:00 JST`（`trialEndForLastDay()` を `lib/billing/trial.ts` に足す。`trialLastDay()` の逆） | 契約中でない |
| `endTrialNow({ userId })` | `trial_end = now()` | 契約中でない・トライアル中 |
| `resetTrial({ userId })` | `trial_end = null`（もう一度始められる） | 契約中でない |
| `setManualLimit({ userId, limit })` | `max_staffs_count = limit`（`null` = 通常） | なし |

- **トライアルの操作は、有料プランを契約中（`isEntitledStatus(status)`）の人には出さず、Action でも断る**。`trial_end` は請求の区間の始まりに使われ
  （`lib/billing/peak.ts`・`history.ts` の `peakWindow`）、`null` にすると次の同期が値を入れ直す（`sync.ts`）。触ると請求額が変わる。
  画面の判定と Action の判定は同じ純関数（`lib/admin/trial.ts` の `canEditTrial()` / `canEndTrialNow()`）を使う。判定と更新の間に申し込まれる競合は、管理者 1 名なので受け入れる
- `lastDay` は `isDateString()` で検証する。過去の日も受ける（その時点で終わる）
- `limit` は `null` か 11〜1000 の整数（10 以下は効かないので受けない。上限は `staff_cap` と同じ）。範囲外には日本語の `{ error }` を付ける。
  `null`（通常に戻す）は空欄ではなく「通常に戻す」ボタンで送る（空欄の `''` は数値の leaf に届くと英語のエラーになるので、クライアントで送らない）
- 確認は `modals.openConfirmModal`、送信中は `useTransition` の `loading`

## 8. 画面

- **枠（`(console)/_components/AdminShell.tsx`）**: Mantine の `AppShell`。ヘッダーに「assift 管理」・ユーザー一覧へのリンク・ログアウト。本体の `TenantShell` は使わない
- **一覧**: `Table`。検索は `q`（`limitUrlUpdates: debounce(300)`、`shallow: false`。nuqs 2.10 では `throttleMs` が非推奨）、ページは `page`（50 件ずつ。検索語が変わったら 1 に戻す）。行をクリックで詳細へ
- **詳細**: `SettingsSection` の形で 3 つ
  - アカウント: メール・登録日・最終ログイン・登録方法・メールの確認
  - プラン: 今の上限とその理由（`entitlement()` の結果を文にする）・契約の写し（状態・期間・解約予定）・トライアルの最終日・個別契約の上限・上限人数（`staff_cap`。表示だけ）と操作のボタン
  - 店舗: 店舗ごとに名前・作成日・初期設定の状態・在籍 / 退職の人数・勤務パターン数・自動アサインの回数と最後の日時。スタッフの一覧は開閉する
- 本体の画面から管理画面へのリンクは置かない
- アクセス解析（Vercel Web Analytics）を root layout に入れるときは、管理画面を対象から外す（`?q=` にメールアドレスが載る）

## 9. ファイル

| ファイル | 内容 |
| --- | --- |
| `src/proxy.ts` | 0 段目（§4.3） |
| `src/lib/admin/host.ts` + test | `adminHostDecision()` |
| `src/lib/admin/{paths,guard,client,queries}.ts` | §4.4・§5・§6 |
| `src/lib/admin/trial.ts` + test | `canEditTrial()` / `canEndTrialNow()` |
| `src/lib/billing/trial.ts` + test | `trialEndForLastDay()` |
| `src/lib/validation/admin.ts` + test | 操作のスキーマ |
| `src/app/-/**` | §4.4 |
| `supabase/schemas/public/functions.sql` | `admin_list_users` |
| `supabase/migrations/<ts>_admin_list_users.sql` | sync の出力 + REVOKE の追記 + `restrict_anon_grants.sql` |
| `supabase/tests/admin_list_users.sql` | pgTAP |
| `supabase/seed.sql` | 管理者 `admin@example.com` / `password`（`is_admin = true`）を足す。`dev@example.com` は管理者にしない（管理者でない人の確認に使う） |
| `src/types/database.ts` | gen types |
| `.env.example` | `ADMIN_HOST` |
| `AGENTS.md` | §11 |

## 10. 実装の順序と確認

1. **cookie の確認**: `supabase start` → `ADMIN_HOST=admin.localhost:3000` で、`admin.localhost:3000/-/login` でログインし、cookie が `admin.localhost` に付き、`localhost:3000` のセッションと別になることを確かめる
2. `host.ts` + proxy（Vitest で §4.2 の表を固定）
3. seed の管理者・ログイン / ログアウト・`requireAdminPage()` / `requireAdminAction()`・枠
4. `admin_list_users`（schemas → sync → reset → gen types → pgTAP）・一覧
5. 詳細・操作

### テスト

- Vitest: `adminHostDecision()` の表と `isAdminHost()`、`trialEndForLastDay()`（`trialLastDay()` と往復して同じ日になる）、`canEditTrial()` / `canEndTrialNow()`、操作のスキーマ（空欄・10 以下・1001 を日本語で断る）
- pgTAP: `admin_list_users` を `authenticated` / `anon` が呼ぶと 42501、`service_role` は呼べて件数・`total_count` が合う
- 手で確かめる（`ADMIN_HOST=admin.localhost:3000`）
  - 管理者でない人（`dev@example.com`）がログイン → 断られ、セッションが残らない / 管理者でない人の cookie で `/-/users` → 404 / `localhost:3000/-` → 404（ステータスも 404・アプリの not-found が出る）
  - トライアルの最終日を変える → 本体の帯の日付が変わる / 今すぐ終える → 10 人を超える店舗がロックされる / 未使用に戻す → 11 人目で「無料で試す」が出る
  - 契約中の人にはトライアルの操作が出ない
  - `ADMIN_HOST` を外す → `localhost:3000/-` で開ける（プレビューと同じ）
  - 管理画面の Action を本体のホスト（`localhost:3000`）のページから呼ぶ（devtools で `Next-Action` ヘッダを付けて POST）→ 断られる
- `npm run build` で `/-` のルートができること

### 本番（カットオーバーのとき）

- Vercel のプロジェクトに `admin.assift.com` を足す（DNS は CNAME）
- Production の環境変数に `ADMIN_HOST=admin.assift.com`
- デプロイ後に確かめる: `admin.assift.com/-/login` が開く / `assift.com/-` と本番のデプロイの `*.vercel.app/-` が 404 / 管理画面の Action が動く
  （Host ヘッダが独自ドメインで届くことは手元でしか確かめていない）
- Supabase Auth の設定は変えない（パスワードだけなので Redirect URLs は要らない）

## 11. AGENTS.md に足すこと

- ディレクトリに `app/-/`（運営者の管理画面。`admin.assift.com/-/...`）と `lib/admin/`
- service_role の例外に「管理画面（`lib/admin/`）。`createAdminClient()` が `requireAdminAction()`（ホスト + `is_admin`）を通してから `createPrivilegedClient()` を返す。中のクエリは対象の 1 人に絞る」
- 管理画面の Action は `requireAdminAction()` を呼ぶ（`requireAdmin()` だけではホストを見ないので、本体のホストから呼べてしまう）
- seed の管理者 `admin@example.com` / `password`（プレビューでも使える）
- proxy の段に 0 段目（ホストの振り分け）
- 管理画面のパスは `/-/...` の 1 系統（rewrite しない）。`lib/admin/paths.ts` の定数を使う

## 12. 決定と未確定

| # | 項目 | 決定 |
| --- | --- | --- |
| 1 | 置き場所 | 同じアプリで `admin.assift.com`（同じオリジンの `/admin` は XSS でトークンを盗まれるため不採用） |
| 2 | URL | `admin.assift.com/-/...`。rewrite しない（§4.1） |
| 3 | 範囲 | §2。利用者が画面でできる操作・Stripe の API・デバッグ専用の機能は入れない |
| 4 | MFA | 入れない。運用開始までに再検討 |
| 5 | 監査ログ | 入れない（管理者 1 名） |
| 6 | ログインの方法 | メール + パスワードだけ |
| 7 | ユーザーの画面を見る機能 | 入れない（2026-10-09。費用が高いため。要るようになったら別のプランで検討する） |
| 8 | 管理用のアカウント | **未決**。推奨は管理専用のアカウント（§5.1 の A）。セッションの結び付け（B）は運用開始までに再検討 |

管理者にするアカウントはメール + パスワードで登録したもの（2026-10-09 に確認。Google だけのアカウントは管理画面にログインできない）。
ただし §5.1 の理由で、ふだん使いのアカウントとは別の管理専用のアカウントにすることを勧める（#8）。

未確定:

- cookie tossing（本体のホストの XSS から `Domain=assift.com` の cookie を書かれる）への対策（管理画面のホストの cookie 名を `__Host-` 始まりにする）。権限は上がらない（攻撃者のセッションでは 404）ので、MFA と一緒に再検討する
- セッションを管理画面に結び付ける（§5.1 の B）。MFA と一緒に再検討する
- `admin.localhost` での cookie（§10 の 1）

## 13. 実装ログ

（未実装）

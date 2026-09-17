# assift v2

アルバイトのシフト表作成・共有サービス [assift](https://assift.com) の作り直し。
Next.js 16 / Mantine 9 / Supabase / Vercel。

- 開発規約: [AGENTS.md](./AGENTS.md)
- v1 の分析: [docs/v1-analysis.md](./docs/v1-analysis.md)
- 設計とプラン: [docs/plans/](./docs/plans/)

## セットアップ

必要なもの: Node 22（`.node-version`）、Docker（ローカル Supabase 用）

```bash
npm install
npx supabase start          # 初回は Docker イメージの取得に数分かかる
npx supabase status         # URL と鍵を確認
cp .env.example .env.local  # status の値を転記
npm run dev                 # http://localhost:3000
```

`.env.local` に入れる値

| 変数                                   | `supabase status` の項目                            |
| -------------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | API URL                                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key（旧 anon key）                      |
| `SUPABASE_SECRET_KEY`                  | Secret key（旧 service_role key）                   |
| `V1_UUID_NAMESPACE`                    | 任意の固定 UUID（v1 データ移行と旧 URL 解決で使用） |

## スクリプト

| コマンド                                  | 内容                            |
| ----------------------------------------- | ------------------------------- |
| `npm run dev`                             | 開発サーバー                    |
| `npm run build` / `npm start`             | 本番ビルド / 起動               |
| `npm run lint`                            | ESLint                          |
| `npm run typecheck`                       | `next typegen` + `tsc --noEmit` |
| `npm test` / `npm run test:watch`         | Vitest                          |
| `npm run format` / `npm run format:check` | Prettier                        |
| `npx supabase stop`                       | ローカル Supabase を停止        |

## 認証まわりのローカル確認

- 確認メール・再設定メールは送信されず Mailpit（http://127.0.0.1:54324）に溜まる。リンクを開くとローカルの `/auth/callback` に着地する
- seed ユーザーは `dev@example.com` / `password`
- Google ログインを試すには Google Cloud Console で OAuth クライアントを作り、承認済みリダイレクト URI に `http://127.0.0.1:54321/auth/v1/callback` を登録して、`npx supabase start` を実行する shell で次を export する

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
npx supabase stop && npx supabase start
```

## Supabase Studio

ローカル起動中は http://127.0.0.1:54323 で DB を確認できる。スキーマの正は `supabase/schemas/` の SQL なので、Studio 上で直接変更しない（手順は AGENTS.md）。

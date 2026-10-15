#!/usr/bin/env bash
# Vercel の Ignored Build Step（vercel.json の ignoreCommand）。exit 0 = ビルドしない、exit 1 = ビルドする。
#
# PR の無いブランチへの push ではプレビューを作らない。プレビューの Supabase の環境変数は、PR を作ったときに
# Supabase Branching がそのブランチ専用で Vercel へ入れるので、PR の前の push は必ず assertSupabaseBuildEnv() で失敗する（023 §6）。
#
# 「PR が無い」は 2 つで見る:
# - VERCEL_GIT_PULL_REQUEST_ID が空: Vercel は push でデプロイを作るので、PR より先の push には PR の id が付かない
# - NEXT_PUBLIC_SUPABASE_URL も空: PR を作ると Supabase がブランチ DB の値を入れ、その PR の最新のデプロイを Redeploy する。
#   その Redeploy は PR より先の push（id が空）の作り直しなので、id だけで見ると飛ばしてしまう
# PR の id があって環境変数が無いとき（Supabase の書き込み漏れ）はビルドして、assertSupabaseBuildEnv() の失敗で知らせる
set -u

if [ "${VERCEL_ENV:-}" != "preview" ]; then
  echo "ビルドする: ${VERCEL_ENV:-?}（プレビュー以外）"
  exit 1
fi

if [ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ] && [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  echo "ビルドしない: ${VERCEL_GIT_COMMIT_REF:-?} に PR もブランチ DB の環境変数も無い"
  exit 0
fi

echo "ビルドする: ${VERCEL_GIT_COMMIT_REF:-?}（PR: ${VERCEL_GIT_PULL_REQUEST_ID:-なし} / ブランチ DB の環境変数: ${NEXT_PUBLIC_SUPABASE_URL:+あり}${NEXT_PUBLIC_SUPABASE_URL:-なし}）"
exit 1

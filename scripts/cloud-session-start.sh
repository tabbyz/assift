#!/bin/bash
# クラウドのセッション（CLAUDE_CODE_REMOTE=true）だけで動く SessionStart フック。
# dockerd を起こし、node_modules が無ければ npm ci する。失敗してもセッションは止めない。
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0

docker_msg="docker: ok"
if ! docker info >/dev/null 2>&1; then
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  docker_msg="docker: 起動失敗 (/tmp/dockerd.log)"
  for _ in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      docker_msg="docker: 起動した"
      break
    fi
    sleep 1
  done
fi

npm_msg="node_modules: ok"
if [ ! -d node_modules ]; then
  if npm ci >/tmp/npm-ci.log 2>&1; then
    npm_msg="node_modules: npm ci した"
  else
    npm_msg="node_modules: npm ci 失敗 (/tmp/npm-ci.log)"
  fi
fi

echo "$docker_msg / $npm_msg"
exit 0

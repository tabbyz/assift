#!/bin/bash
# クラウドのセッション（CLAUDE_CODE_REMOTE=true）だけで動く SessionStart フック。
# dockerd を起こし、node_modules が無ければ npm ci し、日本語のフォントを入れる。失敗してもセッションは止めない。
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

# 日本語のフォント（画面の確認・ヘルプのスクリーンショット用）。コンテナにはヒラギノ・游ゴシック・メイリオが無く、
# アプリの書体の指定（src/fontFamily.ts）から外れて中国語のフォント（WenQuanYi Zen Hei）で描かれる。
# PDF 用に同梱している Noto Sans JP を、日本語と sans-serif の既定にする（ダウンロードは要らない）
font_msg="fonts: ok"
if command -v fc-match >/dev/null 2>&1 && ! fc-match "sans-serif:lang=ja" 2>/dev/null | grep -q "Noto Sans JP"; then
  font_dir="$HOME/.local/share/fonts"
  conf_dir="$HOME/.config/fontconfig/conf.d"
  if mkdir -p "$font_dir" "$conf_dir" && cp assets/fonts/NotoSansJP-*.otf "$font_dir/" &&
    cat >"$conf_dir/50-assift-noto-sans-jp.conf" <<'CONF' && fc-cache -f >/dev/null 2>&1; then
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <alias binding="strong">
    <family>sans-serif</family>
    <prefer><family>Noto Sans JP</family></prefer>
  </alias>
  <match target="pattern">
    <test name="lang" compare="contains"><string>ja</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>Noto Sans JP</string></edit>
  </match>
</fontconfig>
CONF
    font_msg="fonts: Noto Sans JP を入れた"
  else
    font_msg="fonts: 失敗"
  fi
fi

echo "$docker_msg / $npm_msg / $font_msg"
exit 0

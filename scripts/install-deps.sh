#!/usr/bin/env bash
# 装依赖。本仓库是 TypeScript 项目（源码 src/，产物 lib/），依赖是 typescript / tsdown /
# @types/node。worktree 里也一样跑这个。
#
# 为什么不直接 npm install：
#   node_modules/@deepseek-ai 是一条手工软链，指向 $DSH_HOME/profiles/node_modules/@deepseek-ai。
#   插件运行时靠它解析宿主提供的 @deepseek-ai/* 包——lib/index.js 要 schemastery，
#   桥接副本（vendor/llm-bridge/）要 dsh-llm / dsh-credentials 那些。
#   npm 会顺着这条软链把里面两百个包当成"待处理的条目"去 reify，实测直接 EPERM。
#   所以：装之前挪开，装完放回去。
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

LINK="node_modules/@deepseek-ai"
TARGET=""
if [ -L "$LINK" ]; then
  TARGET=$(readlink "$LINK")
  rm "$LINK"
fi

restore() {
  if [ -n "$TARGET" ] && [ ! -e "$LINK" ]; then
    mkdir -p node_modules
    ln -sfn "$TARGET" "$LINK"
    echo "已还原宿主包软链：$LINK -> $TARGET"
  fi
}
trap restore EXIT

npm install --no-audit --no-fund "$@"

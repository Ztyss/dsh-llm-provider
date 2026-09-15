#!/bin/bash
# plan-test 测试环境一键脚本。
#
#   scripts/test-profile.sh          启动测试实例并打开浏览器（已在跑会先重启，保证拿到新令牌）
#   scripts/test-profile.sh stop     停掉测试实例
#
# 测试 profile（~/.dsh/profiles/plan-test）与官方 web 用同样的 bundle 组，
# 但禁用官方 ui-model-selection——模型座位由 dsh-provider 独立接管。
# profile 文件由本脚本幂等生成，手改会被下次运行覆盖（要改就改这里）。
#
# 并行开发时每个 worktree 起一个自己的实例（端口/profile/日志都别撞）：
#   PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh
# 不设就用下面的默认值（3081 / plan-test）。
set -euo pipefail

PORT="${PORT:-3081}"
PROFILE="${PROFILE:-plan-test}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="${LOG:-/tmp/dsh-plan-test.log}"

stop() {
  local pids
  pids="$(lsof -ti tcp:$PORT 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

ensure_profile() {
  mkdir -p "$PROFILE_DIR/node_modules"
  if [ ! -f "$PROFILE_DIR/cordis.yml" ]; then
    if [ -f "$DSH_HOME_DIR/profiles/web/cordis.yml" ]; then
      cp "$DSH_HOME_DIR/profiles/web/cordis.yml" "$PROFILE_DIR/cordis.yml"
    else
      printf '[]\n' > "$PROFILE_DIR/cordis.yml"
    fi
  fi
  cat > "$PROFILE_DIR/package.json" <<EOF
{
  "name": "dsh-profile-plan-test",
  "private": true,
  "dependencies": {
    "dsh-provider": "link:$PROJECT_ROOT",
    "dsh-sidekick": "link:$DSH_HOME_DIR/workspaces/dsh-mobile/plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-sidekick",
        "dsh-provider"
      ]
    }
  }
}
EOF
  cat > "$PROFILE_DIR/cordis.patch.yml" <<'EOF'
# plan-test profile 的 patch 层（应用在 bundle 层之后）。
# 与 web profile 的差异：禁用官方模型管理三件套（适配器/选择器/配置页），由 dsh-provider 补位。
# llm-pi-ai 在带 dsh-provider 时也会被其 bundle patch 禁用；这里再禁一次是为了
# 摘掉 dsh-provider 看裸基线时它也不回来。

# 同 web：启用全文会话搜索（官方默认 opt-in）
- id: session-query-sqlite
  config:
    path: !!js dshHomePath('session-query.sqlite')
    openAt: first-search

# 官方模型管理三件套全禁用（见 REQUIREMENTS.md §9）。本插件的 bundle patch 已经禁了它们，
# 这里再禁一次是为了「裸基线」形态：把 dsh-provider 从 profile 里摘掉重启时，官方行也不回来。
- id: llm-pi-ai
  disabled: true
- id: ui-model-selection
  disabled: true
- id: ui-settings-models
  disabled: true
EOF
  ln -sfn "$PROJECT_ROOT" "$PROFILE_DIR/node_modules/dsh-provider"
  if [ -d "$DSH_HOME_DIR/workspaces/dsh-mobile/plugin" ]; then
    ln -sfn "$DSH_HOME_DIR/workspaces/dsh-mobile/plugin" "$PROFILE_DIR/node_modules/dsh-sidekick"
  fi
}

start() {
  stop
  ensure_profile
  DSH_PROVIDER_TEST=1 nohup dsh --profile "$PROFILE" --port "$PORT" --no-open > "$LOG" 2>&1 &
  local url=""
  for _ in $(seq 1 30); do
    url="$(grep -o "http://127.0.0.1:$PORT/?token=[A-Za-z0-9_-]*" "$LOG" | head -1 || true)"
    [ -n "$url" ] && break
    sleep 1
  done
  if [ -z "$url" ]; then
    echo "启动失败，最后日志($LOG):" >&2
    tail -20 "$LOG" >&2 || true
    exit 1
  fi
  echo "测试实例: $url"
  open "$url"
}

case "${1:-start}" in
  start) start ;;
  stop) stop; echo "已停止: port ${PORT}" ;;
  *) echo "用法: $0 [start|stop]" >&2; exit 2 ;;
esac

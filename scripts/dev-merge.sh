#!/usr/bin/env bash
# 用法: scripts/dev-merge.sh <slug>
#   —— 在主线运行，把已完成的 worktree 分支合入 main（本仓库只有这一条集成线）。
# 流程：校验 -> 在 worktree 里 rebase 到最新 main -> rebase 后复测 -> --no-ff 合入 ->
#       主线复测 -> 清理 worktree/分支/标记。
# 主线不开发，只负责测试、集成和合入；合入必须串行：一次只跑一个 dev-merge，
# 等它完全结束再合下一个任务。串行靠 main-lock.sh 的写锁强制（不是约定）：
# 从校验到合入全程持锁，并发跑第二个 dev-merge 会拿不到锁直接退出。
# 不带参数时列出所有待合并的 done 标记。
set -euo pipefail

SLUG="${1:-}"
if [ -z "$SLUG" ]; then
  echo "用法: scripts/dev-merge.sh <slug>" >&2
  echo "待合并的任务："
  git tag -l 'done/*' | sed 's/^done\//  /' || true
  exit 2
fi

MAIN_ROOT=$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)
cd "$MAIN_ROOT"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/main-lock.sh"
BRANCH="agent/$SLUG"

git show-ref --verify --quiet "refs/heads/$BRANCH" || { echo "分支 $BRANCH 不存在。" >&2; exit 1; }

# 拿写锁：之后所有写主线的操作（rebase 结果、--no-ff 合并、清理）都在锁内完成，
# EXIT trap 保证成功/失败/中断都释放。
acquire_main_lock "dev-merge $SLUG" || exit 1
trap release_main_lock EXIT

git rev-parse --verify --quiet "refs/tags/done/$SLUG" >/dev/null || {
  echo "缺少 done/$SLUG 标记——先在对应 worktree 里跑 scripts/dev-finish.sh 完成自测。" >&2; exit 1; }
[ "$(git rev-parse "$BRANCH")" = "$(git rev-parse "done/$SLUG^{commit}")" ] || {
  echo "done/$SLUG 不在分支最新提交上（rebase 或新提交后没重跑 dev-finish）。" >&2; exit 1; }
[ "$(git branch --show-current)" = "main" ] || {
  echo "主线工作区（${MAIN_ROOT}）当前不在 main 分支，先切回 main。" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || {
  echo "主线工作区有未提交改动，先收尾再合并：" >&2; git status --short; exit 1; }

WT=$(git worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '
  /^worktree /{p=$2} /^branch /{if ($2==b) print p}')
[ -n "$WT" ] || { echo "找不到 $BRANCH 对应的 worktree。" >&2; exit 1; }

echo "== rebase $BRANCH 到最新 main =="
# --rebase-merges：保留分支内的 merge 提交结构。
# GIT_EDITOR=true：非交互场景跑 rebase/commit 会被 core.editor（常见配置 code --wait）
# 拉起外部编辑器并阻塞等待，导致流程挂死。冲突解决后的 `git rebase --continue`
# 内部带 `-e`，必须显式抑制编辑器。
if ! GIT_EDITOR=true git -C "$WT" rebase --rebase-merges main; then
  cat >&2 <<EOF
rebase 有冲突。进入 $WT 解决：
  cd $WT
  ...解决冲突后 git add，然后 GIT_EDITOR=true git rebase --continue...
  scripts/dev-finish.sh        # 重新自测 + 更新 done 标记
再回到主线重跑：scripts/dev-merge.sh $SLUG
EOF
  exit 1
fi

echo "== rebase 后复测（worktree）=="
npm --prefix "$WT" test

SUMMARY=$(git log --reverse --format='- %s' "main..$BRANCH")
git merge --no-ff "$BRANCH" \
  -m "merge(agent): 合入 $SLUG" \
  -m "任务分支 $BRANCH 已完成自测（npm test），包含提交：
$SUMMARY"

echo "== 主线复测（${MAIN_ROOT}）=="
# 内容守恒：--no-ff 合并只新增一个提交、不改树——合并后的树与刚在 worktree 复测过的
# 分支树逐位一致时免重复全量（用户批注 09-24：简化流程加速开发）；不一致（理论外
# 情形，例如主线在锁内被外力改动）才兜底重跑。
if [ "$(git rev-parse "$BRANCH^{tree}")" = "$(git rev-parse 'HEAD^{tree}')" ]; then
  echo "   合并后树与已复测分支逐位一致，跳过重复全量。"
elif ! npm test; then
  cat >&2 <<EOF
主线测试没通过。当前 main 上已经有本次合并提交，先别继续合别的任务：
  - 能马上修：从最新 main 开新 worktree（scripts/dev-start.sh <任务名>），修好走完整流程再合。
  - 主线不可用（插件起不来/核心功能挂）：先回退这次合并再排查
      git revert -m 1 <本次 merge commit>
EOF
  exit 1
fi

git worktree remove "$WT"
git branch -d "$BRANCH" >/dev/null
git tag -d "done/$SLUG" >/dev/null

echo
echo "已合入 main 并清理 worktree / 分支 / done 标记。"

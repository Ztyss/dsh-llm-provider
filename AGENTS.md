# AGENTS.md

给所有在本仓库干活的 session（人或 AI）的约定。核心一条：**主线不开发，开发全在 worktree**。

## 铁律：开发一律走 worktree

**main 分支不写代码**，只负责测试、集成和合入。任何要改仓库文件的任务，动手前先开 worktree：

1. `scripts/dev-start.sh <任务名>` —— 建 `.worktrees/<slug>`（分支 `agent/<slug>`）。
2. `cd .worktrees/<slug>` 开发，**高频小提交**（写完一段就提交，别攒到最后；中文一行说清做了什么、为什么）。
3. `scripts/dev-finish.sh` —— 检查改动已提交 → 跑 `npm test` → 打 `done/<slug>` 标记。**开发 session 到此为止，不合入。**
4. 回到主线（主工作区）跑 `scripts/dev-merge.sh <slug>` —— rebase 到最新 main → 复测 → `--no-ff` 合入 → 主线复测 → 清理 worktree/分支/done 标记。

**例外**（不走 worktree，直接在 main 上做）：只读分析（读代码、查资料、汇报）；改仓库自身约定/文档且不涉及代码行为（本文件、`README.md` 纯文档、`scripts/` 里的流程脚本）——工作流没法自己 bootstrap，这几样只能在 main 上改。

## 构建与测试

- **源码在 `src/`（TypeScript），`lib/` 是构建产物、不入库。** 改完要 `npm run build`
  （= `tsdown`）。插件是 profile 里 `link:` 进来的，跑的就是 `lib/`，忘了构建就是跑旧代码。
- 自测 = `npm test`（= `npm run build` + `test/*.mjs` 七个离线测试，都在 command line 跑、
  不起 dsh）。dev-finish 和 dev-merge 都会跑它。
- `npm run typecheck`（= `tsc --noEmit`）是类型检查，`npm test` 不含它——构建不报类型错，
  类型错了要单独跑才看得见。
- 要开界面看效果：`scripts/test-profile.sh`（在 worktree 里跑就是起这个 worktree 的实例，插件目录按脚本位置定位）。这个脚本会写 `~/.dsh/profiles/`、还要开浏览器，**由用户本人在真实终端跑**，代理别在沙箱里试。
- 测试实例默认 3081 端口、`plan-test` profile——**一次只能跑一个**。要并行各起一个：
  `PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`

## 注意点

- 非交互场景跑 git 一律带 `GIT_EDITOR=true`（rebase、commit）。否则 git 会用 `core.editor`（常配 `code --wait`）拉起编辑器阻塞，命令挂死、窗口莫名弹到桌面上。
- 合入必须串行：`dev-merge.sh` 全程持 `<git-common-dir>/main-write.lock`（`scripts/main-lock.sh` 的原子 mkdir 锁），拿不到锁说明已有进程在写 main，等它结束再跑，**不要手动绕过校验去 merge**。被中断留下残留锁时：`rm -rf .git/main-write.lock`。
- rebase 有冲突：进 worktree 解决 → `scripts/dev-finish.sh` 重跑（刷新 done 标记）→ 回主线重跑 `dev-merge.sh`。主线始终不被冲突污染。
- 合入后主线测试挂了：能从最新 main 开新 worktree 修就修（走完整流程）；主线不可用（插件起不来/核心功能挂）就先 `git revert -m 1 <merge commit>` 恢复，再另开 worktree 排查。
- worktree 是「拉分支那一刻」的快照：**worktree 里的 `scripts/` 可能是旧版**，要用新脚本就写主线路径、cwd 留在 worktree 内：`bash /Users/cgeng/Workspaces/dsh-plan/scripts/dev-merge.sh <slug>`。
- worktree 里**要装依赖**（从 2026-09-15 起是 TypeScript 项目）：新建的 worktree 没有
  `node_modules`，进去先 `npm install`（装 typescript / tsdown / @types/node），否则
  `npm run build` 起不来。`node_modules/`、`vendor/`、`reference/dsh-src/` 都是 gitignore 的，
  不进 worktree。worktree 里跑测试实例时，`vendor/`（bridge 副本 + pi-ai）会由插件自己在该
  worktree 里重新生成，属正常。
- 临时产物（复现样例、diff、临时脚本、截图）写到 `/tmp`，不要落在仓库里：主线有 untracked 文件会挡住 `dev-merge.sh` 的校验。

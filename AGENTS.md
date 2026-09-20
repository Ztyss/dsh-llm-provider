# AGENTS.md

给所有在本仓库干活的 session（人或 AI）的约定。

## 铁律：开发一律走 worktree

**main 分支不写代码**，只负责测试、集成和合入。任何要改仓库文件的任务，动手前先开 worktree：

1. `scripts/dev-start.sh <任务名>` —— 建 `.worktrees/<slug>`（分支 `agent/<slug>`）。
2. `cd .worktrees/<slug>` 开发，**高频小提交**（写完一段就提交，别攒到最后；中文一行说清做了什么、为什么）。
3. `scripts/dev-finish.sh` —— 检查改动已提交 → 跑 `npm test` → 打 `done/<slug>` 标记。**开发 session 到此为止，不合入。**
4. 回到主线（主工作区）跑 `scripts/dev-merge.sh <slug>` —— rebase 到最新 main → 复测 → `--no-ff` 合入 → 主线复测 → 清理 worktree/分支/done 标记。

**例外**（不走 worktree，直接在 main 上做）：只读分析（读代码、查资料、汇报）；改仓库自身约定/文档且不涉及代码行为（本文件、`README.md` / `README.zh.md` 纯文档、`scripts/` 里的流程脚本）——工作流没法自己 bootstrap，这几样只能在 main 上改。

## 构建与测试

- **源码在 `src/`（TypeScript），`lib/` 是构建产物、随仓库分发**（github 安装直接跑 `lib/`，
  没有 prepare 脚本）。改完要 `npm run build`（= `tsdown`），并把 `lib/` 与 `src/` 放进**同一个
  commit**——忘了构建、或构建了没一起提交，装的就不是这份源码跑出来的产物。
- 自测 = `npm test`（= `npm run build` + `test/*.mjs` 离线测试链，都在 command line 跑、
  不起 dsh）。dev-finish 和 dev-merge 都会跑它。
- `npm run typecheck`（= `tsc --noEmit`）是类型检查，`npm test` 不含它——构建不报类型错，
  类型错了要单独跑才看得见。宿主 app 的 `node_modules` 被打包剥掉了 `.md`/`.d.ts`，
  `@deepseek-ai/schemastery` 的类型由 `src/schemastery.d.ts` 垫片提供（只声明用到的最小面，
  别往里加货）。
- 要开界面看效果：`scripts/test-profile.sh`（在 worktree 里跑就是起这个 worktree 的实例，插件目录按脚本位置定位）。这个脚本会写 `~/.dsh/profiles/`、还要开浏览器，**由用户本人在真实终端跑**，代理别在沙箱里试。
- 测试实例默认 3081 端口、`plan-test` profile——**一次只能跑一个**。要并行各起一个：
  `PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`。
  脚本生成的 profile 还会 link 本机另一条插件 `dsh-sidekick`（`$DSH_HOME/workspaces/dsh-mobile/plugin`），
  没有那份 checkout 的机器上先改脚本里那两行。

## 注意点

- 非交互场景跑 git 一律带 `GIT_EDITOR=true`（rebase、commit）。否则 git 会用 `core.editor`（常配 `code --wait`）拉起编辑器阻塞，命令挂死、窗口莫名弹到桌面上。
- 合入必须串行：`dev-merge.sh` 全程持 `<git-common-dir>/main-write.lock`（`scripts/main-lock.sh` 的原子 mkdir 锁），拿不到锁说明已有进程在写 main，等它结束再跑，**不要手动绕过校验去 merge**。被中断留下残留锁时：`rm -rf .git/main-write.lock`。
- rebase 有冲突：进 worktree 解决 → `scripts/dev-finish.sh` 重跑（刷新 done 标记）→ 回主线重跑 `dev-merge.sh`。主线始终不被冲突污染。
- 合入后主线测试挂了：能从最新 main 开新 worktree 修就修（走完整流程）；主线不可用（插件起不来/核心功能挂）就先 `git revert -m 1 <merge commit>` 恢复，再另开 worktree 排查。
- worktree 是「拉分支那一刻」的快照：**worktree 里的 `scripts/` 可能是旧版**，要用新脚本就写主工作区的绝对路径、cwd 留在 worktree 内：`bash <主工作区>/scripts/dev-merge.sh <slug>`。
- 装依赖：`dev-start.sh` 建完 worktree 会自动跑一次 `scripts/install-deps.sh`（装 typescript / tsdown / @types/node），失败时它会打印手动命令，那才需要补跑。**别直接 `npm install`**——会去 reify 那条指向宿主的 `node_modules/@deepseek-ai` 软链，直接 EPERM；脚本负责装前挪开、装完放回。
- worktree 里没有的东西：`node_modules/`、`reference/` 完全不进；`vendor/` 只有 `package.json` 和 lockfile 入库会跟着进，`vendor/pi-ai/`、`vendor/llm-bridge/`、`vendor/node_modules/` 不进。跑测试实例时 `vendor/`（bridge 副本 + pi-ai）会由插件自己在该 worktree 里生成，属正常。
- 临时产物（复现样例、diff、临时脚本、截图）写到 `/tmp`，不要落在仓库里：主线有 untracked 文件会挡住 `dev-merge.sh` 的校验。

## UI harness（headless Chrome 验证链）

- `test/ui-harness/drive.mjs`：把真实 `lib/client.js` 渲进 `harness.html`，按步骤点开界面，
  断言全是几何/DOM 级（getBoundingClientRect、computed style），同时截图留档。
- `test/ui-harness/flicker-probe.mjs`：**边框/样式闪烁回归**。在 React 忠实环境里反复切换
  「服务商 ↔ pi-ai 桥接」标签，逐帧采样卡片 borderTopColor 亮度（半透明色先合成到白底再算，
  否则 `rgba(0,0,0,.15)` 这种正常浅灰边框会被误判成黑）+ 检测 border-color CSSTransition +
  节点身份复用。判红 = 350ms 内出现真深色帧或 border-color 过渡。
  退出码 0/1 可直接进脚本。跑法：`node test/ui-harness/flicker-probe.mjs lib/client.js <输出目录>`。
- **mini-react 垫片 v2 是「最小 reconciliation」语义**（同位置同类型同 key 的 DOM 节点就地更新，
  类型或 key 不同才重建）——和真实 react 对齐。改这个垫片前先想清楚：v1 整树重建永远不触发
  CSS transition，桥接页「边框先黑 ~0.2s 再恢复」那类 bug 在 v1 下天生复现不了（已烧过一次）。
  代价规律：**条件分支两边如果是同类型元素，必须各带不同 key**，否则真实 react 会复用节点、
  已有节点上的 className 变化会触发该 class 的 transition。

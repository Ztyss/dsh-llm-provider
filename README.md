# @ztyss/dsh-llm-provider

一个 [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）插件：接管官方的
pi-ai 适配器（`llm-pi-ai`）、DeepSeek 适配器（`llm-deepseek`）、模型选择器（`ui-model-selection`）
与 Models 设置页（`ui-settings-models`），提供自维护的 pi-ai 桥接、模型选择器、额度查询与
供应商管理界面。

**中文** · [English](README.en.md)

> 本仓库 fork 自 [imchangchang/dsh-llm-provider](https://github.com/imchangchang/dsh-llm-provider)，此后独立维护演进。当前版本 [v0.2.4](https://github.com/Ztyss/dsh-llm-provider/releases/tag/v0.2.4)（安装走 main 分支）。

## 安装

```sh
dsh plugin --profile web add github:Ztyss/dsh-llm-provider   # 私有仓库，git 需凭据（gh auth login 即可）
dsh web     # 需要重启：插件树在进程启动时组装
```

`lib/` 构建产物随仓库分发，装完即用。改源码后 `npm run build` 并把 `lib/` 与 `src/`
同 commit 提交（刻意没有 prepare 脚本：pnpm 从 git 安装时跑它会失败）。

## 功能

### pi-ai 桥接：启用最新版

设置页（Provider → pi-ai 桥接）的**「启用最新版 pi-ai」开关**：让官方 pi-ai 适配器跑在从 npm
下载的 `@earendil-works/pi-ai` 最新版上，替代 DSH 自带版本——pi-ai 出新版本、支持新模型时
不必等待 dsh 发版。

- **拨 ON = 常驻意图**：从 npm registry 拉 `dist-tags.latest` 的 `@earendil-works/pi-ai`——
  sha512 校验 → 解压 → 装依赖闭包 → 按桥接副本的 import 需求体检，落**安全区**
  `$DSH_HOME/llm-provider-bridge/pi-ai/<版本>/`（插件包随时可能被整棵递归删，几百 MB 不放
  包里）；重启后桥接软链指向自有版，顶替 DSH 自带那份，体检不过自动回退，开关永远有兜底。
- **拨 OFF = 回退 DSH 自带版**：已下载文件保留，再拨 ON 零成本。
- **开关偏好也住安全区**：`$DSH_HOME/llm-provider-bridge/vendor-status.json`——此前偏好写在
  插件包内 `vendor/status.json`，包管理器每次重装/升级都整棵重建插件目录，开关被重置回 OFF；
  迁出后重装零丢失（包内过渡版文件首次读取时自动并入安全区再移除）。
- **只保留最新一个自有版本**：loadBridge 选中新版、切换完成后才清旧版（当前进程绝不踩待删
  目录）。
- **触网只与开关 ON 相关，共两处**：拨开关那一下，以及**每次启动检查一次**——本地没有就绪
  副本就自动补下载（启动即进入下载中态，不必再拨一次），已就绪也检查 npm、有更新版本就
  自动下载（`updateDecision` 跳过「最新版 ≤ 本地已就位」）；60 秒最小间隔只是防 crash-loop
  的工程防抖。**拨 OFF 一概不触网**。
- **版本行即真相**：当前 x.y.z（DSH 自带 / npm 最新 / vendor——一眼可判断在用哪份）；开关
  右侧只在有「进行/待办」时说话：下载中 / 已下载 x.y.z（重启生效）/ 已更新 x.y.z（重启生效）/
  已下载 x.y.z（重启后回退官方）/ 已下载 x.y.z（无法启用）/ 已下载 x.y.z（未启用）。「要不要重启」由
  `piAiNeedsRestart` 现场推导（偏好 + 安全区已就位版本 + 当前跑的那档）——原地启用（无需
  下载）那一态也照实说重启；待生效的那一版是**本次检查真下载来的**（`lastCheck.installed`
  正是它，典型：重启后启动检查自动更新）说「已更新」，文件早有、只是没在跑说「已下载」；
  未过检验的原因常驻在桥接明细行。下载中 2s 轮询。

### 模型服务设置页

- **中英双语**：双语字典 + `tf` 插值，走 dsh 自己的 locale 机制，语言切换实时跟随。
- **供应商卡就地编辑**：显示名、API 地址、协议、凭据名直接在卡片原位改——没有编辑模式、
  没有独立表单，无改动时卡片不出现任何编辑痕迹，一有草稿才浮出「保存修改 / 取消」；
  只写改动过的字段，清空某个字段是**移除该键**。路由 ID 是配置键保持只读。
- **模型清单即勾选清单**：展开「模型（N）」直接勾选，与编辑按钮解耦；现有条目只读展示
  （能力徽章 + 格式化上下文，与显示清单同款列），已配置的行给 ✕ 一键删除；只有目录里没有的
  自定义 ID 才填上下文/最大输出与视觉/视频。保存写专用路由 `POST /provider/set-models`
  （服务端校验、拒绝内置路由），声明原文为底稿——保全手写的 `reasoningEfforts` / `compat`；
  「跟随目录（还原）」即删掉该键回到目录全量。
- **pi-ai 桥接页 toggle 化**：「启用最新版 pi-ai」开关 + 右侧状态行（当前版本+来源 /
  已是最新 / 已下载待重启 / 未过检验常驻原因）；拨 ON 后及每次启动检查时 2s 轮询等下载收尾。
- **删除确认弹层**：代价清单 + 「导出配置（YAML）」备份（密钥不导出）。
- **能力三态徽章**：支持 / 明确不支持 / **未知** 分开渲染；目录查不到的模型从路由声明与
  适配器自报补齐能力（modlens 这类合成 provider）。

### 控制台 Cookie 存储

需要控制台会话的 provider（StepFun 的 Step Plan 点数这一类）把 Cookie 存在
`$DSH_HOME/llm-provider-bridge/.cookies.yaml`——**单文件、点前缀隐藏**，对齐 `.credentials.yaml`
的习惯；范式同 credentials（`version` + 扁平键表），键 = 凭据 ref 名（如
`STEPFUN_CONSOLE_COOKIE`），新 provider / 新 Cookie 直接加键。解析容错手改，坏行不炸查询。

- **旧版单槽会话文件自动迁移**：`stepfun-console-session.json` 首次读取并入新文件后移除。
- **种子指纹去重（写盘收敛）**：条目记 `seedSha`（种子凭据指纹）——同一凭据的后续配额刷新
  命中指纹即用存储值，不再把静态凭据反复写回。此前一次刷新 = 两次写盘 + 一次白做的续期 RPC；
  现在只在「重贴 Cookie」与「续期轮换」两种真实变化时落盘。
- **碎片种子守护**：种子必须含 `Oasis-Token` 段——只贴了 `Oasis-Webid` 一枚的碎片不会覆盖
  已轮换的好 jar。
- **全新机器首存**：bridge 目录不存在时自动创建。

### 模型选择器

- **整体接管**：官方模型选择器停用后，选择座位（当前模型状态）、`/model` 命令与模型目录
  状态机全部由本插件提供。
- **`/model` 命令**：按供应商过滤、搜索模型，候选按供应商分组展示，每组显示额度/余额。
- **`available` 契约**：为 `/` 命令贡献实现官方必填的 `available(session)`——被寻址为子代理
  的会话不出现模型选择；契约是宿主裸调、一抛整批 `/` 候选陪葬，因此实现永不抛错，任何异常
  一律吞掉并放行。

## 稳定性与安全设计

- **加载前体检与候选链**：`src/pi-ai-source.ts` 校验 manifest、入口与官方 bundle 实际 import
  的四条子路径；残缺时给出可执行的恢复指引（npm pack 覆盖回宿主目录，插件不代劳）。
  `piAiCandidates()` 候选链 = 安全区（拨 ON 时，新→旧）→ vendor 遗留档 → 内置依赖 →
  dsh 自带，逐个体检，第一个通过的入选。
- **桥接工作区在包外安全区** `$DSH_HOME/llm-provider-bridge/`：插件包随时可能被整棵递归删
  （Node ≥24.15 的 `rmSync` 会顺 junction 清空目标），安全区方案下没有任何链接可供跟随。
  不变量：**安装插件包整包零链接**（`test/host-safety.mjs` 实证）。
- **npm cache 不常驻**：下载时的 npm cache 放系统临时目录、装完即删（成败都删）；启动时另有
  一道兜底——清理安全区里遗留的 `.npm-cache`。
- **官方条目条件禁用（fail-open）**：`cordis.patch.yml` 用 `!!js` 表达式——pi-ai 完好才禁用
  官方四条目，缺失/残缺时保留它们，宿主照常启动。表达式由 `src/patch-condition.ts` 生成，
  `scripts/sync-patch-condition.mjs --check` 防止与 patch 文件漂移。

## 测试

```sh
npm test                      # 构建 + 18 步离线测试链（不需要 dsh；末步是 patch 条件漂移校验）
node test/host-safety.mjs     # junction 安全回归：须在 node 24.14 与 DSH 自带运行时（≥24.15）各跑一遍
```

# @ztyss/dsh-llm-provider

一个 [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）插件：接管官方的
pi-ai 适配器（`llm-pi-ai`）、DeepSeek 适配器（`llm-deepseek`）、模型选择器（`ui-model-selection`）
与 Models 设置页（`ui-settings-models`），并提供额度查询与供应商管理。基础能力继承自上游，
本 README 只写**本仓库的定制**。

**中文** · [English](README.en.md)

## 来源

| | |
|---|---|
| 上游 | [imchangchang/dsh-llm-provider](https://github.com/imchangchang/dsh-llm-provider) |
| 本 fork | [Ztyss/dsh-llm-provider](https://github.com/Ztyss/dsh-llm-provider)（私有） |
| 本仓库版本 | [v0.2.1](https://github.com/Ztyss/dsh-llm-provider/releases/tag/v0.2.1)（安装走 main 分支） |
| 基线 | 上游 `1eb017f`（v0.1.0-rc.2）；上游 0.2.0 无源码发布，其独有功能（OAuth、github-copilot）不在范围 |

## 安装

```sh
dsh plugin --profile web add github:Ztyss/dsh-llm-provider   # 私有仓库，git 需凭据（gh auth login 即可）
dsh web     # 需要重启：插件树在进程启动时组装
```

`lib/` 构建产物随仓库分发，装完即用。改源码后 `npm run build` 并把 `lib/` 与 `src/`
同 commit 提交（刻意没有 prepare 脚本：pnpm 从 git 安装时跑它会失败）。

## 本仓库的定制

### pi-ai 开关：启用最新版

两次 P0 事故（递归删除顺 junction 清空宿主 pi-ai → DSH 起不来）之后的结构性收敛，
加上「上游出新模型不用等 dsh 发版」的诉求，落地成一个设置页开关：

- **「启用最新版 pi-ai」toggle**（桥接页，形态同系统开关）：拨 ON = 从 npm registry 拉
  `dist-tags.latest` 的 `@earendil-works/pi-ai`——sha512 校验 → 解压 → 装依赖闭包 →
  按桥接副本的 import 需求体检，落**安全区** `$DSH_HOME/llm-provider-bridge/pi-ai/<版本>/`
  （插件包会被整棵递归删，几百 MB 不放包里）；重启后桥接软链指向自有版，顶替 DSH 自带那份，
  体检不过自动回退，开关永远有兜底。拨 OFF = 回退 DSH 自带版，**已下载文件保留**，
  再拨 ON 零成本。**只保留最新一个自有版本**：loadBridge 选中新版、切换完成后才清旧版
  （当前进程绝不踩待删目录）。
- **触网只与开关 ON 相关，共两处**：拨开关那一下，以及**每次启动检查一次**——本地没有
  就绪副本就自动补下载（启动即进入下载中态，不必再拨一次），已就绪也查上游、有新版就
  自动下（`updateDecision` 会跳过「上游 ≤ 本地已就位」）；60 秒最小间隔只是防 crash-loop
  的工程防抖。**拨 OFF 一概不触网**。
- **版本行即真相**：当前 x.y.z（DSH 自带 / **上游最新** / vendor——上方 toggle 一列即可判断
  在用哪份）；开关右侧只在有「进行/待办」时说话：正在下载上游pi-ai... / 已下载 x.y.z（重启生效）/
  已下载 x.y.z（重启后回退官方）/ 已下载 x.y.z（无法启用）/ 已下载 x.y.z（未启用）。「要不要重启」
  由 `piAiNeedsRestart` 现场推导（偏好 + 安全区已就位版本 + 当前跑的那档）——原地启用（无需下载）
  那一态也照实说重启，不再念「已就位、无需下载」；未过检验的原因常驻在桥接明细行。下载中 2s 轮询。
- **加载前体检不变**：`src/pi-ai-source.ts` 校验 manifest、入口与官方 bundle 实际 import 的
  四条子路径；残缺时给出可执行的恢复指引（npm pack 覆盖回宿主目录，插件不代劳）。
  `piAiCandidates()` 候选链 = 安全区（拨 ON 时，新→旧）→ vendor 遗留档 → 内置依赖 → dsh 自带，
  逐个体检，第一个通过的入选。
- **桥接工作区在包外安全区** `$DSH_HOME/llm-provider-bridge/`。插件包随时可能被整棵递归删
  （Node ≥24.15 的 `rmSync` 会顺 junction 清空目标，实测），安全区方案下没有任何链接可供跟随。
  不变量：**安装插件包整包零链接**（`test/host-safety.mjs` 实证）。
- **npm cache 不常驻**：下载时的 npm cache 放系统临时目录、装完即删（成败都删）；启动时另有一道兜底——清理安全区里历史遗留的 `.npm-cache`（老版本曾把 cache 放安全区，实测一台机常驻 177 MB）。
- **官方条目条件禁用（fail-open）**：`cordis.patch.yml` 用 `!!js` 表达式——pi-ai 完好才禁用
  官方四条目，缺失/残缺时保留它们，宿主照常启动。表达式由 `src/patch-condition.ts` 生成，
  `scripts/sync-patch-condition.mjs --check` 防止与 patch 文件漂移。

### 界面定制

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

### 上游 issue #1–#8 全部修复

逐模型编辑、卡片级编辑、删除确认与导出、磁盘收敛、能力徽章、桥接诊断、
`/model` 命令的 `available` 契约、窗口分组——逐条修法与迭代历史见 git 提交记录。

## 测试

```sh
npm test                      # 构建 + 15 步离线测试链（不需要 dsh）
node test/host-safety.mjs     # junction 安全回归：须在 node 24.14 与 DSH 自带运行时（≥24.15）各跑一遍
```

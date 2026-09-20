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
| 本仓库版本 | [v0.1.2](https://github.com/Ztyss/dsh-llm-provider/releases/tag/v0.1.2)（安装走 main 分支） |
| 基线 | 上游 `1eb017f`（v0.1.0-rc.2）；上游 0.2.0 无源码发布，其独有功能（OAuth、github-copilot）不在范围 |

## 安装

```sh
dsh plugin --profile web add github:Ztyss/dsh-llm-provider   # 私有仓库，git 需凭据（gh auth login 即可）
dsh web     # 需要重启：插件树在进程启动时组装
```

`lib/` 构建产物随仓库分发，装完即用。改源码后 `npm run build` 并把 `lib/` 与 `src/`
同 commit 提交（刻意没有 prepare 脚本：pnpm 从 git 安装时跑它会失败）。

## 本仓库的定制

### pi-ai 只读 + 安全桥接

两次 P0 事故（递归删除顺 junction 清空宿主 pi-ai → DSH 起不来）之后的结构性收敛：

- **只用 dsh 自带那份 pi-ai，绝不下载**。没有后台检查；`/provider/update` 回一句"已停用"。
  唯一入口是 `DSH_PROVIDER_UPDATE=on`（opt-in；vendor 档保留，平时不落地任何副本）。
- **加载前体检**：`src/pi-ai-source.ts` 校验 manifest、入口与官方 bundle 实际 import 的
  四条子路径；残缺时给出可执行的恢复指引（npm pack 覆盖回宿主目录，插件不代劳）。
- **桥接工作区在包外安全区** `$DSH_HOME/llm-provider-bridge/`。插件包随时可能被整棵递归删
  （Node ≥24.15 的 `rmSync` 会顺 junction 清空目标，实测），安全区方案下没有任何链接可供跟随。
  不变量：**安装插件包整包零链接**（`test/host-safety.mjs` 实证）。
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
- **pi-ai 桥接页一行化**：默认（自动下载停用）只显示「当前 pi-ai 版本 x.y.z（官方 / vendor）」；
  `DSH_PROVIDER_UPDATE=on` 时上游版本与「检查更新」按钮自动回归。
- **删除确认弹层**：代价清单 + 「导出配置（YAML）」备份（密钥不导出）。
- **能力三态徽章**：支持 / 明确不支持 / **未知** 分开渲染；目录查不到的模型从路由声明与
  适配器自报补齐能力（modlens 这类合成 provider）。

### 上游 issue #1–#8 全部修复

逐模型编辑、卡片级编辑、删除确认与导出、磁盘收敛、能力徽章、桥接诊断、
`/model` 命令的 `available` 契约、窗口分组——逐条修法与迭代历史见 git 提交记录。

## 测试

```sh
npm test                      # 构建 + 13 步离线测试链（不需要 dsh）
node test/host-safety.mjs     # junction 安全回归：须在 node 24.14 与 DSH 自带运行时（≥24.15）各跑一遍
```

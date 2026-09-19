# @dsh-one/dsh-llm-provider

一个 [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）插件。
它替换 dsh 插件树里的四个条目——pi-ai 适配器（`llm-pi-ai`）、原生 DeepSeek 适配器
（`llm-deepseek`）、模型选择器（`ui-model-selection`）与官方 Models 设置页
（`ui-settings-models`），并在其上加了额度查询与供应商管理。

**中文** · [English](README.md)

## 这个仓库从哪来

| | |
|---|---|
| 上游 | [imchangchang/dsh-llm-provider](https://github.com/imchangchang/dsh-llm-provider) |
| 本 fork | [Ztyss/dsh-llm-provider](https://github.com/Ztyss/dsh-llm-provider)（私有） |
| 基线提交 | 上游 `1eb017f`（v0.1.0-rc.2） |
| remote | `origin` → 本 fork · `upstream` → 原仓库 |

上游 `0.2.0` 在那个仓库里没有源码（只有 `main`），所以这里所有源码级改动都基于
`1eb017f`。只存在于 `0.2.0` 的功能（OAuth、github-copilot）不在范围内。

## 本地的定制

1. **pi-ai 只读。** 插件只用 dsh 自带的那一份，绝不自己下载；所有下载/更新入口都已
   关闭，安装副本的递归删除写路径也已移除（见 [pi-ai 桥接](#pi-ai-桥接)）。
2. **卡片级供应商编辑。** 每张供应商卡片有编辑模式（✎），可就地改显示名、协议、端点与
   凭据名。只写改动过的字段；清空某个字段是**移除该键**，而不是写入空值。
3. **浏览器端双语（中/英）**，走 dsh 自己的 locale 机制。
4. **issue #1–#8 的修复**（见 [已修 issue](#已修-issue)）。
5. **面向 fork 的打包**：构建产物（`lib/`）入库，使本仓库能用一条
   `dsh plugin add` 安装；测试实例可与真实 profile 并行运行。

## 使用

### 安装

```sh
# 一条命令。本 fork 是私有仓库，所以 git 需要凭据（gh auth login 即可）。
dsh plugin --profile web add github:Ztyss/dsh-llm-provider
dsh web     # 需要重启：插件树在进程启动时组装
```

`dsh plugin add` 既转发给 pnpm，**又**会同步 `dsh.profile.bundles`。两半都关键——
只装依赖不会让插件被加载。校验：

```sh
dsh --profile web --dump-config | grep -A2 'id: dsh-llm-provider'
```

要在源码上工作时，把 checkout 链进 profile：

```sh
npm run build             # 生成 lib/
# 把 ~/.dsh/profiles/<profile>/node_modules/@dsh-one/dsh-llm-provider 链到本 checkout
# 并在 profile 的 package.json 里写 "@dsh-one/dsh-llm-provider": "link:<路径>"
```

### 第一次使用

插件在自己的 config 里声明了一条 DeepSeek 路由（`llm-pi-ai.providers.deepseek`，凭据名
`DEEPSEEK_API_KEY`），因为内置的 `llm-deepseek` 已被禁用。所以新装出来会看到一张没有
密钥的 DeepSeek 卡片：

- 在 设置 →「模型服务」→「服务商」里展开卡片。没存凭据时，「API 密钥」那一行是输入框；
  存下去会立刻跑一次额度查询。
- 其它供应商：「＋ 添加供应商」→ 选预设 → 填密钥与端点 → 测试通过 → 保存。
- 改已有供应商：点卡片上的 ✎。

密钥通过 dsh 自己的凭据服务存在路由的 `apiKeyEnv` 下，与官方那一套读的是同一份凭据。
不涉及插件配置文件。

### 配置

供应商来自 `settings.yaml` 的 `llm-pi-ai.providers`；那里没有路由时额度面板为空。密钥由
dsh 的凭据服务按各路由的 `apiKeyEnv` 解析。

**pi-ai 更新已关闭。** 插件跟随 dsh 自带的 pi-ai，从不下载：没有后台检查，也没有更新
按钮。`/provider/update` 仍会响应，但只回一句"已停用"。要换 pi-ai，请升级 dsh 本身。

### 测试实例

```sh
scripts/test-profile.sh        # 启动 plan-test profile（端口 3081）并打开浏览器
scripts/test-profile.sh stop   # 停掉
```

它用独立 profile，所以能与真实实例并行：
`PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`。
它设置 `DSH_PROVIDER_TEST=1`，浏览器端据此在标题后加 ` · 测试`、给 favicon 盖「测」。
在没有那个 checkout 的机器上，请改掉脚本里额外链接的插件。

### 命令行检查

```sh
node lib/adapters/run.js all            # 跑所有额度适配器（密钥取环境变量或 ~/.dsh/.credentials.yaml）
node lib/adapters/run.js kimi-coding --key sk-xx

npm test                                # 构建 + 12 个离线测试
npm run typecheck                       # tsc --noEmit（npm test 不含它）
```

## 实现

### pi-ai 桥接

dsh 的模型目录来自它构建时所用的 pi-ai 版本。本 fork **不**自己维护一份：只读使用
dsh 自带的那份。

- 使用前 `src/pi-ai-source.ts` 校验 `package.json`、`dist/index.js` 以及官方 bundle
  真正 import 的四条子路径（`providers/all.js`、`api/anthropic-messages.lazy.js`、
  `api/openai-completions.lazy.js`、`api/openai-responses.lazy.js`）。只判
  `package.json` 不够：2026-09-18 的事故形态正是目录与 manifest 都在、`dist/` 被清空，
  而 Node 报出的是与真实原因无关的 `Cannot find package '...pi-ai\index.js'`。
- 桥接副本在 `vendor/llm-bridge/`，旁边一条链指向宿主那份包；bundle 的懒加载
  （`api/*.lazy`、`providers/all`）于是解析到那里。
- 官方 `llm-pi-ai` 条目由 `cordis.patch.yml` 禁用，插件接手它的 settings 段、模型发现
  与目录。

**四个官方条目是「有条件禁用」的**，这正是让"pi-ai 坏掉"不至于拖垮整个宿主的关键：

```yaml
- id: llm-pi-ai
  disabled: !!js (()=>{try{…}catch{return false}})()
```

表达式由 `src/patch-condition.ts` 生成，`scripts/sync-patch-condition.mjs` 同步进 patch
文件，`npm test` 校验两者没有漂移。它从 dsh 入口解析 pi-ai：完好时禁用官方条目、由桥接
接手；缺失或残缺时**保留**官方条目，宿主照常启动。改这个表达式有两条硬约束（都实测过）：
求值作用域里**没有 `require`**；表达式抛错会让整棵插件树加载失败，所以必须自带
`try/catch`。

### 模型选择器

接手 composer 的 `conversation.input.model` 座位与 `/model` 命令（官方
`ui-model-selection` 条目被禁用——两套状态机会互相打架）：

- 交互与官方一致：触发胶囊 → 模型面板 → 推理等级面板。
- 数据路径相同：目录来自 `session/modelCatalog`，切换走 `session/selectModel`，额度来自
  `/plan/status`。本插件之前记录的会话可能写着官方 `deepseek-official` 路由，那条选择会
  被映射到当前路由（一次性）。
- 额外能力：带额度点的供应商筛选、跨供应商搜索、能力徽章、上下文标签、模型详情卡。
  额度指示取最紧的那一档；卡片里逐档分列。

### 供应商设置页

加了一个「模型服务」标签，下分「服务商」与「pi-ai 桥接」两个二级标签。

- 卡片沿用官方 PluginCard：状态点、名称、一行额度摘要、刷新时间，右侧是逐卡刷新与删除。
  展开后是路由配置与该供应商的模型清单（带过滤）。
- 添加：选预设 → 填密钥与端点 → **测试通过才写入**。写入走 `settings/mutate` 到
  `llm-pi-ai.providers`，以及 `credentials/set` 到凭据库——与官方页同一份存储。
- 逐模型清单编辑器写 `llm-pi-ai.providers.<id>.models`。
- **所有写入都是逐字段的**（`['providers', id, field]`）。路径正好落在 route 对象本身的
  `set`，在宿主的 `applyPathOp` 里是整段替换，会静默吃掉手写的 `models` / `compat`
  （issue #1）。
- 删除会清掉路由与凭据；内置原生路由不能在这里删。

### 额度适配器

每个供应商一个文件，放在 `src/adapters/` 下；`registry.ts` 里一行注册，契约在
`shared.ts`；`node lib/adapters/run.js` 可独立运行。除 qwen 外都用供应商自己的 API key
打一个免费的 GET 端点，都不需要浏览器会话。

| 适配器 | 数据源 |
|---|---|
| deepseek | `api.deepseek.com/user/balance` |
| kimi-coding | `api.kimi.com/coding/v1/usages` |
| moonshot | `api.moonshot.cn/v1/users/me/balance`（`.cn` 或 `.ai`，跟随配置的 baseURL） |
| glm | `open.bigmodel.cn/api/monitor/usage/quota/limit` |
| minimax | `api.minimaxi.com/v1/api/openplatform/coding_plan/remains` |
| opencode-go | `opencode.ai/zen/go/v1/usage` |
| zenmux | 配置的 `baseURL` 本身（响应里的 `quota_5_hour` / `quota_7_day`） |
| openrouter | `openrouter.ai/api/v1/credits` |
| qwen | 无公开端点：不发请求，卡片给一个「看控制台」链接 |

数字与呈现方式对齐 CC Switch
（[farion1231/cc-switch](https://github.com/farion1231/cc-switch)）：它显示哪些字段，这里
就显示哪些。

### HTTP 接口

| 路由 | 用途 |
|---|---|
| `GET /plan/status` | 每个供应商的额度快照（60 秒缓存，`?refresh=1` 绕过） |
| `GET /provider/status` | 桥接状态、路由表、测试实例标记 |
| `GET /provider/models` | 完整 pi-ai 模型元数据（60 秒缓存；详情卡与徽章用） |
| `GET /provider/presets` | 可添加的供应商预设（带 configured 标记） |
| `POST /provider/refresh` | 刷新某张卡的额度 |
| `POST /provider/remove` | 删除供应商（路由与凭据） |
| `POST /provider/test` | 用已存密钥查询某个供应商的额度（只读） |
| `POST /provider/update` | **已停用**——只回一句"下载已关闭" |

这些是普通路由而不是官方 Typert Remote：那个生成器只认 monorepo 布局，不适合单包插件。
代价是没有类型安全的调用点，所以用离线测试覆盖这些路由。

### 构建

```sh
npm run build      # tsdown：宿主 src/*.ts → lib/*.js（unbundle）；浏览器端 → lib/client.js
npm run watch      # 改动即重建
npm run typecheck  # tsc --noEmit
```

宿主端逐文件转译；浏览器端把 `src/client/` 全部内联进一个 CJS 文件，外面套
`window.__ModuleLoader__` 外壳（那三行由构建的 banner/footer/intro 加，不在源码里）。
宿主端构建是 **unbundle**：只有 `tsdown.config.ts` 的 `entry` 里列出的文件会被编译，
所以新增宿主模块必须加进 `entry`。

**本 fork 把 `lib/` 入库**，这样 `dsh plugin add github:…` 装出来就是可加载的包。改完
源码要 `npm run build`，并把 `lib/` 与 `src/` 一起提交。这里**刻意没有 `prepare`
脚本**：pnpm 从 git 安装时会在临时目录里跑它，那里没有 `tsdown`，会让整个安装失败。

依赖用 `scripts/install-deps.sh` 装，而不是直接 `npm install`：`node_modules/@deepseek-ai`
是一条指向宿主 profile 的链，npm 会顺着它进去、试图重排两百个包然后失败。

## 边界

- **不写宿主配置。** dsh 安装目录、`settings.yaml`、凭据一律只读。写只发生在插件自己的
  `vendor/` 与用户在界面上的显式操作。
- **不下载 pi-ai，也不改它。** 一个字节都不打补丁，哪怕它的模型数据是滞后于上游的静态
  快照——打补丁会破坏 registry 完整性校验。
- **不改官方插件。** 接管方式是禁用 `cordis.patch.yml` 里的官方条目，其余官方内容一律不动。
- **密钥值不离开宿主进程。** 浏览器端只拿到掩码（前 3 后 4 位）与元数据。
- **不支持浏览器会话类供应商。** 只支持 API key 型。
- **web 服务没有鉴权**（dsh 的设计，默认只绑回环）。这些路由假设只从回环访问：把宿主暴露到
  `0.0.0.0` 等于通过 `/plan/status` 暴露余额与凭据名。

## 对模型请求的影响

插件不改系统提示词、不改工具 schema、不改消息内容。它决定哪些模型可用、每个模型用哪套
线协议、以及推理等级设置如何映射到请求参数；后两者由 pi-ai 的线协议代码按模型实现，不在
这里。

- 没选推理等级时（界面显示 `Default`）不发 `reasoning_effort`。
- 选了等级时由 pi-ai 针对该供应商映射——有的用 `reasoning_effort` 字段，按预算计费思考的
  供应商用 `budget_tokens`，还有的用自适应思考。

额度查询是另外的免费 HTTP 调用，不增加 token。切换模型或供应商会改变请求前缀，所以 KV
缓存命中从零开始；同一模型内切换等级只改思考参数。

## 已知缺口

- **「当前模型不可路由」置灰。** 官方 `ui-model-selection` 会在当前模型无法路由时把
  composer 置灰；该条目禁用后，当前供应商没配好时输入框照样能用。
- **官方引导流程。** Models 页带的 DeepSeek 引导没有替代。
- **没有逐供应商的启用/禁用开关**——只有删除。
- 约二十条宿主端日志仍是中文（进程日志，不是浏览器 UI）。

尚未实现：侧边栏入口与全局额度徽章；会话内的实时用量与失败归因（额度是从端点轮询的，
回答的是"账号还剩多少"，不是"这次请求花了多少、为什么失败"）。

不在范围：需要浏览器会话的供应商（Claude、Codex、Gemini、Grok、Copilot 的 OAuth）；
fork 官方插件源码或采用 monorepo 布局。

## 已修 issue

| # | 问题 | 修法 |
|---|---|---|
| #1 | 缺逐模型编辑；添加供应商会抹掉手写配置 | 清单编辑器、逐字段写入、卡片级编辑 |
| #2 | 根因在 #8 一并修复 | — |
| #3 | 删除确认与 ✕ 同位置（双击即删） | 确认区移到卡片底部 |
| #4 | 插件目录 260 MB 而代码只有 220 KB | 现在完全没有下载副本 |
| #5 | 自定义模型永远没有「视觉」徽章 | 从路由声明的 `input` 取能力 |
| #6 | 删 `vendor/pi-ai` 后宿主起不来、诊断空白 | 只读策略 + 逐候选诊断 |
| #7 | `/model` 命令点不动 | 缺官方契约必填的 `available(session)` |
| #8 | 三档窗口头部只画一条分割线 | 按档位分组；「每月」不再显示成 7d |

## 源码结构

| 路径 | 用途 |
|---|---|
| `src/index.ts` | 宿主入口：装桥接、注册 HTTP 路由 |
| `src/bridge.ts` | 桥接装载：拷 bundle、用检查挑 pi-ai、管链接 |
| `src/pi-ai-source.ts` | pi-ai 完整性检查与恢复提示 |
| `src/patch-condition.ts` | 生成禁用那四个条目的 `!!js` 守卫 |
| `src/updater.ts` | 已停用的下载入口（保留为空操作以响应 `/provider/update`） |
| `src/routes.ts` | 路由发现、官网链接、显示名兜底 |
| `src/provider-presets.ts` | 添加供应商用的预设清单 |
| `src/model-details.ts` | 从生效的 pi-ai 包里读模型详情 |
| `src/pi-ai-names.ts` | 从 pi-ai registry 读显示名 |
| `src/credential-check.ts` | 两个供应商共用一把 key 时告警 |
| `src/adapters/*.ts` | 额度适配器（每供应商一个文件，另有注册表与 CLI 运行器） |
| `src/client/*.ts` | 浏览器端：`index` · `model-seat` · `settings` · `provider-edit` · `model-editor` · `command` · `data` · `format` · `i18n` · `styles` |
| `cordis.patch.yml` | patch 层：条件禁用、插入本插件、声明 DeepSeek 路由 |
| `test/*.mjs` | 12 个离线测试（不需要 dsh、不需要服务） |
| `scripts/*.sh` | worktree 工作流、测试实例、装依赖 |

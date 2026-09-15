# dsh-llm-provider

给 dsh 提供 LLM 服务的第三方插件。它在 dsh 官方模型栈的四个位置接管：pi-ai 适配器（`llm-pi-ai`）、DeepSeek 原生适配器（`llm-deepseek`）、模型选择器（`ui-model-selection`）、官方 Models 设置页（`ui-settings-models`），并补齐官方没有的额度查询与 Provider 管理界面。

四条能力：

1. **跟进上游 pi-ai**：把 dsh 打包时固定的 pi-ai 换成插件自己维护的版本，上游发了新模型不用等 dsh 发版。
2. **额度查询**：按 provider 查余额/用量窗口，数据同时给 Provider 卡片和模型选择器的余量指示。
3. **模型选择器**：按官方两级层级（模型 / 推理等级）实现，增强 provider 过滤、余量指示、能力徽章与模型详情卡。
4. **Provider 配置页**：添加/删除/测连通/单卡刷新余量，写的是官方同一套配置段与凭据服务。

## 目录

- [使用](#使用)：[安装](#安装) · [配置](#配置) · [测试实例](#测试实例) · [命令行跑测](#命令行跑测)
- [实现](#实现)：[桥接](#桥接pi-ai) · [三档候选](#三档候选) · [体检](#体检probe) · [模型选择器](#模型选择器) · [Provider 配置页](#provider-配置页) · [额度适配器](#额度适配器) · [路由发现](#路由发现) · [凭据体检](#凭据体检) · [HTTP 接口](#http-接口) · [构建](#构建)
- [边界](#边界)
- [模型视角](#模型视角)
- [已知限制与后续工作](#已知限制与后续工作)
- [源码布局](#源码布局)

## 使用

### 安装

插件以 link 的形式挂进 profile：

```sh
# 1. 装依赖（本仓库是 TypeScript 项目）
scripts/install-deps.sh
# 2. 构建（lib/ 是产物，不入库）
npm run build
# 3. profile 里链接：~/.dsh/profiles/<profile>/node_modules/dsh-llm-provider -> 本仓库路径
#    并在 profile 的 package.json dependencies 里写 "dsh-llm-provider": "link:<路径>"
dsh web     # 重启生效（插件树变了必须重启）
```

`vendor/` 是可选的兜底 pi-ai（`cd vendor && npm install`，package-lock 在库里）；不装也能跑，会落到 dsh 自带的那份 pi-ai。

### 配置

计费与路由都不需要额外配置：provider 从 settings.yaml 的 `llm-pi-ai.providers` 自动发现，key 走 dsh 的 credentials 服务按 `apiKeyEnv` 解析。

pi-ai 更新**只能手动触发**（Provider 设置页的「检查更新」→ `POST /provider/update`），且**验证通过才替换**：tarball 完整性（registry 的 `dist.integrity`）与兼容性体检两道都过才标记待重启，下次启动才切过去。没有环境变量开关。

### 测试实例

```sh
scripts/test-profile.sh        # 起 plan-test profile（3081 端口）并打开浏览器
scripts/test-profile.sh stop   # 停掉
```

测试实例用独立的 profile，可并行：`PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`。启动时带 `DSH_PROVIDER_TEST=1`，浏览器端据此给标题加「· 测试」后缀并盖 favicon 角标。profile 文件由脚本幂等生成，要改就改脚本。

### 命令行跑测

```sh
node lib/adapters/run.js all            # 跑全部额度适配器（key 从环境变量或 ~/.dsh/.credentials.yaml 找）
node lib/adapters/run.js kimi-coding --key sk-xx

npm test                                # 构建 + 七个离线测试（自测与合入用的就是这条）
npm run typecheck                       # tsc --noEmit（npm test 不含它）
```

七个测试各自盯一块：路由发现、凭据体检、patch 层、pi-ai 体检、供应商候选清单、vendor 状态合并语义、浏览器端接线冒烟。开发流程（主线不开发、全部走 worktree）见 `AGENTS.md`。

## 实现

### 桥接（pi-ai）

dsh 的模型目录来自打包时固定的 pi-ai。桥接让它跑在插件自己维护的版本上：

- 把 dsh 已装的 `dsh-llm-pi-ai` bundle 拷进 `vendor/llm-bridge/`，旁边放一个软链指向 `vendor/pi-ai/<版本>/`。Node 按 bare specifier 解析，拷贝副本就接到了新版 pi-ai。
- pi-ai 的模型目录与 wire 协议实现（`api/*.lazy`、`providers/all`）都是 lazy 导入，全部来自新版；dsh 那份 bundle 只承担稳定的转换胶水层。
- 官方 `llm-pi-ai` 行由 `cordis.patch.yml` 禁用，插件接管它的 settings 段、模型发现与目录。

用哪份 pi-ai 是**加载之前体检挑出来的**。升级生效需重启 dsh；回滚不需要改软链，删掉那份热更新版本即可，下次启动自动落回兜底档。

### 三档候选

`loadBridge()` 按优先级列候选，逐个体检，取第一个通过的：

| 档 | 目录 | 何时用到 |
|---|---|---|
| 热更新 | `vendor/pi-ai/<版本>/`（新 → 旧） | updater 下载并体检通过后 |
| 兜底依赖 | `vendor/node_modules/@earendil-works/pi-ai` | 热更新那份没下到或不合格 |
| dsh 自带 | `$DSH_HOME/profiles/node_modules/@earendil-works/pi-ai` | 裸克隆、兜底依赖还没装 |

`vendor/package.json` 锁死兜底依赖的版本，与热更新目录互不覆盖（热更新只往 `vendor/pi-ai/<新版本>/` 写）。放在 `vendor/` 有两个原因：桥接副本在 `vendor/llm-bridge/`，向上解析先撞到 `vendor/node_modules`，所以中选兜底档时不用挂软链；而插件根的 `node_modules/@deepseek-ai` 是条手工软链（桥接副本上的 dsh 包靠它解析），在根目录跑 `npm install` 会被 npm 当成待处理条目而失败。

### 体检（probe）

从桥接副本源码里抠出它对 pi-ai 的 import 需求（子路径 + 具名导出），照着生成一份探针文件，放进插件自己的临时目录、配一条指向候选的软链，再 require 它。解析规则与拷贝完全一致，但模块 URL 不同，所以一个候选失败不影响下一个，也不污染真正的拷贝。

需求解析覆盖具名导入/re-export、动态 `import()`、副作用与 namespace 导入、`export *`。**必须"先体检再加载"**：Node 对加载失败的 ESM 会留下半初始化记录，同一个文件再 require 只会报 `not yet fully loaded`，所以"先加载、失败了再退回"这条路走不通。

体检不过或没能执行体检（需求解析不出）的候选都列在 `/provider/status` 的 `bridge.rejected` / `probeUnverified` 里；updater 侧同样只在体检通过时才替换。

### 模型选择器

接管 composer 的 `conversation.input.model` 座位与 `/model` 命令（官方 `ui-model-selection` 行由 `cordis.patch.yml` 禁用）：

- 交互与官方一致：触发器胶囊（`供应商id/模型id` · 推理等级）→ 根面板「模型 / 推理等级」两行 → 模型面板 → 推理等级面板；选模型或档位成功后关菜单。
- 数据面与官方同路：目录走 `session/modelCatalog`，切换走 `session/selectModel`，余额走 `/plan/status`；优先用官方 `modelDirectories` 客户端服务（官方那行被重新启用时存在），缺席时用自己的 RPC + 会话投影 `modelSelection`。
- 取数口径：当前选择取 `会话投影 next ?? 目录 default`；默认档只认目录声明的 `defaultEffort`，没有就显示官方的 `Default` 文案。
- 增强：provider 过滤 chips（带余量指示点）、跨 provider 搜索（子串/缩写/编辑距离）、能力徽章、上下文标注、Cherry 式模型详情卡。
- 触发器上的余量指示与设置页卡片同源同值；放不下时的让位顺序是「档位与余量不收缩 → provider 先让位 → 模型名最后截」，再不够就按 composer 行宽降级（行 ≤760px 隐藏 provider 段，≤620px 余量只留指示点），宽度上限 `min(560px, 60cqw)`。全名始终在触发器 `title` 里。

### Provider 配置页

设置页新增 `Provider` 标签（官方 `ui-settings-models` 已禁用），二级标签为「服务商 / pi-ai 桥接」：

- 卡片按官方 PluginCard 蓝本：绿点 + 名称 + 官网链接，余量摘要一行（`5h: 84% ◷ 3h7m ｜ 7d: 30% ◷ 3d20h`），右侧刷新时间、单卡刷新、删除；展开体展示路由配置（路由 ID / 掩码密钥 / API 地址 / 协议 / 密钥存为）与该 provider 的模型列表（带过滤与详情卡）。
- 添加供应商：选预设 → 填密钥/端点 → 实连测试通过才能写入；写的是 `settings/mutate` 的 `llm-pi-ai.providers` 段与 `credentials/set`，与官方同一套存储。
- 删除：清路由 + 清凭据；内置原生路由不允许在这里删。
- pi-ai 桥接标签：当前版本与来源档位、被跳过的候选及原因、上游版本与「检查更新」。

### 额度适配器

一家一个文件（`src/adapters/`），`registry.ts` 注册一行，`shared.ts` 定契约；`node lib/adapters/run.js` 可单独跑测。全部只用各家 API key，免费 GET，不依赖浏览器登录态。

| 适配器 | 数据来源 |
|---|---|
| deepseek | `api.deepseek.com/user/balance` |
| kimi-coding | `api.kimi.com/coding/v1/usages` |
| glm | `open.bigmodel.cn/api/monitor/usage/quota/limit` |
| moonshot | `api.moonshot.cn/v1/users/me/balance` |
| minimax | MiniMax 余量接口 |
| opencode-go | OpenCode Go 订阅余量 |
| zenmux | OpenCode Zen 余量 |
| openrouter | OpenRouter 余额 |
| qwen | 无公开接口，只读说明文案 |

数值与展示口径对齐 CC Switch：它显示什么我们显示什么，不多加字段（Kimi 充值包余额不展示——口径与 CC Switch 不一致且数据存疑）。

### 路由发现

额度面板与预设清单列哪些 provider，由两处合并决定：

1. settings.yaml 的 `llm-pi-ai.providers`——用户配置的 pi-ai 路由；
2. `ctx.llm.listConfigurableProviders()` 里的原生适配器路由（`deepseek-official` 这类）：它们不写 settings 段也带默认 `apiKeyEnv`，而 seam 上查不到这个默认值，所以 `routes.ts` 用一张 `NATIVE_ROUTE_DEFAULTS` 表对上。

命名一律用 pi-ai 注册表的 `*Provider()` 工厂给的 name（`pi-ai-names.ts`，带缓存）；pi-ai 目录外只保留一个 Custom Gateway 入口。模型 ID 与路由 ID 在界面上一律显示原值，与 settings 里的键对得上。

### 凭据体检

宿主端 resolve 各家 key 时顺手比对，两个 provider 用同一把 key 就在界面上报警（dsh 本身不做这个检查，而配置 UI 拿不到 key 值，这类错误在别处只表现为「某个 provider 一直查询失败」）。只输出结论，key 值只在宿主进程内参与比对。

### HTTP 接口

| 路由 | 作用 |
|---|---|
| `GET /plan/status` | 各 provider 额度快照（60 秒缓存，`?refresh=1` 绕过） |
| `GET /provider/status` | 桥接状态、路由表、更新状态、测试环境标记 |
| `POST /provider/update` | 手动触发一次上游检查 + 更新 |
| `GET /provider/models` | pi-ai 模型全量元数据（60 秒缓存，详情卡与能力徽章用） |
| `GET /provider/presets` | 可添加的供应商预设清单（含已配置标记） |
| `POST /provider/refresh` | 单卡刷新余量（实查并更新全局快照） |
| `POST /provider/remove` | 删除 provider（清路由 + 清凭据） |
| `POST /provider/test` | 添加前实连测试 |

用自建路由而不是官方的 Typert Remote：那套生成器只认单体仓库布局（`<root>/packages/` 下的包、`@Remote` 的来源必须在已注册的包里），单包插件走不通。代价是没有类型安全的调用点，靠离线测试兜住。

### 构建

```sh
npm run build      # tsdown：宿主端 src/*.ts → lib/*.js（unbundle）；浏览器端 src/client/index.ts → lib/client.js（单文件 CJS + window.__ModuleLoader__ 外壳）
npm run watch      # 改代码自动重建
npm run typecheck  # tsc --noEmit
```

宿主端 1:1 转译，产物路径与 package.json 的 exports 对应；浏览器端把 `src/client/` 下的模块全部内联成一个文件，那三行加载器外壳由构建的 banner/footer/intro 加上，源码里不写。

插件是 profile 里 link 进来的，跑的就是 `lib/`——改完源码忘了构建，跑的还是旧代码。

装依赖走 `scripts/install-deps.sh` 而不是直接 `npm install`：`node_modules/@deepseek-ai` 是指向宿主 profile 的软链，npm 会顺链去 reify 里面两百个包并失败；脚本的做法是装前挪开、装完放回。

## 边界

- **不写宿主配置**：对 dsh 安装目录、settings.yaml、credentials 一律只读；写只发生在两处——插件自己的 `vendor/`（下载 pi-ai、放桥接副本），以及用户在界面上显式操作时（添加/删除 provider）。启动期不写任何宿主配置。
- **不改第三方包文件**：pi-ai 的文件一个字节都不改（它的模型数据是静态快照，落后于上游时也不打补丁——那样装下来的东西与 registry 的 integrity 对不上，不可复现）。
- **不改官方插件文件**：接管一律通过 `cordis.patch.yml` 禁用官方行（`llm-pi-ai`、`llm-deepseek`、`ui-model-selection`、`ui-settings-models`），官方其余行为保持原样；不是这些行的目标时用负 priority 遮蔽。patch 命不中 id 时 dsh 只警告并跳过，所以挂到不含这些行的 profile 上也安全。
- **key 值不出宿主进程**：浏览器端只拿结论与元信息（掩码提示前 3 + 后 4）。
- **不依赖浏览器登录态**：只支持 API key 类 provider。
- **webserver 无鉴权层**（dsh 的设计如此，默认只绑 loopback）：自建路由不做额外校验的前提是「仅本机可达」；把宿主暴露到 `0.0.0.0` 时 `/plan/status` 会泄露余额与凭据名。

## 模型视角

**请求内容**：插件不改 system prompt、工具 schema 或消息内容；它决定的是「哪些模型可用、走哪条 wire 协议」，以及推理档位怎样落到请求参数上。

- 档位不指定（界面显示 `Default`）时请求里不带 `reasoning_effort`；各家的 thinking 开关按 wire 协议各自决定——deepseek/zai/qwen 与 MiniMax 系在这一档发 `thinking: disabled` / `enable_thinking: false`（即不思考），kimi-coding（anthropic 协议）则整个字段都不发，由服务商默认。
- 指定档位时按各家映射发：deepseek 发 `thinking: enabled` + `reasoning_effort`，MiniMax/opencode-go 发 `thinking: enabled` + `budget_tokens`，kimi-coding 发自适应思考。

**Token 影响**：插件不向模型请求注入额外 token；额度查询走的是独立的免费 HTTP 端点。档位选择影响的是思考预算（部分 provider 由 `budget_tokens` 决定）。桥接换 pi-ai 版本会同时换掉模型目录与 usage 计费口径。

**KV cache**：切模型或切 provider 会改变请求前缀，缓存命中随之从零开始；同模型内切换档位只改 thinking 相关参数。插件不缓存、不改写会话内容。

## 已知限制与后续工作

随官方行禁用而退役、需要自己补的：

- **逐模型清单编辑**：官方 Models 页（`ui-settings-models`）的 `ModelListEditor` / `DeepSeekModelsEditor` / `CustomProviderCard` 一起退役，现在配置逐模型参数只能手改 settings.yaml 的 `llm-pi-ai.providers.<id>`。
- **「当前模型不可路由」置灰**：官方 `ui-model-selection` 会往 composer 推这个状态，禁用后当前 provider 被删掉时输入框不再自动置灰。
- **官方 onboarding**：官方 Models 页带的 DeepSeek 引导流程随之消失。

未实现的功能：

- 侧边栏入口与 `shell.overlay` 全局额度徽标。
- 会话内实时用量与失败归因（监听 `llm/stream`、`session/event` 的用量，`llm/retry` 的配额/限流失败码）。当前的额度数据是端点轮询，回答的是「账户还剩多少」而不是「这次用了多少、为什么失败」。

非目标：

- 需要浏览器登录态的 provider（Claude / Codex / Gemini / Grok / Copilot 的 OAuth）；Kimi 控制台接口需要网页登录态的 JWT，同样不接入。
- 不 fork 官方插件源码，也不背单体仓库布局（Typert Remote 因此用不了）。

## 源码布局

| 路径 | 作用 |
|---|---|
| `src/index.ts` | 宿主入口：挂桥接、注册 HTTP 路由 |
| `src/bridge.ts` | 桥接装载：拷 bundle、体检挑 pi-ai、管理软链 |
| `src/updater.ts` | 上游更新器：检查 registry、校验 tarball、装依赖、标待重启 |
| `src/routes.ts` | provider 路由发现 + 官网链接映射 + 显示名兜底 |
| `src/provider-presets.ts` | 添加 Provider 的候选清单（pi-ai 目录动态生成 + Custom Gateway） |
| `src/model-details.ts` | 模型详情：读生效 pi-ai 包的 providers 数据文件 |
| `src/pi-ai-names.ts` | pi-ai 注册表名字读取（显示名的唯一来源） |
| `src/credential-check.ts` | 凭据体检 |
| `src/adapters/*.ts` | 额度适配器（一家一个文件 + 注册表 + CLI 跑测器） |
| `src/client/*.ts` | 浏览器端：`index`（入口/座位注册）· `model-seat` · `settings` · `command` · `data` · `format` · `styles` · `i18n` · `icons` · `diag` · `types` |
| `cordis.patch.yml` | bundle patch 层：禁用官方行、插入本插件、声明 DeepSeek 路由 |
| `test/*.mjs` | 七个离线测试（不进 dsh、不起服务） |
| `scripts/*.sh` | worktree 开发流程、测试实例、装依赖 |

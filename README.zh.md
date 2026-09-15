# @dsh-one/dsh-llm-provider

**中文说明** · [English](https://github.com/imchangchang/dsh-llm-provider/blob/main/README.md)

给 [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）用的插件。它替换 dsh 插件树里的四个条目：pi-ai 适配器（`llm-pi-ai`）、DeepSeek 原生适配器（`llm-deepseek`）、模型选择器（`ui-model-selection`）、官方 Models 设置页（`ui-settings-models`），并在这之上加了额度查询与供应商管理。

四条能力：

1. **pi-ai 版本跟上游走**。dsh 在打包时固定它的 LLM SDK [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)，本插件跑自己维护的那份，上游出了新模型不用等 dsh 发版。
2. **额度查询**。按供应商查余额与用量窗口，数据同时给供应商卡片和模型选择器上的余量指示。
3. **模型选择器**。层级与官方一致（模型 / 推理等级），另加供应商过滤、余量指示、能力徽章和模型详情卡。
4. **供应商设置页**。添加、删除、测试、单卡刷新；写的是官方同一套设置段与凭据存储。

## 目录

- [使用](#使用)：[安装](#安装) · [第一次使用](#第一次使用) · [配置](#配置) · [测试实例](#测试实例) · [命令行跑测](#命令行跑测)
- [实现](#实现)：[pi-ai 桥接](#pi-ai-桥接) · [候选来源](#候选来源) · [兼容性检查](#兼容性检查) · [模型选择器](#模型选择器) · [供应商设置页](#供应商设置页) · [额度适配器](#额度适配器) · [路由发现](#路由发现) · [凭据检查](#凭据检查) · [HTTP 接口](#http-接口) · [构建](#构建)
- [边界](#边界)
- [对模型请求的影响](#对模型请求的影响)
- [已知缺口](#已知缺口)
- [源码布局](#源码布局)

## 使用

### 安装

从 npm 装：

```sh
dsh plugin --profile web add @dsh-one/dsh-llm-provider
dsh web     # 插件树变了，必须重启
```

包名后加 `@<版本>` 就是装指定版本。

改本仓库代码时，把 checkout 链接进 profile：

```sh
scripts/install-deps.sh   # 装开发依赖
npm run build             # lib/ 是构建产物，不入库
# 链接 ~/.dsh/profiles/<profile>/node_modules/@dsh-one/dsh-llm-provider -> 本仓库路径
# 并在 profile 的 package.json dependencies 里写 "@dsh-one/dsh-llm-provider": "link:<路径>"
cd vendor && npm install  # 可选：在 checkout 里固定一份 pi-ai
dsh web                   # 插件树变了，必须重启
```

发布出去的包里没有 `vendor/` 和它的 lockfile，那份固定 pi-ai 只在 checkout 里有。装不装都行：没安装的来源会被跳过，落到 dsh 自带那份 pi-ai。目录不在意味着「没装」，不是「不兼容」，界面上不会出现「跳过 X：兼容性检查没通过」这种提示。

### 第一次使用

插件在自己 config 里声明了一条 DeepSeek 路由（`llm-pi-ai.providers.deepseek`，凭据名 `DEEPSEEK_API_KEY`），因为内置的 `llm-deepseek` 条目被禁用了。所以刚装完就有一张没配密钥的 DeepSeek 卡片：

- 在 设置 →「模型服务」→「服务商」里展开这张卡片。没存过凭据时「API 密钥」那行就是输入框，保存后立刻实查一次额度。
- 加别的供应商：「＋ 添加供应商」→ 选预设 → 填密钥与端点 → 测试通过后保存。
- 之后卡片上就有余额，模型选择器的触发器上是同一个快照。

密钥存在 dsh 自己的凭据服务里，键名是路由的 `apiKeyEnv`，与官方那套读的是同一份，插件不需要自己的配置文件。

### 配置

供应商从 `settings.yaml` 的 `llm-pi-ai.providers` 发现。这一节里没有路由时额度面板是空的——按上面那步在设置页加一条。key 由 dsh 的凭据服务按每条路由的 `apiKeyEnv` 解析。

pi-ai 更新有两个触发路径：插件启动时后台查一次（6 小时节流，`DSH_PROVIDER_UPDATE=off` 可关），以及设置页上的「检查更新」按钮（`POST /provider/update`）。

两条路径都一样，**两道检查都过才会替换**：tarball 完整性（registry 的 `dist.integrity`）和兼容性检查。过了才标记为待重启，已经在跑的版本不会重复下载。pi-ai 换了版本要重启 dsh 才生效——桥接在进程启动时装载。

### 测试实例

```sh
scripts/test-profile.sh        # 起 plan-test profile（3081 端口）并打开浏览器
scripts/test-profile.sh stop   # 停掉
```

测试实例用独立 profile，可以并行：`PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`。启动时带 `DSH_PROVIDER_TEST=1`，浏览器端据此在标题后加 ` · 测试`、给 favicon 盖「测」字角标。脚本生成的 profile 还会 link 本机另一条插件 `dsh-sidekick`（`$DSH_HOME/workspaces/dsh-mobile/plugin`）；机器上没有这份 checkout 时，先改脚本里那两行。

### 命令行跑测

```sh
node lib/adapters/run.js all            # 跑全部额度适配器（key 从环境变量或 ~/.dsh/.credentials.yaml 找）
node lib/adapters/run.js kimi-coding --key sk-xx

npm test                                # 构建 + 七个离线测试；自测与合入跑的就是这条
npm run typecheck                       # tsc --noEmit（npm test 不含它）
```

七个测试分别盯：路由发现、凭据检查、patch 层、pi-ai 兼容性检查、供应商预设清单、vendor 状态合并、浏览器端接线。开发流程（主线不写代码、全部走 worktree）见 `AGENTS.md`。

## 实现

### pi-ai 桥接

dsh 的模型目录来自它打包时那份 pi-ai。桥接让它跑在插件自己维护的版本上：

- 把已装的 `dsh-llm-pi-ai` bundle 拷到 `vendor/llm-bridge/`，旁边放一条软链指向 `vendor/pi-ai/<版本>/`。Node 按 bare specifier 从这里解析，拷贝副本就接到了新版 pi-ai。
- pi-ai 的模型目录与 wire 协议实现（`api/*.lazy`、`providers/all`）都是懒加载，全部来自新版；dsh 那份 bundle 只提供稳定的转换层。
- 官方 `llm-pi-ai` 条目（插件树里的一行）由 `cordis.patch.yml` 禁用，插件接管它的设置段、模型发现与目录。

用哪份 pi-ai 在**加载之前由[兼容性检查](#兼容性检查)决定**。回滚不用改软链：删掉下载的那份，下次启动自动落到下一个来源。

### 候选来源

`loadBridge()` 按优先级列出候选，逐个检查，取第一个通过的：

| 来源 | 目录 | 何时用到 |
|---|---|---|
| 已下载 | `vendor/pi-ai/<版本>/`（新的在前） | updater 下好并通过检查之后 |
| 兜底依赖（界面上的叫法） | `vendor/node_modules/@earendil-works/pi-ai` | 可选，装了就用（`cd vendor && npm install`） |
| dsh 自带 | 沿官方 bundle 的 `node_modules` 链找到的那份（不写死路径） | 前两个都没装，或检查不通过 |

没安装的来源直接跳过。只有**存在但检查不通过**时才列进「被跳过」并给出原因。dsh 自带那份的版本随 dsh 发布走，不一定比上游旧。

后两个来源的目录都不写死。官方 bundle 按这个顺序沿解析链找：profile 的 `node_modules`、dsh 安装树（含嵌在 dsh 包里的 `node_modules`）、最后是本插件。pi-ai 从找到的那份 bundle 位置继续沿解析链找。所以 dsh 换布局（bundle 放进自己的安装目录、依赖提升到别处）不会让某个来源凭空消失。

`vendor/package.json` 锁住兜底依赖的版本，与下载目录互不覆盖：更新只往 `vendor/pi-ai/<新版本>/` 写。两个都放在 `vendor/` 下，是因为桥接副本在 `vendor/llm-bridge/`，向上解析先撞到 `vendor/node_modules`，选中这一来源时不用挂软链。

### 兼容性检查

从桥接副本源码里抠出它对 pi-ai 的 import 需求（子路径 + 具名导出），照着生成一份探针文件，放进插件自己的临时目录、配一条指向候选的软链，再 require 它。解析规则与拷贝完全一致，但模块 URL 不同，所以一个候选失败不影响下一个，也不污染真正的拷贝。

需求解析覆盖具名导入与 re-export、动态 `import()`、副作用与 namespace 导入、`export *`。**必须先检查再加载**：Node 对加载失败的 ESM 会留下半初始化记录，同一个文件再 require 只会报 `not yet fully loaded`，所以「先加载、失败再退回」这条路走不通。

检查不通过的候选列在 `/provider/status` 的 `bridge.rejected` 里。需求压根解析不出来时检查跑不了，被选中的那份按「目录存在」放行，此时报 `probeUnverified: true`。updater 侧一样，只有检查通过才替换。

### 模型选择器

接管输入框（composer）上的 `conversation.input.model` 座位（插件挂载点）与 `/model` 命令（官方 `ui-model-selection` 条目由 `cordis.patch.yml` 禁用）：

- 交互与官方一致：触发器胶囊（`<供应商id>/<模型id>` · 推理等级）→ 根面板「模型 / 推理等级」两行 → 模型面板 → 推理等级面板。选了模型或等级就关菜单。
- 取数与官方同路：目录走 `session/modelCatalog`，切换走 `session/selectModel`，余量走 `/plan/status`；官方 `modelDirectories` 客户端服务在就用它，不在就用自己的 RPC。
- 当前选择优先取会话里记着的那次，没有就用目录默认。默认等级只认目录声明的 `defaultEffort`，目录没声明就显示官方的 `Default` 文案。
- 额外做的：供应商过滤 chips（带余量指示点）、跨供应商搜索（子串/缩写/编辑距离）、能力徽章、上下文标注、模型详情卡。
- 触发器上的余量指示与供应商卡片读同一个快照，显示最紧的那个窗口的百分比；卡片上每个窗口分别列。
- 空间不够时先隐藏供应商段，最后才截断模型名；推理等级和余量不收缩。composer 行宽 ≤760px 时隐藏供应商段，≤620px 时余量只留指示点。胶囊宽度上限 `min(560px, 60cqw)`，全名始终挂在 `title` 上。

### 供应商设置页

设置页新增「模型服务」标签（官方 `ui-settings-models` 条目已禁用），两个二级标签：「服务商」、「pi-ai 桥接」。

- 卡片照官方 PluginCard：状态点 + 名称 + 官网链接，一行余量摘要（`5h: 84% ◷ 3h7m ｜ 7d: 30% ◷ 3d20h`），右侧是刷新时间、单卡刷新、删除。展开体展示路由配置（路由 ID、掩码密钥、API 地址、协议、凭据名）和该供应商的模型列表（带过滤与详情卡）。
- 添加供应商：选预设 → 填密钥与端点 → 实连测试通过才能写入。写的是 `settings/mutate` 的 `llm-pi-ai.providers` 段与 `credentials/set`，与官方同一套存储。
- 补密钥：路由在、凭据没值时，卡片展开体里那一行就是输入框（官方 Models 页已禁用，这是唯一入口）。存完立刻实查一次额度。这种供应商在添加列表里标「缺密钥」而不是「已配置」，不会被禁选堵住。
- 删除：清路由 + 清凭据。内置原生路由不允许在这里删。
- 「pi-ai 桥接」标签：当前版本与来源、被跳过的候选及原因、上游版本与检查更新按钮。

### 额度适配器

一家一个文件（`src/adapters/`），`registry.ts` 注册一行，契约在 `shared.ts`；`node lib/adapters/run.js` 可单独跑。除 qwen 外都用各家的 API key 走免费 GET，都不依赖浏览器登录态。

| 适配器 | 数据来源 |
|---|---|
| deepseek | `api.deepseek.com/user/balance` |
| kimi-coding | `api.kimi.com/coding/v1/usages` |
| moonshot | `api.moonshot.cn/v1/users/me/balance`（按配置的 baseURL 走 `.cn` 或 `.ai`） |
| glm | `open.bigmodel.cn/api/monitor/usage/quota/limit` |
| minimax | `api.minimaxi.com/v1/api/openplatform/coding_plan/remains`（国际站是 `.io`） |
| opencode-go | `opencode.ai/zen/go/v1/usage` |
| zenmux | 配置的 `baseURL` 本身（响应里是 `quota_5_hour` / `quota_7_day`） |
| openrouter | `openrouter.ai/api/v1/credits` |
| qwen | 无公开接口：不发请求，卡片给「看控制台」跳转链接 |

数值与展示口径对齐 CC Switch（[farion1231/cc-switch](https://github.com/farion1231/cc-switch)，给编码 CLI 切换供应商配置的桌面工具）：它显示哪些字段就显示哪些，不额外加工。套餐等级字段在下发到浏览器前丢弃；Kimi 充值包余额不显示，因为数值与 CC Switch 不一致，看着也不可靠。

### 路由发现

额度面板和预设清单列哪些供应商，由两处合并决定：

1. `settings.yaml` 的 `llm-pi-ai.providers`——用户配置的 pi-ai 路由。
2. `ctx.llm.listConfigurableProviders()` 里的原生适配器路由（`deepseek-official` 这类）：它们不写设置段也带默认 `apiKeyEnv`，而这个默认值在服务上读不到，所以 `routes.ts` 用一张 `NATIVE_ROUTE_DEFAULTS` 表对上。

显示名优先用路由自己的 `displayName`，没有就取 pi-ai 注册表里 `*Provider()` 工厂给的名字（`pi-ai-names.ts`，带缓存），再没有就按 id 拼一个。pi-ai 目录外只保留一个入口：Custom Gateway。模型 ID 与路由 ID 一律显示原值，与设置里的键对得上。

### 凭据检查

宿主在解析各家 key 时顺手比对，两个供应商用同一把 key 就在界面上报警。dsh 自己不做这个检查，而配置界面拿不到 key 值，所以这个错误在别处只表现为「某个供应商一直查询失败」。key 只在宿主进程内参与比对，不出进程。

### HTTP 接口

| 路由 | 作用 |
|---|---|
| `GET /plan/status` | 各供应商额度快照（60 秒缓存，`?refresh=1` 绕过） |
| `GET /provider/status` | 桥接状态、路由表、更新状态、测试实例标记 |
| `POST /provider/update` | 手动触发一次上游检查与更新 |
| `GET /provider/models` | pi-ai 模型全量元数据（60 秒缓存；详情卡与能力徽章用） |
| `GET /provider/presets` | 可添加的供应商预设清单（含已配置标记） |
| `POST /provider/refresh` | 单卡刷新额度（实查并更新全局快照） |
| `POST /provider/remove` | 删除供应商（清路由 + 清凭据） |
| `POST /provider/test` | 用已存的 key 查一次某家的额度（只读，不动全局快照） |

添加供应商的表单不调 `/provider/test`，走的是官方 `llm/discoverModels` 的草稿探测。

这些是自建路由，不是官方的 Typert Remote：那套生成器只认单体仓库布局（`<root>/packages/` 下的包、`@Remote` 的来源必须在已注册的包里），单包插件走不通。代价是没有类型安全的调用点，靠离线测试兜住。

### 构建

```sh
npm run build      # tsdown：宿主端 src/*.ts -> lib/*.js（unbundle）；浏览器端 src/client/index.ts -> lib/client.js（单文件 CJS + window.__ModuleLoader__ 外壳）
npm run watch      # 改代码自动重建
npm run typecheck  # tsc --noEmit
```

宿主端 1:1 转译，产物路径与 package.json 的 exports 对应。浏览器端把 `src/client/` 下的模块内联成一个文件，那三行加载器外壳由构建的 banner/footer/intro 加上，源码里不写。

插件跑的就是 `lib/`——改了源码没构建，跑的还是旧代码。

装依赖走 `scripts/install-deps.sh`，不要直接 `npm install`：`node_modules/@deepseek-ai` 是指向宿主 profile 的软链，npm 会顺链去 reify 里面两百个包并失败。脚本的做法是装前挪开、装完放回。

## 边界

- **不写宿主配置**。dsh 安装目录、`settings.yaml`、凭据一律只读。写只发生在两处：插件自己的 `vendor/`（下载 pi-ai、放桥接副本、写状态文件，其中一部分在加载期就写），以及用户在界面上的显式操作（添加/删除供应商）。启动期不写任何宿主配置。
- **不改第三方包文件**。pi-ai 一个字节都不改，哪怕它的模型数据是静态快照、落后于上游——打补丁会让装下来的东西与 registry 的完整性校验对不上，不可复现。
- **不改官方插件文件**。接管一律通过在 `cordis.patch.yml` 里禁用官方条目（`llm-pi-ai`、`llm-deepseek`、`ui-model-selection`、`ui-settings-models`），官方其余行为保持原样。本插件自己的模型座位带 `priority: -10`，那是同一座位上遮蔽占用者的机制。
- **key 值不出宿主进程**。浏览器端只拿结论与元信息（前 3 + 后 4 的掩码）。
- **不依赖浏览器登录态**。只支持 API key 类供应商。
- **webserver 没有鉴权层**（dsh 的设计如此，默认只绑 loopback）。自建路由不做额外校验的前提是「仅本机可达」：把宿主暴露到 `0.0.0.0`，`/plan/status` 会泄露余额与凭据名。

## 对模型请求的影响

插件不改 system prompt、工具 schema 和消息内容。它决定哪些模型可用、各自走哪条 wire 协议，以及推理等级怎么落到请求参数上；后两件由 pi-ai 按模型实现，不在这里。

- 没选等级时（界面显示 `Default`）请求里不带 `reasoning_effort`。是否发 thinking 开关、发什么值，看 pi-ai 对这个模型的实现。
- 选了等级就由 pi-ai 按该供应商映射：有的发 `reasoning_effort` 字段，有的发 `budget_tokens`（按思考预算计费的那类），有的发自适应思考。

额度查询是独立的免费 HTTP 请求，不给模型请求加 token。换 pi-ai 版本会同时换掉模型目录与用量口径。切模型或切供应商会改变请求前缀，KV cache 命中随之从零开始；同模型内切等级只改 thinking 相关参数。插件不改写会话内容，自己的缓存只有上面列的 60 秒额度与模型元数据快照。

## 已知缺口

官方那些条目有、本插件没有的：

- **逐模型清单编辑**。`ModelListEditor` / `DeepSeekModelsEditor` / `CustomProviderCard` 没有替代：改逐模型参数只能手改 `settings.yaml` 的 `llm-pi-ai.providers.<id>`。
- **「当前模型不可路由」置灰**。官方 `ui-model-selection` 会在当前模型无法路由时把 composer 置灰；该条目被禁用后，当前供应商没配好时输入框照样能用。
- **官方引导流程**。Models 页带的 DeepSeek 引导没有替代。

以后可能补的：

- 侧边栏入口与 `shell.overlay` 全局额度徽标。
- 会话内的实时用量与失败归因（读 `llm/stream`、`session/event` 的用量，`llm/retry` 的配额/限流失败码）。额度数据来自轮询端点，回答的是「账户还剩多少」，不是「这次花了多少、为什么失败」。

不做的：

- 需要浏览器登录态的供应商（Claude / Codex / Gemini / Grok / Copilot 的 OAuth）。Kimi 控制台接口要网页登录态的 JWT，同样不接。
- 不 fork 官方插件源码，也不背单体仓库布局（Typert Remote 因此用不了）。

## 源码布局

| 路径 | 作用 |
|---|---|
| `src/index.ts` | 宿主入口：挂桥接、注册 HTTP 路由 |
| `src/bridge.ts` | 桥接装载：拷 bundle、按检查挑 pi-ai、管理软链 |
| `src/updater.ts` | 上游更新器：查 registry、校验 tarball、装依赖、标待重启 |
| `src/routes.ts` | 路由发现、官网链接、显示名兜底 |
| `src/provider-presets.ts` | 添加供应商的预设清单（pi-ai 目录动态生成 + Custom Gateway） |
| `src/model-details.ts` | 模型详情：读生效 pi-ai 包的 providers 数据文件 |
| `src/pi-ai-names.ts` | 读 pi-ai 注册表里的名字（显示名的来源之一） |
| `src/credential-check.ts` | 凭据检查 |
| `src/adapters/*.ts` | 额度适配器（一家一个文件 + 注册表 + CLI 跑测器） |
| `src/client/*.ts` | 浏览器端：`index`（入口/座位注册）· `model-seat` · `settings` · `command` · `data` · `format` · `styles` · `i18n` · `icons` · `diag` · `types` |
| `cordis.patch.yml` | bundle patch 层：禁用官方条目、插入本插件、声明 DeepSeek 路由 |
| `test/*.mjs` | 七个离线测试（不进 dsh、不起服务） |
| `scripts/*.sh` | worktree 开发流程、测试实例、装依赖 |

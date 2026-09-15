# dsh-provider

给 dsh 提供 LLM 服务的插件（由 dsh-plan 改造而来），三件事：

1. **pi-ai 自动跟进**：盯着 `@earendil-works/pi-ai` 的 npm registry，上游发了新版本就自动下载、装依赖、切换桥接——新模型不用等 dsh 发版。
2. **计费接口**：为各 provider 查额度/余额（对齐 CC Switch 的口径），Provider 卡片和模型选择器里的余量指示都走这份数据。
3. **模型选择器和设置页 Provider 标签**：选择器按官方 ui-model-selection 的两级层级（模型/推理等级）重写并增强 provider 过滤、余量指示；设置页新增 Provider 标签管理路由（添加/删除/测试连通/单卡刷新余量）。

**命名原则：一律用 pi-ai 注册表的名字**（`lib/pi-ai-names.js` 调 pi-ai 自己的 `*Provider()` 工厂拿 name），
我们不另起显示名；pi-ai 目录外只保留一个 Custom Gateway 入口（协议可选 OpenAI / Anthropic）。
例外是模型选择器：那里一律显示 id（触发器 `供应商id/模型id`、chips 和分组标题用供应商 id、模型行用
模型 id），这样选择器内部各处统一，也和配置里的路由 ID/模型 ID 对得上；搜索仍同时匹配 id 和显示名。

## 界面接管了什么

| 位置 | 做法 |
|---|---|
| composer 模型座位 `conversation.input.model` | 用 **priority 遮蔽**接管：座位是 `single`，官方 `ui-model-selection` 用默认 priority 0 占着，我们注册 `priority: -10`（最小者渲染）。官方插件行保持启用 |
| `/model` 命令 | 官方还在时静默让位（`commandUi` 同名即抛，没有遮蔽）；只有把 `ui-model-selection` 行 patch 禁用后才由我们接管（带余量渲染） |
| 设置页 Provider 标签 | 新增一个 `settings.section` 贡献（list 座位，**不影响**官方 Models 标签） |

座位数据有两条来源，按序兜底：首选官方客户端服务 `ctx.modelDirectories`（目录、当前选择、切换提交
都在它手里）；它缺席时（plan-test 禁用官方插件）退回同源 HTTP（`session/modelCatalog` RPC）+
会话投影（`modelSelection`）+ `session/selectModel` RPC。inject 面必须把 `sessionId` 和 `sessions`
都传给座位组件——座位靠它们读投影回显当前模型（**坑**：inject 工厂虽然收到 sessionId，不放进
返回的 props 组件就拿不到；官方座位不需要，因为它绑在目录服务上）。**注意模块级 `inject` 要一并
声明 `remote`、`remote.session`**：官方目录服务的方法绑定到调用方上下文，少声明就会在
`directoryFor()` 里报 `cannot get property "remote.session" without inject`（踩过）。

三条注册路径的规则不同，接管方式也只好不同：

| 注册面 | 重复时 | 能否替换 |
|---|---|---|
| slot 座位（single/keyed/list） | 同 `priority` 才冲突，不同 priority 是遮蔽，最小者渲染 | ✅ 设计内的 replacement point |
| `commandUi.register` | 同名抛 `duplicate contribution` | ❌ 只能禁用官方行 |
| `ctx.llm.registerAdapter`（桥接要接手的 provider 路由） | 同名抛 `DUPLICATE_ADAPTER` | ❌ 只能禁用官方行 |

选择器的数据面不动：模型目录走 `session/modelCatalog`、切换走 `session/selectModel`（官方同一条路），
余额走 `/plan/status`。provider 过滤和余额映射靠 route id 对齐（settings 的 provider key = 配额账户 id）。

## 原理：桥接层

dsh 的模型目录来自打包时固定的旧版 pi-ai（实测装的是 0.84.4，上游 0.85.1 一次差 70 个模型）。
本插件的做法：

- 把 dsh 已装的 `dsh-llm-pi-ai` bundle 拷进 `vendor/llm-bridge/`，旁边放一个软链指向
  `vendor/pi-ai/<版本>/`（updater 维护）。Node 按 bare specifier 解析，拷贝副本就接到了新版 pi-ai。
- pi-ai 的模型目录和 wire 协议实现（`api/*.lazy`）都是 lazy 导入，全部来自新版；
  dsh 的 bundle 只承担稳定的转换胶水层。
- 内置的 llm-pi-ai 行由 `cordis.patch.yml` 禁用（provider 路由注册没有遮蔽机制，同名直接抛
  `DUPLICATE_ADAPTER`），本插件完全接管：
  settings.yaml 的 `llm-pi-ai.providers` 段、Web Models 设置页、模型选择器行为都不变。
- 用哪一份 pi-ai 是**加载之前体检挑出来的**，不是"先试再退"（Node 对加载失败的 ESM
  会留下半初始化记录，同一个文件没法重试，见下面「选 pi-ai」一节）。
- 升级生效时机：换软链后需重启 dsh（`GET /provider/status` 的 `needsRestart` 会提示）。
  回滚不用手改软链——把那份热更新版本删掉即可，下次启动自动落回内置依赖。

已验证（2026-09-12）：自动下载 0.85.1 → 桥接加载 → 新目录生效（gpt-6-astra 等 70 个新模型可见）。

## 选 pi-ai：三档候选

启动时 `loadBridge()` 按优先级列候选，**逐个体检**，挑第一个通过的：

| 档 | 目录 | 何时用到 |
|---|---|---|
| `vendor/pi-ai/<版本>/` | 插件自己的 vendor（updater 下的） | 有新版本时，新 → 旧逐个试 |
| 兜底依赖 | `vendor/node_modules/@earendil-works/pi-ai` | 热更新没下到 / 下了但不合格 |
| dsh 自带 | `$DSH_HOME/profiles/node_modules/@earendil-works/pi-ai` | 裸克隆、兜底依赖还没装 |

`vendor/package.json` 里**锁死 `@earendil-works/pi-ai` 的版本**，装在 `vendor/node_modules/`，
那一份就是"验证过的兜底"。它和热更新目录互不覆盖：热更新只往 `vendor/pi-ai/<新版本>/` 写。

放在 `vendor/` 而不是插件根目录，有两个原因：

- **解析路径**：桥接副本在 `vendor/llm-bridge/`，往上找 `node_modules` 先撞到 `vendor/node_modules`，
  再才是插件根的。所以中选这一档不用挂软链，"回退"只有一个动作。
- **根目录跑不了 `npm install`**：插件根的 `node_modules/@deepseek-ai` 是条手工软链（桥接副本上的
  dsh 包靠它解析），npm 会把它当待处理的条目，实测直接 EPERM。

装法：`cd vendor && npm install`。`package.json` 和 `package-lock.json` 都在库里，可复现；
`vendor/node_modules/` 不入库。worktree 里不装也没关系，会落到"dsh 自带"那一档。

### 体检（`probePiAi`）

从桥接副本源码抠出它对 pi-ai 的 import（5 个子路径、10 个具名导出），照着生成一份探针
文件，放进自己的临时目录、配一条指向候选的软链，再 require 它。解析规则与拷贝完全一致，
但模块 URL 不同——所以一个候选失败不影响下一个，也不会污染真正的拷贝。

**为什么不能"先加载，失败了再退回"**：实测 Node 对加载失败的 ESM 会留下半初始化记录，
同一个文件再 require 只报 `Cannot require() ES Module ... because it is not yet fully loaded`。
所以判断必须在加载之前做，这也是整个设计的前提。

体检不过的候选会被列出来（`/provider/status` 的 `bridge.rejected`），不会切过去。

### 回退怎么发生

- 中选的是内置依赖档时**不挂软链**：删掉它，那份拷贝自然往上找到 `node_modules`。
  这就是"回退"，不用另外指一条链。
- 热更新版本坏了 → 体检拦住 → 软链压根没指过去 → 跑的还是内置依赖那份 → 不会出现
  "重启一次就起不来、还得手动删目录"。

一次体检约 75ms，正常启动只体检一档。

## 构建

**源码是 TypeScript，在 `src/`；`lib/` 是构建产物，不入库。**

```sh
scripts/install-deps.sh   # 一次：装 typescript / tsdown / @types/node（见下）
npm run build      # = tsdown，src/*.ts → lib/*.js
npm run watch      # 改代码自动重建
npm run typecheck  # = tsc --noEmit（构建不查类型，要单独跑）
```

两段构建，都在 `tsdown.config.ts` 里：

| 产物 | 来源 | 说明 |
|---|---|---|
| `lib/*.js`、`lib/adapters/*.js` | `src/*.ts` | 宿主端。1:1 转译（`unbundle`），不打包，产物路径跟迁移前完全一样 |
| `lib/client.js` | `src/client.ts` | 浏览器端。单文件 CJS + `window.__ModuleLoader__.load({...})` 外壳——**那三行外壳由构建的 `banner`/`footer`/`intro` 加上**，源码里不写（跟官方插件同一套做法，见官方的 `packages/client/tsdown.client.ts`） |

插件是 profile 里 `link:` 进来的，跑的就是 `lib/`——**改完源码忘了构建，跑的还是旧代码**。

装依赖走 `scripts/install-deps.sh` 而不是直接 `npm install`：仓库的 `node_modules/@deepseek-ai`
是一条手工软链（指向 `$DSH_HOME/profiles/node_modules/@deepseek-ai`），插件运行时靠它解析宿主
提供的包；npm 会顺着这条链去 reify 里面两百个包，直接 EPERM。脚本的做法是装之前挪开、装完放回去。

## 装法

```sh
# profile 里以 dsh-provider 名字链接（已完成）：
#   ~/.dsh/profiles/web/node_modules/dsh-provider -> /Users/cgeng/Workspaces/dsh-plan
npm run build               # 先构建出 lib/
dsh web                     # 重启生效（插件树变了必须重启）
```

## 测试环境（plan-test profile）

`scripts/test-profile.sh` 一键起测试实例：幂等生成 `~/.dsh/profiles/plan-test/`（与官方 web 同
bundle 组，但额外禁用官方 `ui-model-selection`——模型座位由本插件独立接管，即「补位」形态）、
固定端口 3081（正常实例不受影响）、自动抓启动令牌并打开浏览器。

```sh
scripts/test-profile.sh        # 启动（已在跑会先重启）并打开测试前端
scripts/test-profile.sh stop   # 停掉测试实例
```

profile 文件由脚本生成，要改测试配置改脚本里的 `ensure_profile()`。

## 计费适配器（解耦设计）

每个 provider 一个独立文件，互不依赖，契约统一。当前 9 家：

| 文件 | 数据源 |
|---|---|
| `src/adapters/deepseek.ts` | `GET api.deepseek.com/user/balance`（官方文档） |
| `src/adapters/kimi-coding.ts` | `GET api.kimi.com/coding/v1/usages`（sk- key） |
| `src/adapters/glm.ts` | `GET open.bigmodel.cn/api/monitor/usage/quota/limit` |
| `src/adapters/moonshot.ts` | `GET api.moonshot.cn/v1/users/me/balance` |
| `src/adapters/minimax.ts` | MiniMax 余量接口 |
| `src/adapters/opencode-go.ts` | OpenCode Go 订阅余量 |
| `src/adapters/zenmux.ts` | OpenCode Zen 余量 |
| `src/adapters/openrouter.ts` | OpenRouter 余额 |
| `src/adapters/qwen.ts` | 无公开接口，只读说明 |

全部只用各家的 API key，不依赖任何浏览器登录态/token。
加新 provider = 照 `deepseek.js` 写一个文件 + 在 `registry.js` 注册一行。
数值口径以 CC Switch 为准，不展示多余字段（Kimi 充值包余量已按用户要求移除——数据不准）。

### 路由发现（`lib/routes.js`）

额度面板列哪些 provider，由两处合并决定：

1. `settings.yaml` 的 `llm-pi-ai.providers`——用户实际配置的 pi-ai 路由（catalog 里那些没配置的
   provider 虽然也在 llm 目录里，但不该进面板）；
2. `ctx.llm.listConfigurableProviders()` 里的原生适配器路由（`deepseek-official` 这类）：
   它们不写 settings 段也带默认 `apiKeyEnv`，而这个默认值在 seam 上查不到，所以 `routes.js`
   里用一张 `NATIVE_ROUTE_DEFAULTS` 表对上。

### 凭据体检（`lib/credential-check.js`）

宿主端 resolve 各家 key 时顺手比对，发现两个 provider 用的是同一把 key 就在界面上报警。
dsh 本身不做这个检查，而配置 UI 又永远拿不到 key 值（`describe` 只返回 configured/source/writable），
所以这类错误在官方界面上的表现只是「某个 provider 一直查询失败」，看不出原因——实测就是
`KIMI_CODING_API_KEY` 被填成了 `DEEPSEEK_API_KEY` 的同一个值。现在会直接说：

```
kimi-coding  查询失败
  ⚠ 这个 provider 用的 key 和 deepseek-official 完全相同（凭据名 KIMI_CODING_API_KEY），几乎可以肯定填错了
```

只输出结论，key 值只在宿主进程内参与比对、不下发浏览器。

### 命令行跑测（不起 dsh）

```sh
node lib/adapters/run.js all            # 全部（key 自动从环境变量或 ~/.dsh/.credentials.yaml 找）
node lib/adapters/run.js glm            # 只跑一家
node lib/adapters/run.js kimi-coding --key sk-xx

node test/routes.mjs                    # 路由发现的单元测试
node test/credential-check.mjs          # 凭据体检的单元测试
node test/cordis-patch.mjs              # patch 层：禁用 llm-deepseek 就必须自己声明路由
node test/pi-ai-probe.mjs               # pi-ai 体检：需求解析 + 挡住不兼容的候选
node test/provider-presets.mjs          # 候选清单的顺序与标记
node test/vendor-status.mjs             # vendor/status.json 的合并语义（undefined = 删键）
node test/client-smoke.mjs              # 浏览器端接线冒烟 + pi-ai 桥接明细的出词

npm test                                # 上面七条一起跑（自测/合入用的就是这条）
```

开发流程（主线不开发、全部走 worktree）见 `AGENTS.md`，脚本是 `scripts/dev-start.sh` /
`dev-finish.sh` / `dev-merge.sh`。

### Kimi 控制台接口（仅调研记录，未接入）

控制台的接口能给更可靠的 remaining/窗口占比，但鉴权要网页登录态的 JWT（不吃 sk- key）。
按"不依赖浏览器 token"的原则，插件**不接入**它；逆向结论留在
`reference/kimi-console-api.md` 备查。

## HTTP 接口

| 路由 | 作用 |
|---|---|
| `GET /plan/status` | 各 provider 额度快照（60 秒缓存，`?refresh=1` 绕过） |
| `GET /provider/status` | 桥接状态：当前 pi-ai 版本、上游最新版、是否需要重启 |
| `POST /provider/update` | 手动触发一次上游检查 + 更新 |
| `GET /provider/models` | pi-ai 模型全量元数据（60 秒缓存，悬浮详情/能力徽章用） |
| `GET /provider/presets` | 可添加的供应商预设清单（含已配置标记） |
| `POST /provider/refresh` | 单卡刷新余量（实查绕过缓存，同步全局快照） |
| `POST /provider/remove` | 删除 provider（settings/mutate 清路由 + credentials 清密钥） |
| `POST /provider/test` | 添加前测试连通（llm/discoverModels 实连探测模型） |

## 配置

计费部分不用配：provider 从 settings.yaml 的 `llm-pi-ai.providers` 自动发现，key 走
credentials 服务按 `apiKeyEnv` 解析。可选环境变量：

- `DSH_PROVIDER_UPDATE=off` —— 关掉 pi-ai 自动检查（`POST /provider/update` 仍可用）

## 不改 pi-ai 的文件（曾经打过"目录补丁"）

pi-ai 的模型数据是**静态快照**，官方模型升级后会滞后。举个例子（2026-09-15 实测）：
`kimi-for-coding` 官方已升到 K2.8 Preview / 上下文 1M，而 npm 上最新的 pi-ai（0.85.1）仍写
K2.7 Code / 256k——**热更新到最新也拿不到正确值**。

插件以前的做法是加载时直接改 pi-ai 的 `dist/providers/data/*.json`（`CATALOG_PATCHES`）。
2026-09-15 拆掉了，理由：

- 改第三方包的文件，装下来的东西就跟 registry 上的 integrity 对不上，不可复现、不可审计；
- 补丁是手写的、靠人维护的，上游跟上之后还得记得删；
- 它和"版本跟进"是两套机制干同一件事，容易打架（比如补丁只打在热更新那一档，回退后同一版本
  的两份数据就不一样了）。

改了哪里：`CATALOG_PATCHES` / `applyCatalogPatches` / `isVendoredRoot` 删除，`/provider/status`
的 `catalogPatches` 字段和 Provider 标签里的那一行一并去掉。

**代价**：Kimi 的模型名和上下文窗口现在显示 pi-ai 里的原值（K2.7 Code / 256k）。上下文窗口
影响压缩阈值，不只是显示。

**替代方向**见下一节——按 provider 拉上游自己的模型列表，动态覆盖。

## 边界：插件不写宿主

启动期（模块加载 + `apply`）只写插件自己的 `vendor/` 目录；对 dsh 安装目录、`settings.yaml`、
`credentials` 一律只读。写宿主只发生在用户显式操作时：界面上添加/删除 provider。

曾经有两处例外，都已删除（2026-09-15）：

| 删掉的 | 原来干什么 | 现在 |
|---|---|---|
| `bridge.js` 里给 pi-ai 打目录补丁 | 改第三方包的数据文件；兜底时还会写脏 dsh 全局安装 | 整块拆掉，见上一节 |
| `index.js` 的 `ensureDeepseekRoute()` | 启动时往 settings 补一条 deepseek 路由 | 路由改在 `cordis.patch.yml` 的插件 config 里声明（见下），settings 里缺了由 `/provider/status` 的 `deepseekRouteMissing` 报出来 |
| `index.js` 的 `syncRouteDisplayNames()` | 启动时往 settings 补 provider 显示名 | 删除。界面上的名字由 `lib/routes.js` 的 `labelOf()` 实时解析，不依赖写入 |

### DeepSeek 的路由放哪了

内置 `llm-deepseek` 被 `cordis.patch.yml` 禁用，DeepSeek 走 pi-ai 的 `deepseek` 路由——这条路由
需要有人声明。**声明在 `cordis.patch.yml` 里插件条目的 `config.providers.deepseek`**，不写进
`settings.yaml`。

依据是 dsh 的 settings 组合顺序（`dsh-settings/lib/index.js` 的 `resolve()`）：
**schema 默认 → 插件 config（base 层）→ 用户 settings.yaml 层**，逐层深合并。所以：

- 路由由插件提供，任何装了本插件的机器开箱就有 DeepSeek，不用迁移、不用写宿主配置；
- 用户想改（换端点、换凭据名）就在 `settings.yaml` 里写同名 key，覆盖 base 层。

## 后续：实时模型参数增强（TODO）

pi-ai 的目录数据是静态快照，上游模型升级后会滞后。插件的方案是桥接加载时按 provider 拉上游
自己的模型列表，动态覆盖能拿到的字段——**不在 pi-ai 的文件上动手**，pi-ai 目录继续当 fallback。

**已探测结论（2026-09-13）**：

| provider | `/models` 端点 | 能拿到的参数 | 永远拿不到的字段 |
|---|---|---|---|
| `kimi-coding` | ✅ `GET https://api.kimi.com/coding/v1/models` | `context_length`、`display_name`、`supports_reasoning`、`supports_image_in`、`supports_video_in`、`think_efforts` | API 协议、baseUrl、compat、cost、thinkingLevelMap |
| `deepseek-official` | ✅ `GET https://api.deepseek.com/models` | 只有 `id`/`owned_by` | 上下文、输出上限、协议、cost |
| `zai-coding-cn` | ✅ `GET https://open.bigmodel.cn/api/paas/v4/models` | 只有 `id`/`created`/`owned_by` | 上下文、输出上限、协议、cost |
| `qwen-token-plan-cn` | ❌ 当前 key 调不通 dashscope 兼容版 `/models` | 待补 | cost、协议、thinking map |

**设计草案**：

1. 给 `lib/adapters/<provider>.js` 增加可选的 `fetchModelMetadata(resolvedKey) → Array<{id, contextWindow?, displayName?, reasoning?, thinkingEfforts?}>`；
2. `kimi-coding` 先实现（已验证端点），其它 adapter 返回 `null` 表示用静态目录；
3. 在 `lib/bridge.js` 桥接加载流程里，拿到每个 provider 的 key 后异步拉一次 `/models`，
   把返回结果转成补丁格式写到 vendored JSON，再 require bundle；
4. 拉取失败或无实现时就用 pi-ai 的原值（不改它的文件）；
5. 拉取带超时（如 5s），失败不阻塞启动。

收益：Kimi 官方升级模型（如把 `kimi-for-coding` 升到 K2.8 Preview、上下文改为 1M）后，
**不用等 pi-ai 发版、不用写静态补丁**，重启 dsh 就自动修正。

## 已知状态（2026-09-15）

- **模型选择器按官方蓝本重写完成**（真机验证）：
  - 交互与官方 ui-model-selection 完全一致：触发器胶囊（模型名 · 推理等级）→ 根面板
    「模型/推理等级」两行 → 模型面板（搜索 + provider chips + 分组列表）→ 推理等级面板；
  - 选模型后退回根面板可接着调档位（官方行为），选档位后关闭；刷新页面从会话投影
    `modelSelection` 立即回显当前模型；
  - 模型一律显示 id（`供应商id/模型id`，chips/分组标题/模型行同一套 id；搜索仍匹配 id 和 pi-ai 显示名），
    推理等级显示原始档位首字母大写（Low/High/Max）；
  - 推理等级按会话已定的档位显示，不要求目录里收录这个模型：会话存着的 provider 可能不在
    本 profile 的目录里（原生路由没注册、模型下线的历史会话），此时档位行只读——档位可选项本来
    就来自目录，没收录就没得选（官方在这条路径上整行不渲染，是有意放宽的差异）；
  - 取数与写回跟官方 ui-model-selection 同一口径（对着 reference/dsh-src 逐条核对）：当前选择取
    `会话投影 next ?? 目录 default`；默认档只认目录声明的 `defaultEffort`，没有就显示「服务商默认」，
    不拿档位表首档顶替；切模型只提交 provider/model，档位由宿主 `resolveCallConfig` 决定并回写投影；
  - 增强项：provider chips 带最小余量指示点（悬停看 5h/7d 明细）、模型行带能力徽章
    （视觉/推理）和上下文标注；
  - composer 的额度徽标座位已按用户要求撤下。
- **Provider 标签页**（真机验证）：官方 PluginCard 蓝本 1:1 的卡片（两行布局：名称+绿点+官网链接 /
  余量摘要+刷新时间+刷新+删除，贯穿分割线，官方 Chevron）；余量格式 `5h: 90% ◷ 4h34m ｜ 7d: …`，
  刷新指示 `<1min`/`刚刚`；展开体展示路由配置（路由 ID / 掩码密钥 / API 地址 / 协议 / 密钥存为，
  与「添加供应商」表单同一组信息，缺的字段整行不显示）；添加走 settings/mutate + credentials/set
  （先测试连通才能添加），删除同理；余量不支持时该行不显示而不是报错。
- **命名全面切到 pi-ai 注册表**（`lib/pi-ai-names.js`）：显示名一律调 pi-ai 自己的 `*Provider()`
  工厂拿（41 家全量，带缓存）。**不再往 settings 写 displayName**（见「边界」一节），宿主界面
  因此显示路由 id，界面内部显示 id（2026-09-15 决定）。候选清单**按名字排序**，自定义网关
  固定排最后——以前压着一张 38 家的人工优先级表，下拉里有过滤之后那份表就没必要了。
- **pi-ai 目录外只留 Custom Gateway**：添加时可路由 ID、端点、协议（OpenAI / Anthropic 下拉）全
  自定义；stepfun/siliconflow/novita/volcengine-ark 四家预设连同适配器已删除。
- **计费适配器收敛到 9 家**（对齐 CC Switch 源码调研）。
- **Kimi 凭据错配检测**：多个 provider 共用同一把 key 直接报警（凭据名点名，key 值不出宿主）。
- **测试环境**：`scripts/test-profile.sh` 一键起 plan-test profile（3081 端口、自动开浏览器、
  `DSH_PROVIDER_TEST=1` 打「测」角标）；三态 = 补位 / 裸基线（摘 dsh-provider）/ 官方完整（3080）。
  plan-test 的 patch 层禁用官方模型管理三件套（llm-pi-ai / ui-model-selection / ui-settings-models）。
- 排查用：浏览器里 `window.__dshProvider` 记录接线状态；`GET /provider/status` 的 `routes` 字段看路由发现。

## 文件

| 文件 | 作用 |
|---|---|
| `src/index.ts` | 宿主入口：挂桥接插件 + 计费/状态/预设/添加/删除路由 |
| `src/bridge.ts` | 桥接装载：拷 bundle、体检挑 pi-ai、管理软链、require 副本 |
| `src/updater.ts` | 上游更新器：registry 检查、下载、装依赖、切版本 |
| `src/routes.ts` | provider 路由发现（settings + 原生适配器目录合并）+ 官网链接映射 + labelOf 兜底 |
| `src/pi-ai-names.ts` | pi-ai 注册表名字读取（id → name，缓存；所有显示名的唯一来源） |
| `src/provider-presets.ts` | 添加 Provider 的候选清单：pi-ai 目录动态生成 + Custom Gateway；排序优先级 |
| `src/model-details.ts` | 模型详情：读生效 pi-ai 包的 providers 数据文件（上下文/能力/思维链） |
| `src/credential-check.ts` | 凭据体检：多个 provider 共用同一把 key 时报警 |
| `src/adapters/*.ts` | 计费适配器（9 家，每家一个文件 + 注册表 + CLI 跑测器） |
| `src/client.ts` | 浏览器端：模型选择器（官方蓝本两级层级）+ 设置页 Provider 标签（卡片/添加/删除） |
| `src/dsh-home.ts` | DSH 数据目录（`$DSH_HOME`）解析 |
| `test/*.mjs` | 路由发现、凭据体检、patch 层、pi-ai 体检、候选清单、状态合并、客户端接线七个离线测试 |
| `scripts/test-profile.sh` | plan-test 测试环境一键脚本（起服务 + 打开浏览器） |
| `scripts/dev-*.sh` / `main-lock.sh` | worktree 并行开发流程：开任务分支、自测打标记、串行合入 main（见 `AGENTS.md`） |
| `reference/kimi-console-api.md` | kimi 控制台接口逆向记录（未接入） |

`node_modules/@deepseek-ai` 是指向 `~/.dsh/profiles/node_modules/@deepseek-ai` 的符号链接，
供开发时单独 import 用。

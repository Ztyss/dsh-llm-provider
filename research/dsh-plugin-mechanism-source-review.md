# dsh 插件机制 —— 源码级深度研究（基于 dsh-src 源码树）

**研究对象：** `/Users/cgeng/Workspaces/dsh-plan/dsh-src`（deepseek-harness 源码 monorepo，比已安装的 0.1.2-rc.1 更新）。
**方法：** 官方文档（docs/architecture.md、capability-seams.md、cookbook/*、subsystems/*、cordis-tutorial/*）+ 三个并行源码核查 agent（服务端扩展点 / 引导机制 / 前端机制）+ 主线程第一手文档阅读。所有结论都有源码路径或文档路径支撑。
**前作：** `research/dsh-plugin-architecture.md`（基于安装产物，含已验证的端到端 demo）。本文是其在源码树上的升级与修正。

---

## 0. 一句话总模型

dsh 是一个 **all-plugin Cordis agent harness**：没有"内核 + 插件 API"的区分，产品本身（agent loop、tool registry、session log、LLM adapter、Web 前端）全部是平等挂载的 Cordis 插件。官方架构文档的原话（`docs/architecture.md`）：

> "There is no privileged core to patch: you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads."

所以"插件机制"不是一套单独的 SDK，而是：**整个产品即插件 + 一套组合机制（profile/bundle/patch 层）+ 一批文档化的注册点（registry / event / seam）**。自由度由此而定：服务端你拿到的是和第一方完全相同的 `ctx`，几乎无限；前端你被放进一个有 61 个声明座位的组合系统，自由度大但边界清晰。

---

## 1. 组合机制：插件怎么被挂载（前端服务端共用）

### 1.1 层序（源码 `apps/cli/src/profile-boot.ts:226-244` 的 `composeProfile`）

一个运行中的 dsh = 对**空入口列表**依次应用有序 patch 层：

1. profile `dsh.profile.bundles` 列出的每个 bundle 的 `cordis.patch.yml`（按列表顺序）
2. profile 自己的 `$DSH_HOME/profiles/<name>/cordis.patch.yml`
3. **`$DSH_HOME/cordis.patch.yml`（home 层，机器级偏好）**——安装版报告遗漏的一层
4. 每个 `--patch <path>` 命令行 overlay（argv 顺序）
5. launcher 合成的 telemetry 开关 patch（`DSH_TELEMETRY_DISABLED` → disable `session-telemetry-otel`）

全部扁平化成**一次** `applyEntryPatches`（vendored `vendor/include/src/index.ts`）：

- patch 按 `id` 整行匹配，`config` 是**整体替换不是 merge**；`name` 字段是断言（不符则 warn 并跳过，防 id 碰撞）。
- `insert`（不带 id）push 到根；`insert`（带 id）插入 group 行的 `config` 数组；insert 行立即入索引，同列表靠后的 patch 可以打中靠前的 insert 行。
- 匹配不到目标的 patch **warn 并跳过**（不 fail）——一个 overlay 可以跨 surface 共享。
- 输入永不被 mutate（structuredClone），live 重放可回退。
- `disabled` 只能来自行/patch，不能来自插件 config。
- `!!js` 表达式在该行 fiber 创建时对注入上下文求值（`!!js ctx.webStartup.port ?? 3080`、`!!js process.env.MY_KEY`、`!!js dshHomePath('x')`）。

### 1.2 关键陷阱（源码注释可见）

- profile 根的 `cordis.yml` 是**每次启动重写的空数组 `[]`**，存在的唯一理由是锚定 Loader 的 `baseUrl`（组合行会被 tree write-back 烤进文件）。**永远不要编辑它**。
- live 重放（`patchReload: 'live'`，web profile 默认）每次重放都 structuredClone——因为 insert 行按引用 push，不克隆会把用户覆盖永久烤进 bundle 行。
- bundle 解析双锚点：安装锚点（dsh 自己的 package.json）优先于 profile 目录，保证 `@deepseek-ai/dsh-base` 永远来自运行中的安装。
- `healProfilesModuleFallback` 维护 `$DSH_HOME/profiles/node_modules` 镜像安装闭包；打包可执行文件（pkg）写 ESM proxy 目录而非 symlink。
- `link:` 依赖的插件按 realpath 解析 ESM import——dsh 的依赖闭包**不会**自动可见，插件目录里要自己 `npm install` 并把 `@deepseek-ai/*` 放 peerDependencies。

### 1.3 分发通道（第三方正式路径，文档 `docs/user/develop/basic/publish.md`）

- **bundle**：npm 包，`package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 文件 insert/覆盖插件行。插件自己的 patch 随包走。
- **profile**：`$DSH_HOME/profiles/<name>`，`dsh.profile.bundles` 有序列表。
- **安装**：`dsh plugin --profile <name> add <pkg>` = pnpm 转发 + reconcile（自动把声明了 `dsh.bundle` 的包追加进 bundles 列表）。git 安装需要作者提供自包含 `prepare` 脚本 + 用户在 profile `pnpm-workspace.yaml` 的 `allowBuilds` 里白名单（**等于安装期在你机器上执行该包代码**）。
- 官方引用了一个真实第三方示例：**turtle-ui**（github.com/deepseek-harness/turtle-ui）。
- shipped 模板：`web=[base, web-app]`、`headless=[base, headless]`、`acp=[base, acp-app]`、`sdk=[base, sdk-app]`、`sdk-minimal=[sdk-minimal]`（唯一不含 base 的）；自定义 profile 默认 `[base]`。
- surface bundle 可以拥有自己的命令行：`inject = ['cmdlineArgs']` + `@deepseek-ai/dsh-cmdline` 的 commander program，app flag 不需要 launcher 改动。

---

## 2. 服务端：增加一个后端功能

### 2.1 插件形态

三种等价形态（vendored Cordis Loader 都接受）：函数插件（`export const name/inject/Config; export function apply(ctx, config)`）、对象插件（`apply` 方法）、`Service` 子类。注册**全部是 effect**（`ctx.effect()`/`ctx.on()`），插件卸载/HMR 时自动撤销。Config 用 Schemastery schema，YAML 里可覆盖。

### 2.2 官方扩展点地图（`docs/architecture.md` "Where new behavior goes" + `docs/cookbook/extension-cookbook.md` "feature → mechanism map"）

这是官方的核心承诺："New behavior attaches to a documented extension point. Changing the loop itself updates this map." 每个产品特性 = 某个文档化扩展点上的一个监听器（microkernel 主张）。

| 你想加的东西 | 机制 | 源码锚点 |
|---|---|---|
| 模型工具 | `ctx.tools.register(defineTool({...}))`，schema 自动进 system prompt | `packages/core/tools/src/index.ts:1027` |
| 权限/策略 hook | 监听 `tools/pre-execute`（waterfall，返回 allow/deny/ask） | 同文件 134-200；cookbook 有 permission-gate 示例 |
| 拦截/包装工具执行 | `tools/execute`（around）/ `tools/post-execute` / `tools/result`（只读观察）/ `ctx.tools.guard()`（单调最终拒绝） | 同文件 |
| 拦截 agent 生命周期 | `agent/session-start`、`agent/pre-step`（waterfall，enter/reject）、`agent/request`、`agent/turn-stopping`（serial，可 steer 续一步） | `docs/architecture.md` turn flow |
| 拦截模型流 | `llm/stream` waterfall（`LlmRuntime`） | `packages/llm/llm/src/index.ts:331` |
| 新 LLM provider | `class MyAdapter extends LlmAdapter`（只需实现 `stream(options): AsyncIterable<StreamChunk>`）+ `ctx.llm.registerAdapter(['route'], adapter)` | `packages/llm/llm/src/index.ts:200,387`；cookbook `adding-an-llm-adapter.md` |
| 换系统提示词 | `ctx.systemPrompt.section()` / `system-prompt/assemble` waterfall | `packages/core/system-prompt` |
| 持久用户配置 | `ctx.settings.register(ns, schema)` / `installSection(...)` | `packages/settings/settings` |
| 凭据 | `ctx.credentials.resolve(ref)`（值只在 host；client 只见 describe） | `packages/credentials` |
| 新 shell/FS/终端/沙箱后端 | capability seam 三角色：Service Definition / Provider / Consumer。实现 provider 注册进 seam（`ctx.shell` / `ctx.fs` / `ctx.terminals` / `ctx.sandbox`…），上层工具自动跟随 | `docs/capability-seams.md`（74 个服务的完整图） |
| 人类命令（/foo） | `ctx.commands.register(definition)`（不经过模型） | `packages/interaction/commands/src/index.ts:285` |
| 后台任务 | `ctx.jobs.start({...})` + 返回 typed handle | `packages/jobs/jobs/src/index.ts:82` |
| 外部事件 → Session | `ctx.webServer.register({kind,path,handler})` + `ctx.webhookRuntime.register(rule)`，rule 返回 `WebhookSessionRequest` 即建 root Session | `packages/host/webserver/src/index.ts:165`；`packages/webhook/webhook/src/index.ts:104` |
| Skill 来源 | `ctx.skills.registerProvider(control => SkillProvider)`（目录型）或 `ctx.skills.register(skill)` | `packages/skill/skill/src/index.ts:390,439` |
| MCP server 的工具 | 纯 YAML 配置（stdio/streamable-http），工具以 `mcp__<server>__<tool>` 进 `ctx.tools` | `packages/mcp/mcp-client` |
| Subagent 后端 | `ctx.subagents.registerProvider(SubagentProvider)` | `packages/subagent/subagent/src/index.ts:509` |
| 工作流编排 | `ctx.workflowEngine.start({script, ...})`（模型写 JS 脚本 fan-out subagent）；engine provider 也可替换 | `packages/workflow/workflow` |
| 会话内动态能力（自修改） | `tool-cordis` 的 7 个模型工具操作 `ctx.dynamicCordisRunner`（vm 沙箱，进程内存，重启即失） | `packages/extensions` |
| 持久 session 状态 | 扩展 `SessionEventMap`（durable session event），渲染/重放从 log 推导——**model-visible ⟺ logged 是不变式** | `docs/architecture.md` |
| host→browser 推送值 | `ctx.sessionProjections.register(unit)`（projection seam） | `packages/session/session-projection` |
| 类型化 RPC 端点 | Typert Remote：`TypertRemoteService` + `@Remote` 装饰器 → 构建期 generator 生成 `./typert` + `./remote` 产物 | 见 §2.3 |

### 2.3 Typert Remote：host↔client 类型化 RPC（源码修正了安装版报告）

- **generator 在源码树**（`packages/typert/generator`），身份是 **tsdown build 插件**（`tsdown.config.ts:30`），所以对第三方而言"生成"发生在构建期，无需安装 generator。
- 正式流程（`docs/cookbook/adding-a-remote-api.md` 五步法）：① 声明方法（`@Remote` 装饰公开实例方法，`TypertRemoteService` 绑定 service key 和 wire namespace）→ ② 声明失败（`RemoteError` + 声明合并进 `RemoteErrorDetailsMap`，错误码表 `<domain>/<reason>`）→ ③ package.json 声明 `exports["./typert"]`/`exports["./remote"]` 指向生成产物 → ④ client 侧 `inject: ['remote', 'remote.<ns>']`，调 `ctx.remote.<ns>.<method>(...)`，结果 `RemoteResult<T> = {ok:true,value}|{ok:false,error}`（不 reject）→ ⑤ 测试。
- **host 侧发现是动态的**（修正）：`dsh-typert-loader` 监听 cordis `internal/plugin` 事件，扫描所有活跃 entry 的包是否 exports `./typert`，有则注册进 `ctx.typert`；Gateway 还有 SRC 运行时扫描（遍历 `ctx.reflect.props` 里所有 service 的 `typertRemote` 绑定）。第三方包只要被任意层 mount，host 自动获得其端点。
- **client 侧仍是构建期固定列表**（确认）：`packages/api/remotes/src/client/index.ts:4-19` 硬编码 15 个贡献逐个 `$mount()`，无运行时发现；事件转发也是固定 allowlist（`remote-events.ts`。**这是第三方 remote 上浏览器的主要门槛**：要么改 api-remotes 装配（仓库内路径），要么走 `cordis-host-runner` 的动态 remote（`remote.dynamicCordisRunner`，无类型、node:vm、session 级），要么像已验证 demo 那样用 `ctx.webServer.register` + 裸 `fetch`。
- 严格约束：Remote 方法必须 public、非 static、非 generic；参数必须 required、简单标识符、无解构/默认值/rest；复杂 host 对象要经 `TypertLookupMap` 声明 + `ctx.typert.lookups` 运行时 provider。

### 2.4 自由度评估（服务端）

- **代码权限：完全等于第一方**。第三方插件注入 `ctx.tools`/`ctx.settings`/`ctx.llm` 与官方包无任何区别。没有插件白名单、没有 API 分级、没有沙箱——架构上刻意如此（no privileged core）。安全边界由**部署策略**（permission presets、sandbox、approval）控制，不由扩展 API 控制。
- **文档完备度：高**。工具/LLM adapter/remote API/settings card/打包发布都有 cookbook + 用户教程，且有真实第三方示例。
- **稳定性：全部 pre-stable**（根 CLAUDE.md 明示 "Public APIs are pre-stable; update every consumer"）。
- **进不了 monorepo**：仓库内包一律 `private: true`，第三方只能走 bundle 分发。

---

## 3. 前端：增加一个 Web UI 功能

### 3.1 双半包（dual-face package）

一个前端插件 = 一个 npm 包，host 半边是普通 Cordis 插件（`src/`），浏览器半边（`src/client/`）构建成 **lazy-CJS classic script**，经 package.json 声明：

```jsonc
{
  "exports": {
    ".":        { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] } }
}
```

`dsh.client` 字段全集只有 4 个（`packages/util/package-manifest/src/types.ts:69-82`）：`platform`（必须 `"web"`）、`inject`（**包名依赖边**，fetch 排序用，不是 Cordis 服务注入）、`immediately`（bootstrap 一阶段预取）、`external`（精确的非 inject 模块请求）。

### 3.2 模块系统（`packages/client/modules` + `packages/client/web`）

host 侧 `ctx.clientModules` **增量扫描** Loader entries（`internal/plugin` 事件 + microtask flush），发现 `dsh.client` 包后：

- 把图写进 HTML：`window.__DSH_BOOT__ = {rev, entries[], batches[]}`；注入序 = queue facade script → application preload → bootstrap parser-blocking script → graph global。
- bundle 由 `/plugins/??a/client.js,b/client.js&rev=<sha1-12>` combo 端点 serve（≤3KB 自动分批，immutable cache）。
- 浏览器侧是**懒 CJS 表**：script 执行只注册 factory，首次 require 才物化。require 解析序 = 9 个 seed words → 已物化 → 已注册 factory → throw（bundle purity gate 的运行时镜像）。

**seed words 恰好 9 个**（`packages/client/web/src/platform.ts` + `seed.ts`，三处共用同一常量、编译期 satisfies 锁死）：
`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。

一切超出这 9 个词的依赖必须：内联进自己的 bundle，或经 `external`/`inject` 依赖另一个插件的 `./client` 产物。**bundle purity gate**（`packages/client/tsdown.client.ts:489-500`）在构建期拒绝任何未声明的 `@deepseek-ai/*` 值 import——跨插件协作只能走 cordis 服务（type-only import 被擦除不受影响）。这是前端自由度最硬的一条边界。

### 3.3 Slots：React 组合系统（`packages/client/ui-slots` + `ui-renderer`）

- 两级：`SlotCore` 纯核心（1231 行，零运行时依赖）+ `SlotRegistry` Cordis service。
- **61 个座位**（源码，比安装版 52 多 9 个；`docs/subsystems/slots.md` 有完整层级树）：唯一 a-priori 声明是 `root`（**注册 root 是官方警告的陷阱**——会以更低 priority 获胜把整 frame 挤掉）；其余全部先声明再注册，"Declaring is claiming"（一个 child key 只能一个注册者）。
- 两轴：**kind**（single/list/keyed/chain）× **scope**（root/session-maybe/session）。chain 有额外 overlay 模式（fallback 常驻 DOM，`conversation.composer` 用）。
- **shadowing 语义**：priority 升序，同单元（single 整槽 / keyed 每 key / list 每 id）相同 priority 二次注册**直接 throw**，不同 priority 最低者渲染——所以"加东西"用 list 新 id 或 keyed 新 key，"替换东西"用更低 priority 重占单元。
- **崩溃 abdication**：组件崩溃条目从单元退役（one-shot），渲染落到下一幸存者；单元全灭渲染 crash face；chain 崩溃不退役。组件永远收不到 `ctx`，只收六份合成 props（owner/标准 hooks/renderSlot/store/inject/locale）。
- 标准 hooks 由框架注入：`useSessions`、`useSession`、`useProjection`、`useConversation`、`useChat`…（`docs/subsystems/slots.md` 有表）；**session 数据走 projection push 模型**（host 唯一计算点，client higher-seq-wins，identity-stable `ObservableSnapshot`）。
- i18n：注册声明 `locale` namespace，组件收 `t`；硬编码文案被 `verify-client-ui-i18n` gate 拒绝。
- 样式：CSS 在 factory 物化时注入 `<style data-plugin=...>`，tag id 幂等守卫，HMR 精确回收；主题 token 是 `--dsw-*` CSS 变量；渲染点暴露 `[data-slot="<key>"]` 锚点。

### 3.4 两个深度扩展面

1. **Conversation 业务节点**（`docs/subsystems/conversation.md`）：注册 `ConversationNodeDefinition`（`match`/`start`/`update`/`buildViewNode`）+ `conversation.chat.node` keyed renderer。契约严格：增量事件要带稳定业务 id、`presentCall`/`presentResult` 必须纯函数（replay 与 live 共用）、append 路径禁止扫描全窗口（性能契约有 8 条验证义务）。这是"往对话流里加一种新业务 UI"的正式通道。
2. **Settings 卡片配对**（`docs/cookbook/adding-a-settings-card.md`）：host 半 `ctx.settings.installSection(ns, schema, entry)` + browser 半注册 `settings.plugin.item` keyed 卡片，**namespace 字符串即 join key**，Plugins 页自动配对渲染——插件完全不碰这个仓库。

### 3.5 HMR（`packages/client/hmr`）

host 侧 stat-poll（默认 500ms）所有图行的 bundle → `rebuilt(id)` 换内容寻址 rev → SSE `/plugins/events` 通知浏览器 → `invalidate → prefetch → tearDownEntryFiber → removeOwnedStyles → refresh`（registry-first teardown 防 Loader 标 disabled）。**第三方 bundle 开箱即用**（已在前作 demo 验证：改 lib/client.js 约 500ms 后无刷新热更）。host 半热更走 vendored cordis-plugin-hmr（web profile 默认 disabled）。

### 3.6 自由度评估（前端）

- 可以：注册任意 seat（加 widget/设置页/侧栏项/对话节点/工具卡片）、注册自己的 cordis 服务与 remote 方法、注册 settings namespace、读所有 projection、用自己的 CSS、走 fetch 或 typed remote 回 host。不需要 rebuild web 应用，HMR 即时生效。
- 不可以：新增 seed word（要改 shell 的 platform.ts，即改产品本体）；跨插件值 import（purity gate）；抢注已声明的 child slot 或同 priority 重占单元；注册 root；绕过 Conversation 契约扫事件窗口；让组件拿到 `ctx`。
- 形态约束：bundle 必须是 lazy-CJS classic script（可手写零构建，前作已验证）；React 18 函数组件；组件库只有 primitives（Button/Modal/Menu/Toast/DiffBlock…约 40+ 导出 + 图标集，seed 词共享单例）。

---

## 4. 总体结论：官方给了多大自由度

**设计哲学**：microkernel + 组合系统。服务端是"完全开放的注册表 + 事件总线"模型（自由度 ≈ 第一方）；前端是"声明式组合系统"模型（自由度 = 61 个座位 + 9 个共享模块 + 严格纯度契约）。两端共享同一套挂载/分发机制（bundle/profile/patch），同一插件可以一个包同时含两半。

**成熟度分层**（官方文档完备度）：
1. 最成熟：bundle 打包安装（publish.md + turtle-ui 实例）、工具、LLM adapter、settings 卡片、MCP 配置。
2. 成熟但受限：前端 slots（61 座）、Conversation 节点（契约重）。
3. 有门槛：类型化 Remote API（client 侧 api-remotes 固定 15 项列表是硬墙；第三方要么手改装配、要么走 dynamicCordisRunner、要么裸 HTTP fetch）。
4. 实验性：agent teams、cordis 自修改、webhook。

**主要风险**：API pre-stable；无运行时插件权限模型（安装 = 信任）；git 安装即远程代码执行（prepare + allowBuilds）；link: 插件的依赖解析陷阱（realpath）。

**与安装版（0.1.2-rc.1）报告的 delta**：home patch 层、telemetry 合成层、根 cordis.yml 恒空、typert-generator 存在于源码（build-time 插件）、host remote 发现双通道动态、seed words 8→9（+dockkit）、seat 52→61、chain overlay 模式、崩溃 abdication 语义、sdk/python SDK profile 通道。

# dsh-provider 需求文档

> 定位：**as-is 基线**——固化「当前这套系统承诺做什么」，作为以后每次改动的参照。
> 未实现但被确认为正式需求的内容，集中在 §7「需求缺口清单」，不在正文假装已实现。
> 设计原理与实现细节见 `README.md`，调研证据见 `reference/`（每条结论带 [READ]/[RAN]/置信度标注）。

## 1. 背景与目标

dsh（DeepSeek Harness）打包时固定了旧版 pi-ai，模型目录滞后上游；且 dsh 没有任何额度/余额设施
（调研结论：从零建，见 `reference/dsh-plugin-architecture.md` §7）。本插件以 dsh 第三方插件形态解决三件事：

1. **新模型立即可用**：自动跟进 `@earendil-works/pi-ai` 上游，新版本发布后无需等 dsh 发版即可用上。
2. **额度/余额可见可查**：为各 LLM provider 提供额度/余额查询，在 GUI 里直接看到「还剩多少」。
3. **模型选择与配置可诊断**：模型选择器带搜索、provider 过滤和余额显示；配置错误（凭据错配、
   桥接状态）能在界面上直接看出原因，而不是「某个 provider 一直查询失败」。

## 2. 用户与场景

用户是 dsh web GUI 的使用者（单机、本机 loopback 场景）。核心场景：

- **S1 选模型**：在 composer 的模型座位打开选择器，按 provider 过滤或搜索，每行显示余额，
  一眼看出哪个 provider 额度已用尽；点选即切换。
- **S2 看余额**：composer 旁的额度徽标常显当前 provider 的余量摘要；点开是各账户明细面板。
- **S3 查配置**：设置页 Provider 标签显示桥接状态、pi-ai 版本、上游版本、各 provider 额度明细、
  凭据体检结论；可手动触发上游检查更新。
- **S4 跟进上游**：pi-ai 发新版后自动下载就位，重启 dsh 即生效；状态可查、可回滚。
- **S5 感知用量与失败**（本期需求，未实现，见 §7.2）：从会话事件流感知 token 用量与
  额度耗尽类失败，不用等手动查。

## 3. 功能需求（as-is 基线）

### 3.1 pi-ai 桥接与更新

| 编号 | 需求 | 验收要点 |
|---|---|---|
| FR-1.1 | 手动跟进上游：设置页按钮触发（`POST /provider/update`），检查 npm registry 最新版、下载、装依赖、就位；**验证通过才替换**——tarball 完整性（`dist.integrity` sha512）与兼容性体检（bridge 的 import 需求 probe）两道都过才标记待重启；启动期自动检查已移除（2026-09-15 决策） | 新版本出现在 `vendor/pi-ai/<版本>/`；校验失败/体检不过的版本进 `latestRejected`，不会切换 |
| FR-1.2 | 桥接装载：官方 llm-pi-ai bundle 的拷贝跑在我们维护的新版 pi-ai 上；bridge 不可用时退化为纯计费模式，不拖垮启动 | 重启后模型目录包含上游新增模型；bridge 失败时 `/plan/status` 仍工作 |
| FR-1.3 | 升级与回滚：换软链即生效时机 = 重启；回滚 = 软链指回旧版本目录 | `GET /provider/status` 报告当前版本/needsRestart |
| FR-1.4 | 桥接状态可诊断：版本、上游最新版、已发现的路由表（含凭据名，不含值） | `GET /provider/status` JSON 可见 |

### 3.2 计费接口（host 半区）

| 编号 | 需求 | 验收要点 |
|---|---|---|
| FR-2.1 | provider 路由发现：合并 `settings.yaml` 的 `llm-pi-ai.providers`（用户实际配置）与 `listConfigurableProviders()` 里的原生适配器路由（`deepseek-official`）；未配置的 catalog provider 不进面板 | `node test/routes.mjs` 通过；新增 provider 只需加一个适配器文件 + 注册一行 |
| FR-2.2 | 额度查询适配器：DeepSeek（余额）、Kimi Coding（用量窗口）、GLM（周/日窗口）、Moonshot（余额）用各家 API key 免费 GET；Qwen 无公开接口，只显示说明文案 | `node lib/adapters/run.js all` 可离线逐个跑测 |
| FR-2.3 | 统一账户快照接口：`GET /plan/status`，60 秒缓存，`?refresh=1` 绕过；上游故障返回结构化错误而不是 500 | 浏览器直接 fetch 同源可用 |
| FR-2.4 | 凭据体检：多个 provider 解析出同一把 key 时给出「和某某完全相同，几乎肯定填错了」的报警；**key 值只在宿主进程内比对，绝不下发浏览器** | `node test/credential-check.mjs` 通过；消息只含结论不含值 |
| FR-2.5 | 凭据解析：按各路由的 `apiKeyEnv` 经 credentials 服务解析（env → 凭据文件 → .env 分层） | 与官方 llm-pi-ai 取 key 同一通路 |

### 3.3 Web 界面（client 半区）

| 编号 | 需求 | 落点 | 状态 |
|---|---|---|---|
| FR-3.1 | 额度徽标 + 账户面板：当前 provider 余量摘要常显，点开看各账户余额/窗口/重置时间/报警 | `conversation.input.right`（list） | ✅ 已实现，真机验证（2026-09-13） |
| FR-3.2 | 模型座位接管：搜索（跨 provider）、provider chips 过滤（带余量指示点）、每行能力徽章（视觉/推理）与上下文标注、当前标记、点选即切 | `conversation.input.model`（single；官方 `ui-model-selection` 由本插件 bundle patch 禁用，`priority: -10` 保留作兼容） | ✅ 已实现，真机验证 |
| FR-3.3 | `/model` 命令带余额渲染：官方 `ui-model-selection` 行由 bundle patch 禁用，本插件为唯一贡献者；代码保留「同名即让位」兜底 | `commandUi.register` | ✅ 已实现（接管路径待真机复验） |
| FR-3.4 | 设置页 Provider 标签：桥接状态、pi-ai 版本、上游版本与检查更新按钮、额度明细、凭据体检结论 | `settings.section`（list，新增 section） | ✅ 已实现，真机验证 |
| FR-3.5 | 数据面与官方同一条路：模型目录走 `session/modelCatalog`、切换走 `session/selectModel`、余额走 `/plan/status`；优先用官方 `modelDirectories` 客户端服务，缺席时退回同源 HTTP/RPC | — | ✅ 已实现 |
| FR-3.6 | 座位接线可诊断：`window.__dshProvider` 暴露 applied/modelDirectories/face/seat 状态 | — | ✅ 已实现 |
| FR-3.7 | 模型与思考强度的取数口径与官方 `ui-model-selection` 一致：当前模型取会话投影 `modelSelection` 的 next、没有则宿主默认模型；思考强度按会话已定的档位显示，默认档只认目录声明的 `defaultEffort`（没有就显示官方的「Default」文案，不拿档位表首档顶替）；切模型只提交 provider/model，档位由宿主决定并回写投影；选完模型或档位**成功即关闭菜单**（官方 `settleSelection` 行为）。目录里没有该模型时档位行只读显示会话已定的档位（官方此处整行不渲染，是有意放宽的差异） | — | ✅ 已实现，真机验证（2026-09-15） |

### 3.4 界面落点需求（原始调研指定的四个落点，全部保留为正式需求）

| 落点 | 需求 | 状态 |
|---|---|---|
| composer 输入区旁 | 额度徽标（即 FR-3.1） | ✅ |
| 设置页 | Provider 标签（即 FR-3.4） | ✅ |
| 侧边栏 `sidebar.footer.action` | 贡献一个入口（形态待定：徽标或跳转设置页） | ❌ 未实现 → §7.1 |
| 顶栏/全局 `shell.overlay` | 全局额度徽标（demo 插件已验证该座位可用） | ❌ 未实现 → §7.1 |

## 4. 非目标（Non-goals）

明确**不做**的事（多来自 `reference/provider-quota-apis.md` 的硬结论）：

- **不依赖浏览器登录态/token**：所有额度查询只吃各家 API key（Tier 1 原则）。
- **Qwen Token Plan 不做轮询**：无公开 API-key 端点，且 ToS 明示仅限官方工具交互使用。
- **不基于 rate-limit 响应头做额度推断**：五家均不返回相关头。
- **不用 chat completion 请求当探针**：烧 credit 且有 ToS 风险。
- **不接入 Kimi 控制台 JWT 接口**：逆向结论留在 `reference/kimi-console-api.md` 备查，不接入。
- **key 值不出宿主进程**：浏览器端只拿结论和元信息。
- **不改官方插件文件**：接管一律通过 cordis.patch 禁用官方行（`llm-pi-ai` / `llm-deepseek` /
  `ui-model-selection` / `ui-settings-models`），官方其余行为保持原样。

## 5. 硬约束

- **浏览器端拿不到密钥**：credentials remote 只有 describe/set/unset，查余额必须由 host 半区代持 key、代发请求。
- **无 `ctx.http` 服务**：host 插件用全局 `fetch`。
- **host↔client 通信走 Route A**：自建 HTTP 路由（`ctx.webServer.register`）+ 浏览器裸 fetch；
  不走 Typert RPC（第三方拿不到代码生成器）。
- **client 端无构建步骤**：手写 classic script，固定 `window.__ModuleLoader__.load` 形状；
  `dsh.client.platform` 必须为 `"web"` 且提供 `exports["./client"]`。
- **slot 规则**：先声明后注册（`slots.inject`）；single 座位同 priority 注册即抛错，
  遮蔽官方占用者必须用负 priority；`commandUi` 同名重复即抛，无遮蔽机制。
- **安全边界**：dsh webserver 无鉴权层（设计如此），默认只绑 loopback；自建路由不做校验的前提是
  「仅本机可达」。若宿主被配置为 `0.0.0.0` 暴露，`/plan/status`（余额、凭据名）与
  `POST /provider/update`（触发公网下载 + npm install）将无防护——部署时必须意识到这一点。
- **运行环境**：Node `^22.19.0 || >=24.0.0`（bridge 依赖 require ESM）。

## 6. 验收标准

- **离线测试全绿**：`node test/routes.mjs`、`node test/credential-check.mjs`、`node test/client-smoke.mjs`。
- **浏览器真机端到端**（以 README「已知状态」为准滚动更新）：
  模型座位显示当前模型 + 思考强度；搜索跨 provider 出结果；chips 过滤正常；切换实际生效且可切回；
  设置页 Provider 标签渲染正常；徽标点开的面板数据与 `run.js` 直查一致。
- **桥接验收**：上游发新版后自动就位，`needsRestart` 提示出现，重启后新模型可见；
  回滚后目录恢复旧版。
- **证据纪律**（继承自调研文档）：新需求/新结论必须可复验，拿不到的标 UNKNOWN，不许当既成事实写。

## 7. 需求缺口清单（正式需求，当前未实现）

### 7.1 落点缺口（原始四点中未做的两个）

- **侧边栏 `sidebar.footer.action` 入口**：形态待定（额度徽标 or 跳转 Provider 设置页）。
- **`shell.overlay` 全局额度徽标**：§7.2 的全局用量数据就绪后是它的主要数据源。

### 7.2 用量统计与失败归因（架构调研 §7.3 的原始需求，本期仍有效）

当前实现用「轮询 provider 免费额度端点」替代了该方案，余额显示已覆盖；但**会话内实时用量感知、
429/额度耗尽失败归因**仍属本期需求，未实现：

- 监听 `llm/stream` 拿 token 用量（会话内实时累计）。
- 监听 `session/event` 的 `assistant/message` 拿持久用量。
- 监听 `llm/retry` 的 `QUOTA`/`RATE_LIMIT` 失败码，感知额度耗尽并归因到具体 provider。
- 经 `sessionProjections.register` 推到浏览器（唯一受支持的 host→browser 通道），
  渲染到 `shell.overlay` 徽标（→ §7.1）或设置页账户卡片。

与现有实现的关系：额度端点轮询回答「账户还剩多少」（小时级刷新），本缺口回答「这次会话用了多少、
刚才是为什么失败的」（秒级/事件级），两者互补不替代。

## 8. 已知缺陷与随禁用行一起退役的能力

**已修**（2026-09-15 review）：
- `/provider/status` 读的状态文件与 updater 写入的不一致 → `readVendorState()` 现在两个文件都读。
- 补位形态下模型目录只在座位挂载时拉一次，设置页删掉 provider 后菜单里还留着 → 打开菜单即重拉。
- 额度快照在设置页与座位各留一份副本 → 改成单一源 + 广播订阅。

**随官方行禁用而退役、需要自己补的**（用户已知情并接受，先记着）：
- 官方 `ui-settings-models` 的**逐模型清单编辑**（`ModelListEditor` / `DeepSeekModelsEditor` /
  `CustomProviderCard`）：现在只能手改 settings.yaml 的 `llm-pi-ai.providers.<id>.models`。
- 官方 `ui-model-selection` 推给 composer 的**「当前模型不可路由」置灰**（`conversation.blocks`）：
  当前 provider 被删掉后，输入框不再自动置灰，要等下一条消息在 LLM 层失败才发现。

## 9. 插件组架构方向（2026-09-14 决策）

讨论结论（不 fork 官方源码、不背 monorepo）：最终形态为**补位式插件组**——用官方 bundle
patch 禁用对应官方行，由本插件按官方插件规范完整补位。测试环境三态见 9.4。

### 9.1 替换面与硬契约

- **选**：禁用官方 `ui-model-selection`；自研模型座位 + `/model` 命令 + 目录状态机。
  硬契约：写选择必经会话插件（`session.selectModel`——校验/事件记录/全局默认三件套都在宿主）；
  目录读经会话插件（`session/modelCatalog`）；官方 `modelDirectories` 服务随官方插件存亡，
  补位后由自研目录服务替代。
- **配**：禁用官方 `ui-settings-models`；Provider 标签页升级为**配置+展示一体**（9.2）。官方 Models 页退役。
- **运行时**：llm-pi-ai 继续桥接（借产物不 fork）；计费/凭据体检为附带增强。
- 其余官方插件全部原样；`llm-deepseek` 等原生适配器不动。

### 9.2 Provider 配置页（配+展一体）

- **key 后端存储与官方完全一致**：走同一凭据服务、同一 `apiKeyEnv` 命名、同一
  `llm-pi-ai.providers` 配置段——官方配的我们能读，我们配的官方能读，两侧永不矛盾。
- 配置交互完成后，每个 provider 卡片立即显示：**余量**（计费适配器查询）、**可用模型列表**
  （目录数据）、**上下文情况**（context window 等模型元数据）。
- 模型与上下文信息以目录数据为准；provider 支持模型发现接口的，经 API 动态获取并同步进目录
  （落点仍是 `llm-pi-ai.providers` 段，契约不变）。
- **覆盖全量已知 provider，计费一个不漏**（2026-09-14 补充）：Provider 页列出全部已知 provider
  （含未配置项，引导直接配置），适配器清单对齐 CC Switch 调研中「API key 可查」的全集——
  GLM（国内/国际）、MiniMax（国内/国际）、火山方舟、OpenCode Go、ZenMux、OpenRouter、
  SiliconFlow、StepFun、Novita 等；需要 OAuth 登录态的（Claude/Codex/Gemini/Grok/Copilot）
  不在范围内（守 Tier 1：不依赖浏览器登录态）；Qwen Token Plan 仍不做（ToS）。

### 9.3 对标与缺口继承

- 功能对标 CC Switch（源码调研在 `reference/cc-switch/`）：额度窗口展示形态两相验证；
  我们独有的差异项：上游模型自动更新（桥接）。
- **数值与展示口径以 CC Switch 为准，不画蛇添足**（2026-09-14）：它显示什么我们显示什么，
  不展示额外字段（例：Kimi 加油包/充值包余额——口径与 CC Switch 不一致且数据存疑，已移除）。
- §7 缺口继承：G2 `shell.overlay` 待 G3 数据就位；G3 用量统计两条候选路线——事件流监听、
  **会话日志扫描**（cc-switch 已验证可行：免代理、免改宿主、增量解析）；新增候选：
  端点健康测速、故障转移（需调研官方重试中间件的挂法）。

### 9.4 测试环境

- `scripts/test-profile.sh` 一键起测试实例（固定端口 3081、自动开浏览器、
  `DSH_PROVIDER_TEST=1` 时浏览器端打「测」角标——见 `/provider/status` 的 `testMode` 字段）。
- 三态：补位（脚本默认）/ 裸基线（摘掉 profile 里的 dsh-provider 依赖重启）/ 官方完整（3080）。
- 官方模型管理三件套（`llm-pi-ai` / `ui-model-selection` / `ui-settings-models`）由**本插件的
  bundle patch** 统一禁用（`cordis.patch.yml`，对所有挂本插件的 profile 生效）；
  plan-test 的 profile patch 再禁一次，供「裸基线」形态（摘掉 dsh-provider）对照。

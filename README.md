# dsh-provider

给 dsh 提供 LLM 服务的插件（由 dsh-plan 改造而来），三件事：

1. **pi-ai 自动跟进**：盯着 `@earendil-works/pi-ai` 的 npm registry，上游发了新版本就自动下载、装依赖、切换桥接——新模型不用等 dsh 发版。
2. **计费接口**：为各 provider 查额度/余额，Web GUI 输入框旁的额度徽标照旧可用。
3. **模型选择器和设置页 Provider 标签**：选择器带搜索、provider 过滤和余额显示；设置页新增 Provider 标签显示桥接状态与额度明细。

```
 composer:  [额度与余额]  [● Kimi Coding · 余 47%]  [模型 ▾  ⌕搜索]
                                │
                                └─ 点开模型：搜索框 + provider chips（带余额点）
                                   gpt-6-astra       OpenAI · 余 82%
                                   kimi-k2-0905      Kimi Coding · 余 47%  ← 当前
                                   glm-5.3           GLM Coding · 额度已用尽（红）
```

## 界面接管了什么

| 位置 | 做法 |
|---|---|
| composer 模型座位 `conversation.input.model` | 用 **priority 遮蔽**接管：座位是 `single`，官方 `ui-model-selection` 用默认 priority 0 占着，我们注册 `priority: -10`（最小者渲染）。官方插件行保持启用 |
| `/model` 命令 | 官方还在时静默让位（`commandUi` 同名即抛，没有遮蔽）；只有把 `ui-model-selection` 行 patch 禁用后才由我们接管（带余额渲染） |
| 设置页 Provider 标签 | 新增一个 `settings.section` 贡献（list 座位，**不影响**官方 Models 标签） |
| composer 额度徽标 | 保留原有 `conversation.input.right` 座位 |

座位的数据来自官方客户端服务 `ctx.modelDirectories`（目录、当前选择、切换提交、失效刷新都在它手里），
用不了时退回同源 HTTP（`session/modelCatalog`）与会话投影。**注意模块级 `inject` 要一并声明
`remote`、`remote.session`**：官方目录服务的方法绑定到调用方上下文，少声明就会在 `directoryFor()`
里报 `cannot get property "remote.session" without inject`（踩过）。

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
- 升级生效时机：换软链后需重启 dsh（`GET /provider/status` 的 `needsRestart` 会提示）。
  回滚 = 把软链指回旧版本目录。

已验证（2026-09-12）：自动下载 0.85.1 → 桥接加载 → 新目录生效（gpt-6-astra 等 70 个新模型可见）。

## 装法

```sh
# profile 里以 dsh-provider 名字链接（已完成）：
#   ~/.dsh/profiles/web/node_modules/dsh-provider -> /Users/cgeng/Workspaces/dsh-plan
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

每个 provider 一个独立文件，互不依赖，契约统一：

| 文件 | 数据源 |
|---|---|
| `lib/adapters/deepseek.js` | `GET api.deepseek.com/user/balance`（官方文档） |
| `lib/adapters/kimi-coding.js` | `GET api.kimi.com/coding/v1/usages`（sk- key） |
| `lib/adapters/glm.js` | `GET open.bigmodel.cn/api/monitor/usage/quota/limit` |
| `lib/adapters/moonshot.js` | `GET api.moonshot.cn/v1/users/me/balance` |
| `lib/adapters/qwen.js` | 无公开接口，只读说明 |

全部只用各家的 API key，不依赖任何浏览器登录态/token。
加新 provider = 照 `deepseek.js` 写一个文件 + 在 `registry.js` 注册一行。

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
node test/client-smoke.mjs              # 浏览器端接线冒烟（假 loader + 桩 react）
```

### Kimi 控制台接口（仅调研记录，未接入）

控制台的接口能给更可靠的 remaining/窗口占比，但鉴权要网页登录态的 JWT（不吃 sk- key）。
按"不依赖浏览器 token"的原则，插件**不接入**它；逆向结论留在
`research/kimi-console-api.md` 备查。

## HTTP 接口

| 路由 | 作用 |
|---|---|
| `GET /plan/status` | 各 provider 额度快照（60 秒缓存，`?refresh=1` 绕过） |
| `GET /provider/status` | 桥接状态：当前 pi-ai 版本、上游最新版、是否需要重启 |
| `POST /provider/update` | 手动触发一次上游检查 + 更新 |

## 配置

计费部分不用配：provider 从 settings.yaml 的 `llm-pi-ai.providers` 自动发现，key 走
credentials 服务按 `apiKeyEnv` 解析。可选环境变量：

- `DSH_PROVIDER_UPDATE=off` —— 关掉 pi-ai 自动检查（`POST /provider/update` 仍可用）

## 目录补丁（catalog patches）

pi-ai 的模型数据是**静态快照**，官方模型升级后字段会滞后。插件在桥接加载时按「数据文件 → 模型
id → 字段覆盖」修正 vendored 目录（幂等，写在磁盘上，重启 dsh 后生效），条目集中在
`lib/bridge.js` 的 `CATALOG_PATCHES`，**每条必须写 reason（官方文档出处）**，上游 pi-ai 修正后
删掉对应条目即可。当前条目：

| 模型 | 修正 | 依据 |
|---|---|---|
| `kimi-for-coding` | name `Kimi K2.7 Code`→`Kimi K2.8 Preview`；contextWindow `262144`→`1048576` | [Kimi Code 模型文档](https://www.kimi.com/code/docs/kimi-code/models.html)：该 id 已升级为 K2.8 Preview，上下文 1M（pi-ai 0.85.1 仍写 K2.7/256k） |

`/provider/status` 返回 `catalogPatches`，Provider 标签里也会逐条展示（悬停看依据）。

## 后续：实时模型参数增强（TODO）

目前的目录补丁是**静态兜底**；更理想的方案是桥接加载时按 provider 拉上游自己的模型列表，
动态覆盖能拿到的字段，pi-ai 目录继续当 fallback。

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
4. 静态 `CATALOG_PATCHES` 保留作为拉取失败/无实现时的兜底；
5. 拉取带超时（如 5s），失败不阻塞启动。

收益：Kimi 官方升级模型（如把 `kimi-for-coding` 升到 K2.8 Preview、上下文改为 1M）后，
**不用等 pi-ai 发版、不用写静态补丁**，重启 dsh 就自动修正。

## 已知状态（2026-09-14）

- **Provider 标签页重写完成**（真机验证）：
  - CC Switch 式卡片：头部直给余量摘要（coding plan 的 5小时/订阅窗口、API 的余额，绿黄红
    配色 + 紧凑重置倒计时）、官网链接、单卡 ↻ 刷新（悬停显示上次更新时间，实查绕过缓存并同步全局快照）；
  - 二级标签：Provider 卡片列表 / pi-ai 桥接（版本、目录补丁、检查更新收在这里）；
  - 展开面板：掩码 key 提示（宿主派生前3+后4，值不出宿主，一眼认出是哪把 key）、端点、可折叠模型区；
  - 模型列表：ID/名称两列 + 能力徽章（视觉/推理/视频，来自 pi-ai 数据文件）+ 上下文，
    模糊过滤（`ds`/`deapseek` 这类缩写和错拼都能识别），悬浮显示 Cherry 式详情卡
    （上下文窗口/最大输出/思维链档位）；
  - Kimi 会员等级映射为官网套餐名（LEVEL_* → Andante/Moderato/Allegretto/Allegro）。
- **计费适配器补齐到 13 家**（端点与解析对齐 CC Switch 源码调研）：新增 MiniMax / OpenCode Go /
  ZenMux / StepFun / SiliconFlow / OpenRouter / Novita / 火山方舟（AK:SK），修正智谱鉴权头
  （不带 Bearer）；数值口径以 CC Switch 为准，不展示多余字段（Kimi 加油包已移除）。
- **Kimi 凭据错配已修好**（9-13）：凭据体检会对「多个 provider 同一把 key」直接报警。
- **测试环境**：`scripts/test-profile.sh` 一键起 plan-test profile（3081 端口、自动开浏览器、
  `DSH_PROVIDER_TEST=1` 打「测」角标）；三态 = 补位 / 裸基线（摘 dsh-provider）/ 官方完整（3080）。
  plan-test 的 patch 层禁用官方模型管理三件套（llm-pi-ai / ui-model-selection / ui-settings-models）。
- 排查用：浏览器里 `window.__dshProvider` 记录接线状态；`GET /provider/status` 的 `routes` 字段看路由发现。

## 文件

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 宿主入口：挂桥接插件 + 计费/状态路由（/plan/status、/provider/status、/provider/update、/provider/models、/provider/test、/provider/refresh） |
| `lib/bridge.js` | 桥接装载：拷 bundle、管理 pi-ai 软链、目录补丁、require 副本 |
| `lib/updater.js` | 上游更新器：registry 检查、下载、装依赖、切版本 |
| `lib/routes.js` | provider 路由发现（settings + 原生适配器目录合并）+ 显示名/官网链接映射 |
| `lib/model-details.js` | 模型详情：读生效 pi-ai 包的 providers 数据文件（上下文/能力/思维链） |
| `lib/credential-check.js` | 凭据体检：多个 provider 共用同一把 key 时报警 |
| `lib/adapters/*` | 计费适配器（13 家，每家一个文件 + 注册表 + CLI 跑测器） |
| `lib/client.js` | 浏览器端：额度徽标 + 模型选择器 + 设置页 Provider 标签（卡片/模型列表/悬浮详情卡） |
| `lib/settings-source.js` | 直读 settings.yaml 的 llm-pi-ai 段（兜底） |
| `test/*.mjs` | 路由发现、凭据体检、客户端接线三个离线测试 |
| `scripts/test-profile.sh` | plan-test 测试环境一键脚本（起服务 + 打开浏览器） |
| `research/kimi-console-api.md` | kimi 控制台接口逆向记录（未接入） |

`node_modules/@deepseek-ai` 是指向 `~/.dsh/profiles/node_modules/@deepseek-ai` 的符号链接，
供开发时单独 import 用。

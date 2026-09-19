# 本地版补丁说明（dsh-llm-provider-local）

基线：`@dsh-one/dsh-llm-provider` **0.1.0-rc.2**（上游仓库 `imchangchang/dsh-llm-provider`，clone 于
commit `1eb017f2`，2026-09-15）。本目录是**本地固化副本**：所有自定义改动落在 `src/`，
构建产物 `lib/`。**r8 起安装方式切换为 github 安装**——profile 依赖指向 `github:Ztyss/dsh-llm-provider`
（`lib/` 随仓库分发，见 `~/.dsh/profiles/web/package.json`），本目录保留为开发与档案副本。

> 产物文件名带 `-r7`：`file:` 依赖同名 tgz 换内容时 pnpm 不会重新解析，改了内容就换新文件名（`-local.tgz`、`-local-r1..r6.tgz` 已删）。
> 迭代：r1 = 窗口组分割线（#2 延伸）；r2 = 能力链路补上「适配器自报」（modlens 合成 provider 的视觉徽标，见 #5）；
> **r3 = 链路删除安全修复**（`rmSync` 删 Windows junction 会连坐删掉目标内容 → 每重启一次 DSH 就把 dsh 自带的 pi-ai 清空一次；见下方「新①」）
> **＋ 补上官方契约必填的 `/model` 贡献 `available`**（上游 issue #7）。
> **r6 = 第二次事故的结构性修复**：桥接目录与它那套链**搬出插件包**（插件包会被别人整棵递归删掉），
> 顺带补 dsh 自带 pi-ai 的安全副本与自愈（见文末「2026-09-19 第二次事故」）。
> **r7 = 按用户决定收敛**：不再为 dsh 自带那份 pi-ai 留备份/自愈（那份与当前版本一致，没必要多存 6 MB）；备份/补缺路径**只服务插件自管的 vendor 版本**（未来切到「插件管理的更新版 pi-ai」时天然启用）。全机链接审计脚本按同一批注未保留。
> **r8 = 双线合并（2026-09-19）**：另一环境（`Ztyss/dsh-llm-provider` fork）独立实现了同一批 issue + P0，两边全量对比后合流——
> **底座取本地**（安全区工作区、链感知删除、四档候选、`DSH_PROVIDER_UPDATE` 门控），
> **整组吸收远程**：patch-condition 条件禁用（`!!js` 表达式，pi-ai 健在才禁官方条目，fail-open——补上本地静态禁用的「宿主不可启动」放大器）、
> pi-ai-source 完整性检测与 npm pack 恢复指引、候选级诊断（CandidateProbe/RejectedCandidate.path）、
> provider-edit 卡片编辑（修掉本地 add() 整段覆盖的数据丢失洞）、i18n 双语字典、lib/ 入库一键安装、README 重写。
> **修掉远程带入的 P0 残留**：其 probePiAi 的 `rmSync(recursive)`（事故原句，node 24.18.1 实测第二次启动清空宿主 pi-ai）在合并树中不复存在。
> 合并后本地安装切换为 **github 安装**（`github:Ztyss/dsh-llm-provider`，profile 依赖），tgz 产物不再需要。
> 验证：15 项测试链全绿；host-safety 22/22 双运行时（node 24.14 / electron 24.18.1），新增不变量「**安装插件包整包零链接**」；
> ui-harness 6 张截图人工复核（弹层含导出按钮、卡片 ✎ 编辑、桥接页停用态）。合并提交 `27b66ea..71b194f` 已推 `Ztyss/main`。

## 本机新增的补丁（对应给作者提的 issue）

| Issue | 症状 / 诉求 | 本地实现 | 主要文件 |
|---|---|---|---|
| **#1** | 「模型服务」页缺逐模型清单编辑：DeepSeek 内置 3 个模型没法只留 1 个；官方 Models 页被 `cordis.patch.yml` 禁用后无替代 | 卡片模型区新增入口 **「配置模型」** → 逐模型清单编辑器（勾选 / 自定义 ID / 上下文 / 最大输出 / 视觉 / 视频 / 跟随目录），保存走新路由 `POST /provider/set-models`，写入 `llm-pi-ai.providers.<id>.models`（**单键** `op:"set"`，不再整段覆盖 route） | `src/client/settings.ts`（`ModelListEditor` / `buildEditRows` / `modelEditRow`）、`src/index.ts`（`/provider/set-models` + `sanitizeDeclaredModels`）、`src/routes.ts`（`ProviderRoute.models`）、`src/client/styles.ts` |
| **#2** | OpenCode Go 月窗口在卡片头部显示成 `7d`（出现两个 7d）；7d 与 30d 之间没有分割线 | `shortWindowLabel` 增加「月 / 30 天 / month → `30d`」一档，且**先判月再判周**（原逻辑的裸 `每` 会把「每月窗口」吞进 7d）；`headlineChips` 改为**按档位分组**（5h / 7d / 30d，其余保持出现顺序），**组与组之间都画分割线**，输入乱序也规整成 5h→7d→30d | `src/client/format.ts` |
| **#3** | 删除 provider 的二次确认挡不住误删：确认按钮与 ✕ 同槽位、不提示代价、无撤销 | 改成遮罩弹层 `DeleteProviderModal`：列清「路由 ID / 将删除的配置（含模型清单）/ 将删除的凭据 / 影响」，红底不可撤销提示，危险按钮单独配色，取消是默认落点 | `src/client/settings.ts`、`src/client/styles.ts`（`.pv_mask/.pv_modal*`） |
| **#4** | 自更新往插件目录塞一整份 pi-ai（82 MB）+ 178 MB npm 缓存，且与宿主自带同版本重复 | **自动下载默认关闭**：`UPDATES_ENABLED = process.env.DSH_PROVIDER_UPDATE === 'on'`，启动检查与「检查更新」按钮都不再发请求；桥接直接用 dsh 自带那份 pi-ai（`vendor/` 只剩 123 KB 的官方适配器 bundle 副本 + 一个 0 字节 junction）；`/provider/status` 新增 `updatesEnabled` / `localBuild` / `vendorPiAiVersions` | `src/updater.ts`、`src/index.ts`、`src/client/settings.ts`（桥接页显示「本地版：pi-ai 自动下载已停用」） |
| **#5** | 能力徽章只有 pi-ai 目录一条链路，不读 route 声明的 `input` → 自定义模型 id 永远没有「视觉」标签 | 能力链路改为 **pi-ai 目录 → route 声明 → 适配器自报 → 查不到就不打**：① `withDeclaredModels()` 用声明补齐目录查不到的模型（`source: 'declared'`，详情卡标注来源）；② **`withAdapterModels()`（r2 追加）**：对 pi-ai 目录数据里没有的 provider（modlens 的 `modlens-<上游>` / `deepseek-modlens` 这类**合成 provider**）问 `llm.listProviders()` → `llm.listModels()` → `llm.resolveModelInfo()`，把适配器自报的 `inputModalities` / `context.contextWindow` / `defaultMaxTokens` / `reasoning` 按 **provider+id** 补进详情（`source: 'adapter'`；12s 总预算 + 单调用超时，只问目录里没有的 provider）；③ 详情索引改 **`provider+id`**（裸 id 兜底），同名模型不串家，座位与设置页统一用它 | `src/model-details.ts`、`src/types.ts`（`LlmService` 扩 `listProviders`/`listModels`/`resolveModelInfo`）、`src/index.ts`（`adapterModelInfos()` + `/provider/models` 改异步）、`src/client/data.ts`（`detailKey`/`lookupDetail`/`detailsOfProvider`）、`src/client/settings.ts`、`src/client/model-seat.ts`、`src/client/types.ts` |

| **新①**（本地新发现，**未提 issue**） | 重启 DSH 后 **dsh 自带的 pi-ai 被清空**：报「找不到可用模型」；把插件卸掉再重启，官方 `llm-pi-ai` 也加载不了 → **DSH 起不来** | 根因 = 上游 `bridge.ts` 用 `rmSync(link, { recursive: true, force: true })` 删 **Windows 目录 junction**。**Node 24.15 起该调用会把 junction 目标目录的内容一起删掉**（本机实测：PATH 上的 node 24.14.0 安全，DSH 自带运行时 electron 43.3.0 / node 24.18.1 **连坐删除**）。插件的候选 `dsh` 会把链指向 dsh 自带那份 pi-ai，而探针链每轮启动都「先删后建」（`probePiAi`），于是**每启动一次 DSH 就清空一次目标**；`setPiAiLink` 重定向、`clearPiAiLink` 回退同样中招。修法：新增 `removeLinkOrDir()` —— 先 `lstatSync`，是链就 `unlinkSync`（只摘链、目标一个字节不动），只有真目录才递归删，且递归删前必须确认路径在 `vendor/` 内 | `src/bridge.ts`（`removeLinkOrDir` + 3 处调用点）、`test/link-removal.mjs`（新增回归，9 项） |

| **#7**（上游作者本人提的 issue，本地先修） | 点不动的「＋」：`/model` 贡献漏了官方契约必填的 `available` → 官方 `CommandUiRuntime.candidates()` 对每条贡献都直接调 `available(session)`，一抛**整批** `/` 候选（含 composer 左下那枚「＋」）全废 | 按官方 `ui-model-selection` 的语义补 `available`：子代理会话（`sessions.subagentAddress(id) !== undefined`）不提供切换；**实现永不抛**——`sessions` 缺失、`sessionId` 不是字符串、`subagentAddress` 自己抛错，一律放行返回 `true`（契约里没有防御，抛一次就是整批候选消失） | `src/client/command.ts`、`src/client/types.ts`（`CommandContribution.available` + `SessionsFace.subagentAddress`）；回归 = `test/ui-harness/drive.mjs` 第 0 步（4 种 session：null / 普通 / 子代理 / 抛错） |

**#6 不在实现范围**：那条是本地 agent 未经用户确认代发的 issue，用户已要求撤回（已关闭）。

## 与上游的边界（升级时怎么迁）

- 改动集中在上面 9 个 `src/*.ts` 文件，全是**增量**：新函数 / 新分支 / 新组件，没有删除上游行为。
- 升级步骤：`npm pack dsh-llm-provider@<新版> --ignore-scripts` 展开替换本目录 → 按上表逐项重打
  → `node node_modules/tsdown/dist/run.mjs`（见下）→ `pnpm pack` → 换 tgz 文件名（`-r1`）→ 改 `file:` 依赖 → `pnpm install`。
- **不要把 `vendor/` 提交或复制进 tgz**：`package.json` 的 `files` 只含 `lib/` 与 `cordis.patch.yml`。

## 构建 / 测试（本机实测可用的命令）

```bash
# tsdown 的 npm 包装在本机 PATH 下报 '""' 不是内部或外部命令，直接跑它的入口：
node node_modules/tsdown/dist/run.mjs

# 上游自带 7 个离线测试
for t in routes credential-check cordis-patch pi-ai-probe provider-presets vendor-status client-smoke; do node test/$t.mjs; done

# 本地补丁回归（20 项：30d 标签 / 能力链路 / provider+id 索引 / 停用更新的文案）
node test/local-patches.mjs

# 宿主端集成（A 组：真 DSH_HOME 下桥接装载成功 + vendor 无 pi-ai + 零网络请求）
PLUGIN_DIR="C:/Users/39244/.dsh/profiles/web/node_modules/@dsh-one/dsh-llm-provider" node test/host-integration.mjs
# 宿主端集成（B/C 组：降级模式跑路由契约与写入面）
HOST_TEST_DEGRADED=1 node test/host-integration.mjs

# 客户端渲染验证（headless Chrome + CDP，6 张截图 + /model 贡献契约断言：null / 普通 / 子代理 / 抛错 四种 session）
# 装了插件时默认读 profile 里那份 client.js；插件处于卸载态时指向本地产物：
CLIENT_SRC="C:/Users/39244/Documents/Deepseek-Harness/dsh-llm-provider-local/lib/client.js" node test/ui-harness/drive.mjs

# ★ 链路删除安全回归（9 项）——必须在 DSH 自己的运行时下也跑一遍：
#   危险只出现在 Node ≥24.15；PATH 上的 node 24.14 跑出来是「安全」，会给出假绿灯
node test/link-removal.mjs
ELECTRON_RUN_AS_NODE=1 "D:\ProgramFiles\DSH Desktop\DSH Desktop.exe" test/link-removal.mjs

# ★ 第二次事故的回归（22 项）：插件包被整棵递归删除时 dsh 那份 pi-ai 必须完好、
#   副本可重建、残状态只补缺不删东西、装好的包内链只指向包内或安全区。同样两个运行时都跑：
node test/host-safety.mjs
ELECTRON_RUN_AS_NODE=1 "D:\ProgramFiles\DSH Desktop\DSH Desktop.exe" test/host-safety.mjs
```

`test/ui-harness/` 里的 `mini-react.js` 是极简 react 垫片（只实现插件用到的 6 个 API），
用来把真实 `lib/client.js` 渲进 DOM；**它只用于验证，不参与打包**。

## 本机环境事实（2026-09-17）

- 生效的 pi-ai 只有 dsh 自带那份：`D:\ProgramFiles\DSH Desktop\resources\app\node_modules\@earendil-works\pi-ai`
  （0.85.1，595 文件）；装完插件后全机仍是 **2 份**（另一份是全局 npm dsh 自带的，Desktop 不用）。
- 插件运行时目录（重启后由 DSH 创建）：`~/.dsh/profiles/web/node_modules/@dsh-one/dsh-llm-provider/vendor/`
  = `llm-bridge/`（官方 adapter bundle 副本，~113 KB）+ `status.json` + `llm-bridge/node_modules/@earendil-works/pi-ai`（junction）。
  **没有 `vendor/pi-ai/`**，也没有 `.npm-cache`。
- **线上实测（2026-09-17 22:50 那次启动，正式 Desktop 实例）**：
  `[I] [provider] llm bridge active on pi-ai 0.85.1` +
  `[I] [provider] 本地版已停用 pi-ai 自动下载，跳过启动检查（vendor/ 不落地 pi-ai）`
  —— 本地版在正式实例里生效；对照 09-16 22:08 的旧日志是 `[pi-ai updater] 下载 @earendil-works/pi-ai@0.85.1 ...`。
- ⚠️ 换新 tgz 时 `pnpm install` 会**整体替换** node_modules 里的包目录，运行期生成的 `vendor/` 会一起没：
  对正在跑的进程无害（bridge 模块已在内存里），**下次启动会重新生成**。
- **2026-09-17 追加（r2）：modlens 视觉徽标的根因与修法**。modlens（`@liustack/modlens`）注册的是
  **合成 provider**（`modlens-<上游>` / `deepseek-modlens`），它的模型能力三处都拿不到：
  ① pi-ai 的 39 个数据文件里没有这个 provider；② 它不是 `llm-pi-ai` 路由，settings 里没有 `models` 声明；
  ③ 官方目录 RPC `session/modelCatalog` 只下发 `id/name/description/reasoning`
  （`dsh-api-session-controller` 的 `buildModelCatalog()` 把 `inputModalities` 丢了，虽然宿主侧
  `llm.resolveModelInfo()` 里有）。**只有适配器自己知道**它给每个模型补了 `image`（`withVision`，
  模型名后缀 `(modlens vision)`）。r2 把这条链路补上：宿主 `/provider/models` 里新增
  `adapterModelInfos()`（问 llm 服务的三个方法）→ `withAdapterModels()` 合并 → 座位与设置页按
  `provider+id` 查详情。验证：宿主集成测试新增 6 项断言全过；截图
  `06-seat-model-panel-modlens-vision.png` 里 `modlens-opencode-go / deepseek-v4-flash` 已带「视觉」徽标。
  ⚠️ 这次改了宿主（`index.js`/`model-details.js`）→ **要重启 DSH 才生效**（客户端部分刷新即可）。

## 2026-09-18 事故：「重启后 pi-ai 丢失」（已定位 → r3 修复）

**现象**：重启 DSH → 「找不到可用模型」；把插件卸掉再重启 → DSH 直接起不来（日志：
`Cannot find package 'D:\...\app\node_modules\@earendil-works\pi-ai\index.js' imported from D:\...\app\lib\index.js`，
栈底是 `legacyMainResolve`；诊断包 `diagnostics-1789738679931-*.zip` 里 `startup.stage.failed: host-boot`）。

**机制（同一句调用，两个运行时两种结果）**：
`rmSync(junction, { recursive: true, force: true })`

| 运行时 | 结果 |
|---|---|
| PATH 上的 node 24.14.0 | 只摘链，目标内容完好（所以本地测一直是「安全」的） |
| **DSH 自带 electron 43.3.0 / node 24.18.1** | **junction 目标目录的内容被一起删掉**（只剩空目录） |

插件的 `dsh` 候选会把链指向 dsh 自带那份 pi-ai，而 `probePiAi()` **每轮启动都先删旧探针链再建**
（`bridge.ts` 的 3 处 `rmSync`）→ **每启动一次 DSH 就把 dsh 自带的 pi-ai 清空一次**。这就是「重启后才丢」的
原因；`setPiAiLink` 重定向、`clearPiAiLink` 回退到内置依赖时同样中招。回归测试 `test/link-removal.mjs`
第 0 项就是把这个对照打出来，第 1/2 项锁死修复后的行为（两个运行时都必须绿）。

**卸载插件后为什么连 DSH 都起不来**：official `llm-pi-ai` 条目被 patch 层禁用期间，模型是插件在管；
插件一卸，官方条目第一次去加载那份**已经被清空的** pi-ai → 插件树加载失败 → 启动失败。

**那次崩溃时磁盘上到底是什么形态**：用 DSH 运行时对 7 种 package.json/目录组合做对照，只有
「**没有 `main`、没有 `exports`、根目录也没有 `index.js`**」会产出与线上**逐字相同**的报错；
而出厂安装包（`%LOCALAPPDATA%\dsh-plugin-desktop-updater\installer.exe` 2.0.11）里那份是
**有 `main` 也有 `exports`**（1988 B）。→ 磁盘上那份 package.json 是**被换过的**（本地早前「补一个
package.json」式的修法），不是出厂文件、也不是清理动作能产生的形态。**这一段无法归因到具体是谁写的**，
记在这里备查。

**本机现状（已验证可用）**：
- `app\node_modules\@earendil-works\pi-ai` = npm 版内容（751 文件；多出的 `.d.ts`/`.map` 无害）
  ＋ 用户加的根 `index.js`（**冗余**：有 `exports`+`main` 时 Node 根本不会走它）
  ＋ 已从安装包补回的嵌套 `node_modules/@smithy/node-http-handler`（**4.7.3**；缺它时 pi-ai 会解析到
  app 扁平层的 4.10.0，与出厂语义不一致）。
- 四个子路径导入在 DSH 运行时下全部 OK：`.`（48 导出）/ `compat` / `providers/all` / `api/anthropic-messages`。
- **`-local-r2.tgz` 已删除**：那份带着「连坐删除」的雷，别再装它的任何副本。

## 2026-09-19 第二次事故：「又丢一次，卸载后 DSH 起不来」（结构性修复 = r6）

**现象链条**（DSH 宿主日志 `%APPDATA%\DSH Desktop\logs\host\dsh-2026-09-19.log`）：
`22:58:13 [I] [provider] llm bridge active on pi-ai 0.85.1`（r3 装上后那次启动是好的）
→ `00:25:15 [W] [provider] llm bridge 不可用…没有能用的 pi-ai：`（候选列表**空的**：`resolvePackageRoot`
要求 `package.json` 存在，说明 dsh 那份 pi-ai 目录**已经被清空**）
→ `00:28:47 [E] [host-resolved-root-include] … Cannot find package '<app>\node_modules\@earendil-works\pi-ai\index.js'`
（官方 `llm-pi-ai` 条目加载失败 = 起不来）。

**根因（与 r3 那次同一个机制家族，但触发者不同）**：r3 修的是「插件自己去 `rmSync` 一条 junction」；
这次是**别人**在删东西——插件把「指向 dsh 安装树」的链放在**插件包目录里面**：

```
profiles/web/node_modules/@dsh-one/dsh-llm-provider/vendor/llm-bridge/node_modules/@earendil-works/pi-ai
   → junction →  dsh 安装树里的 pi-ai
```

而插件包目录是**整个生态都会整棵递归删除**的地方（包管理器安装/卸载、插件市场热卸载、宿主清理）。
在 DSH 自带运行时（electron 43.3.0 / node 24.18.1）里，递归删除**容器**目录同样会顺着 junction 连坐
目标——本机实测（`test/host-safety.mjs` 第 1 项就是把这条当回归锁死）：

```
rmSync(<插件包目录>, { recursive: true, force: true })   →  目标目录存在，但内容被清空
```

于是：**市场里卸载/重装一次插件 → dsh 自带 pi-ai 被清空一次 → 下次重启（或卸载插件后）DSH 起不来**。
这也解释了用户那句「我卸载 llm-provider 插件后，再次重启，dsh 崩溃无法打开」——崩在卸载那一下，
不是重启那一下。

**旁证 / 排除**：同一套实验里 `pnpm remove`（含用 DSH 自带的 pnpm 在 DSH 运行时下执行）**不跟进**
junction，目标是完好的 → 不是 pnpm 干的；宿主与市场里确实存在按目录走的 `rmSync(..., {recursive:true})`
调用面（`profile-manager` / `profile-channel-admission` / `dshmarket` 等），谁来删不重要——
**只要链在插件包里，被删就是 dsh 安装树倒霉**。

**r6 的修法（结构性）**：
1. **桥接目录搬出插件包**：`vendor/llm-bridge/` → `$DSH_HOME/llm-provider-bridge/llm-bridge/`（DSH_HOME 下的
   「安全区」，包管理器/市场都不碰）。插件包里现在**一条链都没有**（`test/host-safety.mjs` 第 6 项直接扫装好的包）。
2. **链田**（`syncBridgeLinks`）：桥接副本要的包全铺成链——`@earendil-works/pi-ai` 指中选那份，
   `@deepseek-ai/*`（bundle 的 bare 导入，7 个）从原 bundle 位置解析后各指一条。链指向没变且目标在就不重建。
3. **pi-ai 的链指向真目录，不指副本**：pi-ai 自己的依赖（`typebox`、`openai`、`@anthropic-ai/sdk`…）靠就地的
   `node_modules` 链解析；本机实测把 pi-ai 复制到 `~/.dsh/` 下再导入，直接
   `Cannot find package 'typebox'` —— 所以 pi-ai **必须留在 dsh 安装树里**，这也正是「另一个 agent 把 app 的
   pi-ai 换成指向 `~/.dsh/pi-ai-patched` 的 junction」之后桥接起不来的原因（依赖解析跟着链走到安装树外面去了）。
4. **安全副本 + 自愈**：启动时对「dsh 自带那份」留一份副本（`~/.dsh/llm-provider-bridge/pi-ai/<版本>/`，
   751 文件 ≈ 6 MB，写一次）；若那份出现「目录在、入口没了」的残状态，用副本**只补缺、不删东西**修回去；
   若它是一条别人挂的链（依赖会解析到链外），则摘链换成真目录。补/换都会在日志里留 `[W]` 一行。
   本插件挂在根 include 之前，所以这条自愈能把「起不来」救回「能启动」。
5. **递归删除统一走 `removeTree`**（自己走目录、遇链只 `unlink`），`removeLinkOrDir` 与 updater 的
   `rmSync(target, {recursive:true})` 都换掉了——插件里再也没有「可能跟进 junction 的递归删除」。
6. 新增候选档 **`dsh-app`**：直接从 `process.execPath` 推 `resources/app/node_modules/@earendil-works/pi-ai`，
   优先于「沿 bundle 解析链找到的那条」——不再依赖用户手工做的 `profiles/node_modules` junction 农场
   （那条链没了桥也能找到 pi-ai，实测 `piAiSource: "dsh-app"`）。

**本次同时做的环境修复（已征得用户同意范围内，可就地回退）**：把 `app\node_modules\@earendil-works\pi-ai`
从「指向 `~/.dsh/pi-ai-patched` 的 junction」**换回真目录**（747→751 文件；`unlinkSync` 摘链 + 从那份副本复制
文件进去，`.dsh/pi-ai-patched` 原样保留）。不换的话，桥接体检会卡在 `Cannot find package 'typebox'`。

**验证**：`test/host-safety.mjs` **22/22** 在 PATH node 24.14.0 与 DSH 运行时（electron 43.3.0 / node 24.18.1）
各跑一遍全绿（含「删插件包目录后 dsh 那份完好」「副本可重建」「只补缺不删东西」「链田/包装完性」）；
上游 7 个离线测试 + 24 项本地回归 + `test/link-removal.mjs`（两个运行时）全绿；装好后的实机 `loadBridge()`
在 DSH 运行时下返回 `{ok:true, source:"dsh-app", version:"0.85.1"}`，装好的包内**链数 = 0**。

## 2026-09-19 事后全机梳理（链接与残留）

全机链接做过一次性梳理（当时的审计脚本按用户决定未保留，下述数字来自那次输出）：

| 类别 | 数量 | 性质 | 处置 |
|---|---|---|---|
| 危险链：`profiles/node_modules/**` → DSH 安装树 | 549 | **不是事故残留**，是 DSH 官方 boot 装配（`@deepseek-ai/dsh-app-boot` 里带 `mklink`/module-fallback 逻辑；`.dsh-module-fallback/node_modules/**` 那 173 条好链同源） | **保留**：删了 profile 就解析不到宿主依赖。但它证明了「整机有成片的 junction 指向安装树、且它们躺在会被包管理器整棵删除的目录里」——**类同 pi-ai 那次的系统性隐患**，值得作为一条上游 issue（非本插件责任） |
| 悬空链（坏链） | 241 | 另一个 agent 把它临时解包的 `%TEMP%\opencode\asar-209\**` 指给了 `profiles/web/node_modules/@deepseek-ai/*`（≈240 条），目标随临时目录消失 → 全成死链；+1 条是插件 `r6` 改名后遗留的旧探针链 | **已摘**（`--fix`，只 `unlink`） |
| 好链 | 173 | DSH module-fallback（162）+ 插件链田（8）+ 当前探针（1）+ 其它 | 保留 |

同时清掉的事故残留：`profiles/node_modules/@earendil-works/pi-telemetry`（同类多余的 junction，目标 19 文件核对无损）、
`profiles/node_modules/@earendil-works/pi-ai`（上一轮已摘）、`~/.dsh/pi-ai-patched`（12 MB 重复拷贝，已不存在）、
`llm-provider-bridge/llm-bridge/.probe-dsh`（stale 探针目录）、`%TEMP%\opencode\` 里那两份 pi-ai 解包 + tarball（12 MB）。
保留：插件安全区（生产状态）、`%TEMP%` 里别的程序/别的 agent 的脚本与诊断目录、DSH 自己的 `dsh-page-*`/`dsh-spill-*` 等。
清理后复验：审计 **悬空链 0**；`findPackageJSON('@earendil-works/pi-ai', app/lib/index.js)` 仍指向安装树那份；
实机 `loadBridge() → {ok:true, source:"dsh-app"}`；安装树 pi-ai 与安全副本各 751 文件。

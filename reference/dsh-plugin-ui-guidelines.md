# dsh 插件 UI 风格规范（整理版）

> 来源：dsh 官方文档与源码中散落的插件 UI 指导，加上 dsh-provider 插件开发中的实测验证。
> 给后续所有插件当统一规范用。**每条规则标注出处**，与官方演进对账时回源头核。
> 整理日期：2026-09-14（dsh 0.1.5-rc.2 源码 / 0.1.2-rc.1 运行体验证）。

## 0. 官方指导的存在性

官方**没有**一份叫「插件 UI 规范」的独立文档，指导散在 5 处，合起来正好构成完整规范：

| 来源 | 覆盖 |
|---|---|
| `docs/cookbook/adding-a-settings-card.md` | 设置页卡片的官方配方（命名空间/installSection/settingsScope/打包） |
| `docs/subsystems/slots.md` | Slot 体系契约（生命周期/基数/priority 语义） |
| `packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md` §Themes and styles | 样式改动的作用域决策树 |
| `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` `CLIENT_NOTES` | 所有浏览器半区贡献的通用规则（逐条硬约束） |
| `packages/client/ui-theme/src/styles/design-platform.css` | 主题 token 的唯一定义源（深浅色两套值） |

## 1. 分层决策（SKILL.md §Themes and styles）

新 UI 需求按此顺序决策，**能下层不上层**：

1. **先选 Slot**——可见内容必须先找座位（`settings.section` / `settings.plugin.item` / `conversation.input.right`…），座位清单与契约见 `slot-catalog.ts`。
2. **再定局部 CSS**——包自己的组件：CSS 走 `styles.insert(css)`（动态插件运行时内置；静态 classic-script 插件的手写 `<style>` 标签是等价实现，`createElement('style')`+`head.append` 同源），**颜色必须走主题变量**。
3. **最后才全局 token 覆盖**——真要改全局主题：先 `Theme.listTokens`，再 `Service.listService` 查 theme 服务，每个覆盖都要给深浅两套值，保留 disposer。

红线：**不许**操作 `document.body`、`window`、硬编码产品 DOM 选择器。主题服务改 token 不建 UI，Slot 建 UI 不动主题——两层各司其事。

## 2. 标记与结构（CLIENT_NOTES 硬约束）

- UI 只能经 `ctx.slots.register(options, Component)` 贡献；`inject: ['slots']` 必须声明，否则座位被扣留。
- 每次注册包在 `ctx.slots.inject(key, () => ctx.slots.register(...))` 里——slot 随声明者的挂载周期生灭，inject 在声明 live 时跑、owner 重挂时重跑。
- **classic-script 插件不能 import 任何东西**（设计系统组件够不着）：全部 `React.createElement` 手写标记。
- 组件收到的 framework props（如 `useSessions(selector)`）按 scope 给，优先用注入面数据而不是自己再拉。
- 失败注册会进浏览器半区的 load report（`cordis_inspect what:"temporary"` 读回）——座位没生效先查它。

## 3. 颜色：主题变量表（design-platform.css 实测值）

**禁用字面颜色**（状态色除外），深浅色全靠变量。常用 token（深色值 / 浅色语义）：

| 用途 | Token | 深色 | 说明 |
|---|---|---|---|
| 页面底 | `--dsw-alias-bg-base` | #1b1b1d | 比卡片暗一档 |
| 卡片/面板 | `--dsw-alias-bg-layer-1` | #232324 | 一般卡片底 |
| 插件卡（PluginCard 蓝本） | `--dsw-alias-bg-layer-3` | #353638 | 9-15 起我们的 Provider 卡片按官方 PluginCard 1:1，底用 layer-3（展开态切 layer-2） |
| 内嵌/输入框 | `--dsw-alias-bg-layer-2` | #2c2c2e | 输入框、只读框、进度轨道 |
| 弹层菜单 | `--dsw-specific-menu` | #353638 | 下拉/菜单/Tooltip 底 |
| 主文字 | `--dsw-alias-label-primary` | #f9fafb | |
| 次文字 | `--dsw-alias-label-secondary` | 中灰 | 描述、悬停升级色 |
| 弱文字 | `--dsw-alias-label-tertiary` | 暗灰 | 时间戳、辅助信息 |
| 边框 | `--dsw-alias-border-l1` / `-l2` | | l2 比 l1 深（更可见） |
| 品牌色/链接/聚焦 | `--dsw-alias-brand-primary` | #f9fafb | 深色下是近白！链接别预期是蓝 |
| 行/卡片悬停 | `--dsw-alias-interactive-bg-hover-solid` | #353638 | **行级悬停唯一正确选择**（官方 Models 页/ToolRow 同款） |
| 小按钮/ghost 悬停 | `--dsw-alias-interactive-bg-hover` | #ffffff14 | 图标按钮、文字按钮的淡色悬停 |
| 阴影 | `--dsw-elevation-prominent` | | 弹层阴影 |
| 危险 | `--dsw-alias-state-error-primary` | | 删除/错误 |

> token 定义在容器上不在 `:root`——`getComputedStyle(document.documentElement)` 读不到，
> 要从页面内元素读。读法见 §7。

**我们踩过的坑（反面教材）**：`--dsw-alias-bg-l1` / `--dsw-alias-fill-l1/l2` / `--dsw-alias-border-active`
这些名字是**猜的，不存在**——亮色下 fallback 恰好是浅色没穿帮，深色下白底吞浅色文字。取 token 必须
去 `design-platform.css` 里核实，不许凭命名直觉。

## 4. 交互模式（与官方组件逐字节比对后的实测规范）

| 场景 | 规范 | 依据 |
|---|---|---|
| 模型行/列表行/卡片内行悬停 | `interactive-bg-hover-solid`（深色 #353638，一步可见） | ui-settings-models `ModelsSection.module.css:166` 等 7 处官方用法 |
| 图标按钮（✕ ↻）/ghost 按钮悬停 | `interactive-bg-hover`（8% 淡色） | ui-primitives `Button.module.css:48,62` |
| 可展开卡片头部 | **无底色悬停**，反馈 = 手型指针 + Chevron 变色；Chevron 用 `⌄/⌃`，不用 ▾/▸ | 官方插件页卡片（终端/Agent 循环）实测 |
| 卡片容器 | **直接抄官方 PluginCard.module.css**：0.5px `border-l4` 边、16px 圆角、`bg-layer-3` 底（展开态切 `bg-layer-2` + 边框 `label-dimmed`）、头部 14×16 居中、15px/600 标题、13px tertiary 描述、14px Chevron **rotate(180°) 展开**（不换手型）、body 0.5px `border-l2` 分隔线内缩 16px、过渡 .16s | `ui-settings-plugins/src/client/PluginCard.module.css` 全量 |
| 选中/当前行 | hover-solid（与悬停同灰，靠「当前」标签区分） | 实测取舍 |
| 危险操作（删除确认） | 红字按钮 + 灰字取消，收在一个 `border-l1` 小框里 | 避免误触的二次确认 |
| 可点区域嵌套 | **禁止 `<button>` 套 `<button>`**（非法嵌套 + React 告警）——外层改 `<div role>` 或把内层按钮挪出 | HTML 规范 |

## 5. i18n 规范

- 注入 `'locale'`，`ctx.locale.register(ns, { zh, en })` 注册扁平字典，`ctx.locale.bind(ns)` 得 `t`，
  导航/标签用 `label: () => t('key')` thunk（语言切换实时跟随，官方 ui-settings-models 同款）。
- **健壮性三件套**（我们踩坑换的）：
  1. `t` 必须声明在**工厂作用域**（组件/label 闭包共享），声明在 `apply()` 里渲染即 `ReferenceError` 整个 section 空白；
  2. `register` 包 try/catch——客户端热重载二次 apply 会抛 `already has locale`，此时旧字典仍在，**继续 bind**；
  3. 永远留本地字典兜底（按 `<html lang>` 判语言），register/bind 全挂也能出文案。

## 6. 设置页卡片的官方配方（cookbook 摘要）

两条路：
- **`settings.section`**（整页标签，list 座位，带 `id/order/label`）——dsh-provider 用的这条；
- **`settings.plugin.item`**（插件配置标签内的 keyed 卡片，`key` = 你的 settings 命名空间，
  Host 服务该命名空间才渲染）——更贴近「插件配置自己」的心智。

写配置走 `ctx.settingsScope`（`settingsScope.bind({namespace})`）：快照含 resolved/base/user 三层，
`scope.set(field, value)` / `scope.unset(field)` 单字段写，**revision 围栏**防并发覆盖。
敏感字段 `role('secret')` 不上任何响应；凭据引用走 `credentials` 域。Host 半区用
`ctx.settings.installSection(ctx, ns, Config, config, { validate, setSource, onChange })` 挂节。

## 7. 验证方法（这套规范怎么保真）

1. **渲染桩**（离线）：假 `__ModuleLoader__` + 桩 react + 桩 ctx，直接调用组件函数执行渲染路径，
   任何 `ReferenceError/TypeError` 当场暴露——比浏览器报错再翻日志快得多（`test/client-smoke.mjs` 模式）。
2. **webbridge 端到端**：真机 Chrome 开页面 → CDP `Input.dispatchMouseEvent` 触发**真实 `:hover`**
   （合成事件不触发 :hover）→ `getComputedStyle` 读悬停底色与官方组件逐字节比对
   （我们实测 hover-solid = rgb(53,54,56) = 官方设置行同款）。
3. token 核验：`getComputedStyle(pageElement).getPropertyValue('--dsw-...')`——注意从页面内元素读，
   `:root` 上是空的。

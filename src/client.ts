/**
 * dsh-provider 浏览器端。
 *
 * 挂在 composer 的 `conversation.input.model` 座位：模型选择器（当前模型 + 思考强度）。
 * 额度数据来自宿主端同源路由 `GET /plan/status`；
 * 当前 provider 从会话投影读；切换通过同源 /api/session/selectModel RPC 提交。
 *
 * 这个文件是源；`lib/client.js` 由 tsdown 产出，外面那层 window.__ModuleLoader__.load 外壳
 * 是构建配置里的 banner/footer/intro（跟官方插件同一套办法），源码里不写。
 */
import react from 'react'
import type { AnyRecord } from './types.js'
import type { BalanceRow, QuotaWindow } from './adapters/shared.js'

/* ==================== 类型 ====================
 *
 * 浏览器端只 import 宿主给的 react（仓库里没装 @types/react，按动态对象用）；
 * 其余形状都是宿主/自家路由下发的 JSON，按「我们用到的那几样」就地声明，
 * 不引 dsh 的内部类型（理由见 types.ts 开头那条原则）。
 */

/** 一个 provider/model/reasoningEffort 选择：会话投影、目录 current、提交载荷共用。 */
interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** 模型声明的思考强度档位表：档位 id 列表 + 默认档。 */
interface CatalogReasoning {
  efforts: string[]
  default: string | undefined
}

/** 目录里的一个模型（当前选择回显、模型面板、模型行都用它）。 */
interface CatalogModel {
  id: string
  name: string
  contextWindow?: number
  reasoning?: CatalogReasoning
}

/** 目录里的一个 provider 分组。 */
interface CatalogGroup {
  id: string
  name: string
  models: CatalogModel[]
}

/** /provider/models 里的一条模型详情（生效 pi-ai 包的元数据），按模型 id 建索引。 */
interface ModelDetail {
  id?: string
  contextWindow?: number
  maxTokens?: number
  vision?: boolean
  video?: boolean
  reasoning?: boolean
  thinkingLevels?: string[]
}

/** /plan/status 的 accounts 项：额度快照里的一家 provider（宿主在通用字段外还会带几个）。 */
interface PlanAccount {
  id: string
  displayName?: string
  kind?: string
  authConfigured?: boolean
  baseUrl?: string
  websiteUrl?: string
  keyHint?: string
  deletable?: boolean
  credentialWarning?: string
  api?: string
  apiKeyEnv?: string
  error?: unknown
  fetchedAt?: string
  balances?: BalanceRow[]
  windows?: QuotaWindow[]
}

/** 官方目录服务的 snapshot store；subscribe 契约各版本不一，我们只用 getSnapshot。 */
interface SnapshotStore {
  getSnapshot?: () => unknown
  subscribe?: () => () => void
}

/** 会话 face 上的模型选择投影 cell。 */
interface ProjectionCell {
  getSnapshot: () => unknown
  subscribe: () => () => void
}

/** sessions 服务：只用到 binding(sessionId).session.projections.faceOf(...)。 */
interface SessionsFace {
  binding?: (sessionId: string) => {
    session?: { projections?: { faceOf?: (name: string) => ProjectionCell } }
  }
}

/** /provider/presets 里的一个预置供应商。 */
interface ProviderPreset {
  id: string
  label: string
  baseURL?: string
  api?: string
  apiKeyEnv?: string
  websiteUrl?: string
  configured?: boolean
  custom?: boolean
}

/** 「pi-ai 桥接」明细行：piAiBridgeRows 的产出，组件照着渲染。 */
interface BridgeRow {
  key: string
  text: string
  value?: string
  title?: string
  bad?: boolean
  warn?: boolean
}

/** 卡片头部摘要 chip：窗口余量（label+text+percent）、钱包余额（只有 text）或组间分割线（sep）。 */
interface HeadlineChip {
  sep?: boolean
  label?: string
  text?: string
  percent?: number | undefined
  reset?: string | undefined
}

/** createElement 里 input/select 的 onChange 事件对象：只读得到 target.value。 */
interface FieldEvent {
  target: { value: string }
}

/**
 * 需要的客户端服务：座位注册表 + 会话。
 * `remote` / `remote.session` 是官方目录服务内部要用的：其方法被绑定到调用方上下文，
 * 少声明就会在 directoryFor 里报 "cannot get property remote.session without inject"。
 */
var inject = ['slots', 'sessions', 'remote', 'remote.session', 'locale']

/** 插件样式：沿用 GUI 的 CSS 变量，跟模型座位视觉一致。 */
var css =
  '.plan_root{position:relative;display:inline-flex;align-items:center}' +
  '.plan_dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}' +
  '.plan_dot_ok{background:#22a06b}.plan_dot_warn{background:#d9a300}.plan_dot_bad{background:#d9534f}' +
  '.plan_tag{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-tertiary);font-weight:400}' +
  '.plan_warnText{color:#b8860b}.plan_badText{color:#d9534f}' +
  '.plan_note{margin-top:3px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);word-break:break-word}' +
  // ---- 模型选择器（搜索/过滤/余额）----
  '.mp_search{box-sizing:border-box;width:100%;padding:6px 10px;margin-bottom:4px;font:inherit;font-size:12px;' +
  'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:8px;outline:0}' +
  '.mp_search:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}' +
  '.mp_chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}' +
  '.mp_chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font:inherit;font-size:12.5px;line-height:18px;' +
  'color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
  'border-radius:999px;cursor:pointer}' +
  '.mp_chip[data-on="1"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));' +
  'border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}' +
  '.mp_modelName{font-weight:500}' +
  '.mp_empty{padding:14px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary)}' +
  // ---- 模型座位：官方 ModelSelect 同款（两级层级，Figma 313:14108 / 496:26454 规格）----
  '.ms_trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45vw);height:28px;' +
  'padding:0 4px 0 8px;border:0;border-radius:24px;background:transparent;outline:0;' +
  'color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;' +
  'cursor:pointer;white-space:nowrap}' +
  '.ms_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.ms_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}' +
  '.ms_tLabel{min-width:0;overflow:hidden;text-overflow:ellipsis}' +
  '.ms_tEffort{flex-shrink:1000;min-width:0;overflow:hidden;text-overflow:ellipsis;' +
  'color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}' +
  '.ms_chev{flex:0 0 auto;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));' +
  'transition:transform .12s ease}' +
  '.ms_chevOpen{transform:rotate(180deg)}' +
  '.ms_menu{position:absolute;bottom:calc(100% + 6px);right:0;z-index:1100;display:flex;flex-direction:column;' +
  'width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));' +
  'max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:0;border-radius:20px;' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary)}' +
  '.ms_cell{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;height:40px;' +
  'padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);' +
  'font:inherit;font-size:14px;line-height:22px;cursor:pointer;text-align:left}' +
  '.ms_cell:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.ms_cellLabel{flex:0 0 auto;white-space:nowrap}' +
  '.ms_cellValue{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
  'text-align:right;color:var(--dsw-alias-label-tertiary)}' +
  '.ms_cellChev{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}' +
  '.ms_scroll{min-height:0;overflow-y:auto;display:flex;flex-direction:column}' +
  '.ms_group{margin-top:4px}' +
  '.ms_groupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-tertiary);' +
  'font-size:12px;line-height:18px;font-weight:500}' +
  '.ms_option{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;' +
  'min-height:38px;padding:6px 8px;border:0;border-radius:10px;background:transparent;color:inherit;' +
  'font:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer}' +
  '.ms_option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.ms_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}' +
  '.ms_name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}' +
  '.ms_capsCol{flex:none;width:92px;display:flex;justify-content:flex-end;align-items:center;gap:4px}' +
  '.ms_ctxCol{flex:none;width:48px;text-align:right;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}' +
  '.ms_check{flex:0 0 18px;display:grid;place-items:center;color:var(--dsw-alias-label-primary)}' +
  '.ms_status{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}' +
  // ---- 设置页 Provider 标签 ----
  '.pv_section{display:flex;flex-direction:column;gap:12px;max-width:640px}' +
  '.pv_card{padding:14px 16px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;' +
  'background:var(--dsw-alias-bg-layer-1,#fff)}' +
  '.pv_title{font-size:13px;font-weight:600;line-height:18px;margin-bottom:8px}' +
  '.pv_line{display:flex;align-items:center;gap:10px;font-size:13px;line-height:22px;padding:3px 0;' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_action{margin-left:auto;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);' +
  'background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
  'border-radius:6px;padding:4px 12px;cursor:pointer}' +
  '.pv_action:disabled{opacity:.5;cursor:default}' +
  // ---- Provider 标签：CC Switch 式卡片（字号/间距对齐官方插件页）----
  '.pv_stack{display:flex;flex-direction:column;gap:14px;max-width:600px}' +
  '.pv_pc{list-style:none;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.15));border-radius:16px;' +
  'background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;' +
  'display:flex;flex-direction:column}' +
  '.pv_pc:hover{border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}' +
  // 展开态：官方读法「正在操作的卡」——底变 layer-2（更沉）、边框加深
  '.pv_pcOpen{background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}' +
  '.pv_pcTop{display:flex;align-items:stretch}' +
  '.pv_pcMain{flex:1;min-width:0;display:flex;flex-direction:column}' +
  '.pv_pcCaretCol{flex:none;width:36px;display:flex;align-items:center;justify-content:center;' +
  'cursor:pointer;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_pcCaretCol:hover{color:var(--dsw-alias-label-secondary)}' +
  '.pv_pcHead{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;background:0 0;' +
  'cursor:pointer;font:inherit;color:inherit;text-align:left;border-radius:12px}' +
  '.pv_pcHead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:-2px}' +
  '.pv_pcName{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary);' +
  'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.pv_pcChips{flex:none;display:flex;align-items:center;gap:10px;font-size:13px;white-space:nowrap}' +
  '.pv_chipItem{display:inline-flex;align-items:baseline;gap:2px}' +
  '.pv_chipLabel{color:var(--dsw-alias-label-secondary)}' +
  '.pv_chipSep{flex:none;width:1px;height:12px;margin:0 4px;background:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}' +
  '.pv_chipReset{color:var(--dsw-alias-label-tertiary);font-size:12px}' +
  '.pv_pcCaret{flex:none;display:block;color:var(--dsw-alias-label-tertiary);' +
  'transition:transform .16s}' +
  '.pv_pcCaretOpen{transform:rotate(180deg)}' +
  // 第二行：余量摘要 + 操作（官方卡片没有这一行，是我们的产品扩展）
  '.pv_pcMeta{display:flex;align-items:center;gap:10px;padding:2px 16px 14px;font-size:13px;flex-wrap:wrap}' +
  '.pv_metaActs{margin-left:auto;display:inline-flex;align-items:center;gap:4px}' +
  '.pv_pcWeb{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary);text-decoration:none;' +
  'font-size:14px;line-height:20px;padding:0 2px;border-radius:6px}' +
  '.pv_pcWeb:hover{color:var(--dsw-alias-label-secondary)}' +
  // 等级胶囊（Coding Plan 会员档）：业务蓝描边 + 蓝字，靠右
  '.pv_lv{flex:none;margin-left:auto;font-size:12px;line-height:18px;padding:1px 10px;border-radius:999px;' +
  'white-space:nowrap;color:var(--dsw-alias-state-business-primary,#5b8cff);' +
  'border:1px solid var(--dsw-alias-state-business-primary,#5b8cff)}' +
  // 微过渡（官方 .16s 节奏）+ 键盘焦点环
  '.pv_pickItem,.pv_iconBtn,.pv_action,.pv_tab,.pv_addBtn,.pv_fclear,.pv_delYes,.pv_delNo,' +
  '.mp_chip,.pv_pcLink{transition:background-color .16s ease,color .16s ease}' +
  '.pv_iconBtn:focus-visible,.pv_action:focus-visible,.pv_tab:focus-visible,' +
  '.pv_pickItem:focus-visible,.pv_addBtn:focus-visible,.pv_mFilter:focus-visible,input.pv_field:focus-visible,' +
  'select.pv_field:focus-visible,select.pv_msEff:focus-visible,a.pv_pcLink:focus-visible{' +
  'outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:1px}' +
  '.pv_pcBody{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));' +
  'padding:10px 18px 14px;display:flex;flex-direction:column;gap:4px}' +
  '.pv_line .plan_tag{margin-left:0}' +
  '.pv_line .pv_push{margin-left:auto}' +
  '.pv_row>span:first-child{width:72px;flex:none}' +
  // 次要注解（凭据名这类）：单独一行小字，缩进跟着值列
  '.pv_hint{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}' +
  // 值框（API 密钥/端点）：Cherry 式输入框外观
  '.pv_field{display:inline-flex;align-items:center;min-width:240px;max-width:100%;padding:6px 12px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));font-size:13px;line-height:20px;' +
  'color:var(--dsw-alias-label-secondary)}' +
  // 模型区外框
  '.pv_mBox{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;' +
  'padding:0 14px;display:flex;flex-direction:column}' +
  '.pv_mRight{margin-left:auto;display:inline-flex;align-items:center;gap:8px}' +
  '.pv_iconBtn{border:0;background:0 0;cursor:pointer;font:inherit;font-size:15px;padding:3px 6px;' +
  'border-radius:6px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.pv_delOn{color:#e03131;font-size:12px;width:auto;padding:2px 8px}' +
  // 删除确认框：红确认 + 灰取消，点框内任意处不触发卡片折叠
  '.pv_delBox{display:inline-flex;gap:2px;align-items:center;padding:3px 5px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03))}' +
  '.pv_delYes{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;color:#e03131;' +
  'padding:3px 9px;border-radius:6px}' +
  '.pv_delYes:hover{background:rgba(224,49,49,.12)}' +
  '.pv_delNo{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;' +
  'color:var(--dsw-alias-label-secondary);padding:3px 9px;border-radius:6px}' +
  '.pv_delNo:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '@keyframes pvRot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
  '.pv_spin{display:inline-block;animation:pvRot 1s linear infinite}' +
  // 刷新结果 toast（右下，2.6s 自动消失）
  '.pv_toast{position:fixed;bottom:24px;right:24px;z-index:500;padding:10px 18px;border-radius:12px;' +
  'font-size:13px;line-height:20px;max-width:min(420px,80vw);' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}' +
  '.pv_toastOk{color:#2f9e44}' +
  '.pv_toastFail{color:#e03131}' +
  // 上次刷新时间（时钟 + 相对时间，内联在卡片头部）
  '.pv_fresh{font-size:12px;line-height:18px;white-space:nowrap;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  // ---- 添加 provider 面板 ----
  '.pv_addBtn{width:100%;padding:13px;border:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.2));' +
  'border-radius:14px;background:0 0;cursor:pointer;font:inherit;font-size:14px;' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_addBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.03))}' +
  'input.pv_field{cursor:text}' +
  'select.pv_field{cursor:pointer}' +
  // 预置字段（路由 ID/端点/协议）：灰底只读；密钥/待填项：白底提示可输入
  'input.pv_ro{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));' +
  'color:var(--dsw-alias-label-tertiary);cursor:default}' +
  'input.pv_key{background:var(--dsw-alias-bg-layer-1,#fff);' +
  'border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}' +
  '.pv_actRow{display:flex;gap:10px;align-items:center;padding:8px 0 4px}' +
  // ---- 供应商可过滤下拉 ----
  '.pv_pick{flex:1;min-width:0;position:relative}' +
  '.pv_pickBtn{width:100%;cursor:pointer;justify-content:space-between;gap:8px}' +
  '.pv_pickMenu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:250;padding:6px;' +
  'display:flex;flex-direction:column;gap:4px;border-radius:10px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}' +
  '.pv_pickList{max-height:240px;overflow:auto;display:flex;flex-direction:column}' +
  '.pv_pickItem{display:flex;align-items:center;gap:6px;padding:8px 12px;border:0;background:0 0;' +
  'cursor:pointer;font:inherit;font-size:13.5px;color:var(--dsw-alias-label-primary);text-align:left;' +
  'border-radius:8px}' +
  '.pv_pickItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04))}' +
  '.pv_pickItem:disabled{opacity:.5;cursor:default}' +
  '.pv_pickEmpty{padding:12px;font-size:13px;color:var(--dsw-alias-label-tertiary);text-align:center}' +
  // ---- 模型选择器行：模型 + 思考强度 ----
  '.pv_msRow{display:flex;align-items:center;gap:8px}' +
  '.pv_msMain{flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-align:left}' +
  'select.pv_msEff{flex:none;font:inherit;font-size:12px;padding:3px 8px;cursor:pointer;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:6px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-secondary)}' +
  // ---- Provider 页内二级标签 ----
  '.pv_tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
  'margin-bottom:14px}' +
  '.pv_tab{font:inherit;font-size:14px;padding:8px 14px;border:0;background:0 0;cursor:pointer;' +
  'color:var(--dsw-alias-label-secondary);border-bottom:2px solid transparent;margin-bottom:-1px}' +
  '.pv_tab:hover{color:var(--dsw-alias-label-primary)}' +
  '.pv_tabOn{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary,#3b5bdb);font-weight:600}' +
  // ---- Provider 卡片：CC Switch 式名称+链接两行布局 ----
  '.pv_pcLead{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}' +
  '.pv_pcLeadRow{display:flex;align-items:center;gap:8px}' +
  '.pv_pcLink{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary);text-decoration:none;' +
  'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.pv_pcLink:hover{color:var(--dsw-alias-label-secondary);text-decoration:underline}' +
  // ---- 模型行悬浮详情卡（Cherry Studio 式）----
  '.pv_mRow{position:relative;display:flex;align-items:center;gap:8px;padding:3px 0}' +
  '.pv_mId{flex:none;width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
  'font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);' +
  'font-family:ui-monospace,Menlo,Consolas,monospace}' +
  '.pv_mName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.pv_mHeadRow{display:flex;align-items:center;gap:8px;padding:5px 0 4px;font-size:12px;' +
  'color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}' +
  '.pv_mCaps{flex:none;width:100px;display:inline-flex;justify-content:flex-end;align-items:center;gap:6px}' +
  '.pv_mCtx{flex:none;width:56px;text-align:right;font-size:12px;line-height:18px;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  '.pv_capIcons{display:inline-flex;gap:6px;font-size:12px;line-height:16px}' +
  '.pv_capMini{font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;white-space:nowrap}' +
  '.pv_mHead{display:flex;align-items:center;gap:6px;flex:1;min-width:0;font:inherit;font-size:13px;font-weight:600;' +
  'line-height:18px;padding:0;border:0;background:0 0;cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left}' +
  '.pv_mHead:hover{color:var(--dsw-alias-label-secondary)}' +
  // 模型区头部（仿父卡片）：标题左、过滤器右、Chevron 最右；列表区分割线 = 折叠态下边缘（零外边距）
  // 头部行高 = 字号行高(18) + 上下各 10px，恒定不变；过滤框在该行内居中，不撑高行
  '.pv_mTop{display:flex;align-items:center;gap:8px;height:38px;padding:0}' +
  '.pv_mCaretCol{flex:none;width:24px;display:flex;align-items:center;justify-content:center;' +
  'cursor:pointer;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_mCaretCol:hover{color:var(--dsw-alias-label-secondary)}' +
  '.pv_mList{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));' +
  'margin-top:0;padding-top:6px;display:flex;flex-direction:column}' +
  '.pv_mFilter{flex:none;width:240px;box-sizing:border-box;padding:5px 24px 5px 12px;font:inherit;font-size:13px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;outline:0;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}' +
  '.pv_mFilter:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}' +
  '.pv_fbox{position:relative;display:inline-flex;align-items:center;flex:none}' +
  '.pv_fclear{position:absolute;right:2px;top:50%;transform:translateY(-50%);border:0;background:0 0;' +
  'cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:2px 6px;' +
  'color:var(--dsw-alias-label-tertiary);border-radius:6px}' +
  '.pv_fclear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.pv_tip{display:none;position:absolute;left:0;bottom:calc(100% + 6px);z-index:300;width:270px;' +
  'padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));flex-direction:column;gap:6px}' +
  '.pv_mRow:hover .pv_tip{display:flex}' +
  '.pv_tipTitle{font-size:13px;font-weight:600;line-height:18px}' +
  '.pv_tipRow{display:flex;gap:10px;font-size:12px;line-height:18px}' +
  '.pv_tipLabel{flex:none;width:60px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_tipDim{font-size:11px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_tipCaps{display:flex;gap:6px;flex-wrap:wrap}' +
  '.pv_cap{font-size:11px;padding:1px 8px;border-radius:999px}' +
  '.pv_capVision{color:#2f9e44;background:rgba(47,158,68,.12)}' +
  '.pv_capVideo{color:#7c3aed;background:rgba(124,58,237,.12)}' +
  '.pv_capReason{color:#b8860b;background:rgba(217,162,0,.15)}'

// ==================== 基础设施与格式化工具 ====================

var tagId = 'dsh-provider/plan.css'
function installCss() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return
  var tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-provider'
  tag.dataset.pluginCss = tagId
  tag.textContent = css
  document.head.appendChild(tag)
}

/** i18n 本地字典：注册失败/服务缺席时的兜底（也用于缺键回退）。语言从 <html lang> 判断。 */
var LOCAL_DICT: Record<'zh' | 'en', Record<string, string>> = {
  zh: { nav: '模型服务', tabProviders: '服务商', addProvider: '＋ 添加供应商' },
  en: { nav: 'Provider', tabProviders: 'Provider', addProvider: '＋ Add Provider' },
}
function localT(key: string): string {
  var lang: 'zh' | 'en' = 'en'
  try {
    if (String(document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0) lang = 'zh'
  } catch (cause) { /* 默认 en */ }
  var dict = LOCAL_DICT[lang] !== undefined ? LOCAL_DICT[lang] : LOCAL_DICT.en
  return dict[key] !== undefined ? dict[key] : (LOCAL_DICT.en[key] !== undefined ? LOCAL_DICT.en[key] : key)
}

/** i18n translate：优先官方 locale（注册+bind）；任何一步失败都回退本地字典。工厂级，组件/label 闭包共享。 */
var t = localT

/** 测试环境标识：标题加「· 测试」后缀 + favicon 右下角盖橙色「测」角标。 */
function markTestEnv() {
  try {
    if (document.title.indexOf('测试') === -1) {
      document.title = (document.title === '' ? 'dsh' : document.title) + ' · 测试'
    }
    var iconLink = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    var img = new window.Image()
    img.onload = function () {
      var canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      var g = canvas.getContext('2d')
      if (g !== null && g !== undefined) {
        g.drawImage(img, 0, 0, 64, 64)
        g.fillStyle = '#e8890c'
        g.beginPath()
        g.arc(46, 46, 20, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#ffffff'
        g.font = 'bold 24px sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('测', 46, 48)
        setFavicon(canvas.toDataURL('image/png'))
        return
      }
      setFavicon(undefined)
    }
    img.onerror = function () { setFavicon(undefined) }
    img.src = iconLink === null ? '/favicon.ico' : iconLink.href
  } catch (cause) { /* 标不了就算了 */ }
}

/** 替换 favicon；dataUrl 为 undefined 时退到一个纯「测」字圆形 icon。 */
function setFavicon(dataUrl: string | undefined) {
  try {
    var link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (link === null || link === undefined) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    if (dataUrl !== undefined) {
      link.href = dataUrl
      return
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="30" fill="#e8890c"/>' +
      '<text x="32" y="43" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle">测</text></svg>'
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg)
  } catch (cause) { /* 标不了就算了 */ }
}

var EMPTY_CELL = {
  getSnapshot: function () {
    return undefined
  },
  subscribe: function () {
    return function () {}
  },
}

/** 模型选择投影的 cell；读不到时给一个永远 undefined 的假 cell，组件照样能渲染。 */
function selectionCell(sessions: SessionsFace | undefined, sessionId: string): ProjectionCell {
  if (sessions === undefined || typeof sessions.binding !== 'function') return EMPTY_CELL
  var binding
  try {
    binding = sessions.binding(sessionId)
  } catch (error) {
    return EMPTY_CELL
  }
  var face = binding && binding.session && binding.session.projections
  if (face === undefined || typeof face.faceOf !== 'function') return EMPTY_CELL
  try {
    var cell = face.faceOf('modelSelection')
    if (cell !== undefined && typeof cell.getSnapshot === 'function' && typeof cell.subscribe === 'function') return cell
  } catch (error) {
    return EMPTY_CELL
  }
  return EMPTY_CELL
}

/** 投影值 → 当前 provider/model；投影可能是原值或 {next} 形状。 */
function unwrap(value: unknown): ModelSelection | undefined {
  var record = value as AnyRecord
  if (value !== null && typeof value === 'object' && typeof record.provider === 'string') return record as unknown as ModelSelection
  if (value !== null && typeof value === 'object' && record.next !== null && typeof record.next === 'object') {
    var next = record.next as AnyRecord
    if (typeof next.provider === 'string') return next as unknown as ModelSelection
  }
  return undefined
}

/** 读一次 snapshot store，失败当作没有。 */
function snapshotOf(store: SnapshotStore | undefined | null): AnyRecord | undefined {
  if (store === undefined || store === null || typeof store.getSnapshot !== 'function') return undefined
  try {
    return store.getSnapshot() as AnyRecord | undefined
  } catch (error) {
    return undefined
  }
}

/**
 * 轮询一个 snapshot store（官方目录服务给的 store）。
 * 不用 useSyncExternalStore：不同 dsh 版本上 store 的 subscribe 契约不保证一致，
 * 订阅失败会把整块 UI 拖崩；轮询只影响「当前」标记的实时性。
 */
function usePolledSnapshot(store: SnapshotStore | undefined, intervalMs: number): AnyRecord | undefined {
  var state = react.useState(function () {
    return snapshotOf(store)
  })
  react.useEffect(
    function () {
      if (store === undefined || store === null) return undefined
      function read() {
        state[1](snapshotOf(store))
      }
      read()
      var timer = setInterval(read, intervalMs)
      return function () {
        clearInterval(timer)
      }
    },
    [store],
  )
  return state[0]
}

/** 官方目录分组 → 我们内部统一的 [{ id, name, models: [{id, name, contextWindow?}] }]。 */
function normalizeGroups(rawGroups: unknown): CatalogGroup[] {
  var groups = Array.isArray(rawGroups) ? rawGroups : []
  var normalized: CatalogGroup[] = []
  for (var i = 0; i < groups.length; i += 1) {
    var group = groups[i]
    if (group === null || typeof group !== 'object') continue
    var groupRecord = group as AnyRecord
    var providerId = typeof groupRecord.provider === 'string' ? groupRecord.provider : groupRecord.id
    if (typeof providerId !== 'string') continue
    var models: CatalogModel[] = []
    var raw = Array.isArray(groupRecord.models) ? groupRecord.models : []
    for (var j = 0; j < raw.length; j += 1) {
      var model = raw[j]
      if (typeof model === 'string') models.push({ id: model, name: model })
      else if (model !== null && typeof model === 'object') {
        var modelRecord = model as AnyRecord
        // 原先是这个 else-if 的条件；写成 continue 是因为它本来就是循环体最后一段
        if (typeof modelRecord.id !== 'string') continue
        var entry: CatalogModel = {
          id: modelRecord.id,
          name: typeof modelRecord.name === 'string' ? modelRecord.name : modelRecord.id,
        }
        var cw = modelRecord.contextWindow ?? modelRecord.context_window ?? modelRecord.maxContextWindow
        if (typeof cw === 'number' && Number.isFinite(cw) && cw > 0) entry.contextWindow = cw
        // 思考强度档位：官方目录的 reasoning.efforts（id/name 列表 + 默认值）
        if (modelRecord.reasoning !== null && typeof modelRecord.reasoning === 'object') {
          var reasoningRecord = modelRecord.reasoning as AnyRecord
          var efforts = Array.isArray(reasoningRecord.efforts) ? reasoningRecord.efforts : []
          var effortIds: string[] = []
          for (var r = 0; r < efforts.length; r += 1) {
            var effort = efforts[r]
            var effortId = typeof effort === 'string' ? effort : (effort && (effort as AnyRecord).id)
            if (typeof effortId === 'string' && effortId !== '') effortIds.push(effortId)
          }
          if (effortIds.length > 0) {
            entry.reasoning = {
              efforts: effortIds,
              default: typeof reasoningRecord.defaultEffort === 'string' ? reasoningRecord.defaultEffort : undefined,
            }
          }
        }
        models.push(entry)
      }
    }
    normalized.push({
      id: providerId,
      name: typeof groupRecord.name === 'string' ? groupRecord.name : providerId,
      models: models,
    })
  }
  return normalized
}

/** 目录里按 provider id 找分组。 */
function findById<T extends { id: string }>(list: T[], id: string): T | undefined {
  for (var i = 0; i < list.length; i += 1) {
    if (list[i].id === id) return list[i]
  }
  return undefined
}

/** 目录里按 provider id + 模型 id 找模型（当前选择回显、点选提交都用它）。 */
function findModel(groups: CatalogGroup[], providerId: string, modelId: string): CatalogModel | undefined {
  var group = findById(groups, providerId)
  if (group === undefined) return undefined
  for (var j = 0; j < group.models.length; j += 1) {
    if (group.models[j].id === modelId) return group.models[j]
  }
  return undefined
}

/** 上下文窗口的人性化显示：1048576 → 1.0M，262144 → 262K（K/M 按 1000 进）。 */
function formatContext(value: unknown): string | undefined {
  var n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  if (n >= 1e6) {
    var m = n / 1e6
    return (Number.isInteger(m) ? String(m) : m.toFixed(1)) + 'M'
  }
  if (n >= 1e3) return Math.round(n / 1e3) + 'K'
  return String(n)
}

/** 思考强度档位显示名：不翻译，原始档位首字母大写（low→Low、xhigh→Xhigh）。 */
function effortLabel(effort: unknown): string | undefined {
  if (typeof effort !== 'string' || effort === '') return undefined
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}
/**
 * 模型没显式选强度时的落点：只认目录里声明的默认档（官方同款：
 * `current.reasoningEffort ?? reasoning.defaultEffort`）。
 * 早先还拿档位表首档兜底，那等于替用户选了一个他没选过的档位——
 * 目录没声明默认档时该显示「服务商默认」，让服务商自己决定。
 */
function defaultEffortOf(model: unknown): string | undefined {
  if (model === null || typeof model !== 'object') return undefined
  var reasoning = (model as AnyRecord).reasoning
  if (reasoning === undefined) return undefined
  var value = (reasoning as AnyRecord).default
  return typeof value === 'string' ? value : undefined
}

/**
 * 推理等级文案。会话已经定了档位就显示它，哪怕目录里没有这个模型：
 * 目录只收录 listProviders 报上来的路由，会话里存着的 provider 可能不在其中
 * （原生路由没进目录、模型下线的历史会话），这时档位表拿不到，但会话的选择是真的。
 * @param chosenEffort - 会话当前选择里的档位（selection.reasoningEffort）。
 * @param modelReasoning - 目录里这个模型的档位表；没有则 undefined。
 * @param providerDefault - 目录给的默认档位（会话没显式选时的落点）。
 * @returns 档位显示名；既没定档位又没有档位表时返回 undefined（整段不显示）。
 */
function reasoningTextOf(chosenEffort: unknown, modelReasoning: unknown, providerDefault: unknown): string | undefined {
  var chosen = effortLabel(chosenEffort)
  if (modelReasoning === undefined || modelReasoning === null) return chosen
  if (chosen !== undefined) return chosen
  var fallback = effortLabel(providerDefault)
  return fallback === undefined ? '服务商默认' : fallback
}

/** 相对时间（上次刷新指示器）：<10s 显示刚刚，<1min 显示 <1min，之后按分钟精度 m / h+m / d。 */
function relativeTime(iso: unknown): string {
  if (typeof iso !== 'string' || iso === '') return ''
  var t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  var seconds = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (seconds < 10) return '刚刚'
  if (seconds < 60) return '<1min'
  var minutes = Math.floor(seconds / 60)
  if (minutes < 60) return String(minutes) + 'm'
  var hours = Math.floor(minutes / 60)
  var min = minutes % 60
  if (hours < 24) return min > 0 ? String(hours) + 'h' + String(min) + 'm' : String(hours) + 'h'
  return String(Math.floor(hours / 24)) + 'd'
}

function toneColor(percent: unknown): string {
  if (typeof percent !== 'number') return '#22a06b'
  if (percent <= 10) return '#d9534f'
  if (percent <= 30) return '#d9a300'
  return '#22a06b'
}

/** 一个账户里最紧的窗口剩余百分比。 */
function worstPercent(account: PlanAccount): number | undefined {
  var worst: number | undefined
  var windows = Array.isArray(account.windows) ? account.windows : []
  for (var i = 0; i < windows.length; i += 1) {
    var percent = windows[i].percentLeft
    if (typeof percent !== 'number') continue
    if (worst === undefined || percent < worst) worst = percent
  }
  return worst
}

function dotClass(account: PlanAccount | undefined | null): string {
  if (account === undefined || account === null) return 'plan_dot'
  if (account.error !== undefined) return 'plan_dot plan_dot_bad'
  if (account.authConfigured === false) return 'plan_dot plan_dot_warn'
  if (account.kind === 'unsupported' || account.kind === 'unknown-provider') return 'plan_dot plan_dot_warn'
  var percent = worstPercent(account)
  if (percent === undefined) return 'plan_dot plan_dot_ok'
  if (percent <= 10) return 'plan_dot plan_dot_bad'
  if (percent <= 30) return 'plan_dot plan_dot_warn'
  return 'plan_dot plan_dot_ok'
}

function shortName(account: PlanAccount): string {
  return account.displayName === undefined ? account.id : account.displayName
}

/** 徽标上的短字：优先余额，其次最紧窗口的剩余百分比。 */
function summaryOf(account: PlanAccount | undefined | null): string {
  if (account === undefined || account === null) return '额度'
  if (account.authConfigured === false) return shortName(account) + ' 未配置 key'
  if (account.error !== undefined) return shortName(account) + ' 查询失败'
  if (account.kind === 'unsupported') return shortName(account) + ' 看控制台'
  if (account.kind === 'unknown-provider') return shortName(account) + ' 无适配器'
  var balances = Array.isArray(account.balances) ? account.balances : []
  if (balances.length > 0) return shortName(account) + ' ' + balances[0].value
  var percent = worstPercent(account)
  if (typeof percent === 'number') return shortName(account) + ' 余 ' + String(percent) + '%'
  var windows = Array.isArray(account.windows) ? account.windows : []
  if (windows.length > 0) return shortName(account) + ' ' + String(windows.length) + ' 个窗口'
  return shortName(account)
}

// ==================== 共享数据层 ====================

/** 同源 GET → JSON：宿主自建读路由（/plan/status、/provider/status|presets|models）的唯一入口。 */
function getJson(url: string): Promise<any> {
  return fetch(url).then(function (response) {
    return response.json()
  })
}

/** 同源 POST JSON → JSON：宿主自建写路由（refresh / remove / test / update）的唯一入口。 */
function postJson(url: string, body?: unknown): Promise<any> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body === undefined ? {} : body),
  }).then(function (response) {
    return response.json()
  })
}

/** 额度快照：60 秒内复用，force 绕过（和宿主端缓存同拍）。 */
var planCache: { at: number; value: unknown } = { at: 0, value: null }
function loadPlanStatus(force: boolean): Promise<any> {
  if (!force && planCache.value !== null && Date.now() - planCache.at < 60000) {
    return Promise.resolve(planCache.value)
  }
  return getJson('/plan/status' + (force === true ? '?refresh=1' : '')).then(function (payload) {
    planCache = { at: Date.now(), value: payload }
    return payload
  })
}

/** 宿主桥接状态（pi-ai 版本、路由表、测试环境标记）。 */
function loadProviderStatus() {
  return getJson('/provider/status')
}

/** 桥接状态拿不到时的占位：设置页据此渲染错误行，界面不至于空着。 */
var STATUS_UNAVAILABLE = { bridge: { active: false, error: '宿主端状态不可用' } }

/** 模型详情（生效 pi-ai 包的全量元数据），按模型 id 建索引：悬浮详情卡与能力徽章共用。 */
function loadModelDetailMap(): Promise<Record<string, ModelDetail>> {
  return getJson('/provider/models').then(function (payload) {
    var map: Record<string, ModelDetail> = {}
    if (payload === null || payload === undefined || !Array.isArray(payload.models)) return map
    for (var i = 0; i < payload.models.length; i += 1) map[payload.models[i].id] = payload.models[i]
    return map
  })
}

/** 不可变地合并一组 key（几个 setState 都这么写，集中一处）。 */
function withKeys(prev: AnyRecord, patch: AnyRecord): AnyRecord {
  var next: AnyRecord = {}
  for (var k in prev) next[k] = prev[k]
  for (var k2 in patch) next[k2] = patch[k2]
  return next
}

/** 不可变地改 map 里的一个 key。 */
function withKey(prev: AnyRecord, key: string, value: unknown): AnyRecord {
  var patch: AnyRecord = {}
  patch[key] = value
  return withKeys(prev, patch)
}

/** 快照里剔掉一家（删除 provider 后用：不打上游、不让卡片复活）。 */
function withoutAccount(payload: unknown, id: string): unknown {
  if (payload === null || payload === undefined || typeof payload !== 'object') return payload
  var record = payload as AnyRecord
  if (!Array.isArray(record.accounts)) return payload
  return {
    ...record,
    accounts: record.accounts.filter(function (account) {
      return account.id !== id
    }),
  }
}

/** 快照里替换一家（单卡刷新用：宿主实查回传的新账户盖掉旧值，并更新 fetchedAt）。 */
function withRefreshedAccount(payload: unknown, fresh: AnyRecord): unknown {
  if (payload === null || payload === undefined || typeof payload !== 'object') return payload
  var record = payload as AnyRecord
  if (!Array.isArray(record.accounts)) return payload
  return {
    ...record,
    accounts: record.accounts.map(function (account) {
      return account.id === fresh.id ? fresh : account
    }),
    fetchedAt: new Date().toISOString(),
  }
}

/** 从客户端缓存里剔除一家。 */
function dropPlanAccount(id: string) {
  planCache.value = withoutAccount(planCache.value, id)
}

/**
 * 官方远程 RPC 同源调用（/api/<ns>/<method>，client-request 信封，cookie 自动认证）。
 * @param failMessage 信封里没有 error 对象时的兜底文案（默认「调用失败」）。
 */
function apiCall(method: string, args: unknown, failMessage?: string): Promise<any> {
  return postJson('/api/' + method, {
    type: 'client-request',
    rpcId: 'dsh-provider-' + String(Date.now()) + '-' + String(Math.random()).slice(2, 8),
    method: method,
    payload: { args: args },
  }).then(function (envelope) {
    var result = envelope && envelope.result
    if (result && result.ok === true) return result.value
    throw new Error(result && result.error
      ? String(result.error.code) + ': ' + String(result.error.message)
      : (failMessage === undefined ? '调用失败' : failMessage))
  })
}

/**
 * 模型目录：session/modelCatalog 的同源 RPC（官方选择器走的是同一条）。
 * @returns `{ groups, default }`；default 是宿主默认选择，官方用它兜底
 *   （`current = projected.next ?? catalog.default`）——会话还没选过模型时显示的就是它。
 */
function loadModelCatalog() {
  return apiCall('session/modelCatalog', {}, '模型目录加载失败').then(function (value) {
    var catalog = value === null || typeof value !== 'object' ? {} : value
    return { groups: normalizeGroups(catalog.groups), default: normalizeSelection(catalog.default) }
  })
}

/** 一个 provider/model/reasoningEffort 选择；形状不对就当作没有。 */
function normalizeSelection(value: unknown): ModelSelection | undefined {
  if (value === null || typeof value !== 'object') return undefined
  var record = value as AnyRecord
  if (typeof record.provider !== 'string' || typeof record.model !== 'string') return undefined
  return typeof record.reasoningEffort === 'string'
    ? { provider: record.provider, model: record.model, reasoningEffort: record.reasoningEffort }
    : { provider: record.provider, model: record.model }
}

/** 切换模型：GUI 自己的同源 RPC，和官方选择器同一条路。 */
function submitSelection(sessionId: string, provider: string, model: string, reasoningEffort: unknown): Promise<boolean> {
  var request: { sessionId: string; provider: string; model: string; reasoningEffort?: string } = { sessionId: sessionId, provider: provider, model: model }
  if (typeof reasoningEffort === 'string') request.reasoningEffort = reasoningEffort
  return apiCall('session/selectModel', { request: request }, '切换失败').then(function () {
    return true
  })
}

/** provider id → 额度账户（两边用同一套 route id，直接对上）。 */
function accountsById(payload: unknown): Record<string, PlanAccount> {
  var map: Record<string, PlanAccount> = {}
  var source: AnyRecord | undefined = payload === null || payload === undefined ? undefined : (payload as AnyRecord)
  var accounts = source !== undefined && Array.isArray(source.accounts)
    ? source.accounts
    : []
  for (var i = 0; i < accounts.length; i += 1) map[accounts[i].id] = accounts[i]
  return map
}

/** 一行里的余额短文案（给模型行/过滤 chip 复用）。 */
function quotaTextOf(account: PlanAccount | undefined | null): string | undefined {
  if (account === undefined || account === null) return undefined
  if (account.authConfigured === false) return '未配置 key'
  if (account.error !== undefined) return '查询失败'
  if (account.kind === 'unsupported') return '看控制台'
  if (account.kind === 'unknown-provider') return '无适配器'
  var percent = worstPercent(account)
  if (typeof percent === 'number') return '余 ' + String(percent) + '%'
  var balances = Array.isArray(account.balances) ? account.balances : []
  if (balances.length > 0) return balances[0].value
  return undefined
}

// ==================== 增强模型选择器 ====================

/** provider chip 悬停详情：各窗口余量 + 重置倒计时，或余额明细。 */
function quotaTipOf(account: PlanAccount | undefined | null): string | undefined {
  if (account === undefined || account === null) return undefined
  if (account.error !== undefined) return '查询失败：' + String(account.error)
  var parts: string[] = []
  var windows = Array.isArray(account.windows) ? account.windows : []
  for (var i = 0; i < windows.length; i += 1) {
    if (typeof windows[i].percentLeft !== 'number') continue
    var text = shortWindowLabel(windows[i].window) + '余量 ' + String(windows[i].percentLeft) + '%'
    if (windows[i].resetAt !== undefined && windows[i].resetAt !== '') {
      text += ' ◷ ' + resetCountdownText(windows[i].resetAt)
    }
    parts.push(text)
  }
  var balances = Array.isArray(account.balances) ? account.balances : []
  for (var j = 0; j < balances.length; j += 1) parts.push(balances[j].label + ' ' + balances[j].value)
  return parts.length > 0 ? parts.join(' ｜ ') : undefined
}

/** 官方同款对勾（IconCheckOutline16 的 SVG 拷贝）。 */
function checkSvg() {
  return react.createElement(
    'svg',
    { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', style: { display: 'block' } },
    react.createElement('path', {
      fill: 'currentColor',
      d: 'M15.0498 3.92579L8.49512 12.3818C8.25774 12.6881 8.04517 12.9645 7.84668 13.1689'
        + 'C7.63957 13.3823 7.38732 13.5841 7.04492 13.6719C6.86373 13.7183 6.6757 13.7346 6.48926 13.7197'
        + 'C6.13666 13.6915 5.8528 13.5355 5.6123 13.3604C5.38201 13.1926 5.12573 12.9567 4.83984 12.6953'
        + 'L1.03125 9.21289L1.96875 8.1875L5.77734 11.6699C6.08684 11.9529 6.27773 12.1249 6.43066 12.2363'
        + 'C6.50183 12.2882 6.54699 12.3135 6.57324 12.3252C6.58525 12.3305 6.59269 12.3322 6.5957 12.333'
        + 'C6.59802 12.3336 6.59961 12.334 6.59961 12.334C6.63317 12.3367 6.66758 12.3335 6.7002 12.3252'
        + 'C6.7002 12.3252 6.70211 12.3251 6.7041 12.3242C6.70698 12.3229 6.71348 12.319 6.72461 12.3115'
        + 'C6.74849 12.2956 6.78843 12.2642 6.84961 12.2012C6.98138 12.0654 7.13957 11.8628 7.39648 11.5313'
        + 'L13.9502 3.07422L15.0498 3.92579Z',
    }),
  )
}

/** 官方同款右指 Chevron（IconChevronRightOutline14 的 SVG 拷贝）。 */
function chevronRightSvg() {
  return react.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', style: { display: 'block' } },
    react.createElement('path', {
      fill: 'currentColor',
      d: 'M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828'
        + 'C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25'
        + 'C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727'
        + 'L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124'
        + ' 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895'
        + ' 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24848 6.59876 8.07732 6.42595'
        + ' 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z',
    }),
  )
}

/** conversation.input.model 座位的注入面：会话 + 官方目录 store + 两个动作（见 directoryFace）。 */
interface ModelSwitchSeatProps {
  sessionId: string
  sessions?: SessionsFace | undefined
  directory?: SnapshotStore
  load?: () => unknown
  select?: (selection: ModelSelection) => Promise<boolean>
}

/** 推理等级面板里的一行：服务商默认（effort 为 undefined）或目录声明的某个档位。 */
interface EffortChoice {
  effort?: string
  label: string
}

/**
 * composer 的模型座位（仿官方 ModelSelect 两级层级）：
 *   触发器胶囊（模型名 + 思考强度 + Chevron）→ 根菜单两行（模型 / 推理等级，值右对齐 + ›）
 *   → 模型面板（我们的增强：搜索 + provider 过滤 + 能力徽章，样式走官方 token）
 *   → 推理等级面板（服务商默认 + 档位，选中打勾）。
 */
function ModelSwitchSeat(props: ModelSwitchSeatProps) {
  var sessionId = props.sessionId
  var sessions = props.sessions

  var openState = react.useState(false)
  var open = openState[0]
  var setOpen = openState[1]
  var paneState = react.useState('root')
  var pane = paneState[0]
  var setPane = paneState[1]
  var queryState = react.useState('')
  var query = queryState[0]
  var setQuery = queryState[1]
  var filterState = react.useState(null)
  var providerFilter = filterState[0]
  var setProviderFilter = filterState[1]
  var groupsState = react.useState([])
  var httpGroups = groupsState[0]
  var setGroups = groupsState[1]
  // 同一次目录 RPC 里的宿主默认选择：会话还没选过模型时的落点（官方口径）
  var httpDefaultState = react.useState(undefined)
  var httpDefault = httpDefaultState[0]
  var setHttpDefault = httpDefaultState[1]
  var errorState = react.useState(null)
  var error = errorState[0]
  var setError = errorState[1]
  var busyState = react.useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]
  var accountsState = react.useState({})
  var accounts = accountsState[0]
  var setAccounts = accountsState[1]
  var detailsState = react.useState({})
  var detailsById = detailsState[0]
  var setDetailsById = detailsState[1]
  var rootRef = react.useRef(null)
  var searchRef = react.useRef(null)

  // 官方目录服务（inject 面给过来的那个 store）——首选数据源
  var directorySnapshot = usePolledSnapshot(props.directory, 2000)
  recordDiagnostic('seat', {
    hasInjectFace: props.directory !== undefined,
    status: directorySnapshot === undefined ? null : directorySnapshot.status,
    current: directorySnapshot === undefined ? null : directorySnapshot.current,
    groupCount: directorySnapshot === undefined || !Array.isArray(directorySnapshot.groups)
      ? null
      : directorySnapshot.groups.length,
    error: directorySnapshot === undefined ? null : directorySnapshot.error,
  })
  var directoryGroups = directorySnapshot !== undefined && Array.isArray(directorySnapshot.groups)
    ? normalizeGroups(directorySnapshot.groups)
    : undefined
  var groups = directoryGroups !== undefined && directoryGroups.length > 0 ? directoryGroups : httpGroups
  var directoryCurrent = directorySnapshot !== undefined ? (directorySnapshot.current as ModelSelection | undefined) : undefined
  var directoryError = directorySnapshot !== undefined ? directorySnapshot.error : undefined

  // 兜底：没有官方服务时用会话投影读当前选择
  var selectionCellRef = react.useMemo(
    function () {
      return selectionCell(sessions, sessionId)
    },
    [sessions, sessionId],
  )
  var selectionState = react.useState(undefined)
  var projectionSelection = selectionState[0]
  var setSelection = selectionState[1]
  // 乐观选择：提交成功后立即生效，不等投影/目录回传（plan-test 无目录服务时投影可能滞后或不回传）
  var lastSelState = react.useState(null)
  var lastSel = lastSelState[0]
  var setLastSel = lastSelState[1]
  // 当前选择：有目录服务时以它为准（官方那边 store.current 就是
  // `projected.next ?? catalog.default`，已经算好默认落点）；
  // 没有目录服务（plan-test）时按官方同一口径拼：本地乐观值 → 会话投影 → 宿主默认
  var selection: ModelSelection | undefined = directoryCurrent !== undefined && directoryCurrent !== null
    ? directoryCurrent
    : (lastSel ?? projectionSelection ?? httpDefault)

  react.useEffect(
    function () {
      function read() {
        var next: ModelSelection | undefined
        try {
          next = unwrap(selectionCellRef.getSnapshot())
        } catch (cause) {
          next = undefined /* 投影读不到就当作没有当前选择 */
        }
        setSelection(next)
        // 投影追上本地乐观值（同一个 provider/model）就交棒：官方那边没有本地乐观值，
        // 一切以投影为准；不交棒的话 lastSel 会一直压着投影，宿主改了什么也显示不出来
        setLastSel(function (prev: ModelSelection | null | undefined) {
          if (prev === null || prev === undefined || next === undefined) return prev
          return prev.provider === next.provider && prev.model === next.model ? null : prev
        })
      }
      read()
      var timer = setInterval(read, 5000)
      return function () {
        clearInterval(timer)
      }
    },
    [selectionCellRef],
  )

  react.useEffect(
    function () {
      var cancelled = false
      if (typeof props.load === 'function') {
        props.load()
      } else {
        loadModelCatalog()
          .then(function (next) {
            if (cancelled) return
            setGroups(next.groups)
            setHttpDefault(next.default)
          })
          .catch(function (cause) {
            if (!cancelled) setError(cause && cause.message ? String(cause.message) : String(cause))
          })
      }
      // 能力徽章/上下文标注的数据源：生效 pi-ai 包的模型详情
      loadModelDetailMap()
        .then(function (map) {
          if (!cancelled) setDetailsById(map)
        })
        .catch(function () { /* 详情拿不到就只显示名称 */ })
      return function () {
        cancelled = true
      }
    },
    [props.load],
  )

  // 打开时刷新目录、聚焦搜索框；点外部 / Escape 关闭（Escape 先退回根面板）
  react.useEffect(
    function () {
      if (!open) return undefined
      if (typeof props.load === 'function') props.load()
      if (pane === 'model' && searchRef.current !== null && searchRef.current !== undefined) {
        try {
          searchRef.current.focus()
        } catch (cause) { /* 聚焦失败无所谓 */ }
      }
      function onPointerDown(event: PointerEvent) {
        if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
      }
      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          if (pane !== 'root') setPane('root')
          else setOpen(false)
        }
      }
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      // provider chips 的余量指示器：打开菜单时顺手拉一次额度
      loadPlanStatus(false)
        .then(function (payload) {
          setAccounts(accountsById(payload))
        })
        .catch(function () { /* 额度拿不到就不显示指示器 */ })
      return function () {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    },
    [open, pane, props.load],
  )

  function show() {
    setPane('root')
    setProviderFilter(null)
    setQuery('')
    setOpen(true)
  }

  /** 当前选择对应的 model 与思考强度信息。 */
  var currentModel: CatalogModel | undefined = undefined
  if (selection !== undefined && selection !== null) {
    currentModel = findModel(groups, selection.provider, selection.model)
  }
  var reasoning = currentModel !== undefined ? currentModel.reasoning : undefined
  // 会话已经定下的档位单独拿出来：目录里没有这个模型时（拿不到 reasoning）
  // 也要按它显示，否则整个思考强度会被吞掉，只剩下模型名
  var chosenEffort = selection !== undefined && selection !== null
    && typeof selection.reasoningEffort === 'string'
    ? selection.reasoningEffort
    : undefined
  var effectiveEffort = chosenEffort !== undefined
    ? chosenEffort
    : (reasoning !== undefined ? defaultEffortOf(currentModel) : undefined)
  var effortText = reasoningTextOf(chosenEffort, reasoning, defaultEffortOf(currentModel))

  function submit(selectionRequest: ModelSelection): Promise<boolean> {
    if (busy) return Promise.resolve(false)
    setBusy(true)
    var request = typeof props.select === 'function'
      ? props.select(selectionRequest)
      : submitSelection(sessionId, selectionRequest.provider, selectionRequest.model, selectionRequest.reasoningEffort)
    return request
      .then(function (ok) {
        if (ok === false) throw new Error('宿主拒绝了这次切换')
        setError(null)
        setLastSel(selectionRequest)
        setOpen(false)
        setPane('root')
        return true
      })
      .catch(function (cause) {
        setError(cause && cause.message ? String(cause.message) : String(cause))
        return false
      })
      .then(function (ok) {
        setBusy(false)
        return ok
      })
  }

  function chooseModel(groupId: string, modelId: string) {
    if (selection !== undefined && selection !== null
      && selection.provider === groupId && selection.model === modelId) {
      // 点的还是当前模型：退回根面板（官方行为，不关闭）
      setPane('root')
      return
    }
    var model = findModel(groups, groupId, modelId)
    // 只提交 provider/model，档位交给宿主（官方同款：宿主 resolveCallConfig 决定，
    // 再把最终选择回写投影）。自己塞一个档位等于伪造一次「用户选了这档」
    var req: ModelSelection = { provider: groupId, model: modelId }
    // 无推理档位的模型：选完即关；有的：提交后退回根面板，让用户接着调推理等级
    if (model === undefined || model.reasoning === undefined) {
      void submit(req)
      return
    }
    if (busy) return
    setBusy(true)
    var request = typeof props.select === 'function'
      ? props.select(req)
      : submitSelection(sessionId, req.provider, req.model, req.reasoningEffort)
    void request
      .then(function (ok) {
        if (ok === false) throw new Error('宿主拒绝了这次切换')
        setError(null)
        setLastSel(req)
        setPane('root')
        return true
      })
      .catch(function (cause) {
        setError(cause && cause.message ? String(cause.message) : String(cause))
        return false
      })
      .then(function () {
        setBusy(false)
      })
  }

  function chooseEffort(effort: string | undefined) {
    if (selection === undefined || selection === null) return
    if (effort === effectiveEffort) {
      setOpen(false)
      return
    }
    var req: ModelSelection = { provider: selection.provider, model: selection.model }
    if (effort !== undefined) req.reasoningEffort = effort
    void submit(req)
  }

  var waiting = (selection === undefined || selection === null) && directorySnapshot !== undefined && directorySnapshot.status === 'loading'
  // 模型一律显示 供应商id/模型id：和展开后的 provider chips、分组标题、模型行同一套 id
  var modelLabel = waiting
    ? '加载中…'
    : (selection === undefined || selection === null
        ? '选择模型'
        : String(selection.provider) + '/' + String(selection.model))
  var triggerText = effortText === undefined ? modelLabel : modelLabel + ' · ' + effortText

  var trigger = react.createElement(
    'button',
    {
      type: 'button',
      className: 'ms_trigger',
      'aria-expanded': open ? 'true' : 'false',
      title: triggerText,
      onClick: function () {
        if (open) setOpen(false)
        else show()
      },
    },
    react.createElement('span', { className: 'ms_tLabel' }, modelLabel),
    effortText === undefined ? null : react.createElement('span', { className: 'ms_tEffort' }, effortText),
    react.createElement('span', { className: 'ms_chev' + (open ? ' ms_chevOpen' : '') }, caretSvg(open)),
  )

  if (!open) return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger)

  // ---- 根面板：模型 / 推理等级 两行（值右对齐 + ›）----
  var rootPane = react.createElement(
    'button',
    { type: 'button', className: 'ms_cell', onClick: function () { setPane('model') } },
    react.createElement('span', { className: 'ms_cellLabel' }, '模型'),
    react.createElement('span', { className: 'ms_cellValue' }, modelLabel),
    react.createElement('span', { className: 'ms_cellChev' }, chevronRightSvg()),
  )
  // 档位面板要靠目录里的档位表才能列出可选项：目录没有这个模型时只读显示会话已定的档位
  var canPickEffort = reasoning !== undefined && effortText !== undefined
  var effortCell = react.createElement(
    'button',
    {
      type: 'button',
      className: 'ms_cell',
      disabled: !canPickEffort,
      style: canPickEffort ? undefined : { cursor: 'default', opacity: 0.55 },
      title: reasoning === undefined && effortText !== undefined
        ? '当前模型不在模型目录里，只能显示会话已定的档位'
        : undefined,
      onClick: canPickEffort ? function () { setPane('effort') } : undefined,
    },
    react.createElement('span', { className: 'ms_cellLabel' }, '推理等级'),
    react.createElement('span', { className: 'ms_cellValue' }, effortText === undefined ? '选择模型后可用' : effortText),
    react.createElement('span', { className: 'ms_cellChev' }, chevronRightSvg()),
  )

  // ---- 模型面板：搜索 + provider 过滤 + 分组列表（能力徽章/上下文，选中打勾）----
  var needle = query.trim().toLowerCase()
  var modelPane = null
  if (pane === 'model') {
    var chips = [
      react.createElement(
        'button',
        {
          key: '__all',
          type: 'button',
          className: 'mp_chip',
          'data-on': providerFilter === null ? '1' : '0',
          onClick: function () { setProviderFilter(null) },
        },
        '全部 ' + String(groups.length),
      ),
    ]
    for (var ck = 0; ck < groups.length; ck += 1) {
      ;(function (g) {
        var acc = accounts[g.id]
        var minP = worstPercent(acc)
        var quotaText = minP !== undefined
          ? String(minP) + '%'
          : (acc !== undefined && acc !== null && Array.isArray(acc.balances) && acc.balances.length > 0
              ? acc.balances[0].value
              : undefined)
        chips.push(
          react.createElement(
            'button',
            {
              key: g.id,
              type: 'button',
              className: 'mp_chip',
              'data-on': providerFilter === g.id ? '1' : '0',
              title: quotaTipOf(acc) ?? g.id,
              onClick: function () { setProviderFilter(providerFilter === g.id ? null : g.id) },
            },
            react.createElement('span', { className: dotClass(acc) }),
            g.id,
            quotaText === undefined
              ? null
              : react.createElement('span', { style: { color: toneColor(minP) } }, ' ' + quotaText),
          ),
        )
      })(groups[ck])
    }
    var groupSections = []
    for (var gs = 0; gs < groups.length; gs += 1) {
      ;(function (g) {
        if (providerFilter !== null && g.id !== providerFilter) return
        var sectionRows = []
        for (var gm = 0; gm < g.models.length; gm += 1) {
          ;(function (model) {
            if (needle !== '' && fuzzyMatch(query, model.id + ' ' + model.name + ' ' + g.name + ' ' + g.id) !== true) return
            var isCurrent = selection !== undefined && selection !== null
              && selection.provider === g.id && selection.model === model.id
            var detail = detailsById[model.id]
            var caps = []
            if (detail !== undefined) {
              if (detail.vision === true) caps.push(react.createElement('span', { key: 'v', className: 'pv_capMini pv_capVision' }, '视觉'))
              if (detail.reasoning === true) caps.push(react.createElement('span', { key: 'r', className: 'pv_capMini pv_capReason' }, '推理'))
            }
            var ctx = formatContext(detail !== undefined && detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow)
            sectionRows.push(
              react.createElement(
                'button',
                {
                  key: g.id + '/' + model.id,
                  type: 'button',
                  className: 'ms_option',
                  disabled: busy || isCurrent,
                  title: g.id + '/' + model.id,
                  onClick: function () { chooseModel(g.id, model.id) },
                },
                react.createElement('span', { className: 'ms_name' }, model.id),
                react.createElement('span', { className: 'ms_capsCol' }, caps),
                react.createElement('span', { className: 'ms_ctxCol' }, ctx === undefined ? '' : ctx),
                react.createElement('span', { className: 'ms_check' }, isCurrent ? checkSvg() : null),
              ),
            )
          })(g.models[gm])
        }
        if (sectionRows.length === 0) return
        groupSections.push(
          react.createElement(
            'div',
            { className: 'ms_group', key: g.id },
            react.createElement('div', { className: 'ms_groupTitle' }, g.id),
            sectionRows,
          ),
        )
      })(groups[gs])
    }
    modelPane = react.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', minHeight: 0 } },
      react.createElement('input', {
        ref: searchRef,
        className: 'mp_search',
        type: 'text',
        placeholder: '搜索模型或 provider',
        value: query,
        onChange: function (event: FieldEvent) { setQuery(event.target.value) },
      }),
      groups.length > 1 ? react.createElement('div', { className: 'mp_chips' }, chips) : null,
      directoryError !== undefined && directoryError !== null && typeof directoryError === 'string'
        ? react.createElement('div', { className: 'ms_status' }, String(directoryError))
        : null,
      react.createElement(
        'div',
        { className: 'ms_scroll' },
        groupSections,
        groupSections.length === 0
          ? react.createElement('div', { className: 'ms_status' }, needle === '' ? '没有可选模型' : '没有匹配「' + query + '」的模型')
          : null,
      ),
    )
  }

  // ---- 推理等级面板：服务商默认 + 档位，选中打勾 ----
  var effortPane = null
  if (pane === 'effort' && reasoning !== undefined) {
    var choices: EffortChoice[] = []
    if (defaultEffortOf(currentModel) === undefined) {
      choices.push({ effort: undefined, label: '服务商默认' })
    }
    var effList = reasoning.efforts
    for (var ec = 0; ec < effList.length; ec += 1) {
      choices.push({ effort: effList[ec], label: effortLabel(effList[ec]) ?? effList[ec] })
    }
    var effortRows = choices.map(function (level) {
      var isCur = effectiveEffort === level.effort
      return react.createElement(
        'button',
        {
          key: level.label,
          type: 'button',
          className: 'ms_option',
          disabled: busy || isCur,
          onClick: function () { chooseEffort(level.effort) },
        },
        react.createElement('span', { className: 'ms_name' }, level.label),
        react.createElement('span', { className: 'ms_check' }, isCur ? checkSvg() : null),
      )
    })
    effortPane = react.createElement('div', { className: 'ms_scroll' }, effortRows)
  }

  var menuBody = pane === 'model' ? modelPane : pane === 'effort' ? effortPane : react.createElement('div', { style: { display: 'flex', flexDirection: 'column' } }, rootPane, effortCell)

  var menu = react.createElement(
    'div',
    { className: 'ms_menu' },
    menuBody,
    error === null ? null : react.createElement('div', { className: 'plan_note plan_badText' }, error),
  )

  return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger, menu)
}

// ==================== 设置页 Provider 标签 ====================

/** 当前用的是哪一档 pi-ai。宿主报的 source：版本号 / 'dependency' / 'dsh'。 */
function piAiSourceLabel(source: unknown): string {
  if (source === 'dependency') return '兜底依赖'
  if (source === 'dsh') return 'dsh 自带'
  return '热更新'
}

function piAiSourceHint(source: unknown): string {
  if (source === 'dependency') return '热更新那份没下来或兼容性检查没过，用的是 vendor/package.json 锁定的兜底版本'
  if (source === 'dsh') return '自己那份还没就位，暂时用 dsh 装的那份（版本较旧）'
  return 'vendor/pi-ai/<版本>/ 里热更新下来的版本'
}

/**
 * 「pi-ai 桥接」标签页的明细行。纯函数，只返回数据，组件照着渲染——这样能离线测，
 * 也免得一堆拼字符串的逻辑埋在组件里。
 * @param bridge - /provider/status 的 bridge 段（当前加载的那份）。
 * @param update - 同上的 update 段（上游最新 / 待生效 / 体检没过的）。
 * @returns `[{ key, text, value?, title?, warn? }]`；value 是右侧的次要文字。
 */
function piAiBridgeRows(bridge: unknown, update: unknown): BridgeRow[] {
  var rows: BridgeRow[] = []
  if (bridge === undefined || bridge === null) return rows
  var bridgeRecord = bridge as AnyRecord
  if (bridgeRecord.active !== true) {
    rows.push({ key: 'err', text: String(bridgeRecord.error), bad: true })
    return rows
  }
  rows.push({
    key: 'pi',
    text: '当前 pi-ai 版本',
    value: String(bridgeRecord.piAiVersion) + '（' + piAiSourceLabel(bridgeRecord.source) + '）',
    title: piAiSourceHint(bridgeRecord.source),
  })
  // 体检没执行（bundle 的 import 需求解析不出）：这份 pi-ai 是靠「目录存在」放行的，没验证过
  if (bridgeRecord.probeUnverified === true) {
    rows.push({
      key: 'unverified',
      text: '当前这份 pi-ai 没做过兼容性体检',
      value: '看原因',
      title: '解析不出桥接副本的 import 需求（上游改了打包格式），按目录存在放行。建议关注 pi-ai 发版说明',
      warn: true,
    })
  }
  // 体检没过的候选：为什么没用上更新的那版
  var rejected = Array.isArray(bridgeRecord.rejected) ? bridgeRecord.rejected : []
  for (var i = 0; i < rejected.length; i += 1) {
    var skipped = rejected[i] as AnyRecord
    rows.push({
      key: 'skip-' + i,
      text: '跳过 ' + String(skipped.version) + '：兼容性检查没通过',
      value: '看原因',
      title: String(skipped.error),
      warn: true,
    })
  }
  // 最近一次检查更新的结论
  if (update !== undefined && update !== null) {
    var updateRecord = update as AnyRecord
    if (updateRecord.pending !== undefined) {
      rows.push({ key: 'pending', text: '已下载 ' + String(updateRecord.pending) + '，验证通过（完整性 + 兼容性），重启 dsh 后生效', warn: true })
    }
    if (updateRecord.rejected !== undefined && updateRecord.rejected !== null) {
      var rejectedLatest = updateRecord.rejected as AnyRecord
      rows.push({
        key: 'rejected',
        text: String(rejectedLatest.version) + ' 验证没通过，已跳过（不会切过去）',
        value: '看原因',
        title: String(rejectedLatest.error),
        warn: true,
      })
    }
  }
  return rows
}

/** 上游那一行的文字（右侧按钮由组件补）。 */
function piAiUpstreamText(update: unknown): string {
  if (update === undefined || update === null) return '上游 未检查'
  var updateRecord = update as AnyRecord
  if (updateRecord.latest === undefined) return '上游 未检查'
  var when = updateRecord.lastCheck === undefined ? '' : '（检查于 ' + relativeTime(updateRecord.lastCheck) + '）'
  return '上游 ' + String(updateRecord.latest) + when
}

/** 窗口短名（卡片头部摘要）：5 小时窗口→5h，每周/订阅周期→7d（对齐 CC Switch 的 7 天口径）。 */
function shortWindowLabel(name: unknown): string {
  var text = String(name ?? '')
  if (text.indexOf('5 小时') !== -1 || text.indexOf('5小时') !== -1) return '5h'
  if (text.indexOf('每') !== -1 || text.indexOf('订阅') !== -1 || text.indexOf('周') !== -1) return '7d'
  return text === '' ? '窗口' : text.slice(0, 4)
}

/** 重置倒计时压缩格式（最多两个单位，零尾不显示）：34m / 5h / 5h33m / 3d5h / 4d。 */
function resetCountdownText(iso: unknown): string {
  if (typeof iso !== 'string' || iso === '') return ''
  var time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  var delta = time - Date.now()
  if (delta <= 0) return '即将重置'
  var minutes = Math.round(delta / 60000)
  if (minutes < 1) return '即将重置'
  if (minutes < 60) return String(minutes) + 'm'
  var hours = Math.floor(minutes / 60)
  var min = minutes % 60
  if (hours < 24) return min > 0 ? String(hours) + 'h' + String(min) + 'm' : String(hours) + 'h'
  var days = Math.floor(hours / 24)
  var restH = hours % 24
  return restH > 0 ? String(days) + 'd' + String(restH) + 'h' : String(days) + 'd'
}

/** 卡片头部摘要：直给最关键信息——coding plan 显示各窗口余量，API 显示余额。
 *  顺序：5 小时窗在前、订阅周期在后，两组之间带分割线。 */
function headlineChips(account: PlanAccount | undefined | null): HeadlineChip[] {
  if (account === undefined || account === null) return [{ text: '无数据', percent: undefined }]
  if (account.authConfigured === false) return [{ text: '未配置 key', percent: 0 }]
  if (account.error !== undefined) return [{ text: '查询失败', percent: 0 }]
  if (account.kind === 'unsupported') return []
  if (account.kind === 'unknown-provider') return [{ text: '无适配器', percent: undefined }]
  var windows = Array.isArray(account.windows) ? account.windows : []
  var fiveHour: HeadlineChip[] = []
  var others: HeadlineChip[] = []
  for (var i = 0; i < windows.length; i += 1) {
    if (typeof windows[i].percentLeft !== 'number') continue
    var chip: HeadlineChip = {
      label: shortWindowLabel(windows[i].window),
      text: String(windows[i].percentLeft) + '%',
      percent: windows[i].percentLeft,
      reset: windows[i].resetAt,
    }
    if (/5\s*小时/.test(String(windows[i].window))) fiveHour.push(chip)
    else others.push(chip)
  }
  var chips: HeadlineChip[] = []
  for (var f = 0; f < fiveHour.length; f += 1) chips.push(fiveHour[f])
  if (fiveHour.length > 0 && others.length > 0) chips.push({ sep: true })
  for (var o = 0; o < others.length; o += 1) chips.push(others[o])
  if (chips.length > 0) return chips
  var balances = Array.isArray(account.balances) ? account.balances : []
  if (balances.length > 0) chips.push({ text: String(balances[0].value), percent: undefined })
  if (chips.length > 0) return chips
  return [{ text: summaryOf(account), percent: undefined }]
}

/** 链接显示文本：去掉协议和末尾斜杠。 */
function linkTextOf(url: unknown): string {
  return String(url).replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** 官方同款 Chevron（IconChevronDownOutline14 的 SVG 逐字节拷贝），open 时旋转 180°。 */
function caretSvg(open: boolean) {
  return react.createElement(
    'svg',
    {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className: 'pv_pcCaret' + (open ? ' pv_pcCaretOpen' : ''),
      style: { display: 'block' },
    },
    react.createElement('path', {
      fill: 'currentColor',
      d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785'
        + 'C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602'
        + 'C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137'
        + 'L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732'
        + '6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047'
        + 'C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623'
        + 'C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z',
    }),
  )
}

/** 模型行：名称 + 能力徽章（视觉/推理/视频）+ 上下文标签，悬浮出 Cherry 式详情卡。 */
function modelRow(model: CatalogModel, account: PlanAccount, detailsById: Record<string, ModelDetail> | undefined | null) {
  var detail = detailsById === undefined || detailsById === null ? undefined : detailsById[model.id]
  var cw = detail !== undefined && detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow
  var ctx = formatContext(cw)
  var caps = []
  if (detail !== undefined) {
    if (detail.vision === true) caps.push(react.createElement('span', { key: 'v', className: 'pv_capMini pv_capVision' }, '视觉'))
    if (detail.reasoning === true) caps.push(react.createElement('span', { key: 'r', className: 'pv_capMini pv_capReason' }, '推理'))
    if (detail.video === true) caps.push(react.createElement('span', { key: 't', className: 'pv_capMini pv_capVideo' }, '视频'))
  }
  return react.createElement(
    'div',
    { className: 'pv_mRow', key: 'm-' + model.id },
    react.createElement('span', { className: 'pv_mId', title: model.id }, model.id),
    react.createElement('span', { className: 'pv_mName', title: model.name }, model.name),
    react.createElement('span', { className: 'pv_mCaps' }, caps),
    react.createElement('span', { className: 'pv_mCtx' }, ctx === undefined ? '' : ctx),
    modelTip(model, account, detail),
  )
}

/** Cherry 式模型详情卡：服务商 / 模型 ID / 能力标记 / 上下文 / 最大输出 / 思维链。 */
function modelTip(model: CatalogModel, account: PlanAccount, detail: ModelDetail | undefined) {
  var rows = [react.createElement('div', { className: 'pv_tipTitle', key: 't' }, model.name)]
  rows.push(tipLine('服务商', shortName(account), 'p'))
  rows.push(tipLine('模型 ID', model.id, 'id'))
  if (detail !== undefined) {
    var caps = []
    if (detail.vision === true) caps.push(tipCap('视觉', 'pv_capVision'))
    if (detail.video === true) caps.push(tipCap('视频', 'pv_capVideo'))
    if (detail.reasoning === true) caps.push(tipCap('推理', 'pv_capReason'))
    if (caps.length > 0) rows.push(react.createElement('div', { className: 'pv_tipCaps', key: 'c' }, caps))
    if (detail.contextWindow !== undefined) rows.push(tipLine('上下文窗口', detail.contextWindow.toLocaleString('en-US'), 'cw'))
    if (detail.maxTokens !== undefined) rows.push(tipLine('最大输出', detail.maxTokens.toLocaleString('en-US'), 'mt'))
    rows.push(tipLine('思维链', detail.reasoning === true
      ? (Array.isArray(detail.thinkingLevels) && detail.thinkingLevels.length > 0 ? detail.thinkingLevels.join('、') : '自动')
      : '关闭', 'tk'))
  } else {
    rows.push(react.createElement('div', { className: 'pv_tipDim', key: 'dim' }, '该模型没有本地元数据'))
  }
  return react.createElement('div', { className: 'pv_tip' }, rows)
}

function tipLine(label: unknown, value: unknown, key: unknown) {
  return react.createElement(
    'div',
    { className: 'pv_tipRow', key: String(key) },
    react.createElement('span', { className: 'pv_tipLabel' }, label),
    react.createElement('span', null, String(value)),
  )
}

function tipCap(text: unknown, cls: string) {
  return react.createElement('span', { className: 'pv_cap ' + cls }, text)
}

/** 模型过滤的模糊匹配：子串 → 缩写子序列（ds→deepseek）→ 编辑距离容错（deapseek→deepseek）。 */
function fuzzyMatch(query: unknown, text: unknown): boolean {
  var q = String(query).toLowerCase().trim()
  if (q === '') return true
  var words = q.split(/\s+/)
  for (var w = 0; w < words.length; w += 1) {
    if (!fuzzyWord(words[w], String(text).toLowerCase())) return false
  }
  return true
}

function fuzzyWord(word: string, haystack: string): boolean {
  if (word === '') return true
  if (haystack.indexOf(word) !== -1) return true
  // 缩写：子序列匹配（短查询才启用，避免噪音；ds/dsk/k35/v4pro 这类）
  if (word.length <= 5 && isSubsequence(word, haystack)) return true
  // 容错：对分词结果算 Damerau-Levenshtein 距离（deapseek→deepseek 是相邻交换，距离 1）
  // 注意：不切分「.」（k2.8 是版本号整体），且 3 个字符以下不做容错（k3≠k2，避免误命中）
  var tokens = haystack.split(/[\s\-_/:]+/)
  for (var i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === '') continue
    var distance = word.length >= 3 ? damerauLevenshtein(word, tokens[i]) : 99
    if (distance <= 1) return true
    if (word.length >= 6 && distance <= 2) return true
  }
  // 被拆散的整串再试一次（deep+seek 拼回 deepseek）
  var joined = tokens.join('')
  var joinedDistance = word.length >= 3 ? damerauLevenshtein(word, joined) : 99
  if (joinedDistance <= 1) return true
  if (word.length >= 6 && joinedDistance <= 2) return true
  return false
}

function isSubsequence(needle: string, haystack: string): boolean {
  var i = 0
  for (var j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack.charAt(j) === needle.charAt(i)) i += 1
  }
  return i === needle.length
}

/** Damerau-Levenshtein 编辑距离（含相邻交换），O(n·m)——词都很短，无所谓。 */
function damerauLevenshtein(a: string, b: string): number {
  var la = a.length
  var lb = b.length
  if (Math.abs(la - lb) > 2) return 99
  var d: number[][] = []
  for (var i = 0; i <= la; i += 1) {
    d.push(new Array(lb + 1).fill(0))
    d[i][0] = i
  }
  for (var j = 0; j <= lb; j += 1) d[0][j] = j
  for (var i = 1; i <= la; i += 1) {
    for (var j = 1; j <= lb; j += 1) {
      var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
      var best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
        best = Math.min(best, d[i - 2][j - 2] + 1)
      }
      d[i][j] = best
    }
  }
  return d[la][lb]
}

/** 单个摘要 chip：「5h余量:90% 34min后重置」；余额类无标签只显示金额；sep 为组间分割线。 */
function headlineChip(chip: HeadlineChip, key: number) {
  if (chip.sep === true) {
    return react.createElement('span', { key: 'sep' + String(key), className: 'pv_chipSep' })
  }
  if (chip.label === undefined || chip.label === null) {
    // 余额类（API 按量）：无窗口标签，直接显示金额
    return react.createElement(
      'span',
      { key: String(key), className: 'pv_chipItem' },
      react.createElement('span', { key: 't', style: { color: toneColor(chip.percent) } }, chip.text),
    )
  }
  var parts = [
    react.createElement('span', { key: 'l', className: 'pv_chipLabel' }, chip.label + ':'),
    react.createElement('span', { key: 't', style: { color: toneColor(chip.percent) } }, chip.text),
  ]
  if (chip.reset !== undefined && chip.reset !== '') {
    parts.push(react.createElement('span', { key: 'r', className: 'pv_chipReset' }, ' ◷ ' + resetCountdownText(chip.reset)))
  }
  return react.createElement('span', { key: String(key), className: 'pv_chipItem' }, parts)
}

/** 添加 provider 面板的注入面。 */
interface AddProviderPanelProps {
  presets?: unknown
  onAdded?: () => void
}

/**
 * 添加 provider：选预设 → 填密钥/端点 → 测试 → 通过才能添加。
 * 测试走官方 llm/discoverModels 草稿探测（不落盘）；写入走官方同一套控制器
 * （settings/mutate 写 llm-pi-ai.providers 段 + credentials/set 存密钥），
 * 与官方 Models 页的存储完全同源。
 */
function AddProviderPanel(props: AddProviderPanelProps) {
  var presets: ProviderPreset[] = Array.isArray(props.presets) ? props.presets : []
  var openState = react.useState(false)
  var open = openState[0]
  var setOpen = openState[1]
  var formState = react.useState({ routeId: '', key: '', baseURL: '', api: '', apiKeyEnv: '', websiteUrl: undefined })
  var form = formState[0]
  var setForm = formState[1]
  var testState = react.useState({ phase: 'idle', message: '' })
  var test = testState[0]
  var setTest = testState[1]
  var busyState = react.useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]
  var noteState = react.useState(null)
  var note = noteState[0]
  var setNote = noteState[1]
  var pickRef = react.useRef(null)
  var pickOpenState = react.useState(false)
  var pickOpen = pickOpenState[0]
  var setPickOpen = pickOpenState[1]
  var pickFilterState = react.useState('')
  var pickFilter = pickFilterState[0]
  var setPickFilter = pickFilterState[1]

  // 供应商下拉：点外部关闭
  react.useEffect(
    function () {
      if (pickOpen !== true) return undefined
      function onPointerDown(event: PointerEvent) {
        if (pickRef.current !== null && pickRef.current.contains(event.target) === false) {
          setPickOpen(false)
        }
      }
      document.addEventListener('pointerdown', onPointerDown)
      return function () {
        document.removeEventListener('pointerdown', onPointerDown)
      }
    },
    [pickOpen],
  )

  function patchForm(patch: AnyRecord) {
    setForm(function (prev: AnyRecord) {
      return withKeys(prev, patch)
    })
  }
  function pickPreset(id: string) {
    var preset = findById(presets, id)
    if (preset === undefined) return
    patchForm({
      routeId: preset.id,
      baseURL: preset.baseURL,
      api: preset.api,
      apiKeyEnv: preset.apiKeyEnv,
      websiteUrl: preset.websiteUrl,
      key: '',
    })
    setTest({ phase: 'idle', message: '' })
    setNote(null)
  }
  function runTest() {
    if (form.routeId.trim() === '' || form.baseURL.trim() === '' || form.key.trim() === '') {
      setTest({ phase: 'fail', message: '路由 ID / API 地址 / API 密钥都要填' })
      return
    }
    setTest({ phase: 'run', message: '正在用这把密钥实连供应商探测模型…' })
    apiCall('llm/discoverModels', {
      settingsNs: 'llm-pi-ai',
      request: {
        provider: form.routeId.trim(),
        baseURL: form.baseURL.trim(),
        api: form.api,
        apiKey: form.key.trim(),
      },
    })
      .then(function (value) {
        var models = Array.isArray(value) ? value : (value !== null && typeof value === 'object' && Array.isArray(value.models) ? value.models : [])
        var names = []
        for (var i = 0; i < models.length && i < 3; i += 1) {
          var m = models[i]
          names.push(typeof m === 'string' ? m : String((m && (m.name || m.id)) || '?'))
        }
        setTest({
          phase: 'ok',
          message: '✓ 连通，发现 ' + String(models.length) + ' 个模型'
            + (names.length > 0 ? '：' + names.join('、') + (models.length > 3 ? ' …' : '') : ''),
        })
      })
      .catch(function (cause) {
        setTest({ phase: 'fail', message: '✗ ' + String(cause && cause.message ? cause.message : cause) })
      })
  }
  function add() {
    setBusy(true)
    setNote(null)
    var profile = { api: form.api, baseURL: form.baseURL.trim(), apiKeyEnv: form.apiKeyEnv.trim() }
    apiCall('settings/mutate', {
      ns: 'llm-pi-ai',
      ops: [{ op: 'set', path: ['providers', form.routeId.trim()], value: profile }],
    })
      .then(function () {
        return apiCall('credentials/set', { ref: form.apiKeyEnv.trim(), value: form.key.trim() })
      })
      .then(function () {
        setNote('已添加 ' + form.routeId.trim())
        setTest({ phase: 'idle', message: '' })
        patchForm({ key: '' })
        if (typeof props.onAdded === 'function') props.onAdded()
      })
      .catch(function (cause) {
        setNote('添加失败：' + String(cause && cause.message ? cause.message : cause)
          + '（配置可能已写入、仅密钥未存，检查后可重试）')
      })
      .then(function () {
        setBusy(false)
      })
  }

  if (!open) {
    return react.createElement(
      'button',
      { type: 'button', className: 'pv_addBtn', onClick: function () { setOpen(true) } },
      t('addProvider'),
    )
  }

  // 供应商可过滤下拉：fuzzyMatch 复用模型过滤那套（缩写/错拼都行）
  var pickedPreset = findById(presets, form.routeId)
  var pickedLabel = pickedPreset === undefined ? form.routeId : pickedPreset.label
  var customPicked = pickedPreset !== undefined && pickedPreset.custom === true
  var pickItems = []
  for (var pk = 0; pk < presets.length; pk += 1) {
    ;(function (preset) {
      if (pickFilter.trim() !== '' && fuzzyMatch(pickFilter, preset.label + ' ' + preset.id) !== true) return
      pickItems.push(
        react.createElement(
          'button',
          {
            key: preset.id,
            type: 'button',
            className: 'pv_pickItem',
            disabled: preset.configured === true,
            onClick: function () {
              pickPreset(preset.id)
              setPickOpen(false)
            },
          },
          preset.label,
          preset.configured === true
            ? react.createElement('span', { className: 'plan_tag', style: { marginLeft: '6px' } }, '已配置')
            : null,
        ),
      )
    })(presets[pk])
  }
  if (pickItems.length === 0) {
    pickItems.push(react.createElement('div', { className: 'pv_pickEmpty', key: 'empty' }, '没有匹配的供应商'))
  }

  return react.createElement(
    'div',
    { className: 'pv_pc' },
    react.createElement('div', { className: 'pv_pcBody', style: { borderTop: '0', paddingTop: '10px', gap: '6px' } },
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, '供应商'),
        react.createElement(
          'span',
          { className: 'pv_pick', ref: pickRef },
          react.createElement(
            'button',
            {
              type: 'button',
              className: 'pv_field pv_pickBtn',
              onClick: function () {
                setPickOpen(!pickOpen)
                setPickFilter('')
              },
            },
            react.createElement('span', null, form.routeId === '' ? '选择供应商…' : pickedLabel),
            react.createElement('span', { className: 'pv_pcCaret' }, pickOpen ? '▾' : '▸'),
          ),
          pickOpen === false
            ? null
            : react.createElement(
                'div',
                { className: 'pv_pickMenu' },
                react.createElement('input', {
                  className: 'pv_mFilter',
                  style: { width: '100%' },
                  type: 'text',
                  placeholder: '过滤供应商',
                  value: pickFilter,
                  autoFocus: true,
                  onChange: function (event: FieldEvent) { setPickFilter(event.target.value) },
                }),
                react.createElement('div', { className: 'pv_pickList' }, pickItems),
              ),
        ),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, '路由 ID'),
        react.createElement('input', {
          className: customPicked ? 'pv_field pv_key' : 'pv_field pv_ro',
          value: form.routeId,
          readOnly: customPicked !== true,
          title: customPicked ? '给这个网关起个名字（kebab-case）' : '由所选供应商决定',
          onChange: function (event: FieldEvent) {
            if (customPicked !== true) return
            patchForm({ routeId: event.target.value, apiKeyEnv: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY' })
          },
        }),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, 'API 密钥'),
        react.createElement('input', {
          className: 'pv_field pv_key',
          type: 'password',
          placeholder: 'sk-…',
          value: form.key,
          onChange: function (event: FieldEvent) { patchForm({ key: event.target.value }) },
        }),
        form.websiteUrl === undefined
          ? null
          : react.createElement('a', { className: 'pv_pcLink', href: form.websiteUrl, target: '_blank', rel: 'noreferrer', style: { marginLeft: '8px' } }, '获取密钥 ↗'),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, 'API 地址'),
        react.createElement('input', {
          className: form.baseURL === '' ? 'pv_field pv_key' : 'pv_field pv_ro',
          value: form.baseURL,
          readOnly: form.baseURL !== '',
          onChange: function (event: FieldEvent) { patchForm({ baseURL: event.target.value }) },
        }),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, '协议'),
        customPicked
          ? react.createElement(
              'select',
              {
                className: 'pv_field',
                value: form.api,
                onChange: function (event: FieldEvent) { patchForm({ api: event.target.value }) },
              },
              react.createElement('option', { value: 'openai-completions' }, 'OpenAI'),
              react.createElement('option', { value: 'anthropic-messages' }, 'Anthropic'),
            )
          : react.createElement('input', {
              className: 'pv_field pv_ro',
              value: form.api,
              readOnly: true,
            }),
      ),
      // 凭据名：单独一行小字（原先挤在协议行右侧像个按钮标签）
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, ''),
        react.createElement('span', { className: 'pv_hint' }, '密钥存为 ' + form.apiKeyEnv),
      ),
      react.createElement(
        'div',
        { className: 'pv_actRow' },
        react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: '0' }, disabled: test.phase === 'run', onClick: runTest },
          test.phase === 'run' ? '测试中…' : '测试'),
        react.createElement('button', {
          type: 'button',
          className: 'pv_action',
          disabled: busy || test.phase !== 'ok',
          title: test.phase === 'ok' ? '' : '先通过测试才能添加',
          onClick: add,
        }, busy ? '添加中…' : '添加到列表'),
        react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: 'auto' }, onClick: function () { setOpen(false); setTest({ phase: 'idle', message: '' }); setNote(null) } }, '取消'),
      ),
      test.message === ''
        ? null
        : react.createElement('div', { className: 'plan_note' + (test.phase === 'fail' ? ' plan_badText' : '') }, test.message),
      note === null ? null : react.createElement('div', { className: 'plan_note' }, note),
    ),
  )
}

/**
 * Provider 标签：CC Switch 式卡片。
 * 每个 provider 一张分割明显的卡片，头部一行直给最关键信息（coding plan 的
 * 5小时/订阅余量、API 的余额），点卡片展开看窗口进度与明细；有报警/错误的卡片
 * 默认展开。pi-ai 桥接沉底且默认折叠（次要信息）。
 */
function ProviderSettingsSection() {
  var statusState = react.useState(null)
  var status = statusState[0]
  var setStatus = statusState[1]
  var planState = react.useState(null)
  var plan = planState[0]
  var setPlan = planState[1]
  var noteState = react.useState(null)
  var note = noteState[0]
  var setNote = noteState[1]
  var busyState = react.useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]
  var tabState = react.useState('providers')
  var tab = tabState[0]
  var setTab = tabState[1]
  var groupsState = react.useState([])
  var catalogGroups = groupsState[0]
  var setCatalogGroups = groupsState[1]
  var detailsState = react.useState({})
  var detailsById = detailsState[0]
  var setDetailsById = detailsState[1]
  var filtersState = react.useState({})
  var filters = filtersState[0]
  var setFilters = filtersState[1]
  var presetsState = react.useState([])
  var presets = presetsState[0]
  var setPresets = presetsState[1]
  var catTickState = react.useState(0)
  var setCatTick = catTickState[1]
  var delState = react.useState({})
  var delConfirm = delState[0]
  var setDelConfirm = delState[1]
  var refreshingState = react.useState({})
  var setRefreshing = refreshingState[1]
  var toastState = react.useState(null)
  var toast = toastState[0]
  var setToast = toastState[1]
  var toastTimer: ReturnType<typeof setTimeout> | null = null
  // 相对时间每 30 秒跳一次，让「N 分钟前」自己往前走
  var nowTickState = react.useState(0)
  var setNowTick = nowTickState[1]
  react.useEffect(
    function () {
      var timer = setInterval(function () {
        setNowTick(function (n: number) { return n + 1 })
      }, 30000)
      return function () {
        clearInterval(timer)
      }
    },
    [],
  )
  var openState = react.useState({})
  var openMap = openState[0]
  var setOpenMap = openState[1]

  var refresh = react.useCallback(function (force: boolean) {
    loadProviderStatus()
      .then(function (payload) {
        setStatus(payload)
      })
      .catch(function () {
        setStatus(STATUS_UNAVAILABLE)
      })
    loadPlanStatus(force)
      .then(function (payload) {
        setPlan(payload)
      })
      .catch(function (cause) {
        setNote(cause && cause.message ? String(cause.message) : String(cause))
      })
  }, [])

  react.useEffect(
    function () {
      refresh(false)
    },
    [refresh],
  )

  // 展开区要显示的模型列表：模型目录走官方同一条 RPC（catTick 触发重载，添加 provider 后用）
  react.useEffect(
    function () {
      var cancelled = false
      loadModelCatalog()
        .then(function (next) {
          if (!cancelled) setCatalogGroups(next.groups)
        })
        .catch(function () { /* 模型列表拿不到就留空，卡片头部信息不受影响 */ })
      return function () {
        cancelled = true
      }
    },
    [catTickState[0]],
  )

  // 可添加的供应商预设清单
  react.useEffect(
    function () {
      reloadPresets()
    },
    [],
  )

  // 预设清单重载（添加/删除后都要：勾选状态变化）
  function reloadPresets() {
    getJson('/provider/presets')
      .then(function (payload) {
        if (payload !== null && Array.isArray(payload.presets)) setPresets(payload.presets)
      })
      .catch(function () { /* 下次刷新会带上 */ })
  }

  // 添加 provider 成功后的收尾：强制刷余额（新 provider 不在缓存里）+ 预设 + 模型目录
  function onProviderAdded() {
    refresh(true)
    setCatTick(function (t: number) { return t + 1 })
    reloadPresets()
  }

  // 删除 provider 的收尾：不打上游（余量没变），只本地移除 + 重载预设/目录
  function onProviderRemoved(account: PlanAccount) {
    dropPlanAccount(account.id)
    setPlan(function (prev: unknown) {
      return withoutAccount(prev, account.id)
    })
    setCatTick(function (t: number) { return t + 1 })
    reloadPresets()
  }

  // 模型详情（悬浮卡元数据）：来自生效 pi-ai 包的数据文件
  react.useEffect(
    function () {
      var cancelled = false
      loadModelDetailMap()
        .then(function (map) {
          if (!cancelled) setDetailsById(map)
        })
        .catch(function () { /* 详情拿不到就只显示目录基础信息 */ })
      return function () {
        cancelled = true
      }
    },
    [],
  )

  // 刷新单个 provider 的余量（卡片上的 ↻ 按钮）：宿主实查并回传新账户，本地替换。
  // 等待时按钮旋转，完成弹一条成功/失败提示（2.6 秒后自动消失）。
  function setRefreshingFlag(id: string, value: boolean) {
    setRefreshing(function (prev: AnyRecord) {
      return withKey(prev, id, value)
    })
  }
  function showToast(text: string, ok: boolean) {
    setToast({ text: text, ok: ok })
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () {
      setToast(null)
      toastTimer = null
    }, 2600)
  }
  function refreshSummary(account: PlanAccount) {
    var percent = worstPercent(account)
    if (percent !== undefined) return '（余 ' + String(percent) + '%）'
    if (Array.isArray(account.balances) && account.balances.length > 0) return '（' + account.balances[0].value + '）'
    return ''
  }
  function refreshAccount(account: PlanAccount) {
    setRefreshingFlag(account.id, true)
    postJson('/provider/refresh', { providerId: account.id })
      .then(function (res) {
        if (res !== null && res !== undefined && res.account !== undefined) {
          setPlan(function (prev: unknown) {
            return withRefreshedAccount(prev, res.account)
          })
          showToast('✓ ' + shortName(account) + ' 余量已刷新' + refreshSummary(res.account), true)
          return
        }
        showToast('✗ ' + shortName(account) + ' 刷新失败：' + String((res && res.error) || '未知错误'), false)
      })
      .catch(function (cause) {
        showToast('✗ ' + shortName(account) + ' 刷新失败：' + String(cause && cause.message ? cause.message : cause), false)
      })
      .then(function () {
        setRefreshingFlag(account.id, false)
      })
  }

  // 删除 provider（✕ → 二次确认）：配置与密钥一起清掉
  function removeProvider(account: PlanAccount) {
    postJson('/provider/remove', { providerId: account.id })
      .then(function (res) {
        setDelConfirm(function (prev: AnyRecord) {
          return withKey(prev, account.id, false)
        })
        if (res === null || res === undefined || res.ok !== true) {
          setNote('删除失败：' + String((res && res.error) || '未知错误'))
          return
        }
        onProviderRemoved(account)
      })
      .catch(function (cause) {
        setNote('删除失败：' + String(cause && cause.message ? cause.message : cause))
      })
  }

  function checkUpdate() {
    setBusy(true)
    setNote('正在检查上游 ...')
    postJson('/provider/update')
      .then(function (result) {
        if (result.error !== undefined) {
          setNote('更新失败：' + String(result.error))
        } else if (result.applied === true) {
          setNote('已下载 ' + String(result.latest) + '，兼容性检查通过，重启 dsh 后生效')
        } else if (result.compatible === false) {
          setNote(String(result.latest) + ' 兼容性检查没通过，已跳过（不会切过去）')
        } else {
          setNote('已是最新（' + String(result.latest) + '）')
        }
        refresh(true)
      })
      .catch(function (cause) {
        setNote('更新失败：' + String(cause && cause.message ? cause.message : cause))
      })
      .then(function () {
        setBusy(false)
      })
  }

  /** 折叠态记忆：undefined 时回落到默认值（报警/错误的卡片默认展开）。 */
  function isOpen(key: string, dflt: boolean) {
    return openMap[key] === undefined ? dflt : openMap[key]
  }
  function toggle(key: string, dflt: boolean) {
    setOpenMap(function (prev: AnyRecord) {
      return withKey(prev, key, isOpen(key, dflt) !== true)
    })
  }
  /** 模型列表过滤词（按模型 ID 或名称匹配）。 */
  function setFilter(id: string, value: string) {
    setFilters(function (prev: AnyRecord) {
      return withKey(prev, id, value)
    })
  }

  var bridge = status === null || status.bridge === undefined ? undefined : status.bridge
  var update = status === null || status.update === undefined ? undefined : status.update
  // 桥接明细：放在「pi-ai 桥接」二级标签页里展示。行的内容由 piAiBridgeRows 给（纯函数，离线可测）
  var bridgeRows = piAiBridgeRows(bridge, update)
  var bridgeLines = []
  for (var bi = 0; bi < bridgeRows.length; bi += 1) {
    var row = bridgeRows[bi]
    var children = [row.text]
    if (row.value !== undefined) {
      children.push(react.createElement(
        'span',
        { className: 'plan_tag pv_push', title: row.title === undefined ? '' : row.title, key: 'value' },
        row.value,
      ))
    }
    bridgeLines.push(react.createElement(
      'div',
      { className: 'pv_line' + (row.bad === true ? ' plan_badText' : row.warn === true ? ' plan_warnText' : ''), key: row.key },
      children,
    ))
  }
  // 上游那一行右侧跟按钮：检查更新（宿主会先下载、再做兼容性体检，通过了才等重启生效）
  bridgeLines.push(
    react.createElement(
      'div',
      { className: 'pv_line', key: 'action' },
      piAiUpstreamText(update),
      react.createElement(
        'button',
        { type: 'button', className: 'pv_action pv_push', disabled: busy, onClick: checkUpdate },
        busy ? '检查中 ...' : '检查更新',
      ),
    ),
  )
  var accounts = plan !== null && Array.isArray(plan.accounts) ? plan.accounts : []
  var modelsByProvider: Record<string, CatalogModel[]> = {}
  for (var gi = 0; gi < catalogGroups.length; gi += 1) {
    modelsByProvider[catalogGroups[gi].id] = catalogGroups[gi].models
  }
  var cards = []
  for (var i = 0; i < accounts.length; i += 1) {
    ;(function (account: PlanAccount) {
      var chips = headlineChips(account)
      var dflt = account.error !== undefined || typeof account.credentialWarning === 'string'
      var expanded = isOpen(account.id, dflt)

      var chipEls = []
      for (var c = 0; c < chips.length; c += 1) chipEls.push(headlineChip(chips[c], c))

      var bodyRows = []
      if (expanded) {
        // 路由 ID：和「添加供应商」表单里的同一个值（settings 的 llm-pi-ai.providers 键）
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'id' },
            react.createElement('span', null, '路由 ID'),
            react.createElement('span', { className: 'pv_field' }, String(account.id)),
          ),
        )
        // API 密钥行：掩码提示（宿主派生前3+后4，值不出宿主）
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'key' },
            react.createElement('span', null, 'API 密钥'),
            react.createElement(
              'span',
              { className: 'pv_field' },
              account.keyHint !== undefined ? account.keyHint : (account.authConfigured === false ? '未配置' : '已配置'),
            ),
          ),
        )
        if (account.baseUrl !== undefined) {
          bodyRows.push(
            react.createElement(
              'div',
              { className: 'pv_line pv_row', key: 'url' },
              react.createElement('span', null, 'API 地址'),
              react.createElement('span', { className: 'pv_field' }, String(account.baseUrl)),
            ),
          )
        }
        // 协议 / 凭据名：原生适配器路由（deepseek-official 这类）不写 settings 段，可能只有其中一个
        if (account.api !== undefined) {
          bodyRows.push(
            react.createElement(
              'div',
              { className: 'pv_line pv_row', key: 'api' },
              react.createElement('span', null, '协议'),
              react.createElement('span', { className: 'pv_field' }, String(account.api)),
            ),
          )
        }
        if (account.apiKeyEnv !== undefined) {
          bodyRows.push(
            react.createElement(
              'div',
              { className: 'pv_line pv_row', key: 'ref' },
              react.createElement('span', null, ''),
              react.createElement('span', { className: 'pv_hint' }, '密钥存为 ' + String(account.apiKeyEnv)),
            ),
          )
        }
        // 模型列表：目录（服务端）为骨架，pi-ai 详情补元数据；悬浮显示 Cherry 式详情卡
        var models = modelsByProvider[account.id]
        if (models === undefined) {
          bodyRows.push(react.createElement('div', { className: 'pv_line', key: 'm-load' }, '模型目录加载中…'))
        } else if (models.length === 0) {
          bodyRows.push(react.createElement('div', { className: 'pv_line', key: 'm-none' }, '目录里没有这个 provider 的模型'))
        } else {
          // 模型区（带外框）独立折叠：卡片展开时默认收起，点「模型（N）」头展开
          var modelsOpen = isOpen(account.id + ':models', false)
          // 过滤：模糊匹配模型 ID 或名称（子串 / 缩写子序列 / 编辑距离容错）
          var filterText = filters[account.id] === undefined ? '' : String(filters[account.id])
          var needle = filterText.trim().toLowerCase()
          var filtered = []
          for (var fi = 0; fi < models.length; fi += 1) {
            if (fuzzyMatch(filterText, models[fi].id + ' ' + models[fi].name)) {
              filtered.push(models[fi])
            }
          }
          var mBoxRows = []
          // 模型区头部（仿父卡片范式）：标题左；展开时过滤器靠右；最右 Chevron 旋转切换
          var mTopChildren = [
            react.createElement(
              'button',
              { type: 'button', className: 'pv_mHead', key: 'm-head', onClick: function () { toggle(account.id + ':models', false) } },
              react.createElement('span', null, '模型（' + (needle === '' ? String(models.length) : String(filtered.length) + '/' + String(models.length)) + '）'),
            ),
          ]
          if (modelsOpen) {
            mTopChildren.push(
              react.createElement(
                'span',
                { className: 'pv_fbox', key: 'm-filter' },
                react.createElement('input', {
                  className: 'pv_mFilter',
                  type: 'text',
                  placeholder: '过滤',
                  value: filterText,
                  onChange: function (event: FieldEvent) {
                    setFilter(account.id, event.target.value)
                  },
                }),
                filterText === ''
                  ? null
                  : react.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'pv_fclear',
                        title: '清除',
                        onClick: function () { setFilter(account.id, '') },
                      },
                      '×',
                    ),
              ),
            )
          }
          mTopChildren.push(
            react.createElement(
              'div',
              {
                className: 'pv_mCaretCol',
                key: 'm-caret',
                title: modelsOpen ? '收起' : '展开',
                onClick: function () { toggle(account.id + ':models', false) },
              },
              caretSvg(modelsOpen),
            ),
          )
          mBoxRows.push(react.createElement('div', { className: 'pv_mTop', key: 'm-top' }, mTopChildren))
          if (modelsOpen) {
            var mListRows = []
            // 列标题：与模型行同一套列宽类，保证严格对齐
            mListRows.push(
              react.createElement(
                'div',
                { className: 'pv_mHeadRow', key: 'm-colhead' },
                react.createElement('span', { className: 'pv_mId', style: { fontFamily: 'inherit' } }, '模型 ID'),
                react.createElement('span', { className: 'pv_mName' }, '名称'),
                react.createElement('span', { className: 'pv_mCaps' }, '能力'),
                react.createElement('span', { className: 'pv_mCtx' }, '上下文'),
              ),
            )
            if (filtered.length === 0) {
              mListRows.push(react.createElement('div', { className: 'pv_line', key: 'm-empty' }, '没有匹配「' + filterText + '」的模型'))
            } else {
              for (var m = 0; m < filtered.length; m += 1) {
                mListRows.push(modelRow(filtered[m], account, detailsById))
              }
            }
            // 列表区：分割线上边缘贯穿模型框
            mBoxRows.push(react.createElement('div', { className: 'pv_mList', key: 'm-list' }, mListRows))
          }
          bodyRows.push(react.createElement('div', { className: 'pv_mBox', key: 'mbox' }, mBoxRows))
        }
        if (account.error !== undefined) {
          bodyRows.push(react.createElement('div', { className: 'plan_note plan_badText', key: 'err' }, String(account.error)))
        }
        // 凭据体检结论：多个 provider 共用同一把 key（值本身不会下发到浏览器）
        if (typeof account.credentialWarning === 'string') {
          bodyRows.push(react.createElement('div', { className: 'plan_note plan_badText', key: 'warn' }, account.credentialWarning))
        }
      }

      var linkUrl = typeof account.websiteUrl === 'string' && account.websiteUrl !== ''
        ? account.websiteUrl
        : (typeof account.baseUrl === 'string' && account.baseUrl !== '' ? account.baseUrl : undefined)

      cards.push(
        react.createElement(
          'div',
          { className: 'pv_pc' + (expanded ? ' pv_pcOpen' : ''), key: account.id },
          react.createElement(
            'div',
            { className: 'pv_pcTop' },
            react.createElement(
              'div',
              { className: 'pv_pcMain' },
            // 第一行：绿点 + 名称 + 等级 + 网页图标——对齐官方插件卡头部
            react.createElement(
              'div',
              {
                className: 'pv_pcHead',
                role: 'button',
                tabIndex: 0,
                'aria-expanded': expanded ? 'true' : 'false',
                onClick: function () { toggle(account.id, dflt) },
                onKeyDown: function (ev: KeyboardEvent) {
                  if (ev && (ev.key === 'Enter' || ev.key === ' ')) {
                    if (typeof ev.preventDefault === 'function') ev.preventDefault()
                    toggle(account.id, dflt)
                  }
                },
              },
              react.createElement(
                'span',
                { className: 'pv_pcLead' },
                react.createElement(
                  'span',
                  { className: 'pv_pcLeadRow' },
                  react.createElement('span', { className: dotClass(account) }),
                  react.createElement('span', { className: 'pv_pcName' }, shortName(account)),
                  linkUrl === undefined
                    ? null
                    : react.createElement('a', {
                        className: 'pv_pcWeb',
                        href: linkUrl,
                        target: '_blank',
                        rel: 'noreferrer',
                        title: '打开官网 ' + linkTextOf(linkUrl),
                        onClick: function (event: MouseEvent) {
                          if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
                        },
                      }, '↗'),
                ),
              ),
            ),
            // 第二行：余量摘要左对齐；右侧 刷新时间｜刷新｜删除
            react.createElement(
              'div',
              { className: 'pv_pcMeta' },
              chipEls,
              react.createElement(
                'span',
                { className: 'pv_metaActs' },
                account.fetchedAt === undefined
                  ? null
                  : react.createElement(
                      'span',
                      { className: 'pv_fresh', title: '上次刷新 ' + String(account.fetchedAt).slice(11, 19) },
                      '◷ ' + relativeTime(account.fetchedAt),
                    ),
                react.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'pv_iconBtn' + (refreshingState[0][account.id] === true ? ' pv_spin' : ''),
                    disabled: refreshingState[0][account.id] === true,
                    title: refreshingState[0][account.id] === true ? '刷新中…' : '刷新余量' + (account.fetchedAt !== undefined ? '（上次 ' + String(account.fetchedAt).slice(11, 19) + '）' : ''),
                    onClick: function () { refreshAccount(account) },
                  },
                  '↻',
                ),
                account.deletable === true
                  ? (delConfirm[account.id] === true
                      ? react.createElement(
                          'span',
                          { className: 'pv_delBox' },
                          react.createElement(
                            'button',
                            { type: 'button', className: 'pv_delYes', onClick: function () { removeProvider(account) } },
                            '确认删除',
                          ),
                          react.createElement(
                            'button',
                            {
                              type: 'button',
                              className: 'pv_delNo',
                              onClick: function () {
                                setDelConfirm(function (prev: AnyRecord) {
                                  return withKey(prev, account.id, false)
                                })
                              },
                            },
                            '取消',
                          ),
                        )
                      : react.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'pv_iconBtn',
                            title: '删除这个 provider',
                            onClick: function () {
                              setDelConfirm(function (prev: AnyRecord) {
                                return withKey(prev, account.id, true)
                              })
                            },
                          },
                          '✕',
                        ))
                  : null,
              ),
            ),
            ),
            // 箭头列：只在「标题+余量」区域垂直居中（分割线上方），点击展开/收起
            react.createElement(
              'div',
              {
                className: 'pv_pcCaretCol',
                title: expanded ? '收起' : '展开',
                onClick: function () { toggle(account.id, dflt) },
              },
              caretSvg(expanded),
            ),
          ),
          // 展开体：分割线上边缘贯穿整卡
          expanded ? react.createElement('div', { className: 'pv_pcBody' }, bodyRows) : null,
        ),
      )
    })(accounts[i])
  }
  if (cards.length === 0) {
    cards.push(
      react.createElement('div', { className: 'pv_line', key: '__none' }, String(plan !== null && plan.error !== undefined ? plan.error : '暂无 provider 额度数据')),
    )
  }

  // 页内二级标签：Provider（配置的 provider 卡片）/ pi-ai 桥接
  var tabProviders = react.createElement(
    'button',
    { type: 'button', className: 'pv_tab' + (tab === 'providers' ? ' pv_tabOn' : ''), onClick: function () { setTab('providers') } },
    t('tabProviders'),
  )
  var tabBridge = react.createElement(
    'button',
    { type: 'button', className: 'pv_tab' + (tab === 'bridge' ? ' pv_tabOn' : ''), onClick: function () { setTab('bridge') } },
    'pi-ai 桥接',
  )
  return react.createElement(
    'div',
    { className: 'pv_stack' },
    react.createElement('div', { className: 'pv_tabs' }, tabProviders, tabBridge),
    tab === 'bridge'
      ? react.createElement(
          'div',
          { className: 'pv_pc' },
          react.createElement('div', { className: 'pv_pcBody', style: { borderTop: '0', paddingTop: '8px' } },
            bridgeLines,
            note === null ? null : react.createElement('div', { className: 'plan_note' }, note)),
        )
      : react.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
          react.createElement(AddProviderPanel, { presets: presets, onAdded: onProviderAdded }),
          cards,
        ),
    toast === null
      ? null
      : react.createElement(
          'div',
          { className: 'pv_toast ' + (toast.ok === true ? 'pv_toastOk' : 'pv_toastFail') },
          toast.text,
        ),
  )
}

// ==================== 插件入口 ====================

/** 座位注册表：inject(name, factory) + register(描述符, 组件)。 */
interface SlotsService {
  inject: (name: string, factory: () => unknown) => unknown
  register: (descriptor: SlotDescriptor, component: unknown) => unknown
}

/** 座位描述符：两个座位用到的字段合集（inject 是「按会话产出注入面」的工厂）。 */
interface SlotDescriptor {
  name: string
  id: string
  priority?: number
  order?: number
  label?: () => unknown
  inject?: (sessionId: string) => unknown
}

/** 官方 ui-model-selection 的客户端服务：按会话给一个目录。 */
interface ModelDirectory {
  store: SnapshotStore
  load: () => Promise<unknown>
  select: (selection: ModelSelection) => Promise<unknown>
}

interface ModelDirectoriesService {
  directoryFor?: (sessionId: string) => ModelDirectory
}

/** /model 命令的一条可选项。 */
interface CommandOption {
  id: string
  label: string
  detail: string
}

interface CommandContribution {
  name: string
  label: () => string
  description: () => string
  ui: {
    kind: string
    options: () => Promise<CommandOption[]>
    onSelect: (option: CommandOption, session: { sessionId?: string } | null | undefined) => unknown
  }
}

interface CommandUiService {
  register: (contribution: CommandContribution) => unknown
}

interface LocaleService {
  register?: (namespace: string, dict: unknown) => void
  bind?: (namespace: string) => (key: string) => string
}

interface StylesService {
  insert?: (css: string) => unknown
}

/** 客户端插件上下文：只声明我们 inject 到的那几样（其余走索引签名）。 */
interface ClientContext {
  slots: SlotsService
  inject: (names: readonly string[], callback: (scope: ClientScope) => void) => void
  effect: (fn: () => unknown, label?: string) => void
  locale?: LocaleService
  styles?: StylesService
  sessions?: unknown
  [key: string]: unknown
}

/** inject 面里认得出的服务（谁 inject 谁才有）。 */
interface ClientScope extends ClientContext {
  modelDirectories?: ModelDirectoriesService
  commandUi?: CommandUiService
}

/** 诊断用：把关键接线状态挂到 window 上，排查「某个座位没生效」时一眼看到原因。 */
function recordDiagnostic(key: string, value: unknown): void {
  try {
    var holder = window as unknown as AnyRecord
    var bucket = holder.__dshProvider as AnyRecord | undefined
    if (bucket === undefined) bucket = holder.__dshProvider = {}
    bucket[key] = value
  } catch (cause) {
    /* 没有 window 就算了 */
  }
}

function apply(ctx: ClientContext) {
  installCss()
  // 规范路径：官方 styles.insert 在（动态插件运行时）就走它——随 client run 自动清理、
  // 带 data-dyn 记账；静态插件运行时没有该内置，installCss 的手写 style 标签是等价实现。
  try {
    if (ctx.styles !== undefined && ctx.styles !== null && typeof ctx.styles.insert === 'function') {
      recordDiagnostic('styles', 'styles.insert')
    } else {
      recordDiagnostic('styles', 'fallback-style-tag')
    }
  } catch (cause) { /* 诊断而已 */ }
  recordDiagnostic('applied', new Date().toISOString())

  // i18n：优先官方 locale（register + bind，语言切换实时跟随）；重复注册（热重载）会抛，
  // 旧字典仍在，继续 bind 即可；都失败则回退本地字典（localT）。
  t = localT
  try {
    if (ctx.locale !== undefined && ctx.locale !== null && typeof ctx.locale.register === 'function') {
      try {
        ctx.locale.register('dsh-provider', LOCAL_DICT)
      } catch (dup) { /* 已注册过（客户端热重载）：旧字典还有效 */ }
      if (typeof ctx.locale.bind === 'function') {
        var bound = ctx.locale.bind('dsh-provider')
        t = function (key: string) {
          var value = bound(key)
          return value === key ? localT(key) : value
        }
      }
    }
  } catch (cause) {
    var failure = cause as AnyRecord
    recordDiagnostic('locale', String(failure && failure.message ? failure.message : cause))
  }

  // 测试环境标识：宿主在 DSH_PROVIDER_TEST=1 启动时 /provider/status 会回 testMode:true，
  // 这里给标题加「· 测试」后缀、favicon 盖橙色「测」角标，一眼区分测试实例（正式实例无标）。
  loadProviderStatus()
    .then(function (status) {
      if (status && status.testMode === true) markTestEnv()
    })
    .catch(function () { /* 拿不到状态就算了，不影响功能 */ })

  // 官方模型目录服务（ui-model-selection 提供的客户端 cordis 服务）。
  // 走服务而不是自己读投影/发 RPC：目录、当前选择、切换提交、失效刷新都在它手里。
  // 登记与使用解耦：服务迟到也不影响座位注册——inject 工厂是渲染时才调用的，
  // 那时再读 modelDirectories；读不到就返回空面，组件各自退回同源 HTTP/RPC 路径。
  var modelDirectories: ModelDirectoriesService | undefined
  ctx.inject(['modelDirectories'], function (scope) {
    modelDirectories = scope.modelDirectories
    recordDiagnostic('modelDirectories', modelDirectories === undefined ? 'undefined' : 'ok')
  })

  // 会话 face：目录服务缺席时（plan-test 禁用官方 ui-model-selection），
  // 座位靠它读会话投影 modelSelection 来回显当前模型。
  var sessionsFace = ctx.sessions
  recordDiagnostic('sessions', sessionsFace === undefined ? 'undefined' : 'ok')

  /**
   * 座位/徽标的 inject 面：把官方目录服务包装成组件能用的只读数据 + 两个动作。
   * @param sessionId - 座位所在的会话。
   */
  function directoryFace(sessionId: string) {
    // sessionId 必须随注入面传给座位：目录服务缺席时（plan-test），
    // 座位靠它读会话投影拿当前模型、发切换 RPC。
    if (modelDirectories === undefined || typeof modelDirectories.directoryFor !== 'function') {
      recordDiagnostic('face', { reason: 'no-service', sessionId: String(sessionId) })
      return { sessionId: sessionId, sessions: sessionsFace }
    }
    try {
      var directory = modelDirectories.directoryFor(sessionId)
      recordDiagnostic('face', { reason: 'ok', sessionId: String(sessionId) })
      return {
        sessionId: sessionId,
        sessions: sessionsFace,
        directory: directory.store,
        load: function () {
          directory.load().catch(function () {
            /* 错误会落到它自己的 store 上，由组件呈现 */
          })
        },
        select: function (selection: ModelSelection) {
          return directory.select(selection).then(function () {
            return true
          }, function () {
            return false
          })
        },
      }
    } catch (cause) {
      var failure = cause as AnyRecord
      recordDiagnostic('face', {
        reason: 'threw',
        sessionId: String(sessionId),
        message: failure && failure.message ? String(failure.message) : String(cause),
      })
      return { sessionId: sessionId, sessions: sessionsFace }
    }
  }

  ctx.slots.inject('conversation.input.model', function () {
    return ctx.slots.register(
      {
        name: 'conversation.input.model',
        id: 'provider-model-seat',
        // conversation.input.model 是 single 座位，官方用默认 priority(0) 占着；
        // 同 priority 才冲突，不同 priority 是「遮蔽」，最小者渲染（slots 文档把
        // single 定义为 replacement point）。取负值即由我们渲染。
        priority: -10,
        inject: directoryFace,
      },
      ModelSwitchSeat,
    )
  })

  // 设置页新增 Provider 标签（settings.section 是 list 座位，官方 Models 标签不受影响）
  ctx.slots.inject('settings.section', function () {
    return ctx.slots.register(
      {
        name: 'settings.section',
        id: 'provider',
        order: 15,
        label: function () {
          return t('nav')
        },
      },
      ProviderSettingsSection,
    )
  })

  // /model 命令：commandUi 对同名是「重复即抛」，没有 priority 遮蔽，所以只有官方
  // ui-model-selection 行被禁用时这里才注册得进去；官方还在时静默让位（模型座位
  // 靠 priority 遮蔽已经接管，不受影响）。
  ctx.inject(['commandUi'], function (scope) {
    var commandUi = scope.commandUi
    if (commandUi === undefined || typeof commandUi.register !== 'function') return
    scope.effect(
      function () {
        try {
          // 上面守过 commandUi；闭包里 TS 会丢掉这次收窄，所以这里用 ! 声明非空
          return commandUi!.register({
          name: 'model',
          label: function () {
            return '切换模型'
          },
          description: function () {
            return '按 provider 过滤 / 搜索模型 / 显示余额'
          },
          ui: {
            kind: 'popupSelect',
            options: function () {
              return Promise.all([loadModelCatalog(), loadPlanStatus(false)])
                .then(function (both) {
                  var groups = both[0].groups
                  var accounts = accountsById(both[1])
                  var rows = []
                  for (var i = 0; i < groups.length; i += 1) {
                    var group = groups[i]
                    var quota = quotaTextOf(accounts[group.id])
                    for (var j = 0; j < group.models.length; j += 1) {
                      rows.push({
                        id: group.id + '/' + group.models[j].id,
                        label: group.models[j].id,
                        detail: group.id + (quota === undefined ? '' : ' · ' + quota),
                      })
                    }
                  }
                  return rows
                })
            },
            onSelect: function (option, session) {
              var parts = String(option.id).split('/')
              var provider = parts.shift()
              var model = parts.join('/')
              if (provider === undefined || provider === '' || model === '') {
                throw new Error('无法解析这个模型行')
              }
              var sessionId = session !== null && session !== undefined ? session.sessionId : undefined
              if (typeof sessionId !== 'string') throw new Error('当前没有会话，无法切换模型')
              return submitSelection(sessionId, provider, model, undefined)
            },
          },
        })
        } catch (cause) {
          // 同名命令已存在（官方 /model 还在）：让位，其余功能不受影响
          return function () {}
        }
      },
      'dsh-provider: /model contribution',
    )
  })
}

// 纯函数，离线测试直接调；组件里用的是同一份实现

export {
  apply,
  inject,
  piAiBridgeRows,
  piAiUpstreamText,
  reasoningTextOf,
  defaultEffortOf,
  normalizeSelection,
}

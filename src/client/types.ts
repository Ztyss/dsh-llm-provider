/**
 * 浏览器端类型。
 *
 * 形状都是宿主/自家路由下发的 JSON，按「我们用到的那几样」就地声明，
 * 不引 dsh 的内部类型（理由见 ../types.ts 开头那条原则）。
 */
import type { BalanceRow, QuotaWindow } from '../adapters/shared.js'

/** 一个 provider/model/reasoningEffort 选择：会话投影、目录 current、提交载荷共用。 */
export interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** 模型声明的思考强度档位表：档位 id 列表 + 默认档。 */
export interface CatalogReasoning {
  efforts: string[]
  default: string | undefined
}

/** 目录里的一个模型（当前选择回显、模型面板、模型行都用它）。 */
export interface CatalogModel {
  id: string
  name: string
  contextWindow?: number
  reasoning?: CatalogReasoning
}

/** 目录里的一个 provider 分组。 */
export interface CatalogGroup {
  id: string
  name: string
  models: CatalogModel[]
}

/** /provider/models 里的一条模型详情（生效 pi-ai 包的元数据 + 路由声明补齐）。 */
export interface ModelDetail {
  id?: string
  /** 这条元数据属于哪个 provider（本地版：详情按 provider+id 建索引，见 data.ts）。 */
  provider?: string
  name?: string
  api?: string
  baseUrl?: string
  contextWindow?: number
  maxTokens?: number
  vision?: boolean
  video?: boolean
  reasoning?: boolean
  thinkingLevels?: string[]
  /** 'pi-ai' = 上游目录；'declared' = 用户在路由里声明的；'adapter' = 适配器自报的（本地版新增，issue #5）。 */
  source?: 'pi-ai' | 'declared' | 'adapter'
}

/** 一条路由里声明的模型（settings 形状，编辑器只动这几个字段）。 */
export interface DeclaredModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
  /** 其余字段（reasoningEfforts / compat / api …）原样保留，不在这里声明。 */
  [key: string]: unknown
}

/** 逐模型编辑器里的一行：候选模型 + 勾选态 + 可编辑字段。 */
export interface ModelEditRow {
  id: string
  name: string
  enabled: boolean
  contextWindow: string
  maxTokens: string
  vision: boolean
  video: boolean
  /** 该 id 在生效 pi-ai 目录里有没有权威元数据（没有就得把上下文/最大输出写全）。 */
  known: boolean
  /** 目录里那份的原值：用于（a）输入框的 placeholder（b）判断用户是否改过能力。 */
  knownContextWindow: number | undefined
  knownMaxTokens: number | undefined
  originVision: boolean
  originVideo: boolean
  /** 本来就在路由声明里的原始条目（保存时以它为底，保住 reasoningEfforts/compat 等字段）。 */
  declared: DeclaredModel | undefined
}

/** /plan/status 的 accounts 项：额度快照里的一家 provider（宿主在通用字段外还会带几个）。 */
export interface PlanAccount {
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
  /** 这条路由显式声明的模型清单（undefined = 没配，服务 pi-ai 目录全量）。 */
  models?: DeclaredModel[] | undefined
}

/** 官方目录服务的 snapshot store；subscribe 契约各版本不一，我们只用 getSnapshot。 */
export interface SnapshotStore {
  getSnapshot?: () => unknown
  subscribe?: () => () => void
}

/** 会话 face 上的模型选择投影 cell。 */
export interface ProjectionCell {
  getSnapshot: () => unknown
  subscribe: () => () => void
}

/** sessions 服务：只用到 binding(sessionId).session.projections.faceOf(...) 与 subagentAddress（/model 的 available）。 */
export interface SessionsFace {
  binding?: (sessionId: string) => {
    session?: { projections?: { faceOf?: (name: string) => ProjectionCell } }
  }
  /** 官方 ui-model-selection 用它判断「这是不是子代理会话」；拿不到就当作不是。 */
  subagentAddress?: (sessionId: string) => unknown
}

/** /provider/presets 里的一个预置供应商。 */
export interface ProviderPreset {
  id: string
  label: string
  baseURL?: string
  api?: string
  apiKeyEnv?: string
  websiteUrl?: string
  configured?: boolean
  /** 路由在、凭据没值：仍算已配置，但下拉里不该禁选（选中就是去补密钥）。 */
  missingKey?: boolean
  custom?: boolean
}

/** 「pi-ai 桥接」明细行：piAiBridgeRows 的产出，组件照着渲染。 */
export interface BridgeRow {
  key: string
  text: string
  value?: string
  title?: string
  bad?: boolean
  warn?: boolean
}

/** 卡片头部摘要 chip：窗口余量（label+text+percent）、钱包余额（只有 text）或组间分割线（sep）。 */
export interface HeadlineChip {
  sep?: boolean
  label?: string
  text?: string
  percent?: number | undefined
  reset?: string | undefined
}

/** createElement 里 input/select 的 onChange 事件对象：只读得到 target.value / target.checked。 */
export interface FieldEvent {
  target: { value: string; checked?: boolean }
}

/** conversation.input.model 座位的注入面：会话 + 官方目录 store + 两个动作（见 directoryFace）。 */
export interface ModelSwitchSeatProps {
  sessionId: string
  sessions?: SessionsFace | undefined
  directory?: SnapshotStore
  load?: () => unknown
  select?: (selection: ModelSelection) => Promise<boolean>
}

/** 推理等级面板里的一行：Default（effort 为 undefined）或目录声明的某个档位。 */
export interface EffortChoice {
  effort?: string
  label: string
}

/** 添加 provider 面板的注入面。 */
export interface AddProviderPanelProps {
  presets?: unknown
  onAdded?: () => void
}

/** 座位注册表：inject(name, factory) + register(描述符, 组件)。 */
export interface SlotsService {
  inject: (name: string, factory: () => unknown) => unknown
  register: (descriptor: SlotDescriptor, component: unknown) => unknown
}

/** 座位描述符：两个座位用到的字段合集（inject 是「按会话产出注入面」的工厂）。 */
export interface SlotDescriptor {
  name: string
  id: string
  priority?: number
  order?: number
  label?: () => unknown
  inject?: (sessionId: string) => unknown
}

/** 官方 ui-model-selection 的客户端服务：按会话给一个目录。 */
export interface ModelDirectory {
  store: SnapshotStore
  load: () => Promise<unknown>
  select: (selection: ModelSelection) => Promise<unknown>
}

export interface ModelDirectoriesService {
  directoryFor?: (sessionId: string) => ModelDirectory
}

/** /model 命令的一条可选项。 */
export interface CommandOption {
  id: string
  label: string
  detail: string
}

export interface CommandContribution {
  name: string
  label: () => string
  description: () => string
  /**
   * 官方契约**必填**：`CommandUiRuntime.candidates()` 对注册表里每一条贡献都直接调
   * `contribution.available(session)`，少了它就是 `TypeError: contribution.available is not a function`
   * —— 整批 `/` 候选（含 composer 的「＋」按钮）一起挂掉，不只是这一条。见上游 issue #7。
   * 实现必须**永远返回 boolean、永不抛**。
   */
  available: (session: { sessionId?: string } | null | undefined) => boolean
  ui: {
    kind: string
    options: () => Promise<CommandOption[]>
    onSelect: (option: CommandOption, session: { sessionId?: string } | null | undefined) => unknown
  }
}

export interface CommandUiService {
  register: (contribution: CommandContribution) => unknown
}

export interface LocaleService {
  register?: (namespace: string, dict: unknown) => void
  bind?: (namespace: string) => (key: string) => string
}

export interface StylesService {
  insert?: (css: string) => unknown
}

/** 客户端插件上下文：只声明我们 inject 到的那几样（其余走索引签名）。 */
export interface ClientContext {
  slots: SlotsService
  inject: (names: readonly string[], callback: (scope: ClientScope) => void) => void
  effect: (fn: () => unknown, label?: string) => void
  locale?: LocaleService
  styles?: StylesService
  sessions?: unknown
  [key: string]: unknown
}

/** inject 面里认得出的服务（谁 inject 谁才有）。 */
export interface ClientScope extends ClientContext {
  modelDirectories?: ModelDirectoriesService
  commandUi?: CommandUiService
}

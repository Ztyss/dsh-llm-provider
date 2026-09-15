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

/** /provider/models 里的一条模型详情（生效 pi-ai 包的元数据），按模型 id 建索引。 */
export interface ModelDetail {
  id?: string
  contextWindow?: number
  maxTokens?: number
  vision?: boolean
  video?: boolean
  reasoning?: boolean
  thinkingLevels?: string[]
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

/** sessions 服务：只用到 binding(sessionId).session.projections.faceOf(...)。 */
export interface SessionsFace {
  binding?: (sessionId: string) => {
    session?: { projections?: { faceOf?: (name: string) => ProjectionCell } }
  }
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

/** createElement 里 input/select 的 onChange 事件对象：只读得到 target.value。 */
export interface FieldEvent {
  target: { value: string }
}

/** conversation.input.model 座位的注入面：会话 + 官方目录 store + 两个动作（见 directoryFace）。 */
export interface ModelSwitchSeatProps {
  sessionId: string
  sessions?: SessionsFace | undefined
  directory?: SnapshotStore
  load?: () => unknown
  select?: (selection: ModelSelection) => Promise<boolean>
}

/** 推理等级面板里的一行：服务商默认（effort 为 undefined）或目录声明的某个档位。 */
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

/**
 * 插件用到的类型。
 *
 * 一条原则：**不引 dsh 的内部类型**。cordis 上下文、各项服务、settings 文档都按"我们用到
 * 的那几样"在这里就地声明，形状宽到能容下宿主的实际实现——第三方插件 import 宿主的内部类型，
 * 等于把宿主升级变成自己的编译期故障。
 *
 * 动态边界（settings 段、HTTP 载荷、适配器返回的第三方 JSON）一律走 `AnyRecord`，
 * 用 `readString` / `readNumber` 这类小工具收口，别到处 cast。
 */

/** 任意 JSON 形状的记录：settings 段、请求载荷、上游返回的 JSON。 */
export type AnyRecord = Record<string, unknown>

/** 宿主日志器（只要用到的方法）。 */
export interface Logger {
  info?: (message: string) => void
  warn?: (message: string) => void
  error?: (message: string) => void
}

/* ------------------------------ HTTP ------------------------------ */

/** 我们只用到的请求面。 */
export interface ServerRequest {
  method?: string
  url?: string
  on: (event: 'data' | 'end', listener: (chunk?: unknown) => void) => void
}

/** 我们只用到的响应面。 */
export interface ServerResponse {
  writeHead: (status: number, headers?: Record<string, string>) => void
  end: (body?: string) => void
}

export interface ExactRoute {
  kind: 'exact'
  path: string
  handler: (req: ServerRequest, res: ServerResponse) => void
}

export interface WebServerService {
  register: (route: ExactRoute) => () => void
}

/* ---------------------------- 宿主服务 ---------------------------- */

/** llm 服务目录里的一条（原生适配器路由）。 */
export interface LlmDirectoryEntry {
  provider?: string
  displayName?: string
  settingsNs?: string
  settingsPath?: readonly string[]
  declared?: boolean
}

export interface LlmService {
  listConfigurableProviders?: () => LlmDirectoryEntry[]
  /**
   * 一条 route 实际服务的模型，条目里带 `inputModalities`。这是模型能力的**第一来源**：
   * 适配器已经把「route 声明 → 内置目录 → 路由默认值」解析完了（官方 llm-pi-ai 里就是
   * `declaredInput(entry.input) ?? base?.input ?? defaultInput`），再自己解析一遍 settings
   * 等于养第二份实现，迟早和真正发货的那份对不上。
   *
   * 缺席（老宿主没这个方法）或抛错（settings 里写了路由、适配器没起来）都要能退：
   * 退到「能力未知」，不能退到「不支持」。
   */
  listModels?: (provider: string) => Promise<unknown>
  /** 一个 route/model 的精确元数据（上下文窗口、默认输出上限、思考档位）。同样允许缺席/抛错。 */
  resolveModelInfo?: (provider: string, model: string) => Promise<unknown>
}

/** settings 的一次写操作（跟宿主 mutate 的入参形状一致）。 */
export interface SettingsOp {
  op: 'set' | 'unset'
  path: readonly string[]
  value?: unknown
}

export interface SettingsService {
  get?: (namespace: string) => AnyRecord | undefined
  /**
   * 直读 settings 文档里那一节的原始内容，**不要求命名空间已注册**。
   *
   * 跟 get() 的区别：get() 给的是"解析后"的值（schema 默认 + 插件 config + 用户配置），
   * 但要求命名空间已注册；section() 读的是文档原文，命名空间还没注册时也拿得到。
   */
  section?: (namespace: string) => AnyRecord | undefined
  mutate?: (namespace: string, ops: readonly SettingsOp[]) => Promise<void>
}

export interface CredentialsService {
  resolve?: (ref: string) => Promise<unknown>
  unset?: (ref: string) => Promise<void>
}

/* ---------------------------- 插件上下文 ---------------------------- */

/**
 * cordis 上下文。只声明我们用到的方法，其余走索引签名。
 *
 * `get` 拿服务、直接属性拿服务两种写法宿主都支持（ctx.get('llm') 与 ctx.llm），
 * 代码里用 `service()` 统一收口。
 */
export interface PluginContext {
  get?: (name: string) => unknown
  effect: (fn: () => unknown, label?: string) => void
  inject?: (names: readonly string[], callback: (scope: PluginContext) => void) => void
  logger?: Logger | ((name: string) => Logger)
  [key: string]: unknown
}

/** cordis 插件模块的形状。 */
export interface PluginModule {
  name?: string
  inject?: readonly string[]
  apply: (ctx: PluginContext, config: unknown) => void
}

/* --------------------------- 小工具 --------------------------- */

/** JSON 对象 → 记录；不是对象就给空记录。 */
export function asRecord(value: unknown): AnyRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as AnyRecord
}

/** 读字符串字段，空的/非字符串一律 undefined。 */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** 读数字字段（数字字符串也认）。 */
export function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

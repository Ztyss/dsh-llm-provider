/**
 * 内核 0.1.7 适配层（2026-09-25 handoff：dsh-llm-provider 适配内核 0.1.7-rc.1）。
 *
 * 背景：0.1.5-rc.2 上桥接的官方 pi-ai `apply(ctx, config)` 吃的是**平面对象** config
 * （`config.providers` = 路由表），它自己 `installSection('llm-pi-ai', …, setSource)`
 * 把「schema 默认 → 插件 config → 用户 settings.yaml 的 llm-pi-ai.providers」三层合并
 * 起来——所以官方行被我们禁用后，用户路由仍能经我们桥接的 apply 进注册表。
 *
 * 0.1.7-rc.1 起官方 Config 变成 `.volatile()`：校验产物是 `{ providers: { get } }`
 * 响应式访问器，`apply` 里 `config.providers.get()` 读的是**条目自己的 config 命名空间**
 * （`ctx.fiber.entry?.options.id`），settings 段安装也换成了
 * `settings.configure({auto:false})` + `internal/config` / `loader/volatile-update` 事件。
 * 我们桥接时若照旧透传自己的 config，用户在 settings.yaml `llm-pi-ai.providers` 里的
 * 路由永远进不了注册表——表现即 handoff 里实测的
 * `no adapter serves provider "zai-coding-cn"`。
 *
 * 适配策略（双内核兼容，按**能力探测**分派，不解析内核版本号）：
 *  - 探测：拿桥接模块的 Config 跑一次 standard validate，校验产物里 `providers.get`
 *    是函数 ⇒ volatile 内核 ⇒ 合成访问器 `{ providers: { get: () => 合并路由 } }`，
 *    get 实时读 settings 服务的 `llm-pi-ai` 段（get→section 两级兜底，与
 *    providerRoutes 同一口径）叠在插件自带的 base 路由（deepseek）之上；
 *  - 否则走 0.1.5 的原样透传，行为零变化。
 */

import type { AnyRecord } from './types.js'

/** 标准 schema 接口里我们用到的最小面（schemastery 3.18+ 都实现）。 */
interface StandardValidate {
  validate(value: unknown): { value: unknown; issues?: unknown } | Promise<unknown>
}

/** 桥接到的官方插件模块里，本适配层关心的最小面。 */
export interface BridgePluginLike {
  Config?: { '~standard'?: StandardValidate }
  apply?: (ctx: unknown, config: unknown) => void
}

/** 配置语义两代形态。 */
export type ConfigAccessKind = 'volatile' | 'plain' | 'unknown'

/** settings 服务 / 普通记录的兜底读法（脏数据一律当空对象）。 */
function readRecord(read: () => unknown): AnyRecord {
  try {
    const value = read()
    // function 也放行：schemastery 的 Schema 本体就是「带属性的函数」（Config['~standard'] 挂在其上）。
    return value !== undefined && value !== null && (typeof value === 'object' || typeof value === 'function')
      ? (value as AnyRecord)
      : {}
  } catch {
    return {}
  }
}

/**
 * 探测桥接到的官方 Config 是 volatile（0.1.7+）还是 plain（0.1.5 系）。
 *
 * 判据：拿空 providers 跑一次 standard validate，校验产物 `providers.get` 是函数。
 * 不解析内核版本号——rc.2/正式版语义再变，探测跟着 schema 走。
 * 参数收 unknown：桥接模块的 Config 在我们自己的类型里是 unknown（形状随内核变）。
 */
export function configAccessKind(plugin: unknown): ConfigAccessKind {
  const config = readRecord(() => readRecord(() => plugin)['Config'])
  const standard = readRecord(() => config['~standard'])['validate'] as
    | ((value: unknown) => { value?: unknown; issues?: unknown } | Promise<unknown>)
    | undefined
  if (typeof standard !== 'function') return 'unknown'
  try {
    const result = standard({ providers: {} })
    // cordis 的 resolveConfig 要求同步校验；异步的当未知处理。
    if (result === undefined || result === null || typeof (result as { then?: unknown }).then === 'function') return 'unknown'
    const value = readRecord(() => (result as { value?: unknown }).value)
    const providers = readRecord(() => value['providers'])
    return typeof providers['get'] === 'function' ? 'volatile' : 'plain'
  } catch {
    return 'unknown'
  }
}

/**
 * 合并桥接路由：base（插件自带，如补丁声明的 deepseek）在下，用户 settings.yaml
 * `llm-pi-ai.providers` 在上——同名路由用户覆盖，与 0.1.5 installSection 的
 * 「schema 默认 → 插件 config → 用户层」顺序一致。纯函数，浅合并（每条路由整体覆盖）。
 */
export function mergeBridgeProviders(base: AnyRecord | undefined, user: AnyRecord | undefined): AnyRecord {
  const merged: AnyRecord = {}
  for (const [id, route] of Object.entries(base ?? {})) merged[id] = route
  for (const [id, route] of Object.entries(user ?? {})) merged[id] = route
  return merged
}

/** 从 settings 服务的两级读法里抠出用户路由表（与 routes.ts 的 providerRoutes 同口径）。 */
export function readUserProviders(settings: unknown): AnyRecord {
  const settingsRecord = readRecord(() => settings)
  const get = settingsRecord['get']
  const section = settingsRecord['section']
  const viaGet = readRecord(() => readRecord(() => typeof get === 'function' ? (get as (ns: string) => unknown)('llm-pi-ai') : undefined)['providers'])
  if (Object.keys(viaGet).length > 0) return viaGet
  return readRecord(() => readRecord(() => typeof section === 'function' ? (section as (ns: string) => unknown)('llm-pi-ai') : undefined)['providers'])
}

/**
 * 合成 volatile 访问器：`{ providers: { get: () => 合并路由 } }`。
 *
 * get 是**惰性**的——每次调用现读 settings，0.1.7 的
 * `loader/volatile-update` 重入（ensureRegistrationFacts / ensureDirectory）拿到的
 * 总是当前值。宿主端只需要这一个方法，别的不 duck-type（少假设少碎）。
 */
export function volatileProvidersConfig(getProviders: () => AnyRecord): { providers: { get: () => AnyRecord } } {
  return { providers: { get: getProviders } }
}

/** 从我们收到的 config 里抠 base 路由表：volatile 访问器与平面对象两种形态都认。 */
export function readBaseProviders(config: unknown): AnyRecord {
  const configRecord = readRecord(() => config)
  const providers = readRecord(() => configRecord['providers'])
  const get = providers['get']
  if (typeof get === 'function') return readRecord(() => get())
  return providers
}

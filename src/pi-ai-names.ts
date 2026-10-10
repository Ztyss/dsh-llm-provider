/**
 * pi-ai 注册表元信息读取：provider id → pi-ai 自己的 name / 官方默认端点 baseUrl / 缺省协议。
 *
 * 原则是「元信息一律用 pi-ai 的，我们不另起」：调 pi-ai 包导出的 *Provider() 工厂
 * 拿数据，和 pi-ai 自己展示/内部用的是同一个数据源。同步实现（createRequire，
 * dsh 跑在 Node 22+，require(esm) 可用），带按根目录缓存——updater 换版本后根目录
 * 变化，缓存自然失效。显式传 root（测试用）时同样按根隔离。
 */
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { activePiAiRoot } from './bridge.js'

/** 单个 provider 的注册表元信息；字段读不到就是 undefined（在册 ≠ 有默认端点）。 */
export interface ProviderMeta {
  name: string | undefined
  baseUrl: string | undefined
  /** 缺省 wire 协议（取自工厂首个 chat 模型的 api 字段，如 'openai-completions'）。 */
  api: string | undefined
}

/** 按根目录缓存：name / baseUrl / api 一趟工厂调用全拿，names 视图就地派生。 */
let cache: { root: string; metas: Map<string, ProviderMeta> } | undefined

function readMetas(root: string | undefined): Map<string, ProviderMeta> {
  if (root === undefined) return new Map()
  if (cache !== undefined && cache.root === root) return cache.metas
  const metas = new Map<string, ProviderMeta>()
  const dir = join(root, 'dist', 'providers')
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return new Map()
  }
  const require = createRequire(join(root, 'package.json'))
  for (const file of files) {
    if (!file.endsWith('.js') || file.endsWith('.models.js') || file === 'all.js') continue
    const id = file.slice(0, -'.js'.length)
    try {
      const mod = require(join(dir, file)) as Record<string, unknown>
      // pi-ai 每个 provider 文件导出一个 *Provider() 工厂；按函数名认它
      const factory = Object.values(mod).find(
        (value): value is () => Record<string, unknown> => typeof value === 'function' && /Provider$/.test(value.name),
      )
      if (factory === undefined) continue
      const provider = factory()
      const name = typeof provider['name'] === 'string' && provider['name'] !== '' ? provider['name'] : undefined
      const baseUrl =
        typeof provider['baseUrl'] === 'string' && provider['baseUrl'] !== '' ? provider['baseUrl'] : undefined
      // 缺省协议取首个 chat 模型的 api 字段：provider 对象不直接暴露 api（封在 dispatch 闭包里），
      // 但 getModels() 是静态表，第一个模型的 api 就是这条路由没写 api 字段时实际生效的协议。
      let api: string | undefined
      try {
        const models = typeof provider['getModels'] === 'function' ? (provider['getModels'] as () => unknown)() : undefined
        if (Array.isArray(models)) {
          for (const rawModel of models) {
            if (rawModel === null || typeof rawModel !== 'object') continue
            const candidate = (rawModel as Record<string, unknown>)['api']
            if (typeof candidate === 'string' && candidate !== '') {
              api = candidate
              break
            }
          }
        }
      } catch {
        /* 模型表读不出就当没有缺省协议 */
      }
      metas.set(id, { name, baseUrl, api })
    } catch {
      /* 单个 provider 读失败就跳过，不拖垮整表 */
    }
  }
  cache = { root, metas }
  return metas
}

/** pi-ai 注册表全量 id → 元信息。读不到时返回空 Map（调用方自行兜底）。 */
export function piAiMetas(root?: string): Map<string, ProviderMeta> {
  return readMetas(root ?? activePiAiRoot())
}

/** pi-ai 注册表全量 id → name。读不到时返回空 Map（调用方自行兜底）。 */
export function piAiNames(root?: string): Map<string, string> {
  const names = new Map<string, string>()
  for (const [id, meta] of piAiMetas(root)) {
    if (meta.name !== undefined) names.set(id, meta.name)
  }
  return names
}

/** 单个 provider 的 pi-ai 注册名，读不到返回 undefined。 */
export function piAiName(id: string, root?: string): string | undefined {
  return piAiMetas(root ?? activePiAiRoot()).get(id)?.name
}

/** 单个 provider 的官方默认端点元信息；目录里没有这个 id 返回 undefined（不硬猜）。 */
export function piAiProviderEndpoint(id: string, root?: string): { baseUrl: string | undefined; api: string | undefined } | undefined {
  const meta = piAiMetas(root ?? activePiAiRoot()).get(id)
  return meta === undefined ? undefined : { baseUrl: meta.baseUrl, api: meta.api }
}

/**
 * 「测试」端点解析（/provider/test-model 用）：
 *   - 路由显式写了 baseURL：照用它（只去尾斜杠），协议按显式 api 字段；
 *   - 没写 baseURL：回退 pi-ai 工厂的官方默认端点，协议缺省取工厂默认 api；
 *   - 两者都没有（目录外 id / 工厂没带 baseUrl）：返回 undefined，调用方如实回报。
 */
export function resolveTestEndpoint(
  route: { id: string; baseURL?: string; api?: string },
  root?: string,
): { base: string; isAnthropic: boolean } | undefined {
  const explicit = typeof route.baseURL === 'string' && route.baseURL !== '' ? route.baseURL.replace(/\/+$/, '') : ''
  if (explicit !== '') return { base: explicit, isAnthropic: route.api === 'anthropic-messages' }
  const meta = piAiProviderEndpoint(route.id, root)
  if (meta === undefined || meta.baseUrl === undefined || meta.baseUrl === '') return undefined
  return {
    base: meta.baseUrl.replace(/\/+$/, ''),
    isAnthropic: route.api === 'anthropic-messages' || (route.api === undefined && meta.api === 'anthropic-messages'),
  }
}

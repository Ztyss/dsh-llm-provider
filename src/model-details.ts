/**
 * 模型详情：从生效 pi-ai 包的 providers 数据文件读出全量模型元数据。
 *
 * 为什么不用 session/modelCatalog：那条官方 RPC 的模型条目只有 id/name/description/reasoning，
 * 没有上下文窗口、最大输出、能力（视觉/视频）这些——悬浮详情卡（Cherry Studio 式）需要更全的字段，
 * 而 pi-ai 的数据文件里都有（input/contextWindow/maxTokens/reasoning/thinkingLevelMap）。
 *
 * 输出按 provider 归组，客户端拿去做 hover 详情卡和上下文标签。
 *
 * 本地版补丁（issue #5「能力链路」）：pi-ai 目录**不是**能力的唯一来源。用户在 settings 的
 * `llm-pi-ai.providers.<id>.models[]` 里自己声明的模型（别名、自建端点、上游还没收录的新模型）
 * 在目录里查不到，此前界面就既不显示视觉徽标也不显示上下文——即使声明里写得明明白白。
 * 现在按「路由声明 → pi-ai 目录 → 未知」的顺序合并：见 {@link withDeclaredModels}。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asRecord, readNumber, readString, type AnyRecord } from './types.js'

const DATA_DIR = join('dist', 'providers', 'data')

/** 一个模型的元数据（下发给浏览器的形状）。 */
export interface ModelDetail {
  id: string
  name: string
  provider: string
  api: string
  baseUrl?: string
  contextWindow?: number
  maxTokens?: number
  vision: boolean
  video: boolean
  reasoning: boolean
  thinkingLevels: string[]
  /**
   * 这条元数据是哪来的：
   *   'pi-ai'    —— 生效 pi-ai 包的 providers 数据文件（上游权威）；
   *   'declared' —— 用户在 settings 的路由里声明的（目录没收录这个 id 时的唯一来源）；
   *   'adapter'  —— 适配器自己报的（`llm.resolveModelInfo`），覆盖前两者都没有的合成 provider
   *                （modlens 的 `modlens-<上游>` / `deepseek-modlens` 这类）。
   * 本地版新增字段，界面用它在详情卡里标出来源。
   */
  source?: 'pi-ai' | 'declared' | 'adapter'
}

/** 适配器自报的一条模型能力（宿主 `llm.resolveModelInfo` 的投影）。 */
export interface AdapterModelInfo {
  provider: string
  id: string
  name?: string | undefined
  inputModalities?: string[] | undefined
  contextWindow?: number | undefined
  maxTokens?: number | undefined
  reasoning?: boolean | undefined
  thinkingLevels?: string[] | undefined
}

/** 声明式模型清单里我们认的字段（settings 段形状，宽松读）。 */
interface DeclaredModel {
  id: string
  name: string | undefined
  contextWindow: number | undefined
  maxTokens: number | undefined
  input: string[]
  /** reasoningEfforts 原样：undefined=没写（跟目录走）、false=非推理模型、对象/true=推理模型。 */
  reasoningEfforts: unknown
  api: string | undefined
  baseUrl: string | undefined
}

/** 读一个 pi-ai 包目录的 providers 数据文件，拍平成模型详情数组。 */
export function loadModelDetails(piAiRoot: string | undefined): ModelDetail[] {
  if (typeof piAiRoot !== 'string' || piAiRoot === '') return []
  const dir = join(piAiRoot, DATA_DIR)
  if (!existsSync(dir)) return []
  const details: ModelDetail[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch {
      continue // 单个文件坏了不影响其他家
    }
    const data = asRecord(parsed)
    for (const api of Object.keys(data)) {
      const models = asRecord(data[api])
      for (const [modelId, rawEntry] of Object.entries(models)) {
        const entry = asRecord(rawEntry)
        if (Object.keys(entry).length === 0) continue
        const input = Array.isArray(entry['input']) ? entry['input'].filter((x): x is string => typeof x === 'string') : []
        const map = asRecord(entry['thinkingLevelMap'])
        const thinking = Object.keys(map).filter((k) => map[k] !== null && map[k] !== undefined)
        details.push({
          id: readString(entry['id']) ?? modelId,
          name: readString(entry['name']) ?? modelId,
          provider: readString(entry['provider']) ?? file.replace(/\.json$/, ''),
          api: readString(entry['api']) ?? api,
          baseUrl: readString(entry['baseUrl']),
          contextWindow: readNumber(entry['contextWindow']),
          maxTokens: readNumber(entry['maxTokens']),
          vision: input.includes('image'),
          video: input.includes('video'),
          reasoning: entry['reasoning'] === true,
          thinkingLevels: thinking,
          source: 'pi-ai',
        })
      }
    }
  }
  return details
}

/** 从 settings 的模型条目里读我们认得的字段（宽松；id 不合法就返回 undefined）。 */
function declaredModelOf(raw: unknown): DeclaredModel | undefined {
  const entry = asRecord(raw)
  const id = readString(entry['id'])
  if (id === undefined || id === '') return undefined
  return {
    id,
    name: readString(entry['name']),
    contextWindow: readNumber(entry['contextWindow']),
    maxTokens: readNumber(entry['maxTokens']),
    input: Array.isArray(entry['input'])
      ? entry['input'].filter((x): x is string => typeof x === 'string')
      // inputModalities 是 dsh 回读时的同义字段名：用户从官方 Models 页抄过来时会带它
      : (Array.isArray(entry['inputModalities']) ? entry['inputModalities'].filter((x): x is string => typeof x === 'string') : []),
    reasoningEfforts: entry['reasoningEfforts'],
    api: readString(entry['api']),
    baseUrl: readString(entry['baseURL']) ?? readString(entry['baseUrl']),
  }
}

/** 一条路由的声明（只用到 id / api / baseURL / models）。 */
export interface DeclaredRoute {
  id: string
  api?: string | undefined
  baseURL?: string | undefined
  models?: unknown[] | undefined
}

/** 模型 id 的对照键：provider 与 id 一起算，避免不同家的同名模型互相顶掉（issue #5 的索引口径）。 */
export function modelKey(provider: string, id: string): string {
  return provider + '\u0000' + id
}

/**
 * 把路由声明的模型并进 pi-ai 目录详情。
 *
 * 规则（「路由声明 → pi-ai 目录」）：
 *   1. 目录里已经有这个 (provider, model id) → 保留目录那份（上游权威，字段更全）；
 *   2. 目录里按 id 有、但属于别家 → 仍然保留目录那份，**不**拿声明去改它，
 *      省得把别家的元数据串到这条路由上；
 *   3. 目录里没有 → 用声明合成一条（`source: 'declared'`），能显示能力的就显示，
 *      声明里没写的字段留空（界面显示「—」/不显示，不猜）。
 *
 * 合成条目只用于显示（悬浮卡、徽标、上下文列），不参与请求构造：真正生效的字段由
 * 官方 adapter 的 resolveRouteModels 从 settings 读，这里不改任何配置。
 * @param details - {@link loadModelDetails} 的结果。
 * @param routes - 路由表（带 models 声明的那几条才有效果）。
 */
export function withDeclaredModels(details: readonly ModelDetail[], routes: Iterable<DeclaredRoute>): ModelDetail[] {
  const merged = details.slice()
  const byKey = new Set<string>()
  const byId = new Set<string>()
  for (const detail of merged) {
    byKey.add(modelKey(detail.provider, detail.id))
    byId.add(detail.id)
  }
  for (const route of routes) {
    const declaredList = Array.isArray(route.models) ? route.models : []
    for (const raw of declaredList) {
      const model = declaredModelOf(raw)
      if (model === undefined) continue
      if (byKey.has(modelKey(route.id, model.id)) || byId.has(model.id)) continue // 目录优先
      const efforts = model.reasoningEfforts
      const levels = efforts !== null && typeof efforts === 'object'
        ? Object.keys(asRecord(efforts)).filter((key) => asRecord(efforts)[key] !== null && asRecord(efforts)[key] !== undefined)
        : []
      merged.push({
        id: model.id,
        name: model.name ?? model.id,
        provider: route.id,
        api: model.api ?? route.api ?? 'openai-completions',
        baseUrl: model.baseUrl ?? route.baseURL,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        vision: model.input.includes('image'),
        video: model.input.includes('video'),
        // reasoningEfforts === false 是官方「非推理模型」的写法；对象 = 有档位；没写就不声称支持
        reasoning: efforts !== false && (levels.length > 0 || efforts === true),
        thinkingLevels: levels,
        source: 'declared',
      })
      byKey.add(modelKey(route.id, model.id))
      byId.add(model.id)
    }
  }
  return merged
}

/**
 * 能力链路的最后一环：**适配器自报**（2026-09-17 追加，用户报「modlens provider 还是没有视觉徽标」）。
 *
 * 有些 provider 的模型元数据，三处都没有：
 *   ① pi-ai 目录数据文件——没有这个 provider（它不在上游 39 个 provider 里）；
 *   ② settings 的 `llm-pi-ai.providers.<id>.models`——它不是 pi-ai 路由（是插件自己注册的合成 provider）；
 *   ③ 官方目录 RPC `session/modelCatalog`——只下发 id/name/description/reasoning，能力字段在
 *      `buildModelCatalog()` 里就被丢了（宿主侧 `resolveModelInfo()` 明明有 `inputModalities`）。
 * 典型就是 modlens（`@liustack/modlens`）：它注册 `modlens-<上游>` / `deepseek-modlens` 合成 provider，
 * 在 `listModels` 里给每个模型强制补上 `image`（"…(modlens vision)"），所以功能上能读图、
 * 界面上却一条能力徽标都没有。
 *
 * 这里把宿主问到的适配器结论按 **provider+id** 并进详情表：已有的（pi-ai 目录 / 路由声明）不覆盖——
 * 那两处是上游权威；只填空缺。
 * @param details - 已有详情（pi-ai 目录 + 路由声明合并后的结果）。
 * @param infos - 适配器自报的条目（见 {@link AdapterModelInfo}）。
 */
export function withAdapterModels(details: readonly ModelDetail[], infos: readonly AdapterModelInfo[]): ModelDetail[] {
  const merged = details.slice()
  const byKey = new Set<string>()
  for (const detail of merged) byKey.add(modelKey(detail.provider, detail.id))
  for (const info of infos) {
    if (typeof info.provider !== 'string' || info.provider === '' || typeof info.id !== 'string' || info.id === '') continue
    const key = modelKey(info.provider, info.id)
    if (byKey.has(key)) continue // 目录/声明已有：上游权威，不覆盖
    const modalities = Array.isArray(info.inputModalities) ? info.inputModalities : []
    merged.push({
      id: info.id,
      name: info.name ?? info.id,
      provider: info.provider,
      api: 'adapter-reported',
      contextWindow: info.contextWindow,
      maxTokens: info.maxTokens,
      vision: modalities.includes('image'),
      video: modalities.includes('video'),
      reasoning: info.reasoning === true,
      thinkingLevels: Array.isArray(info.thinkingLevels) ? info.thinkingLevels : [],
      source: 'adapter',
    })
    byKey.add(key)
  }
  return merged
}

/** 按 (provider, id) 建索引，给「逐模型编辑器」列候选用。 */
export function detailsForProvider(details: readonly ModelDetail[], providerId: string): ModelDetail[] {
  const own: ModelDetail[] = []
  for (const detail of details) {
    if (detail.provider === providerId) own.push(detail)
  }
  return own
}

/** 读一条 settings 模型条目的原始形状（编辑器回填用；保持宽松类型）。 */
export function rawDeclaredModels(route: DeclaredRoute): AnyRecord[] {
  const list = Array.isArray(route.models) ? route.models : []
  const out: AnyRecord[] = []
  for (const raw of list) {
    const entry = asRecord(raw)
    if (readString(entry['id']) !== undefined) out.push(entry)
  }
  return out
}

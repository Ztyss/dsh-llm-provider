/**
 * 模型详情：把模型元数据的两条链路合并成下发给浏览器的一份。
 *
 *   1. route 声明（{@link collectRouteModels}）——走 `ctx.llm.listModels`，宿主 catalog 的同一个
 *      入口。用户在 settings 里给 route 的 `models[].input` 声明的能力，只有这条链路带得出来。
 *   2. pi-ai 目录（{@link loadModelDetails}）——生效 pi-ai 包的 providers 数据文件，字段最全
 *      （input/contextWindow/maxTokens/reasoning/thinkingLevelMap）。
 *
 * 为什么不能只留一条：自定义模型 id（`opencode-go/deepseek-flash` 这种）在 pi-ai 目录里根本
 * 不存在——只读目录就是「能识图却没徽章」，而且失败是静默的；反过来，目录里查不到也不等于
 * 不支持。所以能力字段按 route 声明 → pi-ai 目录 → **未知**取，未知就留 undefined：
 * 界面不打徽章、详情卡写「能力未知」。把「不知道」合成 false，等于把「没查过」渲染成「没有」。
 *
 * 为什么不用 session/modelCatalog：那条官方 RPC 的模型条目只有 id/name/description/reasoning，
 * 没有上下文窗口、最大输出、能力（视觉/视频）这些——悬浮详情卡（Cherry Studio 式）需要更全的字段。
 *
 * 输出是一条平铺的详情数组，客户端按 provider + id 建索引（跨 provider 重名在 pi-ai 目录里是常态）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asRecord, readNumber, readString, type LlmService } from './types.js'

const DATA_DIR = join('dist', 'providers', 'data')

/** 一个模型的元数据（下发给浏览器的形状）。 */
export interface ModelDetail {
  id: string
  name: string
  provider: string
  /** pi-ai 目录里的 wire 协议。route 独有的自定义模型没有这一项：listModels 不回它。 */
  api?: string
  baseUrl?: string
  contextWindow?: number
  maxTokens?: number
  /**
   * 视觉 / 视频 / 推理能力：`true` 支持，`false` 明确不支持，`undefined` **未知**。
   * 未知与「明确不支持」必须分开：前者是没人说过（自定义模型在 pi-ai 目录里查不到就是这种），
   * 后者是查到的结论。界面只给 `true` 打徽章，详情卡只在全是 undefined 时写「能力未知」。
   */
  vision?: boolean
  video?: boolean
  reasoning?: boolean
  thinkingLevels: string[]
}

/** 一条 route 解析出来的模型（`llm.listModels` / `llm.resolveModelInfo` 的产出形状）。 */
export interface RouteModel {
  provider: string
  id: string
  name?: string
  /** route 声明的输入模态，适配器已经解析完（见 LlmService.listModels 的注释）。 */
  input?: string[]
  contextWindow?: number
  maxTokens?: number
  reasoning?: boolean
  thinkingLevels?: string[]
}

/** 索引/去重用的键：provider + id。跨 provider 重名（claude-opus-5 这种）靠它分开。 */
function keyOf(provider: string, id: string): string {
  return provider + '/' + id
}

/**
 * 读一份模态表。空表当「没声明」而不是「什么都不支持」：适配器不会给空表，真给了也说明
 * 这条链路没说出结论，那就该停在未知。
 */
function readModalities(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value.filter((item): item is string => typeof item === 'string')
  return list.length > 0 ? list : undefined
}

/** 调 `llm.listModels`：方法缺席（老宿主）给 undefined，抛错（路由没注册）交给调用方吞。 */
async function listRouteModels(llm: LlmService, provider: string): Promise<unknown> {
  if (typeof llm.listModels !== 'function') return undefined
  return await llm.listModels(provider)
}

/** 调 `llm.resolveModelInfo`：同上。 */
async function resolveRouteModel(llm: LlmService, provider: string, model: string): Promise<unknown> {
  if (typeof llm.resolveModelInfo !== 'function') return undefined
  return await llm.resolveModelInfo(provider, model)
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
        })
      }
    }
  }
  return details
}

/**
 * 把 `llm.resolveModelInfo` 的产出读成我们缺的那几样。
 *
 * 目录里没有的模型（自定义 id）合并进详情后只有能力字段，窗口和输出上限得从这条解析结果认：
 * 用户明明在 route 里声明了 contextWindow/maxTokens，卡片上却空着，看着就像没生效。
 */
export function readResolvedModel(provider: string, id: string, raw: unknown): RouteModel {
  const info = asRecord(raw)
  const context = asRecord(info['context'])
  const reasoning = asRecord(info['reasoning'])
  const efforts = Array.isArray(reasoning['efforts']) ? reasoning['efforts'] : []
  const levels = efforts
    .map((effort) => readString(asRecord(effort)['id']))
    .filter((level): level is string => level !== undefined)
  return {
    provider,
    id,
    contextWindow: readNumber(context['contextWindow']),
    maxTokens: readNumber(info['defaultMaxTokens']),
    // 解析成功（宿主会校验形状、形状不对就抛）但 reasoning 缺席 = 这家不支持思考，属「已知没有」。
    // 解析失败的情况连 RouteModel 都不生成，不会走到这里被当成 false。
    reasoning: Object.keys(reasoning).length > 0,
    thinkingLevels: levels.length > 0 ? levels : undefined,
  }
}

/**
 * 把各 route 实际服务的模型收上来——能力的第一来源。
 *
 * 单条 route 拿不到就跳过它：跳过只让这条 route 的模型停在「能力未知」，不打徽章；硬猜一个
 * 出来会把别人的能力挂到它头上，那比不打更难发现。
 */
export async function collectRouteModels(
  llm: LlmService | undefined,
  providers: Iterable<string>,
): Promise<RouteModel[]> {
  if (llm === undefined) return []
  const collected: RouteModel[] = []
  for (const provider of providers) {
    let raw: unknown
    try {
      raw = await listRouteModels(llm, provider)
    } catch {
      continue // settings 里写了这条路由、适配器没起来：跳过，不猜
    }
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      const entry = asRecord(item)
      const id = readString(entry['id'])
      if (id === undefined) continue
      collected.push({
        provider,
        id,
        name: readString(entry['name']),
        input: readModalities(entry['inputModalities']),
      })
    }
  }
  return collected
}

/**
 * 把 route 解析出来的模型并进 pi-ai 目录的详情。
 *
 * 优先级：**能力字段 route 声明 > pi-ai 目录 > 未知**；route 里出现、目录里没有的模型（自定义
 * id）直接补一条——它们的能力只有 route 说得清，不补就永远没徽章。窗口/输出上限/思考档位反过来，
 * 只在目录那条缺项时用 route 的值补：目录数据更权威。
 * @param details - pi-ai 目录读出来的详情（函数内复制，不改入参：缓存会跨请求复用）。
 * @param models - route 解析出来的模型（{@link collectRouteModels} 的产出）。
 */
export function mergeRouteModels(
  details: readonly ModelDetail[],
  models: readonly RouteModel[],
): ModelDetail[] {
  const merged = details.map((detail) => ({ ...detail }))
  const byKey = new Map<string, ModelDetail>()
  for (const detail of merged) byKey.set(keyOf(detail.provider, detail.id), detail)
  for (const model of models) {
    const declared = readModalities(model.input)
    const key = keyOf(model.provider, model.id)
    const found = byKey.get(key)
    if (found === undefined) {
      const added: ModelDetail = {
        id: model.id,
        name: model.name ?? model.id,
        provider: model.provider,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        // 没声明模态就是 undefined（未知），不是 false（不支持）
        vision: declared?.includes('image'),
        video: declared?.includes('video'),
        reasoning: model.reasoning,
        thinkingLevels: model.thinkingLevels ?? [],
      }
      byKey.set(key, added)
      merged.push(added)
      continue
    }
    if (declared !== undefined) {
      found.vision = declared.includes('image')
      found.video = declared.includes('video')
    }
    if (found.contextWindow === undefined) found.contextWindow = model.contextWindow
    if (found.maxTokens === undefined) found.maxTokens = model.maxTokens
    if (found.reasoning === undefined) found.reasoning = model.reasoning
    if (found.thinkingLevels.length === 0 && model.thinkingLevels !== undefined) found.thinkingLevels = model.thinkingLevels
  }
  return merged
}

/**
 * `/provider/models` 的完整出口：pi-ai 目录 + route 声明两条链路合并。
 *
 * 顺序是先收模型、再只给「目录里没有」的那些补窗口/输出上限：内置模型在目录里已经写全，不值得
 * 为它们多打一轮 resolveModelInfo；自定义模型才是缺字段的那批。任何一步拿不到都只让对应字段停在
 * 「未知」——徽章和详情卡打错比留空难发现得多。
 * @param details - pi-ai 目录读出来的详情。
 * @param llm - llm 服务（可为 undefined）。
 * @param providers - 要问的 route id（`providerRoutes` 的键）。
 */
export async function enrichModelDetails(
  details: readonly ModelDetail[],
  llm: LlmService | undefined,
  providers: Iterable<string>,
): Promise<ModelDetail[]> {
  const models = await collectRouteModels(llm, providers)
  if (llm === undefined || models.length === 0) return mergeRouteModels(details, [])
  const fromCatalog = new Set(details.map((detail) => keyOf(detail.provider, detail.id)))
  for (const model of models) {
    if (fromCatalog.has(keyOf(model.provider, model.id))) continue
    let raw: unknown
    try {
      raw = await resolveRouteModel(llm, model.provider, model.id)
    } catch {
      continue // 解析不了就只留能力字段，窗口留空
    }
    if (raw === undefined) continue
    const resolved = readResolvedModel(model.provider, model.id, raw)
    model.contextWindow = resolved.contextWindow
    model.maxTokens = resolved.maxTokens
    model.reasoning = resolved.reasoning
    model.thinkingLevels = resolved.thinkingLevels
  }
  return mergeRouteModels(details, models)
}

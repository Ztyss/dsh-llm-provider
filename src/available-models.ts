/**
 * 可用模型拉取（「可用模型」面板的数据源）。
 *
 * 为什么需要它：模型编辑器只能从 pi-ai 目录或手填自定义 id 里选模型，而端点
 * （`GET /models`，anthropic 协议是 `/v1/models`）明明自报一份可用清单——
 * deepseek-local 这类自定义 baseURL 的中转/本地网关尤其如此，目录里根本没有
 * 它们的模型条目。这份模块把「向端点要清单」收口成一个可离线测试的纯依赖函数：
 * 路由壳（index.ts）只负责解析 route/凭据，解析规则全在这里钉死。
 *
 * 设计要点：
 * - **key 可缺席**：本地网关的 `/models` 常常不鉴权，没配凭据也照拉（不带鉴权头）；
 *   网关真要 key 会回 401，如实回报即可——比「凭据没配置就拒绝」多救一类本地场景。
 * - **key 不出宿主**：请求由宿主发（fetch 在宿主进程里跑），浏览器只拿到清单结果。
 * - **元数据只认正整数**：`context_length` 这族字段各家叫法不一（见 {@link CONTEXT_FIELDS}/
 *   {@link OUTPUT_FIELDS}），只认 number 类型的正整数、同族多字段取最小；字符串、
 *   负数、0、浮点一律忽略——虚报一个解析错的窗口比不报更糟。
 */
import { asRecord, readString, type AnyRecord } from './types.js'

/** 端点清单里的一条（已解析：id 必有，窗口/输出给了就带上）。 */
export interface EndpointModelMeta {
  id: string
  contextWindow?: number
  maxTokens?: number
}

/** 拉取结果：成功给 models，失败给可直接展示的 error 文案。 */
export type AvailableModelsResult =
  | { ok: true; models: EndpointModelMeta[] }
  | { ok: false; error: string }

/** 上下文窗口的字段族（各家网关命名不一，同族取最小正整数）。 */
const CONTEXT_FIELDS: readonly string[] = ['context_length', 'max_context_tokens', 'context_window']

/** 最大输出的字段族。 */
const OUTPUT_FIELDS: readonly string[] = ['max_completion_tokens', 'max_output_tokens', 'max_model_output_tokens']

/** 我们只用到的请求面（测试注入桩，宿主里是真 fetch）。 */
type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<ResponseLike>

/** 测试/宿主共用的最小响应面（离线测试不引 node:http 的形状）。 */
export interface ResponseLike {
  ok: boolean
  status: number
  text: () => Promise<string>
}

/** 同族字段里取最小正整数（只认 number；字符串/负数/0/浮点忽略）。 */
function smallestPositiveInt(record: AnyRecord, fields: readonly string[]): number | undefined {
  let smallest: number | undefined = undefined
  for (const field of fields) {
    const value = record[field]
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) continue
    if (smallest === undefined || value < smallest) smallest = value
  }
  return smallest
}

/**
 * 拉取一个端点的可用模型清单。
 *
 * @param endpoint - `{ base, isAnthropic }`：base 已去尾斜杠（resolveTestEndpoint 的产出）。
 * @param key - 凭据值；undefined/空串 = 不带鉴权头（本地网关）。
 * @param fetchImpl - 请求实现（测试注入桩用）；缺省用 globalThis.fetch。
 */
export async function fetchAvailableModels(
  endpoint: { base: string; isAnthropic: boolean },
  key: string | undefined,
  fetchImpl?: FetchLike,
): Promise<AvailableModelsResult> {
  const url = endpoint.isAnthropic ? endpoint.base + '/v1/models' : endpoint.base + '/models'
  const headers: Record<string, string> = endpoint.isAnthropic
    ? { 'anthropic-version': '2023-06-01' }
    : {}
  if (endpoint.isAnthropic) {
    if (typeof key === 'string' && key !== '') headers['x-api-key'] = key
  } else if (typeof key === 'string' && key !== '') {
    headers['Authorization'] = 'Bearer ' + key
  }
  const doFetch = fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  let raw: string
  try {
    const response = await doFetch(url, { headers, signal: AbortSignal.timeout(15_000) })
    raw = await response.text()
    if (!response.ok) {
      const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
      return { ok: false, error: `HTTP ${response.status}${snippet !== '' ? '：' + snippet : ''}` }
    }
  } catch (error) {
    return { ok: false, error: '端点请求失败：' + (error instanceof Error ? error.message : String(error)) }
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return { ok: false, error: '响应不是 JSON 清单' }
  }
  const record = asRecord(body)
  const list = Array.isArray(record['data'])
    ? record['data']
    : Array.isArray(record['models'])
      ? record['models']
      : undefined
  if (list === undefined) return { ok: false, error: '响应里没有模型清单（data / models）' }
  const models: EndpointModelMeta[] = []
  const seen = new Set<string>()
  for (const item of list) {
    // 字符串条目：id 直取（部分网关就这么回）；对象条目：id ?? name
    let id: string | undefined
    let itemRecord: AnyRecord | undefined
    if (typeof item === 'string') {
      id = item !== '' ? item : undefined
    } else {
      itemRecord = asRecord(item)
      id = readString(itemRecord['id']) ?? readString(itemRecord['name'])
    }
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const entry: EndpointModelMeta = { id }
    if (itemRecord !== undefined) {
      const contextWindow = smallestPositiveInt(itemRecord, CONTEXT_FIELDS)
      const maxTokens = smallestPositiveInt(itemRecord, OUTPUT_FIELDS)
      if (contextWindow !== undefined) entry.contextWindow = contextWindow
      if (maxTokens !== undefined) entry.maxTokens = maxTokens
    }
    models.push(entry)
  }
  return { ok: true, models }
}

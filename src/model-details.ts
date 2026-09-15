/**
 * 模型详情：从生效 pi-ai 包的 providers 数据文件读出全量模型元数据。
 *
 * 为什么不用 session/modelCatalog：那条官方 RPC 的模型条目只有 id/name/description/reasoning，
 * 没有上下文窗口、最大输出、能力（视觉/视频）这些——悬浮详情卡（Cherry Studio 式）需要更全的字段，
 * 而 pi-ai 的数据文件里都有（input/contextWindow/maxTokens/reasoning/thinkingLevelMap）。
 *
 * 输出按 provider 归组，客户端拿去做 hover 详情卡和上下文标签。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asRecord, readNumber, readString } from './types.js'

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

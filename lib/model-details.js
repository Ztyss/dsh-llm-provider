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

const DATA_DIR = join('dist', 'providers', 'data')

/** 读一个 pi-ai 包目录的 providers 数据文件，拍平成模型详情数组。 */
export function loadModelDetails(piAiRoot) {
  if (typeof piAiRoot !== 'string' || piAiRoot === '') return []
  const dir = join(piAiRoot, DATA_DIR)
  if (!existsSync(dir)) return []
  const details = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    let data
    try {
      data = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch {
      continue // 单个文件坏了不影响其他家
    }
    if (data === null || typeof data !== 'object') continue
    for (const api of Object.keys(data)) {
      const models = data[api]
      if (models === null || typeof models !== 'object') continue
      for (const [modelId, entry] of Object.entries(models)) {
        if (entry === null || typeof entry !== 'object') continue
        const input = Array.isArray(entry.input) ? entry.input.filter((x) => typeof x === 'string') : []
        const thinking = entry.thinkingLevelMap !== null && typeof entry.thinkingLevelMap === 'object'
          ? Object.keys(entry.thinkingLevelMap).filter((k) => entry.thinkingLevelMap[k] !== null && entry.thinkingLevelMap[k] !== undefined)
          : []
        details.push({
          id: typeof entry.id === 'string' ? entry.id : modelId,
          name: typeof entry.name === 'string' ? entry.name : modelId,
          provider: typeof entry.provider === 'string' ? entry.provider : file.replace(/\.json$/, ''),
          api: typeof entry.api === 'string' ? entry.api : api,
          baseUrl: typeof entry.baseUrl === 'string' ? entry.baseUrl : undefined,
          contextWindow: typeof entry.contextWindow === 'number' ? entry.contextWindow : undefined,
          maxTokens: typeof entry.maxTokens === 'number' ? entry.maxTokens : undefined,
          vision: input.includes('image'),
          video: input.includes('video'),
          reasoning: entry.reasoning === true,
          thinkingLevels: thinking,
        })
      }
    }
  }
  return details
}

/**
 * dsh 的配置文件/settings 文档读取。
 *
 * 为什么不只用 `settings.get('llm-pi-ai')`：实测 0.1.2-rc.1 上 `llm-pi-ai` 的 settings
 * 命名空间根本没注册 —— 它初始化时要拿当前 providers 去 registerConfigurableProviders，
 * 而 dsh-llm 明确拒绝空的 provider 列表，那一步抛错后 `ctx.inject(["settings"], ...)` 就没跑到，
 * 命名空间也就不存在。所以配置得能直接从文件读出来。
 *
 * 这里只解 `llm-pi-ai.providers` 需要的那点结构，不引 YAML 依赖：
 * 按缩进认层级，值只取字符串/数字/布尔。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** DSH 数据目录：跟 dsh-home-paths 一致，DSH_HOME 优先。 */
export function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}

/** 读 `$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers` 段。 */
export function readProviderRoutesFromFile(dshHome = resolveDshHome()) {
  return parseSettingsDocument(readFileSync(join(dshHome, 'settings.yaml'), 'utf8')).providers
}

/** 解析 settings 文档里 `llm-pi-ai.providers` 这一段。 */
export function parseSettingsDocument(text) {
  const providers = {}
  // 三档：顶层 key / llm-pi-ai 下的 key（providers 在这里）/ providers 下的 provider id
  let level = 'top'
  let providerId
  let providerIndent

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length

    if (indent === 0) {
      level = /^llm-pi-ai:\s*$/.test(trimmed) ? 'pi-ai' : 'top'
      providerId = undefined
      continue
    }

    const entry = /^([A-Za-z0-9._-]+):\s*(.*)$/.exec(trimmed)
    if (entry === null) continue

    if (level === 'pi-ai') {
      if (/^providers:/.test(trimmed)) {
        level = 'providers'
        continue
      }
      // llm-pi-ai 下别的 key，跳过
      continue
    }
    if (level !== 'providers') continue

    if (providerId === undefined || indent <= providerIndent) {
      providerId = entry[1]
      providerIndent = indent
      providers[providerId] = inlineMap(entry[2]) ?? {}
      continue
    }
    const value = scalar(entry[2])
    if (value !== undefined) providers[providerId][entry[1]] = value
  }

  return { providers }
}

/** 支持 `{ apiKeyEnv: KIMI_CODING_API_KEY }` 这种行内映射。 */
function inlineMap(text) {
  const match = /^\{(.*)\}$/.exec(text.trim())
  if (match === null) return undefined
  const result = {}
  for (const pair of match[1].split(',')) {
    const index = pair.indexOf(':')
    if (index < 0) continue
    const value = scalar(pair.slice(index + 1))
    if (value !== undefined) result[pair.slice(0, index).trim()] = value
  }
  return result
}

function scalar(text) {
  const value = text.trim().replace(/^["']|["']$/g, '')
  if (value === '' || value === 'null' || value === '~') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

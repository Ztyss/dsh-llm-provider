/**
 * provider 路由发现：决定额度面板上显示哪些 provider、各自用哪个凭据名。
 *
 * 两条来源合并：
 *   1. settings 的 `llm-pi-ai.providers`——用户实际配置的 pi-ai 路由。catalog 里那些
 *      没配置的 provider 也躺在 llm 目录里，但不该出现在额度面板上。
 *   2. `ctx.llm.listConfigurableProviders()` 里的原生适配器路由（llm-deepseek 这类）：
 *      它们不写 settings 段也带默认 apiKeyEnv，seam 上查不到这个默认值，只能用
 *      NATIVE_ROUTE_DEFAULTS 对上。必须含进来，否则「deepseek 的 key 被填到 kimi 那一栏」
 *      这类错配检测不到（实测就是靠这条才发现的）。
 *
 * 命名空间没注册时退回 settings.section()：直接读 dsh 解析好的文档，不用自己解析 YAML。
 */
import { piAiName } from './pi-ai-names.js'
import { asRecord, readString, type AnyRecord, type LlmService, type SettingsService } from './types.js'

/** 一条要查额度的路由。 */
export interface ProviderRoute {
  id: string
  apiKeyEnv: string | undefined
  baseURL: string | undefined
  /** wire 协议（settings 段里存的值，卡片展开体要展示）。 */
  api?: string | undefined
  label: string | undefined
  source: 'llm-pi-ai' | 'native'
}

/**
 * provider 显示名：pi-ai 注册表原名优先（deepseek → "DeepSeek"），
 * pi-ai 没有的原生路由走 NATIVE_ROUTE_DEFAULTS，再按 id 拼一个（kimi-coding → "Kimi Coding"）。
 */
export function labelOf(providerId: string): string {
  const piName = piAiName(providerId)
  if (piName !== undefined) return piName
  return providerId
    .split(/[-_]/)
    .filter((part) => part !== '')
    .map((part) => (/^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

/** provider id → 官网/控制台链接（Provider 卡片名称下的跳转链接）。取自 CC Switch 预设（剥掉 aff/utm 跟踪参数）；CC Switch 没有的（moonshot/zenmux）用官方控制台地址。 */
const KNOWN_WEBSITES: Record<string, string> = {
  'kimi-coding': 'https://www.kimi.com/code',
  'zai-coding-cn': 'https://open.bigmodel.cn',
  'qwen-token-plan-cn': 'https://bailian.console.aliyun.com',
  'deepseek-official': 'https://platform.deepseek.com',
  'moonshotai-cn': 'https://platform.moonshot.cn',
  'minimax-cn': 'https://platform.minimaxi.com',
  'opencode-go': 'https://opencode.ai/go',
  'openrouter': 'https://openrouter.ai',
}

/** 查官网链接：精确匹配优先，再试前缀（minimax-cn → minimax-intl 这类变体兜底）。 */
export function websiteOf(providerId: string): string | undefined {
  const exact = KNOWN_WEBSITES[providerId]
  if (exact !== undefined) return exact
  for (const key of Object.keys(KNOWN_WEBSITES)) {
    const stem = key.endsWith('-cn') ? key.slice(0, -3) : key
    if (providerId.startsWith(key) || (stem !== key && providerId.startsWith(stem))) return KNOWN_WEBSITES[key]
  }
  return undefined
}

/** 原生适配器的默认 apiKeyEnv：这些适配器不写 settings 段也有 key 引用，值只能在这里认。 */
export const NATIVE_ROUTE_DEFAULTS: Record<string, { apiKeyEnv: string; label: string }> = {
  'deepseek-official': { apiKeyEnv: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
}

/**
 * 合并出要查额度的路由表。
 * @param settings - settings 服务（可为 undefined）。
 * @param llm - llm 服务（可为 undefined）；用它的 listConfigurableProviders 找原生路由。
 */
export function providerRoutes(
  settings: SettingsService | undefined,
  llm: LlmService | undefined,
): Map<string, ProviderRoute> {
  const routes = new Map<string, ProviderRoute>()

  // 两条读法，按序兜底：
  //   get()     —— 命名空间「解析后」的值：schema 默认 + 插件 config（base 层）+ 用户配置。
  //                要的就是这个合并结果（DeepSeek 那条来自插件的 base 层，用户没写过）。
  //                但它要求命名空间已注册，而 llm-pi-ai 的注册是在它自己 apply 里做的，
  //                那一步之前（或它 apply 抛错时）就取不到。
  //   section() —— 直接读 settings 文档里那一节的原始内容，不要求注册，正好补上面那个空档。
  //                以前这里是自己解析 settings.yaml（93 行手写 YAML），纯属绕远路：
  //                那份文档本来就是 dsh 解析好放在那儿的。
  const resolved = safeObject(() => asRecord(asRecord(settings?.get?.('llm-pi-ai'))['providers']))
  const piAiProviders = Object.keys(resolved).length > 0
    ? resolved
    : safeObject(() => asRecord(asRecord(settings?.section?.('llm-pi-ai'))['providers']))
  for (const [id, rawRoute] of Object.entries(piAiProviders)) {
    const route = asRecord(rawRoute)
    routes.set(id, {
      id,
      apiKeyEnv: readString(route['apiKeyEnv']),
      baseURL: readString(route['baseURL']),
      // wire 协议：卡片展开体要和「添加供应商」表单展示同一组信息，settings 段里存的就是这个值
      api: readString(route['api']),
      label: readString(route['displayName']),
      source: 'llm-pi-ai',
    })
  }

  let declared: unknown = []
  try {
    declared = typeof llm?.listConfigurableProviders === 'function' ? llm.listConfigurableProviders() : []
  } catch {
    declared = []
  }
  for (const rawEntry of Array.isArray(declared) ? declared : []) {
    const entry = asRecord(rawEntry)
    if (entry['settingsNs'] === 'llm-pi-ai') continue
    const provider = readString(entry['provider'])
    if (provider === undefined) continue
    const defaults = NATIVE_ROUTE_DEFAULTS[provider]
    if (defaults === undefined || routes.has(provider)) continue
    routes.set(provider, {
      id: provider,
      apiKeyEnv: defaults.apiKeyEnv,
      baseURL: undefined,
      label: defaults.label,
      source: 'native',
    })
  }

  return routes
}

function safeObject(read: () => AnyRecord): AnyRecord {
  try {
    return asRecord(read())
  } catch {
    return {}
  }
}

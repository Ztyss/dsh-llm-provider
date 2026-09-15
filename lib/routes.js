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
 * 读不到 settings 时退回直接解析 settings.yaml（见 settings-source.js 的说明）。
 */
import { readProviderRoutesFromFile } from './settings-source.js'
import { piAiName } from './pi-ai-names.js'

/**
 * provider 显示名：pi-ai 注册表原名优先（deepseek → "DeepSeek"），
 * pi-ai 没有的原生路由走 NATIVE_ROUTE_DEFAULTS，再按 id 拼一个（kimi-coding → "Kimi Coding"）。
 */
export function labelOf(providerId) {
  const piName = piAiName(providerId)
  if (piName !== undefined) return piName
  return providerId
    .split(/[-_]/)
    .filter((part) => part !== '')
    .map((part) => (/^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

/** provider id → 官网/控制台链接（Provider 卡片名称下的跳转链接）。取自 CC Switch 预设（剥掉 aff/utm 跟踪参数）；CC Switch 没有的（moonshot/zenmux）用官方控制台地址。 */
const KNOWN_WEBSITES = {
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
export function websiteOf(providerId) {
  if (Object.prototype.hasOwnProperty.call(KNOWN_WEBSITES, providerId)) return KNOWN_WEBSITES[providerId]
  for (const key of Object.keys(KNOWN_WEBSITES)) {
    const stem = key.endsWith('-cn') ? key.slice(0, -3) : key
    if (providerId.startsWith(key) || (stem !== key && providerId.startsWith(stem))) return KNOWN_WEBSITES[key]
  }
  return undefined
}

/** 原生适配器的默认 apiKeyEnv：这些适配器不写 settings 段也有 key 引用，值只能在这里认。 */
export const NATIVE_ROUTE_DEFAULTS = {
  'deepseek-official': { apiKeyEnv: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
}

/**
 * 合并出要查额度的路由表。
 * @param settings - settings 服务（可为 undefined）。
 * @param dshHome - DSH 数据目录，用于兜底读 settings.yaml。
 * @param llm - llm 服务（可为 undefined）；用它的 listConfigurableProviders 找原生路由。
 * @returns `Map<providerId, { id, apiKeyEnv, baseURL, api?, label?, source }>`。
 */
export function providerRoutes(settings, dshHome, llm) {
  const routes = new Map()

  const piAiProviders = safeObject(() => safeObject(() => settings?.get?.('llm-pi-ai')).providers)
  const fromFile = Object.keys(piAiProviders).length > 0
    ? piAiProviders
    : safeObject(() => readProviderRoutesFromFile(dshHome))
  for (const [id, route] of Object.entries(fromFile)) {
    routes.set(id, {
      id,
      apiKeyEnv: route?.apiKeyEnv,
      baseURL: route?.baseURL,
      // wire 协议：卡片展开体要和「添加供应商」表单展示同一组信息，settings 段里存的就是这个值
      api: typeof route?.api === 'string' ? route.api : undefined,
      label: typeof route?.displayName === 'string' ? route.displayName : undefined,
      source: 'llm-pi-ai',
    })
  }

  let declared = []
  try {
    declared = typeof llm?.listConfigurableProviders === 'function' ? llm.listConfigurableProviders() : []
  } catch {
    declared = []
  }
  for (const entry of Array.isArray(declared) ? declared : []) {
    if (entry?.settingsNs === 'llm-pi-ai') continue
    const defaults = NATIVE_ROUTE_DEFAULTS[entry?.provider]
    if (defaults === undefined || routes.has(entry.provider)) continue
    routes.set(entry.provider, {
      id: entry.provider,
      apiKeyEnv: defaults.apiKeyEnv,
      baseURL: undefined,
      label: defaults.label,
      source: 'native',
    })
  }

  return routes
}

function safeObject(read) {
  try {
    const value = read()
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
  } catch {
    return {}
  }
}

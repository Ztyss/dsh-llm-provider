/**
 * 可添加的供应商预设：Provider 标签页「＋ 添加供应商」的候选清单。
 *
 * 清单主体**动态来自生效 pi-ai 包的 providers 数据文件**（上游发新版自动跟进），按名字排序；
 * pi-ai 目录没有的只有 EXTRA_PRESETS 里那一个自定义网关入口，固定排最后。名字一律取 pi-ai
 * 注册表（见 pi-ai-names.js），官网链接见 routes.js 的 KNOWN_WEBSITES。每家标记 billing =
 * 有没有余额查询适配器（没有也能加，只是卡片不显示余量）。
 *
 * 契约与官方 Models 页完全一致（写进 settings 的 llm-pi-ai.providers 段）：
 *   - id：路由键，kebab-case（官方正则 ^[a-z][a-z0-9]*(-[a-z0-9]+)*$）
 *   - apiKeyEnv：官方 deriveKeyRef 惯例（路由大写、非字母数字转 _、加 _API_KEY 后缀）
 *   - api：pi-ai wire 协议；baseURL：各家默认端点
 */
import { loadModelDetails } from './model-details.js'
import { activePiAiRoot } from './bridge.js'
import { piAiName } from './pi-ai-names.js'
import { labelOf, websiteOf } from './routes.js'
import { findAdapter } from './adapters/registry.js'

/** pi-ai 目录外只保留一个任意网关入口：端点、协议、名字全由用户自定义。 */
const EXTRA_PRESETS = [
  { id: 'custom-gateway', label: 'Custom Gateway', baseURL: '', api: 'openai-completions', custom: true },
]

/** 原生适配器已覆盖的厂商：目录里同厂商的预设视为已配置（deepseek 官方 ≠ 目录的 deepseek，但同为一家）。 */
const NATIVE_EQUIVALENTS = {
  deepseek: ['deepseek-official'],
}

/** 官方 deriveKeyRef 同款：路由键 → 凭据名（KIMI_CODING_API_KEY 这种）。 */
export function keyEnvOf(routeId) {
  return String(routeId).toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY'
}

function makePreset(id, info) {
  const baseURL = typeof info.baseURL === 'string' ? info.baseURL : ''
  return {
    id,
    // 名字优先级：pi-ai 注册表原名 > 预设自带（EXTRA_PRESETS）> labelOf 按 id 拼
    label: piAiName(id) ?? info.label ?? labelOf(id),
    baseURL,
    api: info.api,
    apiKeyEnv: keyEnvOf(id),
    websiteUrl: websiteOf(id),
    models: typeof info.models === 'number' ? info.models : 0,
    billing: findAdapter(id, baseURL) !== undefined,
    custom: info.custom === true,
  }
}

/** 全量预设：pi-ai 目录（动态）+ 补充预设，按策展优先级、模型数排序。 */
export function buildPresets() {
  const byProvider = new Map()
  for (const detail of loadModelDetails(activePiAiRoot())) {
    let current = byProvider.get(detail.provider)
    if (current === undefined) {
      current = { api: detail.api, baseURL: '', models: 0 }
      byProvider.set(detail.provider, current)
    }
    current.models += 1
    if (current.baseURL === '' && typeof detail.baseUrl === 'string') current.baseURL = detail.baseUrl
  }
  const presets = []
  const seen = new Set()
  for (const [id, info] of byProvider) {
    seen.add(id)
    presets.push(makePreset(id, info))
  }
  for (const extra of EXTRA_PRESETS) {
    if (!seen.has(extra.id)) presets.push(makePreset(extra.id, extra))
  }
  // 按名字排。以前这里还压着一张 38 家的人工优先级表（CURATED），那是把"从手工列表改成
  // 动态生成"时丢掉的顺序钉回来的补丁；下拉里已经有过滤（名字 + id 模糊匹配），不需要了。
  // Custom Gateway 固定最后：它是"其它，自己填"，不是一家供应商，混在字母序中间反而碍事。
  presets.sort((a, b) => {
    if (a.custom !== b.custom) return a.custom ? 1 : -1
    return a.label.localeCompare(b.label, 'en')
  })
  return presets
}

/** 预设 + 已配置标记（供 /provider/presets 路由）。同厂商被原生适配器覆盖也算已配置。 */
export function presetsWithMeta(configuredIds) {
  const ids = configuredIds instanceof Set ? configuredIds : new Set()
  return buildPresets().map((preset) => ({
    ...preset,
    configured: ids.has(preset.id) || (NATIVE_EQUIVALENTS[preset.id] ?? []).some((route) => ids.has(route)),
  }))
}

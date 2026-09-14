/**
 * dsh-provider 宿主端。
 *
 * 两件事：
 *   1. LLM 桥接（lib/bridge.js + lib/updater.js）：把官方 llm-pi-ai 适配器跑在
 *      我们自动跟进的新版 pi-ai 上，上游出新模型不用等 dsh 发版。内置的
 *      llm-pi-ai 行由 cordis.patch.yml 禁用，本插件完全接管（settings 的
 *      llm-pi-ai 段、Web Models 设置页、模型选择器行为都不变）。
 *   2. 计费接口（lib/adapters/）：按 provider 查额度/余额，挂在
 *      GET /plan/status；适配器各自独立文件，node lib/adapters/run.js 可单独跑测。
 *
 * 之所以用自建 HTTP 路由而不是 Typert Remote：远程调用需要 typert 代码生成器，
 * 第三方插件拿不到，而自建路由和 GUI 同源，浏览器端直接 fetch 就行。
 */
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePiAiRoot, loadBridge, vendorDir } from './bridge.js'
import { loadModelDetails } from './model-details.js'
import { startBackgroundCheck, checkAndUpdate } from './updater.js'
import { resolveDshHome } from './settings-source.js'
import { labelOf, providerRoutes, websiteOf } from './routes.js'
import { findAdapter } from './adapters/registry.js'
import { findSharedCredentials } from './credential-check.js'

/** 桥接装载在模块加载期完成（loader 要同步读 Config）。失败则退化为纯计费模式。 */
const bridge = loadBridge()

export const name = 'provider'

export const inject = ['llm', 'webServer']

export const Config = bridge.ok ? bridge.plugin.Config : Schema.object({})

export function apply(ctx, config) {
  const service = (serviceName) => ctx.get?.(serviceName) ?? ctx[serviceName]
  const dshHome = resolveDshHome()
  const logger = ctx.logger?.('provider')

  if (bridge.ok) {
    // 完全接管官方 llm-pi-ai 的行为：路由注册、settings 段、模型发现全在这一个调用里
    bridge.plugin.apply(ctx, config)
    logger?.info?.(`llm bridge active on pi-ai ${bridge.piAiVersion}`)
  } else {
    logger?.warn?.(`llm bridge 不可用，退化为纯计费模式：${bridge.error}`)
  }

  async function resolveKey(apiKeyEnv) {
    if (typeof apiKeyEnv !== 'string' || apiKeyEnv === '') return { key: undefined, configured: false, reason: '未配置 apiKeyEnv' }
    const credentials = service('credentials')
    if (credentials === undefined || typeof credentials.resolve !== 'function') {
      return { key: undefined, configured: false, reason: 'credentials 服务不可用' }
    }
    try {
      const resolved = await credentials.resolve(apiKeyEnv)
      const key = typeof resolved === 'string' ? resolved : resolved?.value
      if (typeof key !== 'string' || key === '') return { key: undefined, configured: false, reason: `${apiKeyEnv} 没有值` }
      return { key, configured: true, reason: undefined }
    } catch (error) {
      return { key: undefined, configured: false, reason: `${apiKeyEnv} 解析失败：${messageOf(error)}` }
    }
  }

  /**
   * 查一个 provider 路由的额度。
   * @param route - `{ id, apiKeyEnv, baseURL, label? }`，来自 {@link providerRoutes}。
   * @param credentials - 收集 `{provider, ref, value}` 供凭据体检比对；值不外传。
   */
  async function accountOf(route, credentials) {
    const providerId = route.id
    const displayName = route.label ?? labelOf(providerId)
    // 官网/控制台链接：卡片名称下的跳转链接（适配器带了自己的就优先用适配器的）
    const websiteUrl = websiteOf(providerId)
    const baseUrl = typeof route.baseURL === 'string' && route.baseURL !== '' ? route.baseURL : undefined
    const adapter = findAdapter(providerId, baseUrl)
    const credential = await resolveKey(route.apiKeyEnv)
    // 掩码提示（前3+后4）：让界面能认出是哪一把 key（错配一眼可见），值本身不出宿主
    const keyHint = credential.configured ? maskKey(credential.key) : undefined
    const fetchedAt = new Date().toISOString()
    if (credential.configured) {
      credentials.push({ provider: providerId, ref: route.apiKeyEnv, value: credential.key })
    }

    if (adapter === undefined) {
      return {
        id: providerId, displayName, kind: 'unknown-provider', authConfigured: credential.configured, baseUrl,
        balances: [], windows: [], fetchedAt, websiteUrl, keyHint,
        note: '认不出这个 provider 的额度接口；在 lib/adapters/ 加一个适配器并在 registry.js 注册即可',
      }
    }
    if (adapter.id === 'qwen-unsupported') {
      const result = await adapter.query({ id: providerId, displayName, key: undefined, baseUrl, extras: {} })
      if (result.websiteUrl === undefined) result.websiteUrl = websiteUrl
      if (result.keyHint === undefined) result.keyHint = keyHint
      return result
    }
    if (!credential.configured) {
      return {
        id: providerId, displayName, kind: 'quota', authConfigured: false, baseUrl,
        balances: [], windows: [], error: credential.reason, fetchedAt, websiteUrl, keyHint,
      }
    }
    try {
      const result = await adapter.query({ id: providerId, displayName, key: credential.key, baseUrl, extras: {} })
      if (result.websiteUrl === undefined) result.websiteUrl = websiteUrl
      if (result.keyHint === undefined) result.keyHint = keyHint
      return result
    } catch (error) {
      return {
        id: providerId, displayName, kind: 'quota', authConfigured: true, baseUrl,
        balances: [], windows: [], error: messageOf(error), fetchedAt, websiteUrl, keyHint,
      }
    }
  }

  /** 额度接口不该被菜单开关打成串流请求，60 秒内复用同一份结果。 */
  const CACHE_MS = 60_000
  let cached

  async function snapshot(force) {
    if (!force && cached !== undefined && Date.now() - cached.at < CACHE_MS) return cached.value
    const settings = service('settings')
    const llm = service('llm')
    const routes = providerRoutes(settings, dshHome, llm)
    const providers = [...routes.values()]
    if (providers.length === 0) {
      return {
        accounts: [],
        error: '没有发现可查额度的 provider：请在 $DSH_HOME/settings.yaml 的 llm-pi-ai.providers 里配置路由',
        fetchedAt: new Date().toISOString(),
      }
    }
    const credentials = []
    const settled = await Promise.all(providers.map((route) => accountOf(route, credentials)))
    // 凭据体检：共用同一把 key 时在界面上报警（值本身绝不出这个函数）
    const warnings = findSharedCredentials(credentials)
    const accounts = settled.map((account) => {
      const warning = warnings.find((entry) => entry.provider === account.id)
      return warning === undefined ? account : { ...account, credentialWarning: warning.message }
    })
    const value = { accounts, fetchedAt: new Date().toISOString() }
    cached = { at: Date.now(), value }
    return value
  }

  const json = (res, code, payload) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/plan/status',
      handler: (req, res) => {
        void (async () => {
          try {
            const force = typeof req.url === 'string' && req.url.includes('refresh=1')
            json(res, 200, await snapshot(force))
          } catch (error) {
            logger?.warn?.(`plan status failed: ${messageOf(error)}`)
            json(res, 500, { accounts: [], error: messageOf(error) })
          }
        })()
      },
    }),
    'dsh-provider: /plan/status route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/provider/status',
      handler: (_req, res) => {
        let state = {}
        try {
          state = JSON.parse(readStateFile())
        } catch { /* 没有状态文件就给空对象 */ }
        // 诊断：这一插件实际发现了哪些路由（含凭据名，不含值），排查配置问题时最有用
        const llm = service('llm')
        let declaredCount = -1
        try {
          declaredCount = typeof llm?.listConfigurableProviders === 'function'
            ? llm.listConfigurableProviders().length
            : -1
        } catch { /* 拿不到就报 -1 */ }
        let routes = []
        try {
          routes = [...providerRoutes(service('settings'), dshHome, llm).values()]
            .map((route) => ({ id: route.id, apiKeyEnv: route.apiKeyEnv ?? null, source: route.source }))
        } catch { /* 路由发现失败时留空 */ }
        json(res, 200, {
          bridge: bridge.ok
            ? { active: true, piAiVersion: bridge.piAiVersion }
            : { active: false, error: bridge.error },
          // 目录补丁：上游 pi-ai 数据滞后时按官方文档修正的条目（重启后生效）
          catalogPatches: bridge.ok && Array.isArray(bridge.catalogPatches)
            ? bridge.catalogPatches.map((p) => ({ model: p.model, set: p.set, changed: p.changed, reason: p.reason }))
            : [],
          llmDirectorySize: declaredCount,
          routes,
          // 测试环境标识（scripts/test-profile.sh 启动时带 DSH_PROVIDER_TEST=1）：
          // 浏览器端看到后给标题/favicon 加「测」标，一眼区分测试实例
          testMode: process.env.DSH_PROVIDER_TEST === '1',
          ...state,
        })
      },
    }),
    'dsh-provider: /provider/status route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/provider/update',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        void (async () => {
          const result = await checkAndUpdate((line) => logger?.info?.(`[pi-ai updater] ${line}`))
          json(res, 200, result)
        })()
      },
    }),
    'dsh-provider: /provider/update route',
  )

  // 模型详情（悬浮卡）：pi-ai 数据文件的全量元数据，60 秒缓存
  let modelDetailsCache
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/provider/models',
      handler: (_req, res) => {
        if (modelDetailsCache === undefined || Date.now() - modelDetailsCache.at > 60_000) {
          modelDetailsCache = { at: Date.now(), value: loadModelDetails(activePiAiRoot()) }
        }
        json(res, 200, { models: modelDetailsCache.value, fetchedAt: new Date().toISOString() })
      },
    }),
    'dsh-provider: /provider/models route',
  )

  // 刷新单个 provider 的余量：实查并顺手更新全局缓存里的这一条（徽标等其他读者也能看到新值）
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/provider/refresh',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => {
          body += String(chunk)
        })
        req.on('end', () => {
          void (async () => {
            try {
              const parsed = JSON.parse(body === '' ? '{}' : body)
              const providerId = parsed?.providerId
              const routes = providerRoutes(service('settings'), dshHome, service('llm'))
              const route = typeof providerId === 'string' ? routes.get(providerId) : undefined
              if (route === undefined) {
                json(res, 404, { ok: false, error: `没有发现这个 provider：${String(providerId)}` })
                return
              }
              const account = await accountOf(route, [])
              if (cached !== undefined && cached.value !== undefined && Array.isArray(cached.value.accounts)) {
                cached = {
                  at: cached.at,
                  value: {
                    ...cached.value,
                    accounts: cached.value.accounts.map((entry) => (entry.id === account.id ? account : entry)),
                  },
                }
              }
              json(res, 200, { ok: account.error === undefined && account.authConfigured !== false, account })
            } catch (error) {
              json(res, 500, { ok: false, error: messageOf(error) })
            }
          })()
        })
      },
    }),
    'dsh-provider: /provider/refresh route',
  )

  // 检测 provider：用存的 key 实查一次余量（复用计费适配器，key 不出宿主）
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/provider/test',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => {
          body += String(chunk)
        })
        req.on('end', () => {
          void (async () => {
            try {
              const parsed = JSON.parse(body === '' ? '{}' : body)
              const providerId = parsed?.providerId
              const routes = providerRoutes(service('settings'), dshHome, service('llm'))
              const route = typeof providerId === 'string' ? routes.get(providerId) : undefined
              if (route === undefined) {
                json(res, 404, { ok: false, error: `没有发现这个 provider：${String(providerId)}` })
                return
              }
              const account = await accountOf(route, [])
              const ok = account.error === undefined && account.authConfigured !== false
              json(res, 200, { ok, account })
            } catch (error) {
              json(res, 500, { ok: false, error: messageOf(error) })
            }
          })()
        })
      },
    }),
    'dsh-provider: /provider/test route',
  )

  // 后台顺带查一次上游（6 小时节流），有新版就下好等重启
  startBackgroundCheck(logger)

  logger?.info?.('dsh-provider active: GET /plan/status, GET /provider/status, POST /provider/update')
}

function readStateFile() {
  try {
    return readFileSync(join(vendorDir, 'updater-state.json'), 'utf8')
  } catch {
    return '{}'
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** key 的掩码提示：前 3 + **** + 后 4，够认出是哪一把，又不把值交出去。 */
function maskKey(key) {
  if (typeof key !== 'string' || key === '') return undefined
  if (key.length <= 7) return '****'
  return key.slice(0, 3) + '****' + key.slice(-4)
}

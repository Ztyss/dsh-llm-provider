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
import { piAiName } from './pi-ai-names.js'
import { loadModelDetails } from './model-details.js'
import { startBackgroundCheck, checkAndUpdate } from './updater.js'
import { resolveDshHome } from './settings-source.js'
import { labelOf, providerRoutes, websiteOf } from './routes.js'
import { presetsWithMeta } from './provider-presets.js'
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

  /**
   * DeepSeek 走 pi-ai：原生适配器被 cordis.patch.yml 禁用后，若 pi-ai 的 deepseek
   * 路由还没配置，自动补一条（复用已有的 DEEPSEEK_API_KEY 凭据），保证 DeepSeek 不断供。
   * 幂等：原生还在或已配置时直接返回。apply 时跑一次，snapshot 前再跑一次（防插件顺序）。
   */
  async function ensureDeepseekRoute() {
    if (!bridge.ok) return
    try {
      const llm = service('llm')
      const declared = typeof llm?.listConfigurableProviders === 'function' ? llm.listConfigurableProviders() : []
      if (declared.some((entry) => entry?.provider === 'deepseek-official')) return
      const settings = service('settings')
      const section = settings?.get?.('llm-pi-ai')
      if (typeof settings?.mutate !== 'function') return
      // 名字完全遵循 pi-ai 注册表：deepseek 在 pi-ai 里就叫 "DeepSeek"。
      // 存量若还是早期迁移写入的旧名（如「DeepSeek（API 按量）」），只改 displayName 不动其它字段。
      const current = section?.providers?.deepseek
      if (current !== undefined) {
        if (current.displayName === 'DeepSeek') return
        await settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'deepseek', 'displayName'], value: 'DeepSeek' }])
        logger?.info?.('DeepSeek 显示名已对齐 pi-ai（DeepSeek）')
        return
      }
      await settings.mutate('llm-pi-ai', [{
        op: 'set',
        path: ['providers', 'deepseek'],
        value: {
          displayName: 'DeepSeek',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          api: 'openai-completions',
          baseURL: 'https://api.deepseek.com',
        },
      }])
      logger?.info?.('DeepSeek 已切到 pi-ai 路由（复用 DEEPSEEK_API_KEY）')
    } catch (error) {
      logger?.warn?.(`DeepSeek 路由迁移失败：${messageOf(error)}`)
    }
  }
  void ensureDeepseekRoute()

  /**
   * 显示名对齐 pi-ai：宿主对没有 displayName 的路由直接显示路由 id（kimi-coding），
   * 我们把 pi-ai 注册表里的正式名（Kimi For Coding）补进 settings。
   * 只补缺失的，不覆盖用户自己写的 displayName。
   */
  async function syncRouteDisplayNames() {
    // 整个函数包在 try 里：apply 期 cordis 服务可能还没就绪（ensureDeepseekRoute 同款），
    // 拿不到 settings 就下轮再说，绝不能 fatal。
    try {
      const settings = service('settings')
      const providers = settings?.get?.('llm-pi-ai')?.providers
      if (providers === null || typeof providers !== 'object' || typeof settings?.mutate !== 'function') return
      const ops = []
      for (const [id, route] of Object.entries(providers)) {
        if (route === null || typeof route !== 'object') continue
        if (typeof route.displayName === 'string' && route.displayName !== '') continue
        const piName = piAiName(id)
        if (piName === undefined) continue
        ops.push({ op: 'set', path: ['providers', id, 'displayName'], value: piName })
      }
      if (ops.length === 0) return
      await settings.mutate('llm-pi-ai', ops)
      logger?.info?.(`已按 pi-ai 注册表补齐 ${ops.length} 个 provider 显示名`)
    } catch (error) {
      logger?.warn?.(`显示名对齐失败：${messageOf(error)}`)
    }
  }
  void syncRouteDisplayNames()

  async function resolveKey(apiKeyEnv) {    if (typeof apiKeyEnv !== 'string' || apiKeyEnv === '') return { key: undefined, configured: false, reason: '未配置 apiKeyEnv' }
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
   * @param route - `{ id, apiKeyEnv, baseURL, api?, label? }`，来自 {@link providerRoutes}。
   * @param credentials - 收集 `{provider, ref, value}` 供凭据体检比对；值不外传。
   */
  async function accountOf(route, credentials) {
    const providerId = route.id
    const displayName = route.label ?? labelOf(providerId)
    // 官网/控制台链接：卡片名称下的跳转链接（适配器带了自己的就优先用适配器的）
    const websiteUrl = websiteOf(providerId)
    const baseUrl = typeof route.baseURL === 'string' && route.baseURL !== '' ? route.baseURL : undefined
    // 路由自身的配置项：卡片展开体和「添加供应商」表单展示同一组信息（缺的字段 JSON 序列化时自然消失）
    const routeMeta = { api: route.api, apiKeyEnv: route.apiKeyEnv }
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
        ...routeMeta,
        id: providerId, displayName, kind: 'unknown-provider', authConfigured: credential.configured, baseUrl,
        balances: [], windows: [], fetchedAt, websiteUrl, keyHint, deletable: route.source === 'llm-pi-ai',
        note: '认不出这个 provider 的额度接口；在 lib/adapters/ 加一个适配器并在 registry.js 注册即可',
      }
    }
    if (adapter.id === 'qwen-unsupported') {
      const result = await adapter.query({ id: providerId, displayName, key: undefined, baseUrl, extras: {} })
      if (result.websiteUrl === undefined) result.websiteUrl = websiteUrl
      if (result.keyHint === undefined) result.keyHint = keyHint
      if (result.deletable === undefined) result.deletable = route.source === 'llm-pi-ai'
      result.membership = undefined // 等级不展示（2026-09-14 决定），适配器原始数据保留在适配器内
      return { ...routeMeta, ...result }
    }
    if (!credential.configured) {
      return {
        ...routeMeta,
        id: providerId, displayName, kind: 'quota', authConfigured: false, baseUrl,
        balances: [], windows: [], error: credential.reason, fetchedAt, websiteUrl, keyHint,
        deletable: route.source === 'llm-pi-ai',
      }
    }
    try {
      const result = await adapter.query({ id: providerId, displayName, key: credential.key, baseUrl, extras: {} })
      if (result.websiteUrl === undefined) result.websiteUrl = websiteUrl
      if (result.keyHint === undefined) result.keyHint = keyHint
      if (result.deletable === undefined) result.deletable = route.source === 'llm-pi-ai'
      result.membership = undefined // 等级不展示（2026-09-14 决定），适配器原始数据保留在适配器内
      return { ...routeMeta, ...result }
    } catch (error) {
      return {
        ...routeMeta,
        id: providerId, displayName, kind: 'quota', authConfigured: true, baseUrl,
        balances: [], windows: [], error: messageOf(error), fetchedAt, websiteUrl, keyHint,
        deletable: route.source === 'llm-pi-ai',
      }
    }
  }

  /** 额度接口不该被菜单开关打成串流请求，60 秒内复用同一份结果。 */
  const CACHE_MS = 60_000
  let cached

  async function snapshot(force) {
    if (!force && cached !== undefined && Date.now() - cached.at < CACHE_MS) return cached.value
    await ensureDeepseekRoute()
    await syncRouteDisplayNames()
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

  // 可添加的供应商预设（Provider 标签页「+ 添加」的候选清单，含已配置标记）
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/provider/presets',
      handler: (_req, res) => {
        let configured = new Set()
        try {
          configured = new Set(providerRoutes(service('settings'), dshHome, service('llm')).keys())
        } catch { /* 路由发现失败就当全部未配置 */ }
        json(res, 200, { presets: presetsWithMeta(configured) })
      },
    }),
    'dsh-provider: /provider/presets route',
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

  // 删除 provider：unset llm-pi-ai.providers.<id> + 清掉对应凭据；内置原生路由拒绝
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/provider/remove',
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
              if (route.source !== 'llm-pi-ai') {
                json(res, 400, { ok: false, error: '内置原生路由不支持在这里删除' })
                return
              }
              const settings = service('settings')
              if (typeof settings?.mutate !== 'function') {
                json(res, 500, { ok: false, error: 'settings 服务不可用' })
                return
              }
              await settings.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', route.id] }])
              let keyCleared = true
              try {
                const credentials = service('credentials')
                if (typeof route.apiKeyEnv === 'string' && route.apiKeyEnv !== '' && typeof credentials?.unset === 'function') {
                  await credentials.unset(route.apiKeyEnv)
                }
              } catch (error) {
                keyCleared = false
                logger?.warn?.(`删除 ${route.id} 后清理凭据 ${route.apiKeyEnv} 失败：${messageOf(error)}`)
              }
              // 全局快照里同步移除这一条
              if (cached !== undefined && cached.value !== undefined && Array.isArray(cached.value.accounts)) {
                cached = {
                  at: cached.at,
                  value: { ...cached.value, accounts: cached.value.accounts.filter((entry) => entry.id !== route.id) },
                }
              }
              json(res, 200, { ok: true, keyCleared })
            } catch (error) {
              json(res, 500, { ok: false, error: messageOf(error) })
            }
          })()
        })
      },
    }),
    'dsh-provider: /provider/remove route',
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

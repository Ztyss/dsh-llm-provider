/**
 * dsh-llm-provider 宿主端。
 *
 * 两件事：
 *   1. LLM 桥接（src/bridge.ts + src/updater.ts）：把官方 llm-pi-ai 适配器跑在
 *      我们自动跟进的新版 pi-ai 上，上游出新模型不用等 dsh 发版。内置的
 *      llm-pi-ai 行由 cordis.patch.yml 禁用，本插件完全接管（settings 的
 *      llm-pi-ai 段、Web Models 设置页、模型选择器行为都不变）。
 *   2. 计费接口（src/adapters/）：按 provider 查额度/余额，挂在
 *      GET /plan/status；适配器各自独立文件，node lib/adapters/run.js 可单独跑测。
 *
 * 之所以用自建 HTTP 路由而不是官方的 Typert Remote：那套生成器是给 dsh 单体仓库写的
 * （只认 <root>/packages/ 下的包、装饰器来源必须在已注册包里），单包插件走不通。
 * 自建路由和 GUI 同源，浏览器端直接 fetch。
 *
 * **边界：插件启动不碰宿主的东西。** 对 dsh 安装目录、settings.yaml、credentials 一律
 * 只读；写只发生在两处——插件自己的 vendor/ 目录（下载 pi-ai、拷桥接副本），以及用户
 * 在界面上显式操作时（添加/删除 provider）。
 */
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePiAiRoot, loadBridge, vendorDir } from './bridge.js'
import { loadModelDetails, type ModelDetail } from './model-details.js'
import { checkAndUpdate, startBackgroundCheck } from './updater.js'
import { labelOf, providerRoutes, websiteOf, type ProviderRoute } from './routes.js'
import { presetsWithMeta } from './provider-presets.js'
import { findAdapter } from './adapters/registry.js'
import { findSharedCredentials } from './credential-check.js'
import type { AccountStatus } from './adapters/shared.js'
import {
  asRecord,
  readString,
  type AnyRecord,
  type CredentialsService,
  type LlmService,
  type Logger,
  type PluginContext,
  type ServerRequest,
  type ServerResponse,
  type SettingsService,
  type WebServerService,
} from './types.js'

/** 桥接装载在模块加载期完成（loader 要同步读 Config）。失败则退化为纯计费模式。 */
const bridge = loadBridge()

export const name = 'provider'

export const inject = ['llm', 'webServer']

/** 给浏览器渲染的一条账户（额度快照 + 路由元信息）。 */
export interface AccountRow extends AccountStatus {
  api?: string | undefined
  apiKeyEnv?: string | undefined
  credentialWarning?: string
}

/** 额度快照（/plan/status 的响应体）。 */
export interface PlanSnapshot {
  accounts: AccountRow[]
  fetchedAt: string
  error?: string
}

export const Config = bridge.ok ? bridge.plugin.Config : Schema.object({})

export function apply(ctx: PluginContext, config: unknown): void {
  /** 拿宿主服务：ctx.get(name) 与 ctx.name 两种写法都支持，这里统一。 */
  const service = <T>(serviceName: string): T | undefined =>
    (ctx.get?.(serviceName) ?? ctx[serviceName]) as T | undefined

  const logger: Logger | undefined = typeof ctx.logger === 'function' ? ctx.logger('provider') : undefined
  const webServer = ctx['webServer'] as WebServerService

  if (bridge.ok) {
    // 完全接管官方 llm-pi-ai 的行为：路由注册、settings 段、模型发现全在这一个调用里
    bridge.plugin.apply(ctx, config)
    logger?.info?.(`llm bridge active on pi-ai ${bridge.piAiVersion}`)
  } else {
    logger?.warn?.(`llm bridge 不可用，退化为纯计费模式：${bridge.error}`)
  }

  interface ResolveKeyResult {
    key: string | undefined
    configured: boolean
    reason: string | undefined
  }

  async function resolveKey(apiKeyEnv: string | undefined): Promise<ResolveKeyResult> {
    if (typeof apiKeyEnv !== 'string' || apiKeyEnv === '') return { key: undefined, configured: false, reason: '未配置 apiKeyEnv' }
    const credentials = service<CredentialsService>('credentials')
    if (credentials === undefined || typeof credentials.resolve !== 'function') {
      return { key: undefined, configured: false, reason: 'credentials 服务不可用' }
    }
    try {
      const resolved = await credentials.resolve(apiKeyEnv)
      const key = typeof resolved === 'string' ? resolved : readString(asRecord(resolved)['value'])
      if (key === undefined) return { key: undefined, configured: false, reason: `${apiKeyEnv} 没有值` }
      return { key, configured: true, reason: undefined }
    } catch (error) {
      return { key: undefined, configured: false, reason: `${apiKeyEnv} 解析失败：${messageOf(error)}` }
    }
  }

  /**
   * 查一个 provider 路由的额度。
   * @param route - 来自 {@link providerRoutes}。
   * @param credentials - 收集 `{provider, ref, value}` 供凭据体检比对；值不外传。
   */
  async function accountOf(route: ProviderRoute, credentials: { provider: string; ref: string | undefined; value: string }[]): Promise<AccountRow> {
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
    if (credential.configured && credential.key !== undefined) {
      credentials.push({ provider: providerId, ref: route.apiKeyEnv, value: credential.key })
    }

    if (adapter === undefined) {
      return {
        ...routeMeta,
        id: providerId, displayName, kind: 'unknown-provider', authConfigured: credential.configured, baseUrl,
        balances: [], windows: [], fetchedAt, websiteUrl, keyHint, deletable: route.source === 'llm-pi-ai',
        note: '认不出这个 provider 的额度接口；在 src/adapters/ 加一个适配器并在 registry.ts 注册即可',
      }
    }
    if (adapter.id === 'qwen-unsupported') {
      const result = await adapter.query({ id: providerId, displayName, key: undefined, baseUrl, extras: {} })
      if (result.websiteUrl === undefined) result.websiteUrl = websiteUrl
      if (result.keyHint === undefined) result.keyHint = keyHint
      if (result.deletable === undefined) result.deletable = route.source === 'llm-pi-ai'
      result.membership = undefined // 等级不展示，适配器原始数据保留在适配器内
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
      result.membership = undefined // 等级不展示，适配器原始数据保留在适配器内
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
  let cached: { at: number; value: PlanSnapshot } | undefined

  async function snapshot(force: boolean): Promise<PlanSnapshot> {
    if (!force && cached !== undefined && Date.now() - cached.at < CACHE_MS) return cached.value
    const settings = service<SettingsService>('settings')
    const llm = service<LlmService>('llm')
    const routes = providerRoutes(settings, llm)
    const providers = [...routes.values()]
    if (providers.length === 0) {
      return {
        accounts: [],
        error: '没有发现可查额度的 provider：请在 $DSH_HOME/settings.yaml 的 llm-pi-ai.providers 里配置路由',
        fetchedAt: new Date().toISOString(),
      }
    }
    const credentials: { provider: string; ref: string | undefined; value: string }[] = []
    const settled = await Promise.all(providers.map((route) => accountOf(route, credentials)))
    // 凭据体检：共用同一把 key 时在界面上报警（值本身绝不出这个函数）
    const warnings = findSharedCredentials(credentials)
    const accounts = settled.map((account) => {
      const warning = warnings.find((entry) => entry.provider === account.id)
      return warning === undefined ? account : { ...account, credentialWarning: warning.message }
    })
    const value: PlanSnapshot = { accounts, fetchedAt: new Date().toISOString() }
    cached = { at: Date.now(), value }
    return value
  }

  const json = (res: ServerResponse, code: number, payload: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  type WriteHandler = (route: ProviderRoute, parsed: AnyRecord, res: ServerResponse) => Promise<void>

  /**
   * 自建写路由的公共骨架：只收 POST、读 JSON body、按 providerId 找路由（找不到回 404），
   * handler 里抛出的错误统一回 500。refresh / remove / test 三个路由共用这一份。
   */
  function writeRoute(handle: WriteHandler): (req: ServerRequest, res: ServerResponse) => void {
    return (req, res) => {
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
            const parsed = asRecord(JSON.parse(body === '' ? '{}' : body))
            const providerId = parsed['providerId']
            const routes = providerRoutes(service<SettingsService>('settings'), service<LlmService>('llm'))
            const route = typeof providerId === 'string' ? routes.get(providerId) : undefined
            if (route === undefined) {
              json(res, 404, { ok: false, error: `没有发现这个 provider：${String(providerId)}` })
              return
            }
            await handle(route, parsed, res)
          } catch (error) {
            json(res, 500, { ok: false, error: messageOf(error) })
          }
        })()
      })
    }
  }

  ctx.effect(
    () => webServer.register({
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
    'dsh-llm-provider: /plan/status route',
  )

  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/status',
      handler: (_req, res) => {
        const { status: bridgeState, updater } = readVendorState()
        // 诊断：这一插件实际发现了哪些路由（含凭据名，不含值），排查配置问题时最有用
        const llm = service<LlmService>('llm')
        let declaredCount = -1
        try {
          declaredCount = typeof llm?.listConfigurableProviders === 'function'
            ? llm.listConfigurableProviders().length
            : -1
        } catch { /* 拿不到就报 -1 */ }
        let routes: { id: string; apiKeyEnv: string | null; source: string }[] = []
        try {
          routes = [...providerRoutes(service<SettingsService>('settings'), llm).values()]
            .map((route) => ({ id: route.id, apiKeyEnv: route.apiKeyEnv ?? null, source: route.source }))
        } catch { /* 路由发现失败时留空 */ }
        json(res, 200, {
          bridge: bridge.ok
            ? {
                active: true,
                piAiVersion: bridge.piAiVersion,
                // 用的是哪一档：热更新下来的版本号 / 'dependency'（内置依赖）/ 'dsh'（dsh 自带）
                source: bridge.piAiSource,
                // 体检没过、被跳过的候选——有回退就列在这里
                rejected: bridge.rejected,
                // 需求没解析出来、体检没跑：选中项没被验证过，界面上要标出来
                probeUnverified: bridge.probeUnverified,
              }
            : { active: false, error: bridge.error },
          llmDirectorySize: declaredCount,
          routes,
          // 只读体检：DeepSeek 走 pi-ai 必须在 settings 的 llm-pi-ai.providers 里有一条
          // deepseek 路由（原生 llm-deepseek 被 cordis.patch.yml 禁用了，全靠这条）。
          // 插件不写宿主配置：缺了就报出来，由用户用「添加 Provider」补。不能静默——
          // 缺了 DeepSeek 会从模型列表里消失，看不出原因。
          deepseekRouteMissing: bridge.ok && !routes.some((route) => route.id === 'deepseek'),
          // 更新状态（界面「pi-ai 桥接」标签页用）：
          //   latest   —— 上次检查时上游的最新版
          //   pending  —— 已下载、等重启生效的版本
          //   rejected —— 下载了但兼容性体检没通过的那版（含原因），永远不会切过去
          update: {
            lastCheck: readString(updater['lastCheck']),
            latest: readString(bridgeState['latestVersion']),
            pending: bridgeState['needsRestart'] === true ? readString(bridgeState['piAiVersion']) : undefined,
            rejected: readRejected(bridgeState['latestRejected']),
          },
          // 测试环境标识（scripts/test-profile.sh 启动时带 DSH_PROVIDER_TEST=1）：
          // 浏览器端看到后给标题/favicon 加「测」标，一眼区分测试实例
          testMode: process.env.DSH_PROVIDER_TEST === '1',
        })
      },
    }),
    'dsh-llm-provider: /provider/status route',
  )

  ctx.effect(
    () => webServer.register({
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
    'dsh-llm-provider: /provider/update route',
  )

  // 模型详情（悬浮卡）：pi-ai 数据文件的全量元数据，60 秒缓存
  let modelDetailsCache: { at: number; value: ModelDetail[] } | undefined
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/models',
      handler: (_req, res) => {
        if (modelDetailsCache === undefined || Date.now() - modelDetailsCache.at > 60_000) {
          modelDetailsCache = { at: Date.now(), value: loadModelDetails(activePiAiRoot()) }
        }
        json(res, 200, { models: modelDetailsCache.value, fetchedAt: new Date().toISOString() })
      },
    }),
    'dsh-llm-provider: /provider/models route',
  )

  // 可添加的供应商预设（Provider 标签页「+ 添加」的候选清单，含已配置标记）
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/presets',
      handler: (_req, res) => {
        void (async () => {
          const configured = new Set<string>()
          const keyless = new Set<string>()
          try {
            const routes = providerRoutes(service<SettingsService>('settings'), service<LlmService>('llm'))
            for (const route of routes.values()) {
              configured.add(route.id)
              // 路由在、钥匙没值：插件自己的 config 就声明了 deepseek（没有 key 也能配上路由），
              // 这种"配了一半"的状态若照旧标成"已配置"，用户就既选不了它也补不了 key。
              const credential = await resolveKey(route.apiKeyEnv)
              if (!credential.configured) keyless.add(route.id)
            }
          } catch { /* 路由发现失败就当全部未配置 */ }
          json(res, 200, { presets: presetsWithMeta(configured, keyless) })
        })()
      },
    }),
    'dsh-llm-provider: /provider/presets route',
  )

  // 刷新单个 provider 的余量：实查并顺手更新全局缓存里的这一条（徽标等其他读者也能看到新值）
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/refresh',
      handler: writeRoute(async (route, _parsed, res) => {
        const account = await accountOf(route, [])
        if (cached !== undefined) {
          cached = {
            at: cached.at,
            value: {
              ...cached.value,
              accounts: cached.value.accounts.map((entry) => (entry.id === account.id ? account : entry)),
            },
          }
        }
        json(res, 200, { ok: account.error === undefined && account.authConfigured !== false, account })
      }),
    }),
    'dsh-llm-provider: /provider/refresh route',
  )

  // 删除 provider：unset llm-pi-ai.providers.<id> + 清掉对应凭据；内置原生路由拒绝
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/remove',
      handler: writeRoute(async (route, _parsed, res) => {
        if (route.source !== 'llm-pi-ai') {
          json(res, 400, { ok: false, error: '内置原生路由不支持在这里删除' })
          return
        }
        const settings = service<SettingsService>('settings')
        if (typeof settings?.mutate !== 'function') throw new Error('settings 服务不可用')
        await settings.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', route.id] }])
        let keyCleared = true
        try {
          const credentials = service<CredentialsService>('credentials')
          if (typeof route.apiKeyEnv === 'string' && route.apiKeyEnv !== '' && typeof credentials?.unset === 'function') {
            await credentials.unset(route.apiKeyEnv)
          }
        } catch (error) {
          keyCleared = false
          logger?.warn?.(`删除 ${route.id} 后清理凭据 ${String(route.apiKeyEnv)} 失败：${messageOf(error)}`)
        }
        // 全局快照里同步移除这一条
        if (cached !== undefined) {
          cached = {
            at: cached.at,
            value: { ...cached.value, accounts: cached.value.accounts.filter((entry) => entry.id !== route.id) },
          }
        }
        json(res, 200, { ok: true, keyCleared })
      }),
    }),
    'dsh-llm-provider: /provider/remove route',
  )

  // 检测 provider：用存的 key 实查一次余量（复用计费适配器，key 不出宿主）
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/test',
      handler: writeRoute(async (route, _parsed, res) => {
        const account = await accountOf(route, [])
        const ok = account.error === undefined && account.authConfigured !== false
        json(res, 200, { ok, account })
      }),
    }),
    'dsh-llm-provider: /provider/test route',
  )

  // 启动时后台顺带查一次上游（6 小时节流，DSH_PROVIDER_UPDATE=off 可关）：有更新就下好、
  // 验证通过后标待重启，下次启动生效——新装的机器不用手点「检查更新」。手动入口仍在
  // （设置页按钮 → POST /provider/update），替换一律要求验证通过，见 updater.ts 头部注释。
  startBackgroundCheck(logger, bridge.ok ? bridge.piAiVersion : undefined)

  logger?.info?.('dsh-llm-provider active: GET /plan/status, GET /provider/status, POST /provider/update')
}

/** 读一版被跳过的记录（status.json 里的 latestRejected）。 */
function readRejected(value: unknown): { version: string | undefined; error: string | undefined } | undefined {
  const record = asRecord(value)
  if (Object.keys(record).length === 0) return undefined
  return { version: readString(record['version']), error: readString(record['error']) }
}

/**
 * 读插件在 vendor/ 下的两个状态文件：
 *   status.json        —— 谁装到哪一版、体检结论（bridge.ts 与 updater.ts 写）
 *   updater-state.json —— 上次检查上游的时间（updater.ts 写）
 * 界面要的字段分在两个文件里（needsRestart / latestVersion 在 status.json，
 * lastCheck 在 updater-state.json），所以两个都要读。
 */
function readVendorState(): { status: AnyRecord; updater: AnyRecord } {
  const read = (name: string): AnyRecord => {
    try {
      return asRecord(JSON.parse(readFileSync(join(vendorDir, name), 'utf8')))
    } catch {
      return {}
    }
  }
  return { status: read('status.json'), updater: read('updater-state.json') }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** key 的掩码提示：前 3 + **** + 后 4，够认出是哪一把，又不把值交出去。 */
function maskKey(key: string | undefined): string | undefined {
  if (typeof key !== 'string' || key === '') return undefined
  if (key.length <= 7) return '****'
  return key.slice(0, 3) + '****' + key.slice(-4)
}

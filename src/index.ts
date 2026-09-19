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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePiAiRoot, loadBridge, vendorDir } from './bridge.js'
import { loadModelDetails, withAdapterModels, withDeclaredModels, type AdapterModelInfo, type ModelDetail } from './model-details.js'
import { UPDATES_ENABLED, checkAndUpdate, startBackgroundCheck } from './updater.js'
import { labelOf, providerRoutes, websiteOf, type ProviderRoute } from './routes.js'
import { presetsWithMeta } from './provider-presets.js'
import { findAdapter } from './adapters/registry.js'
import { findSharedCredentials } from './credential-check.js'
import type { AccountStatus } from './adapters/shared.js'
import {
  asRecord,
  readNumber,
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
  /**
   * 这条路由在 settings 里显式声明的模型清单（原样下发；undefined = 没配，服务目录全量）。
   * 「模型服务」页的逐模型编辑器拿它回填，也是 issue #1 的数据来源。
   */
  models?: unknown[] | undefined
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
    if (bridge.repairedFiles > 0) {
      // 插件自管的那份 pi-ai（vendor/）残缺时用安全副本补回。dsh 自带那份不备份、不修复
      //（用户 09-19 决定）：它是 dsh 的东西，r6 之后本插件也不可能再动它。
      logger?.warn?.(`检测到插件管理的 pi-ai 缺文件，已用本地安全副本补回 ${bridge.repairedFiles} 个文件`)
    }
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
    const routeMeta = { api: route.api, apiKeyEnv: route.apiKeyEnv, models: route.models }
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
          // 本地版：pi-ai 自动下载是 opt-in（DSH_PROVIDER_UPDATE=on）——默认 false，
          // 界面据此把「检查更新」按钮置灰并说明 vendor/ 不会落地第二份 pi-ai（issue #4）。
          updatesEnabled: UPDATES_ENABLED,
          localBuild: true,
          // 诊断用：vendor/pi-ai 下到底有几份下载来的 pi-ai（本地版应当恒为 0）
          vendorPiAiVersions: installedPiAiVersions(),
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
          if (!UPDATES_ENABLED) {
            // 本地版：连 registry 都不问，直接回报「已停用」（不是失败，界面照实说明）
            json(res, 200, {
              ok: true,
              disabled: true,
              applied: false,
              error: '本地版已停用 pi-ai 自动下载：vendor/ 不会落地任何 pi-ai 副本（issue #4）。要跟上游就用 DSH_PROVIDER_UPDATE=on 启动 dsh',
              checkedAt: new Date().toISOString(),
            })
            return
          }
          const result = await checkAndUpdate((line) => logger?.info?.(`[pi-ai updater] ${line}`))
          json(res, 200, result)
        })()
      },
    }),
    'dsh-llm-provider: /provider/update route',
  )

  // 模型详情（悬浮卡）：pi-ai 目录数据 + 路由声明 + 适配器自报，60 秒缓存
  let modelDetailsCache: { at: number; value: ModelDetail[] } | undefined
  const modelDetails = (): ModelDetail[] => {
    if (modelDetailsCache === undefined || Date.now() - modelDetailsCache.at > 60_000) {
      const routes = [...providerRoutes(service<SettingsService>('settings'), service<LlmService>('llm')).values()]
      // 本地版 issue #5：能力的来源顺序是「pi-ai 目录 → 路由声明 → 适配器自报」。目录没收录的
      // 自定义模型（别名 id、自建端点）靠声明，合成 provider（modlens 的 `modlens-<上游>`）
      // 三处都没有——只有适配器自己知道它给模型补了 image，所以还要问一次 llm 服务。
      modelDetailsCache = { at: Date.now(), value: withDeclaredModels(loadModelDetails(activePiAiRoot()), routes) }
    }
    return modelDetailsCache.value
  }
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/models',
      handler: (_req, res) => {
        void (async () => {
          let models = modelDetails()
          try {
            const infos = await adapterModelInfos(logger)
            if (infos.length > 0) models = withAdapterModels(models, infos)
          } catch (error) {
            logger?.warn?.(`适配器能力探测失败（徽标会缺）：${messageOf(error)}`)
          }
          json(res, 200, { models, fetchedAt: new Date().toISOString() })
        })()
      },
    }),
    'dsh-llm-provider: /provider/models route',
  )

  /**
   * 问一遍适配器：目录里那些**三处元数据都没有**的 provider（合成 provider 为主）自己怎么报能力。
   *
   * 只查 pi-ai 目录数据里没有的 provider——有目录的（deepseek/opencode-go/zai…）跳过，
   * 免得每次请求都把几十个 provider 全问一遍。每个调用都带超时，且总预算 12 秒：
   * 适配器的 listModels 可能拉远端，不能让它拖垮这条只服务界面的路由。
   */
  async function adapterModelInfos(logger: Logger | undefined): Promise<AdapterModelInfo[]> {
    const llm = service<LlmService>('llm')
    if (llm === undefined || typeof llm.listProviders !== 'function' || typeof llm.listModels !== 'function') return []
    const known = new Set(modelDetails().map((detail) => detail.provider))
    let providers: unknown[] = []
    try {
      const listed = llm.listProviders()
      providers = Array.isArray(listed) ? listed : []
    } catch {
      return []
    }
    const deadline = Date.now() + 12_000
    const infos: AdapterModelInfo[] = []
    for (const raw of providers) {
      if (Date.now() > deadline) break
      const providerId = readString(asRecord(raw)['id'])
      if (providerId === undefined || providerId === '' || known.has(providerId)) continue
      let models: unknown[] = []
      try {
        const listed = await promiseWithTimeout<unknown>(llm.listModels(providerId), 4_000)
        models = Array.isArray(listed) ? listed : []
      } catch (error) {
        logger?.info?.(`能力探测：${providerId} 的 listModels 没问出来（${messageOf(error)}）`)
        continue
      }
      for (const rawModel of Array.isArray(models) ? models : []) {
        if (Date.now() > deadline) break
        const modelId = readString(asRecord(rawModel)['id'])
        if (modelId === undefined || modelId === '') continue
        let info: AnyRecord = {}
        try {
          info = asRecord(await promiseWithTimeout(typeof llm.resolveModelInfo === 'function'
            ? llm.resolveModelInfo(providerId, modelId)
            : Promise.resolve({}), 3_000))
        } catch {
          info = {}
        }
        const modalities = Array.isArray(info['inputModalities'])
          ? info['inputModalities'].filter((value): value is string => typeof value === 'string')
          : []
        const reasoning = asRecord(info['reasoning'])
        const efforts = Array.isArray(reasoning['efforts']) ? reasoning['efforts'] : []
        infos.push({
          provider: providerId,
          id: modelId,
          name: readString(info['name']) ?? readString(asRecord(rawModel)['name']),
          inputModalities: modalities,
          contextWindow: readNumber(asRecord(info['context'])['contextWindow']),
          maxTokens: readNumber(info['defaultMaxTokens']),
          reasoning: info['reasoning'] !== undefined,
          thinkingLevels: efforts
            .map((effort) => readString(asRecord(effort)['id']))
            .filter((value): value is string => value !== undefined),
        })
      }
    }
    return infos
  }

  /**
   * 逐模型清单写入（本地版新增，实现 issue #1：在「模型服务」页直接配置模型）。
   *
   * 语义跟官方 Models 页一致——写 settings 的 `llm-pi-ai.providers.<id>.models`：
   *   - 数组：这条路由只服务列出来的模型（官方 adapter 的 resolveRouteModels 用它替换整个目录）；
   *   - null：删掉这个键，回到「跟着 pi-ai 目录走全量」。
   * 只做形状校验（id 非空且不重复、数值/模态合法），语义合法性交给官方 adapter 的 strict 校验——
   * 它拒绝时 mutate 会抛，这里原样把消息回报给界面。
   */
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/set-models',
      handler: writeRoute(async (route, parsed, res) => {
        if (route.source !== 'llm-pi-ai') {
          json(res, 400, { ok: false, error: '内置原生路由的模型清单不在这里改' })
          return
        }
        const settings = service<SettingsService>('settings')
        if (typeof settings?.mutate !== 'function') throw new Error('settings 服务不可用')
        const raw = parsed['models']
        if (raw === null || raw === undefined) {
          await settings.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', route.id, 'models'] }])
          cached = undefined
          modelDetailsCache = undefined
          json(res, 200, { ok: true, mode: 'catalog', models: null })
          return
        }
        const models = sanitizeDeclaredModels(raw)
        await settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', route.id, 'models'], value: models }])
        cached = undefined
        modelDetailsCache = undefined
        logger?.info?.(`provider ${route.id} 的模型清单已更新：${models.length} 个`)
        json(res, 200, { ok: true, mode: 'declared', models })
      }),
    }),
    'dsh-llm-provider: /provider/set-models route',
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

/** 合法模态（官方 adapter 的 declaredInput 只认这几样）。 */
const MODEL_INPUTS = ['text', 'image', 'video', 'audio']

/**
 * 给一个 Promise 加超时（适配器能力探测用）。
 *
 * 用户插件注册的适配器 `listModels()` 可能拉远端：这条路由只服务界面，宁可少几个徽标，
 * 也不能让某个 provider 卡住整张详情表。超时按「失败」处理，调用方照常继续。
 * @param value - 待等待的 Promise（或普通值）。
 * @param ms - 超时毫秒数。
 */
function promiseWithTimeout<T>(value: Promise<T> | T, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`超时（${String(ms)}ms）`))
    }, ms)
    Promise.resolve(value).then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/**
 * 逐模型清单的形状校验（本地版 /provider/set-models 用）。
 *
 * 只挡「一定不合法」的：id 空/重复、contextWindow/maxTokens 不是正整数、input 里出现
 * 不认识的模态。其余字段（reasoningEfforts / compat / api / baseURL）原样透传——
 * 那是官方 adapter 的 strict 校验范围，它拒绝时 mutate 会抛，消息原样回给界面。
 * @param raw - 请求体里的 models。
 */
function sanitizeDeclaredModels(raw: unknown): AnyRecord[] {
  if (!Array.isArray(raw)) throw new Error('models 必须是数组（传 null 表示删掉这个键、跟随 pi-ai 目录）')
  const seen = new Set<string>()
  const models: AnyRecord[] = []
  for (const item of raw) {
    const entry = asRecord(item)
    const id = readString(entry['id'])
    if (id === undefined || id.trim() === '') throw new Error('每个模型都要有非空的 id')
    if (seen.has(id)) throw new Error(`模型 ${id} 在清单里重复了`)
    seen.add(id)
    const next: AnyRecord = { ...entry, id }
    for (const key of ['contextWindow', 'maxTokens']) {
      const value = entry[key]
      if (value === undefined || value === null || value === '') continue
      const numeric = Number(value)
      if (!Number.isInteger(numeric) || numeric <= 0) throw new Error(`模型 ${id} 的 ${key} 必须是正整数`)
      next[key] = numeric
    }
    const input = entry['input']
    if (input !== undefined && input !== null) {
      if (!Array.isArray(input) || input.some((value) => typeof value !== 'string' || !MODEL_INPUTS.includes(value))) {
        throw new Error(`模型 ${id} 的 input 只能是 ${MODEL_INPUTS.join(' / ')} 组成的数组`)
      }
      next['input'] = input
    }
    const name = readString(entry['name'])
    if (name !== undefined) next['name'] = name
    models.push(next)
  }
  if (models.length === 0) throw new Error('模型清单不能是空数组：要跟随 pi-ai 目录就传 null 清掉这个键')
  return models
}

/** vendor/pi-ai 下已下载的版本目录（本地版应当恒为空——验证「不附带额外 pi-ai」用）。 */
function installedPiAiVersions(): string[] {
  try {
    return readdirSync(join(vendorDir, 'pi-ai')).filter((name) => existsSync(join(vendorDir, 'pi-ai', name, 'package.json')))
  } catch {
    return []
  }
}

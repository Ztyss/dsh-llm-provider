/**
 * dsh-llm-provider 宿主端。
 *
 * 两件事：
 *   1. LLM 桥接（src/bridge.ts + src/updater.ts）：把官方 llm-pi-ai 适配器跑在选中的
 *      pi-ai 上——拨「启用最新版 pi-ai」开关时是安全区里下载的最新版（上游出新模型
 *      不用等 dsh 发版），开关关闭（缺省）时是 DSH 自带那份。内置的
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
 * 只读；写只发生在三处——插件自己的 vendor/ 目录（桥接副本）、安全区
 * `$DSH_HOME/llm-provider-bridge/`（下载的 pi-ai，只在用户拨开关时），以及用户在界面上
 * 显式操作时（添加/删除 provider、拨 pi-ai 开关）。
 */
import Schema from '@deepseek-ai/schemastery'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activePiAiRoot, loadBridge, piAiNeedsRestart, readPiAiPreference, removeTree, safeInstalledVersions, safeRootDir, setPiAiPreference, vendorDir } from './bridge.js'
import { enrichModelDetails, loadModelDetails, withAdapterModels, withDeclaredModels, type AdapterModelInfo, type ModelDetail } from './model-details.js'
import { checkAndUpdate } from './updater.js'
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
    // 控制台 cookie（可选附带凭据）：约定 <apiKeyEnv 去掉 _API_KEY>_CONSOLE_COOKIE，
    // 给需要控制台会话的适配器用（stepfun 的 Step Plan 点数）；没配置就 undefined。
    const consoleCookieRef = (route.apiKeyEnv ?? '').replace(/_API_KEY$/i, '_CONSOLE_COOKIE')
    let consoleCookie: string | undefined
    if (consoleCookieRef !== '' && consoleCookieRef !== route.apiKeyEnv) {
      const consoleResolved = await resolveKey(consoleCookieRef)
      if (consoleResolved.configured && consoleResolved.key !== undefined) consoleCookie = consoleResolved.key
    }
    // 路由自身的配置项：卡片展开体和「添加供应商」表单展示同一组信息（缺的字段 JSON 序列化时自然消失）
    const adapter = findAdapter(providerId, baseUrl)
    const queryConfigNeeded = adapter?.queryConfigNeeded?.(baseUrl) === true
    const routeMeta = { api: route.api, apiKeyEnv: route.apiKeyEnv, models: route.models, consoleCookieRef, consoleCookieConfigured: consoleCookie !== undefined, queryConfigNeeded }
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
      const result = await adapter.query({ id: providerId, displayName, key: credential.key, baseUrl, extras: { consoleCookie } })
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
  /**
   * 读 POST 的 JSON body（空 body 当 `{}`）。解析失败 reject，调用方回 400。
   * 与 {@link writeRoute} 的区别：那条钉死了 providerId 语义，这是通用的。
   */
  function readJsonBody(req: ServerRequest): Promise<AnyRecord> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += String(chunk)
      })
      req.on('end', () => {
        try {
          resolve(asRecord(JSON.parse(body === '' ? '{}' : body)))
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

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

  /**
   * 正在进行的 pi-ai 下载（拨 ON 后异步跑）。进程内存态：重启即消失——而「待生效」的
   * 结论不依赖它：needsRestart 由 /provider/status 现场推导（见 {@link piAiNeedsRestart}），
   * 失败与未过检验落 status.json（latestRejected / lastCheck）。
   * /provider/status 的 piAi.download 报它，前端轮询着显示「下载中」。
   */
  let piAiDownload: { at: string; version: string | undefined; lines: string[] } | undefined

  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/status',
      handler: (_req, res) => {
        const { status: bridgeState } = readVendorState()
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
          // models / modelOverrides 原样下发：逐模型编辑界面必须基于这份原文改，
          // 只回写界面上认识的那几个字段会把用户手写的 reasoningEfforts / compat 抹掉。
          routes = [...providerRoutes(service<SettingsService>('settings'), llm).values()]
            .map((route) => ({
              id: route.id,
              apiKeyEnv: route.apiKeyEnv ?? null,
              source: route.source,
              // displayName / api / baseURL：就地编辑的初始值——不回传的话编辑表单会把
              // 已配置的端点/协议显示成空（「回到官方默认」占位对自定义网关不成立），
              // 保存时的「只写改动过的字段」也会拿空串当原值
              ...(route.label === undefined || route.label === '' ? {} : { displayName: route.label }),
              ...(route.api === undefined || route.api === '' ? {} : { api: route.api }),
              ...(route.baseURL === undefined || route.baseURL === '' ? {} : { baseURL: route.baseURL }),
              // 空数组 / 空对象等于没写，别占着字段——界面用「有没有这个字段」判「有没有自定义清单」
              ...(route.models === undefined || route.models.length === 0 ? {} : { models: route.models }),
              ...(route.modelOverrides === undefined || Object.keys(asRecord(route.modelOverrides)).length === 0
                ? {}
                : { modelOverrides: route.modelOverrides }),
            }))
        } catch { /* 路由发现失败时留空 */ }
        // 待重启是现场推导，不读 status.json 里写时不一的标志（见 piAiNeedsRestart）
        const piAiPreference = readPiAiPreference(bridgeState)
        const safeVersions = safeInstalledVersions()
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
                // 逐条候选的路径与结论：桥接没成时这是唯一能看出「哪条路径被找过、哪条不在」的地方
                candidates: bridge.candidates,
              }
            : { active: false, error: bridge.error, rejected: bridge.rejected, candidates: bridge.candidates },
          llmDirectorySize: declaredCount,
          routes,
          // 只读体检：DeepSeek 走 pi-ai 必须在 settings 的 llm-pi-ai.providers 里有一条
          // deepseek 路由（原生 llm-deepseek 被 cordis.patch.yml 禁用了，全靠这条）。
          // 插件不写宿主配置：缺了就报出来，由用户用「添加 Provider」补。不能静默——
          // 缺了 DeepSeek 会从模型列表里消失，看不出原因。
          deepseekRouteMissing: bridge.ok && !routes.some((route) => route.id === 'deepseek'),
          // pi-ai 开关状态（界面「pi-ai 桥接」标签页用）：
          //   preference      —— 'latest'（拨 ON）/ 'dsh'（拨 OFF，缺省）
          //   safeVersions    —— 安全区里已下载就位的自有版本（旧 → 新）
          //   needsRestart    —— 重启后桥接会挂到与当前不同的档位（现场推导，见 piAiNeedsRestart）
          //   latestVersion / latestRejected —— 最近一次检查的结论（未过检验时界面上常驻显示）
          //   download        —— 正在进行中的下载（拨 ON 后异步跑，完成即消失；结论看上面几个字段）
          //   lastCheck       —— 最近一次检查的明确结论（已是最新/无需下载/失败原因）
          piAi: {
            preference: piAiPreference,
            safeVersions,
            needsRestart: piAiNeedsRestart(piAiPreference, safeVersions, bridge.ok ? bridge.piAiSource : undefined),
            latestVersion: readString(bridgeState['latestVersion']),
            latestRejected: bridgeState['latestRejected'],
            lastCheck: bridgeState['lastCheck'],
            download: piAiDownload,
          },
          // 测试环境标识（scripts/test-profile.sh 启动时带 DSH_PROVIDER_TEST=1）：
          // 浏览器端看到后给标题/favicon 加「测」标，一眼区分测试实例
          testMode: process.env.DSH_PROVIDER_TEST === '1',
          localBuild: true,
          // 诊断用：vendor/pi-ai 下遗留的下载档（新策略不往里写；老机器上可能有残留）
          vendorPiAiVersions: installedPiAiVersions(),
        })
      },
    }),
    'dsh-llm-provider: /provider/status route',
  )

  /**
   * 发起一次 pi-ai 检查 + 下载（异步、幂等由 checkAndUpdate 内部保证）。
   *
   * 拨 ON 与启动补齐共用这一条：下载进行态记在内存里的 piAiDownload（/provider/status
   * 报给界面轮询），终态落 status.json（latestRejected / lastCheck）；「要不要重启」
   * 不由这里写——那是 status 路由按偏好与当前档位现场推的（piAiNeedsRestart）。
   * checkAndUpdate 内部已兜住全部错误，这里不再 try/catch。
   */
  function beginPiAiDownload(): void {
    if (piAiDownload !== undefined) return // 已在进行中：重复触发直接忽略
    piAiDownload = { at: new Date().toISOString(), version: undefined, lines: [] }
    void checkAndUpdate(
      (line) => {
        if (piAiDownload !== undefined) piAiDownload.lines.push(line)
      },
      bridge.ok ? bridge.piAiVersion : undefined,
    ).then((result) => {
      if (piAiDownload !== undefined) piAiDownload.version = result.latest ?? result.installed
      piAiDownload = undefined
    })
  }

  // 「启用最新版 pi-ai」开关（设置页 toggle）：拨 ON = 写偏好 + 立即发起检查/下载；
  // 拨 OFF = 写偏好，桥接重启后回退 DSH 自带那份（已下载文件保留，再拨 ON 零成本）。
  // 下载异步进行：响应立即返回，前端轮询 /provider/status 的 piAi.download 看进度。
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/pi-ai',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        void (async () => {
          let parsed: AnyRecord
          try {
            parsed = await readJsonBody(req)
          } catch (error) {
            json(res, 400, { ok: false, error: messageOf(error) })
            return
          }
          const enabled = parsed['enabled'] === true
          setPiAiPreference(enabled ? 'latest' : 'dsh')
          if (!enabled) {
            // 拨 OFF：不动已下载的文件；当前正跑自有版时才需要重启回退
            const onSafe = bridge.ok && bridge.piAiSource.startsWith('safe-')
            json(res, 200, {
              ok: true,
              enabled: false,
              needsRestart: onSafe,
              reason: onSafe
                ? '已拨到「DSH 自带」，重启 dsh 后生效（已下载的文件保留，可随时拨回）'
                : '已在使用 DSH 自带的 pi-ai',
              checkedAt: new Date().toISOString(),
            })
            return
          }
          json(res, 200, { ok: true, enabled: true, started: true, checkedAt: new Date().toISOString() })
          beginPiAiDownload()
        })()
      },
    }),
    'dsh-llm-provider: /provider/pi-ai route',
  )

  // 模型详情（悬浮卡）：pi-ai 数据文件的全量元数据，再由 /provider/models 的异步增强链补能力
  // （route 声明/适配器解析 → 合成 provider 自报 → settings 原文兜底），60 秒缓存
  let modelDetailsCache: { at: number; value: ModelDetail[] } | undefined
  const modelDetails = (): ModelDetail[] => {
    // 同步基线：纯 pi-ai 目录（异步增强见 /provider/models；没增强过时返回基线也安全）
    if (modelDetailsCache === undefined || Date.now() - modelDetailsCache.at > 60_000) {
      modelDetailsCache = { at: Date.now(), value: loadModelDetails(activePiAiRoot()) }
    }
    return modelDetailsCache.value
  }
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/models',
      handler: (_req, res) => {
        void (async () => {
          if (modelDetailsCache === undefined || Date.now() - modelDetailsCache.at > 60_000) {
            let value: ModelDetail[]
            try {
              const llm = service<LlmService>('llm')
              const routes = [...providerRoutes(service<SettingsService>('settings'), llm).values()]
              // 能力增强链（合并版三层）：
              //   1. enrichModelDetails——route 的模型经适配器 listModels 解析，能力三态（未知≠不支持）；
              //   2. withAdapterModels——合成 provider（modlens 的 `modlens-<上游>`）三处都没有，
              //      只有适配器自己知道它给模型补了 image，问一遍 llm 服务；
              //   3. withDeclaredModels——settings 原文兜底：老宿主没有 listModels、或别名 id 两处
              //      都没命中时，路由声明里写明的 input 照样生效（只补缺，不覆盖前两层）。
              value = await enrichModelDetails(loadModelDetails(activePiAiRoot()), llm, routes.map((route) => route.id))
              try {
                const infos = await adapterModelInfos(logger, value)
                if (infos.length > 0) value = withAdapterModels(value, infos)
              } catch (innerError) {
                logger?.warn?.(`适配器能力探测失败（徽标会缺）：${messageOf(innerError)}`)
              }
              value = withDeclaredModels(value, routes)
            } catch (error) {
              // 增强链路出问题就退回纯 pi-ai 目录：能力可能不全，总比详情整块空掉好
              logger?.warn?.(`模型详情增强失败：${messageOf(error)}`)
              value = loadModelDetails(activePiAiRoot())
            }
            modelDetailsCache = { at: Date.now(), value }
          }
          json(res, 200, { models: modelDetailsCache.value, fetchedAt: new Date().toISOString() })
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
  async function adapterModelInfos(logger: Logger | undefined, knownBase?: ModelDetail[]): Promise<AdapterModelInfo[]> {
    const llm = service<LlmService>('llm')
    if (llm === undefined || typeof llm.listProviders !== 'function' || typeof llm.listModels !== 'function') return []
    const known = new Set((knownBase ?? modelDetails()).map((detail) => detail.provider))
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

  // 「测试」：向这个模型 id 真发一条最小对话请求（max_tokens:1，"ping"），验证连通性。
  // 用户明确要求：不是查模型清单有没有这个 id（清单在 ≠ 真能出活），而是实连——
  // 端点 + 凭据 + 模型 id 三样一起验证，回包耗时一并报告。凭据不出宿主；
  // 官方默认端点的路由（没写 baseURL）没有可直接请求的地址，如实回报不硬猜。
  // 请求失败不抛 5xx：测试结果本身就是要展示给用户的内容（HTTP 状态 + 响应片段）。
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/provider/test-model',
      handler: writeRoute(async (route, parsed, res) => {
        const modelId = typeof parsed['modelId'] === 'string' ? parsed['modelId'].trim() : ''
        if (modelId === '') {
          json(res, 200, { ok: false, error: '缺少 modelId' })
          return
        }
        const base = typeof route.baseURL === 'string' ? route.baseURL.replace(/\/+$/, '') : ''
        if (base === '') {
          json(res, 200, { ok: false, error: '这条路由用的是官方默认端点（未写 baseURL），没有可直接请求的地址' })
          return
        }
        const credential = await resolveKey(route.apiKeyEnv)
        if (!credential.configured || typeof credential.key !== 'string' || credential.key === '') {
          json(res, 200, { ok: false, error: '凭据没有配置，无法测试' })
          return
        }
        const isAnthropic = route.api === 'anthropic-messages'
        const url = isAnthropic ? base + '/v1/messages' : base + '/chat/completions'
        const headers: Record<string, string> = isAnthropic
          ? { 'x-api-key': credential.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
          : { Authorization: 'Bearer ' + credential.key, 'content-type': 'application/json' }
        const body = JSON.stringify({
          model: modelId,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        })
        const startedAt = Date.now()
        try {
          const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(20_000) })
          const latencyMs = Date.now() - startedAt
          const raw = await response.text()
          if (!response.ok) {
            const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
            // 个别网关连 1 token 探测都不收（如 opencode-go 回 HTTP 400 MissingSessionID）——
            // 退回模型清单校验（GET /models），至少能验证「端点可达 + 模型在清单里」，
            // 并在结果里如实标注这是清单校验而非实连（用户批注）。
            if (response.status === 400) {
              const list = await probeModelList(base, isAnthropic, credential.key)
              if (list !== undefined) {
                const served = list.ids.includes(modelId)
                logger?.info?.(`test-model ${route.id}/${modelId}：探测被拒（HTTP 400），退回清单校验——${list.ids.length} 个模型，${served ? '包含' : '不包含'}该 id`)
                json(res, 200, { ok: true, mode: 'list', served, total: list.ids.length })
                return
              }
            }
            json(res, 200, { ok: false, error: `HTTP ${response.status}${snippet !== '' ? '：' + snippet : ''}` })
            return
          }
          logger?.info?.(`test-model ${route.id}/${modelId}：连通正常，${latencyMs}ms`)
          json(res, 200, { ok: true, served: true, latencyMs })
        } catch (error) {
          json(res, 200, { ok: false, error: '端点请求失败：' + messageOf(error) })
        }
      }),
    }),
    'dsh-llm-provider: /provider/test-model route',
  )

  /** 模型清单探测（清单校验回退用）：GET /models，取回 id 列表；拿不到返回 undefined。 */
  async function probeModelList(base: string, isAnthropic: boolean, key: string): Promise<{ ids: string[] } | undefined> {
    const listUrl = isAnthropic ? base + '/v1/models' : base + '/models'
    const listHeaders: Record<string, string> = isAnthropic
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { Authorization: 'Bearer ' + key }
    try {
      const response = await fetch(listUrl, { headers: listHeaders, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) return undefined
      const body = asRecord(await response.json())
      const list = Array.isArray(body['data'])
        ? body['data']
        : Array.isArray(body['models'])
          ? body['models']
          : undefined
      const ids: string[] = []
      for (const item of Array.isArray(list) ? list : []) {
        const record = asRecord(item)
        const value = typeof item === 'string' ? item : readString(record['id']) ?? readString(record['name'])
        if (value !== undefined && value !== '') ids.push(value)
      }
      return { ids }
    } catch {
      return undefined
    }
  }

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

  // 历史遗留兜底清理：老版本曾把 npm cache 放在安全区（实测一台机常驻 177 MB）。
  // 新逻辑 cache 只放 tmpdir 且装完即删（见 updater.ts）——这里只可能扫到旧遗留，
  // 幂等：不存在就跳过。安全区是受管目录，removeTree 只摘链、不跟进目标。
  removeTree(join(safeRootDir(), '.npm-cache'))
  // 开关 ON 是**常驻意图**（用户 09-22 修订）：每次启动都查一次上游——本地没有就绪
  // 副本就补上下载（启动即进入下载中态，不必等用户再拨一次），已就绪也看看上游有没有
  // 新版、有就自动下（updateDecision 自己会跳过「上游 ≤ 本地已就位」）。
  // 60 秒最小间隔是纯工程防抖：防 crash-loop 反复查 registry；正常重启间隔远大于它，
  // 语义上仍是「每次重启检查一次」。OFF 时一概不触网。
  const startupState = readVendorState().status
  if (readPiAiPreference(startupState) === 'latest') {
    const lastCheck = asRecord(startupState['lastCheck'])
    const lastAt = readString(lastCheck['at'])
    const stale = lastAt === undefined || Date.now() - Date.parse(lastAt) > 60_000
    if (stale) {
      logger?.info?.('[pi-ai] 开关为 ON：启动即检查上游（本地无就绪副本则补下载）')
      beginPiAiDownload()
    } else {
      logger?.info?.('[pi-ai] 开关为 ON，但上次检查在 60 秒内（防抖），跳过启动检查')
    }
  }

  logger?.info?.('dsh-llm-provider active: GET /plan/status, GET /provider/status, POST /provider/pi-ai')
}

/**
 * 读插件在 vendor/ 下的状态文件：`status.json`（桥接用哪份 pi-ai、体检结论）。
 *
 * 历史说明：这里曾经还读 `updater-state.json` 的 `lastCheck`（"上次检查上游的时间"）。
 * 下载/更新入口关闭后那个文件不再被写，读取也就一并去掉了。
 */
function readVendorState(): { status: AnyRecord } {
  const read = (name: string): AnyRecord => {
    try {
      return asRecord(JSON.parse(readFileSync(join(vendorDir, name), 'utf8')))
    } catch {
      return {}
    }
  }
  return { status: read('status.json') }
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

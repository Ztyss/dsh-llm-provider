/**
 * 宿主端集成测试（本机新增，不属于上游）：真跑 lib/index.js，验证三件事。
 *
 *   node test/host-integration.mjs
 *
 * A. pi-ai 桥接：用本机真实的 DSH_HOME 解析官方 bundle 与 dsh 自带那份 pi-ai，
 *    断言①桥接装载成功（候选/体检链路真的跑通）②vendor/ 里没有 pi-ai 副本
 *    ③开关 OFF（本机构造）时启动零网络请求：触网只发生在开关 ON 的拨动与每次启动检查。
 * B. 路由契约：把 DSH_HOME 指到一个空目录让桥接退化为纯计费模式，再用桩 ctx 收集
 *    宿主注册的 HTTP 路由，逐个打真实请求体，断言 /provider/status、/provider/models、
 *    /provider/set-models、/provider/remove、/provider/pi-ai（pi-ai 开关）的行为。
 * C. 写入面：set-models 落到 settings.mutate 的 op/path 与清洗后的值（issue #1）。
 */
import { mkdtempSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// PLUGIN_DIR 指到 profile 里装好的那份就跑真实产物（peer 依赖从 profile 的 node_modules 解析）
let pluginDir = process.env.PLUGIN_DIR ?? root
const realHome = process.env.HOME_PROFILE ?? join(process.env.USERPROFILE ?? '', '.dsh')

/**
 * 降级模式（HOST_TEST_DEGRADED=1）：把插件包复制到临时目录，只链上 schemastery，
 * 让 findSourceBundle() 找不到官方 bundle → 桥接按设计退化为纯计费模式，
 * 于是一个简单桩 ctx 就能跑通 apply() 并把 HTTP 路由全注册出来，专门验路由契约。
 */
const degraded = process.env.HOST_TEST_DEGRADED === '1'
let sandbox
if (degraded) {
  sandbox = mkdtempSync(join(tmpdir(), 'dsh-lp-host-'))
  cpSync(join(pluginDir, 'lib'), join(sandbox, 'lib'), { recursive: true })
  cpSync(join(pluginDir, 'cordis.patch.yml'), join(sandbox, 'cordis.patch.yml'))
  cpSync(join(pluginDir, 'package.json'), join(sandbox, 'package.json'))
  mkdirSync(join(sandbox, 'node_modules', '@deepseek-ai'), { recursive: true })
  symlinkSync(
    join(realHome, 'profiles', 'node_modules', '@deepseek-ai', 'schemastery'),
    join(sandbox, 'node_modules', '@deepseek-ai', 'schemastery'),
    'junction',
  )
  pluginDir = sandbox
}

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    实际: ${JSON.stringify(actual)}\n    期望: ${JSON.stringify(expected)}`}`)
}
function checkThat(label, cond, detail) {
  if (!cond) failures += 1
  console.log(`${cond ? '✓' : '✗'} ${label}${cond ? '' : `\n    ${detail ?? ''}`}`)
}

// 任何网络请求都算失败：本地版不该再下载 pi-ai
const fetchCalls = []
const realFetch = globalThis.fetch
globalThis.fetch = (...args) => {
  fetchCalls.push(String(args[0]))
  return Promise.reject(new Error('离线集成测试：不该发请求'))
}

async function importFresh(file) {
  const url = pathToFileURL(join(pluginDir, file)).href + `?t=${Date.now()}${Math.random()}`
  return import(url)
}

// ---------- A. 真 DSH_HOME：桥接装载 + 无 pi-ai 副本 ----------
process.env.DSH_HOME = realHome
const hostA = await importFresh('lib/index.js')
const vendor = join(pluginDir, 'vendor')
const vendorPiAi = join(vendor, 'pi-ai')
// r6+ 桥接工作区在插件包外的安全区（$DSH_HOME/llm-provider-bridge）——插件包随时会被
// 整棵递归删，包内不能有任何「指向别处」的链（两次事故的结构性教训）。
const bridgeDir = join(realHome, 'llm-provider-bridge', 'llm-bridge')

if (degraded) {
  console.log('（降级模式：跳过 A 组桥接断言，只验路由契约）')
} else {
  checkThat('A. 桥接装载成功（官方 bundle + dsh 自带 pi-ai 解析链路跑通）', hostA.Config !== undefined, 'Config 导出缺失')
  checkThat('A. 安全区 llm-bridge 里是官方适配器 bundle 副本', existsSync(join(bridgeDir, 'lib', 'index.js')), bridgeDir)
  const bridgeBytes = existsSync(join(bridgeDir, 'lib', 'index.js')) ? statSync(join(bridgeDir, 'lib', 'index.js')).size : 0
  checkThat('A. 副本体积与官方 bundle 一致量级（<1 MB）', bridgeBytes > 0 && bridgeBytes < 1024 * 1024, String(bridgeBytes))
  checkThat('A. vendor/ 下没有 pi-ai 目录（本地版不落地 pi-ai 副本）', !existsSync(vendorPiAi), vendorPiAi)
  const status = existsSync(join(vendor, 'status.json')) ? JSON.parse(readFileSync(join(vendor, 'status.json'), 'utf8')) : {}
  // 合并版在 Desktop 上会解析出 dsh-app（安装树锚点）或 dsh（bundle 解析链）——都是宿主自带那份
  checkThat('A. status.json 记的是 dsh 自带那份 pi-ai（dsh-app / dsh）', status.piAiSource === 'dsh' || status.piAiSource === 'dsh-app', JSON.stringify(status))
  checkThat('A. 启动检查没发任何网络请求', fetchCalls.length === 0, fetchCalls.join(', '))
}

// A 组到此为止：真桥接在跑，apply() 需要真 cordis ctx（本测试不模拟那一套），
// 路由契约交给降级模式那一趟（HOST_TEST_DEGRADED=1）。
if (!degraded) {
  console.log(failures === 0 ? '\nA 组全部通过（桥接装载 / 无 pi-ai 副本 / 零网络请求）' : `\nA 组 ${failures} 项失败`)
  process.exit(failures === 0 ? 0 : 1)
}

// ---------- B/C. 桩 ctx + 空 DSH_HOME：路由契约 ----------
const emptyHome = mkdtempSync(join(tmpdir(), 'dsh-lp-empty-'))
process.env.DSH_HOME = emptyHome
const hostB = await importFresh('lib/index.js')

const mutateCalls = []
const credentialCalls = []
const settingsDoc = {
  'llm-pi-ai': {
    providers: {
      'opencode-go': {
        api: 'openai-completions',
        baseURL: 'https://opencode.ai/zen/go/v1',
        apiKeyEnv: 'OPENCODE_GO_API_KEY',
        // 本机真实形状：别名 id，pi-ai 目录里只有 deepseek-v4-flash
        models: [{
          id: 'deepseek-flash',
          name: 'DeepSeek V4.1 Flash',
          contextWindow: 1000000,
          maxTokens: 384000,
          input: ['text', 'image'],
          reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
          compat: { thinkingFormat: 'deepseek' },
        }],
      },
      'plain-route': { api: 'openai-completions', apiKeyEnv: 'PLAIN_KEY' },
    },
  },
}
/** 记下适配器被问了哪些 provider（验证「目录里已有的不重复问」）。 */
const adapterQueries = []
const services = {
  settings: {
    get: (ns) => settingsDoc[ns],
    section: (ns) => settingsDoc[ns],
    mutate: async (ns, ops) => { mutateCalls.push({ ns, ops }) },
  },
  llm: {
    listConfigurableProviders: () => [],
    // 目录里两个 provider：pi-ai 的 opencode-go + modlens 合成的 modlens-opencode-go
    listProviders: () => [{ id: 'opencode-go', name: 'OpenCode Go' }, { id: 'modlens-opencode-go', name: 'OpenCode Go (modlens vision)' }],
    listModels: async (provider) => {
      adapterQueries.push('listModels:' + provider)
      if (provider === 'modlens-opencode-go') {
        // modlens 的 listModels：同一批模型 id，名字带后缀，能力被 withVision 补上 image
        return [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (modlens vision)' }]
      }
      return [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]
    },
    resolveModelInfo: async (provider, model) => {
      adapterQueries.push('resolve:' + provider + '/' + model)
      if (provider === 'modlens-opencode-go') {
        return {
          provider, id: model, name: 'DeepSeek V4 Flash (modlens vision)',
          inputModalities: ['text', 'image'],
          context: { contextWindow: 1000000 },
          defaultMaxTokens: 384000,
          reasoning: { efforts: [{ id: 'high' }, { id: 'max' }], defaultEffort: 'high' },
        }
      }
      return { provider, id: model, name: 'DeepSeek V4 Flash', inputModalities: ['text'] }
    },
  },
  credentials: {
    resolve: async () => undefined,
    unset: async (ref) => { credentialCalls.push(ref) },
  },
}
const routes = []
const logs = []
const ctx = {
  get: (name) => services[name],
  logger: () => ({ info: (line) => logs.push(line), warn: (line) => logs.push(line) }),
  effect: (fn) => { fn(); return () => {} },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
}
hostB.apply(ctx, {})
checkThat('B. 桥接不可用时退化为纯计费模式，路由照注册', routes.length >= 6, `routes=${routes.length}`)

function routeHandlerOf(path) {
  const route = routes.find((entry) => entry.path === path)
  if (route === undefined) throw new Error(`没有注册 ${path}`)
  return route.handler
}
async function call(path, method = 'GET', body) {
  const handler = routeHandlerOf(path)
  return await new Promise((resolve) => {
    const chunks = []
    const res = {
      writeHead(code, headers) { this.code = code; this.headers = headers },
      end(payload) { resolve({ code: this.code, body: payload === undefined ? undefined : JSON.parse(String(payload)) }) },
    }
    const req = {
      method,
      url: '',
      on(event, callback) {
        if (event === 'data' && body !== undefined) callback(JSON.stringify(body))
        if (event === 'end') callback()
      },
    }
    handler(req, res)
    void chunks
  })
}

const statusRes = await call('/provider/status')
check('B. /provider/status 报开关缺省（偏好 dsh、无自有版本）',
  [statusRes.body.piAi.preference, statusRes.body.piAi.safeVersions],
  ['dsh', []])
check('B. /provider/status 报 vendor 下 0 份下载来的 pi-ai', statusRes.body.vendorPiAiVersions, [])
check('B. /provider/status 报出了两条路由', statusRes.body.routes.map((r) => r.id).sort(), ['opencode-go', 'plain-route'])

// 待重启事实现场推导（原地启用 ON：安全区已就位、进程没在跑它）。曾经的坑：
// needsRestart 只在 updater 真下载了时置位，这个局面永远不置——界面只说「无需下载」。
{
  const safeDir = join(emptyHome, 'llm-provider-bridge', 'pi-ai', '9.9.9')
  mkdirSync(join(safeDir, 'node_modules'), { recursive: true })
  writeFileSync(join(safeDir, 'package.json'), JSON.stringify({ version: '9.9.9' }))
  const statusPath = join(pluginDir, 'vendor', 'status.json')
  const setPref = (pref) => writeFileSync(
    statusPath,
    JSON.stringify({ ...JSON.parse(readFileSync(statusPath, 'utf8')), piAiPreference: pref }),
  )
  setPref('latest')
  const pending = await call('/provider/status')
  check('B. 原地启用 ON（安全区就位、本进程没在跑）→ needsRestart 推导为 true',
    [pending.body.piAi.preference, pending.body.piAi.safeVersions, pending.body.piAi.needsRestart],
    ['latest', ['9.9.9'], true])
  setPref('dsh')
  const quiet = await call('/provider/status')
  check('B. 拨 OFF（本进程没跑安全区版）→ needsRestart 推导为 false',
    [quiet.body.piAi.preference, quiet.body.piAi.needsRestart], ['dsh', false])
}

const modelsRes = await call('/provider/models')
const declared = modelsRes.body.models.find((m) => m.id === 'deepseek-flash')
checkThat('B. /provider/models 用路由声明补齐了目录查不到的卡片（issue #5）', declared !== undefined, JSON.stringify(modelsRes.body.models.slice(0, 3)))
check('B. 补齐项的视觉能力来自声明 input', [declared.provider, declared.vision, declared.source], ['opencode-go', true, 'declared'])
check('B. 补齐项的上下文/最大输出来自声明', [declared.contextWindow, declared.maxTokens], [1000000, 384000])

// 适配器自报（modlens 的合成 provider）：三处元数据都没有，只有适配器知道它补了 image
const modlensModel = modelsRes.body.models.find((m) => m.provider === 'modlens-opencode-go' && m.id === 'deepseek-v4-flash')
checkThat('B. modlens 合成 provider 的模型被适配器自报补进详情（视觉徽标的前提）', modlensModel !== undefined, JSON.stringify(modelsRes.body.models.map((m) => m.provider + '/' + m.id).slice(0, 6)))
check('B. modlens 模型：vision 来自适配器 inputModalities', [modlensModel.vision, modlensModel.source], [true, 'adapter'])
check('B. modlens 模型：上下文/最大输出/推理档位来自适配器', [modlensModel.contextWindow, modlensModel.maxTokens, modlensModel.thinkingLevels], [1000000, 384000, ['high', 'max']])
checkThat('B. 目录里已有的 provider 不重复问适配器（只问合成 provider）', adapterQueries.every((q) => !q.includes('opencode-go/') || q.includes('modlens-opencode-go')), JSON.stringify(adapterQueries))
checkThat('B. 适配器确实被问过 modlens provider', adapterQueries.some((q) => q.includes('modlens-opencode-go')), JSON.stringify(adapterQueries))

// 旧 DSH_HOME 下 vendor/pi-ai 是 0 份：这条路由证据在 A 里已经断言过

const setRes = await call('/provider/set-models', 'POST', {
  providerId: 'opencode-go',
  models: [{ id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', contextWindow: '1000000', maxTokens: 384000, input: ['text', 'image'], reasoningEfforts: { low: 'low' } }],
})
check('C. set-models 返回 ok', setRes.body.ok, true)
check('C. 写入 op 是 set（不是整个 providers 段替换）', [mutateCalls[0].ns, mutateCalls[0].ops[0].op, mutateCalls[0].ops[0].path], ['llm-pi-ai', 'set', ['providers', 'opencode-go', 'models']])
check('C. contextWindow 字符串被校正成正整数', mutateCalls[0].ops[0].value[0].contextWindow, 1000000)
check('C. reasoningEfforts / compat 原样保留', [mutateCalls[0].ops[0].value[0].reasoningEfforts, mutateCalls[0].ops[0].value[0].input], [{ low: 'low' }, ['text', 'image']])

const bad = await call('/provider/set-models', 'POST', { providerId: 'opencode-go', models: [{ id: 'x', contextWindow: -3 }] })
check('C. 非法 contextWindow 被拒（500 + 说明）', [bad.code, String(bad.body.error).includes('正整数')], [500, true])
const dup = await call('/provider/set-models', 'POST', { providerId: 'opencode-go', models: [{ id: 'x' }, { id: 'x' }] })
check('C. 重复 id 被拒', [dup.code, String(dup.body.error).includes('重复')], [500, true])
const badInput = await call('/provider/set-models', 'POST', { providerId: 'opencode-go', models: [{ id: 'x', input: ['hologram'] }] })
check('C. 未知模态被拒', [badInput.code, String(badInput.body.error).includes('input')], [500, true])

const clear = await call('/provider/set-models', 'POST', { providerId: 'plain-route', models: null })
check('C. models=null → unset 这个键（回到目录全量）', [clear.body.mode, mutateCalls[1].ops[0].op, mutateCalls[1].ops[0].path], ['catalog', 'unset', ['providers', 'plain-route', 'models']])

const removed = await call('/provider/remove', 'POST', { providerId: 'opencode-go' })
check('C. 删除仍是 unset 整条 + 清凭据', [removed.body.ok, mutateCalls[2].ops[0].path, credentialCalls], [true, ['providers', 'opencode-go'], ['OPENCODE_GO_API_KEY']])

// pi-ai 开关（POST /provider/pi-ai）：拨 OFF 同步返回、偏好落盘、全程零网络请求
const offRes = await call('/provider/pi-ai', 'POST', { enabled: false })
check('B. 拨 OFF：直报已在使用 DSH 自带（不是失败）',
  [offRes.body.ok, offRes.body.enabled, offRes.body.needsRestart], [true, false, false])
{
  const statusPath = join(pluginDir, 'vendor', 'status.json')
  const pref = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : {}
  check('B. 拨 OFF 后偏好落盘 status.json（piAiPreference=dsh）', pref.piAiPreference, 'dsh')
}
checkThat('B. 拨 OFF 全程零网络请求', fetchCalls.length === 0, `fetch: ${fetchCalls.join(', ')}`)

rmSync(emptyHome, { recursive: true, force: true })
if (sandbox !== undefined) rmSync(sandbox, { recursive: true, force: true })
globalThis.fetch = realFetch

// vendor/：清单（llm-bridge 是官方 bundle 副本，不是 pi-ai）
if (!degraded) console.log(`\nvendor/ 内容：${existsSync(vendor) ? readdirSync(vendor).join(', ') : '(无)'}`)
console.log(failures === 0 ? '全部通过' : `${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)

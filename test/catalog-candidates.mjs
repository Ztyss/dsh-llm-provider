// 模型清单编辑器：custom 路由按 baseURL 映射 pi-ai 目录候选（用户 09-28 需求）。
//
// 背景：编辑已有 provider 的模型清单（buildEditRows / ModelListEditor）时，目录候选
// 来自 detailsOfProvider(details, account.id)——按 provider id 前缀索引。custom 路由
// （如 zai-coding-cn-ykw）的 id 不在 pi-ai 目录里，候选恒空，只能手抄 id/参数。
// 需求（用户批注）：custom zai 也能同步看到 pi-ai 里 zai 的模型清单——按 API 地址
// （baseURL 精确相等，去尾斜杠 + host 大小写归一）映射到目录 provider；同名行以目录
// 版字段为准（替换手填的过时字段）；手填独有条目保留；不自动写入（勾选保存才落盘，
// 保存语义不变）。
//
// 断言盯四件容易错的事：
//   1. baseURL 匹配必须精确——同 host 不同路径不算（api.z.ai vs open.bigmodel.cn）；
//   2. 同名行替换的是「显示元数据」（known/inPiAi/knownContextWindow），勾选状态仍由
//      declared 决定（declared 恒勾、目录候选不勾）——保存写什么由用户勾选驱动；
//   3. 手填独有 id 不丢（官方 models 是整段替换，丢行=用户以为模型没了）；
//   4. 目录路由（account.id 即目录 provider）行为不变——candidates 不重复收录自家。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
let captured
globalThis.window = { __ModuleLoader__: { load(config) { captured = config } } }
const reactStub = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'createElement') return (type, props, ...children) => ({ type, props, children })
    if (prop === 'useState') return (initial) => [initial, () => {}]
    if (prop === 'useRef') return () => ({ current: null })
    if (prop === 'useMemo') return (fn) => fn()
    if (prop === 'useCallback') return (fn) => fn
    return () => {}
  },
})
new Function('window', 'document', 'fetch', 'setInterval', source)(
  globalThis.window,
  {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, style: {} }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
    documentElement: { lang: 'zh' },
  },
  () => Promise.reject(new Error('本测试不发请求')),
  () => 0,
)
const lib = captured.factory((name) => (name === 'react' ? reactStub : {}))

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : 'FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

const { buildEditRows, catalogCandidatesOf, normalizeBaseUrl } = lib
for (const [name, fn] of Object.entries({ buildEditRows, catalogCandidatesOf, normalizeBaseUrl })) {
  if (typeof fn !== 'function') {
    console.error(`lib/client.js 没有导出 ${name}（先 npm run build，并确认 src/client/index.ts 的导出名单）`)
    process.exit(2)
  }
}

// ---- 1. baseURL 归一化 ----
check('去尾斜杠', normalizeBaseUrl('https://open.bigmodel.cn/api/coding/paas/v4/') === 'https://open.bigmodel.cn/api/coding/paas/v4')
check('host 大小写归一', normalizeBaseUrl('https://OPEN.BigModel.cn/api/coding/paas/v4') === 'https://open.bigmodel.cn/api/coding/paas/v4')
check('路径大小写保留（不同路径不误配）', normalizeBaseUrl('https://open.bigmodel.cn/Api/Coding') !== normalizeBaseUrl('https://open.bigmodel.cn/api/coding'))
check('多重尾斜杠也归一', normalizeBaseUrl('https://a.example/v1//') === 'https://a.example/v1')
check('空串返回 undefined', normalizeBaseUrl('') === undefined)
check('null 返回 undefined', normalizeBaseUrl(null) === undefined)
check('非 URL 垃圾不炸（返回 undefined 或原样，不得抛）', (() => { try { normalizeBaseUrl('not a url'); return true } catch { return false } })())

// ---- 2. catalogCandidatesOf：按 baseURL 精确映射目录 provider ----
const ZAI_CN = 'https://open.bigmodel.cn/api/coding/paas/v4'
const details = {
  'zai-coding-cn/glm-5.3': { id: 'glm-5.3', provider: 'zai-coding-cn', name: 'GLM-5.3', baseUrl: ZAI_CN, source: 'pi-ai', vision: false, thinkingLevels: ['low', 'high', 'max'], contextWindow: 1000000, maxTokens: 131072 },
  'zai-coding-cn/glm-5.3-flash': { id: 'glm-5.3-flash', provider: 'zai-coding-cn', name: 'GLM-5.3-Flash', baseUrl: ZAI_CN, source: 'pi-ai', vision: true, thinkingLevels: ['low', 'high', 'max'], contextWindow: 1000000, maxTokens: 131072 },
  'zai-coding-cn/glm-4.7': { id: 'glm-4.7', provider: 'zai-coding-cn', name: 'GLM-4.7', baseUrl: ZAI_CN, source: 'pi-ai', vision: false, thinkingLevels: ['low', 'high', 'max'], contextWindow: 200000 },
  'zai/glm-4.7': { id: 'glm-4.7', provider: 'zai', name: 'GLM-4.7', baseUrl: 'https://api.z.ai/api/coding/paas/v4', source: 'pi-ai', vision: false, thinkingLevels: [], contextWindow: 200000 },
  'deepseek/deepseek-flash': { id: 'deepseek-flash', provider: 'deepseek', name: 'DeepSeek Flash', baseUrl: 'https://api.deepseek.com', source: 'pi-ai', vision: true, thinkingLevels: [], contextWindow: 1000000 },
}
const customAccount = {
  id: 'zai-coding-cn-ykw',
  baseUrl: ZAI_CN + '/',
  models: [
    { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', contextWindow: 500000, input: ['text'] },
    { id: 'my-custom-glm', name: 'My Custom GLM', contextWindow: 300000 },
  ],
}
const candidates = catalogCandidatesOf(details, customAccount)
check('custom 路由按 baseURL 命中目录 provider 的全部模型', candidates.length === 3,
  JSON.stringify(candidates.map((c) => c.id)))
check('同 id 不同 baseUrl 的目录条目不混入（zai 家的 glm-4.7 不进）', candidates.every((c) => c.provider === 'zai-coding-cn'))
check('无 baseUrl 的账户返回空', catalogCandidatesOf(details, { id: 'x' }).length === 0)
check('details 为 null 不炸，返回空', catalogCandidatesOf(null, customAccount).length === 0)
check('目录路由自身不重复收录（provider 过滤）',
  catalogCandidatesOf(details, { id: 'zai-coding-cn', baseUrl: ZAI_CN }).length === 0)

// ---- 3. buildEditRows 集成：编辑 custom provider 看到目录清单 ----
const rows = buildEditRows(customAccount, [], details)
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
check('目录候选行全部出现（glm-5.3 / glm-4.7）', byId['glm-5.3'] !== undefined && byId['glm-4.7'] !== undefined)
check('候选行不勾（declared 非空 → 只勾声明过的）', byId['glm-5.3'].enabled === false && byId['glm-4.7'].enabled === false)
check('同名行（glm-5.3-flash）以目录版元数据为准：known=true', byId['glm-5.3-flash'].known === true)
check('同名行 inPiAi=true（✕ 消失，是目录收录的模型）', byId['glm-5.3-flash'].inPiAi === true)
check('同名行 knownContextWindow 用目录值（替换手填的过时字段）', byId['glm-5.3-flash'].knownContextWindow === 1000000)
check('同名行 knownVision 用目录值（vision=true）', byId['glm-5.3-flash'].vision === true)
check('同名行仍勾着（declared 恒勾，勾选状态不被替换）', byId['glm-5.3-flash'].enabled === true)
check('手填独有条目保留（my-custom-glm）', byId['my-custom-glm'] !== undefined && byId['my-custom-glm'].enabled === true)
check('重复 id 只出现一次', rows.filter((r) => r.id === 'glm-5.3-flash').length === 1)

// ---- 4. 行为不变的对照组 ----
const localAccount = { id: 'deepseek-local', baseUrl: 'http://192.168.35.6/v1', models: [{ id: 'DeepSeek-V4-Flash', name: 'DeepSeek-V4-Flash', contextWindow: 1000000 }] }
const localRows = buildEditRows(localAccount, [], details)
check('baseURL 不匹配任何目录 → 候选不出现（只有手填行）', localRows.length === 1 && localRows[0].id === 'DeepSeek-V4-Flash')
const catalogAccount = { id: 'zai-coding-cn', baseUrl: ZAI_CN, models: [] }
// catalog 参数是组目录快照（真实调用里跟随目录时=目录模型）；own 候选行本就不勾
const catalogRows = buildEditRows(catalogAccount, [{ id: 'glm-5.3' }, { id: 'glm-5.3-flash' }, { id: 'glm-4.7' }], details)
check('目录路由（跟随目录）行为不变：三行全勾', catalogRows.length === 3 && catalogRows.every((r) => r.enabled === true))

console.log(failures === 0 ? '\ncustom 路由目录候选测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

// 逐模型清单编辑的纯函数（issue #1 的诉求）。
//
// 为什么这组用例重要：编辑器写的是 `llm-pi-ai.providers.<id>.models`，而官方对这份数组
// 是**整段替换**目录 + **逐字段硬校验**——写错一条会让整条路由解析失败（用户的模型列表
// 整个消失）。所以边界（空 id / 重复 id / 非正整数 / 只勾选不改参数）都必须在这里钉住。
//
// 走 lib/client.js 而不是 lib/client/model-editor.js：浏览器端是**单文件**产物
// （tsdown 把 src/client/ 全部内联进 lib/client.js，外面套 __ModuleLoader__ 外壳），
// 所以纯函数要从那个 shell 里取（与 test/client-smoke.mjs 同一套机制）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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
const moduleExports = captured.factory((name) => (name === 'react' ? reactStub : {}))
const {
  addModelRow,
  buildEditRows,
  buildModelEditor,
  isDefaultCatalogEquivalent,
  modelListPayload,
  patchModelRow,
  payloadFromRows,
  resolveAddDefaults,
  validateModelRows,
} = moduleExports
for (const [name, fn] of Object.entries({ addModelRow, buildEditRows, buildModelEditor, isDefaultCatalogEquivalent, modelListPayload, patchModelRow, payloadFromRows, resolveAddDefaults, validateModelRows })) {
  if (typeof fn !== 'function') {
    console.error(`lib/client.js 没有导出 ${name}（先 npm run build，并确认 src/client/index.ts 的导出名单）`)
    process.exit(2)
  }
}

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

const catalog = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 1000000 },
  { id: 'deepseek-v4-flash-vision-exp', name: 'Vision Exp', contextWindow: 1000000 },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 1000000 },
]
const details = {
  'deepseek-v4-flash': { id: 'deepseek-v4-flash', provider: 'deepseek', name: 'DeepSeek V4 Flash', vision: false, thinkingLevels: [], contextWindow: 1000000, maxTokens: 384000, source: 'pi-ai' },
  'deepseek-v4-flash-vision-exp': { id: 'deepseek-v4-flash-vision-exp', provider: 'deepseek', name: 'Vision Exp', vision: true, thinkingLevels: [], contextWindow: 1000000, maxTokens: 384000, source: 'pi-ai' },
}

// ---- 1. 建编辑器：目录 + 已声明清单合成，声明的那份优先 ----
const fresh = buildModelEditor('deepseek', catalog, details, undefined)
check('目录里的模型全都进编辑器', fresh.rows.length === 3)
check('每条默认都是勾上的', fresh.rows.every((r) => r.served === true))
check('没配置时是 catalog 模式', fresh.mode === 'catalog')
check('从详情回显窗口值', fresh.rows[0].contextWindow === '1000000')
check('来源标成 catalog', fresh.rows[0].source === 'catalog')
check('没改动过', fresh.rows.every((r) => r.customized === false))

// 已声明清单：官方 configured 非空即整段替换，所以声明过的必须全部出现（哪怕目录里没有）
const withDeclared = buildModelEditor('opencode-go', catalog, details, [
  { id: 'deepseek-flash', name: 'DeepSeek Flash', contextWindow: 500000, maxTokens: 100000, input: ['text', 'image'] },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
])
check('配置声明的自定义 id 也进编辑器（不然用户以为它丢了）',
  withDeclared.rows.some((r) => r.id === 'deepseek-flash'))
check('声明过的来源标成 declared',
  withDeclared.rows.find((r) => r.id === 'deepseek-flash').source === 'declared')
check('两处都有的标成 both',
  withDeclared.rows.find((r) => r.id === 'deepseek-v4-flash').source === 'both')
check('有声明时是 custom 模式', withDeclared.mode === 'custom')
check('声明的窗口值被回显',
  withDeclared.rows.find((r) => r.id === 'deepseek-flash').contextWindow === '500000')
check('目录里的其它模型没被丢掉（只是排在后面）',
  withDeclared.rows.some((r) => r.id === 'deepseek-v4-pro'))
check('重复 id 不会出现两次',
  withDeclared.rows.filter((r) => r.id === 'deepseek-v4-flash').length === 1)

// ---- 2. 勾选 / 改参数 ----
const unchecked = patchModelRow(fresh.rows, 'deepseek-v4-pro', { served: false })
check('取消勾选生效', unchecked.find((r) => r.id === 'deepseek-v4-pro').served === false)
check('取消勾选会置上 customized', unchecked.find((r) => r.id === 'deepseek-v4-pro').customized === true)
check('不改动别的行', unchecked.find((r) => r.id === 'deepseek-v4-flash').served === true)
check('patchModelRow 不改原数组', fresh.rows.find((r) => r.id === 'deepseek-v4-pro').served === true)

// ---- 3. 加自定义行 ----
const added = addModelRow(fresh.rows, '  my-custom-id  ')
check('加行会去掉首尾空白', added.some((r) => r.id === 'my-custom-id'))
check('加的行默认勾上并标成 declared', added[added.length - 1].served === true && added[added.length - 1].source === 'declared')
check('加重复 id 不生效', addModelRow(fresh.rows, 'deepseek-v4-flash').length === 3)
check('加空 id 不生效', addModelRow(fresh.rows, '   ').length === 3)

// ---- 4. 校验（官方那边错一条会挂整条路由） ----
check('正常清单通过校验', validateModelRows(fresh.rows) === undefined)
check('重复 id 被拦下',
  validateModelRows([{ id: 'a', served: true, contextWindow: '', maxTokens: '' }, { id: 'a', served: true, contextWindow: '', maxTokens: '' }]) !== undefined)
check('未勾选的行不参与校验',
  validateModelRows([
    { id: 'a', served: true, contextWindow: '', maxTokens: '' },
    { id: '', served: false, contextWindow: 'x', maxTokens: '' },
  ]) === undefined)
check('窗口填非正整数被拦下',
  validateModelRows([{ id: 'a', served: true, contextWindow: '0', maxTokens: '' }]) !== undefined)
check('窗口填小数被拦下',
  validateModelRows([{ id: 'a', served: true, contextWindow: '1.5', maxTokens: '' }]) !== undefined)
check('窗口填字母被拦下',
  validateModelRows([{ id: 'a', served: true, contextWindow: 'abc', maxTokens: '' }]) !== undefined)
check('窗口留空算合法（用默认值）',
  validateModelRows([{ id: 'a', served: true, contextWindow: '', maxTokens: '' }]) === undefined)
check('输出上限非法同样被拦下',
  validateModelRows([{ id: 'a', served: true, contextWindow: '', maxTokens: '-1' }]) !== undefined)

// ---- 5. 生成写盘载荷 ----
const keepOne = modelListPayload(patchModelRow(patchModelRow(fresh.rows, 'deepseek-v4-flash-vision-exp', { served: false }), 'deepseek-v4-pro', { served: false }))
check('只写勾选的行', keepOne.length === 1 && keepOne[0].id === 'deepseek-v4-flash')
check('载荷只含官方认的字段',
  Object.keys(keepOne[0]).every((k) => ['id', 'name', 'contextWindow', 'maxTokens', 'input'].includes(k)),
  Object.keys(keepOne[0]).join(','))
check('id 一定在', typeof keepOne[0].id === 'string')
check('窗口有值时写成数字', keepOne[0].contextWindow === 1000000)
const blankWindow = modelListPayload([{ id: 'x', name: 'x', served: true, contextWindow: '', maxTokens: '', customized: true }])
check('窗口留空时不写这个字段', !('contextWindow' in blankWindow[0]))
check('name 与 id 相同时不写 name', !('name' in blankWindow[0]))
check('不写 reasoningEfforts / compat（界面上没有可靠输入，宁可不写）',
  !('reasoningEfforts' in blankWindow[0]) && !('compat' in blankWindow[0]))
const withInput = modelListPayload([{ id: 'v', name: 'v', served: true, contextWindow: '', maxTokens: '', input: ['text', 'image'], customized: true }])
check('有模态信息就写上', JSON.stringify(withInput[0].input) === '["text","image"]')
const visionRow = fresh.rows.find((r) => r.id === 'deepseek-v4-flash-vision-exp')
check('已知支持视觉的模型带上 image 模态', Array.isArray(visionRow.input) && visionRow.input.includes('image'))
const textOnly = fresh.rows.find((r) => r.id === 'deepseek-v4-flash')
check('明确不支持视觉的模型不带 image', textOnly.input === undefined)
check('取消全部勾选时载荷是空数组',
  modelListPayload(fresh.rows.map((r) => ({ ...r, served: false }))).length === 0)

// ---- 6. 「什么都不写」的判定：避免无谓地把目录默认写死 ----
check('原样的目录清单 = 目录默认（可以不写）', isDefaultCatalogEquivalent(fresh.rows) === true)
check('裁掉一个模型就必须写清单', isDefaultCatalogEquivalent(unchecked) === false)
check('改过参数就必须写清单', isDefaultCatalogEquivalent(patchModelRow(fresh.rows, 'deepseek-v4-flash', { maxTokens: '4096' })) === false)
check('有 declared 行就必须写清单（catalog 语义表达不了自定义 id）', isDefaultCatalogEquivalent(withDeclared.rows) === false)

// ---- 7. 清单页编辑器的初始勾选 = 当前真正生效的模型（跟随目录全勾 / 自定义清单只勾声明条目）----
// 此前「跟随目录」时一个都不预勾：深度求索官方路由明明 3 个模型都在生效，打开编辑器却全是空的
const followAccount = { id: 'deepseek', deletable: true }
const declaredAccount = { id: 'deepseek', deletable: true, models: [{ id: 'deepseek-v4-flash' }] }
const followRows = buildEditRows(followAccount, catalog, details)
const declaredRows = buildEditRows(declaredAccount, catalog, details)
check('跟随目录：目录里的模型全部预勾', followRows.length === 3 && followRows.every((r) => r.enabled === true))
check('跟随目录：行不带 declared（保存才落盘，初始态是目录语义）', followRows.every((r) => r.declared === undefined))
check('自定义清单：只预勾声明过的条目', declaredRows.find((r) => r.id === 'deepseek-v4-flash').enabled === true
  && declaredRows.filter((r) => r.enabled).length === 1)
check('自定义清单：未勾的目录模型仍在清单里（可再勾上）', declaredRows.length === 3
  && declaredRows.find((r) => r.id === 'deepseek-v4-pro').enabled === false)
check('跟随目录：已知模型带最大输出（清单页取数就在详情里）',
  followRows.find((r) => r.id === 'deepseek-v4-flash').knownMaxTokens === 384000)

// ---- 7b. 跟随目录时，元数据补进来的「历史候选」不预勾 ----
// 深度求索官方路由（pi-ai bridge base 层默认，没配 models）：目录快照 3 个在生效，
// 元数据库里还有 14 个历史模型（deepseek/deepseek-chat、r1 这些）。此前把并集全勾，
// 编辑器报「当前已添加17个」而卡片头是「模型 (3)」——勾选必须等于目录快照，候选只是候选。
const legacyDetails = {
  ...details,
  'deepseek/deepseek-chat': { id: 'deepseek/deepseek-chat', provider: 'deepseek', name: 'DeepSeek Chat', vision: false, thinkingLevels: [], contextWindow: 163840, maxTokens: 16384, source: 'pi-ai' },
  'deepseek/deepseek-r1': { id: 'deepseek/deepseek-r1', provider: 'deepseek', name: 'DeepSeek R1', vision: false, thinkingLevels: [], contextWindow: 65536, maxTokens: 16384, source: 'pi-ai' },
}
const followWithLegacy = buildEditRows(followAccount, catalog, legacyDetails)
check('跟随目录 + 历史候选：目录快照全勾、候选不勾（计数和卡片头一致）',
  followWithLegacy.length === 5
  && followWithLegacy.filter((r) => r.enabled).length === 3
  && followWithLegacy.filter((r) => r.enabled).every((r) => catalog.some((c) => c.id === r.id)))
check('跟随目录 + 历史候选：候选行仍在清单里（可勾上变成显式清单）',
  followWithLegacy.find((r) => r.id === 'deepseek/deepseek-chat')?.enabled === false)
const declaredWithLegacy = buildEditRows(declaredAccount, catalog, legacyDetails)
check('自定义清单 + 历史候选：只勾声明过的那一条', declaredWithLegacy.filter((r) => r.enabled).length === 1
  && declaredWithLegacy.find((r) => r.id === 'deepseek-v4-flash')?.enabled === true)

// ---- 7c. inPiAi：目录收录与否只认详情来源（✕ 的判据）----
// declared（settings 声明兜底）/ adapter（网关自报）详情不算「pi-ai 目录里有」：
// 用户手写的自定义 id（目录没收录）必须拿到 ✕；目录自带条目不许有 ✕。
const sourceDetails = {
  'deepseek/deepseek-v4-flash': { ...details['deepseek-v4-flash'], source: 'pi-ai' },
  'deepseek/deepseek-v4-flash-vision-exp': { ...details['deepseek-v4-flash-vision-exp'], source: 'pi-ai' },
  'deepseek/deepseek-flash': { id: 'deepseek-flash', provider: 'deepseek', name: 'DS Flash', vision: true, thinkingLevels: [], contextWindow: 1000000, maxTokens: 384000, source: 'declared' },
}
const srcRows = buildEditRows(declaredAccount, catalog, sourceDetails)
check('pi-ai 目录条目 inPiAi=true（不配 ✕）', srcRows.find((r) => r.id === 'deepseek-v4-flash')?.inPiAi === true)
check('declared 兜底详情的行 inPiAi=false（目录外，必须有 ✕）',
  srcRows.find((r) => r.id === 'deepseek-flash')?.inPiAi === false)
check('跟随目录 + 历史候选：元数据库历史模型也是 pi-ai 来源（inPiAi=true）',
  followWithLegacy.find((r) => r.id === 'deepseek/deepseek-chat')?.inPiAi === true)

// ---- 8. 「添加模型」表单留空时的默认值（三级策略：精确匹配官方参数 → 同供应商已知最小档 → 保守常数）----
// 精确匹配：pi-ai 目录（source==='pi-ai'，不分 provider）里有同 id 条目就用它的官方参数；
// 匹配不到走「已知模型最小档」（保守，宁小勿虚报）；连已知模型都没有回退保守常数。
// declared / adapter 来源的详情不算官方参数——网关给 deepseek-v4.1-flash 自报 203K，
// 曾被精确匹配当成默认值填进表单（用户报「应该是 1M」），回归就在这里钉死。
const rowsForDefaults = [
  { id: 'a', contextWindow: '1000000', maxTokens: '384000', knownContextWindow: 1000000, knownMaxTokens: 384000, known: true, inPiAi: true },
  { id: 'b', contextWindow: '', maxTokens: '', knownContextWindow: 65536, knownMaxTokens: 16384, known: true, inPiAi: true },
]
const officialDetails = {
  'deepseek/deepseek-v4.1-flash': { id: 'deepseek-v4.1-flash', provider: 'deepseek', contextWindow: 1000000, maxTokens: 384000, source: 'pi-ai' },
}
check('精确匹配官方参数优先（1000000/384000，跨 provider 同名也算）', (() => {
  const d = resolveAddDefaults(rowsForDefaults, 'deepseek-v4.1-flash', officialDetails)
  return d.ctx === '1000000' && d.max === '384000'
})())
check('无精确匹配：取已知模型最小档（65536/16384，宁小勿虚报）', (() => {
  const d = resolveAddDefaults(rowsForDefaults, 'new-custom-id', officialDetails)
  return d.ctx === '65536' && d.max === '16384'
})())
check('适配器自报的详情不进默认值（网关报 203K 不能当官方参数）', (() => {
  const d = resolveAddDefaults(rowsForDefaults, 'deepseek-v4.1-flash', {
    'deepseek-v4.1-flash': { id: 'deepseek-v4.1-flash', provider: 'opencode-go', contextWindow: 203000, maxTokens: 33000, source: 'adapter' },
  })
  return d.ctx === '65536' && d.max === '16384'
})())
check('declared 兜底详情同样不进默认值', (() => {
  const d = resolveAddDefaults(rowsForDefaults, 'deepseek-v4.1-flash', {
    'deepseek-v4.1-flash': { id: 'deepseek-v4.1-flash', provider: 'opencode-go', contextWindow: 203000, maxTokens: 33000, source: 'declared' },
  })
  return d.ctx === '65536' && d.max === '16384'
})())
check('没有任何已知值时回退保守值（131072/8192）', (() => {
  const d = resolveAddDefaults([], 'anything', undefined)
  return d.ctx === '131072' && d.max === '8192'
})())
check('非法字符串忽略，不进默认值', (() => {
  const d = resolveAddDefaults([{ id: 'x', contextWindow: 'abc', maxTokens: '-5', known: false }], 'm', undefined)
  return d.ctx === '131072' && d.max === '8192'
})())
// ---- 8b. 目录外思考模型的「裸 reasoning: true」保存修复（用户报 step-5-preview）----
// 现场复刻：自定义路由的声明条目只有 reasoning: true、没有 reasoningEfforts（compat 是
// 用户手写字段，得原样保留）。面板预填的档位「看着配置了」，但没点过任何 chip = edited
// 不置位，旧逻辑整段原样透传 → 官方 resolver 按非推理物化 → 选择器一选档位就报
// session/model-unavailable: ... does not support reasoning effort "high"。
const stepEntry = {
  id: 'step-5-preview', name: 'step-5-preview', input: ['text', 'image'],
  compat: { chatTemplateKwargs: {}, chatTemplateArgs: {} },
  contextWindow: 1000000, maxTokens: 65536, reasoning: true,
}
const stepAccount = { id: 'stepfun', deletable: true, models: [stepEntry] }
const stepPayload = payloadFromRows(buildEditRows(stepAccount, [], undefined), { details: undefined, providerId: 'stepfun' }, () => {})
const stepEntry0 = stepPayload !== undefined ? stepPayload[0] : undefined
check('裸 reasoning: true 行没编辑过也补齐 reasoningEfforts（默认档 low/medium/high）', stepEntry0 !== undefined
  && stepEntry0.reasoningEfforts !== undefined
  && stepEntry0.reasoningEfforts.low === 'low' && stepEntry0.reasoningEfforts.medium === 'medium'
  && stepEntry0.reasoningEfforts.high === 'high', JSON.stringify(stepEntry0))
check('补齐不动手写字段：compat / name / 窗口原样保留', stepEntry0 !== undefined
  && stepEntry0.compat !== undefined && stepEntry0.compat.chatTemplateKwargs !== undefined
  && stepEntry0.compat.chatTemplateArgs !== undefined && stepEntry0.name === 'step-5-preview'
  && stepEntry0.reasoning === true && stepEntry0.contextWindow === 1000000 && stepEntry0.maxTokens === 65536)
check('pi-ai 目录收录的行不补（参数以上游目录为准）', (() => {
  const piAiAccount = { id: 'deepseek', deletable: true, models: [{ id: 'deepseek-v4-flash', reasoning: true }] }
  const p = payloadFromRows(buildEditRows(piAiAccount, catalog, details), { details, providerId: 'deepseek' }, () => {})
  const e = p !== undefined ? p.find((x) => x.id === 'deepseek-v4-flash') : undefined
  return e !== undefined && e.reasoningEfforts === undefined && e.reasoning === true
})())
check('已声明档位表原样保留（不重写、不重排）', (() => {
  const acc = { id: 'stepfun', deletable: true, models: [{ id: 'm1', reasoning: true, reasoningEfforts: { low: 'low', xhigh: 'xhigh' } }] }
  const p = payloadFromRows(buildEditRows(acc, [], undefined), { details: undefined, providerId: 'stepfun' }, () => {})
  const e = p !== undefined ? p[0] : undefined
  return e !== undefined && JSON.stringify(e.reasoningEfforts) === JSON.stringify({ low: 'low', xhigh: 'xhigh' })
})())
check('勾掉推理仍显式写 reasoningEfforts: false（旧行为不变）', (() => {
  const rows2 = buildEditRows(stepAccount, [], undefined).map((r) => ({ ...r, reasoning: false, edited: true }))
  const p = payloadFromRows(rows2, { details: undefined, providerId: 'stepfun' }, () => {})
  const e = p !== undefined ? p[0] : undefined
  return e !== undefined && e.reasoning === false && e.reasoningEfforts === false
})())
check('草稿优先：effortsDraft 覆盖预填（旧行为不变）', (() => {
  const rows3 = buildEditRows(stepAccount, [], undefined).map((r) => ({ ...r, effortsDraft: { minimal: 'minimal' }, edited: true }))
  const p = payloadFromRows(rows3, { details: undefined, providerId: 'stepfun' }, () => {})
  const e = p !== undefined ? p[0] : undefined
  return e !== undefined && e.reasoningEfforts !== undefined && e.reasoningEfforts.minimal === 'minimal'
})())
console.log(failures === 0 ? '\n逐模型清单编辑测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

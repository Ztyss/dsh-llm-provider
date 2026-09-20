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
  validateModelRows,
} = moduleExports
for (const [name, fn] of Object.entries({ addModelRow, buildEditRows, buildModelEditor, isDefaultCatalogEquivalent, modelListPayload, patchModelRow, validateModelRows })) {
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
  'deepseek-v4-flash': { id: 'deepseek-v4-flash', provider: 'deepseek', name: 'DeepSeek V4 Flash', vision: false, thinkingLevels: [], contextWindow: 1000000, maxTokens: 384000 },
  'deepseek-v4-flash-vision-exp': { id: 'deepseek-v4-flash-vision-exp', provider: 'deepseek', name: 'Vision Exp', vision: true, thinkingLevels: [], contextWindow: 1000000, maxTokens: 384000 },
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

console.log(failures === 0 ? '\n逐模型清单编辑测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

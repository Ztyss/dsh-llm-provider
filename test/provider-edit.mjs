// 卡片级 provider 编辑的纯函数测试（对应 src/client/provider-edit.ts）。
//
// 这块逻辑替代的是官方 `ui-settings-models` 被禁用后丢失的「供应商级编辑」能力。
// 断言盯着三件容易出错、后果又不小的事：
//   1. **只写改过的字段**——多写一个字段就可能覆盖用户手写的配置；
//   2. **清空 = unset**——写成 set '' 会在配置里留一个空串项，下游得再判一次；
//   3. **路径必须带字段名**——路径到对象本身会被宿主整段替换（issue #1 的数据丢失坑）。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 走 lib/client.js 而不是分模块：浏览器端是**单文件**产物（tsdown 把 src/client/ 全部
// 内联进 lib/client.js，外面套 __ModuleLoader__ 外壳），纯函数要从那个 shell 里取
// （与 test/model-editor.mjs、test/client-smoke.mjs 同一套机制）。
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

const { providerEditForm, providerEditSaveOps, validateProviderEdit, isProviderEditDirty } = lib
for (const [name, fn] of Object.entries({ providerEditForm, providerEditSaveOps, validateProviderEdit, isProviderEditDirty })) {
  if (typeof fn !== 'function') {
    console.error(`lib/client.js 没有导出 ${name}（先 npm run build，并确认 src/client/index.ts 的导出名单）`)
    process.exit(2)
  }
}

// ---- 1. 从 route 快照取初值（宿主下发的字段名可能是 camelCase）----
{
  const form = providerEditForm({ displayName: 'DeepSeek', api: 'openai-completions', baseURL: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY' })
  check('取到 displayName', form.displayName === 'DeepSeek')
  check('取到 api', form.api === 'openai-completions')
  check('取到 baseURL', form.baseURL === 'https://api.deepseek.com')
  check('取到 apiKeyEnv', form.apiKeyEnv === 'DEEPSEEK_API_KEY')

  // baseUrl（小写 u）是展示层的写法，也得认
  const alt = providerEditForm({ baseUrl: 'https://x.example' })
  check('兼容 baseUrl 写法', alt.baseURL === 'https://x.example')

  // 缺字段 / 非对象：一律给空串，绝不抛（表单初值不该让整张卡渲染失败）
  const empty = providerEditForm(undefined)
  check('缺数据时四项都是空串',
    empty.displayName === '' && empty.api === '' && empty.baseURL === '' && empty.apiKeyEnv === '',
    JSON.stringify(empty))
  const weird = providerEditForm({ displayName: 42, api: null })
  check('非字符串字段收敛成空串', weird.displayName === '' && weird.api === '')
}

// ---- 2. 只写改过的字段 ----
{
  const original = { displayName: 'DeepSeek', api: 'openai-completions', baseURL: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY' }
  const same = providerEditSaveOps('deepseek', { ...original }, original)
  check('完全没改 → 零 ops', same.length === 0, JSON.stringify(same))

  const renamed = providerEditSaveOps('deepseek', { ...original, displayName: 'DS' }, original)
  check('只改显示名 → 只发一条 op', renamed.length === 1, JSON.stringify(renamed))
  check('那条 op 写的是 displayName', renamed[0]?.path?.[2] === 'displayName')
  check('值是改后的值', renamed[0]?.value === 'DS')

  const twoChanged = providerEditSaveOps('deepseek', { ...original, baseURL: 'https://proxy.example', api: 'anthropic-messages' }, original)
  check('改两项 → 两条 op', twoChanged.length === 2, JSON.stringify(twoChanged))
  check('两条 op 覆盖 baseURL 与 api',
    twoChanged.some((op) => op.path[2] === 'baseURL') && twoChanged.some((op) => op.path[2] === 'api'))
}

// ---- 3. 清空 = unset（不是 set 空串）----
{
  const original = { displayName: 'X', api: 'openai-completions', baseURL: 'https://x.example', apiKeyEnv: 'X_API_KEY' }
  const cleared = providerEditSaveOps('x', { ...original, baseURL: '' }, original)
  check('清空 baseURL → 一条 op', cleared.length === 1, JSON.stringify(cleared))
  check('用的是 unset 而不是 set', cleared[0]?.op === 'unset', JSON.stringify(cleared[0]))
  check('unset 不带 value 字段', cleared[0]?.value === undefined)
  check('unset 路径带字段名', cleared[0]?.path?.[2] === 'baseURL')

  const clearAll = providerEditSaveOps('x', { displayName: '', api: '', baseURL: '', apiKeyEnv: '' }, original)
  check('清空四项 → 四条 unset', clearAll.length === 4 && clearAll.every((op) => op.op === 'unset'), JSON.stringify(clearAll))
}

// ---- 4. 路径必须带字段名（防整段替换的数据丢失坑）----
{
  const original = { displayName: '', api: 'openai-completions', baseURL: '', apiKeyEnv: '' }
  const ops = providerEditSaveOps('my-route', { ...original, baseURL: 'https://y.example' }, original)
  check('路径长度恒为 3（providers / id / field）', ops.every((op) => op.path.length === 3), JSON.stringify(ops))
  check('路径前缀是 providers', ops.every((op) => op.path[0] === 'providers'))
  check('路径第二段是 route id', ops.every((op) => op.path[1] === 'my-route'))
  check('没有任何 op 指向 route 对象本身', ops.every((op) => op.path.length > 2))
}

// ---- 5. 校验 ----
{
  const good = { displayName: '', api: 'openai-completions', baseURL: 'https://a.example', apiKeyEnv: 'A_API_KEY' }
  check('合法表单无错误', validateProviderEdit(good) === undefined)
  check('协议留空算合法（用默认）', validateProviderEdit({ ...good, api: '' }) === undefined)
  check('协议写错被拦下', validateProviderEdit({ ...good, api: 'openai' }) === 'edit.badApi')
  check('端点不是 http(s) 被拦下', validateProviderEdit({ ...good, baseURL: 'api.example.com' }) === 'edit.badBaseUrl')
  check('端点 http:// 也接受', validateProviderEdit({ ...good, baseURL: 'http://a.example' }) === undefined)
  check('端点留空算合法（回到默认）', validateProviderEdit({ ...good, baseURL: '' }) === undefined)
  check('凭据名带小写被拦下', validateProviderEdit({ ...good, apiKeyEnv: 'a_key' }) === 'edit.badKeyEnv')
  check('凭据名带连字符被拦下', validateProviderEdit({ ...good, apiKeyEnv: 'A-KEY' }) === 'edit.badKeyEnv')
  check('凭据名留空算合法', validateProviderEdit({ ...good, apiKeyEnv: '' }) === undefined)
}

// ---- 6. dirty 判定 ----
{
  const original = { displayName: 'X', api: 'openai-completions', baseURL: 'https://x.example', apiKeyEnv: 'X_API_KEY' }
  check('没改 → 不 dirty', isProviderEditDirty({ ...original }, original) === false)
  check('改了 → dirty', isProviderEditDirty({ ...original, displayName: 'Y' }, original) === true)
  check('只加空格 → 不算改（会 trim）', isProviderEditDirty({ ...original, displayName: ' X ' }, original) === false)
  check('清空 → dirty（要写 unset）', isProviderEditDirty({ ...original, baseURL: '' }, original) === true)
}

console.log(failures === 0 ? '\nprovider 编辑测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

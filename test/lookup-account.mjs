// 模型选择器按 modlens 包装 id 回退上游账户的纯函数测试（对应 src/client/format.ts
// 的 lookupAccount）。
//
// 背景（用户 09-28 需求）：模型选择器里 modlens- 前缀的派生 provider 也要和原
// provider 一样显示同样额度（chip / 触发按钮 / /model 命令面板三处，dot 状态点一并
// 跟上游——用户批注三项全选）。905e9d5 做过一版只有前缀剥离，被 1a2bc75 回退；
// 本次完整恢复并补 deepseek-modlens 特例（modlens 对 deepseek-official 上游的包装
// id 不按 modlens-<上游> 惯例命名，见 @liustack/modlens dist/main.js：
//   providerId = upstream === 'deepseek-official' ? 'deepseek-modlens' : `modlens-${upstream}`）。
//
// 断言盯四件容易错的事：
//   1. 精确命中优先——包装 id 自己有账户行时绝不用上游的（上游账户可能配置不同）；
//   2. 两种包装形态都回退——modlens-<上游> 剥前缀；deepseek-modlens → deepseek-official；
//   3. 回退不到就 undefined——上游没有账户行时不许凭空造（显示端按 undefined 隐藏额度）；
//   4. 脏数据不抛——非字符串 id / null map 值都不该炸渲染。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 走 lib/client.js 而不是分模块：浏览器端是单文件产物（tsdown 内联 src/client/），
// 纯函数要从 __ModuleLoader__ shell 里取（与 provider-alerts.mjs 同一套机制）。
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

const { lookupAccount } = lib
if (typeof lookupAccount !== 'function') {
  console.error('lib/client.js 没有导出 lookupAccount（先 npm run build，并确认 src/client/index.ts 的导出名单）')
  process.exit(1)
}

const upstream = { provider: 'zai-coding-cn', remaining: '80%' }
const official = { provider: 'deepseek-official', remaining: '50%' }

check('精确命中优先：id 自己有行时直接返回（不用上游）',
  lookupAccount({ 'modlens-zai-coding-cn': { provider: 'own' }, 'zai-coding-cn': upstream }, 'modlens-zai-coding-cn')?.provider === 'own')
check('modlens- 前缀回退上游（发仔的默认 provider 形态）',
  lookupAccount({ 'zai-coding-cn': upstream }, 'modlens-zai-coding-cn') === upstream)
check('deepseek-modlens 特例回退 deepseek-official',
  lookupAccount({ 'deepseek-official': official }, 'deepseek-modlens') === official)
check('无前缀且未命中 → undefined',
  lookupAccount({ 'zai-coding-cn': upstream }, 'kimi-coding') === undefined)
check('modlens- 前缀但上游无账户行 → undefined（不许凭空造）',
  lookupAccount({ 'kimi-coding': upstream }, 'modlens-moonshotai-cn') === undefined)
check('deepseek-modlens 但 deepseek-official 无行 → undefined',
  lookupAccount({ deepseek: upstream }, 'deepseek-modlens') === undefined)
check('非字符串 id（数字）不抛，按字符串匹配或 undefined',
  (() => { try { return lookupAccount({ '123': upstream }, 123) === upstream } catch { return false } })())
check('null/undefined id 不抛，返回 undefined',
  (() => { try { return lookupAccount({ a: upstream }, null) === undefined && lookupAccount({ a: upstream }, undefined) === undefined } catch { return false } })())
check('map 里的 null 值（脏数据）不挡住别的键，也不炸',
  (() => { try { return lookupAccount({ 'modlens-x': null, x: upstream }, 'modlens-x') === null } catch { return false } })())

console.log(failures === 0 ? '\nlookupAccount 纯函数测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

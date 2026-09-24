// provider 卡片告警行的纯函数测试（对应 src/client/format.ts 的 providerAlerts）。
//
// 背景（用户 09-24 批注）：错误卡不再自动展开，告警原文改在收起态卡片上直接显示；
// 展开态底部用同一个函数取数，两个槽位不会再各写一遍然后漂移。
// 断言盯三件容易出错、后果又不小的事：
//   1. **顺序固定** error → credentialWarning → note——顺序漂移会让同一张卡的两处显示不一致；
//   2. **unknown-provider 的 note 不上卡片**——那句是给插件作者的（"在 src/adapters/ 加一个
//      适配器并在 registry.ts 注册即可"），摊给终端用户是噪声，那一类卡片的 chips 已有「无适配器」；
//   3. **脏数据不抛**——字段缺失 / 非字符串都不该让整张卡的渲染失败。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 走 lib/client.js 而不是分模块：浏览器端是**单文件**产物（tsdown 把 src/client/ 全部
// 内联进 lib/client.js，外面套 __ModuleLoader__ 外壳），纯函数要从那个 shell 里取
// （与 test/provider-edit.mjs、test/client-smoke.mjs 同一套机制）。
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

const { providerAlerts } = lib
if (typeof providerAlerts !== 'function') {
  console.error('lib/client.js 没有导出 providerAlerts（先 npm run build，并确认 src/client/index.ts 的导出名单）')
  process.exit(2)
}

const ERR = 'API key 有效，但该 workspace 没有订阅 OpenCode Go（HTTP 403）'
const WARN = 'OPENCODE_GO_API_KEY 与 ZAI_API_KEY 配了同一把 key'
const NOTE = '账户不可用（余额不足或已欠费）'

// ---- 1. 没有告警就是空数组（不是 undefined，不是 null）----
{
  check('undefined 账户 → 空数组', Array.isArray(providerAlerts(undefined)) && providerAlerts(undefined).length === 0)
  check('null 账户 → 空数组', Array.isArray(providerAlerts(null)) && providerAlerts(null).length === 0)
  check('健康账户 → 空数组', providerAlerts({ id: 'x', windows: [{ window: '5h', percentLeft: 90 }] }).length === 0)
}

// ---- 2. 三类告警的内容与顺序 ----
{
  const only = providerAlerts({ id: 'x', error: ERR })
  check('只有 error → 一条 err', only.length === 1 && only[0].key === 'err' && only[0].text === ERR, JSON.stringify(only))

  const two = providerAlerts({ id: 'x', error: ERR, credentialWarning: WARN })
  check('error + 共用 key → 两条，err 在前', two.length === 2 && two[0].key === 'err' && two[1].key === 'warn', JSON.stringify(two))
  check('warn 文案原样', two[1].text === WARN)

  const three = providerAlerts({ id: 'x', error: ERR, credentialWarning: WARN, note: NOTE })
  check('三类齐了 → 三条，顺序 err/warn/note',
    three.length === 3 && three[0].key === 'err' && three[1].key === 'warn' && three[2].key === 'note',
    JSON.stringify(three))
  check('note 文案原样', three[2].text === NOTE)

  // key 是 react key：同一张卡里必须唯一（重渲染时复用节点）
  const keys = three.map((row) => row.key)
  check('key 唯一（react key）', new Set(keys).size === keys.length, keys.join(','))
}

// ---- 3. unknown-provider 的开发提示不上卡片 ----
{
  const dev = providerAlerts({ id: 'x', kind: 'unknown-provider', note: '认不出这个 provider 的额度接口；在 src/adapters/ 加一个适配器并在 registry.ts 注册即可' })
  check('unknown-provider 的 note 被排除', dev.length === 0, JSON.stringify(dev))
  // 例外只针对 unknown-provider：别的 kind 的 note 是用户向的（deepseek 欠费、minimax 未订阅套餐）
  const user = providerAlerts({ id: 'x', kind: 'quota', note: NOTE })
  check('其它 kind 的 note 保留', user.length === 1 && user[0].key === 'note')
}

// ---- 4. 脏数据不抛、空串不算告警 ----
{
  check('空串 error 不算告警', providerAlerts({ id: 'x', error: '' }).length === 0)
  check('空白 error 不算告警', providerAlerts({ id: 'x', error: '   ' }).length === 0)
  check('空串 note 不算告警', providerAlerts({ id: 'x', note: '' }).length === 0)
  check('空串 credentialWarning 不算告警', providerAlerts({ id: 'x', credentialWarning: '' }).length === 0)

  // error 在 JSON 侧理论上是字符串，但宿主侧曾经放过非字符串：收敛成一句话而不是把卡片渲染炸掉
  const weird = providerAlerts({ id: 'x', error: new Error('boom') })
  check('Error 实例收敛成一句话', weird.length === 1 && weird[0].text.indexOf('boom') !== -1, JSON.stringify(weird))
  const numeric = providerAlerts({ id: 'x', error: 500 })
  check('数字 error 也收敛', numeric.length === 1 && numeric[0].text === '500', JSON.stringify(numeric))
  const nullish = providerAlerts({ id: 'x', error: null, credentialWarning: undefined, note: null })
  check('null / undefined 一律当没有', nullish.length === 0)
}

console.log(failures === 0 ? '\nprovider 告警行测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

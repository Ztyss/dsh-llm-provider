// 官方账号（deepseek-account）额度行的纯函数测试。
//
// 两块：
//   1. lib/official-account.js 的 accountRowFromBalance —— getBalance 三种结果形态
//      （null 未登录 / failed 平台失败 / ready 钱包）到账户行的映射，格式化与字段不能漂；
//   2. lib/client.js 的 lookupAccount —— modlens-<upstream> 包装分组回退到上游账户，
//      让包装 provider 的 chip / 命令面板显示上游同一条额度。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accountRowFromBalance, OFFICIAL_ACCOUNT_ID } from '../lib/official-account.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- client 单文件外壳（与 test/provider-alerts.mjs 同一套机制）----
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

if (typeof accountRowFromBalance !== 'function') {
  console.error('lib/official-account.js 没有导出 accountRowFromBalance（先 npm run build）')
  process.exit(2)
}
const { lookupAccount } = lib
if (typeof lookupAccount !== 'function') {
  console.error('lib/client.js 没有导出 lookupAccount（先 npm run build，并确认 src/client/index.ts 的导出名单）')
  process.exit(2)
}

const AT = '2026-09-27T12:00:00.000Z'

// ---- 1. accountRowFromBalance：三种结果形态 ----
{
  check('null（未登录）→ undefined', accountRowFromBalance(null, AT, undefined) === undefined)
  check('undefined → undefined', accountRowFromBalance(undefined, AT, undefined) === undefined)

  const failed = accountRowFromBalance({ status: 'failed' }, AT, 'https://example.com/usage')
  check('failed → 行 + error、kind quota',
    failed !== undefined && failed.kind === 'quota' && typeof failed.error === 'string' && failed.error.length > 0,
    JSON.stringify(failed))
  check('failed → 保留 usage 链接', failed !== undefined && failed.websiteUrl === 'https://example.com/usage')
  check('failed → 无窗口无余额',
    failed !== undefined && Array.isArray(failed.windows) && failed.windows.length === 0
    && Array.isArray(failed.balances) && failed.balances.length === 0)

  const ready = accountRowFromBalance(
    { status: 'ready', value: [{ currency: 'CNY', balance: '45.20' }], bonusWallets: [{ currency: 'CNY', balance: '9.9' }] },
    AT, undefined,
  )
  check('ready → kind balance、id 固定',
    ready !== undefined && ready.kind === 'balance' && ready.id === OFFICIAL_ACCOUNT_ID && ready.id === 'deepseek-account',
    JSON.stringify(ready))
  check('ready → 余额按币种格式化', ready !== undefined
    && Array.isArray(ready.balances) && ready.balances.length === 1
    && ready.balances[0].label === 'CNY' && ready.balances[0].value === '¥45.20',
  JSON.stringify(ready && ready.balances))
  check('ready → 赠送钱包不进余额行', ready !== undefined && ready.balances.length === 1)
  check('ready → 不可删除（没有路由可删）', ready !== undefined && ready.deletable === false)

  const usd = accountRowFromBalance({ status: 'ready', value: [{ currency: 'USD', balance: '7' }] }, AT, undefined)
  check('USD 余额格式化', usd !== undefined && usd.balances.length === 1 && usd.balances[0].value === '$7.00', JSON.stringify(usd && usd.balances))

  const empty = accountRowFromBalance({ status: 'ready', value: [] }, AT, undefined)
  check('ready 空钱包 → 行在、余额空', empty !== undefined && empty.kind === 'balance' && empty.balances.length === 0)

  // 脏数据不抛：钱包字段缺失时给出占位而不是把整个快照炸掉
  const weird = accountRowFromBalance({ status: 'ready', value: [{}] }, AT, undefined)
  check('钱包字段缺失不抛、有占位', weird !== undefined && weird.balances.length === 1 && typeof weird.balances[0].value === 'string', JSON.stringify(weird))
}

// ---- 2. lookupAccount：modlens- 前缀回退 ----
{
  const upstream = { id: 'deepseek-account', balances: [{ label: 'CNY', value: '¥45.20' }] }
  const map = { 'zai-coding-cn': { id: 'zai-coding-cn' }, 'deepseek-account': upstream }

  check('精确命中', lookupAccount(map, 'zai-coding-cn') === map['zai-coding-cn'])
  check('modlens- 前缀回退到上游', lookupAccount(map, 'modlens-deepseek-account') === upstream)
  check('上游本身优先于回退', lookupAccount(map, 'deepseek-account') === upstream)
  check('完全未命中 → undefined', lookupAccount(map, 'modlens-nobody') === undefined)
  check('非 modlens 前缀不回退', lookupAccount(map, 'modlensless') === undefined)
  check('null id → undefined', lookupAccount(map, null) === undefined)
  check('空 map 不抛', lookupAccount({}, 'x') === undefined)
}

console.log(failures === 0 ? '\n官方账号额度行测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

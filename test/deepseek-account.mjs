// 官方账号（deepseek-account）额度行的纯函数测试。
//
// lib/official-account.js 的 accountRowFromBalance：getBalance 三种结果形态
// （null 未登录 / failed 平台失败 / ready 钱包）到账户行的映射，格式化与字段不能漂。
// 范围口径（用户 09-27 批注）：这条额度只喂模型选择器 chip——每行必带 pickerOnly，
// 「模型服务」页按它过滤不出卡片；modlens 包装组不做前缀回退、不重复显示。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accountRowFromBalance, OFFICIAL_ACCOUNT_ID } from '../lib/official-account.js'

const AT = '2026-09-27T12:00:00.000Z'

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : 'FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

if (typeof accountRowFromBalance !== 'function') {
  console.error('lib/official-account.js 没有导出 accountRowFromBalance（先 npm run build）')
  process.exit(2)
}

// ---- 1. 三种结果形态 ----
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

// ---- 2. 范围口径：pickerOnly（不出「模型服务」卡片，只喂选择器 chip）----
{
  const ready = accountRowFromBalance({ status: 'ready', value: [{ currency: 'CNY', balance: '1' }] }, AT, undefined)
  const failed = accountRowFromBalance({ status: 'failed' }, AT, undefined)
  check('ready 行带 pickerOnly', ready !== undefined && ready.pickerOnly === true, JSON.stringify(ready))
  check('failed 行带 pickerOnly', failed !== undefined && failed.pickerOnly === true)
  check('OFFICIAL_ACCOUNT_ID 与选择器分组一致', OFFICIAL_ACCOUNT_ID === 'deepseek-account')
}

console.log(failures === 0 ? '\n官方账号额度行测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

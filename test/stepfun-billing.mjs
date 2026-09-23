/**
 * StepFun 计费适配器离线测试（fetch 打桩，不触网）。
 * 覆盖六个真实约束：
 *   1. 自定义路由 id 大小写不敏感（本机实际配置的 id 就是「StepFun」）；
 *   2. 查询方式按 API 地址自动分通道——含 step_plan 走套餐点数（不触钱包接口），
 *      其余（/v1、anthropic 裸域、第三方中转）走钱包 /v1/accounts；
 *   3. 钱包端点从 baseURL 的 origin 推导——/step_plan 这类子路径不进 URL；
 *   4. plan 通道未配控制台 cookie → 降级为 note 指路（不报错挡板）；
 *   5. QueryStepPlanRateLimit 的 credit_buckets/left_rate/reset（秒级 epoch）→ 窗口。
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import adapter, { planFailureNote, planWindowsFrom, withRotatedToken } from '../lib/adapters/stepfun.js'
import { loadCookieValue, parseCookieStore, saveCookieValue, serializeCookieStore } from '../lib/adapters/cookie-store.js'
import { resolveDshHome } from '../lib/dsh-home.js'

// ---- match：只认 baseURL 官方双域名（provider id 可改名，不作判据）----
assert.equal(adapter.match('任意名字', 'https://api.stepfun.com/step_plan/v1'), true, '官方域名命中（与 id 无关）')
assert.equal(adapter.match('随便什么', 'https://api.stepfun.ai/v1'), false, 'stepfun.ai 不在判据内（只认 api.stepfun.com）')
assert.equal(adapter.match('StepFun', undefined), false, 'id 不作判据：无 baseURL 不命中')
assert.equal(adapter.match('my-gateway', 'https://relay.example.com/v1'), false, '无关网关不命中')
assert.equal(adapter.match('deepseek', 'https://api.deepseek.com'), false, '其他 provider 不命中')

// ---- queryConfigNeeded：step_plan 地址需要额外配置，其余不需要 ----
assert.equal(adapter.queryConfigNeeded?.('https://api.stepfun.com/step_plan/v1'), true, 'step_plan/v1 需要配置')
assert.equal(adapter.queryConfigNeeded?.('https://api.stepfun.com/step_plan'), true, 'anthropic step_plan 需要配置')
assert.equal(adapter.queryConfigNeeded?.('https://api.stepfun.com/v1'), false, '钱包地址不需要配置')
assert.equal(adapter.queryConfigNeeded?.(undefined), false, '无 baseURL 不需要配置')

const originalFetch = globalThis.fetch
let calledUrl = ''
let fetchCalls = 0
function stubFetch(responder) {
  fetchCalls = 0
  globalThis.fetch = (async (url) => {
    fetchCalls += 1
    calledUrl = String(url)
    const r = responder(calledUrl)
    return { status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) }
  })
}

// ---- 钱包通道：/v1、第三方中转都按钱包解析 ----
stubFetch((url) => {
  assert.equal(url, 'https://api.stepfun.com/v1/accounts', '钱包端点应从 origin 推导')
  return { status: 200, body: { balance: '12.34', total_cash_balance: 20, total_voucher_balance: 2.34 } }
})
try {
  const status = await adapter.query({ id: 'StepFun', displayName: 'StepFun', key: 'sk-test', baseUrl: 'https://api.stepfun.com/v1', extras: {} })
  assert.equal(status.kind, 'balance')
  assert.equal(status.balances.length, 3)
  assert.equal(status.balances[0].value, '¥12.34')
  assert.equal(status.windows.length, 0, '钱包通道不出套餐窗口')
} finally {
  globalThis.fetch = originalFetch
}

stubFetch(() => ({ status: 200, body: { balance: 1 } }))
try {
  const status = await adapter.query({ id: 'stepfun', displayName: 'StepFun', key: 'k', baseUrl: 'https://relay.example.com/v1', extras: {} })
  assert.equal(calledUrl, 'https://api.stepfun.com/v1/accounts', '非官方域名的钱包查询回落官方端点（中转不代理 /v1/accounts）')
  assert.equal(status.kind, 'balance')
  assert.equal(status.balances.length, 1)
} finally {
  globalThis.fetch = originalFetch
}

// ---- plan 通道：baseURL 含 step_plan → 查套餐点数，未配 cookie 时不触任何网络 ----
// 存储隔离：环境里可能留着上一轮实测的有效会话（统一存储 cookies.yaml / 旧版
// stepfun-console-session.json），会让「未配 cookie」分支真的查到数据——测试前挪走，
// 全部断言结束后（文件末尾）再恢复。
const bridgeDir = join(resolveDshHome(), 'llm-provider-bridge')
const storePath = join(bridgeDir, 'cookies.yaml')
const sessionPath = join(bridgeDir, 'stepfun-console-session.json')
const savedStore = existsSync(storePath) ? readFileSync(storePath, 'utf8') : null
const savedSession = existsSync(sessionPath) ? readFileSync(sessionPath, 'utf8') : null
rmSync(storePath, { force: true })
rmSync(sessionPath, { force: true })
stubFetch(() => {
  throw new Error('plan 模式不应调用钱包接口')
})
try {
  const status = await adapter.query({ id: 'StepFun', displayName: 'StepFun', key: 'sk-test', baseUrl: 'https://api.stepfun.com/step_plan/v1', extras: {} })
  assert.equal(fetchCalls, 0, 'plan 通道未配 cookie 时不应有任何网络调用')
  assert.equal(status.kind, 'quota')
  assert.equal(status.windows.length, 0)
  assert.match(status.note ?? '', /「查询配置」/, '降级 note 应指路查询配置入口')
} finally {
  globalThis.fetch = originalFetch
}

// ---- plan 通道：anthropic 形态（裸域 + /step_plan 不带 /v1）同样识别 ----
stubFetch(() => {
  throw new Error('plan 模式不应调用钱包接口')
})
try {
  const status = await adapter.query({ id: 'StepFun', displayName: 'StepFun', key: 'k', baseUrl: 'https://api.stepfun.com/step_plan', extras: {} })
  assert.equal(status.kind, 'quota')
} finally {
  globalThis.fetch = originalFetch
}

// ---- planWindowsFrom：真实 QueryStepPlanRateLimit 响应结构（本机实测抓包）----
const planBody = {
  status: 1, desc: '',
  plan_credit_rate_limit: {
    five_hour_usage_left_rate: 0, five_hour_usage_reset_time: '0',
    weekly_usage_left_rate: 0, weekly_usage_reset_time: '0',
    plan_family: 2,
    subscription_credit_left_rate: 0.96495014,
    subscription_credit_reset_time: '1792658831',
    topup_credit_left_rate: 0,
    credit_buckets: [{ type: 1, credit_total: '1600000000', credit_residual: '1543920314', expire_at: '1793776874' }],
  },
}
const wins = planWindowsFrom(planBody)
assert.equal(wins.length, 1, '五小时/周窗口全 0 时不应出现')
assert.equal(wins[0].window.includes('Step Plan 套餐点数'), true)
assert.equal(wins[0].limit, 1600000000)
assert.equal(wins[0].remaining, 1543920314)
assert.equal(wins[0].percentLeft, 96.5)
assert.equal(wins[0].resetAt, '2026-10-22T08:47:11.000Z', '秒级 epoch 要换算成 ISO')

// ---- planFailureNote：网关错误体三种形态 → 人能读的原因 ----
const expiredBody = JSON.stringify({code:'unauthenticated',message:'auth failed: token is expired',details:[]})
const illegalBody = JSON.stringify({code:'unauthenticated',message:'auth failed: token is illegal'})
const embezzledBody = JSON.stringify({code:'unauthenticated',message:'auth failed: oasis-token is embezzled'})
assert.match(planFailureNote(expiredBody), /Cookie 已过期/, 'expired 要明说已过期')
assert.match(planFailureNote(illegalBody), /无效或校验失败/, 'illegal 要明说无效')
assert.match(planFailureNote(embezzledBody), /无效或校验失败/, 'embezzled 归入无效/校验失败')
assert.match(planFailureNote('not-json'), /Step Plan 点数查询失败/, '非 JSON 走通用失败')

// ---- withRotatedToken：刷新轮换后的 pair 要替换 jar 里的 Oasis-Token 段，其余 cookie 保留 ----
const oldJar = 'Oasis-Webid=w1; INGRESSCOOKIE=i1; Oasis-Token=AAA...BBB; _wafdytokenv1=w2'
const newJar = withRotatedToken(oldJar, 'CCC...DDD')
assert.equal(newJar.includes('Oasis-Token=CCC...DDD'), true, 'Oasis-Token 段要换成新 pair')
assert.equal(newJar.includes('Oasis-Webid=w1'), true, '其余 cookie 保留')
assert.equal(newJar.includes('INGRESSCOOKIE=i1'), true, 'INGRESSCOOKIE 保留')
assert.equal(newJar.includes('AAA'), false, '旧会话段要被替换掉')
assert.equal(withRotatedToken('no-token-jar', 'X'), 'no-token-jar', '无 Oasis-Token 段时原样返回')

// 空响应 → 无窗口（降级由调用方处理）
assert.equal(planWindowsFrom({}).length, 0)

// ---- cookie-store：统一 Cookie 存储解析/序列化/合并/迁移（隔离窗口内，末尾统一恢复） ----
// 解析：多键 + 注释 + 单引号/裸标量；残缺条目（无 value）与坏行跳过
const storeText = [
  '# 手改注释也要容忍',
  'version: 1',
  'cookies:',
  '  STEPFUN_CONSOLE_COOKIE:',
  '    value: "Oasis-Webid=w1; Oasis-Token=\\"AAA...BBB\\"; _wafdytokenv1=w2"',
  '    updatedAt: "2026-09-23T22:15:00.000Z"',
  '  OTHERPROVIDER_PANEL_COOKIE:',
  "    value: 'single ''quoted'' jar'",
  '  BROKEN_PROVIDER_COOKIE:',
  '    updatedAt: "只有时间没有值，丢弃"',
  '  GOOD_PROVIDER_COOKIE:',
  '    value: bare-jar',
].join('\n')
const parsed = parseCookieStore(storeText)
assert.equal(Object.keys(parsed).length, 3, '残缺条目（无 value）丢弃，剩 3 键')
assert.equal(parsed['STEPFUN_CONSOLE_COOKIE'].value.includes('Oasis-Token="AAA...BBB"'), true, 'JSON 双引号值转义还原')
assert.equal(parsed['STEPFUN_CONSOLE_COOKIE'].updatedAt, '2026-09-23T22:15:00.000Z')
assert.equal(parsed['OTHERPROVIDER_PANEL_COOKIE'].value, "single 'quoted' jar", '单引号转义还原')
assert.equal(parsed['GOOD_PROVIDER_COOKIE'].value, 'bare-jar', '裸标量原样')
// 序列化 → 解析 round trip（含引号/反斜杠/分号等难缠字符）
const tricky = { A_COOKIE: { value: 'he said "hi"; a\\b; tail;', updatedAt: '2026-01-01T00:00:00.000Z' }, B_COOKIE: { value: 'x' } }
assert.deepEqual(parseCookieStore(serializeCookieStore(tricky)), tricky, 'round trip 无损')
// 落盘合并：先写 A 再写 B，A 保留；updatedAt 自动生成
assert.equal(saveCookieValue('TESTPROVIDER_CONSOLE_COOKIE', 'jar-a'), true, '落盘成功')
assert.equal(saveCookieValue('OTHERPROVIDER_OTHER_COOKIE', 'jar-b'), true)
const onDisk = parseCookieStore(readFileSync(storePath, 'utf8'))
assert.equal(onDisk['TESTPROVIDER_CONSOLE_COOKIE'].value, 'jar-a', '第二次写不覆盖第一次的键')
assert.equal(onDisk['OTHERPROVIDER_OTHER_COOKIE'].value, 'jar-b')
assert.match(onDisk['TESTPROVIDER_CONSOLE_COOKIE'].updatedAt ?? '', /^\d{4}-\d{2}-\d{2}T/, 'updatedAt 自动记录')
// 迁移：旧版单槽 JSON → 并入新存储，写成功后旧文件移除
writeFileSync(sessionPath, JSON.stringify({ cookie: 'legacy-jar' }))
assert.equal(loadCookieValue('LEGACYPROVIDER_CONSOLE_COOKIE', { path: sessionPath, read: () => JSON.parse(readFileSync(sessionPath, 'utf8')).cookie }), 'legacy-jar', '迁移读出旧值')
assert.equal(parseCookieStore(readFileSync(storePath, 'utf8'))['LEGACYPROVIDER_CONSOLE_COOKIE'].value, 'legacy-jar', '旧值并入新存储')
assert.equal(existsSync(sessionPath), false, '迁移成功后旧文件移除')

console.log('stepfun-billing: match/分通道/钱包解析/plan 降级/套餐窗口/统一 Cookie 存储 断言全过')

// ---- 恢复被隔离的真实存储（cookies.yaml / 旧会话文件） ----
if (savedStore !== null) writeFileSync(storePath, savedStore)
else rmSync(storePath, { force: true })
if (savedSession !== null) writeFileSync(sessionPath, savedSession)
else rmSync(sessionPath, { force: true })

/**
 * StepFun 计费适配器离线测试：match 规则 + 响应解析 + 错误路径 + 套餐点数窗口
 * （fetch 打桩，不触网）。
 * 覆盖四个真实约束：
 *   1. 自定义路由 id 大小写不敏感（本机实际配置的 id 就是「StepFun」）；
 *   2. 计费端点从 baseURL 的 origin 推导——/step_plan 这类子路径不进 URL；
 *   3. id 命中但 baseURL 是第三方中转时回落官方端点。
 *   4. QueryStepPlanRateLimit 的 credit_buckets/left_rate/reset（秒级 epoch）→ 窗口。
 */
import assert from 'node:assert/strict'
import adapter, { planWindowsFrom } from '../lib/adapters/stepfun.js'

// ---- match ----
assert.equal(adapter.match('StepFun', undefined), true, 'id=StepFun 应命中')
assert.equal(adapter.match('stepfun', undefined), true, 'id=stepfun 应命中')
assert.equal(adapter.match('my-gateway', 'https://api.stepfun.com/step_plan/v1'), true, 'baseURL 官方域名应命中')
assert.equal(adapter.match('my-gateway', 'https://api.stepfun.ai/v1'), true, 'stepfun.ai 域名应命中')
assert.equal(adapter.match('my-gateway', 'https://relay.example.com/v1'), false, '无关网关不应命中')
assert.equal(adapter.match('deepseek', 'https://api.deepseek.com'), false, '其他 provider 不应命中')

// ---- query：正常解析三行余额 ----
const sample = { balance: '12.34', total_cash_balance: 20, total_voucher_balance: 2.34 }
const originalFetch = globalThis.fetch
let calledUrl = ''
globalThis.fetch = async (url, init) => {
  calledUrl = String(url)
  assert.equal(init.headers.authorization, 'Bearer sk-test')
  return { status: 200, text: async () => JSON.stringify(sample) }
}
try {
  const status = await adapter.query({ id: 'StepFun', displayName: 'StepFun', key: 'sk-test', baseUrl: 'https://api.stepfun.com/step_plan/v1', extras: {} })
  assert.equal(calledUrl, 'https://api.stepfun.com/v1/accounts', '计费端点应从 origin 推导，不带 /step_plan')
  assert.equal(status.kind, 'balance')
  assert.equal(status.balances.length, 3)
  assert.equal(status.balances[0].value, '¥12.34')
  assert.equal(status.balances[1].value, '¥20.00')
  assert.equal(status.balances[2].value, '¥2.34')
  assert.equal(status.websiteUrl, 'https://platform.stepfun.com')
} finally {
  globalThis.fetch = originalFetch
}

// ---- query：401 → 凭据文案 ----
globalThis.fetch = async () => ({ status: 401, text: async () => '{}' })
try {
  await adapter.query({ id: 'StepFun', displayName: 'StepFun', key: 'bad', baseUrl: undefined, extras: {} })
  assert.fail('401 应当抛错')
} catch (error) {
  assert.match(error.message, /凭据无效或过期/)
} finally {
  globalThis.fetch = originalFetch
}

// ---- query：id 命中但 baseURL 是中转 → 回落官方端点 ----
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://api.stepfun.com/v1/accounts', '中转站不代理计费接口，应回落官方')
  return { status: 200, text: async () => JSON.stringify({ balance: 1 }) }
}
try {
  const status = await adapter.query({ id: 'stepfun', displayName: 'StepFun', key: 'k', baseUrl: 'https://relay.example.com/v1', extras: {} })
  assert.equal(status.balances.length, 1)
  assert.equal(status.balances[0].value, '¥1.00')
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

// 空响应 → 无窗口（降级由调用方处理）
assert.equal(planWindowsFrom({}).length, 0)

console.log('stepfun-billing: match/解析/401/回落/套餐窗口 断言全过')

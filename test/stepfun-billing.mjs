/**
 * StepFun 计费适配器离线测试：match 规则 + 响应解析 + 错误路径（fetch 打桩，不触网）。
 * 覆盖三个真实约束：
 *   1. 自定义路由 id 大小写不敏感（本机实际配置的 id 就是「StepFun」）；
 *   2. 计费端点从 baseURL 的 origin 推导——/step_plan 这类子路径不进 URL；
 *   3. id 命中但 baseURL 是第三方中转时回落官方端点。
 */
import assert from 'node:assert/strict'
import adapter from '../lib/adapters/stepfun.js'

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

console.log('stepfun-billing: match/解析/401/回落 断言全过')

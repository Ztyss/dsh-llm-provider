/**
 * 阶跃星辰 StepFun：GET https://api.stepfun.com/v1/accounts
 * 端点来自 CC Switch（balance.rs）。鉴权：Bearer。
 * 响应：{ object, type, balance, total_cash_balance, total_voucher_balance }，余额单位元（CNY）。
 */
import { account, authFailed, describeHttpError, fail, formatAmount, getJson, num } from './shared.js'

export default {
  id: 'stepfun',
  label: 'StepFun（阶跃星辰）',
  match(providerId, baseUrl) {
    if (/^stepfun/i.test(providerId)) return true
    if (typeof baseUrl !== 'string') return false
    return baseUrl.includes('api.stepfun.ai') || baseUrl.includes('api.stepfun.com')
  },

  async query({ id, displayName, key }) {
    const { status, body } = await getJson('https://api.stepfun.com/v1/accounts', {
      authorization: `Bearer ${key}`,
    })
    if (status === 401 || status === 403) fail(authFailed(status))
    if (status !== 200) fail(describeHttpError(status, body))

    const balances = []
    if (num(body?.balance) !== undefined) balances.push({ label: '总余额', value: formatAmount(body.balance, 'CNY') })
    if (num(body?.total_cash_balance) !== undefined) {
      balances.push({ label: '现金余额', value: formatAmount(body.total_cash_balance, 'CNY') })
    }
    if (num(body?.total_voucher_balance) !== undefined) {
      balances.push({ label: '代金券余额', value: formatAmount(body.total_voucher_balance, 'CNY') })
    }
    return account(id, displayName, 'balance', {
      baseUrl: 'https://api.stepfun.com',
      balances,
      ...(balances.length === 0 ? { note: '响应里没有 balance 字段' } : {}),
    })
  },
}

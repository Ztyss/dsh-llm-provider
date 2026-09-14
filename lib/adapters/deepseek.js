/**
 * DeepSeek 官方：GET https://api.deepseek.com/user/balance
 * 官方文档：https://api-docs.deepseek.com/api/get-user-balance/
 * 只有余额，没有 token plan 配额（官方限流只按并发算）。
 */
import { account, describeHttpError, fail, formatAmount, getJson, originOf } from './shared.js'

/** @type {import('./shared.js').AccountStatus} */
export default {
  id: 'deepseek',
  label: 'DeepSeek 官方',
  match(providerId, baseUrl) {
    if (/^deepseek/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('api.deepseek.com')
  },

  async query({ id, displayName, key, baseUrl }) {
    const origin = originOf(baseUrl) ?? 'https://api.deepseek.com'
    const { status, body } = await getJson(`${origin}/user/balance`, { authorization: `Bearer ${key}` })
    if (status !== 200) fail(describeHttpError(status, body))
    const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
    return account(id, displayName, 'balance', {
      baseUrl: origin,
      balances: infos.map((info) => ({
        label: info?.currency ?? 'CNY',
        value: formatAmount(info?.total_balance, info?.currency),
      })),
      ...(body?.is_available === false ? { note: '账户不可用（余额不足或已欠费）' } : {}),
    })
  },
}

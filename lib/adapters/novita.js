/**
 * Novita AI：GET https://api.novita.ai/v3/user/balance
 * 端点来自 CC Switch（balance.rs）。鉴权：Bearer。
 * 响应：{ availableBalance, cashBalance, creditLimit, outstandingInvoices }，
 *   金额单位是 0.0001 USD，要除以 10000 转成美元。
 */
import { account, authFailed, describeHttpError, fail, formatAmount, getJson, num } from './shared.js'

/** 上游金额单位 0.0001 USD → USD。 */
function usd(value) {
  const n = num(value)
  return n === undefined ? undefined : n / 10000
}

export default {
  id: 'novita',
  label: 'Novita AI',
  match(providerId, baseUrl) {
    if (/^novita/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('api.novita.ai')
  },

  async query({ id, displayName, key }) {
    const { status, body } = await getJson('https://api.novita.ai/v3/user/balance', {
      authorization: `Bearer ${key}`,
    })
    if (status === 401 || status === 403) fail(authFailed(status))
    if (status !== 200) fail(describeHttpError(status, body))

    const balances = []
    const available = usd(body?.availableBalance)
    if (available !== undefined) balances.push({ label: '可用余额', value: formatAmount(available, 'USD') })
    const cash = usd(body?.cashBalance)
    if (cash !== undefined) balances.push({ label: '现金余额', value: formatAmount(cash, 'USD') })
    return account(id, displayName, 'balance', {
      baseUrl: 'https://api.novita.ai',
      balances,
      ...(balances.length === 0 ? { note: '响应里没有 balance 字段' } : {}),
    })
  },
}

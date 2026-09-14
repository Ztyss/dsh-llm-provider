/**
 * Moonshot 开放平台：GET https://api.moonshot.cn/v1/users/me/balance
 * 文档：https://platform.kimi.ai/docs/api/balance.md
 * 注意：sk-（开放平台）和 sk-kimi-（Coding Plan）是两个产品，key 不通用。
 */
import { account, describeHttpError, fail, formatAmount, getJson } from './shared.js'

export default {
  id: 'moonshot',
  label: 'Moonshot 开放平台',
  match(providerId, baseUrl) {
    if (/^moonshot|^kimi$/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('moonshot.')
  },

  async query({ id, displayName, key }) {
    const { status, body } = await getJson('https://api.moonshot.cn/v1/users/me/balance', {
      authorization: `Bearer ${key}`,
    })
    if (status !== 200) fail(describeHttpError(status, body))
    const balances = []
    if (body?.available_balance !== undefined) balances.push({ label: '可用余额', value: formatAmount(body.available_balance, 'CNY') })
    if (body?.voucher_balance !== undefined) balances.push({ label: '代金券', value: formatAmount(body.voucher_balance, 'CNY') })
    if (body?.cash_balance !== undefined) balances.push({ label: '现金余额', value: formatAmount(body.cash_balance, 'CNY') })
    return account(id, displayName, 'balance', { balances })
  },
}

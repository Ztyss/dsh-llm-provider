/**
 * OpenRouter：GET https://openrouter.ai/api/v1/credits
 * 端点来自 CC Switch（balance.rs）。鉴权：Bearer。
 * 响应：{ data: { total_credits, total_usage } }，美元；剩余 = total_credits - total_usage。
 */
import { account, authFailed, describeHttpError, fail, formatAmount, getJson, num } from './shared.js'
import { asRecord } from '../types.js'
import type { AccountStatus, AdapterQueryInput, BalanceRow, BillingAdapter } from './shared.js'

export default {
  id: 'openrouter',
  label: 'OpenRouter',
  match(providerId: string, baseUrl: string | undefined): boolean {
    if (/^openrouter/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('openrouter.ai')
  },

  async query({ id, displayName, key }: AdapterQueryInput): Promise<AccountStatus> {
    const { status, body } = await getJson('https://openrouter.ai/api/v1/credits', {
      authorization: `Bearer ${key}`,
    })
    if (status === 401 || status === 403) fail(authFailed(status))
    if (status !== 200) fail(describeHttpError(status, body))

    const record = asRecord(body)
    const data = asRecord(record['data'] ?? record)
    const total = num(data['total_credits'])
    const used = num(data['total_usage'])
    const remaining = total !== undefined && used !== undefined ? Math.max(0, total - used) : undefined

    const balances: BalanceRow[] = []
    if (remaining !== undefined) balances.push({ label: '剩余额度', value: formatAmount(remaining, 'USD') })
    if (total !== undefined) balances.push({ label: '累计充值', value: formatAmount(total, 'USD') })
    if (used !== undefined) balances.push({ label: '累计使用', value: formatAmount(used, 'USD') })
    return account(id, displayName, 'balance', {
      baseUrl: 'https://openrouter.ai/api/v1',
      balances,
      ...(balances.length === 0 ? { note: '响应里没有 credits 字段' } : {}),
    })
  },
} satisfies BillingAdapter

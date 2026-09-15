/**
 * DeepSeek 官方：GET https://api.deepseek.com/user/balance
 * 官方文档：https://api-docs.deepseek.com/api/get-user-balance/
 * 只有余额，没有 token plan 配额（官方限流只按并发算）。
 */
import { account, describeHttpError, fail, formatAmount, getJson, originOf } from './shared.js'
import { asRecord } from '../types.js'
import type { AccountStatus, AdapterQueryInput, BillingAdapter } from './shared.js'

/** DeepSeek 官方余额适配器。 */
const adapter: BillingAdapter = {
  id: 'deepseek',
  label: 'DeepSeek 官方',
  match(providerId: string, baseUrl: string | undefined): boolean {
    if (/^deepseek/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('api.deepseek.com')
  },

  async query({ id, displayName, key, baseUrl }: AdapterQueryInput): Promise<AccountStatus> {
    const origin = originOf(baseUrl) ?? 'https://api.deepseek.com'
    const { status, body } = await getJson(`${origin}/user/balance`, { authorization: `Bearer ${key}` })
    if (status !== 200) fail(describeHttpError(status, body))
    const record = asRecord(body)
    const infos: unknown[] = Array.isArray(record['balance_infos']) ? record['balance_infos'] : []
    return account(id, displayName, 'balance', {
      baseUrl: origin,
      balances: infos.map((raw) => {
        const info = asRecord(raw)
        return {
          // 上游 currency 正常是 'CNY'/'USD'；这里保持原来的 `?? 'CNY'` 语义（取到什么就下发什么），
          // 断言只是让非字符串（异常响应）也能落到 BalanceRow.label: string 上
          label: (info['currency'] ?? 'CNY') as string,
          value: formatAmount(info['total_balance'], info['currency']),
        }
      }),
      ...(record['is_available'] === false ? { note: '账户不可用（余额不足或已欠费）' } : {}),
    })
  },
}

export default adapter

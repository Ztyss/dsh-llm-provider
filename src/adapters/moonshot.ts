/**
 * Kimi 开放平台（原 Moonshot 开放平台）：GET /v1/users/me/balance
 * 文档：https://platform.kimi.com/docs/api/balance（国内站 .cn / 国际站 .ai，key 不互通）
 * 返回 data.available_balance / voucher_balance / cash_balance（人民币元）。
 * 注意：sk-（开放平台按量）和 sk-kimi-（Coding Plan）是两个产品，key 不通用——
 *      实测用 Coding Plan key 调本接口返回 401。
 */
import { account, authFailed, describeHttpError, fail, formatAmount, getJson } from './shared.js'
import { asRecord } from '../types.js'
import type { AccountStatus, AdapterQueryInput, BalanceRow, BillingAdapter } from './shared.js'

export default {
  id: 'moonshot',
  label: 'Moonshot 开放平台',
  match(providerId: string, baseUrl: string | undefined): boolean {
    if (/^moonshot|^kimi$/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('moonshot.')
  },

  async query({ id, displayName, key, baseUrl }: AdapterQueryInput): Promise<AccountStatus> {
    // 国内站 api.moonshot.cn / 国际站 api.moonshot.ai（key 不互通，按 baseURL 选端点）
    const host = typeof baseUrl === 'string' && baseUrl.includes('.ai') ? 'api.moonshot.ai' : 'api.moonshot.cn'
    const { status, body } = await getJson(`https://${host}/v1/users/me/balance`, {
      authorization: `Bearer ${key}`,
    })
    if (status === 401 || status === 403) fail(authFailed(status) + '（国内 .cn / 国际 .ai 的 key 不通用，注意配对站点）')
    if (status !== 200) fail(describeHttpError(status, body))
    const record = asRecord(body)
    // 官方文档：业务成功 = status:true 且 code:0；余额在 data.* 里
    if (record['status'] !== true || record['code'] !== 0) {
      fail(`上游返回失败：code=${String(record['code'])} scode=${String(record['scode'] ?? '-')} status=${String(record['status'])}`)
    }
    const data = asRecord(record['data'])
    const balances: BalanceRow[] = []
    if (data['available_balance'] !== undefined) balances.push({ label: '可用余额', value: formatAmount(data['available_balance'], 'CNY') })
    if (data['voucher_balance'] !== undefined) balances.push({ label: '代金券', value: formatAmount(data['voucher_balance'], 'CNY') })
    if (data['cash_balance'] !== undefined) balances.push({ label: '现金余额', value: formatAmount(data['cash_balance'], 'CNY') })
    return account(id, displayName, 'balance', { balances })
  },
} satisfies BillingAdapter

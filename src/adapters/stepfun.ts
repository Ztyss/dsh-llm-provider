/**
 * StepFun 开放平台（阶跃星辰）：GET /v1/accounts
 * 文档：https://platform.stepfun.com/docs/zh/api-reference/accounts/get
 * 端点固定官方 https://api.stepfun.com/v1/accounts，Bearer 鉴权；响应顶层直接是
 * balance（剩余，人民币元）/ total_cash_balance（现金）/ total_voucher_balance（赠金）。
 * 自定义路由也认得：match 除 id 前缀（不区分大小写）外兜 baseURL 官方双域名
 * （api.stepfun.com / api.stepfun.ai）；baseURL 带 /step_plan 这类路径无所谓，
 * 计费端点永远从 origin 推导。id 命中但 baseURL 是第三方中转时回落官方——
 * 中转站不代理计费接口。
 */
import { account, authFailed, describeHttpError, fail, formatAmount, getJson, originOf } from './shared.js'
import { asRecord } from '../types.js'
import type { AccountStatus, AdapterQueryInput, BalanceRow, BillingAdapter } from './shared.js'

export default {
  id: 'stepfun',
  label: 'StepFun 开放平台',
  match(providerId: string, baseUrl: string | undefined): boolean {
    if (/^stepfun/i.test(providerId)) return true
    return typeof baseUrl === 'string' && /stepfun\.(com|ai)/i.test(baseUrl)
  },

  async query({ id, displayName, key, baseUrl }: AdapterQueryInput): Promise<AccountStatus> {
    const origin = originOf(baseUrl)
    // 计费接口只在官方域：baseURL 指向官方（含 /step_plan 之类子路径）就跟着走，否则回落官方
    const base = origin !== undefined && /stepfun\.(com|ai)/i.test(origin) ? origin : 'https://api.stepfun.com'
    const { status, body } = await getJson(`${base}/v1/accounts`, {
      authorization: `Bearer ${key}`,
    })
    if (status === 401 || status === 403) fail(authFailed(status))
    if (status !== 200) fail(describeHttpError(status, body))

    const record = asRecord(body)
    const balances: BalanceRow[] = []
    if (record['balance'] !== undefined) balances.push({ label: '剩余余额', value: formatAmount(record['balance'], 'CNY') })
    if (record['total_cash_balance'] !== undefined) balances.push({ label: '现金余额', value: formatAmount(record['total_cash_balance'], 'CNY') })
    if (record['total_voucher_balance'] !== undefined) balances.push({ label: '赠金', value: formatAmount(record['total_voucher_balance'], 'CNY') })
    return account(id, displayName, 'balance', {
      baseUrl: base,
      balances,
      websiteUrl: 'https://platform.stepfun.com',
      ...(balances.length === 0 ? { note: '响应里没有 balance 字段' } : {}),
    })
  },
} satisfies BillingAdapter

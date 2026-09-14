/**
 * 硅基流动 SiliconFlow：GET https://api.siliconflow.cn/v1/user/info（国际站 .com）
 * 端点来自 CC Switch（balance.rs）。鉴权：Bearer。
 * 响应：{ code, data: { balance, chargeBalance, totalBalance, status } }；
 *   国内站余额单位元（CNY），国际站美元（USD），按 baseURL 域名区分。
 */
import { account, authFailed, describeHttpError, fail, formatAmount, getJson, num, originOf } from './shared.js'

export default {
  id: 'siliconflow',
  label: 'SiliconFlow（硅基流动）',
  match(providerId, baseUrl) {
    if (/^siliconflow/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('siliconflow.')
  },

  async query({ id, displayName, key, baseUrl }) {
    const origin = originOf(baseUrl) ?? 'https://api.siliconflow.cn'
    const isCn = !origin.includes('siliconflow.com')
    const currency = isCn ? 'CNY' : 'USD'
    const { status, body } = await getJson(`${origin}/v1/user/info`, {
      authorization: `Bearer ${key}`,
    })
    if (status === 401 || status === 403) fail(authFailed(status))
    if (status !== 200) fail(describeHttpError(status, body))
    if (body?.data === undefined || body?.data === null) fail('响应缺少 data 字段')

    const data = body.data
    const balances = []
    if (num(data?.totalBalance) !== undefined) balances.push({ label: '总余额', value: formatAmount(data.totalBalance, currency) })
    if (num(data?.chargeBalance) !== undefined) balances.push({ label: '充值余额', value: formatAmount(data.chargeBalance, currency) })
    if (num(data?.balance) !== undefined) balances.push({ label: '赠送余额', value: formatAmount(data.balance, currency) })
    return account(id, displayName, 'balance', {
      baseUrl: origin,
      balances,
      ...(balances.length === 0 ? { note: '响应里没有余额字段' } : {}),
    })
  },
}

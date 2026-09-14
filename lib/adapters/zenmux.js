/**
 * ZenMux：GET {base_url} 本身——配置的 baseURL 就是用量端点，直接带 Bearer 请求。
 * 端点规格来自 CC Switch（coding_plan.rs）。
 * 响应：success 必须为 true；data.quota_5_hour / data.quota_7_day 两个窗口，
 *   usage_percentage 是 0-1 小数（要 ×100 才是已用百分比），resets_at 是 ISO 字符串，
 *   used_value_usd / max_value_usd 是美元计价的已用/上限。
 * 套餐等级在 data.plan.tier，账户状态在 data.account_status，拼进 membership。
 */
import {
  account,
  authFailed,
  clampPercent,
  describeHttpError,
  fail,
  getJson,
  num,
  originOf,
} from './shared.js'

function zenmuxWindow(label, data) {
  if (data === undefined || data === null) return undefined
  const usedPct = clampPercent(num(data?.usage_percentage) !== undefined ? num(data.usage_percentage) * 100 : undefined)
  if (usedPct === undefined) return undefined
  const used = num(data?.used_value_usd)
  const limit = num(data?.max_value_usd)
  return {
    window: label,
    limit,
    used,
    remaining: limit !== undefined && used !== undefined ? Math.max(0, limit - used) : undefined,
    percentLeft: clampPercent(100 - usedPct),
    resetAt: typeof data?.resets_at === 'string' && data.resets_at !== '' ? data.resets_at : undefined,
  }
}

export default {
  id: 'zenmux',
  label: 'ZenMux',
  match(providerId, baseUrl) {
    if (/^zenmux/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('zenmux')
  },

  async query({ id, displayName, key, baseUrl }) {
    if (typeof baseUrl !== 'string' || baseUrl === '') {
      fail('ZenMux 的查询端点就是 baseURL 本身，需要配置 baseURL 才能查额度')
    }
    const { status, body } = await getJson(baseUrl, { authorization: `Bearer ${key}` })
    if (status === 401 || status === 403) fail(authFailed(status))
    if (status !== 200) fail(describeHttpError(status, body))
    if (body?.success !== true) {
      fail(`ZenMux 业务错误：${String(body?.message ?? 'success 不为 true')}`)
    }
    if (body?.data === undefined || body?.data === null) fail('响应缺少 data 字段')

    const data = body.data
    const windows = [
      zenmuxWindow('5 小时窗口', data?.quota_5_hour),
      zenmuxWindow('7 天窗口', data?.quota_7_day),
    ].filter((w) => w !== undefined)

    const tier = typeof data?.plan?.tier === 'string' ? data.plan.tier : ''
    const accountStatus = typeof data?.account_status === 'string' ? data.account_status : ''
    return account(id, displayName, 'quota', {
      baseUrl: originOf(baseUrl) ?? baseUrl,
      membership: [tier, accountStatus].filter((s) => s !== '').join(' · '),
      windows,
      ...(windows.length === 0 ? { note: '响应里没有可解析的额度窗口' } : {}),
    })
  },
}

/**
 * MiniMax 编程套餐：GET https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains
 * 国际站同路径，域名换成 api.minimax.io。端点规格来自 CC Switch（coding_plan.rs）。
 * 鉴权：Bearer。业务错误藏在 200 响应的 base_resp.status_code 里（非 0 即失败）。
 * model_remains[] 里取 model_name == "general"（编程套餐），video 等非编程模型跳过：
 *   current_interval_remaining_percent = 5 小时窗口剩余百分比（0-100）；
 *   current_weekly_status == 1 才表示套餐有每周窗口（无周限额套餐该字段为 3，恒 100，不展示），
 *   current_weekly_remaining_percent = 每周窗口剩余百分比；
 *   end_time / weekly_end_time 是 epoch 毫秒。
 */
import {
  account,
  authFailed,
  clampPercent,
  describeHttpError,
  epochMsToIso,
  fail,
  getJson,
  num,
  originOf,
} from './shared.js'

export default {
  id: 'minimax',
  label: 'MiniMax 编程套餐',
  match(providerId, baseUrl) {
    if (/^minimax/i.test(providerId)) return true
    if (typeof baseUrl !== 'string') return false
    return baseUrl.includes('api.minimaxi.com') || baseUrl.includes('api.minimax.io')
  },

  async query({ id, displayName, key, baseUrl }) {
    const origin = originOf(baseUrl) ?? 'https://api.minimaxi.com'
    const { status, body } = await getJson(`${origin}/v1/api/openplatform/coding_plan/remains`, {
      authorization: `Bearer ${key}`,
    })
    if (status === 401 || status === 403) fail(authFailed(status))
    if (status !== 200) fail(describeHttpError(status, body))

    const baseResp = body?.base_resp
    if (baseResp !== undefined && baseResp !== null && num(baseResp?.status_code) !== 0) {
      fail(`MiniMax 业务错误（code ${String(baseResp?.status_code)}）：${String(baseResp?.status_msg ?? '未知错误')}`)
    }

    const remains = Array.isArray(body?.model_remains) ? body.model_remains : []
    const general = remains.find((item) => item?.model_name === 'general')

    const windows = []
    if (general !== undefined) {
      const fiveLeft = clampPercent(general?.current_interval_remaining_percent)
      if (fiveLeft !== undefined) {
        windows.push({
          window: '5 小时窗口',
          percentLeft: fiveLeft,
          resetAt: epochMsToIso(general?.end_time),
        })
      }
      if (num(general?.current_weekly_status) === 1) {
        const weeklyLeft = clampPercent(general?.current_weekly_remaining_percent)
        if (weeklyLeft !== undefined) {
          windows.push({
            window: '每周窗口',
            percentLeft: weeklyLeft,
            resetAt: epochMsToIso(general?.weekly_end_time),
          })
        }
      }
    }

    return account(id, displayName, 'quota', {
      baseUrl: origin,
      windows,
      ...(windows.length === 0 ? { note: '响应里没有可解析的套餐额度（可能未订阅编程套餐）' } : {}),
    })
  },
}

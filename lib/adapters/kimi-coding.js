/**
 * Kimi Coding Plan：GET https://api.kimi.com/coding/v1/usages
 * 没有官方文档，端点由 CodexBar / OpenTokenUsage 等开源项目交叉验证，本地实测可用。
 * 展示口径与 CC Switch 对齐（reference/cc-switch coding_plan.rs:113-205）：
 *   - 5 小时窗口：limits[].detail 的 limit/remaining/resetTime
 *   - 订阅周期（周）窗：usage 的 limit/remaining/resetTime
 * 刻意不展示 boosterWallet（加油包）余额——与 CC Switch 不一致且数据口径存疑（2026-09-14 决定）。
 */
import { account, asIso, describeHttpError, fail, getJson, num, percentLeftOf } from './shared.js'

/** Kimi 的窗口时长：300 分钟 → 5 小时。 */
function durationLabel(duration, unit) {
  if (duration === undefined) return '短窗口'
  if (unit === 'TIME_UNIT_MINUTE') {
    return duration % 60 === 0 ? `${String(duration / 60)} 小时窗口` : `${String(duration)} 分钟窗口`
  }
  if (unit === 'TIME_UNIT_HOUR') return `${String(duration)} 小时窗口`
  if (unit === 'TIME_UNIT_DAY') return `${String(duration)} 天窗口`
  return `${String(duration)} ${unit}`
}

export default {
  id: 'kimi-coding',
  label: 'Kimi Coding',
  match(providerId, baseUrl) {
    if (/^kimi-coding|^kimi-code/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('api.kimi.com/coding')
  },

  async query({ id, displayName, key }) {
    const { status, body } = await getJson('https://api.kimi.com/coding/v1/usages', { authorization: `Bearer ${key}` })
    if (status === 401 || status === 403) fail('API key 无效或没有 Coding Plan 权限')
    if (status !== 200) fail(describeHttpError(status, body))

    const windows = []
    const usage = body?.usage
    if (usage !== undefined && usage !== null) {
      const limit = num(usage.limit)
      // 与 CC Switch 一致：优先直接用上游的 remaining；缺失时才退回 limit-used 推导
      const remaining = num(usage.remaining)
        ?? (limit !== undefined && num(usage.used) !== undefined ? Math.max(0, limit - num(usage.used)) : undefined)
      windows.push({
        window: '订阅周期',
        limit,
        used: num(usage.used),
        remaining,
        percentLeft: percentLeftOf(limit, remaining),
        resetAt: asIso(usage.resetTime),
      })
    }

    const limits = Array.isArray(body?.limits) ? body.limits : []
    for (const entry of limits) {
      const duration = num(entry?.window?.duration)
      const unit = String(entry?.window?.timeUnit ?? '')
      const detail = entry?.detail ?? {}
      const limit = num(detail.limit)
      const used = num(detail.used)
      const remaining = num(detail.remaining) ?? (limit !== undefined && used !== undefined ? Math.max(0, limit - used) : undefined)
      windows.push({
        window: durationLabel(duration, unit),
        limit,
        used,
        remaining,
        percentLeft: percentLeftOf(limit, remaining),
        resetAt: asIso(detail.resetTime),
      })
    }

    const membership = body?.user?.membership?.level
    return account(id, displayName, 'quota', {
      baseUrl: 'https://api.kimi.com/coding',
      ...(typeof membership === 'string' ? { membership } : {}),
      windows,
    })
  },
}

/**
 * Kimi Coding Plan：GET https://api.kimi.com/coding/v1/usages
 * 没有官方文档，端点由 CodexBar / OpenTokenUsage 等开源项目交叉验证，本地实测可用。
 * 展示口径与 CC Switch 对齐。
 *   - 5 小时窗口：limits[].detail 的 limit/remaining/resetTime
 *   - 订阅周期（周）窗：usage 的 limit/remaining/resetTime
 * 刻意不展示 boosterWallet（加油包）余额——与 CC Switch 口径不一致且数据存疑。
 */
import { account, asIso, describeHttpError, fail, getJson, num, percentLeftOf } from './shared.js'
import { asRecord } from '../types.js'
import type { AccountStatus, AdapterQueryInput, BillingAdapter, QuotaWindow } from './shared.js'

/** Kimi 的窗口时长：300 分钟 → 5 小时。 */
function durationLabel(duration: number | undefined, unit: string): string {
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
  match(providerId: string, baseUrl: string | undefined): boolean {
    if (/^kimi-coding|^kimi-code/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('api.kimi.com/coding')
  },

  async query({ id, displayName, key }: AdapterQueryInput): Promise<AccountStatus> {
    const { status, body } = await getJson('https://api.kimi.com/coding/v1/usages', { authorization: `Bearer ${key}` })
    if (status === 401 || status === 403) fail('API key 无效或没有 Coding Plan 权限')
    if (status !== 200) fail(describeHttpError(status, body))

    const record = asRecord(body)
    const windows: QuotaWindow[] = []
    const usage = record['usage']
    if (usage !== undefined && usage !== null) {
      const usageRecord = asRecord(usage)
      const limit = num(usageRecord['limit'])
      const used = num(usageRecord['used'])
      // 与 CC Switch 一致：优先直接用上游的 remaining；缺失时才退回 limit-used 推导
      const remaining = num(usageRecord['remaining'])
        ?? (limit !== undefined && used !== undefined ? Math.max(0, limit - used) : undefined)
      windows.push({
        window: '订阅周期',
        limit,
        used,
        remaining,
        percentLeft: percentLeftOf(limit, remaining),
        resetAt: asIso(usageRecord['resetTime']),
      })
    }

    const limits: unknown[] = Array.isArray(record['limits']) ? record['limits'] : []
    for (const raw of limits) {
      const entry = asRecord(raw)
      const windowRecord = asRecord(entry['window'])
      const duration = num(windowRecord['duration'])
      const unit = String(windowRecord['timeUnit'] ?? '')
      const detail = asRecord(entry['detail'])
      const limit = num(detail['limit'])
      const used = num(detail['used'])
      const remaining = num(detail['remaining']) ?? (limit !== undefined && used !== undefined ? Math.max(0, limit - used) : undefined)
      windows.push({
        window: durationLabel(duration, unit),
        limit,
        used,
        remaining,
        percentLeft: percentLeftOf(limit, remaining),
        resetAt: asIso(detail['resetTime']),
      })
    }

    const membership = asRecord(asRecord(record['user'])['membership'])['level']
    return account(id, displayName, 'quota', {
      baseUrl: 'https://api.kimi.com/coding',
      ...(typeof membership === 'string' ? { membership } : {}),
      windows,
    })
  },
} satisfies BillingAdapter

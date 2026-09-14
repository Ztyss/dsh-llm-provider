/**
 * OpenCode Go（$10/月订阅）：GET https://opencode.ai/zen/go/v1/usage
 * 端点规格来自 CC Switch（coding_plan.rs）：第一方但未文档化，已变形过一次，
 * 所以逐窗口防御解析，缺窗口/percent 不可解析就跳过，不整体失败。
 * 鉴权：只认 Authorization: Bearer（与推理侧 /messages 只认 x-api-key 相反，不能互换）。
 * 错误语义特殊：401 = key 本身无效；403 = key 有效但该 workspace 没订阅 Go，
 *   两者要分开提示。percent 是"已用百分比"（0-100 整数），resetsAt 是 ISO 字符串；
 *   percent 为 0 时上游给的 resetsAt 是占位值，丢弃不展示。
 * base_url 两档 https://opencode.ai/zen/go 与 /zen/go/v1 都命中；按量版 /zen/v1
 *   没有任何用量接口（实测 404），刻意不匹配。
 */
import { account, authFailed, clampPercent, describeHttpError, fail, getJson } from './shared.js'

/** usage 下的窗口 key → 展示名。rolling 对应文档口径 $12/5h。 */
const WINDOW_LABELS = [
  ['rolling', '5 小时滚动窗口'],
  ['weekly', '每周窗口'],
  ['monthly', '每月窗口'],
]

export default {
  id: 'opencode-go',
  label: 'OpenCode Go',
  match(providerId, baseUrl) {
    if (/^opencode-go/i.test(providerId)) return true
    return typeof baseUrl === 'string' && baseUrl.includes('opencode.ai/zen/go')
  },

  async query({ id, displayName, key }) {
    const { status, body } = await getJson('https://opencode.ai/zen/go/v1/usage', {
      authorization: `Bearer ${key}`,
    })
    if (status === 401) fail(authFailed(status))
    // 403：key 有效（Zen 与 Go 共用 workspace key）但没有 Go 订阅，不算凭据失效
    if (status === 403) fail('API key 有效，但该 workspace 没有订阅 OpenCode Go（HTTP 403）')
    if (status !== 200) fail(describeHttpError(status, body))

    const usage = body?.usage
    const windows = []
    if (usage !== undefined && usage !== null) {
      for (const [keyName, label] of WINDOW_LABELS) {
        const window = usage?.[keyName]
        const percent = typeof window?.percent === 'number' ? window.percent : undefined
        if (window === undefined || window === null || percent === undefined) continue
        windows.push({
          window: label,
          percentLeft: clampPercent(100 - percent),
          // percent 为 0 时 resetsAt 是 now+窗口时长 的占位值，丢弃
          ...(percent > 0 && typeof window?.resetsAt === 'string' ? { resetAt: window.resetsAt } : {}),
          ...(window?.status === 'rate-limited' ? { note: '已触发限流' } : {}),
        })
      }
    }

    if (windows.length === 0) fail('响应形态不认识：usage 下没有可解析的额度窗口（未文档化端点可能又改了）')
    return account(id, displayName, 'quota', {
      baseUrl: 'https://opencode.ai/zen/go/v1',
      windows,
    })
  },
}

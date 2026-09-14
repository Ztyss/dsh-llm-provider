/**
 * 计费适配器的共享工具与统一返回结构。
 *
 * 每个适配器一个文件，互相不依赖；对外只暴露一个契约对象：
 *   {
 *     id: 'kimi-coding',            // 适配器 id，也是 CLI 跑测时的名字
 *     label: 'Kimi Coding',
 *     match(providerId, baseUrl) -> boolean,
 *     async query(input) -> AccountStatus,
 *   }
 * input = { id, displayName, key, baseUrl, extras }
 * extras 是插件层塞进来的可选增强参数（当前为空对象，留给将来的纯 key 类增强）。
 *
 * AccountStatus（浏览器端照着渲染，字段全部可选除了标了必填的）：
 *   {
 *     id*, displayName*, kind*,           // kind: 'balance' | 'quota' | 'unsupported'
 *     authConfigured*, baseUrl?, membership?,
 *     balances: [{ label, value }],
 *     windows:  [{ window, limit?, used?, remaining?, percentLeft?, resetAt?, note? }],
 *     note?, error?, fetchedAt*
 *   }
 */

export const TIMEOUT_MS = 12_000

/** 带超时的请求 + JSON 解析；HTTP 状态和响应体一起返回。 */
export async function getJson(url, headers = {}, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await response.text()
  let body = text
  try {
    body = JSON.parse(text)
  } catch {
    /* 保留原始文本，错误信息里能直接看到 */
  }
  return { status: response.status, body }
}

/** 上游把业务错误塞在 200 响应里（GLM 就是这样），统一转成异常。 */
export function fail(message) {
  throw new Error(message)
}

/** 字符串数字也认。 */
export function num(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

/** 由 limit/remaining 反推剩余百分比，比上游的 percentage 字段可靠（那个字段是"已用"）。 */
export function percentLeftOf(limit, remaining) {
  if (limit === undefined || remaining === undefined || limit <= 0) return undefined
  return Math.max(0, Math.min(100, Math.round((remaining / limit) * 1000) / 10))
}

/** 上游直接给"剩余百分比"时用：裁剪到 0-100 并保留一位小数。 */
export function clampPercent(value) {
  const n = num(value)
  if (n === undefined) return undefined
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10))
}

/** 401/403 统一文案：凭据失效类错误，和瞬时网络错误 / 业务错误区分开。 */
export function authFailed(status) {
  return `凭据无效或过期（HTTP ${String(status)}）`
}

/** 上游时间字段有 ISO 字符串，也有 epoch 毫秒，统一成 ISO。 */
export function asIso(value) {
  if (typeof value === 'string' && value !== '') return value
  return epochMsToIso(value)
}

export function epochMsToIso(value) {
  const ms = num(value)
  if (ms === undefined || ms <= 0) return undefined
  return new Date(ms).toISOString()
}

/** 从 baseURL 取 origin；给的是 OpenAI 兼容路径也无所谓，只要域名对。 */
export function originOf(baseUrl) {
  if (baseUrl === undefined || baseUrl === '') return undefined
  try {
    return new URL(baseUrl).origin
  } catch {
    return undefined
  }
}

export function formatAmount(value, currency) {
  const n = num(value)
  if (n === undefined) return String(value ?? '—')
  if (currency === 'USD' || currency === 'usd') return `$${n.toFixed(2)}`
  return `¥${n.toFixed(2)}`
}

/** 上游把错误信息放在各种字段里，尽量提取出人能读的那句。 */
export function describeHttpError(status, body) {
  const message = body?.error?.message ?? body?.message ?? body?.msg
    ?? (typeof body === 'string' ? body.slice(0, 200) : undefined)
  return `HTTP ${String(status)}${message === undefined ? '' : `: ${String(message)}`}`
}

/** 组装一份标准的 AccountStatus 骨架，适配器往里填字段。 */
export function account(id, displayName, kind, fields = {}) {
  return {
    id,
    displayName,
    kind,
    authConfigured: true,
    balances: [],
    windows: [],
    fetchedAt: new Date().toISOString(),
    ...fields,
  }
}

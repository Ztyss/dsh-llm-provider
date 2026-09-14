/**
 * 火山方舟 Agent Plan / Coding Plan：POST https://open.volcengineapi.com/?Action=...&Version=2024-01-01&Region=cn-beijing
 * 端点与签名规格来自 CC Switch（coding_plan.rs）。和其他家不同，用量走的是**控制面
 * OpenAPI** 统一网关（不是数据面推理域名 ark.cn-beijing.volces.com），强制火山签名 V4（AK/SK），
 * 复用推理 Bearer Key 会被网关以 400 InvalidAuthorization 拒绝。
 *
 * 凭据契约：本插件的输入是单个 key，这里约定填 `AK:SK`（AccessKey ID 和 Secret 用冒号拼接），
 *          与推理 API key 是两套凭据。
 * 签名：AWS SigV4 的火山变体，两处致命差异——canonical headers 固定顺序
 *      host;x-date;x-content-sha256;content-type（不排序）；algorithm 串 HMAC-SHA256
 *      （无 AWS4 前缀），密钥派生 SK 不加 AWS4 前缀、终止串 request。
 * 自动探测：先 GetAFPUsage（Agent Plan，回绝对额度 Quota/Used），未订阅再
 *          GetCodingPlanUsage（Coding Plan，回已用百分比）。
 * match 只认 /api/plan 与 /api/coding 两种套餐入口；按量付费的 /api/v3、/api/compatible
 *      没有套餐额度，刻意不匹配。
 */
import { createHash, createHmac } from 'node:crypto'
import {
  account,
  authFailed,
  clampPercent,
  fail,
  getJson,
  num,
  percentLeftOf,
} from './shared.js'

const OPENAPI_HOST = 'open.volcengineapi.com'
const API_VERSION = '2024-01-01'
const DEFAULT_REGION = 'cn-beijing'
const SERVICE = 'ark'
const CONTENT_TYPE = 'application/json; charset=utf-8'
const SIGNED_HEADERS = 'host;x-date;x-content-sha256;content-type'

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest()
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

/** RFC3986 unreserved 之外全部按 %XX 大写编码（canonical query 用）。 */
function uriEncode(input) {
  let out = ''
  for (const ch of input) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch
    else out += `%${Buffer.from(ch, 'utf8').toString('hex').toUpperCase()}`
  }
  return out
}

/** Action/Region/Version 按 key 字母序拼 canonical query；签名与请求 URL 共用同一份。 */
function canonicalQuery(action, region) {
  return [
    ['Action', action],
    ['Region', region],
    ['Version', API_VERSION],
  ]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join('&')
}

/** 生成火山签名 V4 的鉴权头；canonical query 必须与实际请求 URL 逐字一致。now 可注入便于测试。 */
function volcSign(ak, sk, region, query, body, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const xDate = `${String(now.getUTCFullYear())}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
    + `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const shortDate = xDate.slice(0, 8)
  const contentSha = sha256Hex(body)

  // 固定顺序 canonical headers（火山特有，不排序）
  const canonicalHeaders = `host:${OPENAPI_HOST}\nx-date:${xDate}\nx-content-sha256:${contentSha}\ncontent-type:${CONTENT_TYPE}\n`
  const canonicalRequest = `POST\n/\n${query}\n${canonicalHeaders}\n${SIGNED_HEADERS}\n${contentSha}`
  const scope = `${shortDate}/${region}/${SERVICE}/request`
  const stringToSign = `HMAC-SHA256\n${xDate}\n${scope}\n${sha256Hex(canonicalRequest)}`

  // 密钥派生：SK 不加 AWS4 前缀，终止串 request
  const kDate = hmacSha256(sk, shortDate)
  const kRegion = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, SERVICE)
  const kSigning = hmacSha256(kService, 'request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  return {
    authorization: `HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
    xDate,
    contentSha,
  }
}

/** 从数据面 base_url 提取控制面 Region（ark.cn-beijing.volces.com → cn-beijing），识别不出回退默认。 */
function volcRegion(baseUrl) {
  if (typeof baseUrl === 'string' && baseUrl !== '') {
    try {
      const part = new URL(baseUrl).host.split('.').find((p) => p.startsWith('cn-') || p.startsWith('ap-'))
      if (part !== undefined) return part
    } catch {
      /* 落到默认 region */
    }
  }
  return DEFAULT_REGION
}

/** 火山的重置时间：ISO 字符串、epoch 秒/毫秒都兼容；<= 0 视为无重置时间。 */
function volcReset(value) {
  if (typeof value === 'string' && value !== '') return value
  const n = num(value)
  if (n === undefined || n <= 0) return undefined
  return new Date(n < 1e12 ? n * 1000 : n).toISOString()
}

/** 提取 ResponseMetadata.Error（或顶层 Error）信封。 */
function volcError(body) {
  const err = body?.ResponseMetadata?.Error ?? body?.Error
  if (err === undefined || err === null) return undefined
  const code = typeof err?.Code === 'string' ? err.Code : ''
  const message = typeof err?.Message === 'string' ? err.Message : ''
  if (code === '' && message === '') return undefined
  return { code, message }
}

/** 错误码是否属于鉴权类（SignatureDoesNotMatch / AccessDenied / InvalidAuthorization 等）。 */
function isAuthCode(code) {
  const c = code.toLowerCase()
  return ['auth', 'signature', 'accessdenied', 'denied', 'unauthorized', 'forbidden', 'credential', 'token']
    .some((keyword) => c.includes(keyword))
}

/** 单次 OpenAPI 调用的归类：鉴权失败硬停，软错误可继续试另一个 plan，body 交给解析。 */
async function volcCall(ak, sk, region, action) {
  const query = canonicalQuery(action, region)
  const body = ''
  const { authorization, xDate, contentSha } = volcSign(ak, sk, region, query, body)
  const { status, body: respBody } = await getJson(
    `https://${OPENAPI_HOST}/?${query}`,
    {
      'x-date': xDate,
      'x-content-sha256': contentSha,
      'content-type': CONTENT_TYPE,
      authorization,
    },
    { method: 'POST', body },
  )
  if (status === 401 || status === 403) return { kind: 'auth', message: authFailed(status) }
  if (status < 200 || status >= 300) {
    const err = volcError(respBody)
    // 火山网关对签名/凭据类错误常返 4xx（多为 400）并携带同样的 Error 信封
    if (err !== undefined && isAuthCode(err.code)) {
      return { kind: 'auth', message: `${authFailed(status)}（${err.code}）：${err.message}` }
    }
    return {
      kind: 'soft',
      message: `HTTP ${String(status)}${err !== undefined ? `: ${err.code} ${err.message}` : ''}`,
    }
  }
  const err = volcError(respBody)
  if (err !== undefined) {
    if (isAuthCode(err.code)) return { kind: 'auth', message: `凭据无效或过期（${err.code}）：${err.message}` }
    return { kind: 'soft', message: `业务错误（${err.code}）：${err.message}` }
  }
  return { kind: 'body', body: respBody }
}

/** GetAFPUsage：Quota/Used 是绝对 AFP 值；Quota<=0 视为该窗口未启用，也用于识别"未订阅 Agent Plan"。 */
function parseAfpWindows(result) {
  const windows = []
  for (const [key, label] of [['AFPFiveHour', '5 小时窗口'], ['AFPWeekly', '每周窗口'], ['AFPMonthly', '每月窗口']]) {
    const win = result?.[key]
    const quota = num(win?.Quota)
    if (quota === undefined || quota <= 0) continue
    const used = num(win?.Used) ?? 0
    const remaining = Math.max(0, quota - used)
    windows.push({
      window: label,
      limit: quota,
      used,
      remaining,
      percentLeft: percentLeftOf(quota, remaining),
      resetAt: volcReset(win?.ResetTime),
    })
  }
  return windows
}

/** GetCodingPlanUsage：只回已用百分比；窗口名实测是 Level=session/weekly/monthly，其余字段名防御式兜底。 */
function parseCodingWindows(result) {
  const arr = result?.QuotaUsage ?? result?.Usages ?? result?.Details
  if (!Array.isArray(arr)) return []
  const labelMap = new Map([
    ['session', '5 小时窗口'], ['5h', '5 小时窗口'], ['fivehour', '5 小时窗口'],
    ['five_hour', '5 小时窗口'], ['rolling_5h', '5 小时窗口'],
    ['weekly', '每周窗口'], ['week', '每周窗口'], ['7d', '每周窗口'],
    ['monthly', '每月窗口'], ['month', '每月窗口'],
  ])
  const windows = []
  for (const item of arr) {
    const label = item?.Level ?? item?.Type ?? item?.Period ?? item?.Label ?? item?.Window
    const window = typeof label === 'string' ? labelMap.get(label.toLowerCase()) : undefined
    if (window === undefined) continue
    const usedPct = num(item?.Percent) ?? num(item?.UsedPercent) ?? num(item?.UsagePercent) ?? 0
    windows.push({
      window,
      percentLeft: clampPercent(100 - usedPct),
      resetAt: volcReset(item?.ResetTime ?? item?.ResetTimestamp),
    })
  }
  return windows
}

const AKSK_HINT = '请确认 AccessKey ID / Secret 正确，且账号已开通火山方舟用量查询（OpenAPI）权限'

export default {
  id: 'volcengine-ark',
  label: '火山方舟套餐',
  match(providerId, baseUrl) {
    if (/^volcengine|^volc-ark/i.test(providerId)) return true
    if (typeof baseUrl !== 'string') return false
    return baseUrl.includes('volces.com/api/plan') || baseUrl.includes('volces.com/api/coding')
  },

  async query({ id, displayName, key, baseUrl }) {
    const sep = key.indexOf(':')
    if (sep <= 0 || sep === key.length - 1) {
      fail(`火山方舟用量查询需要账号 AccessKey（格式 AK:SK，冒号拼接），不是推理 API key`)
    }
    const ak = key.slice(0, sep).trim()
    const sk = key.slice(sep + 1).trim()
    const region = volcRegion(baseUrl)

    const softErrors = []
    const emptyResponses = []

    // 1) Agent Plan：GetAFPUsage
    const afp = await volcCall(ak, sk, region, 'GetAFPUsage')
    if (afp.kind === 'auth') fail(`${afp.message}。${AKSK_HINT}`)
    if (afp.kind === 'soft') softErrors.push(`GetAFPUsage: ${afp.message}`)
    if (afp.kind === 'body') {
      const result = afp.body?.Result ?? afp.body
      const windows = parseAfpWindows(result)
      if (windows.length > 0) {
        const planType = typeof result?.PlanType === 'string' ? result.PlanType.trim() : ''
        return account(id, displayName, 'quota', {
          baseUrl: `https://${OPENAPI_HOST}`,
          membership: planType === '' ? 'Agent Plan' : `Agent Plan ${planType}`,
          windows,
        })
      }
      emptyResponses.push(`GetAFPUsage=${JSON.stringify(afp.body).slice(0, 700)}`)
    }

    // 2) Coding Plan：GetCodingPlanUsage
    const coding = await volcCall(ak, sk, region, 'GetCodingPlanUsage')
    if (coding.kind === 'auth') fail(`${coding.message}。${AKSK_HINT}`)
    if (coding.kind === 'soft') softErrors.push(`GetCodingPlanUsage: ${coding.message}`)
    if (coding.kind === 'body') {
      const result = coding.body?.Result ?? coding.body
      const windows = parseCodingWindows(result)
      if (windows.length > 0) {
        return account(id, displayName, 'quota', {
          baseUrl: `https://${OPENAPI_HOST}`,
          membership: 'Coding Plan',
          windows,
        })
      }
      emptyResponses.push(`GetCodingPlanUsage=${JSON.stringify(coding.body).slice(0, 700)}`)
    }

    if (softErrors.length > 0) fail(softErrors.join('；'))
    if (emptyResponses.length > 0) {
      fail(`签名已通过但响应里没有可解析的额度（可能未订阅套餐）。原始响应：${emptyResponses.join(' || ')}`)
    }
    fail('该凭据下没有活跃的 Agent Plan 或 Coding Plan 订阅')
  },
}

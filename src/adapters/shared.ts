/**
 * 计费适配器的共享工具与统一契约。
 *
 * 每个适配器一个文件，互相不依赖；对外只暴露 {@link BillingAdapter} 一个对象。
 * 加新 provider = 照 deepseek.ts 写一个文件 + 在 registry.ts 注册一行。
 *
 * 类型在这里一次定死：适配器的返回值直接下发给浏览器渲染，形状错了在编译期就报，
 * 不用等到界面上少一行。
 */
import { asRecord, readNumber, type AnyRecord } from '../types.js'

export const TIMEOUT_MS = 12_000

/** 余额条目（钱包类：多少多少钱）。 */
export interface BalanceRow {
  label: string
  value: string
}

/** 额度窗口（订阅类：5 小时 / 每周用了多少）。 */
export interface QuotaWindow {
  window: string
  limit?: number
  used?: number
  remaining?: number
  percentLeft?: number
  resetAt?: string
  note?: string
}

/** 一个 provider 的额度快照；浏览器端照着渲染。 */
export interface AccountStatus {
  id: string
  displayName: string
  /** balance=钱包余额；quota=订阅额度；unsupported=认得出但查不了 */
  kind: 'balance' | 'quota' | 'unsupported' | 'unknown-provider'
  authConfigured: boolean
  baseUrl?: string
  membership?: string
  balances: BalanceRow[]
  windows: QuotaWindow[]
  note?: string
  error?: string
  fetchedAt: string
  websiteUrl?: string
  keyHint?: string
  /** 控制台 cookie 凭据名（约定 <apiKeyEnv 去尾>_CONSOLE_COOKIE）与是否已配置；给「查询配置」入口用。 */
  consoleCookieRef?: string
  consoleCookieConfigured?: boolean
  /** 是否需要额外查询配置（host 按适配器 queryConfigNeeded(baseUrl) 求值）。 */
  queryConfigNeeded?: boolean
  deletable?: boolean
}

/** 适配器 query 的入参，由插件层组装。 */
export interface AdapterQueryInput {
  id: string
  displayName: string
  key: string | undefined
  baseUrl: string | undefined
  /** 留给将来的纯 key 类增强；当前恒为空对象。 */
  extras: AnyRecord
}

export interface BillingAdapter {
  /** 适配器 id，也是 CLI 跑测时的名字。 */
  id: string
  label: string
  match: (providerId: string, baseUrl: string | undefined) => boolean
  query: (input: AdapterQueryInput) => Promise<AccountStatus>
  /** 该适配器在当前 baseURL 下是否需要额外查询配置（无此方法 = 不需要）。 */
  queryConfigNeeded?: (baseUrl: string | undefined) => boolean
}

/** getJson 的返回：HTTP 状态 + 尽量解析过的响应体。 */
export interface JsonResponse {
  status: number
  body: unknown
}

/** 带超时的请求 + JSON 解析；HTTP 状态和响应体一起返回。 */
export async function getJson(url: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<JsonResponse> {
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* 保留原始文本，错误信息里能直接看到 */
  }
  return { status: response.status, body }
}

/** 上游把业务错误塞在 200 响应里（GLM 就是这样），统一转成异常。 */
export function fail(message: string): never {
  throw new Error(message)
}

/** 字符串数字也认。 */
export function num(value: unknown): number | undefined {
  return readNumber(value)
}

/** 由 limit/remaining 反推剩余百分比，比上游的 percentage 字段可靠（那个字段是"已用"）。 */
export function percentLeftOf(limit: number | undefined, remaining: number | undefined): number | undefined {
  if (limit === undefined || remaining === undefined || limit <= 0) return undefined
  return Math.max(0, Math.min(100, Math.round((remaining / limit) * 1000) / 10))
}

/** 上游直接给"剩余百分比"时用：裁剪到 0-100 并保留一位小数。 */
export function clampPercent(value: unknown): number | undefined {
  const n = num(value)
  if (n === undefined) return undefined
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10))
}

/** 401/403 统一文案：凭据失效类错误，和瞬时网络错误 / 业务错误区分开。 */
export function authFailed(status: number): string {
  return `凭据无效或过期（HTTP ${String(status)}）`
}

/** 上游时间字段有 ISO 字符串，也有 epoch 毫秒，统一成 ISO。 */
export function asIso(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') return value
  return epochMsToIso(value)
}

export function epochMsToIso(value: unknown): string | undefined {
  const ms = num(value)
  if (ms === undefined || ms <= 0) return undefined
  return new Date(ms).toISOString()
}

/** 从 baseURL 取 origin；给的是 OpenAI 兼容路径也无所谓，只要域名对。 */
export function originOf(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined || baseUrl === '') return undefined
  try {
    return new URL(baseUrl).origin
  } catch {
    return undefined
  }
}

export function formatAmount(value: unknown, currency: unknown): string {
  const n = num(value)
  if (n === undefined) return String(value ?? '—')
  if (currency === 'USD' || currency === 'usd') return `$${n.toFixed(2)}`
  return `¥${n.toFixed(2)}`
}

/** 上游把错误信息放在各种字段里，尽量提取出人能读的那句。 */
export function describeHttpError(status: number, body: unknown): string {
  const record = asRecord(body)
  const error = asRecord(record['error'])
  const message = error['message'] ?? record['message'] ?? record['msg']
    ?? (typeof body === 'string' ? body.slice(0, 200) : undefined)
  return `HTTP ${String(status)}${message === undefined ? '' : `: ${String(message)}`}`
}

/** 组装一份标准的 AccountStatus 骨架，适配器往里填字段。 */
export function account(
  id: string,
  displayName: string,
  kind: AccountStatus['kind'],
  fields: Partial<AccountStatus> = {},
): AccountStatus {
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

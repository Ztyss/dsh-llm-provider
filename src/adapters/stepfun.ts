/**
 * StepFun 开放平台（阶跃星辰）：双通道额度查询，按 API 地址自动选择。
 *
 * 通道判定（用户需求：根据实际 API 地址选择查询方式）：
 *   - baseURL 含 step_plan（openai 的 /step_plan/v1、anthropic 的 /step_plan 都算）
 *     → **Step Plan 通道**：查套餐点数，不走钱包；
 *   - 其余（https://api.stepfun.com/v1、anthropic 裸域 https://api.stepfun.com）
 *     → **钱包通道**：GET /v1/accounts —— 预付费钱包余额（剩余/现金/赠金，人民币元）。
 *
 * Step Plan 通道有三道坎：
 *   1. Bearer API key 会被网关拒（403 api key not permitted），必须 Oasis 会话 cookie；
 *   2. node fetch 直接调会被客户端指纹判 "oasis-token is embezzled"，curl（System32
 *      自带，Schannel TLS）可以通过——所以走 spawnSync curl + `-o` 文件输出，不碰管道
 *      （electron 沙禁禁止管道捕获，stdio:'ignore' + 落盘，同 updater 的 tar 先例）；
 *   3. 会话段只有 30 分钟寿命，过期时网关回 "auth failed: token is expired"——
 *      这里**显式 fail**（与 opencode-go 的 401/403 语义一致），卡片按失败展示
 *      「Cookie 已过期」，不再静默降级（用户批注）。
 *
 *   cookie 来源：凭据 <apiKeyEnv 去掉 _API_KEY>_CONSOLE_COOKIE（如 STEPFUN_CONSOLE_COOKIE），
 *   值 = 控制台任意请求的整串 Cookie 头；index.ts 解析后经 extras.consoleCookie 传入，
 *   客户端「查询配置」入口（编辑卡 API 地址旁 + 添加页发现模型旁）负责写入。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { account, asIso, authFailed, clampPercent, describeHttpError, fail, formatAmount, getJson, num, originOf, percentLeftOf, TIMEOUT_MS } from './shared.js'
import { asRecord, readString } from '../types.js'
import type { AccountStatus, AdapterQueryInput, BalanceRow, BillingAdapter, QuotaWindow } from './shared.js'

const CONSOLE_ORIGIN = 'https://platform.stepfun.com'
const PLAN_RATE_LIMIT_RPC = CONSOLE_ORIGIN + '/api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit'
const CONSOLE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'

/** curl 可执行文件：先试 PATH（Git curl / 类Unix 自带），Windows 兜底 System32（Win10 1803+ 自带 Schannel 版）。 */
function curlBin(): string {
  if (spawnSync('curl', ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0) return 'curl'
  if (process.platform === 'win32') return join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'curl.exe')
  return 'curl'
}

/** 秒级 epoch（字符串/数字都认）→ ISO；无效给 undefined。 */
function isoFromEpochSec(value: unknown): string | undefined {
  const sec = num(value)
  return sec !== undefined && sec > 0 ? new Date(sec * 1000).toISOString() : undefined
}

/** QueryStepPlanRateLimit 响应 → 套餐点数窗口（纯函数，可离线测试）。 */
export function planWindowsFrom(body: unknown): QuotaWindow[] {
  const record = asRecord(body)
  const plan = asRecord(record['plan_credit_rate_limit'])
  const windows: QuotaWindow[] = []
  for (const raw of Array.isArray(plan['credit_buckets']) ? plan['credit_buckets'] : []) {
    const bucket = asRecord(raw)
    const total = Number(bucket['credit_total'])
    const residual = Number(bucket['credit_residual'])
    if (!isFinite(total) || !isFinite(residual)) continue
    windows.push({
      window: 'Step Plan 套餐点数' + (bucket['type'] !== undefined ? '（bucket ' + String(bucket['type']) + '）' : ''),
      limit: total,
      remaining: residual,
      percentLeft: percentLeftOf(total, residual),
    })
  }
  // 订阅点数池的重置时间挂在 plan 层，给最后一个 bucket 补上
  const resetAt = isoFromEpochSec(plan['subscription_credit_reset_time'])
  if (resetAt !== undefined && windows.length > 0) windows[windows.length - 1].resetAt = resetAt
  // 五小时 / 周窗口：reset 有效或 rate > 0 才展示（全 0 = 该套餐没有这种窗口）
  const fiveLeft = clampPercent(plan['five_hour_usage_left_rate'])
  const fiveReset = isoFromEpochSec(plan['five_hour_usage_reset_time'])
  if (fiveReset !== undefined || (fiveLeft !== undefined && fiveLeft > 0)) {
    windows.push({ window: '5 小时窗口', percentLeft: fiveLeft, resetAt: fiveReset })
  }
  const weekLeft = clampPercent(plan['weekly_usage_left_rate'])
  const weekReset = isoFromEpochSec(plan['weekly_usage_reset_time'])
  if (weekReset !== undefined || (weekLeft !== undefined && weekLeft > 0)) {
    windows.push({ window: '每周窗口', percentLeft: weekLeft, resetAt: weekReset })
  }
  return windows
}

/**
 * 失败响应 → 人能读的原因（纯函数，可离线测试）。
 * 网关的错误体形如 {"code":"unauthenticated","message":"auth failed: token is expired"}：
 *   - expired  → Cookie 已过期（最常见：会话段 30 分钟寿命）
 *   - illegal / embezzled → Cookie 无效或被设备绑定校验拦下
 *   - 其余 → 原样透出 message / 原文片段
 */
export function planFailureNote(bodyText: string): string {
  let message = ''
  try {
    const record = asRecord(JSON.parse(bodyText))
    const inner = asRecord(record['error'])
    message = String(inner['message'] ?? record['message'] ?? record['desc'] ?? '')
  } catch {
    message = ''
  }
  if (message.includes('expired')) return 'Cookie 已过期：请点「查询配置」重新保存控制台 Cookie'
  if (message.includes('illegal') || message.includes('embezzled')) return 'Cookie 无效或校验失败：请点「查询配置」重新保存控制台 Cookie'
  const short = bodyText.slice(0, 120)
  return 'Step Plan 点数查询失败：' + (message !== '' ? message : short !== '' ? short : '空响应')
}

/**
 * 带控制台 cookie 走 curl 查套餐点数。
 * @returns 成功 = { windows }；失败 = { note }（调用方 fail() 显式报错，用户批注：不静默降级）。
 */
function planQuotaViaCurl(cookie: string): { windows: QuotaWindow[]; note?: string } {
  const outPath = join(tmpdir(), 'stepfun-plan-out.json')
  try {
    const r = spawnSync(curlBin(), [
      '-s', '--max-time', String(Math.ceil(TIMEOUT_MS / 1000)), '-o', outPath,
      '--url', PLAN_RATE_LIMIT_RPC,
      '-H', 'accept: */*',
      '-H', 'connect-protocol-version: 1',
      '-H', 'content-type: application/json',
      '-b', cookie,
      '-H', 'oasis-appid: 10300',
      '-H', 'oasis-platform: web',
      '-H', 'origin: ' + CONSOLE_ORIGIN,
      '-H', 'referer: ' + CONSOLE_ORIGIN + '/account-overview',
      '-H', 'user-agent: ' + CONSOLE_UA,
      '--data-raw', '{}',
    ], { stdio: 'ignore', timeout: TIMEOUT_MS + 5000 })
    if (r.status !== 0) return { windows: [], note: 'Step Plan 点数查询失败：curl 未执行成功（status ' + String(r.status) + '）' }
    const text = readFileSync(outPath, 'utf8')
    if (text.includes('"plan_credit_rate_limit"')) return { windows: planWindowsFrom(text) }
    return { windows: [], note: planFailureNote(text) }
  } catch (error) {
    return { windows: [], note: 'Step Plan 点数查询失败：' + (error instanceof Error ? error.message : String(error)) }
  } finally {
    try { rmSync(outPath, { force: true }) } catch { /* 临时文件，删不掉就算了 */ }
  }
}

export default {
  id: 'stepfun',
  label: 'StepFun 开放平台',
  match(providerId: string, baseUrl: string | undefined): boolean {
    if (/^stepfun/i.test(providerId)) return true
    return typeof baseUrl === 'string' && /stepfun\.(com|ai)/i.test(baseUrl)
  },

  async query({ id, displayName, key, baseUrl, extras }: AdapterQueryInput): Promise<AccountStatus> {
    const origin = originOf(baseUrl)
    // 查询方式按 API 地址自动分通道：含 step_plan = Step Plan 点数；其余 = 预付费钱包
    const isPlanChannel = /step_plan/i.test(baseUrl ?? '')
    const base = origin !== undefined && /stepfun\.(com|ai)/i.test(origin) ? origin : 'https://api.stepfun.com'

    // ---------- Step Plan 通道：套餐点数（控制台 cookie） ----------
    if (isPlanChannel) {
      const consoleCookie = readString(extras['consoleCookie'])
      if (consoleCookie === undefined || consoleCookie === '') {
        return account(id, displayName, 'quota', {
          baseUrl: CONSOLE_ORIGIN,
          balances: [],
          windows: [],
          websiteUrl: 'https://platform.stepfun.com',
          note: '查询方式为 Step Plan：请点「查询配置」保存控制台 Cookie 后刷新',
        })
      }
      const plan = planQuotaViaCurl(consoleCookie)
      // cookie 失效/过期 → 显式 fail（与 opencode-go 的 401/403 语义一致），卡片按失败展示
      if (plan.note !== undefined) fail(plan.note)
      return account(id, displayName, 'quota', {
        baseUrl: CONSOLE_ORIGIN,
        balances: [],
        windows: plan.windows,
        websiteUrl: 'https://platform.stepfun.com',
      })
    }

    // ---------- 钱包通道：预付费余额（API key） ----------
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
      note: balances.length === 0 ? '响应里没有 balance 字段' : undefined,
    })
  },
} satisfies BillingAdapter

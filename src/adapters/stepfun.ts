/**
 * StepFun 开放平台（阶跃星辰）：双通道额度查询，按 API 地址自动选择。
 *
 * 通道判定（用户需求：根据实际 API 地址选择查询方式）：
 *   - baseURL 含 step_plan（openai 的 /step_plan/v1、anthropic 的 /step_plan 都算，域名限 api.stepfun.com）
 *     → **Step Plan 通道**：查套餐点数，不走钱包；
 *   - 其余（https://api.stepfun.com/v1、anthropic 裸域 https://api.stepfun.com）
 *     → **钱包通道**：GET /v1/accounts —— 预付费钱包余额（剩余/现金/赠金，人民币元）。
 *
 * Step Plan 通道的四道坎与解法：
 *   1. Bearer API key 会被网关拒（403 api key not permitted），必须 Oasis 会话 cookie；
 *   2. node fetch 直接调会被客户端指纹判 "oasis-token is embezzled"，curl（System32
 *      自带，Schannel TLS）可以通过——spawnSync curl + `-o` 文件输出，不碰管道
 *      （electron 沙禁禁止管道捕获，stdio:'ignore' + 落盘，同 updater 的 tar 先例）；
 *   3. 会话段（Oasis-Token 前半）只有 30 分钟寿命，过期时网关回 "token is expired"——
 *      **自动续期**：调 passport 的 RefreshToken（/passport/ 前缀，account 网关不通），
 *      用 pair 里的 27 天长效段换新 pair（实测过期 pair 也能换），失败才显式报错；
 *   4. 报错要精确：expired → 「Cookie 已过期」；illegal/embezzled → 「Cookie 无效或
 *      校验失败」（用户批注：不要静默降级，也不要笼统的「无适配器」）。
 *
 * 会话持久化：`$DSH_HOME/llm-provider-bridge/stepfun-console-session.json`
 *   {"cookie":"<整串 Cookie 头>"}。种子来自「查询配置」写入的 CONSOLE_COOKIE 凭据
 *   （extras.consoleCookie 优先），续期轮换后的新 pair 写回该文件，长效段 27 天内
 *   无需人工干预。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { account, asIso, authFailed, clampPercent, describeHttpError, fail, formatAmount, getJson, num, originOf, percentLeftOf, TIMEOUT_MS } from './shared.js'
import { asRecord, readString } from '../types.js'
import { resolveDshHome } from '../dsh-home.js'
import type { AccountStatus, AdapterQueryInput, BalanceRow, BillingAdapter, QuotaWindow } from './shared.js'

const CONSOLE_ORIGIN = 'https://platform.stepfun.com'
const PLAN_RATE_LIMIT_RPC = CONSOLE_ORIGIN + '/api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit'
const REFRESH_RPC = CONSOLE_ORIGIN + '/passport/proto.api.passport.v1.PassportService/RefreshToken'
const CONSOLE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'

/** curl 可执行文件：先试 PATH（Git curl / 类Unix 自带），Windows 兜底 System32（Win10 1803+ 自带 Schannel 版）。 */
function curlBin(): string {
  if (spawnSync('curl', ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0) return 'curl'
  if (process.platform === 'win32') return join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'curl.exe')
  return 'curl'
}

/** 控制台会话文件：{"cookie":"<整串 Cookie 头>"}（安全区内，updater status.json 同目录习惯）。 */
function sessionFile(): string {
  return join(resolveDshHome(), 'llm-provider-bridge', 'stepfun-console-session.json')
}

function loadSessionCookie(): string | undefined {
  try {
    return readString(asRecord(JSON.parse(readFileSync(sessionFile(), 'utf8')))['cookie'])
  } catch {
    return undefined
  }
}

function saveSessionCookie(cookie: string): void {
  try {
    writeFileSync(sessionFile(), JSON.stringify({ cookie }, null, 2) + '\n')
  } catch {
    /* 安全区只读等极端情况：本轮先用内存里的，下轮再试 */
  }
}

/** 用刷新响应轮换 jar 里的 Oasis-Token 段（长效段跟着一起换）。 */
export function withRotatedToken(jar: string, rotatedPair: string): string {
  if (!jar.includes('Oasis-Token=')) return jar
  const replaced = jar.replace(/Oasis-Token=[^;]*/, () => 'Oasis-Token=' + rotatedPair)
  return replaced === jar ? jar : replaced
}

/** 秒级 epoch（字符串/数字都认）→ ISO；无效给 undefined。 */
function isoFromEpochSec(value: unknown): string | undefined {
  const sec = num(value)
  return sec !== undefined && sec > 0 ? new Date(sec * 1000).toISOString() : undefined
}

/** QueryStepPlanRateLimit 响应 → 套餐点数窗口（纯函数，可离线测试）。 */
export function planWindowsFrom(body: unknown): QuotaWindow[] {
  const record = asRecord(typeof body === 'string' ? JSON.parse(body) : body)
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
 *   - expired  → Cookie 已过期（会话段 30 分钟寿命，触发自动续期前置条件）
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

/** 通用 curl POST（JSON，输出落文件；stdio:'ignore' 避开 electron 沙禁的管道捕获）。 */
function curlPostJson(url: string, cookie: string | undefined, body: string, outPath: string): boolean {
  const headers = [
    '-H', 'accept: */*',
    '-H', 'connect-protocol-version: 1',
    '-H', 'content-type: application/json',
    '-H', 'oasis-appid: 10300',
    '-H', 'oasis-platform: web',
    '-H', 'origin: ' + CONSOLE_ORIGIN,
    '-H', 'user-agent: ' + CONSOLE_UA,
  ]
  const args = ['-s', '--max-time', String(Math.ceil(TIMEOUT_MS / 1000)), '-o', outPath, '--url', url, ...headers]
  if (cookie !== undefined && cookie !== '') args.push('-b', cookie)
  args.push('--data-raw', body)
  return spawnSync(curlBin(), args, { stdio: 'ignore', timeout: TIMEOUT_MS + 5000 }).status === 0
}

/** 查套餐点数。成功 = 窗口；失败 = note（分类好的文案）。 */
function planQuotaViaCurl(cookie: string): { windows: QuotaWindow[]; note?: string } {
  const outPath = join(tmpdir(), 'stepfun-plan-out.json')
  try {
    if (!curlPostJson(PLAN_RATE_LIMIT_RPC, cookie, '{}', outPath)) {
      return { windows: [], note: 'Step Plan 点数查询失败：curl 未执行成功' }
    }
    const text = readFileSync(outPath, 'utf8')
    if (text.includes('"plan_credit_rate_limit"')) return { windows: planWindowsFrom(JSON.parse(text)) }
    return { windows: [], note: planFailureNote(text) }
  } catch (error) {
    return { windows: [], note: 'Step Plan 点数查询失败：' + (error instanceof Error ? error.message : String(error)) }
  } finally {
    try { rmSync(outPath, { force: true }) } catch { /* 临时文件，删不掉就算了 */ }
  }
}

/**
 * 用 pair 的长效段换新会话：POST /passport/.../RefreshToken（空体，服务端从 cookie 读 pair）。
 * @returns 轮换后的整串 Cookie 头；失败 undefined。
 */
function refreshSession(jar: string): string | undefined {
  const outPath = join(tmpdir(), 'stepfun-refresh-out.json')
  try {
    if (!curlPostJson(REFRESH_RPC, jar, '{}', outPath)) return undefined
    const body = asRecord(JSON.parse(readFileSync(outPath, 'utf8')))
    const access = readString(asRecord(body['accessToken'])['raw'])
    const refresh = readString(asRecord(body['refreshToken'])['raw'])
    if (access === undefined || refresh === undefined) return undefined
    return withRotatedToken(jar, access + '...' + refresh)
  } catch {
    return undefined
  } finally {
    try { rmSync(outPath, { force: true }) } catch { /* 同上 */ }
  }
}

export default {
  id: 'stepfun',
  label: 'StepFun 开放平台',
  match(providerId: string, baseUrl: string | undefined): boolean {
    // provider id 可改名，不作判据；baseURL 只认 api.stepfun.com。
    return typeof baseUrl === 'string' && /stepfun\.com/i.test(baseUrl)
  },

  queryConfigNeeded(baseUrl: string | undefined): boolean {
    return typeof baseUrl === 'string' && baseUrl.includes('api.stepfun.com') && /step_plan/i.test(baseUrl)
  },

  async query({ id, displayName, key, baseUrl, extras }: AdapterQueryInput): Promise<AccountStatus> {
    const origin = originOf(baseUrl)
    // 查询方式按 API 地址自动分通道：含 step_plan = Step Plan 点数；其余 = 预付费钱包
    const isPlanChannel = /step_plan/i.test(baseUrl ?? '')
    const base = origin !== undefined && /stepfun\.com/i.test(origin) ? origin : 'https://api.stepfun.com'

    // ---------- Step Plan 通道：套餐点数（控制台 cookie + 自动续期） ----------
    if (isPlanChannel) {
      const consoleCookie = readString(extras['consoleCookie'])
      // 手动粘贴（查询配置）优先且作为新种子；否则用上次会话文件里的（含轮换后的 pair）
      let cookie = consoleCookie !== undefined && consoleCookie !== '' ? consoleCookie : loadSessionCookie()
      if (cookie === undefined || cookie === '') {
        return account(id, displayName, 'quota', {
          baseUrl: CONSOLE_ORIGIN,
          balances: [],
          windows: [],
          websiteUrl: 'https://platform.stepfun.com',
          note: '查询方式为 Step Plan：请点「查询配置」保存控制台 Cookie 后刷新',
        })
      }
      if (consoleCookie !== undefined && consoleCookie !== '') saveSessionCookie(consoleCookie)

      let plan = planQuotaViaCurl(cookie)
      if (plan.note !== undefined) {
        // 会话段过期等鉴权失败 → 自动续期一次（长效段 27 天内有效），成功就重试
        const rotated = refreshSession(cookie)
        if (rotated !== undefined) {
          saveSessionCookie(rotated)
          cookie = rotated
          plan = planQuotaViaCurl(cookie)
        }
      }
      // 仍失败 → 显式报错（与 opencode-go 的 401/403 语义一致），卡片按失败展示
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

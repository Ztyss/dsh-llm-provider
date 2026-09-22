/**
 * 适配器命令行跑测器：不改宿主、不起 dsh，直接在终端验证某家的付费接口。
 *
 * 用法：
 *   node lib/adapters/run.js <adapterId|all>          # 查全部窗口
 *   node lib/adapters/run.js kimi-coding --key sk-xx  # 显式给 key
 *
 * key 的解析顺序：--key → 环境变量 → ~/.dsh/.credentials.yaml（按适配器的常规环境变量名猜）。
 * 所有查询都是免费 GET/POST，不消耗额度。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { adapters } from './registry.js'
import type { BillingAdapter } from './shared.js'

/** 命令行参数：`--key` / `--base-url` 各吃一个值，其余进 `_`。 */
interface ParsedArgs {
  _: string[]
  key?: string
  baseUrl?: string
}

/** 各适配器默认试的环境变量名（和 dsh settings.yaml 里 apiKeyEnv 的常规写法一致）。 */
const KEY_ENV_NAMES: Record<string, string[]> = {
  deepseek: ['DEEPSEEK_API_KEY'],
  'kimi-coding': ['KIMI_CODING_API_KEY', 'KIMI_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY', 'MOONSHOT_CN_API_KEY', 'MOONSHOTAI_CN_API_KEY', 'MOONSHOTAI_API_KEY'],
  glm: ['ZAI_CODING_CN_API_KEY', 'ZHIPU_API_KEY', 'GLM_CODING_API_KEY'],
  qwen: ['QWEN_TOKEN_PLAN_CN_API_KEY'],
  minimax: ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY'],
  'opencode-go': ['OPENCODE_API_KEY'],
  zenmux: ['ZENMUX_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  stepfun: ['STEPFUN_API_KEY', 'STEP_API_KEY'],
}

/** 各适配器的默认 baseURL（settings 里通常不写）。 */
const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  'kimi-coding': 'https://api.kimi.com/coding',
  moonshot: 'https://api.moonshot.cn/v1',
  glm: 'https://open.bigmodel.cn',
  minimax: 'https://api.minimaxi.com',
  'opencode-go': 'https://opencode.ai/zen/go/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  stepfun: 'https://api.stepfun.com/v1',
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--key') args.key = argv[++i]
    else if (arg === '--base-url') args.baseUrl = argv[++i]
    else args._.push(arg)
  }
  return args
}

/** 从 ~/.dsh/.credentials.yaml 里找 key（只取值，不回显）。 */
function keyFromCredentials(envName: string): string | undefined {
  try {
    const lines = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8').split('\n')
    const line = lines.find((l) => l.trim().startsWith(`${envName}:`))
    const value = line?.split(':')[1]?.trim()
    return value !== undefined && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}

function resolveKey(adapterId: string, args: ParsedArgs): { key: string | undefined; source: string } {
  if (args.key !== undefined) return { key: args.key, source: '--key' }
  for (const envName of KEY_ENV_NAMES[adapterId] ?? []) {
    if (process.env[envName] !== undefined && process.env[envName] !== '') {
      return { key: process.env[envName], source: envName }
    }
    const fromFile = keyFromCredentials(envName)
    if (fromFile !== undefined) return { key: fromFile, source: `~/.dsh/.credentials.yaml:${envName}` }
  }
  return { key: undefined, source: '没找到' }
}

async function runOne(adapter: BillingAdapter, args: ParsedArgs): Promise<void> {
  const { key, source } = resolveKey(adapter.id, args)
  console.log(`\n== ${adapter.id}（${adapter.label}）==`)
  if (key === undefined) {
    console.log(`  跳过：没有 key（试过 ${JSON.stringify(KEY_ENV_NAMES[adapter.id] ?? [])}）`)
    return
  }
  console.log(`  key 来源: ${source}`)
  try {
    const status = await adapter.query({
      id: adapter.id,
      displayName: adapter.label,
      key,
      baseUrl: args.baseUrl ?? DEFAULT_BASE_URLS[adapter.id],
      extras: {},
    })
    console.log(JSON.stringify(status, null, 2))
  } catch (error) {
    console.log(`  查询失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const args = parseArgs(process.argv.slice(2))
const target = args._[0] ?? 'all'
const picked = target === 'all' ? adapters : adapters.filter((a) => a.id === target)
if (picked.length === 0) {
  console.log(`没有叫 "${target}" 的适配器。可用的：${adapters.map((a) => a.id).join(', ')}（或 all）`)
  process.exit(1)
}
for (const adapter of picked) await runOne(adapter, args)

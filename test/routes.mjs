/**
 * provider 路由发现的单元测试。
 *
 *   node test/routes.mjs
 */
import { labelOf, providerRoutes } from '../lib/routes.js'

let failed = false
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) {
    console.log('  期望:', JSON.stringify(expected))
    console.log('  实际:', JSON.stringify(actual))
    failed = true
  }
}

const piAiSettings = {
  get: (ns) => (ns === 'llm-pi-ai'
    ? { providers: { 'kimi-coding': { apiKeyEnv: 'KIMI_CODING_API_KEY' }, 'zai-coding-cn': { apiKeyEnv: 'ZAI_CODING_CN_API_KEY' } } }
    : undefined),
}
// llm 服务：llm-pi-ai 的目录条目 + 原生 deepseek-official
const llm = {
  listConfigurableProviders: () => [
    { provider: 'kimi-coding', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'kimi-coding'], displayName: 'Kimi Coding' },
    { provider: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], displayName: 'OpenAI' },
    { provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [], displayName: 'DeepSeek' },
  ],
}

const merged = providerRoutes(piAiSettings, '/nonexistent', llm)
check('配置过的 pi-ai 路由都在', [...merged.keys()].sort(), ['kimi-coding', 'zai-coding-cn', 'deepseek-official'].sort())
check('未配置的 catalog provider 不进面板', merged.has('openai'), false)
check('原生路由用已知默认凭据名', merged.get('deepseek-official').apiKeyEnv, 'DEEPSEEK_API_KEY')
check('原生路由带友好名', merged.get('deepseek-official').label, 'DeepSeek 官方')
check('settings 优先于文件兜底', merged.get('kimi-coding').apiKeyEnv, 'KIMI_CODING_API_KEY')

// 场景：llm 服务不可用（老 dsh）→ 只靠 settings
const noLlm = providerRoutes(piAiSettings, '/nonexistent', undefined)
check('llm 缺席时不崩，仍给出 pi-ai 路由', [...noLlm.keys()].sort(), ['kimi-coding', 'zai-coding-cn'])

// 场景：settings 读不到（README 记录的命名空间未注册 bug）→ 退回读文件；文件不存在则空
const fileFallback = providerRoutes(undefined, '/nonexistent-dsh-home', llm)
check('settings 与文件都没有时仍能给出原生路由', [...fileFallback.keys()], ['deepseek-official'])

// 场景：settings.get 抛错
const throwing = providerRoutes({ get: () => { throw new Error('boom') } }, '/nonexistent-dsh-home', llm)
check('settings 抛错被吞掉且不影响原生路由', [...throwing.keys()], ['deepseek-official'])

check('labelOf 已知 provider 用中文名', labelOf('zai-coding-cn'), 'GLM Coding（智谱国内）')
check('labelOf 未知 provider 按 id 拼', labelOf('my-gateway'), 'My Gateway')

console.log(failed ? '\n有失败用例' : '\n路由发现测试全部通过')
if (failed) process.exitCode = 1

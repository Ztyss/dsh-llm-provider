/**
 * provider 路由发现的单元测试：路由从哪来，以及 route 声明的模型能力怎么并进模型详情。
 *
 *   node test/routes.mjs
 */
import { labelOf, providerRoutes } from '../lib/routes.js'
import { collectRouteModels, enrichModelDetails, mergeRouteModels, readResolvedModel } from '../lib/model-details.js'

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
    ? { providers: { 'kimi-coding': { apiKeyEnv: 'KIMI_CODING_API_KEY', api: 'anthropic-messages' }, 'zai-coding-cn': { apiKeyEnv: 'ZAI_CODING_CN_API_KEY' } } }
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

const merged = providerRoutes(piAiSettings, llm)
check('配置过的 pi-ai 路由都在', [...merged.keys()].sort(), ['kimi-coding', 'zai-coding-cn', 'deepseek-official'].sort())
check('未配置的 catalog provider 不进面板', merged.has('openai'), false)
check('原生路由用已知默认凭据名', merged.get('deepseek-official').apiKeyEnv, 'DEEPSEEK_API_KEY')
check('原生路由带友好名', merged.get('deepseek-official').label, 'DeepSeek')
check('get() 给出的凭据名带上了', merged.get('kimi-coding').apiKeyEnv, 'KIMI_CODING_API_KEY')
check('settings 里的协议带到路由上（卡片展开体要展示）', merged.get('kimi-coding').api, 'anthropic-messages')
check('settings 没写协议就是 undefined，不编造', merged.get('zai-coding-cn').api, undefined)
check('原生路由没有协议', merged.get('deepseek-official').api, undefined)

// 场景：llm 服务不可用（老 dsh）→ 只靠 settings
const noLlm = providerRoutes(piAiSettings, undefined)
check('llm 缺席时不崩，仍给出 pi-ai 路由', [...noLlm.keys()].sort(), ['kimi-coding', 'zai-coding-cn'])

// 场景：老用户配过官方 llm-deepseek，目录里因此多一条 deepseek-official；插件的 config
// 已经声明了 pi-ai 的 deepseek——同一家只留一张卡，不能冒出 deepseek-official
const withPiAiDeepseek = {
  get: () => ({ providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', api: 'openai-completions' } } }),
}
check('pi-ai 已在服务这家时不再补原生那一条',
  [...providerRoutes(withPiAiDeepseek, llm).keys()].sort(), ['deepseek'])
check('没有 pi-ai 那一条时原生路由照旧出来（patch 没生效、或用户删掉了它）',
  [...providerRoutes({ get: () => ({ providers: {} }) }, llm).keys()].sort(), ['deepseek-official'])

// 场景：命名空间没注册（get() 取不到）→ 退回 section()，它直接读 dsh 解析好的文档
const documentOnly = {
  get: () => undefined,
  section: (ns) => (ns === 'llm-pi-ai' ? { providers: { 'moonshotai-cn': { apiKeyEnv: 'MOONSHOTAI_CN_API_KEY' } } } : undefined),
}
check('命名空间没注册时退回 section()', [...providerRoutes(documentOnly, llm).keys()].sort(), ['moonshotai-cn', 'deepseek-official'].sort())

// 场景：get() 有值就用它——它是合并后的结果，含插件 config base 层那条 deepseek，
// 而 section() 只有用户写过的那些，拿它当首选会漏掉 DeepSeek
const bothWays = {
  get: () => ({ providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' } } }),
  section: () => ({ providers: { 'kimi-coding': { apiKeyEnv: 'KIMI_CODING_API_KEY' } } }),
}
check('get() 优先于 section()', [...providerRoutes(bothWays, undefined).keys()], ['deepseek'])

// 场景：两条路都拿不到 → 只剩原生路由
check('两条路都空时仍能给出原生路由', [...providerRoutes(undefined, llm).keys()], ['deepseek-official'])

// 场景（内核 0.1.7+）：settings 服务表单化——get/section 已移除，describe() 是唯一读法。
// 实测症状：0.1.7 上旧读法全空，额度面板报「没有发现可查额度的 provider」。
const formBased = {
  describe: () => [
    { ns: 'other-entry', value: { providers: { nope: { apiKeyEnv: 'NOPE' } } } },
    {
      ns: 'llm-pi-ai',
      value: { providers: { 'zai-coding-cn': { apiKeyEnv: 'ZAI_CODING_CN_API_KEY', api: 'anthropic-messages' }, deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' } } },
      user: { providers: { 'zai-coding-cn': { apiKeyEnv: 'ZAI_CODING_CN_API_KEY' } } },
    },
  ],
}
const formMerged = providerRoutes(formBased, llm)
// 注：fixture 的 pi-ai 段里已有 deepseek → 原生 deepseek-official 按跨源去重规则被吞掉（见上面的用例）
check('0.1.7 表单式 describe() 里的路由都读出来', [...formMerged.keys()].sort(), ['zai-coding-cn', 'deepseek'].sort())
check('describe() 路径同样带上凭据名与协议', [formMerged.get('zai-coding-cn').apiKeyEnv, formMerged.get('zai-coding-cn').api], ['ZAI_CODING_CN_API_KEY', 'anthropic-messages'])
check('describe() 里别的条目不会被误读', formMerged.has('nope'), false)

// 场景：describe() 在但 value 空（用户层另有值）→ 退 user 层
const formUserOnly = { describe: () => [{ ns: 'llm-pi-ai', value: { providers: {} }, user: { providers: { 'kimi-coding': { apiKeyEnv: 'KIMI_CODING_API_KEY' } } } }] }
check('describe() 的 value 空时退 user 层', [...providerRoutes(formUserOnly, undefined).keys()], ['kimi-coding'])

// 场景：describe() 在但整体取空（迁移还没跑完/条目未激活）→ 继续退 get()/section()（0.1.5 双保险）
const formEmptyLegacyFull = {
  describe: () => [{ ns: 'llm-pi-ai', value: { providers: {} }, user: { providers: {} } }],
  get: () => ({ providers: { 'kimi-coding': { apiKeyEnv: 'KIMI_CODING_API_KEY' } } }),
}
check('describe() 取空时继续退回 get()（跨内核双保险）', [...providerRoutes(formEmptyLegacyFull, undefined).keys()], ['kimi-coding'])

// 场景：describe() 抛错 → 吞掉后仍能走 get()
const formThrows = {
  describe: () => { throw new Error('remote only') },
  get: () => ({ providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' } } }),
}
check('describe() 抛错被吞，退回 get()', [...providerRoutes(formThrows, undefined).keys()], ['deepseek'])

// 场景：get() 和 section() 都抛（section 对非对象节会抛 TypeError）
const throwing = { get: () => { throw new Error('boom') }, section: () => { throw new TypeError('must be an object') } }
check('两条路抛错都被吞掉且不影响原生路由', [...providerRoutes(throwing, llm).keys()], ['deepseek-official'])

check('labelOf 已知 provider 用 pi-ai 名', labelOf('zai-coding-cn'), 'Z.AI Coding CN')
check('labelOf 未知 provider 按 id 拼', labelOf('my-gateway'), 'My Gateway')

// ---- 能力徽章：自定义模型 id 拿不到「视觉」徽章（详情要按 route 声明 > pi-ai 目录 > 未知取）----
// 现状是**只有一条链路**：/provider/models 只读 pi-ai 的 providers 数据文件，而用户在 settings 里
// route 的 `models[].input` 声明的自定义模型 id（就是 opencode-go/deepseek-flash 这种）在目录里
// 根本不存在——实测拿那个 id 去 grep <pi-ai>/dist/providers/data 是 0 命中，于是「能识图却没徽章」，
// 而且失败是静默的。下面测的是补第二条链路的那几个函数。
/** 本段几乎全是「是/不是」，给 check 一个短写法。 */
function ok(name, cond) {
  check(name, cond === true, true)
}

// pi-ai 目录读出来的详情。注意 claude-opus-5 在目录里跨 provider 重名——实测它同时属于
// anthropic / cloudflare-ai-gateway / openrouter 等 7 家，客户端按 id 单键索引会被后读到的那份盖掉。
const catalogDetails = [
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', api: 'openai-responses', vision: false, video: false, reasoning: true, thinkingLevels: [] },
  { id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'anthropic', api: 'anthropic-messages', vision: true, video: false, reasoning: true, thinkingLevels: ['high'] },
  { id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'cloudflare-ai-gateway', api: 'openai-completions', vision: false, video: false, reasoning: false, thinkingLevels: [] },
]

// ① route 声明优先，且目录里没有的自定义模型要补得进来（这正是「越是自定义越拿不到徽章」那条）
const declared = mergeRouteModels(catalogDetails, [
  { provider: 'opencode-go', id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', input: ['text', 'image'], contextWindow: 1000000, maxTokens: 384000 },
])
const custom = declared.find((detail) => detail.id === 'deepseek-flash')
ok('自定义模型 id 进了详情（目录里查不到也有条目，徽章才有地方挂）', custom !== undefined)
ok('能力取自 route 声明的 input：视觉 true、视频 false', custom !== undefined && custom.vision === true && custom.video === false)
ok('合并后原有详情一条不少', declared.length === catalogDetails.length + 1)

// ② route 声明覆盖目录里同 provider 同 id 的那条
const overridden = mergeRouteModels(catalogDetails, [
  { provider: 'anthropic', id: 'claude-opus-5', input: ['text'] },
  { provider: 'cloudflare-ai-gateway', id: 'claude-opus-5', input: ['text', 'image'] },
])
ok('route 说没有视觉就按没有（覆盖目录里的 true）',
  overridden.find((detail) => detail.provider === 'anthropic' && detail.id === 'claude-opus-5')?.vision === false)
ok('同名模型在另一家独立取值，不互相覆盖',
  overridden.find((detail) => detail.provider === 'cloudflare-ai-gateway' && detail.id === 'claude-opus-5')?.vision === true)
ok('同名模型分属两家时仍是两条（按 id 去重就会丢一条）',
  overridden.filter((detail) => detail.id === 'claude-opus-5').length === 2)

// ③ 目录次之：route 没声明模态（适配器没回 inputModalities）就沿用目录
const fromCatalog = mergeRouteModels(catalogDetails, [{ provider: 'anthropic', id: 'claude-opus-5' }])
ok('route 没声明模态时沿用 pi-ai 目录的能力', fromCatalog.find((detail) => detail.provider === 'anthropic')?.vision === true)

// ④ 都查不到 = 未知：留 undefined，不能猜成「不支持」（未知与明确不支持在界面上是两回事）
const unknownCaps = mergeRouteModels([], [{ provider: 'some-gateway', id: 'mystery', input: [] }])
ok('两条链路都没说 → 能力留 undefined（未知，不是 false）',
  unknownCaps.length === 1 && unknownCaps[0].vision === undefined && unknownCaps[0].video === undefined
    && unknownCaps[0].reasoning === undefined)
ok('空模态表不当成「没有视觉」：那是没声明，不是不支持', unknownCaps[0]?.vision !== false)
ok('不改入参（详情缓存跨请求复用，改坏了会串味）', catalogDetails.length === 3 && catalogDetails[1].vision === true)

// 目录里没有的模型：窗口/输出上限/思考档位只能从 resolveModelInfo 的产出认
const resolvedModel = readResolvedModel('opencode-go', 'deepseek-flash', {
  provider: 'opencode-go',
  id: 'deepseek-flash',
  name: 'DeepSeek V4.1 Flash',
  context: { contextWindow: 1000000 },
  defaultMaxTokens: 384000,
  reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'max', name: 'Max' }], defaultEffort: 'max' },
})
ok('解析结果里的上下文窗口带过来', resolvedModel.contextWindow === 1000000)
ok('解析结果里的输出上限带过来', resolvedModel.maxTokens === 384000)
ok('解析结果里的思考档位带过来', resolvedModel.reasoning === true && resolvedModel.thinkingLevels.join(',') === 'off,max')
const noLevels = readResolvedModel('x', 'y', { context: { contextWindow: 100 } })
ok('适配器没回思考档位 = 已知不支持思考（false，不是未知）', noLevels.reasoning === false && noLevels.thinkingLevels === undefined)
ok('形状不对的解析结果不编数字', readResolvedModel('x', 'y', { context: {} }).contextWindow === undefined)

// 收 route 模型：单条 route 拿不到不能拖垮整批（settings 里写了路由、适配器没起来就是这样）
const fakeLlm = {
  listModels: async (provider) => {
    if (provider === 'broken') throw new Error('pi-ai adapter does not own provider "broken"')
    if (provider === 'opencode-go') return [{ provider, id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', inputModalities: ['text', 'image'] }]
    return [{ provider, id: 'gpt-5', name: 'GPT-5', inputModalities: ['text'] }]
  },
  resolveModelInfo: async (provider, model) => ({
    provider, id: model, context: { contextWindow: 128000 }, defaultMaxTokens: 8192, reasoning: { efforts: [] },
  }),
}
const collected = await collectRouteModels(fakeLlm, ['opencode-go', 'broken', 'openai'])
ok('route 抛错时跳过它，其余照收', collected.map((model) => model.provider).sort().join(',') === 'openai,opencode-go')
ok('inputModalities 收到模型上', collected.find((model) => model.provider === 'opencode-go')?.input?.join(',') === 'text,image')

const enriched = await enrichModelDetails(catalogDetails, fakeLlm, ['opencode-go', 'broken', 'openai'])
const enrichedCustom = enriched.find((detail) => detail.provider === 'opencode-go' && detail.id === 'deepseek-flash')
ok('端到端：自定义模型带上视觉能力', enrichedCustom !== undefined && enrichedCustom.vision === true)
ok('端到端：目录里没有的模型补上解析出来的窗口/输出上限',
  enrichedCustom?.contextWindow === 128000 && enrichedCustom?.maxTokens === 8192)
ok('端到端：目录里已有的模型不重复解析，能力仍以 route 声明为准',
  enriched.find((detail) => detail.provider === 'openai')?.vision === false)

// 老宿主（llm 服务上没有这两个方法）：原样返回 pi-ai 目录的详情，不崩也不猜
const withoutApi = await enrichModelDetails(catalogDetails, {}, ['opencode-go'])
ok('llm 没这两个方法时原样返回，能力不受影响', withoutApi.length === 3 && withoutApi.every((detail) => detail.vision !== undefined))

// resolveModelInfo 抛错：能力仍在（有出处），窗口字段留空（没出处就不编数字）
const resolveFails = {
  listModels: async (provider) => [{ provider, id: 'deepseek-flash', inputModalities: ['text', 'image'] }],
  resolveModelInfo: async () => { throw new Error('INVALID_CONFIG') },
}
const degraded = await enrichModelDetails([], resolveFails, ['opencode-go'])
ok('解析失败时能力照旧（来自 route 声明）', degraded.length === 1 && degraded[0].vision === true)
ok('解析失败时窗口/输出上限留空',
  degraded.length === 1 && degraded[0].contextWindow === undefined && degraded[0].maxTokens === undefined)

console.log(failed ? '\n有失败用例' : '\n路由发现测试全部通过')
if (failed) process.exitCode = 1

/**
 * 本地版补丁的离线回归测试（本机新增，不属于上游）。
 *
 *   node test/local-patches.mjs
 *
 * 覆盖四件事：
 *   1. issue #2 —— 月窗口标签：每月窗口 → 30d（不能再被 `每` 吞成 7d）；
 *   2. issue #5 —— 能力链路：withDeclaredModels 用路由声明补齐目录查不到的模型；
 *   3. issue #5 —— 索引口径：详情按 provider+id 查，同名模型不串家；
 *   4. issue #1/#4 —— 客户端仍能加载、桥接页在停用更新时给出对应行。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    实际: ${JSON.stringify(actual)}\n    期望: ${JSON.stringify(expected)}`}`)
}

// ---- 浏览器端：真跑 lib/client.js（假 __ModuleLoader__ + 桩 react）----
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
let captured
globalThis.window = { __ModuleLoader__: { load: (config) => { captured = config } } }
const reactStub = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'createElement') return (type, props, ...children) => ({ type, props, children })
    if (prop === 'useState') return (initial) => [initial, () => {}]
    if (prop === 'useRef') return () => ({ current: null })
    if (prop === 'useMemo') return (fn) => fn()
    if (prop === 'useCallback') return (fn) => fn
    return () => {}
  },
})
new Function('window', 'document', 'fetch', 'setInterval', source)(
  globalThis.window,
  { querySelector: () => null, createElement: () => ({ dataset: {}, style: {} }), head: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
  () => Promise.reject(new Error('离线测试不发请求')),
  () => 0,
)
const client = captured.factory((name) => (name === 'react' ? reactStub : {}))

// 1. issue #2：窗口短名
check('#2 每月窗口 → 30d', client.shortWindowLabel('每月窗口'), '30d')
check('#2 每周窗口 → 7d', client.shortWindowLabel('每周窗口'), '7d')
check('#2 5 小时滚动窗口 → 5h', client.shortWindowLabel('5 小时滚动窗口'), '5h')
check('#2 订阅周期 → 7d', client.shortWindowLabel('订阅周期'), '7d')
check('#2 monthly → 30d', client.shortWindowLabel('monthly window'), '30d')

// 1b. 窗口组之间的分隔线：5h ｜ 7d ｜ 30d（三档 = 两条分割线）
const chips = client.headlineChips({
  id: 'opencode-go',
  windows: [
    { window: '5 小时滚动窗口', percentLeft: 100, resetAt: new Date(Date.now() + 3600e3).toISOString() },
    { window: '每周窗口', percentLeft: 65, resetAt: new Date(Date.now() + 3 * 864e5).toISOString() },
    { window: '每月窗口', percentLeft: 8, resetAt: new Date(Date.now() + 6 * 864e5).toISOString() },
  ],
})
check('#2 三档窗口的分割线数量 = 2', chips.filter((chip) => chip.sep === true).length, 2)
check('#2 三档窗口的顺序与分割线位置', chips.map((chip) => (chip.sep === true ? '|' : chip.label)).join(' '), '5h | 7d | 30d')
check('#2 只有 5h+订阅时仍是一条分割线', client.headlineChips({
  id: 'x',
  windows: [
    { window: '5 小时滚动窗口', percentLeft: 90, resetAt: undefined },
    { window: '订阅周期', percentLeft: 40, resetAt: undefined },
  ],
}).map((chip) => (chip.sep === true ? '|' : chip.label)).join(' '), '5h | 7d')
check('#2 输入乱序也规整成 5h→7d→30d', client.headlineChips({
  id: 'y',
  windows: [
    { window: '每月窗口', percentLeft: 8, resetAt: undefined },
    { window: '5 小时滚动窗口', percentLeft: 100, resetAt: undefined },
    { window: '每周窗口', percentLeft: 65, resetAt: undefined },
  ],
}).map((chip) => (chip.sep === true ? '|' : chip.label)).join(' '), '5h | 7d | 30d')

// 3. issue #5：详情索引按 provider+id
const map = {
  ['opencode-go/glm-5.1']: { id: 'glm-5.1', provider: 'opencode-go', vision: false, source: 'pi-ai' },
  ['zai-coding-cn/glm-5.1']: { id: 'glm-5.1', provider: 'zai-coding-cn', vision: true, source: 'pi-ai' },
}
check('#5 同名模型按 provider 分开查（opencode-go）', client.lookupDetail(map, 'opencode-go', 'glm-5.1').vision, false)
check('#5 同名模型按 provider 分开查（zai-coding-cn）', client.lookupDetail(map, 'zai-coding-cn', 'glm-5.1').vision, true)
check('#5 裸 id 兜底还在', client.lookupDetail({ 'x': { id: 'x', vision: true } }, 'any', 'x').vision, true)
check('#5 detailsOfProvider 只吐该家的', client.detailsOfProvider(map, 'opencode-go').length, 1)

// 4. pi-ai 桥接页：缺省（未拨开关）只留版本一行；开关 OFF 有已下载文件时有明确文案
const rows = client.piAiBridgeRows({ active: true, piAiVersion: '0.85.1', source: 'dsh' })
check('#4 缺省（未传 piAi）只留版本一行且标官方', rows.length === 1 && rows[0].value, '0.85.1 (official)')
check('#4 OFF 且未下载时无文案（默认态不复读）', client.piAiUpstreamText({ preference: 'dsh' }), undefined)
check('#4 已下载未启用时英文明确提示', client.piAiUpstreamText({ preference: 'dsh', safeVersions: ['0.86.0'] }), '0.86.0 downloaded (not in use)')
check('#4 开关勾态跟随 preference', client.piAiToggleState({ preference: 'latest' }).enabled, true)
check('#4 下载中态开关忙碌', client.piAiToggleState({ preference: 'latest', download: { at: 'x', version: '0.86.0', lines: [] } }).downloading, true)

// ---- 宿主端：真跑 lib/model-details.js ----
const { withDeclaredModels, modelKey } = await import(new URL('../lib/model-details.js', import.meta.url).href)
const declared = withDeclaredModels([], [{
  id: 'opencode-go',
  api: 'openai-completions',
  baseURL: 'https://opencode.ai/zen/go/v1',
  // 就是本机 settings.yaml 里那条：别名 id（pi-ai 目录里只有 deepseek-v4-flash）
  models: [{
    id: 'deepseek-flash',
    name: 'DeepSeek V4.1 Flash',
    contextWindow: 1000000,
    maxTokens: 384000,
    input: ['text', 'image'],
    reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
  }],
}])
const entry = declared.find((detail) => detail.id === 'deepseek-flash')
check('#5 目录没收录的声明模型被补齐', entry !== undefined, true)
check('#5 声明的视觉能力生效（视觉徽标的前提）', entry.vision, true)
check('#5 上下文/最大输出来自声明', [entry.contextWindow, entry.maxTokens], [1000000, 384000])
check('#5 推理档位来自 reasoningEfforts', entry.thinkingLevels, ['low', 'high', 'max'])
check('#5 标出来源是声明', entry.source, 'declared')
check('#5 provider 归到这条路由', entry.provider, 'opencode-go')

// 目录里已有的不接受声明覆盖（上游权威）
const both = withDeclaredModels(
  [{ id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', provider: 'zai-coding-cn', api: 'openai-completions', vision: true, video: false, reasoning: true, thinkingLevels: [], source: 'pi-ai' }],
  [{ id: 'zai-coding-cn', models: [{ id: 'glm-5.3-flash', input: ['text'] }] }],
)
check('#5 目录命中的不重复添加', both.length, 1)
check('#5 目录命中的保留目录元数据', both[0].source, 'pi-ai')
check('#5 provider+id 键分隔符稳定', modelKey('a', 'b'), 'a\u0000b')

// 声明条目的 reasoning:true 点亮已收录模型的推理徽标（用户批注：编辑器勾推理、清单页不亮）
const pinned = withDeclaredModels(
  [
    { id: 'step-5-preview', name: 'Step 5 Preview', provider: 'stepfun', api: 'openai-completions', vision: true, video: false, reasoning: false, thinkingLevels: [], source: 'adapter' },
    { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', provider: 'zai-coding-cn', api: 'openai-completions', vision: true, reasoning: true, thinkingLevels: [], source: 'pi-ai' },
  ],
  [
    { id: 'stepfun', models: [{ id: 'step-5-preview', input: ['text', 'image'], reasoning: true }] },
    { id: 'opencode-go', models: [{ id: 'glm-5.3-flash', reasoning: true }] },
  ],
)
const stepPin = pinned.find((detail) => detail.provider === 'stepfun' && detail.id === 'step-5-preview')
check('声明 reasoning 点亮本家已收录模型的推理', stepPin.reasoning, true)
check('点亮不改来源', stepPin.source, 'adapter')
// 同名模型只有别家有详情：本路由补 qualified 影子，别家的原详情不被顶掉
const shadow = pinned.find((detail) => detail.provider === 'opencode-go' && detail.id === 'glm-5.3-flash')
check('跨家同名补 qualified 影子且点亮推理', shadow !== undefined && shadow.reasoning === true, true)
check('影子标记为声明', shadow.source, 'declared')
const zaiOrigin = pinned.find((detail) => detail.provider === 'zai-coding-cn' && detail.id === 'glm-5.3-flash')
check('别家的原详情原样保留', zaiOrigin.source, 'pi-ai')

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)

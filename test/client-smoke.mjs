/**
 * 浏览器端的离线冒烟测试：用假 __ModuleLoader__ + 桩 react + 桩 ctx，
 * 验证 apply() 的接线段（注册了哪些槽位、id、组件是不是函数）。
 * 真正的 UI 行为要在浏览器里看。
 *
 *   node test/client-smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

let captured
globalThis.window = {
  __ModuleLoader__: {
    load(config) {
      captured = config
    },
  },
}

// 桩 react：组件定义阶段只会引用这些名字，不真的渲染
const reactStub = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'createElement') return (type, props, ...children) => ({ type, props, children })
    if (prop === 'useState') return (initial) => [initial, () => {}]
    if (prop === 'useRef') return () => ({ current: null })
    if (prop === 'useMemo') return (fn) => fn()
    if (prop === 'useCallback') return (fn) => fn
    return () => {}
  },
})

// document 桩提到全局：包内模块（i18n 判 <html lang>、styles 挂样式）读的是全局 document，
// 只塞进 new Function 的形参它们看不到。lang 一开始就是 'zh-CN'——本文件既有断言写的是中文原文。
const documentStub = {
  documentElement: { lang: 'zh-CN' },
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {} }),
  head: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.document = documentStub

// 执行脚本本体（它自己调 window.__ModuleLoader__.load）
new Function('window', 'document', 'fetch', 'setInterval', source)(
  globalThis.window,
  documentStub,
  () => Promise.reject(new Error('smoke test 不发请求')),
  () => 0,
)

const moduleExports = captured.factory((name) => (name === 'react' ? reactStub : {}))

// 语言先钉在中文：本文件既有断言写的是中文原文（localT 从 <html lang> 判语言，
// 而冒烟环境的 document 是桩、lang 缺席时默认英文）。下面的 i18n 段落会显式切到 en 再切回来。
function useLang(lang) {
  document.documentElement.lang = lang
}
useLang('zh-CN')

/** 跑一次 apply，可用 commandDuplicate 模拟「官方 /model 命令还在」的场景。 */
function runApply(commandDuplicate) {
  const registrations = []
  const slotInjects = []
  const injectedServices = []
  let commandRegistered = false
  let registeredContribution

  const effect = (fn) => {
    const disposer = fn()
    return typeof disposer === 'function' ? disposer : () => {}
  }
  // 桩：sessions 服务。真机上它是插件 inject 列表的第一条，所以 ctx.inject 的每个 scope 上
  // 都直接有它（cordis 按依赖表解析）。/model 的 available 就靠它判「被寻址成子代理的会话
  // 不能用模型选择」——所以桩必须给，否则那条分支永远测不到（会落进「服务缺席→放行」的兜底）。
  const sessions = {
    subagentAddress(sessionId) {
      return sessionId === 'child-1' ? { parent: 'root' } : undefined
    },
    binding: () => ({ session: { projections: { faceOf: () => undefined } } }),
  }
  const scope = {
    effect,
    sessions,
    slots: {
      inject(name, callback) {
        slotInjects.push(name)
        callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
    inject(names, callback) {
      injectedServices.push(names.join(','))
      if (names.includes('commandUi')) {
        callback({
          commandUi: {
            register(contribution) {
              if (commandDuplicate) throw new Error('ui-commands: duplicate contribution for /model')
              commandRegistered = true
              registeredContribution = contribution
              return () => {}
            },
          },
          sessions,
          effect,
        })
      }
      if (names.includes('modelDirectories')) {
        // 桩：官方目录服务。组件不在这里渲染，只要求注册期拿得到 directoryFor 形状。
        callback({
          modelDirectories: {
            directoryFor: () => ({
              store: { getSnapshot: () => ({ current: null, groups: [], status: 'idle' }) },
              load: () => Promise.resolve(),
              select: () => Promise.resolve(),
            }),
          },
          slots: scope.slots,
          effect,
        })
      }
    },
  }
  // 真机上的 ctx 是 cordis 代理：取没 inject 的服务属性直接抛
  // （"cannot get property \"styles\" without inject"）。桩必须照这个行为来，否则
  // 「把 ctx.styles 的读取挪到 try 外面」这种改动测不出来——那一抛会让整个插件加载失败。
  const ctx = { effect, slots: scope.slots, inject: scope.inject }
  Object.defineProperty(ctx, 'styles', {
    get() {
      throw new Error('cannot get property "styles" without inject')
    },
  })
  moduleExports.apply(ctx)
  return { registrations, slotInjects, injectedServices, commandRegistered, registeredContribution }
}

// 场景 1：官方 /model 还在（同名注册会抛）——插件必须静默让位，其余座位照常
const duplicated = runApply(true)
// 场景 2：官方行被禁用（名字空出来）——我们的 /model 应该注册成功
const free = runApply(false)

const registrations = duplicated.registrations
const slotInjects = duplicated.slotInjects
const injectedServices = duplicated.injectedServices

console.log('loader id:', captured.id)
console.log('exports:', Object.keys(moduleExports).join(', '))
console.log('inject:', JSON.stringify(moduleExports.inject))
console.log('slots.inject 调用:', slotInjects.join(' | '))
console.log('ctx.inject 调用:', injectedServices.join(' | '))
console.log('注册的座位:')
for (const registration of registrations) {
  const { name, id, order, priority, label } = registration.options
  console.log(`  - ${name} (id=${String(id)}, order=${String(order)}, priority=${String(priority)}, label=${typeof label === 'function' ? label() : String(label)}) component=${typeof registration.component}`)
  if (typeof registration.component !== 'function') throw new Error(`${name} 的组件不是函数`)
}

const expected = ['conversation.input.model', 'settings.section']
for (const name of expected) {
  if (!registrations.some((r) => r.options.name === name)) {
    throw new Error(`没有注册预期的座位：${name}`)
  }
}
const seat = registrations.find((r) => r.options.name === 'conversation.input.model')
if (typeof seat.component !== 'function') throw new Error('模型座位组件不可用')
// 座位靠 priority 遮蔽官方占用者（官方用默认 0），必须是负值
if (!(typeof seat.options.priority === 'number' && seat.options.priority < 0)) {
  throw new Error(`模型座位没有设置遮蔽用的负 priority：${String(seat.options.priority)}`)
}

// 命令注册的两条路径
if (duplicated.commandRegistered) throw new Error('官方 /model 还在时不该抢注册')
if (!free.commandRegistered) throw new Error('官方行禁用后我们的 /model 应该注册成功')

// ---- F-#7（issue #7）：/model 贡献必须带官方契约必填的 available ----
// 官方 CommandUiRuntime.candidates() 对注册表里每一条贡献都直接调 `contribution.available(session)`
// （dsh-client-ui-commands/lib/client.js），没有防御。漏了它，那一抛会打挂整个 `/` 候选列表
// （不是只挂 /model）：source 失败 → 一组候选不剩 → 菜单自动关闭 → composer 左下那枚「＋」
// 点了没反应、打 `/` 也不弹。
let contractFailures = 0
function contractCheck(name, cond) {
  console.log((cond ? '  ok ' : '  FAIL ') + name)
  if (!cond) contractFailures += 1
}
const contrib = free.registeredContribution
contractCheck('/model 贡献对象已捕获', contrib !== undefined)
if (contrib !== undefined) {
  contractCheck('贡献带 available', typeof contrib.available === 'function')
  contractCheck('贡献 name 是 model', contrib.name === 'model')
  contractCheck('贡献 ui 是 popupSelect', contrib.ui !== undefined && contrib.ui.kind === 'popupSelect')
  if (typeof contrib.available === 'function') {
    // 真机的调用形状是**只传一个 session**（官方 candidates() 就这么调），所以这里也这么调：
    // sessions 面从闭包里的 scope 取，不是从第二个参数取。
    contractCheck('普通会话可用', contrib.available({ sessionId: 's1' }) === true)
    contractCheck('子代理会话不可用', contrib.available({ sessionId: 'child-1' }) === false)
    contractCheck('会话缺 sessionId 时放行', contrib.available({}) === true)
  }
}

// ---- F-#8（issue #8）：额度卡片头部按窗口档位分组，组与组之间都要有分割线 ----
// 旧实现只分「5 小时」与「其余」两桶、只插一条分割线，于是 7d 与 30d 挤在一起像同一组的两个值。
const { headlineChips } = moduleExports
function win(name, percent, resetAt) {
  return { window: name, percentLeft: percent, resetAt }
}
const sepCount = (chips) => chips.filter((c) => c.sep === true).length
const textsOf = (chips) => chips.filter((c) => c.sep !== true).map((c) => c.label + ':' + c.text)

const three = headlineChips({
  id: 'opencode-go',
  windows: [win('5 小时窗口', 100, '2030-01-01T00:00:00Z'), win('每周窗口', 65, '2030-01-01T00:00:00Z'), win('每月窗口', 8, '2030-01-01T00:00:00Z')],
})
contractCheck('三档窗口画两条分割线（7d 与 30d 之间也要有）', sepCount(three) === 2)
contractCheck('三档窗口顺序 5h → 7d → 30d', textsOf(three).join(',') === '5h:100%,7d:65%,30d:8%')
contractCheck('分割线夹在组之间（不在末尾）', three[three.length - 1].sep !== true)

const two = headlineChips({
  id: 'opencode-go',
  windows: [win('5 小时窗口', 100, '2030-01-01T00:00:00Z'), win('每周窗口', 65, '2030-01-01T00:00:00Z')],
})
contractCheck('只有两档时仍是一条分割线（空组不画线）', sepCount(two) === 1)

const shuffled = headlineChips({
  id: 'opencode-go',
  windows: [win('每月窗口', 8, '2030-01-01T00:00:00Z'), win('5 小时窗口', 100, '2030-01-01T00:00:00Z'), win('每周窗口', 65, '2030-01-01T00:00:00Z')],
})
contractCheck('上游乱序也规整成 5h → 7d → 30d', textsOf(shuffled).join(',') === '5h:100%,7d:65%,30d:8%')
contractCheck('乱序时分割线数量不变', sepCount(shuffled) === 2)

const unknownWindow = headlineChips({
  id: 'x',
  windows: [win('订阅周期', 50, '2030-01-01T00:00:00Z'), win('随便什么窗口', 40, '2030-01-01T00:00:00Z'), win('每月窗口', 8, '2030-01-01T00:00:00Z')],
})
contractCheck('认不出的窗口名不丢，仍按出现顺序出现', unknownWindow.filter((c) => c.sep !== true).length === 3)
contractCheck('认不出的窗口与已知档之间也有分割线', sepCount(unknownWindow) === 2)

const monthlyOnly = headlineChips({ id: 'x', windows: [win('每月窗口', 8, '2030-01-01T00:00:00Z')] })
contractCheck('只有一档时不画分割线', sepCount(monthlyOnly) === 0)
contractCheck('每月窗口不再被显示成 7d', textsOf(monthlyOnly).join(',') === '30d:8%')

if (contractFailures > 0) throw new Error(`契约/分割线断言有 ${contractFailures} 条没过`)

// ---- 「pi-ai 桥接」标签页的明细行（纯函数，不渲染）----
const { piAiBridgeRows, piAiUpstreamText, reasoningTextOf, defaultEffortOf, normalizeSelection } = moduleExports
let failures = 0
function rowsCheck(name, cond) {
  console.log((cond ? '  ok ' : '  FAIL ') + name)
  if (!cond) failures += 1
}

const healthy = piAiBridgeRows(
  { active: true, piAiVersion: '0.85.1', source: 'dependency', rejected: [] },
  { latest: '0.85.1', lastCheck: new Date().toISOString() },
)
rowsCheck('健康的桥接只出一行版本', healthy.length === 1)
rowsCheck('版本行带来源档位', healthy[0].value === '0.85.1（兜底依赖）')
rowsCheck('版本行带来源说明', typeof healthy[0].title === 'string' && healthy[0].title.length > 0)

const fellBack = piAiBridgeRows(
  { active: true, piAiVersion: '0.85.1', source: 'dependency', rejected: [{ version: '0.86.0', error: '不提供导出 createModels' }] },
  { latest: '0.86.0' },
)
const skipRow = fellBack.find((r) => r.key === 'skip-0')
rowsCheck('被跳过的版本单列一行', skipRow !== undefined)
rowsCheck('跳过行带警告色', skipRow.warn === true)
rowsCheck('跳过行把原因挂在 title 上', skipRow.title === '不提供导出 createModels')

const pending = piAiBridgeRows(
  { active: true, piAiVersion: '0.85.1', source: '0.85.1' },
  { latest: '0.86.0', pending: '0.86.0' },
)
rowsCheck('待生效版本提示重启', pending.some((r) => r.key === 'pending' && r.text.indexOf('重启 dsh') !== -1))
rowsCheck('已下载档标成「已下载」', pending[0].value === '0.85.1（已下载）')

const rejectedByUpdater = piAiBridgeRows(
  { active: true, piAiVersion: '0.85.1', source: '0.85.1' },
  { latest: '0.87.0', rejected: { version: '0.87.0', error: '子路径没了' } },
)
rowsCheck('体检没过的那版也列出来', rejectedByUpdater.some((r) => r.key === 'rejected' && r.title === '子路径没了'))

const broken = piAiBridgeRows({ active: false, error: '没有能用的 pi-ai：…' }, undefined)
rowsCheck('桥接挂掉时只报错误行', broken.length === 1 && broken[0].bad === true)
rowsCheck('没有 bridge 时不出行', piAiBridgeRows(undefined, undefined).length === 0)

rowsCheck('没检查过上游时说「未检查」', piAiUpstreamText(undefined) === '上游 未检查')
rowsCheck('检查过就报版本号', piAiUpstreamText({ latest: '0.86.0', lastCheck: new Date().toISOString() }).indexOf('0.86.0') !== -1)

// ---- 推理等级文案（纯函数，不渲染）----
// 目录收录的是 listProviders 报上来的路由，会话里存着的 provider 可能不在其中（原生路由缺席、
// 模型下线的历史会话）：这时档位表拿不到，但会话已经定下的档位必须照显示，否则整段强度会是空的。
const efforts = { efforts: ['low', 'high', 'max'], default: 'high' }
rowsCheck('会话定了档位就显示该档位', reasoningTextOf('max', efforts, 'high') === 'Max')
rowsCheck('会话没定档位时落目录默认档', reasoningTextOf(undefined, efforts, 'high') === 'High')
rowsCheck('目录没默认档也没档位表时给「Default」', reasoningTextOf(undefined, { efforts: [] }, undefined) === 'Default')
rowsCheck('目录里没有这个模型时照会话档位显示', reasoningTextOf('max', undefined, undefined) === 'Max')
rowsCheck('档位表是 null 也照会话档位显示', reasoningTextOf('low', null, undefined) === 'Low')
rowsCheck('目录里没有这个模型、会话也没定档位时不显示', reasoningTextOf(undefined, undefined, undefined) === undefined)

// ---- 默认档位与目录默认选择（纯函数，不渲染）----
// 官方口径：`current.reasoningEffort ?? reasoning.defaultEffort`——目录没声明默认档就显示
// 「Default」（官方 zh/en 字典里都是这个字面值），不能拿档位表首档顶替（那等于替用户选了一个他没选过的档位）。
rowsCheck('目录声明了默认档就用它', defaultEffortOf({ reasoning: { efforts: ['low', 'high'], default: 'high' } }) === 'high')
rowsCheck('目录没声明默认档时不用首档兜底', defaultEffortOf({ reasoning: { efforts: ['low', 'high'] } }) === undefined)
rowsCheck('没有档位表就没有默认档', defaultEffortOf({ reasoning: undefined }) === undefined)
rowsCheck('模型不存在时没有默认档', defaultEffortOf(undefined) === undefined)

// 目录 RPC 里的宿主默认选择：没有目录服务的实例靠它兜底（官方 current 的另一半）
rowsCheck('目录默认选择原样读出', normalizeSelection({ provider: 'deepseek', model: 'v4', reasoningEffort: 'max' }).reasoningEffort === 'max')
rowsCheck('默认选择没档位时就是没有档位', normalizeSelection({ provider: 'deepseek', model: 'v4' }).reasoningEffort === undefined)
rowsCheck('默认选择形状不对当作没有', normalizeSelection({ provider: 'deepseek' }) === undefined)
rowsCheck('默认选择为空当作没有', normalizeSelection(null) === undefined)

// ---- 共享额度快照的广播（设置页刷新/删除后，座位指示器与 /model 命令要立刻跟上）----
const { onPlanChange, mergePlanAccount, dropPlanAccount } = moduleExports
const broadcasts = []
const stopListening = onPlanChange((payload) => { broadcasts.push(payload) })

mergePlanAccount({ id: 'kimi-coding', balances: [{ label: '余额', value: '¥1.00' }], windows: [], fetchedAt: 'a' })
rowsCheck('单卡刷新会广播新快照', broadcasts.length === 1)
rowsCheck('快照里没有这一家时补上（不是丢掉）', Array.isArray(broadcasts[0].accounts) && broadcasts[0].accounts.some((a) => a.id === 'kimi-coding'))

mergePlanAccount({ id: 'kimi-coding', balances: [{ label: '余额', value: '¥2.00' }], windows: [], fetchedAt: 'b' })
const same = broadcasts[1].accounts.filter((a) => a.id === 'kimi-coding')
rowsCheck('同一家再刷是原地覆盖', broadcasts.length === 2 && same.length === 1 && same[0].balances[0].value === '¥2.00')

dropPlanAccount('kimi-coding')
rowsCheck('删除某家也会广播且把它剔掉', broadcasts.length === 3 && broadcasts[2].accounts.every((a) => a.id !== 'kimi-coding'))

stopListening()
mergePlanAccount({ id: 'deepseek', balances: [], windows: [], fetchedAt: 'c' })
rowsCheck('退订之后不再收到', broadcasts.length === 3)

// ---- 「添加供应商」下拉的选中状态 / 刷新结果判定（纯函数，不渲染）----
// 路由配好了但没密钥（deepseek 由插件 config 声明，天生就是这个样子）时不能禁选：
// 禁选之后用户既加不了新的，卡片上也没地方补 key。
const { presetPickState, refreshFailure } = moduleExports
const fresh = presetPickState({ id: 'kimi-coding', label: 'Kimi' })
rowsCheck('没配过的预设可选、无标记', fresh.disabled === false && fresh.tag === null)
const donePick = presetPickState({ id: 'kimi-coding', label: 'Kimi', configured: true })
rowsCheck('配好且密钥在 → 禁选并标已配置', donePick.disabled === true && donePick.tag === '已配置')
const keylessPick = presetPickState({ id: 'deepseek', label: 'DeepSeek', configured: true, missingKey: true })
rowsCheck('配了但缺密钥 → 可选并标缺密钥', keylessPick.disabled === false && keylessPick.tag === '缺密钥')

// 宿主 refresh/test 一律回 200，成败看 body 的 ok：没配 key 时 ok=false、原因在 account.error。
// 只判 account 在不在，就会在"未配置 key"的卡片上弹一句"✓ 余量已刷新"。
rowsCheck('ok:true 算成功', refreshFailure({ ok: true, account: { id: 'deepseek' } }) === undefined)
rowsCheck('没密钥时把原因带出来',
  refreshFailure({ ok: false, account: { error: 'DEEPSEEK_API_KEY 没有值' } }) === 'DEEPSEEK_API_KEY 没有值')
rowsCheck('缺 ok 但有 account.error 也算失败', refreshFailure({ account: { error: '解析失败' } }) === '解析失败')
rowsCheck('既没 ok 也没原因时给兜底文案', refreshFailure(undefined) === '未知错误')

// ---- 老 provider id 的别名（会话里记着 deepseek-official 的那些）----
// 官方 llm-deepseek 时代的会话记的是 deepseek-official，那条路由已经被本插件接管掉了：
// 不折的话宿主 prompt() 会直接拒（no adapter serves provider …），连消息都发不出去。
const { aliasSelection } = moduleExports
const catalog = [
  { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', reasoning: { efforts: ['low', 'high', 'max'], default: 'high' } }] },
]
rowsCheck('老 id + 模型都在目录里 → 折到现在的路由',
  JSON.stringify(aliasSelection({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }, catalog))
    === JSON.stringify({ provider: 'deepseek', model: 'deepseek-v4-flash' }))
rowsCheck('档位在新模型支持时带过去',
  aliasSelection({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max' }, catalog).reasoningEffort === 'max')
rowsCheck('档位在新模型没有时丢掉（两套适配器档位表不一定一致）',
  aliasSelection({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'minimal' }, catalog).reasoningEffort === undefined)
rowsCheck('目标 provider 不在目录里 → 原样返回，不乱指',
  aliasSelection({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }, [{ id: 'kimi-coding', name: 'Kimi', models: [] }]).provider === 'deepseek-official')
rowsCheck('模型对不上 → 原样返回',
  aliasSelection({ provider: 'deepseek-official', model: 'deepseek-v2' }, catalog).provider === 'deepseek-official')
rowsCheck('目录还没加载时不折', aliasSelection({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }, undefined).provider === 'deepseek-official')
rowsCheck('不是别名的原样返回',
  aliasSelection({ provider: 'kimi-coding', model: 'kimi-k2' }, catalog).provider === 'kimi-coding')
rowsCheck('没有选择时还是 undefined', aliasSelection(undefined, catalog) === undefined)

// ---- issue #3：删除前的配置导出 ----
// 删除一次做两件事（清路由 + 清凭据）且不可撤销，手写配置一起没。导出是界面上唯一
// 成本够低的补救，所以它有两条硬要求：内容要能贴回 settings.yaml，且**绝不能带出密钥值**
// （浏览器端本来就拿不到真值，只能拿到掩码——导出里出现真值就说明哪里的边界破了）。
const { routeYamlOf } = moduleExports
const exported = routeYamlOf({
  id: 'opencode-go',
  displayName: 'OpenCode Go',
  api: 'openai-completions',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
  keyHint: 'sk-****abcd',
})
rowsCheck('导出以 provider id 开头（能直接贴回 providers 段）', exported.trim().indexOf('opencode-go:') !== -1)
rowsCheck('导出带 api', exported.indexOf('api: openai-completions') !== -1)
rowsCheck('导出带 baseURL', exported.indexOf('baseURL: https://opencode.ai/zen/go/v1') !== -1)
rowsCheck('导出带凭据名', exported.indexOf('apiKeyEnv: OPENCODE_GO_API_KEY') !== -1)
rowsCheck('导出不含掩码密钥值', exported.indexOf('sk-') === -1)
rowsCheck('导出提醒凭据值没带出来', exported.indexOf('凭据值不导出') !== -1)
const minimal = routeYamlOf({ id: 'x' })
rowsCheck('字段缺省时不瞎补空值', minimal.indexOf('api:') === -1 && minimal.indexOf('baseURL:') === -1)
rowsCheck('缺省时仍以 id 开头', minimal.trim().split('\n').pop() === 'x:' || minimal.indexOf('x:') !== -1)

// ---- issue #1（顺带报的写入路径坑）：添加/更新供应商不能整段覆盖已有 route ----
// 宿主 applyPathOp 对「路径正好到对象本身」的 set 是整段替换，对带字段名的 set 是
// `{...child, [field]: value}`。原来发的是前者，于是对一个已有 route 点一次「确认添加」，
// 手写的 models / compat.thinkingFormat / retryPolicy 会跟着一起消失。这里把「路径必须带
// 字段名」钉成断言：它就是那个数据丢失洞的根因，改回整段 set 会立刻变红。
const { providerSaveOps, isRouteConfigured } = moduleExports
const saveOps = providerSaveOps('opencode-go', {
  api: 'openai-completions',
  baseURL: 'https://opencode.ai/zen/go/v1',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
})
rowsCheck('每个 op 的路径都带字段名（不是整段 set）', saveOps.every((op) => Array.isArray(op.path) && op.path.length === 3))
rowsCheck('没有一个指向 route 对象本身的 op', saveOps.every((op) => op.path.length !== 2))
rowsCheck('op 都落在同一段 providers.<id> 下',
  saveOps.every((op) => op.path[0] === 'providers' && op.path[1] === 'opencode-go'))
rowsCheck('三个字段都写', saveOps.map((op) => op.path[2]).join(',') === 'api,baseURL,apiKeyEnv')
rowsCheck('值来自表单', saveOps.find((op) => op.path[2] === 'baseURL').value === 'https://opencode.ai/zen/go/v1')
const trimmedOps = providerSaveOps('x', { api: 'a', baseURL: '  https://y/z  ', apiKeyEnv: ' K ' })
rowsCheck('baseURL 与凭据名去掉首尾空白',
  trimmedOps.find((op) => op.path[2] === 'baseURL').value === 'https://y/z'
    && trimmedOps.find((op) => op.path[2] === 'apiKeyEnv').value === 'K')
const emptyOps = providerSaveOps('x', { api: '', baseURL: 'https://y', apiKeyEnv: '' })
rowsCheck('空字段不发 op（不把已有的值抹成空串）', emptyOps.length === 1 && emptyOps[0].path[2] === 'baseURL')
rowsCheck('全空时一个 op 都不发', providerSaveOps('x', {}).length === 0)

rowsCheck('预设里标了 configured 才算已配置',
  isRouteConfigured([{ id: 'kimi-coding', configured: true }], 'kimi-coding') === true)
rowsCheck('预设里没有这条就不算已配置',
  isRouteConfigured([{ id: 'kimi-coding', configured: true }], 'other') === false)
rowsCheck('configured 不是 true 不算已配置',
  isRouteConfigured([{ id: 'kimi-coding', configured: false }], 'kimi-coding') === false)
rowsCheck('清单拿不到时不瞎认已配置', isRouteConfigured(undefined, 'kimi-coding') === false)

// ---- 能力徽章：详情按 provider + id 索引，能力未知不打徽章 ----
// 详情索引原来用模型 id 单键，而跨 provider 重名在 pi-ai 目录里是常态（实测 claude-opus-5 同时
// 属于 anthropic / cloudflare-ai-gateway 等 7 家），后读到的那份会盖掉前面那家；能力字段则只有
// pi-ai 目录一条链路，自定义模型 id 查不到就永远没有「视觉」徽章（详情卡也不会出）。
const { detailKeyOf, indexModelDetails, capabilityBadges, capabilityKeysOf, capabilitiesKnown, modelRow, modelTip } = moduleExports

/** 把 react 桩造出来的元素树拍成文本：只为了断言行里 / 卡片上写了什么。 */
function flattenText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && Array.isArray(node.children)) return flattenText(node.children)
  return ''
}

const capsApi = [detailKeyOf, indexModelDetails, capabilityBadges, capabilitiesKnown, modelRow, modelTip]
rowsCheck('provider+id 索引与能力判定的纯函数都导出了（离线可测）', capsApi.every((fn) => typeof fn === 'function'))

const detailPayload = [
  { id: 'claude-opus-5', provider: 'anthropic', name: 'Claude Opus 5', vision: true, video: false, reasoning: true, thinkingLevels: ['high'], contextWindow: 200000 },
  { id: 'claude-opus-5', provider: 'cloudflare-ai-gateway', name: 'Claude Opus 5', vision: false, video: false, reasoning: false, thinkingLevels: [], contextWindow: 100000 },
  { id: 'deepseek-flash', provider: 'opencode-go', name: 'DeepSeek V4.1 Flash', vision: true, video: false, contextWindow: 1000000, maxTokens: 384000 },
]
const indexed = typeof indexModelDetails === 'function' ? indexModelDetails(detailPayload) : {}
const detailAt = (provider, id) => (typeof detailKeyOf === 'function' ? indexed[detailKeyOf(provider, id)] : undefined)

rowsCheck('同名模型两家各是一条，互不覆盖',
  detailAt('anthropic', 'claude-opus-5')?.contextWindow === 200000
    && detailAt('cloudflare-ai-gateway', 'claude-opus-5')?.contextWindow === 100000)
rowsCheck('形状不对的条目跳过（不塞半条进索引）',
  typeof indexModelDetails === 'function'
    && Object.keys(indexModelDetails([{ id: 'x' }, null, 'y', { provider: 'p', id: 'z' }])).length === 1)

const rowText = (model, account) => (typeof modelRow === 'function' ? flattenText(modelRow(model, account, indexed)) : '')
rowsCheck('自定义模型（route 声明了 image）拿得到「视觉」徽章',
  rowText({ id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' }, { id: 'opencode-go' }).indexOf('视觉') !== -1)
rowsCheck('同名模型在没视觉的那家不出视觉徽章（不串味）',
  rowText({ id: 'claude-opus-5', name: 'Claude Opus 5' }, { id: 'cloudflare-ai-gateway' }).indexOf('视觉') === -1)
rowsCheck('同名模型在有视觉的那家照旧出徽章',
  rowText({ id: 'claude-opus-5', name: 'Claude Opus 5' }, { id: 'anthropic' }).indexOf('视觉') !== -1)

const unknownDetail = { id: 'mystery', provider: 'some-gateway' }
const tipText = (model, account, detail) => (typeof modelTip === 'function' ? flattenText(modelTip(model, account, detail)) : '')
rowsCheck('能力未知时不打任何徽章（未知不能渲染成「无视觉」）',
  typeof capabilityBadges === 'function' && capabilityBadges(unknownDetail).length === 0
    && typeof capabilitiesKnown === 'function' && capabilitiesKnown(unknownDetail) === false)
rowsCheck('能力未知时详情卡注明「能力未知」',
  tipText({ id: 'mystery', name: 'Mystery', contextWindow: 8000 }, { id: 'some-gateway' }, unknownDetail).indexOf('能力未知') !== -1)
rowsCheck('详情卡没有窗口时兜底到目录里的值',
  tipText({ id: 'mystery', name: 'Mystery', contextWindow: 8000 }, { id: 'some-gateway' }, unknownDetail)
    .indexOf((8000).toLocaleString('en-US')) !== -1)
rowsCheck('明确不支持（reasoning:false）照旧写「关闭」，不写成未知',
  tipText({ id: 'claude-opus-5', name: 'Claude Opus 5' }, { id: 'cloudflare-ai-gateway' }, detailAt('cloudflare-ai-gateway', 'claude-opus-5')).indexOf('关闭') !== -1)
rowsCheck('完全没详情时照旧说明没有本地元数据',
  tipText({ id: 'mystery', name: 'Mystery' }, { id: 'some-gateway' }, undefined).indexOf('该模型没有本地元数据') !== -1)

if (failures > 0) throw new Error(`桥接明细有 ${failures} 条断言没过`)

// ---- i18n：字典完整性 + 插值辅助 + 纯函数的双语输出 ----
// 这套断言的口径：文案一律由 t() 现取、不在模块顶层缓存——所以切 <html lang> 再调同一个纯函数，
// 输出必须跟着变。官方 locale 服务缺席时 localT 是权威（apply 里 bind 优先），这里测的正是兜底路径。
const { LOCAL_DICT, localT, tf, shortWindowLabel, relativeTime, resetCountdownText } = moduleExports
let i18nFailures = 0
function i18nCheck(name, cond) {
  console.log((cond ? '  ok ' : '  FAIL ') + name)
  if (!cond) i18nFailures += 1
}
/** 有没有汉字：英文文案里混进汉字 = 字典漏译，最典型的漏法。 */
function hasHan(text) {
  return /[\u4e00-\u9fff]/.test(String(text))
}
/** 造一条「体检没过被跳过」的桥接行（zh/en 两边都要看同一条）。 */
function skipRowOf() {
  const rows = piAiBridgeRows(
    { active: true, piAiVersion: '0.85.1', source: 'dependency', rejected: [{ version: '0.86.0', error: 'x' }] },
    undefined,
  )
  return rows.find((r) => r.key === 'skip-0')
}

// 1) 字典完整性：键集合一致 + 两边非空 + 中文侧带汉字 / 英文侧不残留汉字
const zhKeys = Object.keys(LOCAL_DICT.zh).sort()
const enKeys = Object.keys(LOCAL_DICT.en).sort()
const missingInEn = zhKeys.filter((k) => enKeys.indexOf(k) === -1)
const missingInZh = enKeys.filter((k) => zhKeys.indexOf(k) === -1)
i18nCheck('zh/en 键集合一致（英文缺键 = 英文环境露中文）'
  + (missingInEn.length > 0 ? '；en 缺 ' + missingInEn.join(',') : '')
  + (missingInZh.length > 0 ? '；zh 缺 ' + missingInZh.join(',') : ''),
  missingInEn.length === 0 && missingInZh.length === 0)
i18nCheck('键数量非零且 zh/en 相等', zhKeys.length > 0 && zhKeys.length === enKeys.length)
const emptyKeys = zhKeys.filter((k) => String(LOCAL_DICT.zh[k]).trim() === '' || String(LOCAL_DICT.en[k]).trim() === '')
i18nCheck('每个 key 在 zh 与 en 都非空' + (emptyKeys.length > 0 ? '；空值 ' + emptyKeys.join(',') : ''), emptyKeys.length === 0)
const hanInEn = enKeys.filter((k) => hasHan(LOCAL_DICT.en[k]))
i18nCheck('en 值里不残留汉字' + (hanInEn.length > 0 ? '；漏译 ' + hanInEn.join(',') : ''), hanInEn.length === 0)
;['nav', 'tabProviders', 'addProvider'].forEach((key) => {
  i18nCheck('保留原有 key：' + key, LOCAL_DICT.zh[key] !== undefined && LOCAL_DICT.en[key] !== undefined)
})

// 2) 语言判定：localT 以 <html lang> 为准（zh 开头才中文，否则英文）
useLang('zh-Hans-CN')
const zhNav = localT('nav')
useLang('en-US')
const enNav = localT('nav')
i18nCheck('localT 跟随 <html lang> 切换',
  zhNav === LOCAL_DICT.zh.nav && enNav === LOCAL_DICT.en.nav && zhNav !== enNav)

// 3) 插值辅助 tf(key, params)：模板取字典值，{name} 逐处替换（上一段停在 en，切回中文再断）
useLang('zh-CN')
i18nCheck('tf 正常替换', typeof tf === 'function' && tf('toast.refreshed', { name: 'Kimi' }) === 'Kimi 余量已刷新')
i18nCheck('tf 参数值也过 t()（嵌套 key 不露原文）',
  typeof tf === 'function' && tf('quota.remaining', { percent: 30 }) === '余 30%')
i18nCheck('tf 多处占位都替换',
  typeof tf === 'function' && tf('m.noMatch', { query: 'k2' }) === '没有匹配「k2」的模型')
// 缺参是**原样留着占位符**（不是静默删掉，也不是 undefined）：漏传时文案里直接看得见 {name}，
// 比悄悄少一段字好排查。undefined/null 则当空串——那是显式传了个空值，不是漏传。
i18nCheck('tf 缺参原样留占位符、不出 undefined',
  typeof tf === 'function' && tf('toast.refreshed', {}) === '{name} 余量已刷新'
    && tf('toast.refreshed', {}).indexOf('undefined') === -1)
i18nCheck('tf 显式传 undefined/null 当空串',
  typeof tf === 'function' && tf('toast.refreshed', { name: undefined }) === ' 余量已刷新'
    && tf('toast.refreshed', { name: null }) === ' 余量已刷新')
i18nCheck('tf 不传 params 也不炸（无占位模板）', typeof tf === 'function' && tf('nav') === '模型服务')
i18nCheck('tf 传 null 也不炸', typeof tf === 'function' && tf('nav', null) === '模型服务')
// 正则元字符与 $& 这类替换串特殊 token：必须当字面量，不能被 replace 语义吞掉
i18nCheck('tf 参数里的正则元字符按字面处理',
  typeof tf === 'function' && tf('prov.credStoredAs', { ref: 'A$&(B)[C]\D+*?' }) === '密钥存为 A$&(B)[C]\D+*?')
i18nCheck('tf 参数里的 $& 不被当成替换模式展开',
  typeof tf === 'function' && tf('toast.refreshed', { name: '$&' }) === '$& 余量已刷新')
i18nCheck('tf 参数里的花括号原样带出',
  typeof tf === 'function' && tf('toast.refreshed', { name: '{x}' }).indexOf('{x}') !== -1)
i18nCheck('tf 未知 key 回退成 key 本身', typeof tf === 'function' && tf('nope.not.a.key') === 'nope.not.a.key')

// 4) 纯函数在两种语言下输出不同且符合预期
useLang('zh-CN')
const zhWin = shortWindowLabel('5 小时窗口')
const zhReset = resetCountdownText(new Date(Date.now() - 60000).toISOString())
const zhRel = relativeTime(new Date(Date.now() - 60000).toISOString())
const zhRelUnder = relativeTime(new Date(Date.now() - 30000).toISOString())
const zhRow = piAiBridgeRows({ active: true, piAiVersion: '0.85.1', source: 'dependency' }, undefined)[0]
const zhUpstream = piAiUpstreamText(undefined)
const zhUpstreamChecked = piAiUpstreamText({ latest: '0.86.0', lastCheck: new Date().toISOString() })
const zhYaml = exported
const zhCaps = capabilityBadges({ id: 'm', vision: true, reasoning: true, video: true })
const zhSkip = skipRowOf()

useLang('en-US')
const enWin = shortWindowLabel('5 小时窗口')
const enReset = resetCountdownText(new Date(Date.now() - 60000).toISOString())
const enRel = relativeTime(new Date(Date.now() - 60000).toISOString())
const enRelUnder = relativeTime(new Date(Date.now() - 30000).toISOString())
const enRow = piAiBridgeRows({ active: true, piAiVersion: '0.85.1', source: 'dependency' }, undefined)[0]
const enUpstream = piAiUpstreamText(undefined)
const enUpstreamChecked = piAiUpstreamText({ latest: '0.86.0', lastCheck: new Date().toISOString() })
// 现取而不是复用 exported：exported 是模块顶层（默认语言）那次的结果，复用就测不出切语言
const enYaml = routeYamlOf({ id: 'opencode-go', apiKeyEnv: 'OPENCODE_GO_API_KEY' })
const enCaps = capabilityBadges({ id: 'm', vision: true, reasoning: true, video: true })
const enSkip = skipRowOf()

i18nCheck('窗口短名 zh 出 5h', zhWin === '5h')
i18nCheck('窗口短名 en 出 5h（英文源名也要认）', enWin === '5h')
i18nCheck('倒计时 zh = 即将重置', zhReset === '即将重置')
i18nCheck('倒计时 en = Resetting soon', enReset === 'Resetting soon' && !hasHan(enReset))
i18nCheck('相对时间 1 分钟前 = 1m（单位是机器口径，两边都不翻）', zhRel === '1m' && enRel === '1m')
i18nCheck('相对时间 30 秒前 = <1min', zhRelUnder === '<1min' && enRelUnder === '<1min')
i18nCheck('桥接版本行 zh 是中文来源档', zhRow.value === '0.85.1（兜底依赖）')
i18nCheck('桥接版本行 en 是英文来源档', enRow.value === '0.85.1 (vendored fallback)' && !hasHan(enRow.value))
i18nCheck('上游未检查 zh = 上游 未检查', zhUpstream === '上游 未检查')
i18nCheck('上游未检查 en = Upstream not checked', enUpstream === 'Upstream not checked' && !hasHan(enUpstream))
i18nCheck('上游已检查 zh 带版本与检查时间',
  zhUpstreamChecked.indexOf('上游 0.86.0') === 0 && zhUpstreamChecked.indexOf('检查于') !== -1)
i18nCheck('上游已检查 en 带版本与检查时间',
  enUpstreamChecked.indexOf('Upstream 0.86.0') === 0 && enUpstreamChecked.indexOf('checked') !== -1 && !hasHan(enUpstreamChecked))
i18nCheck('跳过行 zh 带版本号与原因短语', zhSkip.text === '跳过 0.86.0：兼容性检查没通过')
i18nCheck('跳过行 en 带版本号与原因短语',
  enSkip.text === 'Skipped 0.86.0: compatibility check failed' && !hasHan(enSkip.text))
i18nCheck('导出 YAML zh 头注释是中文', zhYaml.indexOf('删除前导出的 route 配置') !== -1)
i18nCheck('导出 YAML en 头注释是英文',
  enYaml.indexOf('# dsh-llm-provider route config exported before deletion') !== -1 && !hasHan(enYaml))
i18nCheck('导出 YAML 两边都留 provider id、apiKeyEnv 与「不导出凭据值」提醒',
  zhYaml.indexOf('opencode-go:') !== -1 && enYaml.indexOf('opencode-go:') !== -1
    && zhYaml.indexOf('apiKeyEnv: OPENCODE_GO_API_KEY') !== -1 && enYaml.indexOf('apiKeyEnv: OPENCODE_GO_API_KEY') !== -1
    && zhYaml.indexOf('凭据值不导出') !== -1 && enYaml.indexOf('Credential values are not exported') !== -1)
i18nCheck('能力徽章 zh = 视觉/推理/视频', zhCaps.join(',') === '视觉,推理,视频')
i18nCheck('能力徽章 en = Vision/Reasoning/Video', enCaps.join(',') === 'Vision,Reasoning,Video' && !hasHan(enCaps.join(',')))

// 5) 徽章定位（能力未知不渲染成「无视觉」）在英文下同样成立
i18nCheck('en 下能力未知时不打徽章', capabilityBadges({ id: 'mystery', provider: 'g' }).length === 0)
i18nCheck('en 下 modelRow 出英文徽章',
  rowText({ id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' }, { id: 'opencode-go' }).indexOf('Vision') !== -1)
i18nCheck('能力 id 是语言无关的稳定标识（徽章样式类靠它，切语言不断类）',
  typeof capabilityKeysOf === 'function'
    && capabilityKeysOf({ id: 'm', vision: true, reasoning: true, video: true }).join('/') === 'vision/reasoning/video')
i18nCheck('能力 id 与显示名是两回事（en 下显示名是英文、id 不变）',
  capabilityBadges({ id: 'm', vision: true }).join(',') === 'Vision'
    && capabilityKeysOf({ id: 'm', vision: true }).join(',') === 'vision')
i18nCheck('en 下详情卡的「能力未知」也走英文',
  tipText({ id: 'mystery', name: 'Mystery' }, { id: 'some-gateway' }, { id: 'mystery', provider: 'some-gateway' }).indexOf('unknown') !== -1)

useLang('zh-CN')

if (i18nFailures > 0) throw new Error(`i18n 断言有 ${i18nFailures} 条没过`)

console.log('\n冒烟通过：模型座位 + 设置页标签两个座位已注册，模型座位用负 priority 遮蔽官方占用者；' +
  '/model 在官方占用时让位、空闲时接管；pi-ai 桥接明细按版本/来源/跳过原因出正确的行；' +
  '推理等级在目录缺该模型时仍按会话已定的档位显示，默认档只认目录声明的那个；' +
  '模型详情按 provider + id 索引、跨 provider 重名不串味；能力未知不打徽章、详情卡注明「能力未知」；' +
  'zh/en 字典键集合一致、插值缺参原样留占位符，同一批纯函数在切 <html lang> 后输出跟着变')

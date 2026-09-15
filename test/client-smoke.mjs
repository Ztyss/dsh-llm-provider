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

// 执行脚本本体（它自己调 window.__ModuleLoader__.load）
new Function('window', 'document', 'fetch', 'setInterval', source)(
  globalThis.window,
  { querySelector: () => null, createElement: () => ({ dataset: {}, style: {} }), head: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
  () => Promise.reject(new Error('smoke test 不发请求')),
  () => 0,
)

const moduleExports = captured.factory((name) => (name === 'react' ? reactStub : {}))

/** 跑一次 apply，可用 commandDuplicate 模拟「官方 /model 命令还在」的场景。 */
function runApply(commandDuplicate) {
  const registrations = []
  const slotInjects = []
  const injectedServices = []
  let commandRegistered = false

  const effect = (fn) => {
    const disposer = fn()
    return typeof disposer === 'function' ? disposer : () => {}
  }
  const scope = {
    effect,
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
            register() {
              if (commandDuplicate) throw new Error('ui-commands: duplicate contribution for /model')
              commandRegistered = true
              return () => {}
            },
          },
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
  // 「把 ctx.styles 的读取挪到 try 外面」这种改动测不出来——2026-09-15 正是这一下
  // 把客户端插件整个加载搞挂了（Failed to load plugins）。
  const ctx = { effect, slots: scope.slots, inject: scope.inject }
  Object.defineProperty(ctx, 'styles', {
    get() {
      throw new Error('cannot get property "styles" without inject')
    },
  })
  moduleExports.apply(ctx)
  return { registrations, slotInjects, injectedServices, commandRegistered }
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
rowsCheck('热更新档标成「热更新」', pending[0].value === '0.85.1（热更新）')

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

if (failures > 0) throw new Error(`桥接明细有 ${failures} 条断言没过`)

console.log('\n冒烟通过：模型座位 + 设置页标签两个座位已注册，模型座位用负 priority 遮蔽官方占用者；' +
  '/model 在官方占用时让位、空闲时接管；pi-ai 桥接明细按版本/来源/跳过原因出正确的行；' +
  '推理等级在目录缺该模型时仍按会话已定的档位显示，默认档只认目录声明的那个')

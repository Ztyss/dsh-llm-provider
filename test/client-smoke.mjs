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
  moduleExports.apply({ effect, slots: scope.slots, inject: scope.inject })
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

console.log('\n冒烟通过：模型座位 + 设置页标签两个座位已注册，模型座位用负 priority 遮蔽官方占用者；' +
  '/model 在官方占用时让位、空闲时接管')

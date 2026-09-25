/**
 * 内核 0.1.7 适配层离线测试（handoff 2026-09-25）。
 *
 *   node test/kernel-compat.mjs
 *
 * 探测/合并/访问器全用夹具测；真实内核树的两代形态用环境变量可选接入：
 *   K017_TREE=C:/.../node_modules/@deepseek-ai   → 断言 0.1.7 pi-ai Config 探测为 volatile
 *   K015_TREE=D:/.../node_modules/@deepseek-ai   → 断言 0.1.5 pi-ai Config 探测为 plain
 * （不设就跳过——npm test 必须在任何机器上都能跑。）
 */
import { configAccessKind, mergeBridgeProviders, readBaseProviders, readUserProviders, volatileProvidersConfig } from '../lib/kernel-compat.js'

let failures = 0
function check(name, cond, detail) {
  console.log(`${cond ? '  ok ' : '  FAIL'} ${name}${detail === undefined ? '' : ' → ' + detail}`)
  if (!cond) failures += 1
}

/** 造一个插件模块夹具：Config 挂 standard validate（真实形状是 plugin.Config['~standard']）。 */
function fixtureConfig(validate) {
  return { Config: { '~standard': { validate } } }
}

// ---- configAccessKind：探测两代配置语义 ----
check('missing Config → unknown', configAccessKind(undefined) === 'unknown' && configAccessKind({}) === 'unknown')
check('validate 抛错 → unknown', configAccessKind(fixtureConfig(() => { throw new Error('boom') })) === 'unknown')
check('异步 validate → unknown', configAccessKind(fixtureConfig(() => Promise.resolve({ value: {} }))) === 'unknown')

const volatilePlugin = fixtureConfig(() => ({ value: { providers: { get: () => ({}) } } }))
check('0.1.7 形态（providers.get 是函数）→ volatile', configAccessKind(volatilePlugin) === 'volatile')

const plainPlugin = fixtureConfig(() => ({ value: { providers: { deepseek: {} } } }))
check('0.1.5 形态（providers 是平面对象）→ plain', configAccessKind(plainPlugin) === 'plain')

// ---- 真实内核树（可选）----
if (process.env.K017_TREE !== undefined && process.env.K017_TREE !== '') {
  const mod = await import(`file:///${process.env.K017_TREE.replace(/\\/g, '/')}/dsh-llm-pi-ai/lib/index.js`)
  check('真实 0.1.7 pi-ai Config 探测为 volatile', configAccessKind(mod) === 'volatile')
}
if (process.env.K015_TREE !== undefined && process.env.K015_TREE !== '') {
  const mod = await import(`file:///${process.env.K015_TREE.replace(/\\/g, '/')}/dsh-llm-pi-ai/lib/index.js`)
  check('真实 0.1.5 pi-ai Config 探测为 plain', configAccessKind(mod) === 'plain')
}

// ---- mergeBridgeProviders：base 在下、用户在上 ----
const merged = mergeBridgeProviders(
  { deepseek: { displayName: 'DeepSeek', apiKeyEnv: 'DEEPSEEK_API_KEY' } },
  { zai: { displayName: 'Z.ai', apiKeyEnv: 'ZAI_API_KEY' }, deepseek: { displayName: 'DeepSeek(改)' } },
)
check('用户路由全部进表', merged.zai !== undefined && merged.deepseek !== undefined)
check('同名路由用户覆盖插件 base', merged.deepseek.displayName === 'DeepSeek(改)')
check('两侧皆空给空表', Object.keys(mergeBridgeProviders(undefined, undefined)).length === 0)

// ---- readUserProviders：get → section 两级兜底 ----
check('get 命中时用 get 的结果', Object.keys(readUserProviders({ get: (ns) => ns === 'llm-pi-ai' ? { providers: { a: {} } } : undefined })).join(',') === 'a')
check('get 未注册时落 section',
  Object.keys(readUserProviders({ get: () => undefined, section: (ns) => ns === 'llm-pi-ai' ? { providers: { b: {} } } : undefined })).join(',') === 'b')
check('服务缺席给空表（不炸）', Object.keys(readUserProviders(undefined)).length === 0 && Object.keys(readUserProviders({ get: () => { throw new Error('x') } })).length === 0)

// ---- volatileProvidersConfig：惰性访问器 ----
let calls = 0
let current = { v1: {} }
const accessor = volatileProvidersConfig(() => { calls += 1; return current })
check('合成访问器形状 { providers: { get } }', typeof accessor.providers.get === 'function')
accessor.providers.get()
current = { v2: {} }
accessor.providers.get()
check('get 惰性现读（每次调用都取新值）', calls === 2 && accessor.providers.get().v2 !== undefined && calls === 3)

// ---- readBaseProviders：两种 config 形态都认 ----
check('plain config 直接取 providers', readBaseProviders({ providers: { deepseek: {} } }).deepseek !== undefined)
check('volatile config 走 get()', readBaseProviders({ providers: { get: () => ({ deepseek: {} }) } }).deepseek !== undefined)
check('config 缺 providers 给空表', Object.keys(readBaseProviders({})).length === 0)

console.log(failures === 0 ? '\nkernel-compat 全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

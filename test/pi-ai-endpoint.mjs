// 「测试」端点解析测试：路由没写 baseURL 时回退 pi-ai 工厂的官方默认端点。
//
// 语义（用户 10-10 需求：官方默认端点也应找到对应 baseURL 做最小请求）：
//   - 显式写了 baseURL 的路由照旧用它（只去尾斜杠），协议按显式 api 字段；
//   - 没写 baseURL 的路由回退 pi-ai 该 provider 工厂的 baseUrl；协议缺省取工厂默认 api；
//   - 目录里没有这个 id（自定义路由）或工厂没带 baseUrl → 不硬猜，返回 undefined
//     （宿主 test-model 对 undefined 仍如实回报「没有可直接请求的地址」）。
// 夹具：临时目录里造一棵假 pi-ai 树（package.json + dist/providers/*.js），
// 工厂返回值复刻真实 createProvider 的形状（id/name/baseUrl/getModels）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as names from '../lib/pi-ai-names.js'

let failures = 0
function check(name, cond, detail) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (detail === undefined ? '' : ' → ' + JSON.stringify(detail)))
  if (!cond) failures += 1
}

/** 造假 pi-ai 树：providers 是 文件名 → 模块源码 的表。 */
function fakePiAiRoot(providers) {
  const root = mkdtempSync(join(tmpdir(), 'pi-ai-endpoint-'))
  mkdirSync(join(root, 'dist', 'providers'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-ai', version: '9.9.9', type: 'module' }))
  for (const [file, code] of Object.entries(providers)) writeFileSync(join(root, 'dist', 'providers', file), code)
  return root
}

const root = fakePiAiRoot({
  // 带官方默认端点的 provider：baseUrl 原样带尾斜杠（修饰只发生在 resolveTestEndpoint）
  'aaa.js': 'export function aaaProvider() { return { id: "aaa", name: "AAA", baseUrl: "https://aaa.example/v1/", getModels: function () { return [{ id: "m1", api: "openai-completions" }] } } }',
  // 目录里存在但没有 baseUrl 的 provider：回退也不给端点
  'bbb.js': 'export function bbbProvider() { return { id: "bbb", name: "BBB", getModels: function () { return [{ id: "m1", api: "openai-completions" }] } } }',
  // 缺省协议是 anthropic-messages 的 provider
  'anthropic.js': 'export function anthropicProvider() { return { id: "anthropic", name: "Anth", baseUrl: "https://anth.example", getModels: function () { return [{ id: "claude-x", api: "anthropic-messages" }] } } }',
  // 工厂一调就炸：不能拖垮整张表
  'boom.js': 'export function boomProvider() { throw new Error("工厂炸了") }',
  // 步进器要跳过的文件
  'aaa.models.js': 'export const AAA_MODELS = {}',
  'all.js': 'export const builtinProviders = []',
})

// ---- piAiProviderEndpoint：provider 级官方默认端点读取 ----
check('piAiProviderEndpoint 已导出', typeof names.piAiProviderEndpoint === 'function')
if (typeof names.piAiProviderEndpoint === 'function') {
  const aaa = names.piAiProviderEndpoint('aaa', root)
  check('工厂 baseUrl 原样读出（含尾斜杠）', aaa?.baseUrl === 'https://aaa.example/v1/', aaa)
  check('默认 api 读自首个 chat 模型', aaa?.api === 'openai-completions', aaa)
  check('没有 baseUrl 的 provider 如实返回 undefined 端点', names.piAiProviderEndpoint('bbb', root)?.baseUrl === undefined)
  check('目录外的 id 返回 undefined（不硬猜）', names.piAiProviderEndpoint('nope', root) === undefined)
}

// ---- 名字表回归：扩元信息不能破坏 piAiName/piAiNames ----
check('piAiName 仍能读出注册名', names.piAiName('aaa', root) === 'AAA')
check('炸工厂的 provider 不拖垮名字表', names.piAiName('boom', root) === undefined)

// ---- resolveTestEndpoint：test-model 的端点 + 协议解析 ----
check('resolveTestEndpoint 已导出', typeof names.resolveTestEndpoint === 'function')
if (typeof names.resolveTestEndpoint === 'function') {
  const explicit = names.resolveTestEndpoint({ id: 'aaa', baseURL: 'https://x.example/v1///', api: 'openai-completions' }, root)
  check('显式 baseURL 赢过工厂且去尾斜杠', explicit?.base === 'https://x.example/v1', explicit)
  check('显式 openai 协议照读', explicit?.isAnthropic === false, explicit)

  const explicitAnth = names.resolveTestEndpoint({ id: 'aaa', baseURL: 'https://x.example', api: 'anthropic-messages' }, root)
  check('显式 anthropic 协议照读', explicitAnth?.isAnthropic === true, explicitAnth)

  const fallback = names.resolveTestEndpoint({ id: 'aaa' }, root)
  check('没写 baseURL 回退工厂默认端点（尾斜杠也去）', fallback?.base === 'https://aaa.example/v1', fallback)
  check('回退时协议取工厂缺省', fallback?.isAnthropic === false, fallback)

  const fbAnth = names.resolveTestEndpoint({ id: 'anthropic' }, root)
  check('工厂缺省协议是 anthropic-messages 时按 anthropic 发', fbAnth?.base === 'https://anth.example' && fbAnth?.isAnthropic === true, fbAnth)

  const override = names.resolveTestEndpoint({ id: 'anthropic', api: 'openai-completions' }, root)
  check('路由显式 api 覆盖工厂缺省协议', override?.isAnthropic === false, override)

  check('目录外 id 不硬猜 → undefined', names.resolveTestEndpoint({ id: 'nope' }, root) === undefined)
  check('目录里也没有端点 → undefined', names.resolveTestEndpoint({ id: 'bbb' }, root) === undefined)
}

// ---- 缓存按根隔离：换根重建不串台（对齐换 pi-ai 版本后的语义）----
const root2 = fakePiAiRoot({
  'zzz.js': 'export function zzzProvider() { return { id: "zzz", name: "ZZZ", baseUrl: "https://zzz.example", getModels: function () { return [] } } }',
})
check('第二个根的 provider 读得到', names.piAiName('zzz', root2) === 'ZZZ')
check('切根后回第一个根仍然正确', typeof names.piAiProviderEndpoint === 'function' && names.piAiProviderEndpoint('aaa', root)?.baseUrl === 'https://aaa.example/v1/')

console.log(failures === 0 ? '\npi-ai 端点解析测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

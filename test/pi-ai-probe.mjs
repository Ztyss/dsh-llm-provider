// pi-ai 体检测试。
//
// 两件事：能不能从 bundle 源码里读出它对 pi-ai 的 import 需求；体检能不能挡住
// 不兼容的候选——尤其是"先体检一个坏的、再体检一个好的"这种组合，因为 Node 对
// 加载失败的 ESM 会留下半初始化记录，探针目录要是共用一条 URL，第二个必然误判成失败。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { piAiCandidates, piAiRequirements, probePiAi } from '../lib/bridge.js'

let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : '  FAIL ') + name)
  if (!cond) failures += 1
}

/** 造一个假 pi-ai 包：exports 表 + index.js + providers/all.js + api/*.lazy.js。 */
function fakePiAi({ index, api, exports: exportsMap }) {
  const root = mkdtempSync(join(tmpdir(), 'pi-ai-probe-'))
  mkdirSync(join(root, 'providers'), { recursive: true })
  mkdirSync(join(root, 'api'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: '@earendil-works/pi-ai',
    version: '1.0.0',
    type: 'module',
    exports: exportsMap ?? { '.': './index.js', './providers/*': './providers/*.js', './api/*': './api/*.js' },
  }))
  writeFileSync(join(root, 'index.js'), index ?? 'export const createModels = 1\nexport const createProvider = 1\nexport const getSupportedThinkingLevels = 1\nexport const isContextOverflow = 1\n')
  writeFileSync(join(root, 'providers', 'all.js'), 'export const builtinProviders = 1\nexport const getBuiltinModels = 1\nexport const getBuiltinProviders = 1\n')
  writeFileSync(join(root, 'api', 'anthropic-messages.lazy.js'), api ?? 'export const anthropicMessagesApi = 1\n')
  return root
}

// ---- 需求解析（照真实 bundle 的写法）----
const bundleLike = [
  'import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";',
  'import { createModels, createProvider, getSupportedThinkingLevels, isContextOverflow } from "@earendil-works/pi-ai";',
  'import { builtinProviders, getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";',
  'import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";',
  '',
  'const name = "llm-pi-ai";',
].join('\n')
const requirements = piAiRequirements(bundleLike)
check('抠出 3 条 pi-ai import', requirements.length === 3)
check('子路径列表正确',
  requirements.map((r) => r.specifier).join(' ') ===
  '@earendil-works/pi-ai @earendil-works/pi-ai/providers/all @earendil-works/pi-ai/api/anthropic-messages.lazy')
check('具名导出解析正确',
  requirements[0].names.join(',') === 'createModels,createProvider,getSupportedThinkingLevels,isContextOverflow')
check('dsh 自己的包不算进来', requirements.every((r) => r.specifier.startsWith('@earendil-works/pi-ai')))
check('没有 pi-ai import 时返回空数组', piAiRequirements('import { x } from "node:fs"').length === 0)

// ---- 体检：能用的通过 ----
const good = fakePiAi({})
check('兼容的 pi-ai 通过', probePiAi(requirements, good, 'good').ok === true)

// ---- 体检：导出改名被挡住 ----
const renamed = fakePiAi({ index: 'export const 改过名了 = 1\n' })
const r1 = probePiAi(requirements, renamed, 'renamed')
check('导出改名被挡住', r1.ok === false)
check('错误信息点出缺哪个导出', String(r1.error).includes('createModels'))

// ---- 体检：子路径被删掉也被挡住 ----
const noSubpath = fakePiAi({ exports: { '.': './index.js' } })
check('子路径消失被挡住', probePiAi(requirements, noSubpath, 'nosub').ok === false)

// ---- 体检：目录不存在被挡住 ----
// 断言错误文案是「目录不存在」而不是别的：这句只可能来自 probePiAi 开头那句显式检查。
// 少了那句检查，探针会给不存在的候选建一条断链，Node 顺着往上找可能撞上主软链上那份
// 能用的 pi-ai，把不合格的候选误判成通过。
const missing = probePiAi(requirements, join(tmpdir(), 'pi-ai-不存在-xyz'), 'missing')
check('目录不存在被挡住', missing.ok === false)
check('拒绝理由是「目录不存在」而不是顺着断链往上找到了别的', missing.error === '目录不存在')

// ---- 关键：坏候选体检完之后，好候选仍然能通过（探针 URL 不能互相污染）----
const r2 = probePiAi(requirements, good, 'good-again')
check('坏 → 好 的顺序下，好候选仍通过', r2.ok === true)

// ---- 需求解析不出来时只检查目录在不在 ----
check('无需求 + 目录存在 → 通过', probePiAi([], good, 'noreq').ok === true)
check('无需求 + 目录不存在 → 不通过', probePiAi([], join(tmpdir(), 'pi-ai-无-xyz'), 'noreq2').ok === false)
// ---- 候选列表 ----
const candidates = piAiCandidates()
check('候选里必有兜底依赖档', candidates.some((c) => c.key === 'dependency'))
check('兜底依赖档不挂软链', candidates.find((c) => c.key === 'dependency').link === false)
// dsh 自带那一档的目录是沿解析链找出来的：dsh 没装/依赖没装时它可以缺席，
// 但在场时必须排最后，且是挂软链的那一档。
const dshTier = candidates.find((c) => c.key === 'dsh')
check('dsh 自带档在场时排最后且挂软链', dshTier === undefined || (candidates[candidates.length - 1].key === 'dsh' && dshTier.link === true))
check('每档都有 key/version/root', candidates.every((c) => c.key && c.version !== undefined && c.root !== undefined))

console.log(failures === 0 ? '\npi-ai 体检测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

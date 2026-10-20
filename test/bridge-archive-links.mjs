// 归档（app.asar）里的依赖：为什么不能挂链，以及改写后的形状。
//
// 现场（2026-10-20，DSH NEXT 2.0.15-next）：宿主把 app 打成
// `D:\ProgramFiles\DSH NEXT\resources\app.asar`，官方 llm-pi-ai bundle 与它依赖的
// `@deepseek-ai/*`、以及 DSH 自带那份 pi-ai 全在归档里。syncBridgeLinks 原先给每个 bare
// specifier 挂一条目录链，目标就是 `.../app.asar/node_modules/...`——而**链目标由内核的对象
// 管理器解析，内核不认识 asar**，于是每条链都悬空：existsSync 直接 false。
// 同机探针实测（宿主进程内）：
//   - `import('file:///…app.asar/…/dsh-launch-environment/lib/index.js')` 正常；
//   - `existsSync(junction → asar 内目录)` 为 false；
//   - 悬空 junction 下 import pi-ai 子路径直接 `Cannot find package '@earendil-works/pi-ai'`。
// 所以是链的问题，不是归档读不到。
//
// 修法：包目录落在 `.asar` 里就不挂链，把桥接副本里的 specifier 直接写成归档入口的
// file:// URL。同一条路径在宿主进程里就是官方 bundle 自己加载那些包的那条路，模块实例因此
// 是同一份（不会出现「一份代码两个 LlmError / cordis」）。
//
// 本文件盯七件事：
//   1. archiveBase / rewriteSpecifiers 的路径与字符串判定（纯函数）；
//   2. 归档 specifier 被改写成 URL，且链田上不留下悬空链（旧链要摘掉）；
//   3. 非归档（真目录）specifier 仍然挂链——原有行为不能被这次改动改掉；
//   4. 重复调用幂等；
//   5. 归档入口解不出时退回挂链，不静默少一个依赖；
//   6. pi-ai 在归档里（偏好拨 OFF 的中选档）同样改写，且 ON→OFF→ON 往返落得对；
//   7. pi-ai 需求永远读真源——副本被改写成 URL 后不能把体检拖成「无条件放行」。
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

// DSH_HOME 必须在 import bridge.js **之前**设好：bridgeDir 是模块级常量，import 时定死。
const home = mkdtempSync(join(tmpdir(), 'dsh-archive-home-'))
process.env.DSH_HOME = home

const { archiveBase, archiveEntryUrl, bridgeRequirements, bundleSpecifiers, piAiArchiveRewrites, piAiRequirements, probePiAi, rewriteSpecifiers, syncBridgeLinks, removeTree } = await import('../lib/bridge.js')

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-archive-src-'))
const archive = join(sandbox, 'app.asar')
const realRoot = join(sandbox, 'node_modules')

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

// ---- 造假现场 ----
const bundleDir = join(archive, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib')
mkdirSync(bundleDir, { recursive: true })
const bundlePath = join(bundleDir, 'index.js')
// pi-ai 的 specifier 用真 bundle 的那五条（providers/all + 三条 api/*.lazy + utils/overflow），
// 覆盖 exports 的 `./providers/*`、`./api/*`、`./utils/*` 三种模式键
const BUNDLE_SOURCE = [
  'import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";',
  'import { LlmAdapter } from "@deepseek-ai/dsh-llm";',
  'import { builtinModels, builtinProviders, getAllBuiltinModels, getBuiltinModels } from "@earendil-works/pi-ai/providers/all";',
  'import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";',
  'import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";',
  'import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";',
  'import { isContextOverflow } from "@earendil-works/pi-ai/utils/overflow";',
  'import { brandString } from "@deepseek-ai/dsh-brand";',
  'import { readFileSync } from "node:fs";',
  '// 数据里出现的包名不该被改写',
  'const NOTE = "@deepseek-ai/dsh-launch-environment";',
  'export const ok = typeof launchEnvironmentOf === "function"',
  '',
].join('\n')
writeFileSync(bundlePath, BUNDLE_SOURCE)

// 归档里的两个包：exports 走条件对象（跟真包一样的形状），入口在 lib/index.js
for (const name of ['dsh-launch-environment', 'dsh-llm']) {
  const pkg = join(archive, 'node_modules', '@deepseek-ai', name)
  writeJson(join(pkg, 'package.json'), {
    name: `@deepseek-ai/${name}`,
    version: '0.2.1-rc.2',
    type: 'module',
    exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' } },
  })
  mkdirSync(join(pkg, 'lib'), { recursive: true })
  writeFileSync(join(pkg, 'lib', 'index.js'), `export const ${name.replace(/-/g, '_')} = 1\n`)
}

// bundle 实际 import 的 pi-ai 子路径，以及给探针 require 的存根导出
const PI_AI_DIST_FILES = ['dist/providers/all.js', 'dist/api/anthropic-messages.lazy.js', 'dist/api/openai-completions.lazy.js', 'dist/api/openai-responses.lazy.js', 'dist/utils/overflow.js']
const PI_AI_STUB = 'export const builtinModels = 1, builtinProviders = 2, getAllBuiltinModels = 3, getBuiltinModels = 4\n'
  + 'export const anthropicMessagesApi = 5, openAICompletionsApi = 6, openAIResponsesApi = 7, isContextOverflow = 8\n'

// 归档里的 pi-ai：偏好拨 OFF（'dsh'）时中选的就是它。exports 照真包抄——子路径全走模式键
const archivedPiAi = join(archive, 'node_modules', '@earendil-works', 'pi-ai')
writeJson(join(archivedPiAi, 'package.json'), {
  name: '@earendil-works/pi-ai',
  version: '1.2.0',
  type: 'module',
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './providers/*': { types: './dist/providers/*.d.ts', import: './dist/providers/*.js' },
    './api/*': { types: './dist/api/*.d.ts', import: './dist/api/*.js' },
    './utils/*': { types: './dist/utils/*.d.ts', import: './dist/utils/*.js' },
  },
})
for (const file of PI_AI_DIST_FILES) {
  mkdirSync(join(archivedPiAi, ...file.split('/').slice(0, -1)), { recursive: true })
  writeFileSync(join(archivedPiAi, ...file.split('/')), PI_AI_STUB)
}

// 真目录里的一个包：这条必须照旧挂链（回归防线）
const brandDir = join(realRoot, '@deepseek-ai', 'dsh-brand')
writeJson(join(brandDir, 'package.json'), {
  name: '@deepseek-ai/dsh-brand',
  version: '0.2.1-rc.2',
  type: 'module',
  main: 'lib/index.js',
})
mkdirSync(join(brandDir, 'lib'), { recursive: true })
writeFileSync(join(brandDir, 'lib', 'index.js'), 'export const brand = 1\n')

// 开关拨 ON 时中选的 pi-ai：一个真目录（带 node_modules，跟安全区下载档同形）。
// exports 与 dist 存根照归档那份给——探针会真的 require 它，缺一个子路径就解析不到。
const piAiRoot = join(sandbox, 'pi-ai-1.3.0')
writeJson(join(piAiRoot, 'package.json'), {
  name: '@earendil-works/pi-ai',
  version: '1.3.0',
  type: 'module',
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './providers/*': { types: './dist/providers/*.d.ts', import: './dist/providers/*.js' },
    './api/*': { types: './dist/api/*.d.ts', import: './dist/api/*.js' },
    './utils/*': { types: './dist/utils/*.d.ts', import: './dist/utils/*.js' },
  },
})
for (const file of PI_AI_DIST_FILES) {
  mkdirSync(join(piAiRoot, ...file.split('/').slice(0, -1)), { recursive: true })
  writeFileSync(join(piAiRoot, ...file.split('/')), PI_AI_STUB)
}
mkdirSync(join(piAiRoot, 'node_modules'), { recursive: true })

// ---- 1. 纯函数：归档边界 ----
check('archiveBase 认出 app.asar', archiveBase(join('D:\\ProgramFiles\\DSH NEXT\\resources\\app.asar\\node_modules\\@deepseek-ai\\dsh-llm')) === join('D:\\ProgramFiles\\DSH NEXT\\resources\\app.asar'), archiveBase('D:\\ProgramFiles\\DSH NEXT\\resources\\app.asar\\node_modules\\@deepseek-ai\\dsh-llm'))
check('archiveBase 认出 POSIX 归档', archiveBase('/opt/dsh/resources/app.asar/node_modules/x') === '/opt/dsh/resources/app.asar')
check('archiveBase 对普通安装树返回 undefined', archiveBase(join('C:\\Users\\x\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh')) === undefined)
check('archiveBase 不把 .asar 当普通后缀漏掉', archiveBase('/a/b.asar/c/d.asar/e') === '/a/b.asar')

// ---- 2. 纯函数：只改 import/export/from 后面的字面量 ----
const rewrites = new Map([['@deepseek-ai/dsh-launch-environment', 'file:///D:/x/app.asar/node_modules/@deepseek-ai/dsh-launch-environment/lib/index.js']])
const rewritten = rewriteSpecifiers(BUNDLE_SOURCE, rewrites)
check('import ... from 被改写', rewritten.includes('from "file:///D:/x/app.asar/node_modules/@deepseek-ai/dsh-launch-environment/lib/index.js"'))
check('数据里的同名字符串不被改写', rewritten.includes('const NOTE = "@deepseek-ai/dsh-launch-environment";'))
check('node: 内置不被改写', rewritten.includes('from "node:fs"'))
check('没进改写表的 specifier 原样留着', rewritten.includes('from "@deepseek-ai/dsh-llm";'))
check('重复改写是恒等变换', rewriteSpecifiers(rewritten, rewrites) === rewritten)

// ---- 3. piAiArchiveRewrites：归档 pi-ai 的子路径解算 ----
const piAiRewrites = piAiArchiveRewrites(archivedPiAi, bundleSpecifiers(BUNDLE_SOURCE))
check('归档 pi-ai 五条子路径全解得出', piAiRewrites.size === 5, [...piAiRewrites.keys()].join(' '))
check('providers/all 解到 dist/providers/all.js', piAiRewrites.get('@earendil-works/pi-ai/providers/all') === pathToFileURL(join(archivedPiAi, 'dist', 'providers', 'all.js')).href, piAiRewrites.get('@earendil-works/pi-ai/providers/all'))
check('api/*.lazy 子路径解到对应文件', piAiRewrites.get('@earendil-works/pi-ai/api/openai-completions.lazy') === pathToFileURL(join(archivedPiAi, 'dist', 'api', 'openai-completions.lazy.js')).href)
check('utils/overflow 解到 dist/utils/overflow.js', piAiRewrites.get('@earendil-works/pi-ai/utils/overflow') === pathToFileURL(join(archivedPiAi, 'dist', 'utils', 'overflow.js')).href)
check('非归档 pi-ai 返回空表（走挂链）', piAiArchiveRewrites(piAiRoot, ['@earendil-works/pi-ai/providers/all']).size === 0)

// ---- 4. 端到端：syncBridgeLinks（ON 档：pi-ai 是真目录）----
// bridgeLib 由 loadBridge 按源哈希刷新，这里照它的做法先放一份副本
const bridgeDir = join(home, 'llm-provider-bridge', 'llm-bridge')
mkdirSync(join(bridgeDir, 'lib'), { recursive: true })
const copyPath = join(bridgeDir, 'lib', 'index.js')
writeFileSync(copyPath, BUNDLE_SOURCE)

// 旧版留下的悬空链：目标指向一个不存在的归档（真机上就是 app.asar 里的目录——
// 目录在归档里存在、在文件系统上不存在，所以链一定悬空）。改成写之后必须摘掉。
const farm = join(bridgeDir, 'node_modules')
const staleLink = join(farm, '@deepseek-ai', 'dsh-launch-environment')
mkdirSync(join(farm, '@deepseek-ai'), { recursive: true })
symlinkSync(join(sandbox, 'ghost.asar', 'node_modules', '@deepseek-ai', 'dsh-launch-environment'), staleLink, process.platform === 'win32' ? 'junction' : 'dir')
check('先确认悬空链真的悬空（复现现场）', existsSync(staleLink) === false)

syncBridgeLinks(bundlePath, piAiRoot)

const after = readFileSync(copyPath, 'utf8')
check('副本里 dsh-launch-environment 被改成归档 URL', after.includes(`from "${pathToFileURL(join(archive, 'node_modules', '@deepseek-ai', 'dsh-launch-environment', 'lib', 'index.js')).href}"`), after.split('\n')[0])
check('副本里 dsh-llm 被改成归档 URL', after.includes(`from "${pathToFileURL(join(archive, 'node_modules', '@deepseek-ai', 'dsh-llm', 'lib', 'index.js')).href}"`))
check('ON 档 pi-ai 的 specifier 没被动（版本切换全靠链田）', after.includes('from "@earendil-works/pi-ai/providers/all";'))
check('副本里真目录依赖也没被改写（仍走链田）', after.includes('from "@deepseek-ai/dsh-brand";'))
check('副本里 node: 内置没被动', after.includes('from "node:fs"'))
check('副本里数据字符串没被动', after.includes('const NOTE = "@deepseek-ai/dsh-launch-environment";'))

check('悬空链被摘掉了', existsSync(staleLink) === false)
check('真目录依赖照旧挂了链', existsSync(join(farm, '@deepseek-ai', 'dsh-brand')) && lstatSync(join(farm, '@deepseek-ai', 'dsh-brand')).isSymbolicLink())
check('pi-ai 链指向中选那份', readlinkSync(join(farm, '@earendil-works', 'pi-ai')) !== undefined)

// ---- 5. 幂等：再跑一次副本内容不变 ----
const stampBefore = readFileSync(copyPath, 'utf8')
syncBridgeLinks(bundlePath, piAiRoot)
check('重复调用副本内容不变', readFileSync(copyPath, 'utf8') === stampBefore)

// ---- 6. OFF 档：pi-ai 在归档里 → 改写 + 摘链田 ----
syncBridgeLinks(bundlePath, archivedPiAi)
const off = readFileSync(copyPath, 'utf8')
check('OFF 档 pi-ai providers/all 被改成归档 URL', off.includes(`from "${pathToFileURL(join(archivedPiAi, 'dist', 'providers', 'all.js')).href}"`), off.split('\n').find((l) => l.includes('pi-ai')) ?? '(none)')
check('OFF 档三条 api/*.lazy 全被改写', ['anthropic-messages.lazy', 'openai-completions.lazy', 'openai-responses.lazy'].every((n) => off.includes(`from "${pathToFileURL(join(archivedPiAi, 'dist', 'api', `${n}.js`)).href}"`)))
check('OFF 档 utils/overflow 被改写', off.includes(`from "${pathToFileURL(join(archivedPiAi, 'dist', 'utils', 'overflow.js')).href}"`))
check('OFF 档 @deepseek-ai 依赖照旧改写', off.includes(`from "${pathToFileURL(join(archive, 'node_modules', '@deepseek-ai', 'dsh-llm', 'lib', 'index.js')).href}"`))
check('OFF 档 pi-ai 链田被摘掉（不能留着指向别处的健康链）', existsSync(join(farm, '@earendil-works', 'pi-ai')) === false)

// ---- 7. ON→OFF→ON 往返：副本必须回到裸 pi-ai specifier ----
// 补丁式改写一旦把 specifier 换成 URL 就回不来了，所以副本要从真源重新推导
syncBridgeLinks(bundlePath, piAiRoot)
const back = readFileSync(copyPath, 'utf8')
check('拨回 ON 后 pi-ai specifier 恢复裸名', back.includes('from "@earendil-works/pi-ai/providers/all";'), back.split('\n').find((l) => l.includes('pi-ai')) ?? '(none)')
check('拨回 ON 后五条 pi-ai specifier 全是裸名', !/from "file:[^"]*pi-ai/.test(back))
check('拨回 ON 后 pi-ai 链田重新挂上', readlinkSync(join(farm, '@earendil-works', 'pi-ai')) !== undefined)
check('拨回 ON 后副本与首次 ON 档逐字一致', back === stampBefore)

// ---- 8. 归档入口解不出时退回挂链，且副本仍从真源推导 ----
const brokenArchive = join(sandbox, 'broken.asar')
const brokenBundleDir = join(brokenArchive, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib')
mkdirSync(brokenBundleDir, { recursive: true })
const brokenBundle = join(brokenBundleDir, 'index.js')
writeFileSync(brokenBundle, 'import x from "@deepseek-ai/dsh-nothing";\nexport const y = x\n')
const brokenPkg = join(brokenArchive, 'node_modules', '@deepseek-ai', 'dsh-nothing')
mkdirSync(brokenPkg, { recursive: true })
writeJson(join(brokenPkg, 'package.json'), { name: '@deepseek-ai/dsh-nothing', version: '0.0.1' })
writeFileSync(copyPath, '// 被人写脏的内容，必须被真源覆盖回去\n')
syncBridgeLinks(brokenBundle, piAiRoot)
check('入口解不出时不改写，副本从真源推导', readFileSync(copyPath, 'utf8') === 'import x from "@deepseek-ai/dsh-nothing";\nexport const y = x\n', JSON.stringify(readFileSync(copyPath, 'utf8').slice(0, 60)))
check('入口解不出的那条照旧挂链（错误形态与改动前一致）', lstatSync(join(farm, '@deepseek-ai', 'dsh-nothing')).isSymbolicLink())

// ---- 9. pi-ai 需求读真源：副本被改写后体检不能失效 ----
// findSourceBundle 的锚点之一是 $DSH_HOME/profiles/node_modules/_anchor.js，照着造一份真源
const sourceBundleDir = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib')
mkdirSync(sourceBundleDir, { recursive: true })
writeJson(join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'package.json'), { name: '@deepseek-ai/dsh-llm-pi-ai', version: '0.0.0' })
writeFileSync(join(sourceBundleDir, 'index.js'), BUNDLE_SOURCE)
syncBridgeLinks(bundlePath, archivedPiAi) // 副本此刻满是 file:// URL
check('副本被改写后 bridgeRequirements 仍读得到 pi-ai 需求', bridgeRequirements().length === 5, JSON.stringify(bridgeRequirements().map((r) => r.specifier)))

// ---- 10. 归档候选的探针：目录必须先建出来 ----
// 曾经把 mkdirSync 躲在「建链」分支里，归档分支不建链 → 探针目录没建出来 →
// writeFileSync(probe.js) 直接 ENOENT → 归档候选永远「体检没通过」，OFF 档整条死掉。
const archivedProbe = probePiAi(piAiRequirements(BUNDLE_SOURCE), archivedPiAi, 'dsh')
check('归档候选的探针建得起来且通过（不 ENOENT）', archivedProbe.ok === true, archivedProbe.error)
const realProbe = probePiAi(piAiRequirements(BUNDLE_SOURCE), piAiRoot, 'safe-1.3.0')
check('真目录候选的探针照旧通过（挂链路径没被改坏）', realProbe.ok === true, realProbe.error)
check('探针用完即拆，不在安全区留 .probe-*', existsSync(join(bridgeDir, '.probe-dsh')) === false && existsSync(join(bridgeDir, '.probe-safe-1.3.0')) === false)

removeTree(home)
removeTree(sandbox)

console.log(failures === 0 ? '\n归档依赖链接测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

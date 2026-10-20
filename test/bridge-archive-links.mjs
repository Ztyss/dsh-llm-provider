// 归档（app.asar）里的依赖：为什么不能挂链，以及改写后的形状。
//
// 现场（2026-10-20，DSH NEXT 2.0.15-next）：宿主把 app 打成
// `D:\ProgramFiles\DSH NEXT\resources\app.asar`，官方 llm-pi-ai bundle 与它依赖的
// `@deepseek-ai/*` 全在归档里。syncBridgeLinks 原先给 bundle 的每个 bare specifier 挂一条
// 目录链，目标就是 `.../app.asar/node_modules/@deepseek-ai/<包>`——而**链目标由内核的对象
// 管理器解析，内核不认识 asar**，于是每条链都悬空：existsSync 直接 false，启动日志只剩一句
// `Cannot find package '@deepseek-ai/dsh-launch-environment'`，整座桥退化成纯计费模式。
//（同机探针实测：宿主自己 `import('file:///…app.asar/…/dsh-launch-environment/lib/index.js')`
// 正常，`existsSync(junction → asar 内目录)` 为 false——所以是链的问题，不是归档读不到。）
//
// 修法：归档里的包不挂链，把桥接副本里的 specifier 直接写成归档入口的 file:// URL。
// 同一条路径在宿主进程里就是官方 bundle 自己加载那些包的那条路，模块实例因此是同一份。
//
// 本文件盯四件事：
//   1. archiveBase / rewriteSpecifiers 的路径与字符串判定（纯函数）；
//   2. 归档 specifier 被改写成 URL，且链田上不留下悬空链（旧链要摘掉）；
//   3. 非归档（真目录）specifier 仍然挂链——原有行为不能被这次改动改掉；
//   4. 重复调用幂等：副本内容不再变。
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

const { archiveBase, archiveEntryUrl, rewriteSpecifiers, syncBridgeLinks, removeTree } = await import('../lib/bridge.js')

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-archive-src-'))
const archive = join(sandbox, 'app.asar')
const realRoot = join(sandbox, 'node_modules')

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

// ---- 造假现场：一个归档里的 bundle + 两个归档依赖 + 一个真目录依赖 ----
const bundleDir = join(archive, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib')
mkdirSync(bundleDir, { recursive: true })
const bundlePath = join(bundleDir, 'index.js')
const BUNDLE_SOURCE = [
  'import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";',
  'import { LlmAdapter } from "@deepseek-ai/dsh-llm";',
  'import { getAllBuiltinModels } from "@earendil-works/pi-ai/providers/all";',
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

// 中选的 pi-ai：一个真目录（带 node_modules，跟安全区下载档同形）
const piAiRoot = join(sandbox, 'pi-ai-1.3.0')
writeJson(join(piAiRoot, 'package.json'), { name: '@earendil-works/pi-ai', version: '1.3.0', type: 'module' })
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

// ---- 3. 端到端：syncBridgeLinks ----
// bridgeLib 由 loadBridge 按源哈希刷新，这里照它的做法先放一份副本
const bridgeDir = join(home, 'llm-provider-bridge', 'llm-bridge')
mkdirSync(join(bridgeDir, 'lib'), { recursive: true })
writeFileSync(join(bridgeDir, 'lib', 'index.js'), BUNDLE_SOURCE)
const copyPath = join(bridgeDir, 'lib', 'index.js')

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
check('副本里 pi-ai 的 specifier 没被动（版本切换全靠链田）', after.includes('from "@earendil-works/pi-ai/providers/all";'))
check('副本里真目录依赖也没被改写（仍走链田）', after.includes('from "@deepseek-ai/dsh-brand";'))
check('副本里 node: 内置没被动', after.includes('from "node:fs";'))
check('副本里数据字符串没被动', after.includes('const NOTE = "@deepseek-ai/dsh-launch-environment";'))

check('悬空链被摘掉了', existsSync(staleLink) === false)
check('真目录依赖照旧挂了链', existsSync(join(farm, '@deepseek-ai', 'dsh-brand')) && lstatSync(join(farm, '@deepseek-ai', 'dsh-brand')).isSymbolicLink())
check('真目录依赖的链指向那份真目录', readlinkSync(join(farm, '@deepseek-ai', 'dsh-brand')) !== undefined)
check('pi-ai 链指向中选那份', readlinkSync(join(farm, '@earendil-works', 'pi-ai')) !== undefined)

// ---- 4. 幂等：再跑一次副本内容不变、链不重建 ----
const stampBefore = readFileSync(copyPath, 'utf8')
syncBridgeLinks(bundlePath, piAiRoot)
check('重复调用副本内容不变', readFileSync(copyPath, 'utf8') === stampBefore)

// ---- 5. 归档入口解不出时退回挂链（不静默少一个依赖）----
const brokenArchive = join(sandbox, 'broken.asar')
const brokenPkg = join(brokenArchive, 'node_modules', '@deepseek-ai', 'dsh-nothing')
mkdirSync(join(brokenPkg), { recursive: true })
writeJson(join(brokenPkg, 'package.json'), { name: '@deepseek-ai/dsh-nothing', version: '0.0.1' })
const brokenSource = 'import x from "@deepseek-ai/dsh-nothing";\nexport const y = x\n'
writeFileSync(copyPath, brokenSource)
syncBridgeLinks(bundlePath, piAiRoot)
check('入口解不出时不改写（退回挂链）', readFileSync(copyPath, 'utf8') === brokenSource)

removeTree(home)
removeTree(sandbox)

console.log(failures === 0 ? '\n归档依赖链接测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

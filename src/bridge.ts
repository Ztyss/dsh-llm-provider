/**
 * pi-ai 桥接层：让 dsh 的官方 llm-pi-ai 适配器跑在我们自己维护的新版 pi-ai 上。
 *
 * 原理：
 *   官方已装的 @deepseek-ai/dsh-llm-pi-ai/lib/index.js 是单文件 bundle，对
 *   @earendil-works/pi-ai 全部走 bare specifier 外部导入（含 api/*.lazy、
 *   providers/all 这些 lazy 协议实现）。把这份 bundle 拷进本插件的
 *   vendor/llm-bridge/，旁边放一个 node_modules/@earendil-works/pi-ai 软链
 *   指向 vendor/pi-ai/<版本>/，Node 的解析就会把拷贝副本接到我们的新版 pi-ai。
 *   结果：模型目录 + wire 协议实现来自上游最新，dsh 的转换胶水层保持稳定。
 *
 * 升级 = 换软链指向 + 拷一份新 bundle，回滚 = 把热更新那版删掉（自动落回内置依赖）。
 *
 * 用哪份 pi-ai 是**加载前先体检**挑出来的，不是"先试再退"：ESM 加载失败后同一个文件
 * 没法重试（Node 会报 "not yet fully loaded"）。候选与体检见 piAiCandidates/probePiAi。
 *
 * 边界：本模块只写插件自己的 vendor/ 目录，pi-ai 本身的文件一个字节都不改——改第三方包的
 * 文件不可复现，也没法保证跟 lockfile 对得上。
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, type Stats } from 'node:fs'
import { describeIntegrity, inspectPiAi, restoreHint } from './pi-ai-source.js'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshHome } from './dsh-home.js'
import { asRecord, readString, type AnyRecord } from './types.js'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const vendorDir = join(pluginRoot, 'vendor')
const piAiVersionsDir = join(vendorDir, 'pi-ai')
const statusFile = join(vendorDir, 'status.json')

/**
 * 插件私有安全区（`$DSH_HOME/llm-provider-bridge`，默认 `~/.dsh/llm-provider-bridge`）。
 *
 * 存在的唯一理由是：**插件包目录会被别人递归删掉**。包管理器、插件市场、宿主都会把
 * `profiles/<profile>/node_modules/<插件>` 整棵删掉重建，而递归删除在 Node 24.15+（本机实测：
 * DSH 自带运行时 electron 43.3.0 / node 24.18.1）会**顺着目录 junction 把目标内容一起清空**。
 * 所以桥接副本与它那套「指向别处」的链一律放这儿，插件包里只留一个纯文件副本：
 * 插件包被删时被连坐的是安全区里的东西，dsh 安装树一个字节不动。
 */
const safeRoot = join(resolveDshHome(), 'llm-provider-bridge')
const safePiAiDir = join(safeRoot, 'pi-ai')
const bridgeDir = join(safeRoot, 'llm-bridge')
const bridgeLib = join(bridgeDir, 'lib', 'index.js')

const BRIDGE_PACKAGE_JSON = JSON.stringify({
  name: 'dsh-llm-provider-llm-bridge',
  version: '0.0.0',
  type: 'module',
  main: 'lib/index.js',
  exports: { '.': './lib/index.js', './package.json': './package.json' },
}, null, 2)

/** 桥接副本模块（官方那份 bundle 的形状：我们用到的两样）。 */
export interface BridgePluginModule {
  apply: (ctx: unknown, config: unknown) => void
  Config?: unknown
  [key: string]: unknown
}

/** 一次体检里被跳过的候选。 */
export interface RejectedCandidate {
  version: string
  error?: string
  /** 被跳过时这条候选的目录：`目录不存在` 时要靠它定位是哪一档没装上（issue #6 的诊断盲区）。 */
  path?: string
}

/** 一条候选的探测结论（`/provider/status` 的 `bridge.candidates`，界面「pi-ai 桥接」标签用）。 */
export interface CandidateProbe {
  key: string
  version: string
  root: string
  exists: boolean
  /** 这次实际选中并用上的那一条；其余为 false。桥接没装成时全为 false。 */
  used: boolean
  /** 没被选中的原因：目录不存在 / 体检没通过的原因 / 前面已经有中选的候选。 */
  reason?: string
}

/** 体检结果。`unverified` = 需求没解析出来，体检没跑，放行但不算「通过」。 */
export interface ProbeResult {
  ok: boolean
  unverified?: boolean
  error?: string
}

/** loadBridge() 的结果：成功带模块，失败带原因。 */
export type BridgeLoadResult =
  | {
      ok: true
      plugin: BridgePluginModule
      piAiVersion: string
      piAiSource: string
      /** 需求没解析出来、体检没跑：选中项是靠「目录存在」放行的，没验证过 */
      probeUnverified: boolean
      rejected: RejectedCandidate[]
      /** 逐条候选的探测结论（含「目录不存在」的那几档）。 */
      candidates: CandidateProbe[]
      /** 本次启动用安全副本补回 dsh 自带 pi-ai 的文件数（>0 表示刚修过一次连坐删除） */
      repairedFiles: number
    }
  | { ok: false; error: string; rejected: RejectedCandidate[]; candidates: CandidateProbe[] }

/** 一份 pi-ai 候选。`link: false` 表示不建软链、靠自然解析落到它。 */
export interface PiAiCandidate {
  key: string
  version: string
  root: string
  link: boolean
}

/** 从 bundle 源码里抠出来的一条 import 需求。 */
export interface PiAiRequirement {
  specifier: string
  names: string[]
}

/** vendor/pi-ai/ 下已就位的版本目录（有 node_modules 的才算就位）。 */
export function installedVersions(): string[] {
  try {
    return readdirSync(piAiVersionsDir)
      .filter((name) => existsSync(join(piAiVersionsDir, name, 'package.json'))
        && existsSync(join(piAiVersionsDir, name, 'node_modules')))
      .sort(compareVersions)
  } catch {
    return []
  }
}

/**
 * semver 数字比较，够用即可（pi-ai 是 0.x.y 格式）。
 *
 * 预发布 tag（0.86.0-beta.1）这类非纯数字段 Number() 出来是 NaN，NaN 参与比较时
 * `diff !== 0` 永远为真，会把整个排序搅乱（installedVersions 的 sort、updater 的
 * 「已是最新」判断都吃它）。这里把解析不出的段当 0：0.86.0-beta.1 与 0.86.0 视为同版。
 * pi-ai 目前没有预发布版本，这只是防 NaN 的守卫，不追求完整 semver 语义。
 */
export function compareVersions(a: string, b: string): number {
  const nums = (version: string): number[] => version.split('.').map((part) => Number(part) || 0)
  const pa = nums(a)
  const pb = nums(b)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 从一个文件位置出发，沿 node_modules 链找出某个包的**包目录**。
 *
 * 用它代替手拼路径：包的依赖可能被提升到上层 node_modules（pnpm 的 hoisted 布局、dsh 把
 * bundle 放在自己的安装目录里……）。手拼 `$DSH_HOME/profiles/node_modules/<包名>` 这类路径，
 * dsh 换个布局就落空；沿解析链找，跟运行时真正会加载的那份永远一致。
 *
 * 刻意**不用** `require.resolve()`：那只认包 `exports` 里给 `require` 条件的入口，而 pi-ai
 * 的 `exports["."]` 只声明了 `import`（0.84.x 就是这样），纯解析会报
 * ERR_PACKAGE_PATH_NOT_EXPORTED。我们要的是包目录本身，逐层找
 * `node_modules/<包名>/package.json` 就够了，与 exports 怎么写无关。
 * @param fromFile - 解析起点（文件不必存在），通常是解析的用例方。
 * @param specifier - 包名。
 * @returns 包目录（绝对路径）；找不到返回 undefined。
 */
function resolvePackageRoot(fromFile: string, specifier: string): string | undefined {
  const parts = specifier.split('/')
  let dir = dirname(fromFile)
  for (;;) {
    const candidate = join(dir, 'node_modules', ...parts)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * 官方 llm-pi-ai bundle 的实际位置。
 *
 * 它是桥接要拷的那份源文件。路径同样不写死：按「profile 的 node_modules → dsh 安装目录
 * （全局 node_modules）→ 插件自己」的顺序沿解析链找，找到哪个用哪个。
 * @returns bundle 入口文件的绝对路径；找不到返回 undefined。
 */
function findSourceBundle(): string | undefined {
  const anchors: string[] = []
  try {
    anchors.push(join(resolveDshHome(), 'profiles', 'node_modules', '_anchor.js'))
  } catch { /* 拿不到 DSH_HOME 就少一个锚点 */ }
  // dsh 的安装树：Windows 的官方安装包放在 <node>/node_modules，POSIX 在 <node>/lib/node_modules
  const nodeDir = dirname(process.execPath)
  anchors.push(join(nodeDir, 'node_modules', '_anchor.js'))
  anchors.push(join(nodeDir, '..', 'lib', 'node_modules', '_anchor.js'))
  anchors.push(join(pluginRoot, '_anchor.js'))

  const bundleSpec = '@deepseek-ai/dsh-llm-pi-ai'
  const seen = new Set<string>()
  for (const anchor of anchors) {
    const roots: string[] = []
    const direct = resolvePackageRoot(anchor, bundleSpec)
    if (direct !== undefined) roots.push(direct)
    // 也可能是嵌在 dsh 包自己的 node_modules 里（npm 全局安装遇到版本冲突时就这样摆）
    const dshRoot = resolvePackageRoot(anchor, '@deepseek-ai/dsh')
    if (dshRoot !== undefined) roots.push(join(dshRoot, 'node_modules', ...bundleSpec.split('/')))
    for (const root of roots) {
      if (seen.has(root)) continue
      seen.add(root)
      const entry = join(root, 'lib', 'index.js')
      if (existsSync(entry)) return entry
    }
  }
  return undefined
}

/**
 * dsh 自己那份 pi-ai 的包目录：从官方 bundle 的位置沿解析链找——那是 bundle 真正会加载的
 * 那份，dsh 把 bundle 放在哪、依赖提升到哪一层都不影响。
 * @param bundlePath - 官方 bundle 的入口文件路径。
 */
function dshPiAiRoot(bundlePath: string | undefined): string | undefined {
  if (bundlePath === undefined) return undefined
  const root = resolvePackageRoot(bundlePath, '@earendil-works/pi-ai')
  // 必须是**真的包**（manifest + 入口 + 官方子路径，见 inspectPiAi）：全局安装布局下可能只剩空壳目录，
  // 事故残态可能是「manifest 在、dist 被清空」——都不能当成可用候选。
  return root !== undefined && isPiAiPackage(root) ? root : undefined
}

/**
 * 候选目录里是不是**真有一个能用的 pi-ai 包**。
 *
 * 不能只判 `existsSync(root)`：全局安装（npm -g）布局下 `@deepseek-ai/dsh/node_modules/
 * @earendil-works/pi-ai` 这个目录**存在但是空的**（没有 package.json）——那是 npm 建出来的
 * 空壳，里面什么都没有。按"目录存在"判会把这种空壳当成可用候选，体检时才发现没有入口，
 * 白跑一趟；也可能像这次一样，让「宿主那份」整条从候选里消失。
 *
 * 也不能只判 `package.json`：2026-09-18 事故的形态正是**目录在、manifest 在、
 * `dist/` 被清空**。那时判"有 package.json"会把一份残骸报成可用，而宿主 boot 阶段
 * 已经因此失败了。判据交给 {@link inspectPiAi}（manifest + 入口 + 官方要的子路径）。
 */
function isPiAiPackage(root: string): boolean {
  return inspectPiAi(root).usable
}

/**
 * dsh 安装树里 pi-ai 的常见落点（用于"解析不出来时也要报一条路径"）。
 *
 * 覆盖两种真实布局：
 *   1. `<node>/node_modules/@earendil-works/pi-ai`（POSIX 与部分 Windows 安装）；
 *   2. 嵌套在 dsh 包自己下面：`<node>/node_modules/@deepseek-ai/dsh/node_modules/@earendil-works/pi-ai`
 *      —— 全局 `npm i -g @deepseek-ai/dsh` 就是这种，顶层 `@earendil-works/pi-ai`
 *      可能只是个空壳目录（实测：目录在、package.json 不在）。
 * @returns 第一条存在**包**的路径；一条都没有时返回最常见的那条（供诊断报"找过这里"）。
 */
function dshInstallTreePiAiRoot(): string | undefined {
  const nodeDir = dirname(process.execPath)
  const bases = [
    join(nodeDir, 'node_modules'),
    join(nodeDir, '..', 'lib', 'node_modules'),
  ]
  // profile 那条链也要算上：`dsh plugin add @earendil-works/pi-ai` 装进 profile 后，
  // 宿主这份就落在 profile 自己的 `node_modules` 里（实测在 `profiles/<name>/node_modules`，
  // 不是提升到 `profiles/node_modules`）——两种都试。
  try {
    const home = resolveDshHome()
    bases.push(join(home, 'profiles', 'node_modules'))
    bases.push(join(home, 'profiles', 'web', 'node_modules'))
  } catch { /* 拿不到 DSH_HOME 就少两个落点 */ }
  const specifier = ['@earendil-works', 'pi-ai']
  const candidates: string[] = []
  for (const base of bases) {
    candidates.push(join(base, ...specifier))
    candidates.push(join(base, '@deepseek-ai', 'dsh', 'node_modules', ...specifier))
  }
  for (const candidate of candidates) {
    if (isPiAiPackage(candidate)) return candidate
  }
  return candidates[0]
}

/** 宿主那份 pi-ai 的默认报错路径（解析不出来时用它，让诊断说得清找过哪儿）。 */
function defaultHostPiAiPath(): string {
  return join(dirname(process.execPath), 'node_modules', '@earendil-works', 'pi-ai')
}
/**
 * 兜底那份 pi-ai：`vendor/package.json` 锁死的依赖，装在 `vendor/node_modules/` 里。
 *
 * 位置是挑过的——它在桥接副本的解析路径上（副本在 `vendor/llm-bridge/`，往上找先撞到
 * `vendor/node_modules`，再才是插件根的 node_modules），所以中选这一档时不用挂软链：
 * 删掉软链它就自然生效，"回退"因此只有一个动作。
 *
 * 没放在插件根的 node_modules：那里有一条手工建的 `@deepseek-ai` 软链（桥接副本上的
 * dsh 包靠它解析），在根上跑 npm install 会被 npm 当成待处理的条目，实测直接 EPERM。
 */
function pluginDependencyRoot(): string {
  return join(vendorDir, 'node_modules', '@earendil-works', 'pi-ai')
}

/**
 * 当前生效的 pi-ai 包目录。
 *
 * loadBridge() 挑定之后以它为准——挑的时候可能回退过，跟"vendor 里最新"不是一回事，
 * 而这个根目录下面那三个读 pi-ai 文件的模块（provider 名字、模型详情、候选清单）
 * 必须跟真正被加载的那份对上。没跑过 loadBridge 的场合退回静态推断。
 */
let activeRoot: string | undefined
export function activePiAiRoot(): string | undefined {
  if (activeRoot !== undefined) return activeRoot
  const versions = installedVersions()
  const newest = versions[versions.length - 1]
  if (newest !== undefined) return join(piAiVersionsDir, newest)
  if (existsSync(pluginDependencyRoot())) return pluginDependencyRoot()
  return dshPiAiRoot(findSourceBundle()) ?? dshInstallTreePiAiRoot()
}

/** 读一个 pi-ai 包的版本号；读不到返回 undefined。 */
function piAiVersionOf(root: string): string | undefined {
  try {
    return readString(asRecord(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')))['version'])
  } catch {
    return undefined
  }
}

/**
 * 从 bundle 源码里抠出它对 pi-ai 的 import 需求。
 *
 * 拷来的那份代码写的是 bare specifier；上游改了导出名或子路径，加载就会炸。
 * 这里把"它到底要什么"读出来，好在加载**之前**就能判断某份 pi-ai 合不合格。
 *
 * 覆盖的形态：具名导入 / 具名 re-export（要对方给出这些名字）、动态 import、
 * 副作用导入、namespace/默认导入、`export *`（只要子路径能加载，names 为空）。
 * 解析不出来返回空数组，调用方据此知道"体检没执行"而不是"体检通过"。
 * @param source - bundle 源码。
 * @returns 需求列表；解析不出来时返回空数组（调用方据此跳过体检）。
 */
export function piAiRequirements(source: string): PiAiRequirement[] {
  const bySpecifier = new Map<string, Set<string>>()
  const namedPatterns = [
    /\bimport\s*\{([^}]*)\}\s*from\s*["'](@earendil-works\/pi-ai[^"']*)["']/g,
    /\bexport\s*\{([^}]*)\}\s*from\s*["'](@earendil-works\/pi-ai[^"']*)["']/g,
  ]
  for (const pattern of namedPatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) {
      const names = (match[1] ?? '')
        .split(',')
        .map((part) => part.trim().split(/\s+as\s+/)[0]?.trim() ?? '')
        .filter((name) => name !== '')
      const specifier = match[2]
      if (names.length > 0 && specifier !== undefined) {
        const existing = bySpecifier.get(specifier) ?? new Set<string>()
        for (const name of names) existing.add(name)
        bySpecifier.set(specifier, existing)
      }
    }
  }
  const barePatterns = [
    /\bimport\s*\(\s*["'](@earendil-works\/pi-ai[^"']*)["']/g, // 动态 import()
    /\bimport\s*["'](@earendil-works\/pi-ai[^"']*)["']/g, // 副作用导入
    /\bimport[^"'{]*?\sfrom\s*["'](@earendil-works\/pi-ai[^"']*)["']/g, // namespace/默认导入
    /\bexport\s*\*\s*from\s*["'](@earendil-works\/pi-ai[^"']*)["']/g, // export *
  ]
  for (const pattern of barePatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1]
      if (specifier !== undefined && !bySpecifier.has(specifier)) bySpecifier.set(specifier, new Set())
    }
  }
  return [...bySpecifier.entries()].map(([specifier, names]) => ({ specifier, names: [...names] }))
}

/** 读桥接副本，返回它对 pi-ai 的 import 需求（updater 装完新版本也拿它体检）。 */
export function bridgeRequirements(): PiAiRequirement[] {
  try {
    return piAiRequirements(readFileSync(bridgeLib, 'utf8'))
  } catch {
    return []
  }
}

/** 路径是否在插件包外面：包外面的候选才需要先落地成安全区副本（见 safeRoot 的说明）。 */
function isOutsidePlugin(path: string): boolean {
  return !(path === pluginRoot || path.startsWith(pluginRoot + sep))
}

/**
 * 建一条目录链要用的目标与类型。
 *
 * Windows 上目录软链需要 SeCreateSymbolicLinkPrivilege（管理员或开发者模式），普通账户会 EPERM；
 * junction 不需要任何权限，但目标必须是绝对路径。POSIX 上仍用相对目标的软链，仓库整体挪位置
 * 也不会断。
 * @param from - 链所在目录（POSIX 相对目标的基准）。
 * @param target - 链要指向的包目录。
 */
function linkSpec(from: string, target: string): { target: string; type: 'dir' | 'junction' } {
  return process.platform === 'win32'
    ? { target: resolve(target), type: 'junction' }
    : { target: relative(from, target), type: 'dir' }
}

/**
 * 删掉一条目录链（symlink/junction）或一个真目录——**只能用这个函数删链**。
 *
 * ⚠️ 绝对不能用 `rmSync(link, { recursive: true, force: true })` 删 Windows 目录 junction：
 * Node 24.15 起（本机实测：DSH 自带运行时 electron 43.3.0 / node 24.18.1）它会**把 junction
 * 目标目录的内容一起删掉**，只留下一个空目录。同一句在 node 24.14 上是安全的——所以这个雷
 * 只有在 DSH 自己的运行时里才炸得出来，日常用 node 复现不了。
 *
 * 链指向 dsh 自带那份 pi-ai 时，后果就是「重启一次 DSH，pi-ai 被清空」：探针目录的链每轮启动
 * 都会先删后建，等于每启动一次就清一次目标。正确做法是先 lstat——是链就 `unlink`（只摘链，
 * 目标一个字节不动），只有真目录才递归删；递归删之前再确认路径在 vendor/ 里面。
 * @param path - 要删的链或目录。
 */
/**
 * 目录链感知的递归删除：**只摘链，绝不跟进目标**。
 *
 * `rmSync(path, { recursive: true })` 在 Windows 上不能用来删「可能藏着 junction 的目录树」：
 * Node 24.15 起（本机实测：electron 43.3.0 / node 24.18.1）它会顺着 junction 把目标内容一起
 * 清空。所以递归删除自己走目录：遇到链就 unlink，遇到真目录才回溯删；这样即使上层路径里藏着
 * 链，被删的也只有链本身。
 * @param path - 要删的文件、链或目录树。
 */
export function removeTree(path: string): void {
  let stats: Stats
  try {
    stats = lstatSync(path)
  } catch {
    return // 不存在，没什么可删
  }
  if (stats.isSymbolicLink()) {
    unlinkSync(path)
    return
  }
  if (!stats.isDirectory()) {
    rmSync(path, { force: true })
    return
  }
  let entries: string[] = []
  try {
    entries = readdirSync(path)
  } catch { /* 读不到就当空目录，交给下面的 rmdir 收尾 */ }
  for (const name of entries) removeTree(join(path, name))
  try {
    rmdirSync(path)
  } catch { /* 还有删不掉的（占用/权限）：留给下一次调用 */ }
}

/**
 * 删掉一条目录链（symlink/junction）或一个真目录——**只能用这个函数删链**。
 *
 * 递归那一支永远走 {@link removeTree}（只摘链、不跟进目标），并且限定在插件自己的两个
 * 受管目录里：插件包的 `vendor/` 与 DSH_HOME 下的安全区。@param path - 要删的链或目录。
 */
export function removeLinkOrDir(path: string): void {
  let stats: Stats
  try {
    stats = lstatSync(path)
  } catch {
    return // 不存在，没什么可删
  }
  if (stats.isSymbolicLink()) {
    unlinkSync(path) // junction / symlink：只摘链，绝不跟进目标
    return
  }
  const inside = path === vendorDir || path.startsWith(vendorDir + sep)
    || path === safeRoot || path.startsWith(safeRoot + sep)
  if (!inside) throw new Error(`拒绝递归删除受管目录之外的路径：${path}`)
  removeTree(path)
}

/**
 * 这条路径是不是一条目录链接（软链或 Windows junction）。
 *
 * 用 lstat 而不是 stat：stat 会**跟着链接走**，链接指向目录时得到的是目标目录的信息，
 * 于是「它是不是链接」根本判不出来。
 * @param path - 要判的路径。
 */
export function isDirectoryLink(path: string): boolean {
  try {
    // lstat 对 junction 报 isSymbolicLink() = true（Windows 的 reparse point 就是这么暴露的）
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 只移除**链接本身**，绝不碰它指向的内容。
 *
 * 这是 issue #6 那类事故（删插件的东西把宿主的东西一起删了）的结构性防线：
 *   - 普通目录一律不动——调用方想删的是自己建的链接，不是任何目录；
 *   - 是链接就 unlinkSync：它只摘掉链接项，**不会递归进目标目录**。
 *     `rmSync(path, { recursive: true })` 在链接上的行为跨平台并不一致（尤其是 Windows
 *     的 junction），拿它删链接等于把「目标内容会不会被一起删」交给平台实现决定。
 * 幂等：路径不存在时什么也不做。
 * @param path - 链接路径。
 * @returns 真的移除了返回 true；不是链接（或不存在）返回 false。
 */
export function removeDirectoryLink(path: string): boolean {
  if (!isDirectoryLink(path)) return false
  try {
    unlinkSync(path)
    return true
  } catch {
    return false
  }
}

/** 插件私有安全区根目录（`$DSH_HOME/llm-provider-bridge`）。 */
export function safeRootDir(): string {
  return safeRoot
}

/**
 * 复制一棵目录树，**不跟进任何链**（链一律跳过）。
 *
 * 跳过而不是跟进是安全要求：源里可能有指向 dsh 安装树别处的 junction，跟进就等于把
 * dsh 自己的东西抄进副本、还会把「链」带进安全区。
 * @param source - 源目录。
 * @param dest - 目标目录（按需创建）。
 * @returns 新写入的文件数。
 */
export function copyTreeNoLinks(source: string, dest: string): number {
  const counter = { files: 0 }
  copyInto(source, dest, counter)
  return counter.files
}

function copyInto(source: string, dest: string, counter: { files: number }): void {
  let stats: Stats
  try {
    stats = lstatSync(source)
  } catch {
    return
  }
  if (stats.isSymbolicLink()) return
  if (stats.isDirectory()) {
    try {
      mkdirSync(dest, { recursive: true })
    } catch {
      return
    }
    let entries: string[] = []
    try {
      entries = readdirSync(source)
    } catch {
      return
    }
    for (const name of entries) copyInto(join(source, name), join(dest, name), counter)
    return
  }
  if (!stats.isFile()) return
  // 已存在且大小一致就跳过：重复调用要幂等，也不覆盖别处（可能更新）的同名文件
  try {
    if (existsSync(dest) && statSync(dest).size === stats.size) return
  } catch { /* 探测失败就当需要写 */ }
  try {
    copyFileSync(source, dest)
    counter.files += 1
  } catch { /* 单个文件写不了不该让整次复制失败 */ }
}

/**
 * 把一个**插件包外面**的候选（dsh 自带那份 pi-ai）复制成安全区里的私有副本。
 *
 * 副本就是链的目标：插件包被递归删除时，被连坐的是副本而不是 dsh 安装树。副本丢了不算事故，
 * 下次启动从 dsh 那份重新复制即可（{@link repairPiAiFromCopy} 反过来用它补 dsh 那份）。
 * @param source - 候选的包目录（必须在插件包外面，调用方判断）。
 * @param version - 版本号：副本按版本分目录，版本一致就复用。
 * @param destRoot - 副本根目录，默认安全区（测试用来注入临时目录）。
 * @returns 副本目录；复制失败返回 undefined（调用方退回直连，不能让桥因此不可用）。
 */
export function ensureSafeCopy(source: string, version: string, destRoot: string = safePiAiDir): string | undefined {
  const dest = join(destRoot, version)
  try {
    // 候选自己可能是一条链（profile 的 node_modules 农场就是），复制要复制**链的目标**——
    // 直接抄链会被 copyTreeNoLinks 按「链一律跳过」的规矩跳过，落一个空副本。
    const from = (() => {
      try {
        return realpathSync(source)
      } catch {
        return source
      }
    })()
    if (existsSync(join(dest, 'package.json')) && piAiVersionOf(dest) === piAiVersionOf(from)) return dest
    // 用 removeTree 而不是 removeLinkOrDir：这里的 dest 是自己拼出来的副本目录，
    // 不受「只能在受管目录里递归删」那条约束（测试会注入临时 destRoot），但**同样必须**
    // 走链感知的递归删除——万一副本目录里被塞了链，跟进就会删到链的目标。
    removeTree(dest)
    mkdirSync(dest, { recursive: true })
    copyTreeNoLinks(from, dest)
    return existsSync(join(dest, 'package.json')) ? dest : undefined
  } catch {
    return undefined
  }
}

/**
 * dsh 自带那份 pi-ai 的入口是否已经解不开（只看文件在不在，不加载）。
 *
 * 「目录还在、入口没了」正是 junction 连坐删除留下的残状态：官方 `llm-pi-ai` 入口会以
 * `Cannot find package '<目录>\index.js'` 失败，dsh 连启动都起不来。
 * @param root - pi-ai 包目录。
 */
export function piAiEntryMissing(root: string): boolean {
  let pkg: AnyRecord
  try {
    pkg = asRecord(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')))
  } catch {
    return true
  }
  const exportsField = pkg['exports']
  if (exportsField !== undefined) {
    const entry = exportsEntry(exportsField)
    if (entry !== undefined) return !existsSync(resolve(root, entry))
  }
  const main = readString(pkg['main'])
  if (main !== undefined) return !existsSync(resolve(root, main))
  return !existsSync(join(root, 'index.js'))
}

/** 从 `exports` 里抠出 `.` 这条的入口文件：够 pi-ai 这种简单映射用。 */
function exportsEntry(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return undefined
  const record = asRecord(value)
  const dot: unknown = record['.'] ?? record
  if (typeof dot === 'string') return dot
  const inner = asRecord(dot)
  for (const key of ['import', 'default', 'node', 'module']) {
    const target = inner[key]
    if (typeof target === 'string') return target
    if (target !== null && typeof target === 'object') {
      const nested = asRecord(target)['default']
      if (typeof nested === 'string') return nested
    }
  }
  return undefined
}

/**
 * 用安全副本把 dsh 自带那份 pi-ai 补回来（**只补缺，不删任何东西**）。
 *
 * 只在「目录还在、入口/package.json 丢了」这种残状态下动手。本插件挂在根 include 之前，
 * 所以这里补上就等于把 dsh 从「打不开」救回「能启动」——同一次启动里，官方 `llm-pi-ai`
 * 入口随后就会正常加载。
 * @param target - dsh 自带的 pi-ai 包目录。
 * @param copy - 安全副本目录。
 * @returns 补回来的文件数（0 表示没动手）。
 */
export function repairPiAiFromCopy(target: string, copy: string): number {
  if (!existsSync(target) || !existsSync(copy)) return 0
  if (!piAiEntryMissing(target)) return 0
  return copyTreeNoLinks(copy, target)
}

/**
 * 体检一个 pi-ai 候选：那份拷贝要的子路径和具名导出，这份 pi-ai 给不给得出。
 *
 * **为什么不直接试着加载拷贝**：Node 对加载失败的 ESM 会留下半初始化记录，同一个文件
 * 再 require 只会报 "not yet fully loaded"——也就是说"先试再退"这条路走不通，必须在加载
 * 之前判。所以体检换个模块来做：照着需求生成一份探针文件，放进自己的临时目录里，配一条
 * 指向候选的软链。解析规则与拷贝完全一致（同一个父目录、同一条链），但模块 URL 不同，
 * 失败不污染拷贝。
 *
 * 探针目录按候选命名：同一候选复用同一条 URL（结论一致），不同候选互不干扰。
 * @param requirements - {@link piAiRequirements} 的结果。
 * @param root - 候选的 pi-ai 包目录。
 * @param key - 候选标识，用于区分探针目录。
 */
export function probePiAi(requirements: readonly PiAiRequirement[], root: string, key: string): ProbeResult {
  // 候选目录不在就直接判死，**且绝不能建断链**：探针目录在 vendor/llm-bridge/ 下面，
  // 断链会让 Node 继续往上找，一路找到主软链上那份能用的 pi-ai，把不合格的候选误判成通过。
  if (!existsSync(root)) return { ok: false, error: '目录不存在' }
  // 需求没解析出来（bundle 换了打包格式）就没法验证：放行，但标 unverified——
  // 调用方（loadBridge / updater）据此知道这是「没体检」，不是「体检通过」。
  if (requirements.length === 0) return { ok: true, unverified: true }
  const dir = join(bridgeDir, `.probe-${String(key).replace(/[^A-Za-z0-9._-]/g, '_')}`)
  try {
    const linkDir = join(dir, 'node_modules', '@earendil-works')
    mkdirSync(linkDir, { recursive: true })
    const link = join(linkDir, 'pi-ai')
    removeLinkOrDir(link)
    const spec = linkSpec(linkDir, root)
    symlinkSync(spec.target, link, spec.type)
    // 具名需求验证导出存在；bare 需求（namespace/默认/副作用导入、export *）只要子路径能加载
    const lines = requirements.map(({ specifier, names }) =>
      names.length > 0
        ? `import { ${names.join(', ')} } from ${JSON.stringify(specifier)}`
        : `import ${JSON.stringify(specifier)}`)
    lines.push('export const ok = true')
    writeFileSync(join(dir, 'probe.js'), lines.join('\n') + '\n')
    const require = createRequire(import.meta.url)
    require(join(dir, 'probe.js'))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * pi-ai 候选，按优先级排：
 *   1. `vendor/pi-ai/<版本>/`——updater 下载下来的，新 → 旧
 *   2. `vendor/node_modules/@earendil-works/pi-ai`——可选的手装兜底档（vendor/package.json 锁定）
 *   3. dsh 自己装的那份——从官方 bundle 的位置解析出来，包放哪一层都能找到
 */
export function piAiCandidates(): PiAiCandidate[] {
  const list: PiAiCandidate[] = []
  const versions = installedVersions()
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const version = versions[i]
    if (version === undefined) continue
    list.push({ key: version, version, root: join(piAiVersionsDir, version), link: true })
  }
  const dependency = pluginDependencyRoot()
  list.push({ key: 'dependency', version: piAiVersionOf(dependency) ?? '内置依赖', root: dependency, link: false })
  // dsh 安装树里那份真目录：优先于「沿 bundle 解析链找到的那条」。理由有两个——
  //   1. pi-ai 的依赖（typebox 等）只在 dsh 安装树的 node_modules 里，所以它必须是真目录、
  //      必须还在安装树里（见 syncBridgeLinks 的说明）；
  //   2. 沿 bundle 链找到的往往是一层手工 junction 农场（`profiles/node_modules/...`），
  //      依赖那条链等于把插件挂到别人的手工修复上，那条链没了桥就找不到 pi-ai。
  const appRoot = dshPiAiRoot(join(dirname(process.execPath), 'resources', 'app', 'lib', '_anchor.js'))
  if (appRoot !== undefined) {
    list.push({ key: 'dsh-app', version: piAiVersionOf(appRoot) ?? 'dsh 自带', root: appRoot, link: true })
  }
  const dshRoot = dshPiAiRoot(findSourceBundle())
  if (dshRoot !== undefined) {
    list.push({ key: 'dsh', version: piAiVersionOf(dshRoot) ?? 'dsh 自带', root: dshRoot, link: true })
  }
  return list
}

function readStatus(): AnyRecord {
  try {
    return asRecord(JSON.parse(readFileSync(statusFile, 'utf8')))
  } catch {
    return {}
  }
}

/**
 * 合并状态补丁：传 `undefined` 表示**删掉这个键**。
 *
 * JSON.stringify 会丢掉 undefined，光靠 `{...old, ...patch}` 覆盖不掉旧值，于是
 * "上次体检没过"这类记录会一直粘着——明明后来通过了，界面上还挂着。
 * @param previous - 现有状态。
 * @param patch - 本次要写的字段。
 */
export function mergeStatus(previous: AnyRecord, patch: AnyRecord): AnyRecord {
  const merged: AnyRecord = { ...previous, ...patch }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key]
  }
  return merged
}

function writeStatus(patch: AnyRecord): void {
  mkdirSync(vendorDir, { recursive: true })
  writeFileSync(statusFile, JSON.stringify({ ...mergeStatus(readStatus(), patch), updatedAt: new Date().toISOString() }))
}

export function updateStatus(patch: AnyRecord): void {
  writeStatus(patch)
}

/**
 * 确保桥接目录就位（同步、幂等），返回加载好的 bridge 插件模块。
 */
export function loadBridge(): BridgeLoadResult {
  try {
    const srcBundle = findSourceBundle()
    if (srcBundle === undefined) {
      return { ok: false, error: '找不到官方 llm-pi-ai bundle：profile 的 node_modules 与 dsh 安装目录里都没有 @deepseek-ai/dsh-llm-pi-ai', rejected: [], candidates: [] }
    }

    // 1. 桥接目录：bundle 副本（源更新过就重拷）+ 固定 package.json
    mkdirSync(join(bridgeDir, 'lib'), { recursive: true })
    const needsCopy = !existsSync(bridgeLib)
      || statSync(srcBundle).mtimeMs > statSync(bridgeLib).mtimeMs
    if (needsCopy) copyFileSync(srcBundle, bridgeLib)
    writeFileSync(join(bridgeDir, 'package.json'), BRIDGE_PACKAGE_JSON)

    // 2. 挑一份能用的 pi-ai：候选按优先级排（热更新的新→旧 → 插件自带依赖 → dsh 自带），
    //    逐个体检，第一个通过的就是这次用的。**体检必须在加载之前**——ESM 加载失败后
    //    同一个文件没法重试，所以不能"先试再退"。
    //
    //    目录不存在的档直接跳过，不算"体检没通过"：那是这一档没安装（可选档），不是兼容性
    //    问题。写进 rejected 的话，界面上会出现「跳过 兜底依赖：兼容性检查没通过」这种
    //    看着像故障、其实一切正常的行。
    const requirements = piAiRequirements(readFileSync(bridgeLib, 'utf8'))
    const rejected: RejectedCandidate[] = []
    const candidates: CandidateProbe[] = []
    let chosen: PiAiCandidate | undefined
    let probeUnverified = false
    let repairedFiles = 0
    let safeCopy: string | undefined
    /**
     * 备份/自愈只服务**插件自己管理的 pi-ai**（updater 下载进 `vendor/pi-ai/<版本>/` 的那些）：
     * 备份放在插件包外的安全区，包管理器整棵删插件包时丢的也只是这份可重建的备份。
     *
     * 用 dsh 自带那份时**不留副本、不做修复**（用户 09-19 决定）：那份是 dsh 的东西，与当前
     * 版本一致，多复制 ≈6 MB 没有意义；r6 之后本插件也不可能再把它清空。哪天真切换成「插件
     * 管理的更新版本」，这一路径天然就会启用——候选落在本插件里，备份/补缺都走下面这套。
     * @param candidate - 候选。
     */
    const prepareCandidate = (candidate: PiAiCandidate): void => {
      if (isOutsidePlugin(candidate.root)) return // dsh 自带那份：不备份、不修复
      const copy = ensureSafeCopy(candidate.root, candidate.version)
      if (copy === undefined) return
      safeCopy = copy
      if (piAiEntryMissing(candidate.root)) {
        repairedFiles += repairPiAiFromCopy(candidate.root, copy)
      }
    }
    for (const candidate of piAiCandidates()) {
      if (!existsSync(candidate.root)) {
        // 目录不存在不算「体检没通过」（那是这一档没装），但要**留在报告里**：候选全不存在时，
        // 报错必须能说出哪几条路径被找过、都不在——静默 continue 会让用户只看到一句空白报错。
        candidates.push({ key: candidate.key, version: candidate.version, root: candidate.root, exists: false, used: false, reason: '目录不存在' })
        continue
      }
      prepareCandidate(candidate)
      const probe = probePiAi(requirements, candidate.root, candidate.key)
      if (probe.ok) {
        chosen = { ...candidate, root: candidate.root }
        probeUnverified = probe.unverified === true
        candidates.push({ key: candidate.key, version: candidate.version, root: candidate.root, exists: true, used: true })
        break
      }
      rejected.push({ version: candidate.version, error: probe.error, path: candidate.root })
      candidates.push({ key: candidate.key, version: candidate.version, root: candidate.root, exists: true, used: false, reason: `体检没通过：${String(probe.error)}` })
    }
    if (chosen === undefined) {
      // 报错带上每一条候选的路径与结论：这是用户在日志里唯一能看到的东西，
      // 一句「没有能用的 pi-ai」+ 一片空白等于没有诊断信息。宿主那份不完整时，
      // 再给出**可执行**的恢复指引（npm 官方渠道覆盖回宿主目录，插件不代劳下载）。
      const detail = candidates
        .map((entry) => `${entry.version} ${entry.root}（${entry.reason ?? '未选中'}）`)
        .join('；')
      const host = candidates
        .filter((entry) => entry.key === 'dsh' || entry.key === 'dsh-app')
        .map((entry) => ({ root: entry.root, integrity: inspectPiAi(entry.root) }))
        .find((probe) => probe.integrity.hasManifest && !probe.integrity.usable)
      const hint = host === undefined
        ? ''
        : `
${describeIntegrity(host.root, host.integrity)}
${restoreHint(host.integrity.version)}`
      return {
        ok: false,
        error: `没有能用的 pi-ai：${detail === '' ? '（候选清单为空）' : detail}${hint}`,
        rejected,
        candidates,
      }
    }

    // 3. 生效：把桥接副本要的包全铺成链田（pi-ai 指中选那份，其余按 bundle 的 bare 导入
    //    逐个指过去）。链田在安全区里——插件包被递归删除时，被连坐的只会是安全区里的东西，
    //    而 dsh 安装树里的 pi-ai 一个字节都不会动。
    syncBridgeLinks(srcBundle, chosen.root)

    // 4. 同步 require 加载（Node 22.12+/24 支持 require ESM；bundle 无 TLA）
    const require = createRequire(import.meta.url)
    delete require.cache?.[bridgeLib]
    const plugin = require(bridgeLib) as BridgePluginModule

    activeRoot = chosen.root
    writeStatus({
      piAiVersion: chosen.version,
      needsRestart: false,
      piAiSource: chosen.key,
      probeUnverified: probeUnverified || undefined,
      safeCopy: safeCopy ?? undefined,
      repairedFiles: repairedFiles > 0 ? repairedFiles : undefined,
      ...(rejected.length === 0 ? { rejected: undefined } : { rejected }),
    })
    return { ok: true, plugin, piAiVersion: chosen.version, piAiSource: chosen.key, probeUnverified, rejected, candidates, repairedFiles }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), rejected: [], candidates: [] }
  }
}

/**
 * 把桥接副本需要的包铺成链田，pi-ai 指中选那份。
 *
 * 为什么需要链田：桥接副本在安全区里，从它往上走的 node_modules 链到不了 profile 的
 * node_modules，bundle 里的 `@deepseek-ai/*` 就解析不到；pi-ai 也要一条链指过去。
 *
 * 为什么 pi-ai 那条链指向**真目录**而不是副本：pi-ai 自己的依赖（typebox、openai、
 * @anthropic-ai/sdk……）靠它就地的 node_modules 链解析。本机实测把 pi-ai 复制到
 * `~/.dsh/` 下再导入，直接报 `Cannot find package 'typebox'`——Node 按链解析完之后的
 * **真实路径**去找依赖，所以 pi-ai 必须留在 dsh 安装树里。
 *
 * 一个指向没变的链不重建：避免每次启动都动一遍目录 mtime。目标不存在（悬空）则重建。
 * @param bundlePath - 官方 bundle 的入口文件（用来解析它依赖的包在哪）。
 * @param piAiRoot - 中选的 pi-ai 包目录。
 */
export function syncBridgeLinks(bundlePath: string, piAiRoot: string): number {
  const farm = join(bridgeDir, 'node_modules')
  let links = 0
  const wire = (specifier: string, target: string | undefined): void => {
    if (target === undefined) return
    const parts = specifier.split('/')
    const linkDir = join(farm, ...parts.slice(0, -1))
    const linkPath = join(farm, ...parts)
    mkdirSync(linkDir, { recursive: true })
    const spec = linkSpec(linkDir, target)
    let current: string | undefined
    try {
      // readlink 而不是 readFile：链指向的是目录，readFile 会解析进去抛 EISDIR
      current = readlinkSync(linkPath)
    } catch { /* 还没有链 */ }
    const healthy = existsSync(linkPath)
    if (current === spec.target && healthy) return
    removeLinkOrDir(linkPath)
    try {
      symlinkSync(spec.target, linkPath, spec.type)
      links += 1
    } catch { /* 单条链建不起来不该让整次装载失败：体检会给出结论 */ }
  }

  wire('@earendil-works/pi-ai', piAiRoot)
  let source = ''
  try {
    source = readFileSync(bundlePath, 'utf8')
  } catch {
    return links
  }
  for (const specifier of bundleSpecifiers(source)) {
    if (specifier.startsWith('@earendil-works/pi-ai')) continue // 上面已经指过了
    wire(specifier, resolvePackageRoot(bundlePath, specifier))
  }
  return links
}

/**
 * bundle 里的 bare specifier 清单（相对路径、node: 内置、URL 都排除）。
 *
 * 链田按它铺：bundle 里每一个外部包都要能在桥接副本的解析路径上找到。
 * @param source - bundle 源码。
 */
export function bundleSpecifiers(source: string): string[] {
  const found = new Set<string>()
  const pattern = /(?:\bfrom|\bimport|\bexport)\s*\(?\s*["']([^"']+)["']/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const specifier = match[1] ?? ''
    if (specifier === '' || specifier.startsWith('.') || specifier.startsWith('/')) continue
    if (/^[a-zA-Z]+:/.test(specifier)) continue // node:fs、data:、file:……
    found.add(specifier)
  }
  return [...found].sort()
}

/**
 * 把一条链换回真目录：摘链（只摘链，目标不动）后从安全副本复制文件进来。
 *
 * 用于修「别人把 dsh 自带的 pi-ai 换成了指向别处的 junction」这种残状态——解析会走到链的
 * 目标去，pi-ai 的依赖随即找不到（`Cannot find package 'typebox'`）。已经是真目录就什么都不做。
 * @param target - 候选包目录。
 * @param copy - 安全副本目录。
 * @returns 复制进来的文件数（0 表示没动手）。
 */
export function materializeFromCopy(target: string, copy: string): number {
  if (!existsSync(copy)) return 0
  let stats: Stats | undefined
  try {
    stats = lstatSync(target)
  } catch {
    stats = undefined
  }
  if (stats !== undefined && !stats.isSymbolicLink()) return 0 // 真目录/真文件：不动
  if (stats !== undefined) {
    try {
      unlinkSync(target)
    } catch {
      return 0
    }
  }
  return copyTreeNoLinks(copy, target)
}

/**
 * 相对路径（自写而不用 path.relative）：软链目标一律用正斜杠。
 * 只在 POSIX 上用到——Windows 走 junction，目标是绝对路径。
 */
function relative(from: string, to: string): string {
  const fromParts = from.split(sep)
  const toParts = to.split(sep)
  let i = 0
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++
  const up = fromParts.length - i
  return [...Array.from({ length: up }, () => '..'), ...toParts.slice(i)].join('/')
}

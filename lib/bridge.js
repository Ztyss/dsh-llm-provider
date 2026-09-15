/**
 * pi-ai 桥接层：让 dsh 的官方 llm-pi-ai 适配器跑在我们自己维护的新版 pi-ai 上。
 *
 * 原理（2026-09-12 实验验证）：
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
 * 边界：本模块只写插件自己的 vendor/ 目录；对 pi-ai 的目录补丁只打 vendor 里那份，
 * 内置依赖和 dsh 自带那份一个字节都不改。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshHome } from './settings-source.js'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const vendorDir = join(pluginRoot, 'vendor')
const bridgeDir = join(vendorDir, 'llm-bridge')
const bridgeLib = join(bridgeDir, 'lib', 'index.js')
const piAiVersionsDir = join(vendorDir, 'pi-ai')
const statusFile = join(vendorDir, 'status.json')

const BRIDGE_PACKAGE_JSON = JSON.stringify({
  name: 'dsh-provider-llm-bridge',
  version: '0.0.0',
  type: 'module',
  main: 'lib/index.js',
  exports: { '.': './lib/index.js', './package.json': './package.json' },
}, null, 2)

/** vendor/pi-ai/ 下已就位的版本目录（有 node_modules 的才算就位）。 */
export function installedVersions() {
  try {
    return readdirSync(piAiVersionsDir)
      .filter((name) => existsSync(join(piAiVersionsDir, name, 'package.json'))
        && existsSync(join(piAiVersionsDir, name, 'node_modules')))
      .sort(compareVersions)
  } catch {
    return []
  }
}

/** semver 数字比较，够用即可（pi-ai 是 0.x.y 格式）。 */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 插件自己声明的 pi-ai 依赖装在这儿（包管理器装的，是"验证过的兜底版本"）。 */
function pluginDependencyRoot() {
  return join(pluginRoot, 'node_modules', '@earendil-works', 'pi-ai')
}

/**
 * 当前生效的 pi-ai 包目录。
 *
 * loadBridge() 挑定之后以它为准——挑的时候可能回退过，跟"vendor 里最新"不是一回事，
 * 而这个根目录下面那三个读 pi-ai 文件的模块（provider 名字、模型详情、候选清单）
 * 必须跟真正被加载的那份对上。没跑过 loadBridge 的场合退回静态推断。
 */
let activeRoot
export function activePiAiRoot() {
  if (activeRoot !== undefined) return activeRoot
  const versions = installedVersions()
  if (versions.length > 0) return join(piAiVersionsDir, versions[versions.length - 1])
  if (existsSync(pluginDependencyRoot())) return pluginDependencyRoot()
  try {
    return join(resolveDshHome(), 'profiles', 'node_modules', '@earendil-works', 'pi-ai')
  } catch {
    return undefined
  }
}

/** 读一个 pi-ai 包的版本号；读不到返回 undefined。 */
function piAiVersionOf(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  } catch {
    return undefined
  }
}

/**
 * 从 bundle 源码里抠出它对 pi-ai 的 import 需求。
 *
 * 拷来的那份代码写的是 bare specifier；上游改了导出名或子路径，加载就会炸。
 * 这里把"它到底要什么"读出来，好在加载**之前**就能判断某份 pi-ai 合不合格。
 * @param source - bundle 源码。
 * @returns `[{ specifier, names }]`；解析不出来时返回空数组（调用方据此跳过体检）。
 */
export function piAiRequirements(source) {
  const found = []
  const pattern = /import\s*\{([^}]*)\}\s*from\s*["'](@earendil-works\/pi-ai[^"']*)["']/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const names = match[1]
      .split(',')
      .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
      .filter((name) => name !== '')
    if (names.length > 0) found.push({ specifier: match[2], names })
  }
  return found
}

/** 读桥接副本，返回它对 pi-ai 的 import 需求（updater 装完新版本也拿它体检）。 */
export function bridgeRequirements() {
  try {
    return piAiRequirements(readFileSync(bridgeLib, 'utf8'))
  } catch {
    return []
  }
}

/**
 * 体检一个 pi-ai 候选：那份拷贝要的子路径和具名导出，这份 pi-ai 给不给得出。
 *
 * **为什么不直接试着加载拷贝**：Node 对加载失败的 ESM 会留下半初始化记录，同一个文件
 * 再 require 只会报 "not yet fully loaded"（2026-09-15 实测）——也就是说"先试再退"这条路
 * 走不通，必须在加载之前判。所以体检换个模块来做：照着需求生成一份探针文件，放进自己的
 * 临时目录里，配一条指向候选的软链。解析规则与拷贝完全一致（同一个父目录、同一条链），
 * 但模块 URL 不同，失败不污染拷贝。
 *
 * 探针目录按候选命名：同一候选复用同一条 URL（结论一致），不同候选互不干扰。
 * @param requirements - {@link piAiRequirements} 的结果。
 * @param root - 候选的 pi-ai 包目录。
 * @param key - 候选标识，用于区分探针目录。
 * @returns `{ ok: true }` 或 `{ ok: false, error }`。
 */
export function probePiAi(requirements, root, key) {
  // 候选目录不在就直接判死，**且绝不能建断链**：探针目录在 vendor/llm-bridge/ 下面，
  // 断链会让 Node 继续往上找，一路找到主软链上那份能用的 pi-ai，把不合格的候选误判成通过
  // （实测踩过：内置依赖被移走后仍然"通过"，最后在真正加载时才炸）。
  if (!existsSync(root)) return { ok: false, error: '目录不存在' }
  // 需求没解析出来（bundle 换了打包格式）就不拦路，目录存在即放行
  if (requirements.length === 0) return { ok: true }
  const dir = join(bridgeDir, `.probe-${String(key).replace(/[^A-Za-z0-9._-]/g, '_')}`)
  try {
    const linkDir = join(dir, 'node_modules', '@earendil-works')
    mkdirSync(linkDir, { recursive: true })
    const link = join(linkDir, 'pi-ai')
    rmSync(link, { force: true, recursive: true })
    symlinkSync(root, link, 'dir')
    const lines = requirements.map(({ specifier, names }) =>
      `import { ${names.join(', ')} } from ${JSON.stringify(specifier)}`)
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
 *   1. `vendor/pi-ai/<版本>/`——updater 热更新下来的，新 → 旧
 *   2. 插件自己声明的依赖——package.json 里锁死的那个版本，验证过的兜底
 *   3. dsh 自己装的那份——裸克隆、依赖还没装时的最后一根稻草
 * @returns 每项 `{ key, version, root, link }`；`link: false` 表示不建软链、靠自然解析落到它。
 */
export function piAiCandidates() {
  const list = []
  const versions = installedVersions()
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const version = versions[i]
    list.push({ key: version, version, root: join(piAiVersionsDir, version), link: true })
  }
  const dependency = pluginDependencyRoot()
  list.push({ key: 'dependency', version: piAiVersionOf(dependency) ?? '内置依赖', root: dependency, link: false })
  try {
    const dshRoot = join(resolveDshHome(), 'profiles', 'node_modules', '@earendil-works', 'pi-ai')
    list.push({ key: 'dsh', version: piAiVersionOf(dshRoot) ?? 'dsh 自带', root: dshRoot, link: true })
  } catch { /* 拿不到 DSH_HOME 就算了 */ }
  return list
}

function readStatus() {
  try {
    return JSON.parse(readFileSync(statusFile, 'utf8'))
  } catch {
    return {}
  }
}

function writeStatus(patch) {
  mkdirSync(vendorDir, { recursive: true })
  writeFileSync(statusFile, JSON.stringify({ ...readStatus(), ...patch, updatedAt: new Date().toISOString() }))
}

export function updateStatus(patch) {
  writeStatus(patch)
}

/**
 * 目录补丁：pi-ai 的模型数据是静态快照，官方模型升级后字段会滞后。
 * 这里按「数据文件 → 模型 id → 字段覆盖」修正在用目录，等上游发新版后把对应条目删掉即可。
 * 每条都要写 reason（依据来源），没有出处的不 patch。
 */
export const CATALOG_PATCHES = [
  {
    file: 'kimi-coding.json',
    model: 'kimi-for-coding',
    set: { name: 'Kimi K2.8 Preview', contextWindow: 1048576 },
    reason: 'Kimi 官方文档(2026-09)：kimi-for-coding 已升级为 K2.8 Preview，上下文 1M；pi-ai 0.85.1 仍写 K2.7/256k',
  },
]

/**
 * 把 CATALOG_PATCHES 应用到指定 pi-ai 安装目录（同步、幂等）。
 * @param piAiRoot pi-ai 包目录（vendor/pi-ai/<v> 或 profile 里的兜底副本）
 * @returns 本次实际改动（或已处于目标状态）的补丁条目
 */
export function applyCatalogPatches(piAiRoot) {
  const applied = []
  for (const patch of CATALOG_PATCHES) {
    const filePath = join(piAiRoot, 'dist', 'providers', 'data', patch.file)
    let data
    try {
      data = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch {
      continue // 文件不存在或坏了：不 patch，让上游数据说话
    }
    let changed = false
    for (const api of Object.keys(data)) {
      const entry = data[api] && data[api][patch.model]
      if (entry === undefined || entry === null || typeof entry !== 'object') continue
      for (const [key, value] of Object.entries(patch.set)) {
        if (entry[key] !== value) {
          entry[key] = value
          changed = true
        }
      }
    }
    if (changed) {
      writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
    }
    applied.push({ ...patch, changed })
  }
  return applied
}

/**
 * 确保桥接目录就位（同步、幂等），返回加载好的 bridge 插件模块。
 * @returns {{ ok: true, plugin: any, piAiVersion: string, catalogPatches: any[] } | { ok: false, error: string }}
 */
export function loadBridge() {
  try {
    const profileModules = join(resolveDshHome(), 'profiles', 'node_modules')
    const srcBundle = join(profileModules, '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')

    if (!existsSync(srcBundle)) return { ok: false, error: `找不到官方 llm-pi-ai bundle：${srcBundle}` }

    // 1. 桥接目录：bundle 副本（源更新过就重拷）+ 固定 package.json
    mkdirSync(join(bridgeDir, 'lib'), { recursive: true })
    const needsCopy = !existsSync(bridgeLib)
      || statSync(srcBundle).mtimeMs > statSync(bridgeLib).mtimeMs
    if (needsCopy) copyFileSync(srcBundle, bridgeLib)
    writeFileSync(join(bridgeDir, 'package.json'), BRIDGE_PACKAGE_JSON)

    // 2. 挑一份能用的 pi-ai：候选按优先级排（热更新的新→旧 → 内置依赖 → dsh 自带），
    //    逐个体检，第一个通过的就是这次用的。**体检必须在加载之前**——ESM 加载失败后
    //    同一个文件没法重试，所以不能"先试再退"。
    const requirements = piAiRequirements(readFileSync(bridgeLib, 'utf8'))
    const rejected = []
    let chosen
    for (const candidate of piAiCandidates()) {
      const probe = probePiAi(requirements, candidate.root, candidate.key)
      if (probe.ok) {
        chosen = candidate
        break
      }
      rejected.push({ version: candidate.version, error: probe.error })
    }
    if (chosen === undefined) {
      return {
        ok: false,
        error: `没有能用的 pi-ai：${rejected.map((entry) => `${entry.version}（${entry.error}）`).join('；')}`,
      }
    }

    // 3. 生效：热更新档挂软链指过去；兜底档（插件自己的依赖）不挂，让 Node 自然往上找到它
    if (chosen.link) setPiAiLink(chosen.root)
    else clearPiAiLink()

    // 4. 目录补丁：**只打我们自己 vendor 里那份**。别的档拿到的是包管理器或 dsh 装的
    //    pi-ai，属于别的程序的文件，插件不该写——实测写脏过一次全局安装。
    const catalogPatches = isVendoredRoot(chosen.root) ? applyCatalogPatches(chosen.root) : []

    // 5. 同步 require 加载（Node 22.12+/24 支持 require ESM；bundle 无 TLA）
    const require = createRequire(import.meta.url)
    delete require.cache?.[bridgeLib]
    const plugin = require(bridgeLib)

    activeRoot = chosen.root
    writeStatus({
      piAiVersion: chosen.version,
      needsRestart: false,
      piAiSource: chosen.key,
      ...(rejected.length === 0 ? { rejected: undefined } : { rejected }),
    })
    return { ok: true, plugin, piAiVersion: chosen.version, piAiSource: chosen.key, catalogPatches, rejected }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 把桥接副本的 pi-ai 软链指向指定包目录（指向没变就不动，避免无谓的 mtime 抖动）。 */
function setPiAiLink(target) {
  const linkDir = join(bridgeDir, 'node_modules', '@earendil-works')
  mkdirSync(linkDir, { recursive: true })
  const linkPath = join(linkDir, 'pi-ai')
  const relTarget = relative(linkDir, target)
  let current
  try {
    current = readFileSync(linkPath, { encoding: 'utf8' })
  } catch { /* 还没有软链 */ }
  if (current === relTarget) return
  rmSync(linkPath, { force: true, recursive: true })
  symlinkSync(relTarget, linkPath, 'dir')
}

/**
 * 删掉软链，让那份拷贝走自然解析，落到插件自己的 node_modules。
 *
 * 这就是"回退到内置依赖"的动作——不用另外指一条链过去，Node 会自己往上找。
 */
function clearPiAiLink() {
  rmSync(join(bridgeDir, 'node_modules', '@earendil-works', 'pi-ai'), { force: true, recursive: true })
}

/**
 * 这个 pi-ai 包目录是不是我们自己 vendor 里的。
 *
 * 只有 vendor 里那份可以改（目录补丁会往它的 data/*.json 写）。false 时拿到的是
 * dsh 全局安装的 pi-ai——属于别的程序，插件对它只能读。
 * @param piAiRoot - pi-ai 包目录。
 */
export function isVendoredRoot(piAiRoot) {
  return typeof piAiRoot === 'string' && piAiRoot.startsWith(piAiVersionsDir + sep)
}

/** 相对路径工具（避免额外 import）。 */
function relative(from, to) {
  const fromParts = from.split(sep)
  const toParts = to.split(sep)
  let i = 0
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++
  const up = fromParts.length - i
  return [...Array.from({ length: up }, () => '..'), ...toParts.slice(i)].join('/')
}

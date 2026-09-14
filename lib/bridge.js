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
 * 升级 = 换软链指向 + 拷一份新 bundle，回滚 = 指回旧版本目录。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
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

/** 当前生效的 pi-ai 版本：软链指向谁就是谁。 */
export function currentPiAiVersion() {
  try {
    const link = readlinkSync(join(bridgeDir, 'node_modules', '@earendil-works', 'pi-ai'))
    return link.split(sep).pop() ?? undefined
  } catch {
    return undefined
  }
}

/** 当前生效的 pi-ai 包目录（bridge 装载逻辑同款选择：vendor 最新版 → profile 兜底）。 */
export function activePiAiRoot() {
  const versions = installedVersions()
  const newest = versions.length > 0 ? versions[versions.length - 1] : undefined
  if (newest !== undefined) return join(piAiVersionsDir, newest)
  try {
    return join(resolveDshHome(), 'profiles', 'node_modules', '@earendil-works', 'pi-ai')
  } catch {
    return undefined
  }
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
    const profilePiAi = join(profileModules, '@earendil-works', 'pi-ai')
    const srcBundle = join(profileModules, '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')

    if (!existsSync(srcBundle)) return { ok: false, error: `找不到官方 llm-pi-ai bundle：${srcBundle}` }

    // 1. 桥接目录：bundle 副本（源更新过就重拷）+ 固定 package.json
    mkdirSync(join(bridgeDir, 'lib'), { recursive: true })
    const needsCopy = !existsSync(bridgeLib)
      || statSync(srcBundle).mtimeMs > statSync(bridgeLib).mtimeMs
    if (needsCopy) copyFileSync(srcBundle, bridgeLib)
    writeFileSync(join(bridgeDir, 'package.json'), BRIDGE_PACKAGE_JSON)

    // 2. pi-ai 目标：优先 vendor 里就位的最新版本；没有就先指官方已装版（保底可用）
    const versions = installedVersions()
    const newest = versions.length > 0 ? versions[versions.length - 1] : undefined
    const target = newest !== undefined ? join(piAiVersionsDir, newest) : profilePiAi
    const piAiVersion = newest ?? 'profile 兜底'

    // 3. 软链（指向没变就不动，避免无谓的 mtime 抖动）
    const linkDir = join(bridgeDir, 'node_modules', '@earendil-works')
    mkdirSync(linkDir, { recursive: true })
    const linkPath = join(linkDir, 'pi-ai')
    const relTarget = relative(linkDir, target)
    let current
    try {
      current = readFileSync(linkPath, { encoding: 'utf8' })
    } catch { /* 还没有软链 */ }
    if (current !== relTarget) {
      rmSync(linkPath, { force: true, recursive: true })
      symlinkSync(relTarget, linkPath, 'dir')
    }

    // 4. 目录补丁：上游数据滞后时按官方文档修正（幂等，改在磁盘上，重启后生效）
    const catalogPatches = applyCatalogPatches(target)

    // 5. 同步 require 加载（Node 22.12+/24 支持 require ESM；bundle 无 TLA）
    const require = createRequire(import.meta.url)
    delete require.cache?.[bridgeLib]
    const plugin = require(bridgeLib)

    writeStatus({ piAiVersion, needsRestart: false })
    return { ok: true, plugin, piAiVersion, catalogPatches }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
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

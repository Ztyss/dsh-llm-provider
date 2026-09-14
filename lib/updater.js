/**
 * pi-ai 上游更新器：盯 @earendil-works/pi-ai 的 npm registry，
 * 有新版本就下载、装依赖、放进 vendor/pi-ai/<版本>/，然后换软链。
 *
 * 生效时机：软链换了之后，已 require 的旧模块不受影响——下一次 dsh 重启时
 * bridge.js 会挂到新版本。status.json 里用 needsRestart 标记这件事，
 * /provider/status 会报出来。
 *
 * 手动触发：POST /provider/update；自动检查默认只在插件启动时跑一次，
 * DSH_PROVIDER_UPDATE=off 可关。
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { compareVersions, installedVersions, updateStatus, vendorDir } from './bridge.js'

const execFileAsync = promisify(execFile)

const PACKAGE = '@earendil-works/pi-ai'
const REGISTRY = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE).replace('%40', '@')}`
const VERSIONS_DIR = join(vendorDir, 'pi-ai')
const STATE_FILE = join(vendorDir, 'updater-state.json')
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 小时

/** 上次检查时间等本地状态。 */
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeState(patch) {
  mkdirSync(vendorDir, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch, at: new Date().toISOString() }))
}

/** registry 上最新版本号。 */
export async function latestVersion() {
  const response = await fetch(REGISTRY, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`registry HTTP ${String(response.status)}`)
  const doc = await response.json()
  const latest = doc?.['dist-tags']?.latest
  if (typeof latest !== 'string' || latest === '') throw new Error('registry 响应里没有 dist-tags.latest')
  return latest
}

/** 下载并就位一个版本：tarball 解压到 vendor/pi-ai/<v>/，再补依赖闭包。已就位则跳过。 */
export async function installVersion(version, log = () => {}) {
  const target = join(VERSIONS_DIR, version)
  if (existsSync(join(target, 'node_modules'))) {
    log(`${version} 已就位，跳过下载`)
    return target
  }
  rmSync(target, { force: true, recursive: true })
  mkdirSync(target, { recursive: true })

  const tgzPath = join(tmpdir(), `pi-ai-${version}-${Date.now()}.tgz`)
  log(`下载 ${PACKAGE}@${version} ...`)
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE}/-/pi-ai-${version}.tgz`, {
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`tarball HTTP ${String(response.status)}`)
  writeFileSync(tgzPath, Buffer.from(await response.arrayBuffer()))

  log('解压 ...')
  await execFileAsync('tar', ['-xzf', tgzPath, '-C', target, '--strip-components', '1'])
  rmSync(tgzPath, { force: true })

  log('安装依赖（--omit=dev --ignore-scripts）...')
  // 用插件本地缓存：用户默认缓存可能因权限问题（root 属主残留）不可写，不该让它挡住更新
  const npmCache = join(vendorDir, '.npm-cache')
  mkdirSync(npmCache, { recursive: true })
  await execFileAsync('npm', [
    'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error',
    `--cache=${npmCache}`,
  ], {
    cwd: target,
    timeout: 300_000,
  })
  return target
}

/** 一次性检查 + 更新。返回给 /provider/status 的结果对象。 */
export async function checkAndUpdate(log = () => {}) {
  const result = { checkedAt: new Date().toISOString(), latest: undefined, installed: undefined, applied: false, error: undefined }
  try {
    const latest = await latestVersion()
    result.latest = latest
    const have = installedVersions()
    const newest = have.length > 0 ? have[have.length - 1] : undefined
    if (newest !== undefined && compareVersions(latest, newest) <= 0) {
      log(`已是最新（本地 ${newest}，上游 ${latest}）`)
      return result
    }
    await installVersion(latest, log)
    result.installed = latest
    updateStatus({ piAiVersion: latest, needsRestart: true, latestVersion: latest })
    result.applied = true
    log(`已就位 ${latest}，重启 dsh 后生效`)
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    log(`更新失败：${result.error}`)
  } finally {
    writeState({ lastCheck: result.checkedAt })
  }
  return result
}

/** 插件启动时调：距上次检查超过间隔才真的发请求，绝不阻塞启动。 */
export function startBackgroundCheck(logger) {
  if (process.env.DSH_PROVIDER_UPDATE === 'off') return
  const last = readState().lastCheck
  if (typeof last === 'string' && Date.now() - Date.parse(last) < AUTO_CHECK_INTERVAL_MS) return
  void checkAndUpdate((line) => logger?.info?.(`[pi-ai updater] ${line}`))
}

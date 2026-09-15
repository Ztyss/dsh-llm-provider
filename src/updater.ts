/**
 * pi-ai 上游更新器：盯 @earendil-works/pi-ai 的 npm registry，
 * 有新版本就下载、装依赖、放进 vendor/pi-ai/<版本>/，验证通过后标记待生效。
 *
 * 替换的硬规矩：**验证通过才能替换**，两道都过才算数——
 *   1. tarball 完整性：按 registry packument 里的 dist.integrity（sha512）校验下载内容；
 *   2. 兼容性体检：用桥接副本自己的 import 需求 probe 那份新 pi-ai（见 bridge.js 的
 *      probePiAi）。体检没跑起来（unverified，需求解析不出）一样不替换。
 * 通过后只写 status.json 的 needsRestart 标记——已 require 的旧模块不受影响，
 * 下一次 dsh 重启时 bridge.js 才会挂到新版本。/provider/status 会报出来。
 *
 * 触发方式：**只有手动**（设置页按钮 → POST /provider/update），没有启动期自动检查；
 * 上游新版本由用户决定什么时候装。
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { bridgeRequirements, compareVersions, installedVersions, probePiAi, updateStatus, vendorDir } from './bridge.js'
import { asRecord, readString, type AnyRecord, type Logger } from './types.js'

const execFileAsync = promisify(execFile)

const PACKAGE = '@earendil-works/pi-ai'
const REGISTRY = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE).replace('%40', '@')}`
const VERSIONS_DIR = join(vendorDir, 'pi-ai')
const STATE_FILE = join(vendorDir, 'updater-state.json')
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 小时

/** 一次检查 + 更新的结果（/provider/update 的响应体）。 */
export interface UpdateResult {
  checkedAt: string
  latest: string | undefined
  installed: string | undefined
  applied: boolean
  compatible: boolean | undefined
  error: string | undefined
}

/** registry 上最新版：版本号 + tarball 的 sha512（base64，无前缀）。 */
interface RegistryRelease {
  version: string
  integrity: string | undefined
}

/** 上次检查时间等本地状态。 */
function readState(): AnyRecord {
  try {
    return asRecord(JSON.parse(readFileSync(STATE_FILE, 'utf8')))
  } catch {
    return {}
  }
}

function writeState(patch: AnyRecord): void {
  mkdirSync(vendorDir, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch, at: new Date().toISOString() }))
}

/** registry 上最新版与它的 dist.integrity（下载校验用）。 */
export async function latestRelease(): Promise<RegistryRelease> {
  const response = await fetch(REGISTRY, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`registry HTTP ${String(response.status)}`)
  const doc = asRecord(await response.json())
  const latest = readString(asRecord(doc['dist-tags'])['latest'])
  if (latest === undefined) throw new Error('registry 响应里没有 dist-tags.latest')
  const versionDoc = asRecord(asRecord(doc['versions'])[latest])
  return { version: latest, integrity: readString(asRecord(versionDoc['dist'])['integrity']) }
}

/**
 * 拼一条能跨平台跑起来的 npm 命令。
 *
 * 直接 `execFile('npm', …)` 在 Windows 上是 ENOENT（npm 是 npm.cmd）；换成 `npm.cmd` 又会撞
 * Node 从 18.20.2 / 20.12 / 21.7 起的行为——不经 shell 执行 .cmd/.bat 一律 EINVAL；过 shell
 * 则要自己处理引号（`--cache=` 后面是路径，可能带空格）。
 *
 * 所以首选 Node 自带那份 npm 的 JS 入口，用 `node <npm-cli.js>` 跑：跨平台一致、不经过 .cmd、
 * 也没有 shell 解析。找不到才退回 PATH 上的 npm（Windows 上过 shell，参数自己加引号）。
 * @param args - 传给 npm 的参数。
 */
function npmCommand(args: readonly string[]): { file: string; args: string[]; shell: boolean } {
  const nodeDir = dirname(process.execPath)
  const cli = [
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows 与官方安装包
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // POSIX（nvm、fnm 常见布局）
  ].find((candidate) => existsSync(candidate))
  if (cli !== undefined) return { file: process.execPath, args: [cli, ...args], shell: false }
  const isWindows = process.platform === 'win32'
  return {
    file: isWindows ? 'npm.cmd' : 'npm',
    args: isWindows ? args.map((argument) => (/\s/.test(argument) ? `"${argument}"` : argument)) : [...args],
    shell: isWindows,
  }
}

/**
 * 下载并就位一个版本：tarball 校验后解压到 vendor/pi-ai/<v>/，再补依赖闭包。
 * 已就位则跳过（校验也不重跑——那份内容装的时候验过）。integrity 缺省时不校验，
 * 但会记一行日志：registry 正常都会给，缺了多半是请求/字段出了问题。
 */
export async function installVersion(release: RegistryRelease, log: (line: string) => void = () => {}): Promise<string> {
  const { version, integrity } = release
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
  const bytes = Buffer.from(await response.arrayBuffer())
  if (integrity !== undefined) {
    const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    if (actual !== integrity) {
      throw new Error(`tarball 校验失败（本地 sha512 与 registry 的 dist.integrity 不一致），拒绝安装 ${version}`)
    }
    log('完整性校验通过（sha512）')
  } else {
    log('registry 没给 dist.integrity，跳过完整性校验')
  }
  writeFileSync(tgzPath, bytes)

  log('解压 ...')
  await execFileAsync('tar', ['-xzf', tgzPath, '-C', target, '--strip-components', '1'])
  rmSync(tgzPath, { force: true })

  log('安装依赖（--omit=dev --ignore-scripts）...')
  // 用插件本地缓存：用户默认缓存可能因权限问题（root 属主残留）不可写，不该让它挡住更新
  const npmCache = join(vendorDir, '.npm-cache')
  mkdirSync(npmCache, { recursive: true })
  const npm = npmCommand([
    'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error',
    `--cache=${npmCache}`,
  ])
  await execFileAsync(npm.file, npm.args, {
    cwd: target,
    timeout: 300_000,
    ...(npm.shell ? { shell: true } : {}),
  })
  return target
}

/**
 * 一次性检查 + 更新。返回给 /provider/update 与 /provider/status。
 * @param log - 进度输出。
 * @param activeVersion - 当前正在用的 pi-ai 版本（可能来自 dsh 自带那份）。已经不比上游旧时
 *   不再下载——否则像 dsh 自带 0.85.1、上游也是 0.85.1 的情况下会白下一份一模一样的。
 */
export async function checkAndUpdate(
  log: (line: string) => void = () => {},
  activeVersion?: string,
): Promise<UpdateResult> {
  const result: UpdateResult = {
    checkedAt: new Date().toISOString(),
    latest: undefined,
    installed: undefined,
    applied: false,
    compatible: undefined,
    error: undefined,
  }
  try {
    const release = await latestRelease()
    result.latest = release.version
    if (activeVersion !== undefined && compareVersions(release.version, activeVersion) <= 0) {
      log(`当前已在 ${activeVersion}（上游 ${release.version}），无需下载`)
      return result
    }
    const have = installedVersions()
    const newest = have[have.length - 1]
    if (newest !== undefined && compareVersions(release.version, newest) <= 0) {
      log(`已是最新（本地 ${newest}，上游 ${release.version}）`)
      return result
    }
    const target = await installVersion(release, log)
    result.installed = release.version
    // 装完先体检：不兼容的版本不该让用户白重启一趟，也不该在下次启动时才被发现。
    // 体检用桥接副本自己的 import 需求（见 bridge.js 的 probePiAi）。
    const probe = probePiAi(bridgeRequirements(), target, `check-${release.version}`)
    result.compatible = probe.ok && probe.unverified !== true
    if (probe.ok && probe.unverified !== true) {
      updateStatus({ piAiVersion: release.version, needsRestart: true, latestVersion: release.version, latestRejected: undefined })
      result.applied = true
      log(`已验证 ${release.version}（完整性 + 兼容性体检），重启 dsh 后生效`)
    } else {
      // 留着不删：下次启动还会体检一遍，结论一致；万一判断有误也能人工指定。
      // unverified（需求解析不出）同样不替换——「验证才能替换」没有例外。
      const reason = probe.unverified === true
        ? '体检未执行（解析不出 bridge 的 import 需求），按「验证才能替换」不切换'
        : probe.error
      updateStatus({ latestVersion: release.version, latestRejected: { version: release.version, error: reason } })
      log(`${release.version} 未通过验证，已跳过（不会切过去）：${String(reason)}`)
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    log(`更新失败：${result.error}`)
  } finally {
    writeState({ lastCheck: result.checkedAt })
  }
  return result
}

/**
 * 插件启动时调：距上次检查超过间隔才真的发请求，绝不阻塞启动。
 *
 * 装了新版 pi-ai 要重启才生效，所以这里下好的是"下次启动用得上"的那份——目的是让新装的
 * 机器不用手点「检查更新」也能自动跟上上游。
 * @param logger - 宿主日志器。
 * @param activeVersion - 当前生效的 pi-ai 版本（见 {@link checkAndUpdate}）。
 */
export function startBackgroundCheck(logger: Logger | undefined, activeVersion: string | undefined): void {
  if (process.env.DSH_PROVIDER_UPDATE === 'off') return
  const last = readString(readState()['lastCheck'])
  if (last !== undefined && Date.now() - Date.parse(last) < AUTO_CHECK_INTERVAL_MS) return
  void checkAndUpdate((line) => logger?.info?.(`[pi-ai updater] ${line}`), activeVersion)
}

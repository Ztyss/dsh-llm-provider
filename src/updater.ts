/**
 * pi-ai 上游更新器：设置页「启用最新版 pi-ai」开关拨 ON 时，查 @earendil-works/pi-ai
 * 的 npm registry，下载最新版、装依赖、放进**安全区** `llm-provider-bridge/pi-ai/<版本>/`，
 * 验证通过后标记待生效（重启后桥接才挂到新版本，见 bridge.ts）。
 *
 * 替换的硬规矩：**验证通过才能替换**，两道都过才算数——
 *   1. tarball 完整性：按 registry packument 里的 dist.integrity（sha512）校验下载内容；
 *   2. 兼容性体检：用桥接副本自己的 import 需求 probe 那份新 pi-ai（见 bridge.ts 的
 *      probePiAi）。体检没跑起来（unverified，需求解析不出）一样不替换。
 * 通过后只写 status.json 的 needsRestart 标记——已 require 的旧模块不受影响，
 * 下一次 dsh 重启时 bridge.ts 才会挂到新版本。/provider/status 会报出来。
 *
 * 触发方式**只有一种**：用户拨开关（POST /provider/pi-ai，见 index.ts）。插件不做任何
 * 后台检查、启动时不触网——拨开关这个动作就是「同意触网」的唯一授权。旧策略（6 小时
 * 节流后台检查 + vendor/pi-ai 落点 + DSH_PROVIDER_UPDATE=on opt-in）整体作废：
 * 下载落点改安全区是因为插件包会被整棵递归删（包管理器/插件市场/宿主），几百 MB 的
 * pi-ai 放包里等于每次重装插件都要重下。
 *
 * `DSH_PROVIDER_UPDATE=off` 是 kill switch：整个功能关闭（界面隐藏开关、接口拒绝），
 * 给「这段时间就是不想让这个插件碰网络」留的逃生门。
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  bridgeRequirements,
  compareVersions,
  probePiAi,
  removeTree,
  safeInstalledVersions,
  safePiAiDir,
  safeRootDir,
  updateStatus,
} from './bridge.js'
import { asRecord, readString } from './types.js'

/**
 * execFile 的 promise 包装。
 *
 * options 断言成 `Record<string, unknown>`：`stdio` 在**运行时**是 execFile 的透传参数
 * （转手交给 spawn），但 @types/node 的 `ExecFileOptions` 没收这个键（dsh 的 electron
 * 沙禁场景必须显式 `stdio:'ignore'`——见 installVersion 的说明）。集中在这一处放宽，
 * 调用处保持干净。
 */
const execFileAsync = promisify(execFile) as unknown as (
  file: string,
  args: readonly string[],
  options: Record<string, unknown>,
) => Promise<{ stdout: string; stderr: string }>

const PACKAGE = '@earendil-works/pi-ai'
const REGISTRY = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE).replace('%40', '@')}`

/**
 * kill switch：`DSH_PROVIDER_UPDATE=off` 彻底关闭「启用最新版 pi-ai」功能。
 *
 * 缺省（未设置）= 功能在线：开关可见，拨 ON 才触网。用户 09-22 确认的默认行为；
 * 此前「默认停用、DSH_PROVIDER_UPDATE=on 才开」的老语义整体作废。
 *
 * **调用期现场求值**（不是模块级常量）：改了环境变量当场生效、不用重启，
 * 集成测试也能直接注入。
 */
export function piAiFeatureDisabled(): boolean {
  return process.env.DSH_PROVIDER_UPDATE === 'off'
}

/** 安全区里某个自有版本的目录——下载唯一落点（插件包外，插件重装不丢）。 */
export function safeVersionDir(version: string): string {
  return join(safePiAiDir(), version)
}

/** 一次检查 + 更新的结果（POST /provider/pi-ai 的响应体）。 */
export interface UpdateResult {
  checkedAt: string
  latest: string | undefined
  installed: string | undefined
  applied: boolean
  compatible: boolean | undefined
  error: string | undefined
  /** kill switch 关着：功能被 DSH_PROVIDER_UPDATE=off 停用（不是失败，界面照实说明）。 */
  disabled?: boolean | undefined
  /** 跳过下载时的明确结论（「已是最新」「本地已就位」……界面上要能看见，Q2-C/Q5）。 */
  reason?: string | undefined
}

/** registry 上最新版：版本号 + tarball 的 sha512（base64，无前缀）。 */
interface RegistryRelease {
  version: string
  integrity: string | undefined
}

/** 闸门结论：'install' = 该下载；'skip' = 不用下载（reason 说明为什么）。 */
export interface UpdateDecision {
  action: 'install' | 'skip'
  reason?: string
}

/**
 * 要不要下载：纯函数，离线可测。
 *
 * 上游 ≤ 当前生效版本 → 不下载（老代码在这里会白下一份一模一样的——dsh 自带 0.85.1、
 * 上游也是 0.85.1 的经典场景）。本地已就位同一版 → 也不重下。跳过必须给 reason：
 * 用户点了开关，屏幕上要出现明确结论，而不是一片安静。
 */
export function updateDecision(
  release: { version: string },
  activeVersion: string | undefined,
  localVersions: readonly string[],
): UpdateDecision {
  if (activeVersion !== undefined && compareVersions(release.version, activeVersion) <= 0) {
    return { action: 'skip', reason: `当前已在用 ${activeVersion}（上游 ${release.version}），无需下载` }
  }
  const newest = [...localVersions].sort(compareVersions).pop()
  if (newest !== undefined && compareVersions(release.version, newest) <= 0) {
    return { action: 'skip', reason: `本地已就位 ${newest}（上游 ${release.version}），无需下载` }
  }
  return { action: 'install' }
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
 * 下载并就位一个版本：tarball 校验后解压到**安全区** `llm-provider-bridge/pi-ai/<v>/`，
 * 再补依赖闭包。已就位则跳过（校验也不重跑——那份内容装的时候验过）。
 * integrity 缺省时不校验，但会记一行日志：registry 正常都会给，缺了多半是请求/字段出了问题。
 */
export async function installVersion(release: RegistryRelease, log: (line: string) => void = () => {}): Promise<string> {
  const { version, integrity } = release
  const target = safeVersionDir(version)
  if (existsSync(join(target, 'node_modules'))) {
    log(`${version} 已就位，跳过下载`)
    return target
  }
  // 用 removeTree 而不是 rmSync(recursive)：下载目录里理论上不该有链，但「理论上」在
  // Windows junction 上是要付代价的（Node 24.15+ 的递归删除会跟进 junction，把目标内容
  // 一起清空），递归删除统一走链感知的那条路。
  removeTree(target)
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
  // stdio 必须是 'ignore'：dsh 跑在 electron 沙箱里，child_process 的 stdio **管道**创建
  // 会 EPERM（本仓库宿主实测：stdio:'pipe' 的 spawn 直接挂起，'ignore'/'inherit' 才 work）。
  // 2026-09-22 事故：默认 pipe 的 execFile('tar') 在沙箱里 promise 永不 settle——tarball
  // 早落盘了、解压目录却 7 分钟空着，下载态永远收不了尾。timeout 是第二道防线：
  // 真卡住也要在 2 分钟后 reject，不能把拨开关的用户挂在「正在下载」上。
  try {
    await execFileAsync('tar', ['-xzf', tgzPath, '-C', target, '--strip-components', '1'], {
      stdio: 'ignore',
      timeout: 120_000,
    })
  } catch (error) {
    throw new Error(`解压失败：${messageOfExecError(error)}（tarball 保留在 ${tgzPath}）`)
  }
  rmSync(tgzPath, { force: true })

  log('安装依赖（--omit=dev --ignore-scripts）...')
  // 用安全区本地缓存：用户默认缓存可能因权限问题（root 属主残留）不可写，不该让它挡住下载
  const npmCache = join(safeRootDir(), '.npm-cache')
  mkdirSync(npmCache, { recursive: true })
  const npm = npmCommand([
    'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error',
    `--cache=${npmCache}`,
  ])
  // stdio 全 ignore：同上，沙禁里不能用管道接子进程输出。npm 的失败诊断改成「退出码 +
  // 可手动复现的命令」——用户照着敲一遍就能看到 npm 自己的错误输出。
  try {
    await execFileAsync(npm.file, npm.args, {
      cwd: target,
      timeout: 300_000,
      stdio: 'ignore',
      ...(npm.shell ? { shell: true } : {}),
    })
  } catch (error) {
    const repro = `cd "${target}" && ${npm.file === process.execPath ? `"${process.execPath}"` : npm.file} ${npm.args.join(' ')}`
    throw new Error(`依赖安装失败：${messageOfExecError(error)}。可手动复现：${repro}`)
  }
  return target
}

/** 子进程错误的一句人话：含 command / code / signal——沙禁里大多是 EPERM 或 exit≠0。 */
function messageOfExecError(error: unknown): string {
  if (error === null || typeof error !== 'object') return String(error)
  const rec = error as { cmd?: unknown; code?: unknown; signal?: unknown; message?: unknown; killed?: unknown }
  const parts = [String(rec.message ?? error)]
  if (rec.code !== undefined) parts.push(`code=${String(rec.code)}`)
  if (rec.signal !== undefined) parts.push(`signal=${String(rec.signal)}`)
  if (rec.killed === true) parts.push('（被 timeout 杀掉）')
  return parts.join(' ')
}

/**
 * 一次性检查 + 更新。返回给 POST /provider/pi-ai 与 /provider/status。
 * @param log - 进度输出。
 * @param activeVersion - 当前生效的 pi-ai 版本（可能来自 dsh 自带那份）。闸门结论见
 *   {@link updateDecision}：不比上游旧、本地已就位，都不下载——「已是最新」也是明确结论。
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
  // kill switch：整个功能关闭，连 registry 都不询问，如实回报（不是失败）
  if (piAiFeatureDisabled()) {
    result.disabled = true
    result.error = 'pi-ai 更新功能已被 DSH_PROVIDER_UPDATE=off 关闭'
    log('killed switch：pi-ai 更新功能已关闭（DSH_PROVIDER_UPDATE=off）')
    return result
  }
  try {
    const release = await latestRelease()
    result.latest = release.version
    const decision = updateDecision(release, activeVersion, safeInstalledVersions())
    if (decision.action === 'skip') {
      result.reason = decision.reason
      log(decision.reason ?? '无需下载')
      return result
    }
    const target = await installVersion(release, log)
    result.installed = release.version
    // 装完先体检：不兼容的版本不该让用户白重启一趟，也不该在下次启动时才被发现。
    // 体检用桥接副本自己的 import 需求（见 bridge.ts 的 probePiAi）。
    const probe = probePiAi(bridgeRequirements(), target, `check-${release.version}`)
    result.compatible = probe.ok && probe.unverified !== true
    if (probe.ok && probe.unverified !== true) {
      updateStatus({ piAiVersion: release.version, needsRestart: true, latestVersion: release.version, latestRejected: undefined })
      result.applied = true
      log(`已验证 ${release.version}（完整性 + 兼容性体检），重启 dsh 后生效`)
    } else {
      // 留着不删：下次启动 loadBridge 还会体检一遍，结论一致；开关保留 OFF，用户看得见原因。
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
  }
  return result
}

import { asRecord, readString } from "./types.js";
import { bridgeRequirements, compareVersions, probePiAi, removeTree, safeInstalledVersions, safePiAiDir, updateStatus } from "./bridge.js";
import { extractTarGz } from "./tar-gz.js";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region src/updater.ts
/**
* pi-ai 上游更新器：设置页「启用最新版 pi-ai」开关拨 ON 后，查 @earendil-works/pi-ai
* 的 npm registry，下载最新版、装依赖、放进**安全区** `llm-provider-bridge/pi-ai/<版本>/`，
* 验证通过后标记待生效（重启后桥接才挂到新版本，见 bridge.ts）。
*
* 替换的硬规矩：**验证通过才能替换**，两道都过才算数——
*   1. tarball 完整性：按 registry packument 里的 dist.integrity（sha512）校验下载内容；
*   2. 兼容性体检：用桥接副本自己的 import 需求 probe 那份新 pi-ai（见 bridge.ts 的
*      probePiAi）。体检没跑起来（unverified，需求解析不出）一样不替换。
* 「重启后才生效」不在这里落盘：已 require 的旧模块不受影响，而要不要重启由
* /provider/status 按偏好与当前档位现场推（piAiNeedsRestart）——写时标志会和不写
* 的场景脱节（原地启用走跳过分支，标志永远不置位，界面于是不说重启）。
*
* 触发方式（用户 09-22 修订，开关 ON = 常驻意图，不是一次性快照）：
*   1. 用户拨开关（POST /provider/pi-ai，见 index.ts）；
*   2. **每次 dsh 启动时**——只要开关是 ON（preference=latest），无论本地有无就绪副本：
*      没副本就补上下载（启动即进入下载中态），有副本也查一次上游、有新版自动下载。
*      （60 秒最小间隔是纯工程防抖：防 crash-loop 反复查 registry，正常重启间隔远大于它。）
* 下载落点在安全区：插件包会被整棵递归删（包管理器/插件市场/宿主），几百 MB 的
* pi-ai 放包里等于每次重装插件都要重下。
*/
/**
* execFile 的 promise 包装。
*
* options 断言成 `Record<string, unknown>`：`stdio` 在**运行时**是 execFile 的透传参数
* （转手交给 spawn），但 @types/node 的 `ExecFileOptions` 没收这个键（dsh 的 electron
* 沙禁场景必须显式 `stdio:'ignore'`——见 installVersion 的说明）。集中在这一处放宽，
* 调用处保持干净。
*/
const execFileAsync = promisify(execFile);
const PACKAGE = "@earendil-works/pi-ai";
const REGISTRY = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE).replace("%40", "@")}`;
/** 安全区里某个自有版本的目录——下载唯一落点（插件包外，插件重装不丢）。 */
function safeVersionDir(version) {
	return join(safePiAiDir(), version);
}
/**
* 要不要下载：纯函数，离线可测。
*
* 上游 ≤ 当前生效版本 → 不下载（老代码在这里会白下一份一模一样的——dsh 自带 0.85.1、
* 上游也是 0.85.1 的经典场景）。本地已就位同一版 → 也不重下。跳过必须给 reason：
* 用户点了开关，屏幕上要出现明确结论，而不是一片安静。
*/
function updateDecision(release, activeVersion, localVersions) {
	if (activeVersion !== void 0 && compareVersions(release.version, activeVersion) <= 0) return {
		action: "skip",
		reason: `当前已在用 ${activeVersion}（上游 ${release.version}），无需下载`
	};
	const newest = [...localVersions].sort(compareVersions).pop();
	if (newest !== void 0 && compareVersions(release.version, newest) <= 0) return {
		action: "skip",
		reason: `本地已就位 ${newest}（上游 ${release.version}），无需下载`
	};
	return { action: "install" };
}
/** registry 上最新版与它的 dist.integrity（下载校验用）。 */
async function latestRelease() {
	const response = await fetch(REGISTRY, {
		headers: { accept: "application/vnd.npm.install-v1+json" },
		signal: AbortSignal.timeout(15e3)
	});
	if (!response.ok) throw new Error(`registry HTTP ${String(response.status)}`);
	const doc = asRecord(await response.json());
	const latest = readString(asRecord(doc["dist-tags"])["latest"]);
	if (latest === void 0) throw new Error("registry 响应里没有 dist-tags.latest");
	const versionDoc = asRecord(asRecord(doc["versions"])[latest]);
	return {
		version: latest,
		integrity: readString(asRecord(versionDoc["dist"])["integrity"])
	};
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
function npmCommand(args) {
	const nodeDir = dirname(process.execPath);
	const cli = [join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"), join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")].find((candidate) => existsSync(candidate));
	if (cli !== void 0) return {
		file: process.execPath,
		args: [cli, ...args],
		shell: false
	};
	const isWindows = process.platform === "win32";
	return {
		file: isWindows ? "npm.cmd" : "npm",
		args: isWindows ? args.map((argument) => /\s/.test(argument) ? `"${argument}"` : argument) : [...args],
		shell: isWindows
	};
}
/**
* 下载并就位一个版本：tarball 校验后解压到**安全区** `llm-provider-bridge/pi-ai/<v>/`，
* 再补依赖闭包。已就位则跳过（校验也不重跑——那份内容装的时候验过）。
* integrity 缺省时不校验，但会记一行日志：registry 正常都会给，缺了多半是请求/字段出了问题。
*/
async function installVersion(release, log = () => {}) {
	const { version, integrity } = release;
	const target = safeVersionDir(version);
	if (existsSync(join(target, "node_modules"))) {
		log(`${version} 已就位，跳过下载`);
		return target;
	}
	removeTree(target);
	mkdirSync(target, { recursive: true });
	const tgzPath = join(tmpdir(), `pi-ai-${version}-${Date.now()}.tgz`);
	log(`下载 ${PACKAGE}@${version} ...`);
	const response = await fetch(`https://registry.npmjs.org/${PACKAGE}/-/pi-ai-${version}.tgz`, { signal: AbortSignal.timeout(12e4) });
	if (!response.ok) throw new Error(`tarball HTTP ${String(response.status)}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (integrity !== void 0) {
		if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== integrity) throw new Error(`tarball 校验失败（本地 sha512 与 registry 的 dist.integrity 不一致），拒绝安装 ${version}`);
		log("完整性校验通过（sha512）");
	} else log("registry 没给 dist.integrity，跳过完整性校验");
	writeFileSync(tgzPath, bytes);
	log("解压（内置 tar 解析）...");
	extractTarGz(bytes, target, 1);
	rmSync(tgzPath, { force: true });
	log("安装依赖（--omit=dev --ignore-scripts）...");
	const npmCache = join(tmpdir(), `pi-ai-npm-cache-${Date.now()}`);
	mkdirSync(npmCache, { recursive: true });
	const npm = npmCommand([
		"install",
		"--omit=dev",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
		"--loglevel=error",
		`--cache=${npmCache}`
	]);
	try {
		await execFileAsync(npm.file, npm.args, {
			cwd: target,
			timeout: 6e5,
			stdio: "ignore",
			...npm.shell ? { shell: true } : {}
		});
	} catch (error) {
		const repro = `cd "${target}" && ${npm.file === process.execPath ? `"${process.execPath}"` : npm.file} ${npm.args.join(" ")}`;
		throw new Error(`依赖安装失败：${messageOfExecError(error)}。可手动复现：${repro}`);
	} finally {
		removeTree(npmCache);
	}
	return target;
}
/** 子进程错误的一句人话：含 command / code / signal——沙禁里大多是 EPERM 或 exit≠0。 */
function messageOfExecError(error) {
	if (error === null || typeof error !== "object") return String(error);
	const rec = error;
	const parts = [String(rec.message ?? error)];
	if (rec.code !== void 0) parts.push(`code=${String(rec.code)}`);
	if (rec.signal !== void 0) parts.push(`signal=${String(rec.signal)}`);
	if (rec.killed === true) parts.push("（被 timeout 杀掉）");
	return parts.join(" ");
}
/**
* 一次性检查 + 更新。返回给 POST /provider/pi-ai 与 /provider/status。
* @param log - 进度输出。
* @param activeVersion - 当前生效的 pi-ai 版本（可能来自 dsh 自带那份）。闸门结论见
*   {@link updateDecision}：不比上游旧、本地已就位，都不下载——「已是最新」也是明确结论。
*/
async function checkAndUpdate(log = () => {}, activeVersion) {
	const result = {
		checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
		latest: void 0,
		installed: void 0,
		applied: false,
		compatible: void 0,
		error: void 0
	};
	const record = (patch) => {
		updateStatus({ lastCheck: {
			at: result.checkedAt,
			...patch
		} });
	};
	try {
		const release = await latestRelease();
		result.latest = release.version;
		const decision = updateDecision(release, activeVersion, safeInstalledVersions());
		if (decision.action === "skip") {
			result.reason = decision.reason;
			record({
				latest: release.version,
				reason: decision.reason
			});
			log(decision.reason ?? "无需下载");
			return result;
		}
		const target = await installVersion(release, log);
		result.installed = release.version;
		const probe = probePiAi(bridgeRequirements(), target, `check-${release.version}`);
		result.compatible = probe.ok && probe.unverified !== true;
		if (probe.ok && probe.unverified !== true) {
			updateStatus({
				piAiVersion: release.version,
				latestVersion: release.version,
				latestRejected: void 0
			});
			record({
				latest: release.version,
				installed: release.version,
				reason: `已验证 ${release.version}（完整性 + 兼容性体检）`
			});
			result.applied = true;
			log(`已验证 ${release.version}（完整性 + 兼容性体检），重启 dsh 后生效`);
		} else {
			const reason = probe.unverified === true ? "体检未执行（解析不出 bridge 的 import 需求），按「验证才能替换」不切换" : probe.error;
			updateStatus({
				latestVersion: release.version,
				latestRejected: {
					version: release.version,
					error: reason
				}
			});
			record({
				latest: release.version,
				installed: release.version,
				error: reason
			});
			log(`${release.version} 未通过验证，已跳过（不会切过去）：${String(reason)}`);
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		record({
			reason: `检查失败：${result.error}`,
			error: result.error
		});
		log(`更新失败：${result.error}`);
	}
	return result;
}
//#endregion
export { checkAndUpdate, installVersion, latestRelease, safeVersionDir, updateDecision };

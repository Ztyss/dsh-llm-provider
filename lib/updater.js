import { asRecord, readString } from "./types.js";
import { bridgeRequirements, compareVersions, installedVersions, probePiAi, removeTree, updateStatus, vendorDir } from "./bridge.js";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region src/updater.ts
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
* 触发方式：启动时后台自动查一次（6 小时节流，startBackgroundCheck），以及设置页按钮
* → POST /provider/update 手动触发。
*/
const execFileAsync = promisify(execFile);
const PACKAGE = "@earendil-works/pi-ai";
const REGISTRY = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE).replace("%40", "@")}`;
const VERSIONS_DIR = join(vendorDir, "pi-ai");
const STATE_FILE = join(vendorDir, "updater-state.json");
const AUTO_CHECK_INTERVAL_MS = 216e5;
/**
* 本地版（-local）开关：pi-ai 自动下载**默认关闭**。
*
* 上游 rc.2 在启动时（6 小时节流）与点「检查更新」时会把 @earendil-works/pi-ai 连依赖闭包
* 下到 `vendor/pi-ai/<版本>/`（实测一次几百 MB，还带一份 `vendor/.npm-cache`），dsh 自带
* 同版本时也会白下一份——正是本仓库 issue #4 报的磁盘问题。本机把插件职责收窄成「用 dsh
* 自带那份 pi-ai + 计费/界面」：默认不再下载任何 pi-ai，vendor/ 里只留 llm-bridge/
* （官方适配器 bundle 的副本，约 113 KB，不是 pi-ai）。
*
* 要手动跟上游：`DSH_PROVIDER_UPDATE=on` 启动 dsh，再点设置页的「检查更新」。
*/
const UPDATES_ENABLED = process.env.DSH_PROVIDER_UPDATE === "on";
/** 上次检查时间等本地状态。 */
function readState() {
	try {
		return asRecord(JSON.parse(readFileSync(STATE_FILE, "utf8")));
	} catch {
		return {};
	}
}
function writeState(patch) {
	mkdirSync(vendorDir, { recursive: true });
	writeFileSync(STATE_FILE, JSON.stringify({
		...readState(),
		...patch,
		at: (/* @__PURE__ */ new Date()).toISOString()
	}));
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
* 下载并就位一个版本：tarball 校验后解压到 vendor/pi-ai/<v>/，再补依赖闭包。
* 已就位则跳过（校验也不重跑——那份内容装的时候验过）。integrity 缺省时不校验，
* 但会记一行日志：registry 正常都会给，缺了多半是请求/字段出了问题。
*/
async function installVersion(release, log = () => {}) {
	const { version, integrity } = release;
	const target = join(VERSIONS_DIR, version);
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
	log("解压 ...");
	await execFileAsync("tar", [
		"-xzf",
		tgzPath,
		"-C",
		target,
		"--strip-components",
		"1"
	]);
	rmSync(tgzPath, { force: true });
	log("安装依赖（--omit=dev --ignore-scripts）...");
	const npmCache = join(vendorDir, ".npm-cache");
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
	await execFileAsync(npm.file, npm.args, {
		cwd: target,
		timeout: 3e5,
		...npm.shell ? { shell: true } : {}
	});
	return target;
}
/**
* 一次性检查 + 更新。返回给 /provider/update 与 /provider/status。
* @param log - 进度输出。
* @param activeVersion - 当前正在用的 pi-ai 版本（可能来自 dsh 自带那份）。已经不比上游旧时
*   不再下载——否则像 dsh 自带 0.85.1、上游也是 0.85.1 的情况下会白下一份一模一样的。
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
	if (!UPDATES_ENABLED) {
		result.disabled = true;
		result.error = "本地版已停用 pi-ai 自动下载（vendor/ 不落地任何 pi-ai 副本）。要跟上游就用 DSH_PROVIDER_UPDATE=on 启动 dsh 后再点这里";
		log("已停用自动下载（本地版）");
		return result;
	}
	try {
		const release = await latestRelease();
		result.latest = release.version;
		if (activeVersion !== void 0 && compareVersions(release.version, activeVersion) <= 0) {
			log(`当前已在 ${activeVersion}（上游 ${release.version}），无需下载`);
			return result;
		}
		const have = installedVersions();
		const newest = have[have.length - 1];
		if (newest !== void 0 && compareVersions(release.version, newest) <= 0) {
			log(`已是最新（本地 ${newest}，上游 ${release.version}）`);
			return result;
		}
		const target = await installVersion(release, log);
		result.installed = release.version;
		const probe = probePiAi(bridgeRequirements(), target, `check-${release.version}`);
		result.compatible = probe.ok && probe.unverified !== true;
		if (probe.ok && probe.unverified !== true) {
			updateStatus({
				piAiVersion: release.version,
				needsRestart: true,
				latestVersion: release.version,
				latestRejected: void 0
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
			log(`${release.version} 未通过验证，已跳过（不会切过去）：${String(reason)}`);
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		log(`更新失败：${result.error}`);
	} finally {
		writeState({ lastCheck: result.checkedAt });
	}
	return result;
}
/**
* 插件启动时调：距上次检查超过间隔才真的发请求，绝不阻塞启动。
*
* 装了新版 pi-ai 要重启才生效，所以这里下好的是"下次启动用得上"的那份——目的是让新装的
* 机器不用手点「检查更新」也能自动跟上上游。
* @param logger - 宿主日志器。
* @param activeVersion - 当前生效的 pi-ai 版本（见 {@link checkAndUpdate}）。
*/
function startBackgroundCheck(logger, activeVersion) {
	if (!UPDATES_ENABLED) {
		logger?.info?.("本地版已停用 pi-ai 自动下载，跳过启动检查（vendor/ 不落地 pi-ai）");
		return;
	}
	if (process.env.DSH_PROVIDER_UPDATE === "off") return;
	const last = readString(readState()["lastCheck"]);
	if (last !== void 0 && Date.now() - Date.parse(last) < AUTO_CHECK_INTERVAL_MS) return;
	checkAndUpdate((line) => logger?.info?.(`[pi-ai updater] ${line}`), activeVersion);
}
//#endregion
export { UPDATES_ENABLED, checkAndUpdate, installVersion, latestRelease, startBackgroundCheck };

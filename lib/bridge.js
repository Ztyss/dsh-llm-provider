import { resolveDshHome } from "./dsh-home.js";
import { describeIntegrity, inspectPiAi, restoreHint } from "./pi-ai-source.js";
import { asRecord, readString } from "./types.js";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/bridge.ts
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
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(pluginRoot, "vendor");
const bridgeDir = join(vendorDir, "llm-bridge");
const bridgeLib = join(bridgeDir, "lib", "index.js");
join(vendorDir, "pi-ai");
const statusFile = join(vendorDir, "status.json");
const BRIDGE_PACKAGE_JSON = JSON.stringify({
	name: "dsh-llm-provider-llm-bridge",
	version: "0.0.0",
	type: "module",
	main: "lib/index.js",
	exports: {
		".": "./lib/index.js",
		"./package.json": "./package.json"
	}
}, null, 2);
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
function resolvePackageRoot(fromFile, specifier) {
	const parts = specifier.split("/");
	let dir = dirname(fromFile);
	for (;;) {
		const candidate = join(dir, "node_modules", ...parts);
		if (existsSync(join(candidate, "package.json"))) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return void 0;
		dir = parent;
	}
}
/**
* 官方 llm-pi-ai bundle 的实际位置。
*
* 它是桥接要拷的那份源文件。路径同样不写死：按「profile 的 node_modules → dsh 安装目录
* （全局 node_modules）→ 插件自己」的顺序沿解析链找，找到哪个用哪个。
* @returns bundle 入口文件的绝对路径；找不到返回 undefined。
*/
function findSourceBundle() {
	const anchors = [];
	try {
		anchors.push(join(resolveDshHome(), "profiles", "node_modules", "_anchor.js"));
	} catch {}
	const nodeDir = dirname(process.execPath);
	anchors.push(join(nodeDir, "node_modules", "_anchor.js"));
	anchors.push(join(nodeDir, "..", "lib", "node_modules", "_anchor.js"));
	anchors.push(join(pluginRoot, "_anchor.js"));
	const bundleSpec = "@deepseek-ai/dsh-llm-pi-ai";
	const seen = /* @__PURE__ */ new Set();
	for (const anchor of anchors) {
		const roots = [];
		const direct = resolvePackageRoot(anchor, bundleSpec);
		if (direct !== void 0) roots.push(direct);
		const dshRoot = resolvePackageRoot(anchor, "@deepseek-ai/dsh");
		if (dshRoot !== void 0) roots.push(join(dshRoot, "node_modules", ...bundleSpec.split("/")));
		for (const root of roots) {
			if (seen.has(root)) continue;
			seen.add(root);
			const entry = join(root, "lib", "index.js");
			if (existsSync(entry)) return entry;
		}
	}
}
/**
* dsh 自己那份 pi-ai 的包目录：从官方 bundle 的位置沿解析链找——那是 bundle 真正会加载的
* 那份，dsh 把 bundle 放在哪、依赖提升到哪一层都不影响。
* @param bundlePath - 官方 bundle 的入口文件路径。
*/
function dshPiAiRoot(bundlePath) {
	if (bundlePath === void 0) return void 0;
	const root = resolvePackageRoot(bundlePath, "@earendil-works/pi-ai");
	return root !== void 0 && isPiAiPackage(root) ? root : void 0;
}
/**
* 当前生效的 pi-ai 包目录——**永远是 DSH 自带那一份**。
*
* loadBridge() 挑定之后以它为准（`activeRoot`），没跑过 loadBridge 的场合退回静态推断。
* 新策略下两条路径都只会落在宿主那份上：插件不再自养副本，也就不存在
* 「界面按 A 份读、桥接其实跑的是 B 份」这类偏差。
*/
let activeRoot;
function activePiAiRoot() {
	if (activeRoot !== void 0) return activeRoot;
	return dshPiAiRoot(findSourceBundle()) ?? dshInstallTreePiAiRoot();
}
/** 读一个 pi-ai 包的版本号；读不到返回 undefined。 */
function piAiVersionOf(root) {
	try {
		return readString(asRecord(JSON.parse(readFileSync(join(root, "package.json"), "utf8")))["version"]);
	} catch {
		return;
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
function piAiRequirements(source) {
	const bySpecifier = /* @__PURE__ */ new Map();
	for (const pattern of [/\bimport\s*\{([^}]*)\}\s*from\s*["'](@earendil-works\/pi-ai[^"']*)["']/g, /\bexport\s*\{([^}]*)\}\s*from\s*["'](@earendil-works\/pi-ai[^"']*)["']/g]) {
		let match;
		while ((match = pattern.exec(source)) !== null) {
			const names = (match[1] ?? "").split(",").map((part) => part.trim().split(/\s+as\s+/)[0]?.trim() ?? "").filter((name) => name !== "");
			const specifier = match[2];
			if (names.length > 0 && specifier !== void 0) {
				const existing = bySpecifier.get(specifier) ?? /* @__PURE__ */ new Set();
				for (const name of names) existing.add(name);
				bySpecifier.set(specifier, existing);
			}
		}
	}
	for (const pattern of [
		/\bimport\s*\(\s*["'](@earendil-works\/pi-ai[^"']*)["']/g,
		/\bimport\s*["'](@earendil-works\/pi-ai[^"']*)["']/g,
		/\bimport[^"'{]*?\sfrom\s*["'](@earendil-works\/pi-ai[^"']*)["']/g,
		/\bexport\s*\*\s*from\s*["'](@earendil-works\/pi-ai[^"']*)["']/g
	]) {
		let match;
		while ((match = pattern.exec(source)) !== null) {
			const specifier = match[1];
			if (specifier !== void 0 && !bySpecifier.has(specifier)) bySpecifier.set(specifier, /* @__PURE__ */ new Set());
		}
	}
	return [...bySpecifier.entries()].map(([specifier, names]) => ({
		specifier,
		names: [...names]
	}));
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
function linkSpec(from, target) {
	return process.platform === "win32" ? {
		target: resolve(target),
		type: "junction"
	} : {
		target: relative(from, target),
		type: "dir"
	};
}
/**
* 这条路径是不是一条目录链接（软链或 Windows junction）。
*
* 用 lstat 而不是 stat：stat 会**跟着链接走**，链接指向目录时得到的是目标目录的信息，
* 于是「它是不是链接」根本判不出来。
* @param path - 要判的路径。
*/
function isDirectoryLink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
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
function removeDirectoryLink(path) {
	if (!isDirectoryLink(path)) return false;
	try {
		unlinkSync(path);
		return true;
	} catch {
		return false;
	}
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
function probePiAi(requirements, root, key) {
	if (!existsSync(root)) return {
		ok: false,
		error: "目录不存在"
	};
	if (requirements.length === 0) return {
		ok: true,
		unverified: true
	};
	const dir = join(bridgeDir, `.probe-${String(key).replace(/[^A-Za-z0-9._-]/g, "_")}`);
	try {
		const linkDir = join(dir, "node_modules", "@earendil-works");
		mkdirSync(linkDir, { recursive: true });
		const link = join(linkDir, "pi-ai");
		rmSync(link, {
			force: true,
			recursive: true
		});
		const spec = linkSpec(linkDir, root);
		symlinkSync(spec.target, link, spec.type);
		const lines = requirements.map(({ specifier, names }) => names.length > 0 ? `import { ${names.join(", ")} } from ${JSON.stringify(specifier)}` : `import ${JSON.stringify(specifier)}`);
		lines.push("export const ok = true");
		writeFileSync(join(dir, "probe.js"), lines.join("\n") + "\n");
		createRequire(import.meta.url)(join(dir, "probe.js"));
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
/**
* pi-ai 候选：**只列 DSH 自带的那一份**（可能解析出多个落点，都是宿主自己的）。
*
* 策略变更（用户诉求）：不再把「updater 下载的 `vendor/pi-ai/<v>`」和「插件自带依赖」
* 当候选。插件的职责是**维护宿主那份**，而不是养一份自己的——后者会带来重复副本
* （issue #4：实测 260 MB）、多一条危险的写路径、以及"桥接跑的其实是另一份 pi-ai"
* 这类难查的偏差。
*
* 仍然支持解析出多个宿主落点（profile 一层、安装树一层）：dsh 换个布局也得找得到。
* 一条宿主候选都解析不出来时，**也要留一个位置**报出「找到哪几条路径都不在」，
* 否则用户拿到的是一句「没有能用的 pi-ai」后面一片空白（issue #6 的诊断盲区）。
* @param probe - 是否顺带探一下每条候选在不在（`/provider/status` 与报错用它）。默认不探。
*/
function piAiCandidates(probe = false) {
	const list = [];
	const dshRoot = dshPiAiRoot(findSourceBundle());
	const seen = /* @__PURE__ */ new Set();
	const hostRoots = [];
	for (const root of [dshRoot, dshInstallTreePiAiRoot()]) {
		if (root === void 0 || seen.has(root)) continue;
		seen.add(root);
		hostRoots.push(root);
	}
	for (const root of hostRoots) list.push({
		key: "dsh",
		version: piAiVersionOf(root) ?? "dsh 自带",
		root,
		link: true
	});
	if (hostRoots.length === 0) list.push({
		key: "dsh",
		version: "dsh 自带",
		root: dshInstallTreePiAiRoot() ?? defaultHostPiAiPath(),
		link: true
	});
	if (!probe) return list;
	return list.map((candidate) => ({
		...candidate,
		exists: isPiAiPackage(candidate.root)
	}));
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
function isPiAiPackage(root) {
	return inspectPiAi(root).usable;
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
function dshInstallTreePiAiRoot() {
	const nodeDir = dirname(process.execPath);
	const bases = [join(nodeDir, "node_modules"), join(nodeDir, "..", "lib", "node_modules")];
	try {
		const home = resolveDshHome();
		bases.push(join(home, "profiles", "node_modules"));
		bases.push(join(home, "profiles", "web", "node_modules"));
	} catch {}
	const specifier = ["@earendil-works", "pi-ai"];
	const candidates = [];
	for (const base of bases) {
		candidates.push(join(base, ...specifier));
		candidates.push(join(base, "@deepseek-ai", "dsh", "node_modules", ...specifier));
	}
	for (const candidate of candidates) if (isPiAiPackage(candidate)) return candidate;
	return candidates[0];
}
/** 宿主那份 pi-ai 的默认报错路径（解析不出来时用它，让诊断说得清找过哪儿）。 */
function defaultHostPiAiPath() {
	return join(dirname(process.execPath), "node_modules", "@earendil-works", "pi-ai");
}
function readStatus() {
	try {
		return asRecord(JSON.parse(readFileSync(statusFile, "utf8")));
	} catch {
		return {};
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
function mergeStatus(previous, patch) {
	const merged = {
		...previous,
		...patch
	};
	for (const [key, value] of Object.entries(patch)) if (value === void 0) delete merged[key];
	return merged;
}
function writeStatus(patch) {
	mkdirSync(vendorDir, { recursive: true });
	writeFileSync(statusFile, JSON.stringify({
		...mergeStatus(readStatus(), patch),
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	}));
}
/**
* 确保桥接目录就位（同步、幂等），返回加载好的 bridge 插件模块。
*/
function loadBridge() {
	try {
		const srcBundle = findSourceBundle();
		if (srcBundle === void 0) return {
			ok: false,
			error: "找不到官方 llm-pi-ai bundle：profile 的 node_modules 与 dsh 安装目录里都没有 @deepseek-ai/dsh-llm-pi-ai",
			rejected: [],
			candidates: []
		};
		mkdirSync(join(bridgeDir, "lib"), { recursive: true });
		if (!existsSync(bridgeLib) || statSync(srcBundle).mtimeMs > statSync(bridgeLib).mtimeMs) copyFileSync(srcBundle, bridgeLib);
		writeFileSync(join(bridgeDir, "package.json"), BRIDGE_PACKAGE_JSON);
		const requirements = piAiRequirements(readFileSync(bridgeLib, "utf8"));
		const rejected = [];
		const candidates = [];
		let chosen;
		let probeUnverified = false;
		for (const candidate of piAiCandidates()) {
			if (!existsSync(candidate.root)) {
				candidates.push({
					key: candidate.key,
					version: candidate.version,
					root: candidate.root,
					exists: false,
					used: false,
					reason: "目录不存在"
				});
				continue;
			}
			const probe = probePiAi(requirements, candidate.root, candidate.key);
			if (probe.ok) {
				chosen = candidate;
				probeUnverified = probe.unverified === true;
				candidates.push({
					key: candidate.key,
					version: candidate.version,
					root: candidate.root,
					exists: true,
					used: true
				});
				break;
			}
			rejected.push({
				version: candidate.version,
				error: probe.error,
				path: candidate.root
			});
			candidates.push({
				key: candidate.key,
				version: candidate.version,
				root: candidate.root,
				exists: true,
				used: false,
				reason: `体检没通过：${String(probe.error)}`
			});
		}
		if (chosen === void 0) {
			const detail = candidates.map((entry) => `${entry.version} ${entry.root}（${entry.reason ?? "未选中"}）`).join("；");
			const incomplete = candidates.filter((entry) => entry.key === "dsh").map((entry) => inspectPiAi(entry.root)).find((integrity) => integrity.hasManifest && !integrity.usable);
			const hint = incomplete === void 0 ? "" : `\n${describeIntegrity(candidates.find((entry) => entry.key === "dsh")?.root ?? "", incomplete)}\n${restoreHint(incomplete.version)}`;
			return {
				ok: false,
				error: `没有能用的 pi-ai：${detail === "" ? "（候选清单为空）" : detail}${hint}`,
				rejected,
				candidates
			};
		}
		if (chosen.link) setPiAiLink(chosen.root);
		else clearPiAiLink();
		const require = createRequire(import.meta.url);
		delete require.cache?.[bridgeLib];
		const plugin = require(bridgeLib);
		activeRoot = chosen.root;
		writeStatus({
			piAiVersion: chosen.version,
			needsRestart: false,
			piAiSource: chosen.key,
			probeUnverified: probeUnverified || void 0,
			...rejected.length === 0 ? { rejected: void 0 } : { rejected }
		});
		return {
			ok: true,
			plugin,
			piAiVersion: chosen.version,
			piAiSource: chosen.key,
			probeUnverified,
			rejected,
			candidates
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			rejected: [],
			candidates: []
		};
	}
}
/** 把桥接副本的 pi-ai 链指向指定包目录（指向没变就不动，避免无谓的 mtime 抖动）。 */
function setPiAiLink(target) {
	const linkDir = join(bridgeDir, "node_modules", "@earendil-works");
	mkdirSync(linkDir, { recursive: true });
	const linkPath = join(linkDir, "pi-ai");
	const spec = linkSpec(linkDir, target);
	let current;
	try {
		current = readlinkSync(linkPath);
	} catch {}
	if (current === spec.target) return;
	removeDirectoryLink(linkPath);
	symlinkSync(spec.target, linkPath, spec.type);
}
/**
* 删掉软链，让那份拷贝走自然解析，落到插件自己的 node_modules。
*
* 这就是"回退到内置依赖"的动作——不用另外指一条链过去，Node 会自己往上找。
* 只删链接、不递归目标：这条链在 Windows 上是 junction，删链绝不能碰目标目录的内容。
*/
function clearPiAiLink() {
	removeDirectoryLink(join(bridgeDir, "node_modules", "@earendil-works", "pi-ai"));
}
/**
* 相对路径（自写而不用 path.relative）：软链目标一律用正斜杠。
* 只在 POSIX 上用到——Windows 走 junction，目标是绝对路径。
*/
function relative(from, to) {
	const fromParts = from.split(sep);
	const toParts = to.split(sep);
	let i = 0;
	while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
	const up = fromParts.length - i;
	return [...Array.from({ length: up }, () => ".."), ...toParts.slice(i)].join("/");
}
//#endregion
export { activePiAiRoot, isDirectoryLink, loadBridge, mergeStatus, piAiCandidates, piAiRequirements, probePiAi, removeDirectoryLink, vendorDir };

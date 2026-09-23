import { describeIntegrity, inspectPiAi, restoreHint } from "./pi-ai-source.js";
import { resolveDshHome } from "./dsh-home.js";
import { asRecord, readString } from "./types.js";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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
*   指向选中的那份 pi-ai，Node 的解析就会把拷贝副本接到它上面。
*   结果：模型目录 + wire 协议实现来自上游最新，dsh 的转换胶水层保持稳定。
*
* 选哪份 pi-ai 由**设置页开关**（`piAiPreference`，落盘安全区 vendor-status.json，见
* statusFile()）决定：
*   - 'dsh'（缺省）：只用 DSH 自带那份，安全区里的自有版本一概不入候选链；
*   - 'latest'：开关拨 ON 时由 updater 下载进安全区
*     （`$DSH_HOME/llm-provider-bridge/pi-ai/<版本>/`，见 safePiAiDir），候选链最前面
*     就是它们（新 → 旧），中选即替代 DSH 自带那份；体检不过自动回退，开关始终有兜底。
*
* 用哪份 pi-ai 是**加载前先体检**挑出来的，不是"先试再退"：ESM 加载失败后同一个文件
* 没法重试（Node 会报 "not yet fully loaded"）。候选与体检见 piAiCandidates/probePiAi。
*
* 边界：本模块只写插件自己的 vendor/ 目录，pi-ai 本身的文件一个字节都不改——改第三方包的
* 文件不可复现，也没法保证跟 lockfile 对得上。
*/
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(pluginRoot, "vendor");
const piAiVersionsDir = join(vendorDir, "pi-ai");
/**
* vendor 状态文件：`$DSH_HOME/llm-provider-bridge/vendor-status.json`（安全区）。
*
* 曾放插件包 vendor/status.json——插件包重装/整棵删时，里面的「启用最新版 pi-ai」
* 开关偏好跟着被清掉（用户批注 09-24：状态不该跟随包走）。安全区与下载副本同域，
* 重装插件后偏好与已下载版本双双无感保留。
* 每次调用现场 resolve（不缓存模块级常量）：测试注入 DSH_HOME 即时生效。
*/
function statusFile() {
	return join(resolveDshHome(), "llm-provider-bridge", "vendor-status.json");
}
/** 过渡版包内状态文件（vendor/status.json，gitignore 的运行时状态）：读取时一次性并入安全区。 */
function legacyStatusFile() {
	return join(vendorDir, "status.json");
}
/**
* 插件私有安全区（`$DSH_HOME/llm-provider-bridge`，默认 `~/.dsh/llm-provider-bridge`）。
*
* 存在的唯一理由是：**插件包目录会被别人递归删掉**。包管理器、插件市场、宿主都会把
* `profiles/<profile>/node_modules/<插件>` 整棵删掉重建，而递归删除在 Node 24.15+（本机实测：
* DSH 自带运行时 electron 43.3.0 / node 24.18.1）会**顺着目录 junction 把目标内容一起清空**。
* 所以桥接副本与它那套「指向别处」的链一律放这儿，插件包里只留一个纯文件副本：
* 插件包被删时被连坐的是安全区里的东西，dsh 安装树一个字节不动。
*/
const safeRoot = join(resolveDshHome(), "llm-provider-bridge");
const bridgeDir = join(safeRoot, "llm-bridge");
const bridgeLib = join(bridgeDir, "lib", "index.js");
/**
* 安全区里**自有 pi-ai** 的版本目录根（`$DSH_HOME/llm-provider-bridge/pi-ai`）。
*
* updater 下载的最新版就落在这儿：插件包会被整棵递归删（包管理器/插件市场/宿主），
* 下载几百 MB 的 pi-ai 放插件包里等于每次升级插件都要重下。放安全区则随用随取，
* 且拨开关回 OFF 时文件保留，再拨 ON 零成本。
*
* 每次调用现场 resolve（不缓存模块级常量）：测试注入 DSH_HOME 即时生效。
*/
function safePiAiDir() {
	return join(resolveDshHome(), "llm-provider-bridge", "pi-ai");
}
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
/** vendor/pi-ai/ 下已就位的版本目录（有 node_modules 的才算就位）。 */
function installedVersions() {
	try {
		return readdirSync(piAiVersionsDir).filter((name) => existsSync(join(piAiVersionsDir, name, "package.json")) && existsSync(join(piAiVersionsDir, name, "node_modules"))).sort(compareVersions);
	} catch {
		return [];
	}
}
/** 安全区里已就位的自有版本（有 package.json + node_modules 的才算就位），旧 → 新。 */
function safeInstalledVersions() {
	const dir = safePiAiDir();
	try {
		return readdirSync(dir).filter((name) => existsSync(join(dir, name, "package.json")) && existsSync(join(dir, name, "node_modules"))).sort(compareVersions);
	} catch {
		return [];
	}
}
/**
* 从状态记录读 pi-ai 来源偏好；缺省与脏值都是 'dsh'。
*
* 缺省 'dsh' 是有意的：存量用户升级插件后行为不变（继续用 DSH 自带那份），
* 只有主动拨开关才 opt-in 到「下载并使用最新版」。
*/
function readPiAiPreference(status) {
	return status["piAiPreference"] === "latest" ? "latest" : "dsh";
}
/** 拨开关：把偏好写进 status.json（随桥接状态一起落盘；该文件是 gitignore 的运行时状态）。 */
function setPiAiPreference(preference) {
	updateStatus({ piAiPreference: preference });
}
/**
* 下次启动会不会挂到与**当前不同**的桥接（纯函数，离线可测）。
*
* 这是界面上「重启生效」的唯一事实来源，不再读 status.json 里那个写时不一的
* needsRestart 标志——它只在 updater「真的下载安装了」时置位，而原地启用（安全区已就位、
* 走跳过分支）永远不置位，于是开关拨了界面却只说「无需下载」，像没拨一样
* （用户 09-22 报的 bug：同一句结论在明细行与开关行各出现一次，唯独不说要重启）。
* 该不该重启本来就是三个现成事实的算术：
*   - 'latest' + 安全区有 newest + 当前跑的不是它 → true（下载好了 / 刚拨 ON，重启才切）；
*   - 'latest' + 安全区空 → false（没东西可切，界面走「未下载」/ 上次检查结论）；
*   - 'dsh' + 当前正跑安全区版 → true（拨了 OFF，重启才回退官方）；
*   - 其余 → false（当前跑的就是偏好将选中的那档，重启与否一个样）。
* @param preference - 当前偏好（设置页开关）。
* @param safeVersions - 安全区已就位版本，旧 → 新（{@link safeInstalledVersions} 的形状）。
* @param runningSource - 当前进程加载的那档 key（loadBridge 的 chosen.key）；桥接没装上时 undefined。
*/
function piAiNeedsRestart(preference, safeVersions, runningSource) {
	if (preference === "latest") {
		const newest = safeVersions[safeVersions.length - 1];
		return newest !== void 0 && runningSource !== `safe-${newest}`;
	}
	return runningSource !== void 0 && runningSource.startsWith("safe-");
}
/**
* 安全区版本清单 → 候选档（纯函数）：新 → 旧，key 带 `safe-` 前缀。
*
* 前缀是 loadBridge「选定即清理」的识别依据：只有选中的是安全区档时才清旧版，
* 选中 dsh 自带档时一个字节都不动（拨 OFF 保留文件，再拨 ON 零成本）。
*/
function safeCandidates(versions) {
	return [...versions].reverse().map((version) => ({
		key: `safe-${version}`,
		version,
		root: join(safePiAiDir(), version),
		link: true
	}));
}
/**
* 选定即清理：选中的那版之外，安全区里还剩的旧版目录（loadBridge 切换完成后才清）。
*
* 为什么不在下载完成时就清：当前进程的软链还指着旧版，pi-ai-names 等懒加载模块
* 重启前还会读旧版的文件——那时删就是断链。绑定在「切换已完成」这个事件上最稳。
*/
function obsoleteSafeVersions(versions, chosen) {
	return versions.filter((version) => version !== chosen);
}
/**
* semver 数字比较，够用即可（pi-ai 是 0.x.y 格式）。
*
* 预发布 tag（0.86.0-beta.1）这类非纯数字段 Number() 出来是 NaN，NaN 参与比较时
* `diff !== 0` 永远为真，会把整个排序搅乱（installedVersions 的 sort、updater 的
* 「已是最新」判断都吃它）。这里把解析不出的段当 0：0.86.0-beta.1 与 0.86.0 视为同版。
* pi-ai 目前没有预发布版本，这只是防 NaN 的守卫，不追求完整 semver 语义。
*/
function compareVersions(a, b) {
	const nums = (version) => version.split(".").map((part) => Number(part) || 0);
	const pa = nums(a);
	const pb = nums(b);
	for (let i = 0; i < 3; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
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
function pluginDependencyRoot() {
	return join(vendorDir, "node_modules", "@earendil-works", "pi-ai");
}
/**
* 当前生效的 pi-ai 包目录。
*
* loadBridge() 挑定之后以它为准——挑的时候可能回退过，跟"vendor 里最新"不是一回事，
* 而这个根目录下面那三个读 pi-ai 文件的模块（provider 名字、模型详情、候选清单）
* 必须跟真正被加载的那份对上。没跑过 loadBridge 的场合退回静态推断。
*/
let activeRoot;
function activePiAiRoot() {
	if (activeRoot !== void 0) return activeRoot;
	if (readPiAiPreference(readStatus()) === "latest") {
		const safe = safeInstalledVersions();
		const newest = safe[safe.length - 1];
		if (newest !== void 0) return join(safePiAiDir(), newest);
	}
	const versions = installedVersions();
	const newest = versions[versions.length - 1];
	if (newest !== void 0) return join(piAiVersionsDir, newest);
	if (existsSync(pluginDependencyRoot())) return pluginDependencyRoot();
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
/** 读桥接副本，返回它对 pi-ai 的 import 需求（updater 装完新版本也拿它体检）。 */
function bridgeRequirements() {
	try {
		return piAiRequirements(readFileSync(bridgeLib, "utf8"));
	} catch {
		return [];
	}
}
/** 路径是否在插件包外面：包外面的候选才需要先落地成安全区副本（见 safeRoot 的说明）。 */
function isOutsidePlugin(path) {
	return !(path === pluginRoot || path.startsWith(pluginRoot + sep));
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
function removeTree(path) {
	let stats;
	try {
		stats = lstatSync(path);
	} catch {
		return;
	}
	if (stats.isSymbolicLink()) {
		unlinkSync(path);
		return;
	}
	if (!stats.isDirectory()) {
		rmSync(path, { force: true });
		return;
	}
	let entries = [];
	try {
		entries = readdirSync(path);
	} catch {}
	for (const name of entries) removeTree(join(path, name));
	try {
		rmdirSync(path);
	} catch {}
}
/**
* 删掉一条目录链（symlink/junction）或一个真目录——**只能用这个函数删链**。
*
* 递归那一支永远走 {@link removeTree}（只摘链、不跟进目标），并且限定在插件自己的两个
* 受管目录里：插件包的 `vendor/` 与 DSH_HOME 下的安全区。@param path - 要删的链或目录。
*/
function removeLinkOrDir(path) {
	let stats;
	try {
		stats = lstatSync(path);
	} catch {
		return;
	}
	if (stats.isSymbolicLink()) {
		unlinkSync(path);
		return;
	}
	if (!(path === vendorDir || path.startsWith(vendorDir + sep) || path === safeRoot || path.startsWith(safeRoot + sep))) throw new Error(`拒绝递归删除受管目录之外的路径：${path}`);
	removeTree(path);
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
/** 插件私有安全区根目录（`$DSH_HOME/llm-provider-bridge`）。 */
function safeRootDir() {
	return safeRoot;
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
function copyTreeNoLinks(source, dest) {
	const counter = { files: 0 };
	copyInto(source, dest, counter);
	return counter.files;
}
function copyInto(source, dest, counter) {
	let stats;
	try {
		stats = lstatSync(source);
	} catch {
		return;
	}
	if (stats.isSymbolicLink()) return;
	if (stats.isDirectory()) {
		try {
			mkdirSync(dest, { recursive: true });
		} catch {
			return;
		}
		let entries = [];
		try {
			entries = readdirSync(source);
		} catch {
			return;
		}
		for (const name of entries) copyInto(join(source, name), join(dest, name), counter);
		return;
	}
	if (!stats.isFile()) return;
	try {
		if (existsSync(dest) && statSync(dest).size === stats.size) return;
	} catch {}
	try {
		copyFileSync(source, dest);
		counter.files += 1;
	} catch {}
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
function ensureSafeCopy(source, version, destRoot = safePiAiDir()) {
	const dest = join(destRoot, version);
	try {
		const from = (() => {
			try {
				return realpathSync(source);
			} catch {
				return source;
			}
		})();
		if (existsSync(join(dest, "package.json")) && piAiVersionOf(dest) === piAiVersionOf(from)) return dest;
		removeTree(dest);
		mkdirSync(dest, { recursive: true });
		copyTreeNoLinks(from, dest);
		return existsSync(join(dest, "package.json")) ? dest : void 0;
	} catch {
		return;
	}
}
/**
* dsh 自带那份 pi-ai 的入口是否已经解不开（只看文件在不在，不加载）。
*
* 「目录还在、入口没了」正是 junction 连坐删除留下的残状态：官方 `llm-pi-ai` 入口会以
* `Cannot find package '<目录>\index.js'` 失败，dsh 连启动都起不来。
* @param root - pi-ai 包目录。
*/
function piAiEntryMissing(root) {
	let pkg;
	try {
		pkg = asRecord(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
	} catch {
		return true;
	}
	const exportsField = pkg["exports"];
	if (exportsField !== void 0) {
		const entry = exportsEntry(exportsField);
		if (entry !== void 0) return !existsSync(resolve(root, entry));
	}
	const main = readString(pkg["main"]);
	if (main !== void 0) return !existsSync(resolve(root, main));
	return !existsSync(join(root, "index.js"));
}
/** 从 `exports` 里抠出 `.` 这条的入口文件：够 pi-ai 这种简单映射用。 */
function exportsEntry(value) {
	if (typeof value === "string") return value;
	if (value === null || typeof value !== "object") return void 0;
	const record = asRecord(value);
	const dot = record["."] ?? record;
	if (typeof dot === "string") return dot;
	const inner = asRecord(dot);
	for (const key of [
		"import",
		"default",
		"node",
		"module"
	]) {
		const target = inner[key];
		if (typeof target === "string") return target;
		if (target !== null && typeof target === "object") {
			const nested = asRecord(target)["default"];
			if (typeof nested === "string") return nested;
		}
	}
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
function repairPiAiFromCopy(target, copy) {
	if (!existsSync(target) || !existsSync(copy)) return 0;
	if (!piAiEntryMissing(target)) return 0;
	return copyTreeNoLinks(copy, target);
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
* 探针目录按候选命名（`.probe-<key>`），是一次性脚手架：用完即拆（finally 里 removeTree，
* 摘链不跟进目标）。key 只是为了同一次运行里不同候选互不串场；每次现造的模块 URL 天然规避
* 「加载失败的 ESM 半初始化记录」跨场景串味。不清理的话它们会在用户的 DSH 主目录里永久
* 堆积（用户批注：llm-bridge 下一堆 .probe-* 是什么、应清理）。
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
		removeLinkOrDir(link);
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
	} finally {
		removeTree(dir);
	}
}
/**
* pi-ai 候选，按优先级排：
*   0. `$DSH_HOME/llm-provider-bridge/pi-ai/<版本>/`——开关拨 ON 后 updater 下载的自有版，新 → 旧
*      （偏好为 'dsh' 时整档不入链：只用 DSH 自带那份）
*   1. `vendor/pi-ai/<版本>/`——历史遗留的下载档（新策略不再往里写），新 → 旧
*   2. `vendor/node_modules/@earendil-works/pi-ai`——可选的手装兜底档（vendor/package.json 锁定）
*   3. dsh 自己装的那份——从官方 bundle 的位置解析出来，包放哪一层都能找到
* @param preference - 来源偏好；缺省读 status.json（'dsh' 表示安全区档不入链）。
*/
function piAiCandidates(preference) {
	const list = [];
	if ((preference ?? readPiAiPreference(readStatus())) === "latest") list.push(...safeCandidates(safeInstalledVersions()));
	const versions = installedVersions();
	for (let i = versions.length - 1; i >= 0; i -= 1) {
		const version = versions[i];
		if (version === void 0) continue;
		list.push({
			key: version,
			version,
			root: join(piAiVersionsDir, version),
			link: true
		});
	}
	const dependency = pluginDependencyRoot();
	list.push({
		key: "dependency",
		version: piAiVersionOf(dependency) ?? "内置依赖",
		root: dependency,
		link: false
	});
	const appRoot = dshPiAiRoot(join(dirname(process.execPath), "resources", "app", "lib", "_anchor.js"));
	if (appRoot !== void 0) list.push({
		key: "dsh-app",
		version: piAiVersionOf(appRoot) ?? "dsh 自带",
		root: appRoot,
		link: true
	});
	const dshRoot = dshPiAiRoot(findSourceBundle());
	if (dshRoot !== void 0) list.push({
		key: "dsh",
		version: piAiVersionOf(dshRoot) ?? "dsh 自带",
		root: dshRoot,
		link: true
	});
	return list;
}
function readStatus() {
	try {
		return asRecord(JSON.parse(readFileSync(statusFile(), "utf8")));
	} catch {}
	try {
		const legacy = asRecord(JSON.parse(readFileSync(legacyStatusFile(), "utf8")));
		if (Object.keys(legacy).length > 0) try {
			mkdirSync(dirname(statusFile()), { recursive: true });
			writeFileSync(statusFile(), JSON.stringify(legacy, null, 2) + "\n");
			rmSync(legacyStatusFile(), { force: true });
		} catch {}
		return legacy;
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
	mkdirSync(dirname(statusFile()), { recursive: true });
	writeFileSync(statusFile(), JSON.stringify({
		...mergeStatus(readStatus(), patch),
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	}));
}
function updateStatus(patch) {
	writeStatus(patch);
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
		let repairedFiles = 0;
		let safeCopy;
		/**
		* 备份/自愈只服务**插件自己管理的 pi-ai**（updater 下载进 `vendor/pi-ai/<版本>/` 的那些）：
		* 备份放在插件包外的安全区，包管理器整棵删插件包时丢的也只是这份可重建的备份。
		*
		* 用 dsh 自带那份时**不留副本、不做修复**（用户 09-19 决定）：那份是 dsh 的东西，与当前
		* 版本一致，多复制 ≈6 MB 没有意义；r6 之后本插件也不可能再把它清空。哪天真切换成「插件
		* 管理的更新版本」，这一路径天然就会启用——候选落在本插件里，备份/补缺都走下面这套。
		* @param candidate - 候选。
		*/
		const prepareCandidate = (candidate) => {
			if (isOutsidePlugin(candidate.root)) return;
			const copy = ensureSafeCopy(candidate.root, candidate.version);
			if (copy === void 0) return;
			safeCopy = copy;
			if (piAiEntryMissing(candidate.root)) repairedFiles += repairPiAiFromCopy(candidate.root, copy);
		};
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
			prepareCandidate(candidate);
			const probe = probePiAi(requirements, candidate.root, candidate.key);
			if (probe.ok) {
				chosen = {
					...candidate,
					root: candidate.root
				};
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
			const host = candidates.filter((entry) => entry.key === "dsh" || entry.key === "dsh-app").map((entry) => ({
				root: entry.root,
				integrity: inspectPiAi(entry.root)
			})).find((probe) => probe.integrity.hasManifest && !probe.integrity.usable);
			const hint = host === void 0 ? "" : `
${describeIntegrity(host.root, host.integrity)}
${restoreHint(host.integrity.version)}`;
			return {
				ok: false,
				error: `没有能用的 pi-ai：${detail === "" ? "（候选清单为空）" : detail}${hint}`,
				rejected,
				candidates
			};
		}
		syncBridgeLinks(srcBundle, chosen.root);
		const require = createRequire(import.meta.url);
		delete require.cache?.[bridgeLib];
		const plugin = require(bridgeLib);
		activeRoot = chosen.root;
		if (chosen.key.startsWith("safe-")) for (const stale of obsoleteSafeVersions(safeInstalledVersions(), chosen.version)) removeLinkOrDir(join(safePiAiDir(), stale));
		writeStatus({
			piAiVersion: chosen.version,
			piAiSource: chosen.key,
			probeUnverified: probeUnverified || void 0,
			safeCopy: safeCopy ?? void 0,
			repairedFiles: repairedFiles > 0 ? repairedFiles : void 0,
			...rejected.length === 0 ? { rejected: void 0 } : { rejected }
		});
		return {
			ok: true,
			plugin,
			piAiVersion: chosen.version,
			piAiSource: chosen.key,
			probeUnverified,
			rejected,
			candidates,
			repairedFiles
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
function syncBridgeLinks(bundlePath, piAiRoot) {
	const farm = join(bridgeDir, "node_modules");
	let links = 0;
	const wire = (specifier, target) => {
		if (target === void 0) return;
		const parts = specifier.split("/");
		const linkDir = join(farm, ...parts.slice(0, -1));
		const linkPath = join(farm, ...parts);
		mkdirSync(linkDir, { recursive: true });
		const spec = linkSpec(linkDir, target);
		let current;
		try {
			current = readlinkSync(linkPath);
		} catch {}
		const healthy = existsSync(linkPath);
		if (current === spec.target && healthy) return;
		if (!removeDirectoryLink(linkPath)) removeLinkOrDir(linkPath);
		try {
			symlinkSync(spec.target, linkPath, spec.type);
			links += 1;
		} catch {}
	};
	wire("@earendil-works/pi-ai", piAiRoot);
	let source = "";
	try {
		source = readFileSync(bundlePath, "utf8");
	} catch {
		return links;
	}
	for (const specifier of bundleSpecifiers(source)) {
		if (specifier.startsWith("@earendil-works/pi-ai")) continue;
		wire(specifier, resolvePackageRoot(bundlePath, specifier));
	}
	return links;
}
/**
* bundle 里的 bare specifier 清单（相对路径、node: 内置、URL 都排除）。
*
* 链田按它铺：bundle 里每一个外部包都要能在桥接副本的解析路径上找到。
* @param source - bundle 源码。
*/
function bundleSpecifiers(source) {
	const found = /* @__PURE__ */ new Set();
	const pattern = /(?:\bfrom|\bimport|\bexport)\s*\(?\s*["']([^"']+)["']/g;
	let match;
	while ((match = pattern.exec(source)) !== null) {
		const specifier = match[1] ?? "";
		if (specifier === "" || specifier.startsWith(".") || specifier.startsWith("/")) continue;
		if (/^[a-zA-Z]+:/.test(specifier)) continue;
		found.add(specifier);
	}
	return [...found].sort();
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
export { activePiAiRoot, bridgeRequirements, bundleSpecifiers, compareVersions, copyTreeNoLinks, ensureSafeCopy, installedVersions, isDirectoryLink, loadBridge, mergeStatus, obsoleteSafeVersions, piAiCandidates, piAiEntryMissing, piAiNeedsRestart, piAiRequirements, probePiAi, readPiAiPreference, removeDirectoryLink, removeLinkOrDir, removeTree, repairPiAiFromCopy, safeCandidates, safeInstalledVersions, safePiAiDir, safeRootDir, setPiAiPreference, syncBridgeLinks, updateStatus, vendorDir };

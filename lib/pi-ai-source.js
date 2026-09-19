import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
//#region src/pi-ai-source.ts
/**
* pi-ai 来源策略：**只用 DSH 自带那一份，绝不额外下载**。
*
* 这是用户诉求的直接落地：llm-provider 维护宿主自带的 pi-ai，而不是自己养一份。
* 旧策略会去 npm 查上游、下载新版本、存进 `vendor/pi-ai/<v>/`、再把桥接链指过去，
* 结果是：
*   1. 插件目录里多出约 80 MB 的重复副本（issue #4 实测 260 MB）；
*   2. 多出一条"下载/替换/清理"的写路径，算错根目录就会伤到宿主；
*   3. 版本可能跟宿主不一致，桥接跑的是另一份 pi-ai，问题更难定位。
*
* 新策略把插件对 pi-ai 的关系收敛成三件只读的事：
*   - **检测**：宿主那份是否完整（`package.json` + `dist/index.js` + 官方要的子路径）；
*   - **使用**：桥接直接指向宿主那份（不复制、不下载）；
*   - **报告**：不完整时给出可执行的诊断（缺哪个子路径、怎么恢复）。
*
* 下载入口一律关闭：自动检查与手动更新都不再触网。历史遗留的 `vendor/pi-ai/<v>/`
* 副本在启动时清掉——它们占空间，且留着会让「到底在用哪一份」变得含糊。
*/
/**
* 官方 `@deepseek-ai/dsh-llm-pi-ai` 真正 import 的 pi-ai 子路径。
*
* 清单来自实测（对 `app/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js`
* 逐个真实加载验证），不是照抄文档：官方 bundle 只用包根 + 这四条子路径。
* 少任何一条官方 adapter 就装不起来——这正是要提前报出来的东西。
*/
const PI_AI_REQUIRED_SUBPATHS = [
	"providers/all.js",
	"api/anthropic-messages.lazy.js",
	"api/openai-completions.lazy.js",
	"api/openai-responses.lazy.js"
];
/** 读 pi-ai 版本号；读不到返回 undefined。 */
function readPiAiVersion(root) {
	try {
		const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
		return typeof version === "string" && version !== "" ? version : void 0;
	} catch {
		return;
	}
}
/**
* 检查某个目录里的 pi-ai 是否完整可用。
* @param root - pi-ai 包目录（`.../@earendil-works/pi-ai`）。
*/
function inspectPiAi(root) {
	const hasManifest = existsSync(join(root, "package.json"));
	const hasEntry = existsSync(join(root, "dist", "index.js"));
	const missingSubpaths = PI_AI_REQUIRED_SUBPATHS.filter((subpath) => !existsSync(join(root, "dist", ...subpath.split("/"))));
	return {
		hasManifest,
		hasEntry,
		missingSubpaths,
		usable: hasManifest && hasEntry && missingSubpaths.length === 0,
		version: readPiAiVersion(root)
	};
}
/**
* 把完整性结论写成一句人话（诊断用）。
*
* 报错文案要能直接回答「哪里不对」，而不是丢一个 `Cannot find package`
* 让用户去猜——事故当天的日志就是这样误导排查方向的。
*/
function describeIntegrity(root, integrity) {
	if (integrity.usable) return `完整（${integrity.version ?? "版本未知"}）`;
	const problems = [];
	if (!integrity.hasManifest) problems.push("缺 package.json");
	if (!integrity.hasEntry) problems.push("缺 dist/index.js（入口）");
	if (integrity.missingSubpaths.length > 0) problems.push(`缺子路径 ${integrity.missingSubpaths.join("、")}`);
	return `${root} 不完整：${problems.join("；")}`;
}
/**
* 恢复指引：宿主 pi-ai 被清空时用户该敲什么。
*
* 刻意**不提供**「插件自动重新下载」——那正是要关掉的写路径。恢复走 npm 官方渠道，
* 且要覆盖回宿主目录（而不是塞进插件目录）。
*/
function restoreHint(version) {
	return [
		"宿主自带的 pi-ai 不完整，DSH 会在 boot 阶段整体加载失败（卸载插件也无法绕过）。",
		"恢复方式（在任意可写目录执行，把内容覆盖回 DSH 的 app 目录，不要装进插件目录）：",
		`  npm pack ${version === void 0 ? "@earendil-works/pi-ai" : `@earendil-works/pi-ai@${version}`}`,
		"  tar -xzf earendil-works-pi-ai-*.tgz",
		"  cp -r package/dist package/package.json \"<DSH>/resources/app/node_modules/@earendil-works/pi-ai/\""
	].join("\n");
}
/** 下载入口的关闭开关（自动检查 + 手动更新）。 */
const PI_AI_DOWNLOAD_DISABLED = true;
/**
* 给 UI 与日志用的策略说明。
*/
const PI_AI_POLICY_NOTE = "pi-ai 只使用 DSH 自带的那一份，已关闭插件的下载/更新入口";
//#endregion
export { PI_AI_DOWNLOAD_DISABLED, PI_AI_POLICY_NOTE, PI_AI_REQUIRED_SUBPATHS, describeIntegrity, inspectPiAi, readPiAiVersion, restoreHint };

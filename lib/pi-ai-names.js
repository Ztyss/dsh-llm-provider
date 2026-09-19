import { activePiAiRoot } from "./bridge.js";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join } from "node:path";
//#region src/pi-ai-names.ts
/**
* pi-ai 注册表名字读取：provider id → pi-ai 自己的 name（deepseek → "DeepSeek"）。
*
* 原则是「名字一律用 pi-ai 的，我们不另起」：调 pi-ai 包导出的 *Provider() 工厂
* 拿 name，和 pi-ai 自己展示/内部用的是同一个数据源。同步实现（createRequire，
* dsh 跑在 Node 22+，require(esm) 可用），带按根目录缓存——updater 换版本后根目录
* 变化，缓存自然失效。
*/
/** 按 pi-ai 包目录缓存；根目录变了（换版本）自然失效。 */
let cache;
/** pi-ai 注册表全量 id → name。读不到时返回空 Map（调用方自行兜底）。 */
function piAiNames() {
	const root = activePiAiRoot();
	if (root === void 0) return /* @__PURE__ */ new Map();
	if (cache !== void 0 && cache.root === root) return cache.names;
	const names = /* @__PURE__ */ new Map();
	const dir = join(root, "dist", "providers");
	let files;
	try {
		files = readdirSync(dir);
	} catch {
		return /* @__PURE__ */ new Map();
	}
	const require = createRequire(join(root, "package.json"));
	for (const file of files) {
		if (!file.endsWith(".js") || file.endsWith(".models.js") || file === "all.js") continue;
		const id = file.slice(0, -3);
		try {
			const mod = require(join(dir, file));
			const factory = Object.values(mod).find((value) => typeof value === "function" && /Provider$/.test(value.name));
			if (factory === void 0) continue;
			const name = factory().name;
			if (typeof name === "string" && name !== "") names.set(id, name);
		} catch {}
	}
	cache = {
		root,
		names
	};
	return names;
}
/** 单个 provider 的 pi-ai 注册名，读不到返回 undefined。 */
function piAiName(id) {
	return piAiNames().get(id);
}
//#endregion
export { piAiName, piAiNames };

import { activePiAiRoot } from "./bridge.js";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join } from "node:path";
//#region src/pi-ai-names.ts
/**
* pi-ai 注册表元信息读取：provider id → pi-ai 自己的 name / 官方默认端点 baseUrl / 缺省协议。
*
* 原则是「元信息一律用 pi-ai 的，我们不另起」：调 pi-ai 包导出的 *Provider() 工厂
* 拿数据，和 pi-ai 自己展示/内部用的是同一个数据源。同步实现（createRequire，
* dsh 跑在 Node 22+，require(esm) 可用），带按根目录缓存——updater 换版本后根目录
* 变化，缓存自然失效。显式传 root（测试用）时同样按根隔离。
*/
/** 按根目录缓存：name / baseUrl / api 一趟工厂调用全拿，names 视图就地派生。 */
let cache;
function readMetas(root) {
	if (root === void 0) return /* @__PURE__ */ new Map();
	if (cache !== void 0 && cache.root === root) return cache.metas;
	const metas = /* @__PURE__ */ new Map();
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
			const provider = factory();
			const name = typeof provider["name"] === "string" && provider["name"] !== "" ? provider["name"] : void 0;
			const baseUrl = typeof provider["baseUrl"] === "string" && provider["baseUrl"] !== "" ? provider["baseUrl"] : void 0;
			let api;
			try {
				const models = typeof provider["getModels"] === "function" ? provider["getModels"]() : void 0;
				if (Array.isArray(models)) for (const rawModel of models) {
					if (rawModel === null || typeof rawModel !== "object") continue;
					const candidate = rawModel["api"];
					if (typeof candidate === "string" && candidate !== "") {
						api = candidate;
						break;
					}
				}
			} catch {}
			metas.set(id, {
				name,
				baseUrl,
				api
			});
		} catch {}
	}
	cache = {
		root,
		metas
	};
	return metas;
}
/** pi-ai 注册表全量 id → 元信息。读不到时返回空 Map（调用方自行兜底）。 */
function piAiMetas(root) {
	return readMetas(root ?? activePiAiRoot());
}
/** 单个 provider 的 pi-ai 注册名，读不到返回 undefined。 */
function piAiName(id, root) {
	return piAiMetas(root ?? activePiAiRoot()).get(id)?.name;
}
/** 单个 provider 的官方默认端点元信息；目录里没有这个 id 返回 undefined（不硬猜）。 */
function piAiProviderEndpoint(id, root) {
	const meta = piAiMetas(root ?? activePiAiRoot()).get(id);
	return meta === void 0 ? void 0 : {
		baseUrl: meta.baseUrl,
		api: meta.api
	};
}
/**
* 「测试」端点解析（/provider/test-model 用）：
*   - 路由显式写了 baseURL：照用它（只去尾斜杠），协议按显式 api 字段；
*   - 没写 baseURL：回退 pi-ai 工厂的官方默认端点，协议缺省取工厂默认 api；
*   - 两者都没有（目录外 id / 工厂没带 baseUrl）：返回 undefined，调用方如实回报。
*/
function resolveTestEndpoint(route, root) {
	const explicit = typeof route.baseURL === "string" && route.baseURL !== "" ? route.baseURL.replace(/\/+$/, "") : "";
	if (explicit !== "") return {
		base: explicit,
		isAnthropic: route.api === "anthropic-messages"
	};
	const meta = piAiProviderEndpoint(route.id, root);
	if (meta === void 0 || meta.baseUrl === void 0 || meta.baseUrl === "") return void 0;
	return {
		base: meta.baseUrl.replace(/\/+$/, ""),
		isAnthropic: route.api === "anthropic-messages" || route.api === void 0 && meta.api === "anthropic-messages"
	};
}
//#endregion
export { piAiMetas, piAiName, piAiProviderEndpoint, resolveTestEndpoint };

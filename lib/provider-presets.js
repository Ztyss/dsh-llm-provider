import { activePiAiRoot } from "./bridge.js";
import { loadModelDetails } from "./model-details.js";
import { piAiName } from "./pi-ai-names.js";
import { NATIVE_EQUIVALENTS, labelOf, websiteOf } from "./routes.js";
import { findAdapter } from "./adapters/registry.js";
//#region src/provider-presets.ts
/**
* 可添加的供应商预设：Provider 标签页「＋ 添加供应商」的候选清单。
*
* 清单主体**动态来自生效 pi-ai 包的 providers 数据文件**（上游发新版自动跟进），按名字排序；
* pi-ai 目录没有的只有 EXTRA_PRESETS 里那一个自定义网关入口，固定排最后。名字一律取 pi-ai
* 注册表（见 pi-ai-names.ts），官网链接见 routes.ts 的 KNOWN_WEBSITES。每家标记 billing =
* 有没有余额查询适配器（没有也能加，只是卡片不显示余量）。
*
* 契约与官方 Models 页完全一致（写进 settings 的 llm-pi-ai.providers 段）：
*   - id：路由键，kebab-case（官方正则 ^[a-z][a-z0-9]*(-[a-z0-9]+)*$）
*   - apiKeyEnv：官方 deriveKeyRef 惯例（路由大写、非字母数字转 _、加 _API_KEY 后缀）
*   - api：pi-ai wire 协议；baseURL：各家默认端点
*/
/** pi-ai 目录外只保留一个任意网关入口：端点、协议、名字全由用户自定义。 */
const EXTRA_PRESETS = [{
	id: "custom-gateway",
	label: "Custom Gateway",
	baseURL: "",
	api: "openai-completions",
	custom: true
}];
/** 官方 deriveKeyRef 同款：路由键 → 凭据名（KIMI_CODING_API_KEY 这种）。 */
function keyEnvOf(routeId) {
	return String(routeId).toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
}
function makePreset(id, info) {
	const baseURL = typeof info.baseURL === "string" ? info.baseURL : "";
	return {
		id,
		label: piAiName(id) ?? info.label ?? labelOf(id),
		baseURL,
		api: info.api,
		apiKeyEnv: keyEnvOf(id),
		websiteUrl: websiteOf(id),
		models: typeof info.models === "number" ? info.models : 0,
		billing: findAdapter(id, baseURL) !== void 0,
		queryConfigNeeded: findAdapter(id, baseURL)?.queryConfigNeeded?.(baseURL || void 0) === true,
		custom: info.custom === true
	};
}
/** 全量预设：pi-ai 目录（动态）+ 补充预设，自定义入口排最后、其余按名字。 */
function buildPresets() {
	const byProvider = /* @__PURE__ */ new Map();
	for (const detail of loadModelDetails(activePiAiRoot())) {
		let current = byProvider.get(detail.provider);
		if (current === void 0) {
			current = {
				api: detail.api,
				baseURL: "",
				models: 0
			};
			byProvider.set(detail.provider, current);
		}
		current.models = (current.models ?? 0) + 1;
		if (current.baseURL === "" && typeof detail.baseUrl === "string") current.baseURL = detail.baseUrl;
	}
	const presets = [];
	const seen = /* @__PURE__ */ new Set();
	for (const [id, info] of byProvider) {
		seen.add(id);
		presets.push(makePreset(id, info));
	}
	for (const extra of EXTRA_PRESETS) if (!seen.has(extra.id)) presets.push(makePreset(extra.id, extra));
	presets.sort((a, b) => {
		if (a.custom !== b.custom) return a.custom ? 1 : -1;
		return a.label.localeCompare(b.label, "en");
	});
	return presets;
}
/** 这条预设对应到的已配置路由 id（同厂商被原生适配器覆盖也算）；没有就是 undefined。 */
function matchedRoute(presetId, configuredIds) {
	if (configuredIds.has(presetId)) return presetId;
	for (const equivalent of NATIVE_EQUIVALENTS[presetId] ?? []) if (configuredIds.has(equivalent)) return equivalent;
}
/**
* 预设 + 已配置标记（供 /provider/presets 路由）。同厂商被原生适配器覆盖也算已配置。
* @param configuredIds - 已有路由的 id（providerRoutes 的键）。
* @param keylessIds - 其中凭据没值的那些：单列 missingKey，界面照旧让用户选中它去补密钥。
*/
function presetsWithMeta(configuredIds, keylessIds) {
	const ids = configuredIds instanceof Set ? configuredIds : /* @__PURE__ */ new Set();
	const keyless = keylessIds instanceof Set ? keylessIds : /* @__PURE__ */ new Set();
	return buildPresets().map((preset) => {
		const route = matchedRoute(preset.id, ids);
		return {
			...preset,
			configured: route !== void 0,
			missingKey: route !== void 0 && keyless.has(route)
		};
	});
}
//#endregion
export { buildPresets, keyEnvOf, presetsWithMeta };

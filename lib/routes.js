import { asRecord, readString } from "./types.js";
import { piAiName } from "./pi-ai-names.js";
//#region src/routes.ts
/**
* provider 路由发现：决定额度面板上显示哪些 provider、各自用哪个凭据名。
*
* 两条来源合并：
*   1. settings 的 `llm-pi-ai.providers`——用户实际配置的 pi-ai 路由。catalog 里那些
*      没配置的 provider 也躺在 llm 目录里，但不该出现在额度面板上。
*   2. `ctx.llm.listConfigurableProviders()` 里的原生适配器路由（llm-deepseek 这类）：
*      它们不写 settings 段也带默认 apiKeyEnv，seam 上查不到这个默认值，只能用
*      NATIVE_ROUTE_DEFAULTS 对上。必须含进来，否则「deepseek 的 key 被填到 kimi 那一栏」
*      这类错配检测不到（实测就是靠这条才发现的）。
*
* 命名空间没注册时退回 settings.section()：直接读 dsh 解析好的文档，不用自己解析 YAML。
* 内核 0.1.7+ 上这两个读法都没了（settings 服务表单化），改走 `describe()`——见
* {@link readPiAiProviders}。
*/
/**
* `llm-pi-ai.providers` 的三代读法（按可用性依次尝试，取第一个非空）：
*
*   1. `settings.describe()` —— 内核 0.1.7+ 的表单式 API。返回每个活动条目的
*      `{ ns, value, base, user, revision }`；`value` 是解析后的合并值（schema 默认 +
*      插件 base + 用户层），语义与旧 `get()` 一致。0.1.7 上 `settings.yaml` 会被
*      迁移进条目配置（文件改名 `.imported`），旧读法整体失效——实测 `get`/`section`
*      都取空、额度面板报「没有发现可查额度的 provider」。
*   2. `settings.get(ns)` —— 0.1.5 系：命名空间解析后的值。
*   3. `settings.section(ns)` —— 同为 0.1.5 系，命名空间还没注册时的文档兜底。
*
* 只做「有值就用」的收敛：任何一层抛错/取空都静默往下一层走（额度面板宁缺勿炸）。
*/
function readPiAiProviders(settings) {
	if (settings === void 0) return {};
	if (typeof settings.describe === "function") {
		const described = safeValue(() => settings.describe?.({ redactSecrets: false }));
		if (Array.isArray(described)) for (const rawForm of described) {
			const form = asRecord(rawForm);
			if (form["ns"] !== "llm-pi-ai") continue;
			const merged = asRecord(asRecord(form["value"])["providers"]);
			if (Object.keys(merged).length > 0) return merged;
			const user = asRecord(asRecord(form["user"])["providers"]);
			if (Object.keys(user).length > 0) return user;
		}
	}
	const resolved = safeValue(() => asRecord(asRecord(settings.get?.("llm-pi-ai"))["providers"]));
	if (resolved !== void 0 && Object.keys(resolved).length > 0) return resolved;
	return safeValue(() => asRecord(asRecord(settings.section?.("llm-pi-ai"))["providers"])) ?? {};
}
/** 读一次可能抛错的东西；抛错给 undefined（不掩盖「空」，只吞异常）。 */
function safeValue(read) {
	try {
		const value = read();
		return value !== void 0 && value !== null && typeof value === "object" ? value : void 0;
	} catch {
		return;
	}
}
/**
* provider 显示名：pi-ai 注册表原名优先（deepseek → "DeepSeek"），
* pi-ai 没有的原生路由走 NATIVE_ROUTE_DEFAULTS，再按 id 拼一个（kimi-coding → "Kimi Coding"）。
*/
function labelOf(providerId) {
	const piName = piAiName(providerId);
	if (piName !== void 0) return piName;
	return providerId.split(/[-_]/).filter((part) => part !== "").map((part) => /^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(" ");
}
/** provider id → 官网/控制台链接（Provider 卡片名称下的跳转链接）。取自 CC Switch 预设（剥掉 aff/utm 跟踪参数）；CC Switch 没有的（moonshot/zenmux）用官方控制台地址。 */
const KNOWN_WEBSITES = {
	"kimi-coding": "https://www.kimi.com/code",
	"zai-coding-cn": "https://open.bigmodel.cn",
	"qwen-token-plan-cn": "https://bailian.console.aliyun.com",
	"deepseek-official": "https://platform.deepseek.com",
	"moonshotai-cn": "https://platform.moonshot.cn",
	"minimax-cn": "https://platform.minimaxi.com",
	"opencode-go": "https://opencode.ai/go",
	"openrouter": "https://openrouter.ai"
};
/** 查官网链接：精确匹配优先，再试前缀（minimax-cn → minimax-intl 这类变体兜底）。 */
function websiteOf(providerId) {
	const exact = KNOWN_WEBSITES[providerId];
	if (exact !== void 0) return exact;
	for (const key of Object.keys(KNOWN_WEBSITES)) {
		const stem = key.endsWith("-cn") ? key.slice(0, -3) : key;
		if (providerId.startsWith(key) || stem !== key && providerId.startsWith(stem)) return KNOWN_WEBSITES[key];
	}
}
/** 原生适配器的默认 apiKeyEnv：这些适配器不写 settings 段也有 key 引用，值只能在这里认。 */
const NATIVE_ROUTE_DEFAULTS = { "deepseek-official": {
	apiKeyEnv: "DEEPSEEK_API_KEY",
	label: "DeepSeek"
} };
/**
* 同一家供应商在两套适配器里的 id 对照：pi-ai 的 `deepseek` ↔ 原生 llm-deepseek 的
* `deepseek-official`。两边是同一个账号、同一个凭据名，所以界面上只该有一张卡片。
*/
const NATIVE_EQUIVALENTS = { deepseek: ["deepseek-official"] };
/** 这条原生路由对应那家供应商是不是已经有 pi-ai 路由在服务了。 */
function piAiRouteCovers(nativeProvider, routes) {
	for (const [piAiId, nativeIds] of Object.entries(NATIVE_EQUIVALENTS)) if (nativeIds.includes(nativeProvider) && routes.has(piAiId)) return true;
	return false;
}
/**
* 合并出要查额度的路由表。
* @param settings - settings 服务（可为 undefined）。
* @param llm - llm 服务（可为 undefined）；用它的 listConfigurableProviders 找原生路由。
*/
function providerRoutes(settings, llm) {
	const routes = /* @__PURE__ */ new Map();
	const piAiProviders = readPiAiProviders(settings);
	for (const [id, rawRoute] of Object.entries(piAiProviders)) {
		const route = asRecord(rawRoute);
		routes.set(id, {
			id,
			apiKeyEnv: readString(route["apiKeyEnv"]),
			baseURL: readString(route["baseURL"]),
			api: readString(route["api"]),
			label: readString(route["displayName"]),
			source: "llm-pi-ai",
			models: Array.isArray(route["models"]) ? route["models"] : void 0,
			modelOverrides: route["modelOverrides"] !== void 0 && route["modelOverrides"] !== null ? route["modelOverrides"] : void 0
		});
	}
	let declared = [];
	try {
		declared = typeof llm?.listConfigurableProviders === "function" ? llm.listConfigurableProviders() : [];
	} catch {
		declared = [];
	}
	for (const rawEntry of Array.isArray(declared) ? declared : []) {
		const entry = asRecord(rawEntry);
		if (entry["settingsNs"] === "llm-pi-ai") continue;
		const provider = readString(entry["provider"]);
		if (provider === void 0) continue;
		const defaults = NATIVE_ROUTE_DEFAULTS[provider];
		if (defaults === void 0 || routes.has(provider)) continue;
		if (piAiRouteCovers(provider, routes)) continue;
		routes.set(provider, {
			id: provider,
			apiKeyEnv: defaults.apiKeyEnv,
			baseURL: void 0,
			label: defaults.label,
			source: "native"
		});
	}
	return routes;
}
//#endregion
export { NATIVE_EQUIVALENTS, NATIVE_ROUTE_DEFAULTS, labelOf, providerRoutes, websiteOf };

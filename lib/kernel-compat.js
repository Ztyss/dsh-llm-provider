//#region src/kernel-compat.ts
/** settings 服务 / 普通记录的兜底读法（脏数据一律当空对象）。 */
function readRecord(read) {
	try {
		const value = read();
		return value !== void 0 && value !== null && (typeof value === "object" || typeof value === "function") ? value : {};
	} catch {
		return {};
	}
}
/**
* 探测桥接到的官方 Config 是 volatile（0.1.7+）还是 plain（0.1.5 系）。
*
* 判据：拿空 providers 跑一次 standard validate，校验产物 `providers.get` 是函数。
* 不解析内核版本号——rc.2/正式版语义再变，探测跟着 schema 走。
* 参数收 unknown：桥接模块的 Config 在我们自己的类型里是 unknown（形状随内核变）。
*/
function configAccessKind(plugin) {
	const config = readRecord(() => readRecord(() => plugin)["Config"]);
	const standard = readRecord(() => config["~standard"])["validate"];
	if (typeof standard !== "function") return "unknown";
	try {
		const result = standard({ providers: {} });
		if (result === void 0 || result === null || typeof result.then === "function") return "unknown";
		const value = readRecord(() => result.value);
		return typeof readRecord(() => value["providers"])["get"] === "function" ? "volatile" : "plain";
	} catch {
		return "unknown";
	}
}
/**
* 合并桥接路由：base（插件自带，如补丁声明的 deepseek）在下，用户 settings.yaml
* `llm-pi-ai.providers` 在上——同名路由用户覆盖，与 0.1.5 installSection 的
* 「schema 默认 → 插件 config → 用户层」顺序一致。纯函数，浅合并（每条路由整体覆盖）。
*/
function mergeBridgeProviders(base, user) {
	const merged = {};
	for (const [id, route] of Object.entries(base ?? {})) merged[id] = route;
	for (const [id, route] of Object.entries(user ?? {})) merged[id] = route;
	return merged;
}
/** 从 settings 服务的两级读法里抠出用户路由表（与 routes.ts 的 providerRoutes 同口径）。 */
function readUserProviders(settings) {
	const settingsRecord = readRecord(() => settings);
	const get = settingsRecord["get"];
	const section = settingsRecord["section"];
	const viaGet = readRecord(() => readRecord(() => typeof get === "function" ? get("llm-pi-ai") : void 0)["providers"]);
	if (Object.keys(viaGet).length > 0) return viaGet;
	return readRecord(() => readRecord(() => typeof section === "function" ? section("llm-pi-ai") : void 0)["providers"]);
}
/**
* 合成 volatile 访问器：`{ providers: { get: () => 合并路由 } }`。
*
* get 是**惰性**的——每次调用现读 settings，0.1.7 的
* `loader/volatile-update` 重入（ensureRegistrationFacts / ensureDirectory）拿到的
* 总是当前值。宿主端只需要这一个方法，别的不 duck-type（少假设少碎）。
*/
function volatileProvidersConfig(getProviders) {
	return { providers: { get: getProviders } };
}
/** 从我们收到的 config 里抠 base 路由表：volatile 访问器与平面对象两种形态都认。 */
function readBaseProviders(config) {
	const configRecord = readRecord(() => config);
	const providers = readRecord(() => configRecord["providers"]);
	const get = providers["get"];
	if (typeof get === "function") return readRecord(() => get());
	return providers;
}
//#endregion
export { configAccessKind, mergeBridgeProviders, readBaseProviders, readUserProviders, volatileProvidersConfig };

import { asRecord, readString } from "./types.js";
import { activePiAiRoot, loadBridge, vendorDir } from "./bridge.js";
import { enrichModelDetails, loadModelDetails } from "./model-details.js";
import { checkAndUpdate, startBackgroundCheck } from "./updater.js";
import { labelOf, providerRoutes, websiteOf } from "./routes.js";
import { findAdapter } from "./adapters/registry.js";
import { presetsWithMeta } from "./provider-presets.js";
import { findSharedCredentials } from "./credential-check.js";
import Schema from "@deepseek-ai/schemastery";
import { readFileSync } from "node:fs";
import { join } from "node:path";
//#region src/index.ts
/**
* dsh-llm-provider 宿主端。
*
* 两件事：
*   1. LLM 桥接（src/bridge.ts + src/updater.ts）：把官方 llm-pi-ai 适配器跑在
*      我们自动跟进的新版 pi-ai 上，上游出新模型不用等 dsh 发版。内置的
*      llm-pi-ai 行由 cordis.patch.yml 禁用，本插件完全接管（settings 的
*      llm-pi-ai 段、Web Models 设置页、模型选择器行为都不变）。
*   2. 计费接口（src/adapters/）：按 provider 查额度/余额，挂在
*      GET /plan/status；适配器各自独立文件，node lib/adapters/run.js 可单独跑测。
*
* 之所以用自建 HTTP 路由而不是官方的 Typert Remote：那套生成器是给 dsh 单体仓库写的
* （只认 <root>/packages/ 下的包、装饰器来源必须在已注册包里），单包插件走不通。
* 自建路由和 GUI 同源，浏览器端直接 fetch。
*
* **边界：插件启动不碰宿主的东西。** 对 dsh 安装目录、settings.yaml、credentials 一律
* 只读；写只发生在两处——插件自己的 vendor/ 目录（下载 pi-ai、拷桥接副本），以及用户
* 在界面上显式操作时（添加/删除 provider）。
*/
/** 桥接装载在模块加载期完成（loader 要同步读 Config）。失败则退化为纯计费模式。 */
const bridge = loadBridge();
const name = "provider";
const inject = ["llm", "webServer"];
const Config = bridge.ok ? bridge.plugin.Config : Schema.object({});
function apply(ctx, config) {
	/** 拿宿主服务：ctx.get(name) 与 ctx.name 两种写法都支持，这里统一。 */
	const service = (serviceName) => ctx.get?.(serviceName) ?? ctx[serviceName];
	const logger = typeof ctx.logger === "function" ? ctx.logger("provider") : void 0;
	const webServer = ctx["webServer"];
	if (bridge.ok) {
		bridge.plugin.apply(ctx, config);
		logger?.info?.(`llm bridge active on pi-ai ${bridge.piAiVersion}`);
	} else logger?.warn?.(`llm bridge 不可用，退化为纯计费模式：${bridge.error}`);
	async function resolveKey(apiKeyEnv) {
		if (typeof apiKeyEnv !== "string" || apiKeyEnv === "") return {
			key: void 0,
			configured: false,
			reason: "未配置 apiKeyEnv"
		};
		const credentials = service("credentials");
		if (credentials === void 0 || typeof credentials.resolve !== "function") return {
			key: void 0,
			configured: false,
			reason: "credentials 服务不可用"
		};
		try {
			const resolved = await credentials.resolve(apiKeyEnv);
			const key = typeof resolved === "string" ? resolved : readString(asRecord(resolved)["value"]);
			if (key === void 0) return {
				key: void 0,
				configured: false,
				reason: `${apiKeyEnv} 没有值`
			};
			return {
				key,
				configured: true,
				reason: void 0
			};
		} catch (error) {
			return {
				key: void 0,
				configured: false,
				reason: `${apiKeyEnv} 解析失败：${messageOf(error)}`
			};
		}
	}
	/**
	* 查一个 provider 路由的额度。
	* @param route - 来自 {@link providerRoutes}。
	* @param credentials - 收集 `{provider, ref, value}` 供凭据体检比对；值不外传。
	*/
	async function accountOf(route, credentials) {
		const providerId = route.id;
		const displayName = route.label ?? labelOf(providerId);
		const websiteUrl = websiteOf(providerId);
		const baseUrl = typeof route.baseURL === "string" && route.baseURL !== "" ? route.baseURL : void 0;
		const routeMeta = {
			api: route.api,
			apiKeyEnv: route.apiKeyEnv
		};
		const adapter = findAdapter(providerId, baseUrl);
		const credential = await resolveKey(route.apiKeyEnv);
		const keyHint = credential.configured ? maskKey(credential.key) : void 0;
		const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
		if (credential.configured && credential.key !== void 0) credentials.push({
			provider: providerId,
			ref: route.apiKeyEnv,
			value: credential.key
		});
		if (adapter === void 0) return {
			...routeMeta,
			id: providerId,
			displayName,
			kind: "unknown-provider",
			authConfigured: credential.configured,
			baseUrl,
			balances: [],
			windows: [],
			fetchedAt,
			websiteUrl,
			keyHint,
			deletable: route.source === "llm-pi-ai",
			note: "认不出这个 provider 的额度接口；在 src/adapters/ 加一个适配器并在 registry.ts 注册即可"
		};
		if (adapter.id === "qwen-unsupported") {
			const result = await adapter.query({
				id: providerId,
				displayName,
				key: void 0,
				baseUrl,
				extras: {}
			});
			if (result.websiteUrl === void 0) result.websiteUrl = websiteUrl;
			if (result.keyHint === void 0) result.keyHint = keyHint;
			if (result.deletable === void 0) result.deletable = route.source === "llm-pi-ai";
			result.membership = void 0;
			return {
				...routeMeta,
				...result
			};
		}
		if (!credential.configured) return {
			...routeMeta,
			id: providerId,
			displayName,
			kind: "quota",
			authConfigured: false,
			baseUrl,
			balances: [],
			windows: [],
			error: credential.reason,
			fetchedAt,
			websiteUrl,
			keyHint,
			deletable: route.source === "llm-pi-ai"
		};
		try {
			const result = await adapter.query({
				id: providerId,
				displayName,
				key: credential.key,
				baseUrl,
				extras: {}
			});
			if (result.websiteUrl === void 0) result.websiteUrl = websiteUrl;
			if (result.keyHint === void 0) result.keyHint = keyHint;
			if (result.deletable === void 0) result.deletable = route.source === "llm-pi-ai";
			result.membership = void 0;
			return {
				...routeMeta,
				...result
			};
		} catch (error) {
			return {
				...routeMeta,
				id: providerId,
				displayName,
				kind: "quota",
				authConfigured: true,
				baseUrl,
				balances: [],
				windows: [],
				error: messageOf(error),
				fetchedAt,
				websiteUrl,
				keyHint,
				deletable: route.source === "llm-pi-ai"
			};
		}
	}
	/** 额度接口不该被菜单开关打成串流请求，60 秒内复用同一份结果。 */
	const CACHE_MS = 6e4;
	let cached;
	async function snapshot(force) {
		if (!force && cached !== void 0 && Date.now() - cached.at < CACHE_MS) return cached.value;
		const settings = service("settings");
		const llm = service("llm");
		const providers = [...providerRoutes(settings, llm).values()];
		if (providers.length === 0) return {
			accounts: [],
			error: "没有发现可查额度的 provider：请在 $DSH_HOME/settings.yaml 的 llm-pi-ai.providers 里配置路由",
			fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		const credentials = [];
		const settled = await Promise.all(providers.map((route) => accountOf(route, credentials)));
		const warnings = findSharedCredentials(credentials);
		const value = {
			accounts: settled.map((account) => {
				const warning = warnings.find((entry) => entry.provider === account.id);
				return warning === void 0 ? account : {
					...account,
					credentialWarning: warning.message
				};
			}),
			fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		cached = {
			at: Date.now(),
			value
		};
		return value;
	}
	const json = (res, code, payload) => {
		res.writeHead(code, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end(JSON.stringify(payload));
	};
	/**
	* 自建写路由的公共骨架：只收 POST、读 JSON body、按 providerId 找路由（找不到回 404），
	* handler 里抛出的错误统一回 500。refresh / remove / test 三个路由共用这一份。
	*/
	function writeRoute(handle) {
		return (req, res) => {
			if (req.method !== "POST") {
				res.writeHead(405, { allow: "POST" });
				res.end();
				return;
			}
			let body = "";
			req.on("data", (chunk) => {
				body += String(chunk);
			});
			req.on("end", () => {
				(async () => {
					try {
						const parsed = asRecord(JSON.parse(body === "" ? "{}" : body));
						const providerId = parsed["providerId"];
						const routes = providerRoutes(service("settings"), service("llm"));
						const route = typeof providerId === "string" ? routes.get(providerId) : void 0;
						if (route === void 0) {
							json(res, 404, {
								ok: false,
								error: `没有发现这个 provider：${String(providerId)}`
							});
							return;
						}
						await handle(route, parsed, res);
					} catch (error) {
						json(res, 500, {
							ok: false,
							error: messageOf(error)
						});
					}
				})();
			});
		};
	}
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/plan/status",
		handler: (req, res) => {
			(async () => {
				try {
					const force = typeof req.url === "string" && req.url.includes("refresh=1");
					json(res, 200, await snapshot(force));
				} catch (error) {
					logger?.warn?.(`plan status failed: ${messageOf(error)}`);
					json(res, 500, {
						accounts: [],
						error: messageOf(error)
					});
				}
			})();
		}
	}), "dsh-llm-provider: /plan/status route");
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/provider/status",
		handler: (_req, res) => {
			const { status: bridgeState } = readVendorState();
			const llm = service("llm");
			let declaredCount = -1;
			try {
				declaredCount = typeof llm?.listConfigurableProviders === "function" ? llm.listConfigurableProviders().length : -1;
			} catch {}
			let routes = [];
			try {
				routes = [...providerRoutes(service("settings"), llm).values()].map((route) => ({
					id: route.id,
					apiKeyEnv: route.apiKeyEnv ?? null,
					source: route.source,
					...route.models === void 0 || route.models.length === 0 ? {} : { models: route.models },
					...route.modelOverrides === void 0 || Object.keys(asRecord(route.modelOverrides)).length === 0 ? {} : { modelOverrides: route.modelOverrides }
				}));
			} catch {}
			json(res, 200, {
				bridge: bridge.ok ? {
					active: true,
					piAiVersion: bridge.piAiVersion,
					source: bridge.piAiSource,
					rejected: bridge.rejected,
					probeUnverified: bridge.probeUnverified,
					candidates: bridge.candidates
				} : {
					active: false,
					error: bridge.error,
					rejected: bridge.rejected,
					candidates: bridge.candidates
				},
				llmDirectorySize: declaredCount,
				routes,
				deepseekRouteMissing: bridge.ok && !routes.some((route) => route.id === "deepseek"),
				update: {
					hostOnly: true,
					lastCheck: void 0,
					latest: void 0,
					pending: void 0,
					rejected: void 0
				},
				testMode: process.env.DSH_PROVIDER_TEST === "1"
			});
		}
	}), "dsh-llm-provider: /provider/status route");
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/provider/update",
		handler: (req, res) => {
			if (req.method !== "POST") {
				res.writeHead(405, { allow: "POST" });
				res.end();
				return;
			}
			(async () => {
				const result = await checkAndUpdate((line) => logger?.info?.(`[pi-ai updater] ${line}`));
				json(res, 200, result);
			})();
		}
	}), "dsh-llm-provider: /provider/update route");
	let modelDetailsCache;
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/provider/models",
		handler: (_req, res) => {
			(async () => {
				if (modelDetailsCache === void 0 || Date.now() - modelDetailsCache.at > 6e4) {
					const llm = service("llm");
					let value;
					try {
						const routes = [...providerRoutes(service("settings"), llm).keys()];
						value = await enrichModelDetails(loadModelDetails(activePiAiRoot()), llm, routes);
					} catch (error) {
						logger?.warn?.(`model details enrichment failed: ${messageOf(error)}`);
						value = loadModelDetails(activePiAiRoot());
					}
					modelDetailsCache = {
						at: Date.now(),
						value
					};
				}
				json(res, 200, {
					models: modelDetailsCache.value,
					fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
			})();
		}
	}), "dsh-llm-provider: /provider/models route");
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/provider/presets",
		handler: (_req, res) => {
			(async () => {
				const configured = /* @__PURE__ */ new Set();
				const keyless = /* @__PURE__ */ new Set();
				try {
					const routes = providerRoutes(service("settings"), service("llm"));
					for (const route of routes.values()) {
						configured.add(route.id);
						if (!(await resolveKey(route.apiKeyEnv)).configured) keyless.add(route.id);
					}
				} catch {}
				json(res, 200, { presets: presetsWithMeta(configured, keyless) });
			})();
		}
	}), "dsh-llm-provider: /provider/presets route");
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/provider/refresh",
		handler: writeRoute(async (route, _parsed, res) => {
			const account = await accountOf(route, []);
			if (cached !== void 0) cached = {
				at: cached.at,
				value: {
					...cached.value,
					accounts: cached.value.accounts.map((entry) => entry.id === account.id ? account : entry)
				}
			};
			json(res, 200, {
				ok: account.error === void 0 && account.authConfigured !== false,
				account
			});
		})
	}), "dsh-llm-provider: /provider/refresh route");
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/provider/remove",
		handler: writeRoute(async (route, _parsed, res) => {
			if (route.source !== "llm-pi-ai") {
				json(res, 400, {
					ok: false,
					error: "内置原生路由不支持在这里删除"
				});
				return;
			}
			const settings = service("settings");
			if (typeof settings?.mutate !== "function") throw new Error("settings 服务不可用");
			await settings.mutate("llm-pi-ai", [{
				op: "unset",
				path: ["providers", route.id]
			}]);
			let keyCleared = true;
			try {
				const credentials = service("credentials");
				if (typeof route.apiKeyEnv === "string" && route.apiKeyEnv !== "" && typeof credentials?.unset === "function") await credentials.unset(route.apiKeyEnv);
			} catch (error) {
				keyCleared = false;
				logger?.warn?.(`删除 ${route.id} 后清理凭据 ${String(route.apiKeyEnv)} 失败：${messageOf(error)}`);
			}
			if (cached !== void 0) cached = {
				at: cached.at,
				value: {
					...cached.value,
					accounts: cached.value.accounts.filter((entry) => entry.id !== route.id)
				}
			};
			json(res, 200, {
				ok: true,
				keyCleared
			});
		})
	}), "dsh-llm-provider: /provider/remove route");
	ctx.effect(() => webServer.register({
		kind: "exact",
		path: "/provider/test",
		handler: writeRoute(async (route, _parsed, res) => {
			const account = await accountOf(route, []);
			const ok = account.error === void 0 && account.authConfigured !== false;
			json(res, 200, {
				ok,
				account
			});
		})
	}), "dsh-llm-provider: /provider/test route");
	startBackgroundCheck(logger);
	logger?.info?.("dsh-llm-provider active: GET /plan/status, GET /provider/status, POST /provider/update");
}
/**
* 读插件在 vendor/ 下的状态文件：`status.json`（桥接用哪份 pi-ai、体检结论）。
*
* 历史说明：这里曾经还读 `updater-state.json` 的 `lastCheck`（"上次检查上游的时间"）。
* 下载/更新入口关闭后那个文件不再被写，读取也就一并去掉了。
*/
function readVendorState() {
	const read = (name) => {
		try {
			return asRecord(JSON.parse(readFileSync(join(vendorDir, name), "utf8")));
		} catch {
			return {};
		}
	};
	return { status: read("status.json") };
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/** key 的掩码提示：前 3 + **** + 后 4，够认出是哪一把，又不把值交出去。 */
function maskKey(key) {
	if (typeof key !== "string" || key === "") return void 0;
	if (key.length <= 7) return "****";
	return key.slice(0, 3) + "****" + key.slice(-4);
}
//#endregion
export { Config, apply, inject, name };

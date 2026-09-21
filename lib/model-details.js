import { asRecord, readNumber, readString } from "./types.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
//#region src/model-details.ts
/**
* 模型详情：把模型元数据的两条链路合并成下发给浏览器的一份。
*
*   1. route 声明（{@link collectRouteModels}）——走 `ctx.llm.listModels`，宿主 catalog 的同一个
*      入口。用户在 settings 里给 route 的 `models[].input` 声明的能力，只有这条链路带得出来。
*   2. pi-ai 目录（{@link loadModelDetails}）——生效 pi-ai 包的 providers 数据文件，字段最全
*      （input/contextWindow/maxTokens/reasoning/thinkingLevelMap）。
*
* 为什么不能只留一条：自定义模型 id（`opencode-go/deepseek-flash` 这种）在 pi-ai 目录里根本
* 不存在——只读目录就是「能识图却没徽章」，而且失败是静默的；反过来，目录里查不到也不等于
* 不支持。所以能力字段按 route 声明 → pi-ai 目录 → **未知**取，未知就留 undefined：
* 界面不打徽章、详情卡写「能力未知」。把「不知道」合成 false，等于把「没查过」渲染成「没有」。
*
* 为什么不用 session/modelCatalog：那条官方 RPC 的模型条目只有 id/name/description/reasoning，
* 没有上下文窗口、最大输出、能力（视觉/视频）这些——悬浮详情卡（Cherry Studio 式）需要更全的字段。
*
* 输出是一条平铺的详情数组，客户端按 provider + id 建索引（跨 provider 重名在 pi-ai 目录里是常态）。
*
* 能力增强链（合并版，issue #5）：pi-ai 目录**不是**能力的唯一来源——
*   1. {@link enrichModelDetails}：route 的模型经适配器 listModels 解析（能力第一来源，三态）；
*   2. {@link withAdapterModels}：合成 provider（modlens 等）适配器自报，只补缺；
*   3. {@link withDeclaredModels}：settings 原文兜底（老宿主没有 listModels、别名 id），只补缺。
*/
const DATA_DIR = join("dist", "providers", "data");
/** 索引/去重用的键：provider + id。跨 provider 重名（claude-opus-5 这种）靠它分开。 */
function keyOf(provider, id) {
	return provider + "/" + id;
}
/**
* 读一份模态表。空表当「没声明」而不是「什么都不支持」：适配器不会给空表，真给了也说明
* 这条链路没说出结论，那就该停在未知。
*/
function readModalities(value) {
	if (!Array.isArray(value)) return void 0;
	const list = value.filter((item) => typeof item === "string");
	return list.length > 0 ? list : void 0;
}
/** 调 `llm.listModels`：方法缺席（老宿主）给 undefined，抛错（路由没注册）交给调用方吞。 */
async function listRouteModels(llm, provider) {
	if (typeof llm.listModels !== "function") return void 0;
	return await llm.listModels(provider);
}
/** 调 `llm.resolveModelInfo`：同上。 */
async function resolveRouteModel(llm, provider, model) {
	if (typeof llm.resolveModelInfo !== "function") return void 0;
	return await llm.resolveModelInfo(provider, model);
}
/** 读一个 pi-ai 包目录的 providers 数据文件，拍平成模型详情数组。 */
function loadModelDetails(piAiRoot) {
	if (typeof piAiRoot !== "string" || piAiRoot === "") return [];
	const dir = join(piAiRoot, DATA_DIR);
	if (!existsSync(dir)) return [];
	const details = [];
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".json")) continue;
		let parsed;
		try {
			parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
		} catch {
			continue;
		}
		const data = asRecord(parsed);
		for (const api of Object.keys(data)) {
			const models = asRecord(data[api]);
			for (const [modelId, rawEntry] of Object.entries(models)) {
				const entry = asRecord(rawEntry);
				if (Object.keys(entry).length === 0) continue;
				const input = Array.isArray(entry["input"]) ? entry["input"].filter((x) => typeof x === "string") : [];
				const map = asRecord(entry["thinkingLevelMap"]);
				const thinking = Object.keys(map).filter((k) => map[k] !== null && map[k] !== void 0);
				details.push({
					id: readString(entry["id"]) ?? modelId,
					name: readString(entry["name"]) ?? modelId,
					provider: readString(entry["provider"]) ?? file.replace(/\.json$/, ""),
					api: readString(entry["api"]) ?? api,
					baseUrl: readString(entry["baseUrl"]),
					contextWindow: readNumber(entry["contextWindow"]),
					maxTokens: readNumber(entry["maxTokens"]),
					vision: input.includes("image"),
					video: input.includes("video"),
					reasoning: entry["reasoning"] === true,
					thinkingLevels: thinking,
					source: "pi-ai"
				});
			}
		}
	}
	return details;
}
/** 从 settings 的模型条目里读我们认得的字段（宽松；id 不合法就返回 undefined）。 */
function declaredModelOf(raw) {
	const entry = asRecord(raw);
	const id = readString(entry["id"]);
	if (id === void 0 || id === "") return void 0;
	return {
		id,
		name: readString(entry["name"]),
		contextWindow: readNumber(entry["contextWindow"]),
		maxTokens: readNumber(entry["maxTokens"]),
		input: Array.isArray(entry["input"]) ? entry["input"].filter((x) => typeof x === "string") : Array.isArray(entry["inputModalities"]) ? entry["inputModalities"].filter((x) => typeof x === "string") : [],
		reasoningEfforts: entry["reasoningEfforts"],
		reasoning: entry["reasoning"] === true,
		api: readString(entry["api"]),
		baseUrl: readString(entry["baseURL"]) ?? readString(entry["baseUrl"])
	};
}
/** 模型 id 的对照键：provider 与 id 一起算，避免不同家的同名模型互相顶掉（issue #5 的索引口径）。 */
function modelKey(provider, id) {
	return provider + "\0" + id;
}
/**
* 把路由声明的模型并进 pi-ai 目录详情。
*
* 规则（「路由声明 → pi-ai 目录」）：
*   1. 目录里已经有这个 (provider, model id) → 保留目录那份（上游权威，字段更全）；
*   2. 目录里按 id 有、但属于别家 → 仍然保留目录那份，**不**拿声明去改它，
*      省得把别家的元数据串到这条路由上；
*   3. 目录里没有 → 用声明合成一条（`source: 'declared'`），能显示能力的就显示，
*      声明里没写的字段留空（界面显示「—」/不显示，不猜）。
*
* 合成条目只用于显示（悬浮卡、徽标、上下文列），不参与请求构造：真正生效的字段由
* 官方 adapter 的 resolveRouteModels 从 settings 读，这里不改任何配置。
* @param details - {@link loadModelDetails} 的结果。
* @param routes - 路由表（带 models 声明的那几条才有效果）。
*/
function withDeclaredModels(details, routes) {
	const merged = details.slice();
	const byKey = /* @__PURE__ */ new Set();
	const byId = /* @__PURE__ */ new Set();
	for (const detail of merged) {
		byKey.add(modelKey(detail.provider, detail.id));
		byId.add(detail.id);
	}
	for (const route of routes) {
		const declaredList = Array.isArray(route.models) ? route.models : [];
		for (const raw of declaredList) {
			const model = declaredModelOf(raw);
			if (model === void 0) continue;
			if (byKey.has(modelKey(route.id, model.id)) || byId.has(model.id)) {
				if (model.reasoning === true) {
					let upgraded = false;
					for (const detail of merged) if (detail.id === model.id && detail.provider === route.id) {
						detail.reasoning = true;
						upgraded = true;
						break;
					}
					if (!upgraded) {
						const base = merged.find((detail) => detail.id === model.id);
						const baseDetail = base !== void 0 ? base : {
							id: model.id,
							name: model.name ?? model.id,
							provider: route.id,
							api: model.api,
							baseUrl: model.baseUrl,
							thinkingLevels: []
						};
						merged.push({
							...baseDetail,
							id: model.id,
							provider: route.id,
							reasoning: true,
							source: "declared"
						});
						byKey.add(modelKey(route.id, model.id));
					}
				}
				continue;
			}
			const efforts = model.reasoningEfforts;
			const levels = efforts !== null && typeof efforts === "object" ? Object.keys(asRecord(efforts)).filter((key) => asRecord(efforts)[key] !== null && asRecord(efforts)[key] !== void 0) : [];
			merged.push({
				id: model.id,
				name: model.name ?? model.id,
				provider: route.id,
				api: model.api ?? route.api ?? "openai-completions",
				baseUrl: model.baseUrl ?? route.baseURL,
				contextWindow: model.contextWindow,
				maxTokens: model.maxTokens,
				vision: model.input.includes("image"),
				video: model.input.includes("video"),
				reasoning: efforts !== false && (levels.length > 0 || efforts === true),
				thinkingLevels: levels,
				source: "declared"
			});
			byKey.add(modelKey(route.id, model.id));
			byId.add(model.id);
		}
	}
	return merged;
}
/**
* 把 `llm.resolveModelInfo` 的产出读成我们缺的那几样。
*
* 目录里没有的模型（自定义 id）合并进详情后只有能力字段，窗口和输出上限得从这条解析结果认：
* 用户明明在 route 里声明了 contextWindow/maxTokens，卡片上却空着，看着就像没生效。
*/
function readResolvedModel(provider, id, raw) {
	const info = asRecord(raw);
	const context = asRecord(info["context"]);
	const reasoning = asRecord(info["reasoning"]);
	const levels = (Array.isArray(reasoning["efforts"]) ? reasoning["efforts"] : []).map((effort) => readString(asRecord(effort)["id"])).filter((level) => level !== void 0);
	return {
		provider,
		id,
		contextWindow: readNumber(context["contextWindow"]),
		maxTokens: readNumber(info["defaultMaxTokens"]),
		reasoning: Object.keys(reasoning).length > 0,
		thinkingLevels: levels.length > 0 ? levels : void 0
	};
}
/**
* 把各 route 实际服务的模型收上来——能力的第一来源。
*
* 单条 route 拿不到就跳过它：跳过只让这条 route 的模型停在「能力未知」，不打徽章；硬猜一个
* 出来会把别人的能力挂到它头上，那比不打更难发现。
*/
async function collectRouteModels(llm, providers) {
	if (llm === void 0) return [];
	const collected = [];
	for (const provider of providers) {
		let raw;
		try {
			raw = await listRouteModels(llm, provider);
		} catch {
			continue;
		}
		if (!Array.isArray(raw)) continue;
		for (const item of raw) {
			const entry = asRecord(item);
			const id = readString(entry["id"]);
			if (id === void 0) continue;
			collected.push({
				provider,
				id,
				name: readString(entry["name"]),
				input: readModalities(entry["inputModalities"])
			});
		}
	}
	return collected;
}
/**
* 把 route 解析出来的模型并进 pi-ai 目录的详情。
*
* 优先级：**能力字段 route 声明 > pi-ai 目录 > 未知**；route 里出现、目录里没有的模型（自定义
* id）直接补一条——它们的能力只有 route 说得清，不补就永远没徽章。窗口/输出上限/思考档位反过来，
* 只在目录那条缺项时用 route 的值补：目录数据更权威。
* @param details - pi-ai 目录读出来的详情（函数内复制，不改入参：缓存会跨请求复用）。
* @param models - route 解析出来的模型（{@link collectRouteModels} 的产出）。
*/
function mergeRouteModels(details, models) {
	const merged = details.map((detail) => ({ ...detail }));
	const byKey = /* @__PURE__ */ new Map();
	for (const detail of merged) byKey.set(keyOf(detail.provider, detail.id), detail);
	for (const model of models) {
		const declared = readModalities(model.input);
		const key = keyOf(model.provider, model.id);
		const found = byKey.get(key);
		if (found === void 0) {
			const added = {
				id: model.id,
				name: model.name ?? model.id,
				provider: model.provider,
				contextWindow: model.contextWindow,
				maxTokens: model.maxTokens,
				vision: declared?.includes("image"),
				video: declared?.includes("video"),
				reasoning: model.reasoning,
				thinkingLevels: model.thinkingLevels ?? []
			};
			byKey.set(key, added);
			merged.push(added);
			continue;
		}
		if (declared !== void 0) {
			found.vision = declared.includes("image");
			found.video = declared.includes("video");
		}
		if (found.contextWindow === void 0) found.contextWindow = model.contextWindow;
		if (found.maxTokens === void 0) found.maxTokens = model.maxTokens;
		if (found.reasoning === void 0) found.reasoning = model.reasoning;
		if (found.thinkingLevels.length === 0 && model.thinkingLevels !== void 0) found.thinkingLevels = model.thinkingLevels;
	}
	return merged;
}
/**
* 能力链路的最后一环：**适配器自报**（2026-09-17 追加，用户报「modlens provider 还是没有视觉徽标」）。
*
* 有些 provider 的模型元数据，三处都没有：
*   ① pi-ai 目录数据文件——没有这个 provider（它不在上游 39 个 provider 里）；
*   ② settings 的 `llm-pi-ai.providers.<id>.models`——它不是 pi-ai 路由（是插件自己注册的合成 provider）；
*   ③ 官方目录 RPC `session/modelCatalog`——只下发 id/name/description/reasoning，能力字段在
*      `buildModelCatalog()` 里就被丢了（宿主侧 `resolveModelInfo()` 明明有 `inputModalities`）。
* 典型就是 modlens（`@liustack/modlens`）：它注册 `modlens-<上游>` / `deepseek-modlens` 合成 provider，
* 在 `listModels` 里给每个模型强制补上 `image`（"…(modlens vision)"），所以功能上能读图、
* 界面上却一条能力徽标都没有。
*
* 这里把宿主问到的适配器结论按 **provider+id** 并进详情表：已有的（pi-ai 目录 / 路由声明）不覆盖——
* 那两处是上游权威；只填空缺。
* @param details - 已有详情（pi-ai 目录 + 路由声明合并后的结果）。
* @param infos - 适配器自报的条目（见 {@link AdapterModelInfo}）。
*/
function withAdapterModels(details, infos) {
	const merged = details.slice();
	const byKey = /* @__PURE__ */ new Set();
	for (const detail of merged) byKey.add(modelKey(detail.provider, detail.id));
	for (const info of infos) {
		if (typeof info.provider !== "string" || info.provider === "" || typeof info.id !== "string" || info.id === "") continue;
		const key = modelKey(info.provider, info.id);
		if (byKey.has(key)) continue;
		const modalities = Array.isArray(info.inputModalities) ? info.inputModalities : [];
		merged.push({
			id: info.id,
			name: info.name ?? info.id,
			provider: info.provider,
			api: "adapter-reported",
			contextWindow: info.contextWindow,
			maxTokens: info.maxTokens,
			vision: modalities.includes("image"),
			video: modalities.includes("video"),
			reasoning: info.reasoning === true,
			thinkingLevels: Array.isArray(info.thinkingLevels) ? info.thinkingLevels : [],
			source: "adapter"
		});
		byKey.add(key);
	}
	return merged;
}
/**
* `/provider/models` 的完整出口：pi-ai 目录 + route 声明两条链路合并。
*
* 顺序是先收模型、再只给「目录里没有」的那些补窗口/输出上限：内置模型在目录里已经写全，不值得
* 为它们多打一轮 resolveModelInfo；自定义模型才是缺字段的那批。任何一步拿不到都只让对应字段停在
* 「未知」——徽章和详情卡打错比留空难发现得多。
* @param details - pi-ai 目录读出来的详情。
* @param llm - llm 服务（可为 undefined）。
* @param providers - 要问的 route id（`providerRoutes` 的键）。
*/
async function enrichModelDetails(details, llm, providers) {
	const models = await collectRouteModels(llm, providers);
	if (llm === void 0 || models.length === 0) return mergeRouteModels(details, []);
	const fromCatalog = new Set(details.map((detail) => keyOf(detail.provider, detail.id)));
	for (const model of models) {
		if (fromCatalog.has(keyOf(model.provider, model.id))) continue;
		let raw;
		try {
			raw = await resolveRouteModel(llm, model.provider, model.id);
		} catch {
			continue;
		}
		if (raw === void 0) continue;
		const resolved = readResolvedModel(model.provider, model.id, raw);
		model.contextWindow = resolved.contextWindow;
		model.maxTokens = resolved.maxTokens;
		model.reasoning = resolved.reasoning;
		model.thinkingLevels = resolved.thinkingLevels;
	}
	return mergeRouteModels(details, models);
}
//#endregion
export { collectRouteModels, enrichModelDetails, loadModelDetails, mergeRouteModels, modelKey, readResolvedModel, withAdapterModels, withDeclaredModels };

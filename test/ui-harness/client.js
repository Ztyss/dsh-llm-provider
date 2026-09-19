window.__ModuleLoader__.load({
	id: "@dsh-one/dsh-llm-provider",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/client/data.ts
		/**
		* 浏览器端数据层：同源 HTTP/RPC、额度快照缓存、目录/投影的读与归一化。
		* 组件不直接 fetch——全走这里。
		*/
		/** 同源 GET → JSON：宿主自建读路由（/plan/status、/provider/status|presets|models）的唯一入口。 */
		function getJson(url) {
			return fetch(url).then(function(response) {
				return response.json();
			});
		}
		/** 同源 POST JSON → JSON：宿主自建写路由（refresh / remove / test / update）的唯一入口。 */
		function postJson(url, body) {
			return fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body === void 0 ? {} : body)
			}).then(function(response) {
				return response.json();
			});
		}
		/** 额度快照：60 秒内复用，force 绕过（和宿主端缓存同拍）。 */
		var planCache = {
			at: 0,
			value: null
		};
		var planListeners = [];
		/**
		* 订阅共享额度快照。每次快照被写入（重拉、单卡刷新、删除某家）都会收到新值。
		* @param listener - 收到新快照的回调。
		* @returns 退订函数（组件卸载时调）。
		*/
		function onPlanChange(listener) {
			planListeners.push(listener);
			return function() {
				planListeners = planListeners.filter(function(entry) {
					return entry !== listener;
				});
			};
		}
		/**
		* 写入共享快照并广播。所有写入都走这里，快照只有一个源头——设置页卡片、座位指示器与
		* `/model` 命令读的都是它，不会各自停在旧值上。
		* @param value - 新的快照值。
		* @returns 同一个值，便于调用方直接拿来 setState。
		*/
		function writePlanCache(value) {
			planCache = {
				at: Date.now(),
				value
			};
			var listeners = planListeners.slice();
			for (var i = 0; i < listeners.length; i += 1) try {
				listeners[i](value);
			} catch (cause) {}
			return value;
		}
		function loadPlanStatus(force) {
			if (!force && planCache.value !== null && Date.now() - planCache.at < 6e4) return Promise.resolve(planCache.value);
			return getJson("/plan/status" + (force === true ? "?refresh=1" : "")).then(function(payload) {
				return writePlanCache(payload);
			});
		}
		/** 宿主桥接状态（pi-ai 版本、路由表、测试环境标记）。 */
		function loadProviderStatus() {
			return getJson("/provider/status");
		}
		/** 桥接状态拿不到时的占位：设置页据此渲染错误行，界面不至于空着。 */
		var STATUS_UNAVAILABLE = { bridge: {
			active: false,
			error: "宿主端状态不可用"
		} };
		/** 详情索引键：provider + id（本地版 issue #5：不同家的同名模型不会互相顶掉）。 */
		function detailKey(provider, id) {
			return String(provider) + "/" + String(id);
		}
		/**
		* 模型详情（生效 pi-ai 包的全量元数据 + 路由声明补齐），建两套索引：
		*   - `provider/id`：首选——同一个 id 在不同 provider 下能力可能不同（issue #5 的索引口径）；
		*   - 裸 `id`：兜底——老版本宿主不下发 provider 字段时还能查到，先到先得。
		*/
		function loadModelDetailMap() {
			return getJson("/provider/models").then(function(payload) {
				var map = {};
				if (payload === null || payload === void 0 || !Array.isArray(payload.models)) return map;
				for (var i = 0; i < payload.models.length; i += 1) {
					var detail = payload.models[i];
					if (detail === null || typeof detail !== "object") continue;
					if (typeof detail.provider === "string" && detail.provider !== "") map[detailKey(detail.provider, detail.id)] = detail;
					var bare = String(detail.id);
					if (map[bare] === void 0) map[bare] = detail;
				}
				return map;
			});
		}
		/** 查一条模型详情：先按 provider+id，查不到再退回裸 id。 */
		function lookupDetail(map, providerId, modelId) {
			if (map === void 0 || map === null) return void 0;
			var qualified = map[detailKey(providerId, modelId)];
			if (qualified !== void 0) return qualified;
			return map[modelId];
		}
		/** 生效目录里属于某个 provider 的全部模型（逐模型编辑器的候选来源）。 */
		function detailsOfProvider(map, providerId) {
			if (map === void 0 || map === null) return [];
			var own = [];
			var prefix = providerId + "/";
			for (var key in map) {
				if (key.indexOf("/") === -1 || key.slice(0, prefix.length) !== prefix) continue;
				var detail = map[key];
				if (typeof detail.id !== "string") continue;
				own.push(detail);
			}
			return own;
		}
		/** 不可变地合并一组 key（几个 setState 都这么写，集中一处）。 */
		function withKeys(prev, patch) {
			var next = {};
			for (var k in prev) next[k] = prev[k];
			for (var k2 in patch) next[k2] = patch[k2];
			return next;
		}
		/** 不可变地改 map 里的一个 key。 */
		function withKey(prev, key, value) {
			var patch = {};
			patch[key] = value;
			return withKeys(prev, patch);
		}
		/** 快照里剔掉一家（删除 provider 后用：不打上游、不让卡片复活）。 */
		function withoutAccount(payload, id) {
			if (payload === null || payload === void 0 || typeof payload !== "object") return payload;
			var record = payload;
			if (!Array.isArray(record.accounts)) return payload;
			return {
				...record,
				accounts: record.accounts.filter(function(account) {
					return account.id !== id;
				})
			};
		}
		/**
		* 把宿主实查回来的一个账户并进共享快照并广播（单卡刷新用）。
		* 列表里已经有这一家就盖掉，没有就补上——补上这条是必要的：刷新可能发生在
		* 首次拉取失败、或这一家刚被加进来（还没进快照）的时候。
		* @param fresh - `/provider/refresh` 回传的 account。
		*/
		function mergePlanAccount(fresh) {
			var current = planCache.value;
			var base = current === null || current === void 0 || typeof current !== "object" ? {} : current;
			var accounts = Array.isArray(base.accounts) ? base.accounts : [];
			var known = false;
			for (var i = 0; i < accounts.length; i += 1) {
				var entry = accounts[i];
				if (entry !== null && typeof entry === "object" && entry.id === fresh.id) known = true;
			}
			return writePlanCache({
				...base,
				accounts: known ? accounts.map(function(account) {
					return account.id === fresh.id ? fresh : account;
				}) : accounts.concat([fresh]),
				fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		/** 从客户端缓存里剔除一家并广播（删除 provider 后用：不打上游、不让卡片复活）。 */
		function dropPlanAccount(id) {
			writePlanCache(withoutAccount(planCache.value, id));
		}
		/**
		* 官方远程 RPC 同源调用（/api/<ns>/<method>，client-request 信封，cookie 自动认证）。
		* @param failMessage 信封里没有 error 对象时的兜底文案（默认「调用失败」）。
		*/
		function apiCall(method, args, failMessage) {
			return postJson("/api/" + method, {
				type: "client-request",
				rpcId: "dsh-llm-provider-" + String(Date.now()) + "-" + String(Math.random()).slice(2, 8),
				method,
				payload: { args }
			}).then(function(envelope) {
				var result = envelope && envelope.result;
				if (result && result.ok === true) return result.value;
				throw new Error(result && result.error ? String(result.error.code) + ": " + String(result.error.message) : failMessage === void 0 ? "调用失败" : failMessage);
			});
		}
		/**
		* 模型目录：session/modelCatalog 的同源 RPC（官方选择器走的是同一条）。
		* @returns `{ groups, default }`；default 是宿主默认选择，官方用它兜底
		*   （`current = projected.next ?? catalog.default`）——会话还没选过模型时显示的就是它。
		*/
		function loadModelCatalog() {
			return apiCall("session/modelCatalog", {}, "模型目录加载失败").then(function(value) {
				var catalog = value === null || typeof value !== "object" ? {} : value;
				return {
					groups: normalizeGroups(catalog.groups),
					default: normalizeSelection(catalog.default)
				};
			});
		}
		/** 一个 provider/model/reasoningEffort 选择；形状不对就当作没有。 */
		function normalizeSelection(value) {
			if (value === null || typeof value !== "object") return void 0;
			var record = value;
			if (typeof record.provider !== "string" || typeof record.model !== "string") return void 0;
			return typeof record.reasoningEffort === "string" ? {
				provider: record.provider,
				model: record.model,
				reasoningEffort: record.reasoningEffort
			} : {
				provider: record.provider,
				model: record.model
			};
		}
		/** 切换模型：GUI 自己的同源 RPC，和官方选择器同一条路。 */
		function submitSelection(sessionId, provider, model, reasoningEffort) {
			var request = {
				sessionId,
				provider,
				model
			};
			if (typeof reasoningEffort === "string") request.reasoningEffort = reasoningEffort;
			return apiCall("session/selectModel", { request }, "切换失败").then(function() {
				return true;
			});
		}
		/** provider id → 额度账户（两边用同一套 route id，直接对上）。 */
		function accountsById(payload) {
			var map = {};
			var source = payload === null || payload === void 0 ? void 0 : payload;
			var accounts = source !== void 0 && Array.isArray(source.accounts) ? source.accounts : [];
			for (var i = 0; i < accounts.length; i += 1) map[accounts[i].id] = accounts[i];
			return map;
		}
		var EMPTY_CELL = {
			getSnapshot: function() {},
			subscribe: function() {
				return function() {};
			}
		};
		/** 模型选择投影的 cell；读不到时给一个永远 undefined 的假 cell，组件照样能渲染。 */
		function selectionCell(sessions, sessionId) {
			if (sessions === void 0 || typeof sessions.binding !== "function") return EMPTY_CELL;
			var binding;
			try {
				binding = sessions.binding(sessionId);
			} catch (error) {
				return EMPTY_CELL;
			}
			var face = binding && binding.session && binding.session.projections;
			if (face === void 0 || typeof face.faceOf !== "function") return EMPTY_CELL;
			try {
				var cell = face.faceOf("modelSelection");
				if (cell !== void 0 && typeof cell.getSnapshot === "function" && typeof cell.subscribe === "function") return cell;
			} catch (error) {
				return EMPTY_CELL;
			}
			return EMPTY_CELL;
		}
		/** 投影值 → 当前 provider/model；投影可能是原值或 {next} 形状。 */
		function unwrap(value) {
			var record = value;
			if (value !== null && typeof value === "object" && typeof record.provider === "string") return record;
			if (value !== null && typeof value === "object" && record.next !== null && typeof record.next === "object") {
				var next = record.next;
				if (typeof next.provider === "string") return next;
			}
		}
		/** 读一次 snapshot store，失败当作没有。 */
		function snapshotOf(store) {
			if (store === void 0 || store === null || typeof store.getSnapshot !== "function") return void 0;
			try {
				return store.getSnapshot();
			} catch (error) {
				return;
			}
		}
		/**
		* 轮询一个 snapshot store（官方目录服务给的 store）。
		* 不用 useSyncExternalStore：不同 dsh 版本上 store 的 subscribe 契约不保证一致，
		* 订阅失败会把整块 UI 拖崩；轮询只影响「当前」标记的实时性。
		*/
		function usePolledSnapshot(store, intervalMs) {
			var state = react.default.useState(function() {
				return snapshotOf(store);
			});
			react.default.useEffect(function() {
				if (store === void 0 || store === null) return void 0;
				function read() {
					state[1](snapshotOf(store));
				}
				read();
				var timer = setInterval(read, intervalMs);
				return function() {
					clearInterval(timer);
				};
			}, [store]);
			return state[0];
		}
		/** 官方目录分组 → 我们内部统一的 [{ id, name, models: [{id, name, contextWindow?}] }]。 */
		function normalizeGroups(rawGroups) {
			var groups = Array.isArray(rawGroups) ? rawGroups : [];
			var normalized = [];
			for (var i = 0; i < groups.length; i += 1) {
				var group = groups[i];
				if (group === null || typeof group !== "object") continue;
				var groupRecord = group;
				var providerId = typeof groupRecord.provider === "string" ? groupRecord.provider : groupRecord.id;
				if (typeof providerId !== "string") continue;
				var models = [];
				var raw = Array.isArray(groupRecord.models) ? groupRecord.models : [];
				for (var j = 0; j < raw.length; j += 1) {
					var model = raw[j];
					if (typeof model === "string") models.push({
						id: model,
						name: model
					});
					else if (model !== null && typeof model === "object") {
						var modelRecord = model;
						if (typeof modelRecord.id !== "string") continue;
						var entry = {
							id: modelRecord.id,
							name: typeof modelRecord.name === "string" ? modelRecord.name : modelRecord.id
						};
						var cw = modelRecord.contextWindow ?? modelRecord.context_window ?? modelRecord.maxContextWindow;
						if (typeof cw === "number" && Number.isFinite(cw) && cw > 0) entry.contextWindow = cw;
						if (modelRecord.reasoning !== null && typeof modelRecord.reasoning === "object") {
							var reasoningRecord = modelRecord.reasoning;
							var efforts = Array.isArray(reasoningRecord.efforts) ? reasoningRecord.efforts : [];
							var effortIds = [];
							for (var r = 0; r < efforts.length; r += 1) {
								var effort = efforts[r];
								var effortId = typeof effort === "string" ? effort : effort && effort.id;
								if (typeof effortId === "string" && effortId !== "") effortIds.push(effortId);
							}
							if (effortIds.length > 0) entry.reasoning = {
								efforts: effortIds,
								default: typeof reasoningRecord.defaultEffort === "string" ? reasoningRecord.defaultEffort : void 0
							};
						}
						models.push(entry);
					}
				}
				normalized.push({
					id: providerId,
					name: typeof groupRecord.name === "string" ? groupRecord.name : providerId,
					models
				});
			}
			return normalized;
		}
		/** 目录里按 provider id 找分组（预设清单这类 id 列表也复用）。 */
		function findById(list, id) {
			for (var i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
		}
		/** 目录里按 provider id + 模型 id 找模型（当前选择回显、点选提交都用它）。 */
		function findModel(groups, providerId, modelId) {
			var group = findById(groups, providerId);
			if (group === void 0) return void 0;
			for (var j = 0; j < group.models.length; j += 1) if (group.models[j].id === modelId) return group.models[j];
		}
		//#endregion
		//#region src/client/format.ts
		/** 上下文窗口的人性化显示：1048576 → 1.0M，262144 → 262K（K/M 按 1000 进）。 */
		function formatContext(value) {
			var n = typeof value === "number" ? value : Number(value);
			if (!Number.isFinite(n) || n <= 0) return void 0;
			if (n >= 1e6) {
				var m = n / 1e6;
				return (Number.isInteger(m) ? String(m) : m.toFixed(1)) + "M";
			}
			if (n >= 1e3) return Math.round(n / 1e3) + "K";
			return String(n);
		}
		/** 思考强度档位显示名：不翻译，原始档位首字母大写（low→Low、xhigh→Xhigh）。 */
		function effortLabel(effort) {
			if (typeof effort !== "string" || effort === "") return void 0;
			return effort.charAt(0).toUpperCase() + effort.slice(1);
		}
		/**
		* 模型没显式选强度时的落点：只认目录里声明的默认档（官方同款：
		* `current.reasoningEffort ?? reasoning.defaultEffort`），不拿档位表首档顶替——
		* 那等于替用户选了一个他没选过的档位。目录没声明默认档时该显示「Default」，
		* 让服务商自己决定。文案照官方：ui-model-selection 的 `effort.providerDefault`
		* 在 zh/en 字典里都是字面 "Default"。
		*/
		function defaultEffortOf(model) {
			if (model === null || typeof model !== "object") return void 0;
			var reasoning = model.reasoning;
			if (reasoning === void 0) return void 0;
			var value = reasoning.default;
			return typeof value === "string" ? value : void 0;
		}
		/**
		* 推理等级文案。会话已经定了档位就显示它，哪怕目录里没有这个模型：
		* 目录只收录 listProviders 报上来的路由，会话里存着的 provider 可能不在其中
		* （原生路由没进目录、模型下线的历史会话），这时档位表拿不到，但会话的选择是真的。
		* @param chosenEffort - 会话当前选择里的档位（selection.reasoningEffort）。
		* @param modelReasoning - 目录里这个模型的档位表；没有则 undefined。
		* @param providerDefault - 目录给的默认档位（会话没显式选时的落点）。
		* @returns 档位显示名；既没定档位又没有档位表时返回 undefined（整段不显示）。
		*/
		function reasoningTextOf(chosenEffort, modelReasoning, providerDefault) {
			var chosen = effortLabel(chosenEffort);
			if (modelReasoning === void 0 || modelReasoning === null) return chosen;
			if (chosen !== void 0) return chosen;
			var fallback = effortLabel(providerDefault);
			return fallback === void 0 ? "Default" : fallback;
		}
		/** 相对时间（上次刷新指示器）：<10s 显示刚刚，<1min 显示 <1min，之后按分钟精度 m / h+m / d。 */
		function relativeTime(iso) {
			if (typeof iso !== "string" || iso === "") return "";
			var time = new Date(iso).getTime();
			if (Number.isNaN(time)) return "";
			var seconds = Math.max(0, Math.round((Date.now() - time) / 1e3));
			if (seconds < 10) return "刚刚";
			if (seconds < 60) return "<1min";
			var minutes = Math.floor(seconds / 60);
			if (minutes < 60) return String(minutes) + "m";
			var hours = Math.floor(minutes / 60);
			var min = minutes % 60;
			if (hours < 24) return min > 0 ? String(hours) + "h" + String(min) + "m" : String(hours) + "h";
			return String(Math.floor(hours / 24)) + "d";
		}
		function toneColor(percent) {
			if (typeof percent !== "number") return "#22a06b";
			if (percent <= 10) return "#d9534f";
			if (percent <= 30) return "#d9a300";
			return "#22a06b";
		}
		/** 一个账户里最紧的窗口剩余百分比。 */
		function worstPercent(account) {
			var worst;
			var windows = Array.isArray(account.windows) ? account.windows : [];
			for (var i = 0; i < windows.length; i += 1) {
				var percent = windows[i].percentLeft;
				if (typeof percent !== "number") continue;
				if (worst === void 0 || percent < worst) worst = percent;
			}
			return worst;
		}
		function dotClass(account) {
			if (account === void 0 || account === null) return "plan_dot";
			if (account.error !== void 0) return "plan_dot plan_dot_bad";
			if (account.authConfigured === false) return "plan_dot plan_dot_warn";
			if (account.kind === "unsupported" || account.kind === "unknown-provider") return "plan_dot plan_dot_warn";
			var percent = worstPercent(account);
			if (percent === void 0) return "plan_dot plan_dot_ok";
			if (percent <= 10) return "plan_dot plan_dot_bad";
			if (percent <= 30) return "plan_dot plan_dot_warn";
			return "plan_dot plan_dot_ok";
		}
		function shortName(account) {
			return account.displayName === void 0 ? account.id : account.displayName;
		}
		/** 徽标上的短字：优先余额，其次最紧窗口的剩余百分比。 */
		function summaryOf(account) {
			if (account === void 0 || account === null) return "额度";
			if (account.authConfigured === false) return shortName(account) + " 未配置 key";
			if (account.error !== void 0) return shortName(account) + " 查询失败";
			if (account.kind === "unsupported") return shortName(account) + " 看控制台";
			if (account.kind === "unknown-provider") return shortName(account) + " 无适配器";
			var balances = Array.isArray(account.balances) ? account.balances : [];
			if (balances.length > 0) return shortName(account) + " " + balances[0].value;
			var percent = worstPercent(account);
			if (typeof percent === "number") return shortName(account) + " 余 " + String(percent) + "%";
			var windows = Array.isArray(account.windows) ? account.windows : [];
			if (windows.length > 0) return shortName(account) + " " + String(windows.length) + " 个窗口";
			return shortName(account);
		}
		/**
		* 余量短文案（模型面板的 provider chip 与模型座位触发器共用）：最紧窗口的剩余百分比，
		* 没有窗口就看钱包余额。查不了 / 没配 key 时不给数字——那种情况由指示点颜色表达。
		*/
		function quotaShortOf(account) {
			if (account === void 0 || account === null) return void 0;
			var percent = worstPercent(account);
			if (percent !== void 0) return String(percent) + "%";
			var balances = Array.isArray(account.balances) ? account.balances : [];
			return balances.length > 0 ? balances[0].value : void 0;
		}
		/** 一行里的余额短文案（给模型行/过滤 chip 复用）。 */
		function quotaTextOf(account) {
			if (account === void 0 || account === null) return void 0;
			if (account.authConfigured === false) return "未配置 key";
			if (account.error !== void 0) return "查询失败";
			if (account.kind === "unsupported") return "看控制台";
			if (account.kind === "unknown-provider") return "无适配器";
			var percent = worstPercent(account);
			if (typeof percent === "number") return "余 " + String(percent) + "%";
			var balances = Array.isArray(account.balances) ? account.balances : [];
			if (balances.length > 0) return balances[0].value;
		}
		/**
		* 窗口短名（卡片头部摘要）：5 小时窗口→5h，每周/订阅周期→7d，每月窗口→30d。
		*
		* 本地版修正（issue #2）：原来只认得出 5h 与 7d 两档，且 `每` 这个字把「每月窗口」也吞进 7d，
		* 于是 OpenCode Go 的月窗口在卡片头部显示成第二个「7d」（截图里 `5h | 7d | 7d`）。
		* 顺序上必须先判月再判周——「每月窗口」里既有「每」也有「月」。
		*/
		function shortWindowLabel(name) {
			var text = String(name ?? "");
			if (text.indexOf("5 小时") !== -1 || text.indexOf("5小时") !== -1) return "5h";
			if (text.indexOf("月") !== -1 || text.indexOf("30 天") !== -1 || text.indexOf("30天") !== -1 || text.indexOf("month") !== -1) return "30d";
			if (text.indexOf("每") !== -1 || text.indexOf("订阅") !== -1 || text.indexOf("周") !== -1 || text.indexOf("week") !== -1) return "7d";
			return text === "" ? "窗口" : text.slice(0, 4);
		}
		/** 重置倒计时压缩格式（最多两个单位，零尾不显示）：34m / 5h / 5h33m / 3d5h / 4d。 */
		function resetCountdownText(iso) {
			if (typeof iso !== "string" || iso === "") return "";
			var time = new Date(iso).getTime();
			if (Number.isNaN(time)) return "";
			var delta = time - Date.now();
			if (delta <= 0) return "即将重置";
			var minutes = Math.round(delta / 6e4);
			if (minutes < 1) return "即将重置";
			if (minutes < 60) return String(minutes) + "m";
			var hours = Math.floor(minutes / 60);
			var min = minutes % 60;
			if (hours < 24) return min > 0 ? String(hours) + "h" + String(min) + "m" : String(hours) + "h";
			var days = Math.floor(hours / 24);
			var restH = hours % 24;
			return restH > 0 ? String(days) + "d" + String(restH) + "h" : String(days) + "d";
		}
		/** provider chip 悬停详情：各窗口余量 + 重置倒计时，或余额明细。 */
		function quotaTipOf(account) {
			if (account === void 0 || account === null) return void 0;
			if (account.error !== void 0) return "查询失败：" + String(account.error);
			var parts = [];
			var windows = Array.isArray(account.windows) ? account.windows : [];
			for (var i = 0; i < windows.length; i += 1) {
				if (typeof windows[i].percentLeft !== "number") continue;
				var text = shortWindowLabel(windows[i].window) + "余量 " + String(windows[i].percentLeft) + "%";
				if (windows[i].resetAt !== void 0 && windows[i].resetAt !== "") text += " ◷ " + resetCountdownText(windows[i].resetAt);
				parts.push(text);
			}
			var balances = Array.isArray(account.balances) ? account.balances : [];
			for (var j = 0; j < balances.length; j += 1) parts.push(balances[j].label + " " + balances[j].value);
			return parts.length > 0 ? parts.join(" ｜ ") : void 0;
		}
		/**
		* 卡片头部摘要：直给最关键信息——coding plan 显示各窗口余量，API 显示余额。
		*  顺序：5 小时窗 → 每周窗 → 每月窗；**每两组之间**都有分割线（本地版修正：原来只在
		*  「5 小时组」与其余之间插一条，于是 7d 与 30d 挤在一起看不出是两档窗口）。
		*/
		function headlineChips(account) {
			if (account === void 0 || account === null) return [{
				text: "无数据",
				percent: void 0
			}];
			if (account.authConfigured === false) return [{
				text: "未配置 key",
				percent: 0
			}];
			if (account.error !== void 0) return [{
				text: "查询失败",
				percent: 0
			}];
			if (account.kind === "unsupported") return [];
			if (account.kind === "unknown-provider") return [{
				text: "无适配器",
				percent: void 0
			}];
			var windows = Array.isArray(account.windows) ? account.windows : [];
			var groups = [];
			function groupOf(key) {
				for (var g = 0; g < groups.length; g += 1) if (groups[g].key === key) return groups[g];
				var created = {
					key,
					chips: []
				};
				groups.push(created);
				return created;
			}
			for (var i = 0; i < windows.length; i += 1) {
				if (typeof windows[i].percentLeft !== "number") continue;
				groupOf(shortWindowLabel(windows[i].window)).chips.push({
					label: shortWindowLabel(windows[i].window),
					text: String(windows[i].percentLeft) + "%",
					percent: windows[i].percentLeft,
					reset: windows[i].resetAt
				});
			}
			var KNOWN_GROUPS = [
				"5h",
				"7d",
				"30d"
			];
			var ordered = [];
			for (var k = 0; k < KNOWN_GROUPS.length; k += 1) for (var g2 = 0; g2 < groups.length; g2 += 1) if (groups[g2].key === KNOWN_GROUPS[k]) ordered.push(groups[g2]);
			for (var g3 = 0; g3 < groups.length; g3 += 1) if (KNOWN_GROUPS.indexOf(groups[g3].key) === -1) ordered.push(groups[g3]);
			var chips = [];
			for (var o = 0; o < ordered.length; o += 1) {
				if (o > 0) chips.push({ sep: true });
				for (var c = 0; c < ordered[o].chips.length; c += 1) chips.push(ordered[o].chips[c]);
			}
			if (chips.length > 0) return chips;
			var balances = Array.isArray(account.balances) ? account.balances : [];
			if (balances.length > 0) chips.push({
				text: String(balances[0].value),
				percent: void 0
			});
			if (chips.length > 0) return chips;
			return [{
				text: summaryOf(account),
				percent: void 0
			}];
		}
		/** 链接显示文本：去掉协议和末尾斜杠。 */
		function linkTextOf(url) {
			return String(url).replace(/^https?:\/\//, "").replace(/\/$/, "");
		}
		/** 模型过滤的模糊匹配：子串 → 缩写子序列（ds→deepseek）→ 编辑距离容错（deapseek→deepseek）。 */
		function fuzzyMatch(query, text) {
			var q = String(query).toLowerCase().trim();
			if (q === "") return true;
			var words = q.split(/\s+/);
			for (var w = 0; w < words.length; w += 1) if (!fuzzyWord(words[w], String(text).toLowerCase())) return false;
			return true;
		}
		function fuzzyWord(word, haystack) {
			if (word === "") return true;
			if (haystack.indexOf(word) !== -1) return true;
			if (word.length <= 5 && isSubsequence(word, haystack)) return true;
			var tokens = haystack.split(/[\s\-_/:]+/);
			for (var i = 0; i < tokens.length; i += 1) {
				if (tokens[i] === "") continue;
				var distance = word.length >= 3 ? damerauLevenshtein(word, tokens[i]) : 99;
				if (distance <= 1) return true;
				if (word.length >= 6 && distance <= 2) return true;
			}
			var joined = tokens.join("");
			var joinedDistance = word.length >= 3 ? damerauLevenshtein(word, joined) : 99;
			if (joinedDistance <= 1) return true;
			if (word.length >= 6 && joinedDistance <= 2) return true;
			return false;
		}
		function isSubsequence(needle, haystack) {
			var i = 0;
			for (var j = 0; j < haystack.length && i < needle.length; j += 1) if (haystack.charAt(j) === needle.charAt(i)) i += 1;
			return i === needle.length;
		}
		/** Damerau-Levenshtein 编辑距离（含相邻交换），O(n·m)——词都很短，无所谓。 */
		function damerauLevenshtein(a, b) {
			var la = a.length;
			var lb = b.length;
			if (Math.abs(la - lb) > 2) return 99;
			var d = [];
			for (var i = 0; i <= la; i += 1) {
				d.push(new Array(lb + 1).fill(0));
				d[i][0] = i;
			}
			for (var j = 0; j <= lb; j += 1) d[0][j] = j;
			for (var i = 1; i <= la; i += 1) for (var j = 1; j <= lb; j += 1) {
				var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
				var best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
				if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) best = Math.min(best, d[i - 2][j - 2] + 1);
				d[i][j] = best;
			}
			return d[la][lb];
		}
		//#endregion
		//#region src/client/command.ts
		/**
		* /model 命令：按 provider 过滤 / 搜索模型 / 显示余额。
		* commandUi 对同名是「重复即抛」，没有 priority 遮蔽——官方 ui-model-selection 行还在时
		* 注册会抛，调用方静默让位；官方行被禁用后这里接管。
		*/
		function registerModelCommand(scope) {
			var commandUi = scope.commandUi;
			if (commandUi === void 0 || typeof commandUi.register !== "function") return;
			scope.effect(function() {
				try {
					return commandUi.register({
						name: "model",
						label: function() {
							return "切换模型";
						},
						description: function() {
							return "按 provider 过滤 / 搜索模型 / 显示余额";
						},
						/**
						* 官方契约**必填**：`CommandUiRuntime.candidates()` 对注册表里每一条贡献都直接调
						* `contribution.available(session)`——漏了就是 `TypeError: contribution.available is not a
						* function`，整批 `/` 候选（含 composer 的「＋」按钮）一起挂掉，不是只挂这一条
						* （上游 issue #7，作者本人实测）。
						*
						* 语义照官方 ui-model-selection：子代理会话里不提供切换。**必须永远返回 boolean、永不抛**：
						* 契约里没有防御，这里抛一次就是整批候选消失，所以连 sessions 服务缺字段都吞掉。
						*/
						available: function(session) {
							try {
								var sessions = scope.sessions;
								var subagentAddress = sessions === void 0 || sessions === null ? void 0 : sessions.subagentAddress;
								var sessionId = session === null || session === void 0 ? void 0 : session.sessionId;
								if (typeof subagentAddress !== "function" || typeof sessionId !== "string") return true;
								return subagentAddress(sessionId) === void 0;
							} catch (cause) {
								return true;
							}
						},
						ui: {
							kind: "popupSelect",
							options: function() {
								return Promise.all([loadModelCatalog(), loadPlanStatus(false)]).then(function(both) {
									var groups = both[0].groups;
									var accounts = accountsById(both[1]);
									var rows = [];
									for (var i = 0; i < groups.length; i += 1) {
										var group = groups[i];
										var quota = quotaTextOf(accounts[group.id]);
										for (var j = 0; j < group.models.length; j += 1) rows.push({
											id: group.id + "/" + group.models[j].id,
											label: group.models[j].id,
											detail: group.id + (quota === void 0 ? "" : " · " + quota)
										});
									}
									return rows;
								});
							},
							onSelect: function(option, session) {
								var parts = String(option.id).split("/");
								var provider = parts.shift();
								var model = parts.join("/");
								if (provider === void 0 || provider === "" || model === "") throw new Error("无法解析这个模型行");
								var sessionId = session !== null && session !== void 0 ? session.sessionId : void 0;
								if (typeof sessionId !== "string") throw new Error("当前没有会话，无法切换模型");
								return submitSelection(sessionId, provider, model, void 0);
							}
						}
					});
				} catch (cause) {
					return function() {};
				}
			}, "dsh-llm-provider: /model contribution");
		}
		//#endregion
		//#region src/client/diag.ts
		function recordDiagnostic(key, value) {
			try {
				var holder = window;
				var bucket = holder.__dshLlmProvider;
				if (bucket === void 0) bucket = holder.__dshLlmProvider = {};
				bucket[key] = value;
			} catch (cause) {}
		}
		//#endregion
		//#region src/client/i18n.ts
		/**
		* i18n：本地字典兜底 + 可变翻译函数。
		*
		* `t` 是可变导出（live binding）：apply 里经 {@link setT} 换成官方 locale 的 bind
		* 结果，其余模块 `import { t }` 读到的一直是当前那份。
		*/
		/** i18n 本地字典：注册失败/服务缺席时的兜底（也用于缺键回退）。语言从 <html lang> 判断。 */
		var LOCAL_DICT = {
			zh: {
				nav: "模型服务",
				tabProviders: "服务商",
				addProvider: "＋ 添加供应商"
			},
			en: {
				nav: "Provider",
				tabProviders: "Provider",
				addProvider: "＋ Add Provider"
			}
		};
		function localT(key) {
			var lang = "en";
			try {
				if (String(document.documentElement.lang || "").toLowerCase().indexOf("zh") === 0) lang = "zh";
			} catch (cause) {}
			var dict = LOCAL_DICT[lang] !== void 0 ? LOCAL_DICT[lang] : LOCAL_DICT.en;
			return dict[key] !== void 0 ? dict[key] : LOCAL_DICT.en[key] !== void 0 ? LOCAL_DICT.en[key] : key;
		}
		/** i18n translate：优先官方 locale（注册+bind）；任何一步失败都回退本地字典。工厂级，组件/label 闭包共享。 */
		var t = localT;
		/** 换掉翻译实现（apply 里用官方 locale bind 的结果替换）。 */
		function setT(next) {
			t = next;
		}
		//#endregion
		//#region src/client/icons.ts
		/**
		* 官方图标库的 SVG 拷贝（对勾 / 右指 / 下指 Chevron）。
		* 不引官方图标包，逐字节拷需要的几个。
		*/
		/** 官方同款对勾（IconCheckOutline16 的 SVG 拷贝）。 */
		function checkSvg() {
			return react.default.createElement("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 16 16",
				fill: "none",
				style: { display: "block" }
			}, react.default.createElement("path", {
				fill: "currentColor",
				d: "M15.0498 3.92579L8.49512 12.3818C8.25774 12.6881 8.04517 12.9645 7.84668 13.1689C7.63957 13.3823 7.38732 13.5841 7.04492 13.6719C6.86373 13.7183 6.6757 13.7346 6.48926 13.7197C6.13666 13.6915 5.8528 13.5355 5.6123 13.3604C5.38201 13.1926 5.12573 12.9567 4.83984 12.6953L1.03125 9.21289L1.96875 8.1875L5.77734 11.6699C6.08684 11.9529 6.27773 12.1249 6.43066 12.2363C6.50183 12.2882 6.54699 12.3135 6.57324 12.3252C6.58525 12.3305 6.59269 12.3322 6.5957 12.333C6.59802 12.3336 6.59961 12.334 6.59961 12.334C6.63317 12.3367 6.66758 12.3335 6.7002 12.3252C6.7002 12.3252 6.70211 12.3251 6.7041 12.3242C6.70698 12.3229 6.71348 12.319 6.72461 12.3115C6.74849 12.2956 6.78843 12.2642 6.84961 12.2012C6.98138 12.0654 7.13957 11.8628 7.39648 11.5313L13.9502 3.07422L15.0498 3.92579Z"
			}));
		}
		/** 官方同款右指 Chevron（IconChevronRightOutline14 的 SVG 拷贝）。 */
		function chevronRightSvg() {
			return react.default.createElement("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 14 14",
				fill: "none",
				style: { display: "block" }
			}, react.default.createElement("path", {
				fill: "currentColor",
				d: "M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24848 6.59876 8.07732 6.42595 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z"
			}));
		}
		/** 官方同款 Chevron（IconChevronDownOutline14 的 SVG 逐字节拷贝），open 时旋转 180°。 */
		function caretSvg(open) {
			return react.default.createElement("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 14 14",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				className: "pv_pcCaret" + (open ? " pv_pcCaretOpen" : ""),
				style: { display: "block" }
			}, react.default.createElement("path", {
				fill: "currentColor",
				d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.077326.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
			}));
		}
		//#endregion
		//#region src/client/model-seat.ts
		/**
		* composer 的模型座位（仿官方 ModelSelect 两级层级）：
		*   触发器胶囊（模型名 + 思考强度 + Chevron）→ 根菜单两行（模型 / 推理等级，值右对齐 + ›）
		*   → 模型面板（我们的增强：搜索 + provider 过滤 + 能力徽章，样式走官方 token）
		*   → 推理等级面板（Default + 档位，选中打勾）。
		*/
		/**
		* 老的 provider id → 现在的路由 id。官方 llm-deepseek 时代的会话里记的是 `deepseek-official`，
		* 那条路由由本插件接管的 pi-ai `deepseek` 顶上（两边服务的是同一批模型）。
		*/
		var LEGACY_PROVIDER_ALIASES = { "deepseek-official": "deepseek" };
		/**
		* 把选择里已经不存在的老 provider id 折到现存路由上。
		*
		* 只在「目标 provider 和同一个 model id 都在目录里」时才折——对不上就原样返回，宁可显示
		* 那个死 id，也不能把会话悄悄指到别的模型上。档位只在新模型支持时才带过去（两套适配器的
		* 档位表不一定一致）。
		*
		* @param selection - 会话/目录给出的当前选择。
		* @param groups - 模型目录。
		* @returns 折过之后的选择；不需要折时原样返回。
		*/
		function aliasSelection(selection, groups) {
			if (selection === void 0 || selection === null) return selection;
			var mapped = LEGACY_PROVIDER_ALIASES[selection.provider];
			if (mapped === void 0 || groups === void 0) return selection;
			var target = findModel(groups, mapped, selection.model);
			if (target === void 0) return selection;
			var effort = selection.reasoningEffort;
			var efforts = target.reasoning === void 0 ? void 0 : target.reasoning.efforts;
			return typeof effort === "string" && (efforts === void 0 || efforts.indexOf(effort) !== -1) ? {
				provider: mapped,
				model: selection.model,
				reasoningEffort: effort
			} : {
				provider: mapped,
				model: selection.model
			};
		}
		function ModelSwitchSeat(props) {
			var sessionId = props.sessionId;
			var sessions = props.sessions;
			var openState = react.default.useState(false);
			var open = openState[0];
			var setOpen = openState[1];
			var paneState = react.default.useState("root");
			var pane = paneState[0];
			var setPane = paneState[1];
			var queryState = react.default.useState("");
			var query = queryState[0];
			var setQuery = queryState[1];
			var filterState = react.default.useState(null);
			var providerFilter = filterState[0];
			var setProviderFilter = filterState[1];
			var groupsState = react.default.useState([]);
			var httpGroups = groupsState[0];
			var setGroups = groupsState[1];
			var httpDefaultState = react.default.useState(void 0);
			var httpDefault = httpDefaultState[0];
			var setHttpDefault = httpDefaultState[1];
			var errorState = react.default.useState(null);
			var error = errorState[0];
			var setError = errorState[1];
			var busyState = react.default.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var accountsState = react.default.useState({});
			var accounts = accountsState[0];
			var setAccounts = accountsState[1];
			var detailsState = react.default.useState({});
			var detailsById = detailsState[0];
			var setDetailsById = detailsState[1];
			var rootRef = react.default.useRef(null);
			var searchRef = react.default.useRef(null);
			var directorySnapshot = usePolledSnapshot(props.directory, 2e3);
			recordDiagnostic("seat", {
				hasInjectFace: props.directory !== void 0,
				status: directorySnapshot === void 0 ? null : directorySnapshot.status,
				current: directorySnapshot === void 0 ? null : directorySnapshot.current,
				groupCount: directorySnapshot === void 0 || !Array.isArray(directorySnapshot.groups) ? null : directorySnapshot.groups.length,
				error: directorySnapshot === void 0 ? null : directorySnapshot.error
			});
			var directoryGroups = directorySnapshot !== void 0 && Array.isArray(directorySnapshot.groups) ? normalizeGroups(directorySnapshot.groups) : void 0;
			var groups = directoryGroups !== void 0 && directoryGroups.length > 0 ? directoryGroups : httpGroups;
			var directoryCurrent = directorySnapshot !== void 0 ? directorySnapshot.current : void 0;
			var directoryError = directorySnapshot !== void 0 ? directorySnapshot.error : void 0;
			var selectionCellRef = react.default.useMemo(function() {
				return selectionCell(sessions, sessionId);
			}, [sessions, sessionId]);
			var selectionState = react.default.useState(void 0);
			var projectionSelection = selectionState[0];
			var setSelection = selectionState[1];
			var lastSelState = react.default.useState(null);
			var lastSel = lastSelState[0];
			var setLastSel = lastSelState[1];
			var rawSelection = directoryCurrent !== void 0 && directoryCurrent !== null ? directoryCurrent : lastSel ?? projectionSelection ?? httpDefault;
			var selection = aliasSelection(rawSelection, groups);
			var migratedRef = react.default.useRef("");
			react.default.useEffect(function() {
				if (rawSelection === void 0 || rawSelection === null) return;
				if (selection === void 0 || selection === null) return;
				if (rawSelection.provider === selection.provider && rawSelection.model === selection.model) return;
				var key = rawSelection.provider + "|" + rawSelection.model + ">" + selection.provider + "|" + selection.model;
				if (migratedRef.current === key) return;
				migratedRef.current = key;
				var request = selection.reasoningEffort === void 0 ? {
					provider: selection.provider,
					model: selection.model
				} : {
					provider: selection.provider,
					model: selection.model,
					reasoningEffort: selection.reasoningEffort
				};
				(typeof props.select === "function" ? props.select(request) : submitSelection(sessionId, request.provider, request.model, request.reasoningEffort)).then(function(ok) {
					if (ok !== false) setLastSel(request);
				}).catch(function() {
					migratedRef.current = "";
				});
			}, [rawSelection === void 0 || rawSelection === null ? "" : rawSelection.provider + "/" + rawSelection.model, selection === void 0 || selection === null ? "" : selection.provider + "/" + selection.model]);
			react.default.useEffect(function() {
				function read() {
					var next;
					try {
						next = unwrap(selectionCellRef.getSnapshot());
					} catch (cause) {
						next = void 0;
					}
					setSelection(next);
					setLastSel(function(prev) {
						if (prev === null || prev === void 0 || next === void 0) return prev;
						return prev.provider === next.provider && prev.model === next.model ? null : prev;
					});
				}
				read();
				var timer = setInterval(read, 5e3);
				return function() {
					clearInterval(timer);
				};
			}, [selectionCellRef]);
			react.default.useEffect(function() {
				return onPlanChange(function(payload) {
					setAccounts(accountsById(payload));
				});
			}, []);
			/**
			* 拉一次目录。官方目录服务缺席（补位形态，profile 禁用了官方 ui-model-selection）时，
			* 这是我们唯一的数据源，宿主那边是每次 RPC 实时构建的（`listProviders()` 按已配置路由报）。
			* @param alive - 可选；返回 false 表示组件已卸载，丢弃结果。
			*/
			function pullCatalog(alive) {
				loadModelCatalog().then(function(next) {
					if (alive !== void 0 && !alive()) return;
					setGroups(next.groups);
					setHttpDefault(next.default);
				}).catch(function(cause) {
					if (alive !== void 0 && !alive()) return;
					setError(cause && cause.message ? String(cause.message) : String(cause));
				});
			}
			react.default.useEffect(function() {
				var cancelled = false;
				if (typeof props.load === "function") props.load();
				else pullCatalog(function() {
					return !cancelled;
				});
				loadModelDetailMap().then(function(map) {
					if (!cancelled) setDetailsById(map);
				}).catch(function() {});
				return function() {
					cancelled = true;
				};
			}, [props.load]);
			react.default.useEffect(function() {
				var cancelled = false;
				function pull() {
					loadPlanStatus(false).then(function(payload) {
						if (!cancelled) setAccounts(accountsById(payload));
					}).catch(function() {});
				}
				pull();
				var timer = setInterval(pull, 6e4);
				return function() {
					cancelled = true;
					clearInterval(timer);
				};
			}, []);
			react.default.useEffect(function() {
				if (!open) return void 0;
				if (typeof props.load === "function") props.load();
				else pullCatalog();
				if (pane === "model" && searchRef.current !== null && searchRef.current !== void 0) try {
					searchRef.current.focus();
				} catch (cause) {}
				function onPointerDown(event) {
					if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false);
				}
				function onKeyDown(event) {
					if (event.key === "Escape") {
						if (pane !== "root") setPane("root");
						else setOpen(false);
					}
				}
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				loadPlanStatus(false).then(function(payload) {
					setAccounts(accountsById(payload));
				}).catch(function() {});
				return function() {
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [
				open,
				pane,
				props.load
			]);
			function show() {
				setPane("root");
				setProviderFilter(null);
				setQuery("");
				setOpen(true);
			}
			/** 当前选择对应的 model 与思考强度信息。 */
			var currentModel = void 0;
			if (selection !== void 0 && selection !== null) currentModel = findModel(groups, selection.provider, selection.model);
			var reasoning = currentModel !== void 0 ? currentModel.reasoning : void 0;
			var chosenEffort = selection !== void 0 && selection !== null && typeof selection.reasoningEffort === "string" ? selection.reasoningEffort : void 0;
			var effectiveEffort = chosenEffort !== void 0 ? chosenEffort : reasoning !== void 0 ? defaultEffortOf(currentModel) : void 0;
			var effortText = reasoningTextOf(chosenEffort, reasoning, defaultEffortOf(currentModel));
			function submit(selectionRequest) {
				if (busy) return Promise.resolve(false);
				setBusy(true);
				return (typeof props.select === "function" ? props.select(selectionRequest) : submitSelection(sessionId, selectionRequest.provider, selectionRequest.model, selectionRequest.reasoningEffort)).then(function(ok) {
					if (ok === false) throw new Error("宿主拒绝了这次切换");
					setError(null);
					setLastSel(selectionRequest);
					setOpen(false);
					setPane("root");
					return true;
				}).catch(function(cause) {
					setError(cause && cause.message ? String(cause.message) : String(cause));
					return false;
				}).then(function(ok) {
					setBusy(false);
					return ok;
				});
			}
			function chooseModel(groupId, modelId) {
				if (selection !== void 0 && selection !== null && selection.provider === groupId && selection.model === modelId) {
					setOpen(false);
					setPane("root");
					return;
				}
				submit({
					provider: groupId,
					model: modelId
				});
			}
			function chooseEffort(effort) {
				if (selection === void 0 || selection === null) return;
				if (effort === effectiveEffort) {
					setOpen(false);
					return;
				}
				var req = {
					provider: selection.provider,
					model: selection.model
				};
				if (effort !== void 0) req.reasoningEffort = effort;
				submit(req);
			}
			var modelLabel = (selection === void 0 || selection === null) && directorySnapshot !== void 0 && directorySnapshot.status === "loading" ? "加载中…" : selection === void 0 || selection === null ? "选择模型" : String(selection.provider) + "/" + String(selection.model);
			var triggerText = effortText === void 0 ? modelLabel : modelLabel + " · " + effortText;
			var currentAccount = selection === void 0 || selection === null ? void 0 : accounts[selection.provider];
			var currentQuotaText = quotaShortOf(currentAccount);
			var triggerQuota = currentAccount === void 0 ? null : react.default.createElement("span", {
				className: "ms_tQuota",
				title: quotaTipOf(currentAccount),
				key: "q"
			}, react.default.createElement("span", { className: dotClass(currentAccount) }), currentQuotaText === void 0 ? null : react.default.createElement("span", {
				className: "ms_tQuotaText",
				style: { color: toneColor(worstPercent(currentAccount)) }
			}, currentQuotaText));
			var triggerLabel = selection === void 0 || selection === null ? [react.default.createElement("span", {
				className: "ms_tLabel",
				key: "all"
			}, modelLabel)] : [
				react.default.createElement("span", {
					className: "ms_tProvider",
					key: "p"
				}, String(selection.provider)),
				triggerQuota,
				react.default.createElement("span", {
					className: "ms_tSlash",
					key: "s"
				}, "/ "),
				react.default.createElement("span", {
					className: "ms_tModel",
					key: "m"
				}, String(selection.model))
			];
			var trigger = react.default.createElement("button", {
				type: "button",
				className: "ms_trigger",
				"aria-expanded": open ? "true" : "false",
				title: triggerText,
				onClick: function() {
					if (open) setOpen(false);
					else show();
				}
			}, triggerLabel, effortText === void 0 ? null : react.default.createElement("span", { className: "ms_tEffort" }, effortText), react.default.createElement("span", { className: "ms_chev" + (open ? " ms_chevOpen" : "") }, caretSvg(open)));
			if (!open) return react.default.createElement("div", {
				className: "plan_root",
				ref: rootRef
			}, trigger);
			var rootPane = react.default.createElement("button", {
				type: "button",
				className: "ms_cell",
				onClick: function() {
					setPane("model");
				}
			}, react.default.createElement("span", { className: "ms_cellLabel" }, "模型"), react.default.createElement("span", { className: "ms_cellValue" }, modelLabel), react.default.createElement("span", { className: "ms_cellChev" }, chevronRightSvg()));
			var canPickEffort = reasoning !== void 0 && effortText !== void 0;
			var effortCell = react.default.createElement("button", {
				type: "button",
				className: "ms_cell",
				disabled: !canPickEffort,
				style: canPickEffort ? void 0 : {
					cursor: "default",
					opacity: .55
				},
				title: reasoning === void 0 && effortText !== void 0 ? "当前模型不在模型目录里，只能显示会话已定的档位" : void 0,
				onClick: canPickEffort ? function() {
					setPane("effort");
				} : void 0
			}, react.default.createElement("span", { className: "ms_cellLabel" }, "推理等级"), react.default.createElement("span", { className: "ms_cellValue" }, effortText === void 0 ? "选择模型后可用" : effortText), react.default.createElement("span", { className: "ms_cellChev" }, chevronRightSvg()));
			var needle = query.trim().toLowerCase();
			var modelPane = null;
			if (pane === "model") {
				var chips = [react.default.createElement("button", {
					key: "__all",
					type: "button",
					className: "mp_chip",
					"data-on": providerFilter === null ? "1" : "0",
					onClick: function() {
						setProviderFilter(null);
					}
				}, "全部 " + String(groups.length))];
				for (var ck = 0; ck < groups.length; ck += 1) (function(g) {
					var acc = accounts[g.id];
					var quotaText = quotaShortOf(acc);
					chips.push(react.default.createElement("button", {
						key: g.id,
						type: "button",
						className: "mp_chip",
						"data-on": providerFilter === g.id ? "1" : "0",
						title: quotaTipOf(acc) ?? g.id,
						onClick: function() {
							setProviderFilter(providerFilter === g.id ? null : g.id);
						}
					}, react.default.createElement("span", { className: dotClass(acc) }), g.id, quotaText === void 0 ? null : react.default.createElement("span", { style: { color: toneColor(worstPercent(acc)) } }, " " + quotaText)));
				})(groups[ck]);
				var groupSections = [];
				for (var gs = 0; gs < groups.length; gs += 1) (function(g) {
					if (providerFilter !== null && g.id !== providerFilter) return;
					var sectionRows = [];
					for (var gm = 0; gm < g.models.length; gm += 1) (function(model) {
						if (needle !== "" && fuzzyMatch(query, model.id + " " + model.name + " " + g.name + " " + g.id) !== true) return;
						var isCurrent = selection !== void 0 && selection !== null && selection.provider === g.id && selection.model === model.id;
						var detail = lookupDetail(detailsById, g.id, model.id);
						var caps = [];
						if (detail !== void 0) {
							if (detail.vision === true) caps.push(react.default.createElement("span", {
								key: "v",
								className: "pv_capMini pv_capVision"
							}, "视觉"));
							if (detail.reasoning === true) caps.push(react.default.createElement("span", {
								key: "r",
								className: "pv_capMini pv_capReason"
							}, "推理"));
						}
						var ctx = formatContext(detail !== void 0 && detail.contextWindow !== void 0 ? detail.contextWindow : model.contextWindow);
						sectionRows.push(react.default.createElement("button", {
							key: g.id + "/" + model.id,
							type: "button",
							className: "ms_option",
							disabled: busy || isCurrent,
							title: g.id + "/" + model.id,
							onClick: function() {
								chooseModel(g.id, model.id);
							}
						}, react.default.createElement("span", { className: "ms_name" }, model.id), react.default.createElement("span", { className: "ms_capsCol" }, caps), react.default.createElement("span", { className: "ms_ctxCol" }, ctx === void 0 ? "" : ctx), react.default.createElement("span", { className: "ms_check" }, isCurrent ? checkSvg() : null)));
					})(g.models[gm]);
					if (sectionRows.length === 0) return;
					groupSections.push(react.default.createElement("div", {
						className: "ms_group",
						key: g.id
					}, react.default.createElement("div", { className: "ms_groupTitle" }, g.id), sectionRows));
				})(groups[gs]);
				modelPane = react.default.createElement("div", { style: {
					display: "flex",
					flexDirection: "column",
					minHeight: 0
				} }, react.default.createElement("input", {
					ref: searchRef,
					className: "mp_search",
					type: "text",
					placeholder: "搜索模型或 provider",
					value: query,
					onChange: function(event) {
						setQuery(event.target.value);
					}
				}), groups.length > 1 ? react.default.createElement("div", { className: "mp_chips" }, chips) : null, directoryError !== void 0 && directoryError !== null && typeof directoryError === "string" ? react.default.createElement("div", { className: "ms_status" }, String(directoryError)) : null, react.default.createElement("div", { className: "ms_scroll" }, groupSections, groupSections.length === 0 ? react.default.createElement("div", { className: "ms_status" }, needle === "" ? "没有可选模型" : "没有匹配「" + query + "」的模型") : null));
			}
			var effortPane = null;
			if (pane === "effort" && reasoning !== void 0) {
				var choices = [];
				if (defaultEffortOf(currentModel) === void 0) choices.push({
					effort: void 0,
					label: "Default"
				});
				var effList = reasoning.efforts;
				for (var ec = 0; ec < effList.length; ec += 1) choices.push({
					effort: effList[ec],
					label: effortLabel(effList[ec]) ?? effList[ec]
				});
				var effortRows = choices.map(function(level) {
					var isCur = effectiveEffort === level.effort;
					return react.default.createElement("button", {
						key: level.label,
						type: "button",
						className: "ms_option",
						disabled: busy || isCur,
						onClick: function() {
							chooseEffort(level.effort);
						}
					}, react.default.createElement("span", { className: "ms_name" }, level.label), react.default.createElement("span", { className: "ms_check" }, isCur ? checkSvg() : null));
				});
				effortPane = react.default.createElement("div", { className: "ms_scroll" }, effortRows);
			}
			var menuBody = pane === "model" ? modelPane : pane === "effort" ? effortPane : react.default.createElement("div", { style: {
				display: "flex",
				flexDirection: "column"
			} }, rootPane, effortCell);
			var menu = react.default.createElement("div", { className: "ms_menu" }, menuBody, error === null ? null : react.default.createElement("div", { className: "plan_note plan_badText" }, error));
			return react.default.createElement("div", {
				className: "plan_root",
				ref: rootRef
			}, trigger, menu);
		}
		//#endregion
		//#region src/client/settings.ts
		/**
		* 设置页 Provider 标签：CC Switch 式卡片 + 「添加供应商」面板 + 「pi-ai 桥接」二级标签。
		* 桥接明细行是纯函数（piAiBridgeRows），组件照着渲染——离线可测。
		*/
		/** 当前用的是哪一档 pi-ai。宿主报的 source：版本号 / 'dependency' / 'dsh'。 */
		function piAiSourceLabel(source) {
			if (source === "dependency") return "兜底依赖";
			if (source === "dsh") return "dsh 自带";
			return "已下载";
		}
		function piAiSourceHint(source) {
			if (source === "dependency") return "插件 vendor/ 下手动安装的兜底版本（可选档；没装就会落到 dsh 自带那份）";
			if (source === "dsh") return "dsh 自己装的那份 pi-ai，版本随 dsh 发布走（不一定比上游旧）";
			return "按需下载并验证过的版本，放在 vendor/pi-ai/<版本>/；换版本需重启 dsh";
		}
		/**
		* 「pi-ai 桥接」标签页的明细行。纯函数，只返回数据，组件照着渲染——这样能离线测，
		* 也免得一堆拼字符串的逻辑埋在组件里。
		* @param bridge - /provider/status 的 bridge 段（当前加载的那份）。
		* @param update - 同上的 update 段（上游最新 / 待生效 / 体检没过的）。
		* @returns `[{ key, text, value?, title?, warn? }]`；value 是右侧的次要文字。
		*/
		function piAiBridgeRows(bridge, update, updatesEnabled) {
			var rows = [];
			if (bridge === void 0 || bridge === null) return rows;
			var bridgeRecord = bridge;
			if (bridgeRecord.active !== true) {
				rows.push({
					key: "err",
					text: String(bridgeRecord.error),
					bad: true
				});
				return rows;
			}
			rows.push({
				key: "pi",
				text: "当前 pi-ai 版本",
				value: String(bridgeRecord.piAiVersion) + "（" + piAiSourceLabel(bridgeRecord.source) + "）",
				title: piAiSourceHint(bridgeRecord.source)
			});
			if (updatesEnabled === false) rows.push({
				key: "local",
				text: "本地版：pi-ai 自动下载已停用",
				value: "vendor/ 不落地 pi-ai",
				title: "本机不再下载 @earendil-works/pi-ai：桥接直接用 dsh 自带那份（vendor/ 里只有官方适配器 bundle 的副本，约 113 KB）。要跟上游就用 DSH_PROVIDER_UPDATE=on 启动 dsh"
			});
			if (bridgeRecord.probeUnverified === true) rows.push({
				key: "unverified",
				text: "当前这份 pi-ai 没做过兼容性体检",
				value: "看原因",
				title: "解析不出桥接副本的 import 需求（上游改了打包格式），按目录存在放行。建议关注 pi-ai 发版说明",
				warn: true
			});
			var rejected = Array.isArray(bridgeRecord.rejected) ? bridgeRecord.rejected : [];
			for (var i = 0; i < rejected.length; i += 1) {
				var skipped = rejected[i];
				rows.push({
					key: "skip-" + i,
					text: "跳过 " + String(skipped.version) + "：兼容性检查没通过",
					value: "看原因",
					title: String(skipped.error),
					warn: true
				});
			}
			if (update !== void 0 && update !== null) {
				var updateRecord = update;
				if (updateRecord.pending !== void 0) rows.push({
					key: "pending",
					text: "已下载 " + String(updateRecord.pending) + "，验证通过（完整性 + 兼容性），重启 dsh 后生效",
					warn: true
				});
				if (updateRecord.rejected !== void 0 && updateRecord.rejected !== null) {
					var rejectedLatest = updateRecord.rejected;
					rows.push({
						key: "rejected",
						text: String(rejectedLatest.version) + " 验证没通过，已跳过（不会切过去）",
						value: "看原因",
						title: String(rejectedLatest.error),
						warn: true
					});
				}
			}
			return rows;
		}
		/** 上游那一行的文字（右侧按钮由组件补）。updatesEnabled === false 时说明自动下载已停用。 */
		function piAiUpstreamText(update, updatesEnabled) {
			if (updatesEnabled === false) return "上游 自动检查已停用（本地版）";
			if (update === void 0 || update === null) return "上游 未检查";
			var updateRecord = update;
			if (updateRecord.latest === void 0) return "上游 未检查";
			var when = updateRecord.lastCheck === void 0 ? "" : "（检查于 " + relativeTime(updateRecord.lastCheck) + "）";
			return "上游 " + String(updateRecord.latest) + when;
		}
		/** 单个摘要 chip：「5h余量:90% 34min后重置」；余额类无标签只显示金额；sep 为组间分割线。 */
		function headlineChip(chip, key) {
			if (chip.sep === true) return react.default.createElement("span", {
				key: "sep" + String(key),
				className: "pv_chipSep"
			});
			if (chip.label === void 0 || chip.label === null) return react.default.createElement("span", {
				key: String(key),
				className: "pv_chipItem"
			}, react.default.createElement("span", {
				key: "t",
				style: { color: toneColor(chip.percent) }
			}, chip.text));
			var parts = [react.default.createElement("span", {
				key: "l",
				className: "pv_chipLabel"
			}, chip.label + ":"), react.default.createElement("span", {
				key: "t",
				style: { color: toneColor(chip.percent) }
			}, chip.text)];
			if (chip.reset !== void 0 && chip.reset !== "") parts.push(react.default.createElement("span", {
				key: "r",
				className: "pv_chipReset"
			}, " ◷ " + resetCountdownText(chip.reset)));
			return react.default.createElement("span", {
				key: String(key),
				className: "pv_chipItem"
			}, parts);
		}
		/** 模型行：名称 + 能力徽章（视觉/推理/视频）+ 上下文标签，悬浮出 Cherry 式详情卡。 */
		function modelRow(model, account, detailsById) {
			var detail = lookupDetail(detailsById, account.id, model.id);
			var ctx = formatContext(detail !== void 0 && detail.contextWindow !== void 0 ? detail.contextWindow : model.contextWindow);
			var caps = [];
			if (detail !== void 0) {
				if (detail.vision === true) caps.push(react.default.createElement("span", {
					key: "v",
					className: "pv_capMini pv_capVision"
				}, "视觉"));
				if (detail.reasoning === true) caps.push(react.default.createElement("span", {
					key: "r",
					className: "pv_capMini pv_capReason"
				}, "推理"));
				if (detail.video === true) caps.push(react.default.createElement("span", {
					key: "t",
					className: "pv_capMini pv_capVideo"
				}, "视频"));
				if (detail.source === "declared") caps.push(react.default.createElement("span", {
					key: "d",
					className: "pv_capMini pv_capDeclared",
					title: "pi-ai 目录里没有这个模型，能力按你在路由里声明的 input 显示"
				}, "声明"));
			}
			return react.default.createElement("div", {
				className: "pv_mRow",
				key: "m-" + model.id
			}, react.default.createElement("span", {
				className: "pv_mId",
				title: model.id
			}, model.id), react.default.createElement("span", {
				className: "pv_mName",
				title: model.name
			}, model.name), react.default.createElement("span", { className: "pv_mCaps" }, caps), react.default.createElement("span", { className: "pv_mCtx" }, ctx === void 0 ? "" : ctx), modelTip(model, account, detail));
		}
		/** Cherry 式模型详情卡：服务商 / 模型 ID / 能力标记 / 上下文 / 最大输出 / 思维链。 */
		function modelTip(model, account, detail) {
			var rows = [react.default.createElement("div", {
				className: "pv_tipTitle",
				key: "t"
			}, model.name)];
			rows.push(tipLine("服务商", shortName(account), "p"));
			rows.push(tipLine("模型 ID", model.id, "id"));
			if (detail !== void 0) {
				var caps = [];
				if (detail.vision === true) caps.push(tipCap("视觉", "pv_capVision"));
				if (detail.video === true) caps.push(tipCap("视频", "pv_capVideo"));
				if (detail.reasoning === true) caps.push(tipCap("推理", "pv_capReason"));
				if (caps.length > 0) rows.push(react.default.createElement("div", {
					className: "pv_tipCaps",
					key: "c"
				}, caps));
				if (detail.contextWindow !== void 0) rows.push(tipLine("上下文窗口", detail.contextWindow.toLocaleString("en-US"), "cw"));
				if (detail.maxTokens !== void 0) rows.push(tipLine("最大输出", detail.maxTokens.toLocaleString("en-US"), "mt"));
				rows.push(tipLine("思维链", detail.reasoning === true ? Array.isArray(detail.thinkingLevels) && detail.thinkingLevels.length > 0 ? detail.thinkingLevels.join("、") : "自动" : "关闭", "tk"));
				if (detail.source === "declared") rows.push(react.default.createElement("div", {
					className: "pv_tipDim",
					key: "src"
				}, "能力来自这条路由的声明（pi-ai 目录没收录这个模型 ID）"));
			} else rows.push(react.default.createElement("div", {
				className: "pv_tipDim",
				key: "dim"
			}, "该模型没有本地元数据"));
			return react.default.createElement("div", { className: "pv_tip" }, rows);
		}
		function tipLine(label, value, key) {
			return react.default.createElement("div", {
				className: "pv_tipRow",
				key: String(key)
			}, react.default.createElement("span", { className: "pv_tipLabel" }, label), react.default.createElement("span", null, String(value)));
		}
		function tipCap(text, cls) {
			return react.default.createElement("span", { className: "pv_cap " + cls }, text);
		}
		/**
		* 「添加供应商」下拉里一项的状态：已配置**且密钥在**才禁选。
		* 路由配好了但还没密钥（插件自带 config 就声明了 deepseek 这种）仍可选中——选中它就是走一遍
		* 表单把密钥存进去，否则用户既加不了新的、也补不了那一条缺的 key。
		*/
		function presetPickState(preset) {
			if (preset.configured !== true) return {
				disabled: false,
				tag: null
			};
			if (preset.missingKey === true) return {
				disabled: false,
				tag: "缺密钥"
			};
			return {
				disabled: true,
				tag: "已配置"
			};
		}
		/**
		* 「刷新余量 / 保存密钥」之后的结果判定：成功返回 undefined，失败给出原因。
		*
		* 宿主这两条路由一律回 200，成败看 body 的 ok；凭据没值时 ok=false，原因挂在 account.error
		* 上（"DEEPSEEK_API_KEY 没有值"）。只判 account 在不在会在没配 key 时弹一句"✓ 余量已刷新"，
		* 跟卡片上那句"未配置 key"直接打架。
		*/
		function refreshFailure(result) {
			var record = result === null || result === void 0 ? {} : result;
			if (record.ok === true) return void 0;
			var account = record.account;
			if (account !== null && typeof account === "object") {
				var reason = account.error;
				if (reason !== void 0 && reason !== null && String(reason) !== "") return String(reason);
			}
			if (record.error !== void 0 && record.error !== null) return String(record.error);
			return "未知错误";
		}
		/**
		* 添加 provider：选预设 → 填密钥/端点 → 测试 → 通过才能添加。
		* 测试走官方 llm/discoverModels 草稿探测（不落盘）；写入走官方同一套控制器
		* （settings/mutate 写 llm-pi-ai.providers 段 + credentials/set 存密钥），
		* 与官方 Models 页的存储完全同源。
		*/
		function AddProviderPanel(props) {
			var presets = Array.isArray(props.presets) ? props.presets : [];
			var openState = react.default.useState(false);
			var open = openState[0];
			var setOpen = openState[1];
			var formState = react.default.useState({
				routeId: "",
				key: "",
				baseURL: "",
				api: "",
				apiKeyEnv: "",
				websiteUrl: void 0
			});
			var form = formState[0];
			var setForm = formState[1];
			var testState = react.default.useState({
				phase: "idle",
				message: ""
			});
			var test = testState[0];
			var setTest = testState[1];
			var busyState = react.default.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var noteState = react.default.useState(null);
			var note = noteState[0];
			var setNote = noteState[1];
			var pickRef = react.default.useRef(null);
			var pickOpenState = react.default.useState(false);
			var pickOpen = pickOpenState[0];
			var setPickOpen = pickOpenState[1];
			var pickFilterState = react.default.useState("");
			var pickFilter = pickFilterState[0];
			var setPickFilter = pickFilterState[1];
			react.default.useEffect(function() {
				if (pickOpen !== true) return void 0;
				function onPointerDown(event) {
					if (pickRef.current !== null && pickRef.current.contains(event.target) === false) setPickOpen(false);
				}
				document.addEventListener("pointerdown", onPointerDown);
				return function() {
					document.removeEventListener("pointerdown", onPointerDown);
				};
			}, [pickOpen]);
			function patchForm(patch) {
				setForm(function(prev) {
					return withKeys(prev, patch);
				});
			}
			function pickPreset(id) {
				var preset = findById(presets, id);
				if (preset === void 0) return;
				patchForm({
					routeId: preset.id,
					baseURL: preset.baseURL,
					api: preset.api,
					apiKeyEnv: preset.apiKeyEnv,
					websiteUrl: preset.websiteUrl,
					key: ""
				});
				setTest({
					phase: "idle",
					message: ""
				});
				setNote(null);
			}
			function runTest() {
				if (form.routeId.trim() === "" || form.baseURL.trim() === "" || form.key.trim() === "") {
					setTest({
						phase: "fail",
						message: "路由 ID / API 地址 / API 密钥都要填"
					});
					return;
				}
				setTest({
					phase: "run",
					message: "正在用这把密钥实连供应商探测模型…"
				});
				apiCall("llm/discoverModels", {
					settingsNs: "llm-pi-ai",
					request: {
						provider: form.routeId.trim(),
						baseURL: form.baseURL.trim(),
						api: form.api,
						apiKey: form.key.trim()
					}
				}).then(function(value) {
					var models = Array.isArray(value) ? value : value !== null && typeof value === "object" && Array.isArray(value.models) ? value.models : [];
					var names = [];
					for (var i = 0; i < models.length && i < 3; i += 1) {
						var m = models[i];
						names.push(typeof m === "string" ? m : String(m && (m.name || m.id) || "?"));
					}
					setTest({
						phase: "ok",
						message: "✓ 连通，发现 " + String(models.length) + " 个模型" + (names.length > 0 ? "：" + names.join("、") + (models.length > 3 ? " …" : "") : "")
					});
				}).catch(function(cause) {
					setTest({
						phase: "fail",
						message: "✗ " + String(cause && cause.message ? cause.message : cause)
					});
				});
			}
			function add() {
				setBusy(true);
				setNote(null);
				var profile = {
					api: form.api,
					baseURL: form.baseURL.trim(),
					apiKeyEnv: form.apiKeyEnv.trim()
				};
				apiCall("settings/mutate", {
					ns: "llm-pi-ai",
					ops: [{
						op: "set",
						path: ["providers", form.routeId.trim()],
						value: profile
					}]
				}).then(function() {
					return apiCall("credentials/set", {
						ref: form.apiKeyEnv.trim(),
						value: form.key.trim()
					});
				}).then(function() {
					setNote("已添加 " + form.routeId.trim());
					setTest({
						phase: "idle",
						message: ""
					});
					patchForm({ key: "" });
					if (typeof props.onAdded === "function") props.onAdded();
				}).catch(function(cause) {
					setNote("添加失败：" + String(cause && cause.message ? cause.message : cause) + "（配置可能已写入、仅密钥未存，检查后可重试）");
				}).then(function() {
					setBusy(false);
				});
			}
			if (!open) return react.default.createElement("button", {
				type: "button",
				className: "pv_addBtn",
				onClick: function() {
					setOpen(true);
				}
			}, t("addProvider"));
			var pickedPreset = findById(presets, form.routeId);
			var pickedLabel = pickedPreset === void 0 ? form.routeId : pickedPreset.label;
			var customPicked = pickedPreset !== void 0 && pickedPreset.custom === true;
			var pickItems = [];
			for (var pk = 0; pk < presets.length; pk += 1) (function(preset) {
				if (pickFilter.trim() !== "" && fuzzyMatch(pickFilter, preset.label + " " + preset.id) !== true) return;
				var pick = presetPickState(preset);
				pickItems.push(react.default.createElement("button", {
					key: preset.id,
					type: "button",
					className: "pv_pickItem",
					disabled: pick.disabled,
					onClick: function() {
						pickPreset(preset.id);
						setPickOpen(false);
					}
				}, preset.label, pick.tag === null ? null : react.default.createElement("span", {
					className: "plan_tag",
					style: { marginLeft: "6px" }
				}, pick.tag)));
			})(presets[pk]);
			if (pickItems.length === 0) pickItems.push(react.default.createElement("div", {
				className: "pv_pickEmpty",
				key: "empty"
			}, "没有匹配的供应商"));
			return react.default.createElement("div", { className: "pv_pc" }, react.default.createElement("div", {
				className: "pv_pcBody",
				style: {
					borderTop: "0",
					paddingTop: "10px",
					gap: "6px"
				}
			}, react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, "供应商"), react.default.createElement("span", {
				className: "pv_pick",
				ref: pickRef
			}, react.default.createElement("button", {
				type: "button",
				className: "pv_field pv_pickBtn",
				onClick: function() {
					setPickOpen(!pickOpen);
					setPickFilter("");
				}
			}, react.default.createElement("span", null, form.routeId === "" ? "选择供应商…" : pickedLabel), react.default.createElement("span", { className: "pv_pcCaret" }, pickOpen ? "▾" : "▸")), pickOpen === false ? null : react.default.createElement("div", { className: "pv_pickMenu" }, react.default.createElement("input", {
				className: "pv_mFilter",
				style: { width: "100%" },
				type: "text",
				placeholder: "过滤供应商",
				value: pickFilter,
				autoFocus: true,
				onChange: function(event) {
					setPickFilter(event.target.value);
				}
			}), react.default.createElement("div", { className: "pv_pickList" }, pickItems)))), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, "路由 ID"), react.default.createElement("input", {
				className: customPicked ? "pv_field pv_key" : "pv_field pv_ro",
				value: form.routeId,
				readOnly: customPicked !== true,
				title: customPicked ? "给这个网关起个名字（kebab-case）" : "由所选供应商决定",
				onChange: function(event) {
					if (customPicked !== true) return;
					patchForm({
						routeId: event.target.value,
						apiKeyEnv: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY"
					});
				}
			})), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, "API 密钥"), react.default.createElement("input", {
				className: "pv_field pv_key",
				type: "password",
				placeholder: "sk-…",
				value: form.key,
				onChange: function(event) {
					patchForm({ key: event.target.value });
				}
			}), form.websiteUrl === void 0 ? null : react.default.createElement("a", {
				className: "pv_pcLink",
				href: form.websiteUrl,
				target: "_blank",
				rel: "noreferrer",
				style: { marginLeft: "8px" }
			}, "获取密钥 ↗")), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, "API 地址"), react.default.createElement("input", {
				className: form.baseURL === "" ? "pv_field pv_key" : "pv_field pv_ro",
				value: form.baseURL,
				readOnly: form.baseURL !== "",
				onChange: function(event) {
					patchForm({ baseURL: event.target.value });
				}
			})), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, "协议"), customPicked ? react.default.createElement("select", {
				className: "pv_field",
				value: form.api,
				onChange: function(event) {
					patchForm({ api: event.target.value });
				}
			}, react.default.createElement("option", { value: "openai-completions" }, "OpenAI"), react.default.createElement("option", { value: "anthropic-messages" }, "Anthropic")) : react.default.createElement("input", {
				className: "pv_field pv_ro",
				value: form.api,
				readOnly: true
			})), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, ""), react.default.createElement("span", { className: "pv_hint" }, "密钥存为 " + form.apiKeyEnv)), react.default.createElement("div", { className: "pv_actRow" }, react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: test.phase === "run",
				onClick: runTest
			}, test.phase === "run" ? "测试中…" : "测试"), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				disabled: busy || test.phase !== "ok",
				title: test.phase === "ok" ? "" : "先通过测试才能添加",
				onClick: add
			}, busy ? "添加中…" : "添加到列表"), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "auto" },
				onClick: function() {
					setOpen(false);
					setTest({
						phase: "idle",
						message: ""
					});
					setNote(null);
				}
			}, "取消")), test.message === "" ? null : react.default.createElement("div", { className: "plan_note" + (test.phase === "fail" ? " plan_badText" : "") }, test.message), note === null ? null : react.default.createElement("div", { className: "plan_note" }, note)));
		}
		/** 逐模型编辑器的一行（勾选 + 可编辑字段 + 移除）。 */
		function modelEditRow(row, patch, remove) {
			return react.default.createElement("div", {
				className: "pv_meRow" + (row.enabled ? "" : " pv_meRowOff"),
				key: row.id
			}, react.default.createElement("input", {
				type: "checkbox",
				className: "pv_meCheck",
				checked: row.enabled,
				title: row.enabled ? "取消勾选 = 保存后不再服务这个模型" : "勾上 = 让这家服务这个模型",
				onChange: function(event) {
					patch(row.id, { enabled: event.target.checked === true });
				}
			}), react.default.createElement("span", { className: "pv_meIdBox" }, react.default.createElement("span", {
				className: "pv_mId",
				title: row.id
			}, row.id), row.known ? null : react.default.createElement("span", {
				className: "pv_capMini pv_capDeclared",
				title: "生效 pi-ai 目录里没有这个 ID——上下文窗口与最大输出必须自己填"
			}, "自定义")), react.default.createElement("span", {
				className: "pv_meName",
				title: row.name
			}, row.name), react.default.createElement("input", {
				className: "pv_meNum",
				type: "text",
				inputMode: "numeric",
				placeholder: row.knownContextWindow === void 0 ? "上下文" : String(row.knownContextWindow),
				title: "上下文窗口（留空 = 跟着 pi-ai 目录）",
				value: row.contextWindow,
				onChange: function(event) {
					patch(row.id, { contextWindow: event.target.value });
				}
			}), react.default.createElement("input", {
				className: "pv_meNum",
				type: "text",
				inputMode: "numeric",
				placeholder: row.knownMaxTokens === void 0 ? "最大输出" : String(row.knownMaxTokens),
				title: "最大输出 token（留空 = 跟着 pi-ai 目录）",
				value: row.maxTokens,
				onChange: function(event) {
					patch(row.id, { maxTokens: event.target.value });
				}
			}), react.default.createElement("label", {
				className: "pv_meCap",
				title: "声明支持图片输入（写进模型的 input 模态）"
			}, react.default.createElement("input", {
				type: "checkbox",
				checked: row.vision,
				onChange: function(event) {
					patch(row.id, { vision: event.target.checked === true });
				}
			}), "视觉"), react.default.createElement("label", {
				className: "pv_meCap",
				title: "声明支持视频输入（写进模型的 input 模态）"
			}, react.default.createElement("input", {
				type: "checkbox",
				checked: row.video,
				onChange: function(event) {
					patch(row.id, { video: event.target.checked === true });
				}
			}), "视频"), react.default.createElement("button", {
				type: "button",
				className: "pv_iconBtn",
				title: "把这一行从清单里去掉（保存后生效）",
				onClick: function() {
					remove(row.id);
				}
			}, "✕"));
		}
		/** 编辑器初始行：当前生效的目录模型 + 目录里该 provider 的全部模型 + 路由声明过的模型。 */
		function buildEditRows(account, catalog, details) {
			var declared = Array.isArray(account.models) ? account.models : [];
			var rows = [];
			var seen = {};
			function add(id, name, detail, entry) {
				if (id === "" || seen[id] === true) return;
				seen[id] = true;
				var declaredInput = Array.isArray(entry === void 0 ? void 0 : entry.input) ? entry.input : [];
				rows.push({
					id,
					name,
					enabled: declared.length === 0 ? true : declared.some(function(item) {
						return item.id === id;
					}),
					contextWindow: entry !== void 0 && entry.contextWindow !== void 0 ? String(entry.contextWindow) : "",
					maxTokens: entry !== void 0 && entry.maxTokens !== void 0 ? String(entry.maxTokens) : "",
					vision: detail !== void 0 ? detail.vision === true : declaredInput.indexOf("image") !== -1,
					video: detail !== void 0 ? detail.video === true : declaredInput.indexOf("video") !== -1,
					known: detail !== void 0,
					knownContextWindow: detail === void 0 ? void 0 : detail.contextWindow,
					knownMaxTokens: detail === void 0 ? void 0 : detail.maxTokens,
					originVision: detail !== void 0 ? detail.vision === true : declaredInput.indexOf("image") !== -1,
					originVideo: detail !== void 0 ? detail.video === true : declaredInput.indexOf("video") !== -1,
					declared: entry
				});
			}
			for (var d = 0; d < declared.length; d += 1) {
				var entry = declared[d];
				if (entry === null || typeof entry !== "object") continue;
				var entryId = typeof entry.id === "string" ? entry.id : "";
				if (entryId === "") continue;
				var entryDetail = lookupDetail(details, account.id, entryId);
				add(entryId, entry.name !== void 0 ? String(entry.name) : entryDetail !== void 0 && entryDetail.name !== void 0 ? entryDetail.name : entryId, entryDetail, entry);
			}
			for (var c = 0; c < catalog.length; c += 1) {
				var model = catalog[c];
				add(model.id, model.name, lookupDetail(details, account.id, model.id), void 0);
			}
			var own = detailsOfProvider(details, account.id);
			for (var o = 0; o < own.length; o += 1) {
				if (typeof own[o].id !== "string") continue;
				add(own[o].id, own[o].name === void 0 ? String(own[o].id) : String(own[o].name), own[o], void 0);
			}
			return rows;
		}
		/**
		* 逐模型清单编辑器（本地版新增，实现 issue #1）。
		*
		* 官方 Models 页被本插件禁用（cordis.patch.yml），而它独有的「逐模型清单编辑」没有替代，
		* 于是「只想留 DeepSeek 三个模型里的一个」这类需求在界面上无处可做。这里补上：
		* 勾选 → 保存 → 写 settings 的 `llm-pi-ai.providers.<id>.models`（与官方 Models 页同一条写路径，
		* 官方 adapter 的 resolveRouteModels 认这个键，`models` 非空就替换整份服务目录）。
		*
		* 语义两条：
		*   保存清单 —— 只留勾上的；目录里没有的自定义 ID 必须填全上下文/最大输出（官方 strict 校验会拒）；
		*   跟随目录 —— 删掉 models 键，回到「pi-ai 目录收录什么就服务什么」。
		*/
		function ModelListEditor(props) {
			var account = props.account;
			var rowsState = react.default.useState(function() {
				return buildEditRows(account, props.catalog, props.details);
			});
			var rows = rowsState[0];
			var setRows = rowsState[1];
			var draftState = react.default.useState("");
			var draft = draftState[0];
			var setDraft = draftState[1];
			var busyState = react.default.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var errorState = react.default.useState(null);
			var error = errorState[0];
			var setError = errorState[1];
			var declaredCount = Array.isArray(account.models) ? account.models.length : 0;
			function patch(id, next) {
				setRows(function(prev) {
					return prev.map(function(row) {
						return row.id === id ? withKeys(row, next) : row;
					});
				});
			}
			function remove(id) {
				setRows(function(prev) {
					return prev.filter(function(row) {
						return row.id !== id;
					});
				});
			}
			function addRow() {
				var id = draft.trim();
				if (id === "") {
					setError("先在右边填一个模型 ID");
					return;
				}
				var exists = false;
				for (var i = 0; i < rows.length; i += 1) if (rows[i].id === id) exists = true;
				if (exists) {
					setError("「" + id + "」已经在清单里了");
					return;
				}
				var detail = lookupDetail(props.details, account.id, id);
				setRows(function(prev) {
					return prev.concat([{
						id,
						name: detail !== void 0 && detail.name !== void 0 ? detail.name : id,
						enabled: true,
						contextWindow: "",
						maxTokens: "",
						vision: detail !== void 0 && detail.vision === true,
						video: detail !== void 0 && detail.video === true,
						known: detail !== void 0,
						knownContextWindow: detail === void 0 ? void 0 : detail.contextWindow,
						knownMaxTokens: detail === void 0 ? void 0 : detail.maxTokens,
						originVision: detail !== void 0 && detail.vision === true,
						originVideo: detail !== void 0 && detail.video === true,
						declared: void 0
					}]);
				});
				setDraft("");
				setError(null);
			}
			/** 当前编辑结果 → settings 的 models 数组；形状不合法时返回 undefined 并写好错误提示。 */
			function payload() {
				var out = [];
				for (var i = 0; i < rows.length; i += 1) {
					var row = rows[i];
					if (row.enabled !== true) continue;
					var entry = row.declared === void 0 ? { id: row.id } : {
						...row.declared,
						id: row.id
					};
					var name = row.name.trim();
					if (name !== "" && name !== row.id) entry.name = name;
					var ctx = row.contextWindow.trim();
					if (ctx !== "") {
						var ctxNum = Number(ctx);
						if (!isFinite(ctxNum) || Math.floor(ctxNum) !== ctxNum || ctxNum <= 0) {
							setError("「" + row.id + "」的上下文窗口要填正整数");
							return;
						}
						entry.contextWindow = ctxNum;
					} else if (entry.contextWindow === void 0 && row.known !== true) {
						setError("pi-ai 目录里没有「" + row.id + "」，上下文窗口与最大输出都要填（官方适配器会拒绝缺字段的声明）");
						return;
					}
					var max = row.maxTokens.trim();
					if (max !== "") {
						var maxNum = Number(max);
						if (!isFinite(maxNum) || Math.floor(maxNum) !== maxNum || maxNum <= 0) {
							setError("「" + row.id + "」的最大输出要填正整数");
							return;
						}
						entry.maxTokens = maxNum;
					} else if (entry.maxTokens === void 0 && row.known !== true) {
						setError("pi-ai 目录里没有「" + row.id + "」，上下文窗口与最大输出都要填");
						return;
					}
					if (row.vision !== row.originVision || row.video !== row.originVideo || entry.input !== void 0 || row.known !== true) {
						var input = ["text"];
						if (row.vision === true) input.push("image");
						if (row.video === true) input.push("video");
						entry.input = input;
					}
					out.push(entry);
				}
				if (out.length === 0) {
					setError("至少留一个模型；要让这家回到「目录全量」请点「跟随目录」");
					return;
				}
				return out;
			}
			function submit(models, done) {
				setBusy(true);
				setError(null);
				postJson("/provider/set-models", {
					providerId: account.id,
					models
				}).then(function(res) {
					if (res === null || res === void 0 || res.ok !== true) {
						setError("保存失败：" + String(res && res.error || "未知错误"));
						return;
					}
					props.onSaved(done);
					props.onClose();
				}).catch(function(cause) {
					setError("保存失败：" + String(cause && cause.message ? cause.message : cause));
				}).then(function() {
					setBusy(false);
				});
			}
			var rows_ = [];
			for (var r = 0; r < rows.length; r += 1) rows_.push(modelEditRow(rows[r], patch, remove));
			var enabledCount = 0;
			for (var e = 0; e < rows.length; e += 1) if (rows[e].enabled === true) enabledCount += 1;
			return react.default.createElement("div", { className: "pv_me" }, react.default.createElement("div", { className: "pv_meHead" }, react.default.createElement("span", { className: "pv_meTitle" }, "逐模型清单"), react.default.createElement("span", { className: "pv_hint" }, declaredCount > 0 ? "当前只服务清单里的 " + String(declaredCount) + " 个模型" : "当前跟随 pi-ai 目录（" + String(rows.length) + " 个模型全部可用）")), react.default.createElement("div", { className: "pv_hint" }, "保存后写进 settings.yaml 的 llm-pi-ai.providers." + account.id + ".models：没勾的模型不会出现在模型选择器里。目录里没有的自定义 ID 必须把「上下文」和「最大输出」填全。"), react.default.createElement("div", { className: "pv_meList" }, rows_), react.default.createElement("div", { className: "pv_meAdd" }, react.default.createElement("input", {
				className: "pv_field",
				type: "text",
				placeholder: "自定义模型 ID（目录里没有的）",
				value: draft,
				onChange: function(event) {
					setDraft(event.target.value);
				}
			}), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: busy,
				onClick: addRow
			}, "加一行"), react.default.createElement("span", { className: "pv_hint pv_push" }, "已勾 " + String(enabledCount) + " / " + String(rows.length))), react.default.createElement("div", { className: "pv_meActs" }, react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: busy,
				onClick: function() {
					setError(null);
					var models = payload();
					if (models === void 0) return;
					submit(models, "✓ " + shortName(account) + " 的模型清单已保存（" + String(models.length) + " 个）");
				}
			}, busy ? "保存中…" : "保存清单"), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				disabled: busy,
				title: "删掉这条路由的 models 键：回到「pi-ai 目录收录什么就服务什么」",
				onClick: function() {
					submit(null, "✓ " + shortName(account) + " 已回到目录全量");
				}
			}, "跟随目录（清空清单）"), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "auto" },
				disabled: busy,
				onClick: props.onClose
			}, "取消")), error === null ? null : react.default.createElement("div", { className: "plan_note plan_badText" }, error));
		}
		/**
		* 删除 provider 的确认弹层（本地版新增，实现 issue #3）。
		*
		* 上游第一版是在 ✕ 旁边原地摊开「确认删除 / 取消」两个小按钮：位置就是刚点过的那个槽位，
		* 代价（清掉哪条配置、哪把密钥、影响谁）一句没说，误点一次就等于把一整家供应商拆掉。
		* 这里改成遮罩弹层：把要清的东西逐条列出来，危险按钮单独一个色，取消是默认落点。
		*/
		function DeleteProviderModal(props) {
			var account = props.account;
			var modelCount = Array.isArray(account.models) ? account.models.length : 0;
			var keyRef = typeof account.apiKeyEnv === "string" && account.apiKeyEnv !== "" ? String(account.apiKeyEnv) : void 0;
			var facts = [
				{
					key: "id",
					label: "路由 ID",
					value: String(account.id)
				},
				{
					key: "cfg",
					label: "删除的配置",
					value: "settings.yaml → llm-pi-ai.providers." + String(account.id) + "（baseURL / 协议" + (modelCount > 0 ? " / 模型清单 " + String(modelCount) + " 个" : "") + " 一并删除）"
				},
				{
					key: "key",
					label: "删除的密钥",
					value: keyRef === void 0 ? "这条路由没有绑定凭据名" : keyRef + "（凭据仓库里的值一起清掉）"
				},
				{
					key: "impact",
					label: "影响",
					value: "模型选择器里这家会消失；正在用 " + shortName(account) + " 的会话下次落到默认模型"
				}
			];
			var rows = [];
			for (var i = 0; i < facts.length; i += 1) rows.push(react.default.createElement("div", {
				className: "pv_modalRow",
				key: facts[i].key
			}, react.default.createElement("span", { className: "pv_modalLabel" }, facts[i].label), react.default.createElement("span", { className: "pv_modalValue" }, facts[i].value)));
			return react.default.createElement("div", {
				className: "pv_mask",
				onClick: function() {
					if (props.busy !== true) props.onCancel();
				}
			}, react.default.createElement("div", {
				className: "pv_modal",
				onClick: function(event) {
					if (typeof event.stopPropagation === "function") event.stopPropagation();
				}
			}, react.default.createElement("div", { className: "pv_modalTitle" }, "删除 provider：" + shortName(account) + "？"), rows, react.default.createElement("div", { className: "pv_modalWarn" }, "删除后需要重新填一遍密钥与端点才能恢复，不能撤销。"), props.error === null ? null : react.default.createElement("div", { className: "plan_note plan_badText" }, props.error), react.default.createElement("div", { className: "pv_modalActs" }, react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				disabled: props.busy,
				onClick: props.onCancel
			}, "取消"), react.default.createElement("button", {
				type: "button",
				className: "pv_delYes pv_dangerBtn",
				disabled: props.busy,
				onClick: props.onConfirm
			}, props.busy === true ? "删除中…" : "删除这条路由"))));
		}
		/**
		* Provider 标签：CC Switch 式卡片。
		* 每个 provider 一张分割明显的卡片，头部一行直给最关键信息（coding plan 的
		* 5小时/订阅余量、API 的余额），点卡片展开看窗口进度与明细；有报警/错误的卡片
		* 默认展开。pi-ai 桥接沉底且默认折叠（次要信息）。
		*/
		function ProviderSettingsSection() {
			var statusState = react.default.useState(null);
			var status = statusState[0];
			var setStatus = statusState[1];
			var planState = react.default.useState(null);
			var plan = planState[0];
			var setPlan = planState[1];
			var noteState = react.default.useState(null);
			var note = noteState[0];
			var setNote = noteState[1];
			var busyState = react.default.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var tabState = react.default.useState("providers");
			var tab = tabState[0];
			var setTab = tabState[1];
			var groupsState = react.default.useState([]);
			var catalogGroups = groupsState[0];
			var setCatalogGroups = groupsState[1];
			var detailsState = react.default.useState({});
			var detailsById = detailsState[0];
			var setDetailsById = detailsState[1];
			var filtersState = react.default.useState({});
			var filters = filtersState[0];
			var setFilters = filtersState[1];
			var presetsState = react.default.useState([]);
			var presets = presetsState[0];
			var setPresets = presetsState[1];
			var catTickState = react.default.useState(0);
			var setCatTick = catTickState[1];
			var delState = react.default.useState(null);
			var delTarget = delState[0];
			var setDelTarget = delState[1];
			var delBusyState = react.default.useState(false);
			var delBusy = delBusyState[0];
			var setDelBusy = delBusyState[1];
			var delErrorState = react.default.useState(null);
			var delError = delErrorState[0];
			var setDelError = delErrorState[1];
			var editModelsState = react.default.useState(null);
			var editModelsFor = editModelsState[0];
			var setEditModelsFor = editModelsState[1];
			var refreshingState = react.default.useState({});
			var setRefreshing = refreshingState[1];
			var keyDraftState = react.default.useState({});
			var keyDrafts = keyDraftState[0];
			var setKeyDrafts = keyDraftState[1];
			var savingKeyState = react.default.useState({});
			var savingKey = savingKeyState[0];
			var setSavingKey = savingKeyState[1];
			var toastState = react.default.useState(null);
			var toast = toastState[0];
			var setToast = toastState[1];
			var toastTimer = null;
			var setNowTick = react.default.useState(0)[1];
			react.default.useEffect(function() {
				var timer = setInterval(function() {
					setNowTick(function(n) {
						return n + 1;
					});
				}, 3e4);
				return function() {
					clearInterval(timer);
				};
			}, []);
			var openState = react.default.useState({});
			var openMap = openState[0];
			var setOpenMap = openState[1];
			var refresh = react.default.useCallback(function(force) {
				loadProviderStatus().then(function(payload) {
					setStatus(payload);
				}).catch(function() {
					setStatus(STATUS_UNAVAILABLE);
				});
				loadPlanStatus(force).then(function(payload) {
					setPlan(payload);
				}).catch(function(cause) {
					setNote(cause && cause.message ? String(cause.message) : String(cause));
				});
			}, []);
			react.default.useEffect(function() {
				return onPlanChange(function(payload) {
					setPlan(payload);
				});
			}, []);
			react.default.useEffect(function() {
				refresh(false);
			}, [refresh]);
			react.default.useEffect(function() {
				var cancelled = false;
				loadModelCatalog().then(function(next) {
					if (!cancelled) setCatalogGroups(next.groups);
				}).catch(function() {});
				return function() {
					cancelled = true;
				};
			}, [catTickState[0]]);
			react.default.useEffect(function() {
				reloadPresets();
			}, []);
			function reloadPresets() {
				getJson("/provider/presets").then(function(payload) {
					if (payload !== null && Array.isArray(payload.presets)) setPresets(payload.presets);
				}).catch(function() {});
			}
			function onProviderAdded() {
				refresh(true);
				setCatTick(function(t) {
					return t + 1;
				});
				reloadPresets();
			}
			function onProviderRemoved(account) {
				dropPlanAccount(account.id);
				setCatTick(function(t) {
					return t + 1;
				});
				reloadPresets();
			}
			react.default.useEffect(function() {
				var cancelled = false;
				loadModelDetailMap().then(function(map) {
					if (!cancelled) setDetailsById(map);
				}).catch(function() {});
				return function() {
					cancelled = true;
				};
			}, []);
			function setRefreshingFlag(id, value) {
				setRefreshing(function(prev) {
					return withKey(prev, id, value);
				});
			}
			function showToast(text, ok) {
				setToast({
					text,
					ok
				});
				if (toastTimer !== null) clearTimeout(toastTimer);
				toastTimer = setTimeout(function() {
					setToast(null);
					toastTimer = null;
				}, 2600);
			}
			function refreshSummary(account) {
				var percent = worstPercent(account);
				if (percent !== void 0) return "（余 " + String(percent) + "%）";
				if (Array.isArray(account.balances) && account.balances.length > 0) return "（" + account.balances[0].value + "）";
				return "";
			}
			function refreshAccount(account) {
				setRefreshingFlag(account.id, true);
				postJson("/provider/refresh", { providerId: account.id }).then(function(res) {
					if (res !== null && res !== void 0 && res.account !== void 0) mergePlanAccount(res.account);
					var failure = refreshFailure(res);
					if (failure === void 0) showToast("✓ " + shortName(account) + " 余量已刷新" + refreshSummary(res.account), true);
					else showToast("✗ " + shortName(account) + " 刷新失败：" + failure, false);
				}).catch(function(cause) {
					showToast("✗ " + shortName(account) + " 刷新失败：" + String(cause && cause.message ? cause.message : cause), false);
				}).then(function() {
					setRefreshingFlag(account.id, false);
				});
			}
			/**
			* 卡片里直接补密钥：路由已经在了（插件自己的 config 就声明了 deepseek），缺的只是凭据。
			* 存进官方同一个凭据仓库（credentials/set，与添加面板同一条 RPC），随后立刻实测一次余量。
			*/
			function saveKey(account) {
				var ref = account.apiKeyEnv === void 0 ? "" : String(account.apiKeyEnv);
				var draft = keyDrafts[account.id];
				var value = draft === void 0 ? "" : String(draft).trim();
				if (ref === "") {
					showToast("✗ " + shortName(account) + " 这条路由没有凭据名，无法存密钥", false);
					return;
				}
				if (value === "") {
					showToast("✗ " + shortName(account) + " 先填密钥", false);
					return;
				}
				setSavingKey(function(prev) {
					return withKey(prev, account.id, true);
				});
				apiCall("credentials/set", {
					ref,
					value
				}).then(function() {
					setKeyDrafts(function(prev) {
						return withKey(prev, account.id, "");
					});
					return postJson("/provider/refresh", { providerId: account.id });
				}).then(function(res) {
					if (res !== null && res !== void 0 && res.account !== void 0) mergePlanAccount(res.account);
					var failure = refreshFailure(res);
					if (failure === void 0) showToast("✓ " + shortName(account) + " 密钥已保存，" + refreshSummary(res.account), true);
					else showToast("✓ 密钥已保存，但余量没查通：" + failure, false);
					reloadPresets();
				}).catch(function(cause) {
					showToast("✗ 密钥保存失败：" + String(cause && cause.message ? cause.message : cause), false);
				}).then(function() {
					setSavingKey(function(prev) {
						return withKey(prev, account.id, false);
					});
				});
			}
			function removeProvider(account) {
				setDelBusy(true);
				setDelError(null);
				postJson("/provider/remove", { providerId: account.id }).then(function(res) {
					if (res === null || res === void 0 || res.ok !== true) {
						setDelError("删除失败：" + String(res && res.error || "未知错误"));
						return;
					}
					setDelTarget(null);
					onProviderRemoved(account);
				}).catch(function(cause) {
					setDelError("删除失败：" + String(cause && cause.message ? cause.message : cause));
				}).then(function() {
					setDelBusy(false);
				});
			}
			function checkUpdate() {
				setBusy(true);
				setNote("正在检查上游 ...");
				postJson("/provider/update").then(function(result) {
					if (result.disabled === true) setNote("本地版已停用 pi-ai 自动下载：vendor/ 不会落地第二份 pi-ai。要跟上游就用 DSH_PROVIDER_UPDATE=on 启动 dsh");
					else if (result.error !== void 0) setNote("更新失败：" + String(result.error));
					else if (result.applied === true) setNote("已下载 " + String(result.latest) + "，验证通过（完整性 + 兼容性），重启 dsh 后生效");
					else if (result.compatible === false) setNote(String(result.latest) + " 验证没通过，已跳过（不会切过去）");
					else setNote("已是最新（" + String(result.latest) + "）");
					refresh(true);
				}).catch(function(cause) {
					setNote("更新失败：" + String(cause && cause.message ? cause.message : cause));
				}).then(function() {
					setBusy(false);
				});
			}
			/** 折叠态记忆：undefined 时回落到默认值（报警/错误的卡片默认展开）。 */
			function isOpen(key, dflt) {
				return openMap[key] === void 0 ? dflt : openMap[key];
			}
			function toggle(key, dflt) {
				setOpenMap(function(prev) {
					return withKey(prev, key, isOpen(key, dflt) !== true);
				});
			}
			/** 模型列表过滤词（按模型 ID 或名称匹配）。 */
			function setFilter(id, value) {
				setFilters(function(prev) {
					return withKey(prev, id, value);
				});
			}
			var bridge = status === null || status.bridge === void 0 ? void 0 : status.bridge;
			var update = status === null || status.update === void 0 ? void 0 : status.update;
			var updatesEnabled = status === null || status.updatesEnabled === void 0 ? void 0 : status.updatesEnabled === true;
			var bridgeRows = piAiBridgeRows(bridge, update, updatesEnabled);
			var bridgeLines = [];
			for (var bi = 0; bi < bridgeRows.length; bi += 1) {
				var row = bridgeRows[bi];
				var children = [row.text];
				if (row.value !== void 0) children.push(react.default.createElement("span", {
					className: "plan_tag pv_push",
					title: row.title === void 0 ? "" : row.title,
					key: "value"
				}, row.value));
				bridgeLines.push(react.default.createElement("div", {
					className: "pv_line" + (row.bad === true ? " plan_badText" : row.warn === true ? " plan_warnText" : ""),
					key: row.key
				}, children));
			}
			bridgeLines.push(react.default.createElement("div", {
				className: "pv_line",
				key: "action"
			}, piAiUpstreamText(update, updatesEnabled), react.default.createElement("button", {
				type: "button",
				className: "pv_action pv_push",
				disabled: busy || updatesEnabled === false,
				title: updatesEnabled === false ? "本地版已停用 pi-ai 自动下载：vendor/ 不会落地第二份 pi-ai（要跟上游就用 DSH_PROVIDER_UPDATE=on 启动 dsh）" : "",
				onClick: checkUpdate
			}, updatesEnabled === false ? "自动下载已停用" : busy ? "检查中 ..." : "检查更新")));
			var accounts = plan !== null && Array.isArray(plan.accounts) ? plan.accounts : [];
			var modelsByProvider = {};
			for (var gi = 0; gi < catalogGroups.length; gi += 1) modelsByProvider[catalogGroups[gi].id] = catalogGroups[gi].models;
			var cards = [];
			for (var i = 0; i < accounts.length; i += 1) (function(account) {
				var chips = headlineChips(account);
				var dflt = account.error !== void 0 || typeof account.credentialWarning === "string";
				var expanded = isOpen(account.id, dflt);
				var chipEls = [];
				for (var c = 0; c < chips.length; c += 1) chipEls.push(headlineChip(chips[c], c));
				var bodyRows = [];
				if (expanded) {
					bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "id"
					}, react.default.createElement("span", null, "路由 ID"), react.default.createElement("span", { className: "pv_field" }, String(account.id))));
					var keyless = account.authConfigured === false && typeof account.apiKeyEnv === "string" && account.apiKeyEnv !== "";
					bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "key"
					}, react.default.createElement("span", null, "API 密钥"), keyless ? react.default.createElement("span", {
						className: "pv_pick",
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: "6px",
							flex: "1 1 auto"
						}
					}, react.default.createElement("input", {
						className: "pv_field pv_key",
						style: { flex: "1 1 auto" },
						type: "password",
						placeholder: "sk-…",
						value: keyDrafts[account.id] === void 0 ? "" : String(keyDrafts[account.id]),
						disabled: savingKey[account.id] === true,
						onChange: function(event) {
							var next = event.target.value;
							setKeyDrafts(function(prev) {
								return withKey(prev, account.id, next);
							});
						}
					}), react.default.createElement("button", {
						type: "button",
						className: "pv_action",
						style: {
							marginLeft: "0",
							flex: "0 0 auto"
						},
						disabled: savingKey[account.id] === true,
						title: "存进 " + String(account.apiKeyEnv) + " 并立刻实测一次余量",
						onClick: function() {
							saveKey(account);
						}
					}, savingKey[account.id] === true ? "保存中…" : "保存")) : react.default.createElement("span", { className: "pv_field" }, account.keyHint !== void 0 ? account.keyHint : "已配置")));
					if (account.baseUrl !== void 0) bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "url"
					}, react.default.createElement("span", null, "API 地址"), react.default.createElement("span", { className: "pv_field" }, String(account.baseUrl))));
					if (account.api !== void 0) bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "api"
					}, react.default.createElement("span", null, "协议"), react.default.createElement("span", { className: "pv_field" }, String(account.api))));
					if (account.apiKeyEnv !== void 0) bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "ref"
					}, react.default.createElement("span", null, ""), react.default.createElement("span", { className: "pv_hint" }, "密钥存为 " + String(account.apiKeyEnv))));
					var models = modelsByProvider[account.id];
					if (models === void 0) bodyRows.push(react.default.createElement("div", {
						className: "pv_line",
						key: "m-load"
					}, "模型目录加载中…"));
					else if (models.length === 0 && account.deletable !== true) bodyRows.push(react.default.createElement("div", {
						className: "pv_line",
						key: "m-none"
					}, "目录里没有这个 provider 的模型"));
					else {
						var modelsOpen = isOpen(account.id + ":models", false);
						var filterText = filters[account.id] === void 0 ? "" : String(filters[account.id]);
						var needle = filterText.trim().toLowerCase();
						var filtered = [];
						for (var fi = 0; fi < models.length; fi += 1) if (fuzzyMatch(filterText, models[fi].id + " " + models[fi].name)) filtered.push(models[fi]);
						var mBoxRows = [];
						var mTopChildren = [react.default.createElement("button", {
							type: "button",
							className: "pv_mHead",
							key: "m-head",
							onClick: function() {
								toggle(account.id + ":models", false);
							}
						}, react.default.createElement("span", null, "模型（" + (needle === "" ? String(models.length) : String(filtered.length) + "/" + String(models.length)) + "）"))];
						if (account.deletable === true) mTopChildren.push(react.default.createElement("button", {
							type: "button",
							className: "pv_action pv_meOpen",
							key: "m-config",
							title: "编辑这条路由服务的模型清单（写 settings.yaml 的 llm-pi-ai.providers." + account.id + ".models）",
							onClick: function() {
								toggle(account.id + ":models", false);
								setEditModelsFor(editModelsFor === account.id ? null : account.id);
								setOpenMap(function(prev) {
									return withKey(prev, account.id, true);
								});
							}
						}, editModelsFor === account.id ? "收起清单" : "配置模型"));
						if (modelsOpen) mTopChildren.push(react.default.createElement("span", {
							className: "pv_fbox",
							key: "m-filter"
						}, react.default.createElement("input", {
							className: "pv_mFilter",
							type: "text",
							placeholder: "过滤",
							value: filterText,
							onChange: function(event) {
								setFilter(account.id, event.target.value);
							}
						}), filterText === "" ? null : react.default.createElement("button", {
							type: "button",
							className: "pv_fclear",
							title: "清除",
							onClick: function() {
								setFilter(account.id, "");
							}
						}, "×")));
						mTopChildren.push(react.default.createElement("div", {
							className: "pv_mCaretCol",
							key: "m-caret",
							title: modelsOpen ? "收起" : "展开",
							onClick: function() {
								toggle(account.id + ":models", false);
							}
						}, caretSvg(modelsOpen)));
						mBoxRows.push(react.default.createElement("div", {
							className: "pv_mTop",
							key: "m-top"
						}, mTopChildren));
						if (modelsOpen || editModelsFor === account.id) {
							if (editModelsFor === account.id) mBoxRows.push(react.default.createElement(ModelListEditor, {
								key: "m-edit",
								account,
								catalog: models,
								details: detailsById,
								onSaved: function(message) {
									showToast(message, true);
									onProviderAdded();
								},
								onClose: function() {
									setEditModelsFor(null);
								}
							}));
							else {
								var mListRows = [];
								mListRows.push(react.default.createElement("div", {
									className: "pv_mHeadRow",
									key: "m-colhead"
								}, react.default.createElement("span", {
									className: "pv_mId",
									style: { fontFamily: "inherit" }
								}, "模型 ID"), react.default.createElement("span", { className: "pv_mName" }, "名称"), react.default.createElement("span", { className: "pv_mCaps" }, "能力"), react.default.createElement("span", { className: "pv_mCtx" }, "上下文")));
								if (filtered.length === 0) mListRows.push(react.default.createElement("div", {
									className: "pv_line",
									key: "m-empty"
								}, "没有匹配「" + filterText + "」的模型"));
								else for (var m = 0; m < filtered.length; m += 1) mListRows.push(modelRow(filtered[m], account, detailsById));
								mBoxRows.push(react.default.createElement("div", {
									className: "pv_mList",
									key: "m-list"
								}, mListRows));
							}
						}
						bodyRows.push(react.default.createElement("div", {
							className: "pv_mBox",
							key: "mbox"
						}, mBoxRows));
					}
					if (account.error !== void 0) bodyRows.push(react.default.createElement("div", {
						className: "plan_note plan_badText",
						key: "err"
					}, String(account.error)));
					if (typeof account.credentialWarning === "string") bodyRows.push(react.default.createElement("div", {
						className: "plan_note plan_badText",
						key: "warn"
					}, account.credentialWarning));
				}
				var linkUrl = typeof account.websiteUrl === "string" && account.websiteUrl !== "" ? account.websiteUrl : typeof account.baseUrl === "string" && account.baseUrl !== "" ? account.baseUrl : void 0;
				cards.push(react.default.createElement("div", {
					className: "pv_pc" + (expanded ? " pv_pcOpen" : ""),
					key: account.id
				}, react.default.createElement("div", { className: "pv_pcTop" }, react.default.createElement("div", { className: "pv_pcMain" }, react.default.createElement("div", {
					className: "pv_pcHead",
					role: "button",
					tabIndex: 0,
					"aria-expanded": expanded ? "true" : "false",
					onClick: function() {
						toggle(account.id, dflt);
					},
					onKeyDown: function(ev) {
						if (ev && (ev.key === "Enter" || ev.key === " ")) {
							if (typeof ev.preventDefault === "function") ev.preventDefault();
							toggle(account.id, dflt);
						}
					}
				}, react.default.createElement("span", { className: "pv_pcLead" }, react.default.createElement("span", { className: "pv_pcLeadRow" }, react.default.createElement("span", { className: dotClass(account) }), react.default.createElement("span", { className: "pv_pcName" }, shortName(account)), linkUrl === void 0 ? null : react.default.createElement("a", {
					className: "pv_pcWeb",
					href: linkUrl,
					target: "_blank",
					rel: "noreferrer",
					title: "打开官网 " + linkTextOf(linkUrl),
					onClick: function(event) {
						if (event && typeof event.stopPropagation === "function") event.stopPropagation();
					}
				}, "↗")))), react.default.createElement("div", { className: "pv_pcMeta" }, chipEls, react.default.createElement("span", { className: "pv_metaActs" }, account.fetchedAt === void 0 ? null : react.default.createElement("span", {
					className: "pv_fresh",
					title: "上次刷新 " + String(account.fetchedAt).slice(11, 19)
				}, "◷ " + relativeTime(account.fetchedAt)), react.default.createElement("button", {
					type: "button",
					className: "pv_iconBtn" + (refreshingState[0][account.id] === true ? " pv_spin" : ""),
					disabled: refreshingState[0][account.id] === true,
					title: refreshingState[0][account.id] === true ? "刷新中…" : "刷新余量" + (account.fetchedAt !== void 0 ? "（上次 " + String(account.fetchedAt).slice(11, 19) + "）" : ""),
					onClick: function() {
						refreshAccount(account);
					}
				}, "↻"), account.deletable === true ? react.default.createElement("button", {
					type: "button",
					className: "pv_iconBtn",
					title: "删除这个 provider（会先弹出确认，列清要删的配置与密钥）",
					onClick: function() {
						setDelError(null);
						setDelTarget(account);
					}
				}, "✕") : null))), react.default.createElement("div", {
					className: "pv_pcCaretCol",
					title: expanded ? "收起" : "展开",
					onClick: function() {
						toggle(account.id, dflt);
					}
				}, caretSvg(expanded))), expanded ? react.default.createElement("div", { className: "pv_pcBody" }, bodyRows) : null));
			})(accounts[i]);
			if (cards.length === 0) cards.push(react.default.createElement("div", {
				className: "pv_line",
				key: "__none"
			}, String(plan !== null && plan.error !== void 0 ? plan.error : "暂无 provider 额度数据")));
			var tabProviders = react.default.createElement("button", {
				type: "button",
				className: "pv_tab" + (tab === "providers" ? " pv_tabOn" : ""),
				onClick: function() {
					setTab("providers");
				}
			}, t("tabProviders"));
			var tabBridge = react.default.createElement("button", {
				type: "button",
				className: "pv_tab" + (tab === "bridge" ? " pv_tabOn" : ""),
				onClick: function() {
					setTab("bridge");
				}
			}, "pi-ai 桥接");
			return react.default.createElement("div", { className: "pv_stack" }, react.default.createElement("div", { className: "pv_tabs" }, tabProviders, tabBridge), tab === "bridge" ? react.default.createElement("div", { className: "pv_pc" }, react.default.createElement("div", {
				className: "pv_pcBody",
				style: {
					borderTop: "0",
					paddingTop: "8px"
				}
			}, bridgeLines, note === null ? null : react.default.createElement("div", { className: "plan_note" }, note))) : react.default.createElement("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: "10px"
			} }, react.default.createElement(AddProviderPanel, {
				presets,
				onAdded: onProviderAdded
			}), cards), toast === null ? null : react.default.createElement("div", { className: "pv_toast " + (toast.ok === true ? "pv_toastOk" : "pv_toastFail") }, toast.text), delTarget === null ? null : react.default.createElement(DeleteProviderModal, {
				account: delTarget,
				busy: delBusy,
				error: delError,
				onCancel: function() {
					if (delBusy === true) return;
					setDelTarget(null);
					setDelError(null);
				},
				onConfirm: function() {
					removeProvider(delTarget);
				}
			}));
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* 插件样式：沿用 GUI 的 CSS 变量，跟模型座位视觉一致。
		* installCss 一律手写 style 标签（官方 styles.insert 需要 inject 'styles'，见文件末尾注释）。
		*/
		var css = ".plan_root{position:relative;display:inline-flex;align-items:center}.plan_dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.plan_dot_ok{background:#22a06b}.plan_dot_warn{background:#d9a300}.plan_dot_bad{background:#d9534f}.plan_tag{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-tertiary);font-weight:400}.plan_warnText{color:#b8860b}.plan_badText{color:#d9534f}.plan_note{margin-top:3px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);word-break:break-word}.mp_search{box-sizing:border-box;width:100%;padding:6px 10px;margin-bottom:4px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:8px;outline:0}.mp_search:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}.mp_chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.mp_chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font:inherit;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:999px;cursor:pointer}.mp_chip[data-on=\"1\"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}.mp_modelName{font-weight:500}.mp_empty{padding:14px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary)}.ms_trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(560px,60vw);max-width:min(560px,60cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;background:transparent;outline:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;cursor:pointer;white-space:nowrap}.ms_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.ms_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.ms_tLabel{min-width:0;overflow:hidden;text-overflow:ellipsis}.ms_tProvider{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;flex-shrink:999}.ms_tModel{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;flex-shrink:1}.ms_tSlash{flex:0 0 auto}.ms_tEffort{flex:0 0 auto;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}.ms_tQuota{flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}@container (max-width:760px){.ms_tProvider,.ms_tSlash{display:none}}@container (max-width:620px){.ms_tQuotaText{display:none}}.ms_chev{flex:0 0 auto;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));transition:transform .12s ease}.ms_chevOpen{transform:rotate(180deg)}.ms_menu{position:absolute;bottom:calc(100% + 6px);right:0;z-index:1100;display:flex;flex-direction:column;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:0;border-radius:20px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary)}.ms_cell{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;height:40px;padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;text-align:left}.ms_cell:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.ms_cellLabel{flex:0 0 auto;white-space:nowrap}.ms_cellValue{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-alias-label-tertiary)}.ms_cellChev{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}.ms_scroll{min-height:0;overflow-y:auto;display:flex;flex-direction:column}.ms_group{margin-top:4px}.ms_groupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-weight:500}.ms_option{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;min-height:38px;padding:6px 8px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer}.ms_option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.ms_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.ms_name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.ms_capsCol{flex:none;width:92px;display:flex;justify-content:flex-end;align-items:center;gap:4px}.ms_ctxCol{flex:none;width:48px;text-align:right;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.ms_check{flex:0 0 18px;display:grid;place-items:center;color:var(--dsw-alias-label-primary)}.ms_status{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.pv_section{display:flex;flex-direction:column;gap:12px;max-width:640px}.pv_card{padding:14px 16px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}.pv_title{font-size:13px;font-weight:600;line-height:18px;margin-bottom:8px}.pv_line{display:flex;align-items:center;gap:10px;font-size:13px;line-height:22px;padding:3px 0;color:var(--dsw-alias-label-secondary)}.pv_action{margin-left:auto;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:6px;padding:4px 12px;cursor:pointer}.pv_action:disabled{opacity:.5;cursor:default}.pv_stack{display:flex;flex-direction:column;gap:14px;max-width:600px}.pv_pc{list-style:none;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.15));border-radius:16px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;display:flex;flex-direction:column}.pv_pc:hover{border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}.pv_pcOpen{background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}.pv_pcTop{display:flex;align-items:stretch}.pv_pcMain{flex:1;min-width:0;display:flex;flex-direction:column}.pv_pcCaretCol{flex:none;width:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--dsw-alias-label-tertiary)}.pv_pcCaretCol:hover{color:var(--dsw-alias-label-secondary)}.pv_pcHead{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;background:0 0;cursor:pointer;font:inherit;color:inherit;text-align:left;border-radius:12px}.pv_pcHead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:-2px}.pv_pcName{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv_pcChips{flex:none;display:flex;align-items:center;gap:10px;font-size:13px;white-space:nowrap}.pv_chipItem{display:inline-flex;align-items:baseline;gap:2px}.pv_chipLabel{color:var(--dsw-alias-label-secondary)}.pv_chipSep{flex:none;width:1px;height:12px;margin:0 4px;background:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}.pv_chipReset{color:var(--dsw-alias-label-tertiary);font-size:12px}.pv_pcCaret{flex:none;display:block;color:var(--dsw-alias-label-tertiary);transition:transform .16s}.pv_pcCaretOpen{transform:rotate(180deg)}.pv_pcMeta{display:flex;align-items:center;gap:10px;padding:2px 16px 14px;font-size:13px;flex-wrap:wrap}.pv_metaActs{margin-left:auto;display:inline-flex;align-items:center;gap:4px}.pv_pcWeb{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary);text-decoration:none;font-size:14px;line-height:20px;padding:0 2px;border-radius:6px}.pv_pcWeb:hover{color:var(--dsw-alias-label-secondary)}.pv_lv{flex:none;margin-left:auto;font-size:12px;line-height:18px;padding:1px 10px;border-radius:999px;white-space:nowrap;color:var(--dsw-alias-state-business-primary,#5b8cff);border:1px solid var(--dsw-alias-state-business-primary,#5b8cff)}.pv_pickItem,.pv_iconBtn,.pv_action,.pv_tab,.pv_addBtn,.pv_fclear,.pv_delYes,.pv_delNo,.mp_chip,.pv_pcLink{transition:background-color .16s ease,color .16s ease}.pv_iconBtn:focus-visible,.pv_action:focus-visible,.pv_tab:focus-visible,.pv_pickItem:focus-visible,.pv_addBtn:focus-visible,.pv_mFilter:focus-visible,input.pv_field:focus-visible,select.pv_field:focus-visible,select.pv_msEff:focus-visible,a.pv_pcLink:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:1px}.pv_pcBody{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));padding:10px 18px 14px;display:flex;flex-direction:column;gap:4px}.pv_line .plan_tag{margin-left:0}.pv_line .pv_push{margin-left:auto}.pv_row>span:first-child{width:72px;flex:none}.pv_hint{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.pv_field{display:inline-flex;align-items:center;min-width:240px;max-width:100%;padding:6px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.pv_mBox{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;padding:0 14px;display:flex;flex-direction:column}.pv_mRight{margin-left:auto;display:inline-flex;align-items:center;gap:8px}.pv_iconBtn{border:0;background:0 0;cursor:pointer;font:inherit;font-size:15px;padding:3px 6px;border-radius:6px;color:var(--dsw-alias-label-tertiary)}.pv_iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.pv_delOn{color:#e03131;font-size:12px;width:auto;padding:2px 8px}.pv_delBox{display:inline-flex;gap:2px;align-items:center;padding:3px 5px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03))}.pv_delYes{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;color:#e03131;padding:3px 9px;border-radius:6px}.pv_delYes:hover{background:rgba(224,49,49,.12)}.pv_delNo{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);padding:3px 9px;border-radius:6px}.pv_delNo:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}@keyframes pvRot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.pv_spin{display:inline-block;animation:pvRot 1s linear infinite}.pv_toast{position:fixed;bottom:24px;right:24px;z-index:500;padding:10px 18px;border-radius:12px;font-size:13px;line-height:20px;max-width:min(420px,80vw);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}.pv_toastOk{color:#2f9e44}.pv_toastFail{color:#e03131}.pv_fresh{font-size:12px;line-height:18px;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}.pv_addBtn{width:100%;padding:13px;border:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.2));border-radius:14px;background:0 0;cursor:pointer;font:inherit;font-size:14px;color:var(--dsw-alias-label-secondary)}.pv_addBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.03))}input.pv_field{cursor:text}select.pv_field{cursor:pointer}input.pv_ro{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));color:var(--dsw-alias-label-tertiary);cursor:default}input.pv_key{background:var(--dsw-alias-bg-layer-1,#fff);border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}.pv_actRow{display:flex;gap:10px;align-items:center;padding:8px 0 4px}.pv_pick{flex:1;min-width:0;position:relative}.pv_pickBtn{width:100%;cursor:pointer;justify-content:space-between;gap:8px}.pv_pickMenu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:250;padding:6px;display:flex;flex-direction:column;gap:4px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}.pv_pickList{max-height:240px;overflow:auto;display:flex;flex-direction:column}.pv_pickItem{display:flex;align-items:center;gap:6px;padding:8px 12px;border:0;background:0 0;cursor:pointer;font:inherit;font-size:13.5px;color:var(--dsw-alias-label-primary);text-align:left;border-radius:8px}.pv_pickItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04))}.pv_pickItem:disabled{opacity:.5;cursor:default}.pv_pickEmpty{padding:12px;font-size:13px;color:var(--dsw-alias-label-tertiary);text-align:center}.pv_msRow{display:flex;align-items:center;gap:8px}.pv_msMain{flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-align:left}select.pv_msEff{flex:none;font:inherit;font-size:12px;padding:3px 8px;cursor:pointer;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-secondary)}.pv_tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));margin-bottom:14px}.pv_tab{font:inherit;font-size:14px;padding:8px 14px;border:0;background:0 0;cursor:pointer;color:var(--dsw-alias-label-secondary);border-bottom:2px solid transparent;margin-bottom:-1px}.pv_tab:hover{color:var(--dsw-alias-label-primary)}.pv_tabOn{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary,#3b5bdb);font-weight:600}.pv_pcLead{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}.pv_pcLeadRow{display:flex;align-items:center;gap:8px}.pv_pcLink{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv_pcLink:hover{color:var(--dsw-alias-label-secondary);text-decoration:underline}.pv_mRow{position:relative;display:flex;align-items:center;gap:8px;padding:3px 0}.pv_mId{flex:none;width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,Menlo,Consolas,monospace}.pv_mName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv_mHeadRow{display:flex;align-items:center;gap:8px;padding:5px 0 4px;font-size:12px;color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}.pv_mCaps{flex:none;width:100px;display:inline-flex;justify-content:flex-end;align-items:center;gap:6px}.pv_mCtx{flex:none;width:56px;text-align:right;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.pv_capIcons{display:inline-flex;gap:6px;font-size:12px;line-height:16px}.pv_capMini{font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;white-space:nowrap}.pv_mHead{display:flex;align-items:center;gap:6px;flex:1;min-width:0;font:inherit;font-size:13px;font-weight:600;line-height:18px;padding:0;border:0;background:0 0;cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left}.pv_mHead:hover{color:var(--dsw-alias-label-secondary)}.pv_mTop{display:flex;align-items:center;gap:8px;height:38px;padding:0}.pv_mCaretCol{flex:none;width:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--dsw-alias-label-tertiary)}.pv_mCaretCol:hover{color:var(--dsw-alias-label-secondary)}.pv_mList{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));margin-top:0;padding-top:6px;display:flex;flex-direction:column}.pv_mFilter{flex:none;width:240px;box-sizing:border-box;padding:5px 24px 5px 12px;font:inherit;font-size:13px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;outline:0;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}.pv_mFilter:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}.pv_fbox{position:relative;display:inline-flex;align-items:center;flex:none}.pv_fclear{position:absolute;right:2px;top:50%;transform:translateY(-50%);border:0;background:0 0;cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:2px 6px;color:var(--dsw-alias-label-tertiary);border-radius:6px}.pv_fclear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.pv_tip{display:none;position:absolute;left:0;bottom:calc(100% + 6px);z-index:300;width:270px;padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));flex-direction:column;gap:6px}.pv_mRow:hover .pv_tip{display:flex}.pv_tipTitle{font-size:13px;font-weight:600;line-height:18px}.pv_tipRow{display:flex;gap:10px;font-size:12px;line-height:18px}.pv_tipLabel{flex:none;width:60px;color:var(--dsw-alias-label-tertiary)}.pv_tipDim{font-size:11px;color:var(--dsw-alias-label-tertiary)}.pv_tipCaps{display:flex;gap:6px;flex-wrap:wrap}.pv_cap{font-size:11px;padding:1px 8px;border-radius:999px}.pv_capVision{color:#2f9e44;background:rgba(47,158,68,.12)}.pv_capVideo{color:#7c3aed;background:rgba(124,58,237,.12)}.pv_capReason{color:#b8860b;background:rgba(217,162,0,.15)}.pv_capDeclared{color:#0b7285;background:rgba(11,114,133,.12)}.pv_meOpen{flex:none;margin-left:0;height:26px;padding:0 10px;font-size:12px}.pv_me{display:flex;flex-direction:column;gap:8px;padding:10px 0 4px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12))}.pv_meHead{display:flex;align-items:center;gap:10px}.pv_meTitle{font-size:13px;font-weight:600;line-height:18px}.pv_meList{display:flex;flex-direction:column;max-height:320px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px}.pv_meRow{display:flex;align-items:center;gap:8px;padding:5px 8px;font-size:12px;line-height:18px;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}.pv_meRow:last-child{border-bottom:0}.pv_meRowOff{opacity:.45}.pv_meCheck{flex:none;margin:0;cursor:pointer}.pv_meIdBox{flex:none;display:inline-flex;align-items:center;gap:6px;width:220px;min-width:0}.pv_meIdBox .pv_mId{max-width:150px}.pv_meName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}.pv_meNum{flex:none;width:96px;box-sizing:border-box;padding:3px 8px;font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:7px;outline:0;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}.pv_meNum:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}.pv_meCap{flex:none;display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:var(--dsw-alias-label-tertiary);user-select:none}.pv_meCap input{margin:0;cursor:pointer}.pv_meAdd{display:flex;align-items:center;gap:8px}.pv_meActs{display:flex;align-items:center;gap:8px}.pv_mask{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42);padding:24px}.pv_modal{width:min(520px,100%);box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:18px 20px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent,0 18px 48px rgba(0,0,0,.28))}.pv_modalTitle{font-size:14px;font-weight:600;line-height:20px}.pv_modalRow{display:flex;gap:12px;font-size:12px;line-height:19px}.pv_modalLabel{flex:none;width:80px;color:var(--dsw-alias-label-tertiary)}.pv_modalValue{flex:1 1 auto;min-width:0;word-break:break-word}.pv_modalWarn{font-size:12px;line-height:18px;padding:8px 10px;border-radius:8px;color:#a33;background:rgba(217,83,79,.12)}.pv_modalActs{display:flex;justify-content:flex-end;gap:10px;margin-top:2px}.pv_dangerBtn{color:#fff !important;background:#d9534f !important;border-color:#d9534f !important}.pv_dangerBtn:disabled{opacity:.6;cursor:default}";
		var tagId = "dsh-llm-provider/plan.css";
		/**
		* 挂样式：手写 style 标签（带 data-plugin-css 标记，重复调用幂等）。
		*
		* 不走官方 styles.insert：那个服务要 inject 'styles'，本插件没 inject 它，取 ctx.styles
		* 会直接抛（见 index.ts apply 里的注释）。手写标签是等价实现——静态插件运行时本来也只有
		* 这一条路。
		*/
		function installCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-llm-provider";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		/** 测试环境标识：标题加「· 测试」后缀 + favicon 右下角盖橙色「测」角标。 */
		function markTestEnv() {
			try {
				if (document.title.indexOf("测试") === -1) document.title = (document.title === "" ? "dsh" : document.title) + " · 测试";
				var iconLink = document.querySelector("link[rel~=\"icon\"]");
				var img = new window.Image();
				img.onload = function() {
					var canvas = document.createElement("canvas");
					canvas.width = 64;
					canvas.height = 64;
					var g = canvas.getContext("2d");
					if (g !== null && g !== void 0) {
						g.drawImage(img, 0, 0, 64, 64);
						g.fillStyle = "#e8890c";
						g.beginPath();
						g.arc(46, 46, 20, 0, Math.PI * 2);
						g.fill();
						g.fillStyle = "#ffffff";
						g.font = "bold 24px sans-serif";
						g.textAlign = "center";
						g.textBaseline = "middle";
						g.fillText("测", 46, 48);
						setFavicon(canvas.toDataURL("image/png"));
						return;
					}
					setFavicon(void 0);
				};
				img.onerror = function() {
					setFavicon(void 0);
				};
				img.src = iconLink === null ? "/favicon.ico" : iconLink.href;
			} catch (cause) {}
		}
		/** 替换 favicon；dataUrl 为 undefined 时退到一个纯「测」字圆形 icon。 */
		function setFavicon(dataUrl) {
			try {
				var link = document.querySelector("link[rel~=\"icon\"]");
				if (link === null || link === void 0) {
					link = document.createElement("link");
					link.rel = "icon";
					document.head.appendChild(link);
				}
				if (dataUrl !== void 0) {
					link.href = dataUrl;
					return;
				}
				link.href = "data:image/svg+xml," + encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><circle cx=\"32\" cy=\"32\" r=\"30\" fill=\"#e8890c\"/><text x=\"32\" y=\"43\" font-size=\"30\" font-weight=\"bold\" fill=\"#fff\" text-anchor=\"middle\">测</text></svg>");
			} catch (cause) {}
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-llm-provider 浏览器端入口。
		*
		* 挂在 composer 的 `conversation.input.model` 座位：模型选择器（当前模型 + 思考强度）。
		* 额度数据来自宿主端同源路由 `GET /plan/status`；
		* 当前 provider 从会话投影读；切换通过同源 /api/session/selectModel RPC 提交。
		*
		* 模块划分（都在这一个目录下，客户端打包时全部内联成一个 lib/client.js）：
		*   types.ts     —— 宿主/自家路由下发 JSON 的就地声明
		*   format.ts    —— 纯格式化/匹配工具（无 react、无网络，离线可测）
		*   data.ts      —— 同源 HTTP/RPC、额度快照缓存、目录/投影的读与归一化
		*   model-seat.ts—— conversation.input.model 座位组件
		*   settings.ts  —— 设置页 Provider 标签 + 桥接明细纯函数
		*   command.ts   —— /model 命令注册
		*   styles.ts    —— CSS 与样式挂载、测试环境角标
		*   i18n.ts      —— 翻译（官方 locale 优先，本地字典兜底）
		*   icons.ts     —— 官方图标库的 SVG 拷贝
		*   diag.ts      —— window.__dshLlmProvider 诊断
		*
		* lib/client.js 由 tsdown 产出（见 tsdown.config.ts 的 client 段），外面那层
		* window.__ModuleLoader__.load 外壳是构建配置里的 banner/footer/intro，源码里不写。
		*/
		/**
		* 需要的客户端服务：座位注册表 + 会话。
		* `remote` / `remote.session` 是官方目录服务内部要用的：其方法被绑定到调用方上下文，
		* 少声明就会在 directoryFor 里报 "cannot get property remote.session without inject"。
		*/
		var inject = [
			"slots",
			"sessions",
			"remote",
			"remote.session",
			"locale"
		];
		function apply(ctx) {
			installCss();
			try {
				if (ctx.styles !== void 0 && ctx.styles !== null && typeof ctx.styles.insert === "function") recordDiagnostic("styles", "styles.insert");
				else recordDiagnostic("styles", "fallback-style-tag");
			} catch (cause) {
				recordDiagnostic("styles", "fallback-style-tag");
			}
			recordDiagnostic("applied", (/* @__PURE__ */ new Date()).toISOString());
			setT(localT);
			try {
				if (ctx.locale !== void 0 && ctx.locale !== null && typeof ctx.locale.register === "function") {
					try {
						ctx.locale.register("dsh-llm-provider", LOCAL_DICT);
					} catch (dup) {}
					if (typeof ctx.locale.bind === "function") {
						var bound = ctx.locale.bind("dsh-llm-provider");
						setT(function(key) {
							var value = bound(key);
							return value === key ? localT(key) : value;
						});
					}
				}
			} catch (cause) {
				var failure = cause;
				recordDiagnostic("locale", String(failure && failure.message ? failure.message : cause));
			}
			loadProviderStatus().then(function(status) {
				if (status && status.testMode === true) markTestEnv();
			}).catch(function() {});
			var modelDirectories;
			ctx.inject(["modelDirectories"], function(scope) {
				modelDirectories = scope.modelDirectories;
				recordDiagnostic("modelDirectories", modelDirectories === void 0 ? "undefined" : "ok");
			});
			var sessionsFace = ctx.sessions;
			recordDiagnostic("sessions", sessionsFace === void 0 ? "undefined" : "ok");
			/**
			* 座位/徽标的 inject 面：把官方目录服务包装成组件能用的只读数据 + 两个动作。
			* @param sessionId - 座位所在的会话。
			*/
			function directoryFace(sessionId) {
				if (modelDirectories === void 0 || typeof modelDirectories.directoryFor !== "function") {
					recordDiagnostic("face", {
						reason: "no-service",
						sessionId: String(sessionId)
					});
					return {
						sessionId,
						sessions: sessionsFace
					};
				}
				try {
					var directory = modelDirectories.directoryFor(sessionId);
					recordDiagnostic("face", {
						reason: "ok",
						sessionId: String(sessionId)
					});
					return {
						sessionId,
						sessions: sessionsFace,
						directory: directory.store,
						load: function() {
							directory.load().catch(function() {});
						},
						select: function(selection) {
							return directory.select(selection).then(function() {
								return true;
							}, function() {
								return false;
							});
						}
					};
				} catch (cause) {
					var failure = cause;
					recordDiagnostic("face", {
						reason: "threw",
						sessionId: String(sessionId),
						message: failure && failure.message ? String(failure.message) : String(cause)
					});
					return {
						sessionId,
						sessions: sessionsFace
					};
				}
			}
			ctx.slots.inject("conversation.input.model", function() {
				return ctx.slots.register({
					name: "conversation.input.model",
					id: "provider-model-seat",
					priority: -10,
					inject: directoryFace
				}, ModelSwitchSeat);
			});
			ctx.slots.inject("settings.section", function() {
				return ctx.slots.register({
					name: "settings.section",
					id: "provider",
					order: 15,
					label: function() {
						return t("nav");
					}
				}, ProviderSettingsSection);
			});
			ctx.inject(["commandUi"], function(scope) {
				registerModelCommand(scope);
			});
		}
		//#endregion
		exports.LEGACY_PROVIDER_ALIASES = LEGACY_PROVIDER_ALIASES;
		exports.aliasSelection = aliasSelection;
		exports.apply = apply;
		exports.defaultEffortOf = defaultEffortOf;
		exports.detailKey = detailKey;
		exports.detailsOfProvider = detailsOfProvider;
		exports.dropPlanAccount = dropPlanAccount;
		exports.headlineChips = headlineChips;
		exports.inject = inject;
		exports.lookupDetail = lookupDetail;
		exports.mergePlanAccount = mergePlanAccount;
		exports.normalizeSelection = normalizeSelection;
		exports.onPlanChange = onPlanChange;
		exports.piAiBridgeRows = piAiBridgeRows;
		exports.piAiUpstreamText = piAiUpstreamText;
		exports.presetPickState = presetPickState;
		exports.reasoningTextOf = reasoningTextOf;
		exports.refreshFailure = refreshFailure;
		exports.resetCountdownText = resetCountdownText;
		exports.shortWindowLabel = shortWindowLabel;
		return module.exports;
	}
});

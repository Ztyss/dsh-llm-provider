import { asRecord, readNumber } from "../types.js";
//#region src/adapters/shared.ts
/**
* 计费适配器的共享工具与统一契约。
*
* 每个适配器一个文件，互相不依赖；对外只暴露 {@link BillingAdapter} 一个对象。
* 加新 provider = 照 deepseek.ts 写一个文件 + 在 registry.ts 注册一行。
*
* 类型在这里一次定死：适配器的返回值直接下发给浏览器渲染，形状错了在编译期就报，
* 不用等到界面上少一行。
*/
const TIMEOUT_MS = 12e3;
/** 带超时的请求 + JSON 解析；HTTP 状态和响应体一起返回。 */
async function getJson(url, headers = {}, init = {}) {
	const response = await fetch(url, {
		...init,
		headers,
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	const text = await response.text();
	let body = text;
	try {
		body = JSON.parse(text);
	} catch {}
	return {
		status: response.status,
		body
	};
}
/** 上游把业务错误塞在 200 响应里（GLM 就是这样），统一转成异常。 */
function fail(message) {
	throw new Error(message);
}
/** 字符串数字也认。 */
function num(value) {
	return readNumber(value);
}
/** 由 limit/remaining 反推剩余百分比，比上游的 percentage 字段可靠（那个字段是"已用"）。 */
function percentLeftOf(limit, remaining) {
	if (limit === void 0 || remaining === void 0 || limit <= 0) return void 0;
	return Math.max(0, Math.min(100, Math.round(remaining / limit * 1e3) / 10));
}
/** 上游直接给"剩余百分比"时用：裁剪到 0-100 并保留一位小数。 */
function clampPercent(value) {
	const n = num(value);
	if (n === void 0) return void 0;
	return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}
/** 401/403 统一文案：凭据失效类错误，和瞬时网络错误 / 业务错误区分开。 */
function authFailed(status) {
	return `凭据无效或过期（HTTP ${String(status)}）`;
}
/** 上游时间字段有 ISO 字符串，也有 epoch 毫秒，统一成 ISO。 */
function asIso(value) {
	if (typeof value === "string" && value !== "") return value;
	return epochMsToIso(value);
}
function epochMsToIso(value) {
	const ms = num(value);
	if (ms === void 0 || ms <= 0) return void 0;
	return new Date(ms).toISOString();
}
/** 从 baseURL 取 origin；给的是 OpenAI 兼容路径也无所谓，只要域名对。 */
function originOf(baseUrl) {
	if (baseUrl === void 0 || baseUrl === "") return void 0;
	try {
		return new URL(baseUrl).origin;
	} catch {
		return;
	}
}
function formatAmount(value, currency) {
	const n = num(value);
	if (n === void 0) return String(value ?? "—");
	if (currency === "USD" || currency === "usd") return `$${n.toFixed(2)}`;
	return `¥${n.toFixed(2)}`;
}
/** 上游把错误信息放在各种字段里，尽量提取出人能读的那句。 */
function describeHttpError(status, body) {
	const record = asRecord(body);
	const message = asRecord(record["error"])["message"] ?? record["message"] ?? record["msg"] ?? (typeof body === "string" ? body.slice(0, 200) : void 0);
	return `HTTP ${String(status)}${message === void 0 ? "" : `: ${String(message)}`}`;
}
/** 组装一份标准的 AccountStatus 骨架，适配器往里填字段。 */
function account(id, displayName, kind, fields = {}) {
	return {
		id,
		displayName,
		kind,
		authConfigured: true,
		balances: [],
		windows: [],
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
		...fields
	};
}
//#endregion
export { TIMEOUT_MS, account, asIso, authFailed, clampPercent, describeHttpError, epochMsToIso, fail, formatAmount, getJson, num, originOf, percentLeftOf };

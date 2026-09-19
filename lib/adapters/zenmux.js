import { asRecord } from "../types.js";
import { account, authFailed, clampPercent, describeHttpError, fail, getJson, num, originOf } from "./shared.js";
//#region src/adapters/zenmux.ts
/**
* ZenMux：GET {base_url} 本身——配置的 baseURL 就是用量端点，直接带 Bearer 请求。
* 端点规格来自 CC Switch（coding_plan.rs）。
* 响应：success 必须为 true；data.quota_5_hour / data.quota_7_day 两个窗口，
*   usage_percentage 是 0-1 小数（要 ×100 才是已用百分比），resets_at 是 ISO 字符串，
*   used_value_usd / max_value_usd 是美元计价的已用/上限。
* 套餐等级在 data.plan.tier，账户状态在 data.account_status，拼进 membership。
*/
function zenmuxWindow(label, data) {
	if (data === void 0 || data === null) return void 0;
	const record = asRecord(data);
	const usedPercentRaw = num(record["usage_percentage"]);
	const usedPct = clampPercent(usedPercentRaw !== void 0 ? usedPercentRaw * 100 : void 0);
	if (usedPct === void 0) return void 0;
	const used = num(record["used_value_usd"]);
	const limit = num(record["max_value_usd"]);
	return {
		window: label,
		limit,
		used,
		remaining: limit !== void 0 && used !== void 0 ? Math.max(0, limit - used) : void 0,
		percentLeft: clampPercent(100 - usedPct),
		resetAt: typeof record["resets_at"] === "string" && record["resets_at"] !== "" ? record["resets_at"] : void 0
	};
}
var zenmux_default = {
	id: "zenmux",
	label: "ZenMux",
	match(providerId, baseUrl) {
		if (/^zenmux/i.test(providerId)) return true;
		return typeof baseUrl === "string" && baseUrl.includes("zenmux");
	},
	async query({ id, displayName, key, baseUrl }) {
		if (typeof baseUrl !== "string" || baseUrl === "") fail("ZenMux 的查询端点就是 baseURL 本身，需要配置 baseURL 才能查额度");
		const { status, body } = await getJson(baseUrl, { authorization: `Bearer ${key}` });
		if (status === 401 || status === 403) fail(authFailed(status));
		if (status !== 200) fail(describeHttpError(status, body));
		const record = asRecord(body);
		if (record["success"] !== true) fail(`ZenMux 业务错误：${String(record["message"] ?? "success 不为 true")}`);
		if (record["data"] === void 0 || record["data"] === null) fail("响应缺少 data 字段");
		const data = asRecord(record["data"]);
		const windows = [zenmuxWindow("5 小时窗口", data["quota_5_hour"]), zenmuxWindow("7 天窗口", data["quota_7_day"])].filter((w) => w !== void 0);
		const plan = asRecord(data["plan"]);
		const tier = typeof plan["tier"] === "string" ? plan["tier"] : "";
		const accountStatus = typeof data["account_status"] === "string" ? data["account_status"] : "";
		return account(id, displayName, "quota", {
			baseUrl: originOf(baseUrl) ?? baseUrl,
			membership: [tier, accountStatus].filter((s) => s !== "").join(" · "),
			windows,
			...windows.length === 0 ? { note: "响应里没有可解析的额度窗口" } : {}
		});
	}
};
//#endregion
export { zenmux_default as default };

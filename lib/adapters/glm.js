import { asRecord } from "../types.js";
import { account, describeHttpError, epochMsToIso, fail, getJson, num, originOf, percentLeftOf } from "./shared.js";
//#region src/adapters/glm.ts
/**
* GLM Coding Plan：GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
* 没有官方文档，端点由多个开源项目交叉验证，本地实测可用。
* 坑：鉴权失败时它照样返回 HTTP 200，错误在 body 里（{"code":1001,"success":false}），
*     所以必须先看 body.success/code，再看状态码。
* 鉴权：Authorization 直接放 key，不带 Bearer 前缀（与 CC Switch 的智谱实现一致；
*     团队版是同一路径加 ?type=2，再额外带 bigmodel-organization / bigmodel-project
*     两个头，本插件的单 key 契约暂只覆盖个人版）。
* limits[]：type=CREDIT_LIMIT；unit/number 给窗口长度（3/5 = 5 小时，6/1 = 周），
*     unit=5 是 MCP 月度窗口；percentage 是"已用百分比"。
*/
/** GLM 窗口长度：unit 3 = 小时，6 = 周，5 = 月，4 = 天。 */
function windowLabel(unit, number) {
	if (unit === 3 && number !== void 0) return `${String(number)} 小时窗口`;
	if (unit === 6) return "每周窗口";
	if (unit === 5) return "每月窗口";
	if (unit === 4) return "每天窗口";
	return `窗口 unit=${String(unit)} n=${String(number)}`;
}
var glm_default = {
	id: "glm",
	label: "GLM Coding（智谱）",
	match(providerId, baseUrl) {
		if (/^zai|^zhipu|^glm|^bigmodel/i.test(providerId)) return true;
		if (typeof baseUrl !== "string") return false;
		return baseUrl.includes("bigmodel.cn") || baseUrl.includes("z.ai");
	},
	async query({ id, displayName, key, baseUrl }) {
		const origin = originOf(baseUrl) ?? "https://open.bigmodel.cn";
		const { status, body } = await getJson(`${origin}/api/monitor/usage/quota/limit`, {
			authorization: key,
			"content-type": "application/json"
		});
		if (status !== 200) fail(describeHttpError(status, body));
		const record = asRecord(body);
		if (record["success"] === false || typeof record["code"] === "number" && record["code"] !== 200) fail(`鉴权或配额查询失败：${String(record["msg"] ?? record["message"] ?? `code ${String(record["code"])}`)}`);
		const windows = [];
		const mcp = [];
		const data = asRecord(record["data"]);
		const limits = Array.isArray(data["limits"]) ? data["limits"] : [];
		for (const raw of limits) {
			const entry = asRecord(raw);
			const unit = num(entry["unit"]);
			const number = num(entry["number"]);
			const usage = num(entry["usage"]);
			const remainingRaw = num(entry["remaining"]);
			const used = num(entry["currentValue"]) ?? (usage !== void 0 && remainingRaw !== void 0 ? usage - remainingRaw : void 0);
			const remaining = remainingRaw ?? (usage !== void 0 && used !== void 0 ? Math.max(0, usage - used) : void 0);
			const row = {
				window: windowLabel(unit, number),
				limit: usage,
				used,
				remaining,
				percentLeft: percentLeftOf(usage, remaining),
				resetAt: epochMsToIso(entry["nextResetTime"])
			};
			if (unit === 5 && number === 1) mcp.push(row);
			else windows.push(row);
		}
		const level = data["level"];
		return account(id, displayName, "quota", {
			baseUrl: origin,
			...typeof level === "string" ? { membership: level } : {},
			windows: windows.length > 0 ? windows : mcp,
			...windows.length === 0 && mcp.length > 0 ? { note: "只拿到 MCP 月度窗口，Coding Plan 额度窗口未返回" } : {}
		});
	}
};
//#endregion
export { glm_default as default };

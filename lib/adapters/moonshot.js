import { asRecord } from "../types.js";
import { account, authFailed, describeHttpError, fail, formatAmount, getJson } from "./shared.js";
//#region src/adapters/moonshot.ts
/**
* Kimi 开放平台（原 Moonshot 开放平台）：GET /v1/users/me/balance
* 文档：https://platform.kimi.com/docs/api/balance（国内站 .cn / 国际站 .ai，key 不互通）
* 返回 data.available_balance / voucher_balance / cash_balance（人民币元）。
* 注意：sk-（开放平台按量）和 sk-kimi-（Coding Plan）是两个产品，key 不通用——
*      实测用 Coding Plan key 调本接口返回 401。
*/
var moonshot_default = {
	id: "moonshot",
	label: "Moonshot 开放平台",
	match(providerId, baseUrl) {
		if (/^moonshot|^kimi$/i.test(providerId)) return true;
		return typeof baseUrl === "string" && baseUrl.includes("moonshot.");
	},
	async query({ id, displayName, key, baseUrl }) {
		const host = typeof baseUrl === "string" && baseUrl.includes(".ai") ? "api.moonshot.ai" : "api.moonshot.cn";
		const { status, body } = await getJson(`https://${host}/v1/users/me/balance`, { authorization: `Bearer ${key}` });
		if (status === 401 || status === 403) fail(authFailed(status) + "（国内 .cn / 国际 .ai 的 key 不通用，注意配对站点）");
		if (status !== 200) fail(describeHttpError(status, body));
		const record = asRecord(body);
		if (record["status"] !== true || record["code"] !== 0) fail(`上游返回失败：code=${String(record["code"])} scode=${String(record["scode"] ?? "-")} status=${String(record["status"])}`);
		const data = asRecord(record["data"]);
		const balances = [];
		if (data["available_balance"] !== void 0) balances.push({
			label: "可用余额",
			value: formatAmount(data["available_balance"], "CNY")
		});
		if (data["voucher_balance"] !== void 0) balances.push({
			label: "代金券",
			value: formatAmount(data["voucher_balance"], "CNY")
		});
		if (data["cash_balance"] !== void 0) balances.push({
			label: "现金余额",
			value: formatAmount(data["cash_balance"], "CNY")
		});
		return account(id, displayName, "balance", { balances });
	}
};
//#endregion
export { moonshot_default as default };

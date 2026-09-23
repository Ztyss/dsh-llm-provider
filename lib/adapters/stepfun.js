import { asRecord, readString } from "../types.js";
import { account, authFailed, clampPercent, describeHttpError, fail, formatAmount, getJson, num, originOf, percentLeftOf } from "./shared.js";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
//#region src/adapters/stepfun.ts
/**
* StepFun 开放平台（阶跃星辰）：双通道额度查询。
*
* 通道一（API key，无需 cookie）：GET /v1/accounts —— 预付费钱包余额
*   （balance / total_cash_balance / total_voucher_balance，人民币元）。
*
* 通道二（可选，控制台 cookie）：POST /api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit
*   —— Step Plan 套餐点数：credit_buckets 的 total/residual、subscription_credit_left_rate、
*   重置时间，五小时/周窗口按 plan_family 有则展示。
*
*   控制台接口是 WAF 保护的内部 RPC，有两道坎：
*   1. Bearer API key 会被网关拒（403 api key not permitted），必须 Oasis 会话 cookie；
*   2. node fetch 直接调会被客户端指纹判 "oasis-token is embezzled"，curl（System32
*      自带，Schannel TLS）可以通过——所以走 spawnSync curl + `-o` 文件输出，不碰管道
*      （electron 沙禁禁止管道捕获，stdio:'ignore' + 落盘，同 updater 的 tar 先例）。
*
*   cookie 来源：凭据 <apiKeyEnv 去掉 _API_KEY>_CONSOLE_COOKIE（如 STEPFUN_CONSOLE_COOKIE），
*   值 = 控制台任意请求的整串 Cookie 头；index.ts 解析后经 extras.consoleCookie 传入。
*   缺失或失效自动降级：钱包余额照常，plan 窗口缺失并在 note 里说明怎么补。
*/
const CONSOLE_ORIGIN = "https://platform.stepfun.com";
const PLAN_RATE_LIMIT_RPC = CONSOLE_ORIGIN + "/api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit";
/** curl 可执行文件：先试 PATH（Git curl / 类Unix 自带），Windows 兜底 System32（Win10 1803+ 自带 Schannel 版）。 */
function curlBin() {
	if (spawnSync("curl", ["--version"], {
		stdio: "ignore",
		timeout: 5e3
	}).status === 0) return "curl";
	if (process.platform === "win32") return join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "curl.exe");
	return "curl";
}
/** 秒级 epoch（字符串/数字都认）→ ISO；无效给 undefined。 */
function isoFromEpochSec(value) {
	const sec = num(value);
	return sec !== void 0 && sec > 0 ? (/* @__PURE__ */ new Date(sec * 1e3)).toISOString() : void 0;
}
/** QueryStepPlanRateLimit 响应 → 套餐点数窗口（纯函数，可离线测试）。 */
function planWindowsFrom(body) {
	const record = asRecord(body);
	const plan = asRecord(record["plan_credit_rate_limit"]);
	const windows = [];
	for (const raw of Array.isArray(plan["credit_buckets"]) ? plan["credit_buckets"] : []) {
		const bucket = asRecord(raw);
		const total = Number(bucket["credit_total"]);
		const residual = Number(bucket["credit_residual"]);
		if (!isFinite(total) || !isFinite(residual)) continue;
		windows.push({
			window: "Step Plan 套餐点数" + (bucket["type"] !== void 0 ? "（bucket " + String(bucket["type"]) + "）" : ""),
			limit: total,
			remaining: residual,
			percentLeft: percentLeftOf(total, residual)
		});
	}
	const resetAt = isoFromEpochSec(plan["subscription_credit_reset_time"]);
	if (resetAt !== void 0 && windows.length > 0) windows[windows.length - 1].resetAt = resetAt;
	const fiveLeft = clampPercent(plan["five_hour_usage_left_rate"]);
	const fiveReset = isoFromEpochSec(plan["five_hour_usage_reset_time"]);
	if (fiveReset !== void 0 || fiveLeft !== void 0 && fiveLeft > 0) windows.push({
		window: "5 小时窗口",
		percentLeft: fiveLeft,
		resetAt: fiveReset
	});
	const weekLeft = clampPercent(plan["weekly_usage_left_rate"]);
	const weekReset = isoFromEpochSec(plan["weekly_usage_reset_time"]);
	if (weekReset !== void 0 || weekLeft !== void 0 && weekLeft > 0) windows.push({
		window: "每周窗口",
		percentLeft: weekLeft,
		resetAt: weekReset
	});
	return windows;
}
/**
* 带控制台 cookie 走 curl 查套餐点数。
* @returns 窗口列表；任何一步失败返回 undefined（调用方降级，不阻塞钱包余额）。
*/
function planQuotaViaCurl(cookie) {
	const outPath = join(tmpdir(), "stepfun-plan-out.json");
	try {
		if (spawnSync(curlBin(), [
			"-s",
			"--max-time",
			String(Math.ceil(12)),
			"-o",
			outPath,
			"--url",
			PLAN_RATE_LIMIT_RPC,
			"-H",
			"accept: */*",
			"-H",
			"connect-protocol-version: 1",
			"-H",
			"content-type: application/json",
			"-b",
			cookie,
			"-H",
			"oasis-appid: 10300",
			"-H",
			"oasis-platform: web",
			"-H",
			"origin: " + CONSOLE_ORIGIN,
			"-H",
			"referer: " + CONSOLE_ORIGIN + "/account-overview",
			"-H",
			"user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
			"--data-raw",
			"{}"
		], {
			stdio: "ignore",
			timeout: 17e3
		}).status !== 0) return void 0;
		const windows = planWindowsFrom(JSON.parse(readFileSync(outPath, "utf8")));
		return windows.length > 0 ? { windows } : void 0;
	} catch {
		return;
	} finally {
		try {
			rmSync(outPath, { force: true });
		} catch {}
	}
}
var stepfun_default = {
	id: "stepfun",
	label: "StepFun 开放平台",
	match(providerId, baseUrl) {
		if (/^stepfun/i.test(providerId)) return true;
		return typeof baseUrl === "string" && /stepfun\.(com|ai)/i.test(baseUrl);
	},
	async query({ id, displayName, key, baseUrl, extras }) {
		const origin = originOf(baseUrl);
		const base = origin !== void 0 && /stepfun\.(com|ai)/i.test(origin) ? origin : "https://api.stepfun.com";
		const { status, body } = await getJson(`${base}/v1/accounts`, { authorization: `Bearer ${key}` });
		if (status === 401 || status === 403) fail(authFailed(status));
		if (status !== 200) fail(describeHttpError(status, body));
		const record = asRecord(body);
		const balances = [];
		if (record["balance"] !== void 0) balances.push({
			label: "剩余余额",
			value: formatAmount(record["balance"], "CNY")
		});
		if (record["total_cash_balance"] !== void 0) balances.push({
			label: "现金余额",
			value: formatAmount(record["total_cash_balance"], "CNY")
		});
		if (record["total_voucher_balance"] !== void 0) balances.push({
			label: "赠金",
			value: formatAmount(record["total_voucher_balance"], "CNY")
		});
		const consoleCookie = readString(extras["consoleCookie"]);
		const windows = [];
		let planNote;
		if (consoleCookie !== void 0 && consoleCookie !== "") {
			const plan = planQuotaViaCurl(consoleCookie);
			if (plan !== void 0) windows.push(...plan.windows);
			else planNote = "Step Plan 点数查询失败：控制台 cookie 可能已失效，请更新 CONSOLE_COOKIE 凭据（控制台请求的整串 Cookie 头）";
		} else planNote = "查看 Step Plan 套餐点数：添加 CONSOLE_COOKIE 凭据（值为控制台请求的整串 Cookie 头）";
		return account(id, displayName, windows.length > 0 ? "quota" : "balance", {
			baseUrl: base,
			balances,
			windows,
			websiteUrl: "https://platform.stepfun.com",
			note: [balances.length === 0 ? "钱包响应里没有 balance 字段" : void 0, planNote].filter(Boolean).join("；") || void 0
		});
	}
};
//#endregion
export { stepfun_default as default, planWindowsFrom };

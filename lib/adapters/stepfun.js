import { resolveDshHome } from "../dsh-home.js";
import { asRecord, readString } from "../types.js";
import { TIMEOUT_MS, account, authFailed, clampPercent, describeHttpError, fail, formatAmount, getJson, num, originOf, percentLeftOf } from "./shared.js";
import { loadCookieValue, saveCookieValue } from "./cookie-store.js";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
//#region src/adapters/stepfun.ts
/**
* StepFun 开放平台（阶跃星辰）：双通道额度查询，按 API 地址自动选择。
*
* 通道判定（用户需求：根据实际 API 地址选择查询方式）：
*   - baseURL 含 step_plan（openai 的 /step_plan/v1、anthropic 的 /step_plan 都算，域名限 api.stepfun.com）
*     → **Step Plan 通道**：查套餐点数，不走钱包；
*   - 其余（https://api.stepfun.com/v1、anthropic 裸域 https://api.stepfun.com）
*     → **钱包通道**：GET /v1/accounts —— 预付费钱包余额（剩余/现金/赠金，人民币元）。
*
* Step Plan 通道的四道坎与解法：
*   1. Bearer API key 会被网关拒（403 api key not permitted），必须 Oasis 会话 cookie；
*   2. node fetch 直接调会被客户端指纹判 "oasis-token is embezzled"，curl（System32
*      自带，Schannel TLS）可以通过——spawnSync curl + `-o` 文件输出，不碰管道
*      （electron 沙禁禁止管道捕获，stdio:'ignore' + 落盘，同 updater 的 tar 先例）；
*   3. 会话段（Oasis-Token 前半）只有 30 分钟寿命，过期时网关回 "token is expired"——
*      **自动续期**：调 passport 的 RefreshToken（/passport/ 前缀，account 网关不通），
*      用 pair 里的 27 天长效段换新 pair（实测过期 pair 也能换），失败才显式报错；
*   4. 报错要精确：expired → 「Cookie 已过期」；illegal/embezzled → 「Cookie 无效或
*      校验失败」（用户批注：不要静默降级，也不要笼统的「无适配器」）。
*
* 会话持久化：`$DSH_HOME/llm-provider-bridge/cookies.yaml`（统一 Cookie 存储，
* 键 = 凭据 ref 名，见 adapters/cookie-store.ts）。种子来自「查询配置」写入的
* CONSOLE_COOKIE 凭据（extras.consoleCookie 优先），续期轮换后的新 pair 写回该文件，
* 长效段 27 天内无需人工干预。旧版单槽 stepfun-console-session.json 首次读取自动
* 迁移进新文件后移除。
*/
const CONSOLE_ORIGIN = "https://platform.stepfun.com";
const PLAN_RATE_LIMIT_RPC = CONSOLE_ORIGIN + "/api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit";
const REFRESH_RPC = CONSOLE_ORIGIN + "/passport/proto.api.passport.v1.PassportService/RefreshToken";
/** curl 可执行文件：先试 PATH（Git curl / 类Unix 自带），Windows 兜底 System32（Win10 1803+ 自带 Schannel 版）。 */
function curlBin() {
	if (spawnSync("curl", ["--version"], {
		stdio: "ignore",
		timeout: 5e3
	}).status === 0) return "curl";
	if (process.platform === "win32") return join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "curl.exe");
	return "curl";
}
/** 旧版单槽会话文件（cookies.yaml 出现前的形态）：{"cookie":"<整串 Cookie 头>"}。 */
function legacySessionFile() {
	return join(resolveDshHome(), "llm-provider-bridge", "stepfun-console-session.json");
}
function readLegacySession() {
	try {
		return readString(asRecord(JSON.parse(readFileSync(legacySessionFile(), "utf8")))["cookie"]);
	} catch {
		return;
	}
}
/** 用刷新响应轮换 jar 里的 Oasis-Token 段（长效段跟着一起换）。 */
function withRotatedToken(jar, rotatedPair) {
	if (!jar.includes("Oasis-Token=")) return jar;
	const replaced = jar.replace(/Oasis-Token=[^;]*/, () => "Oasis-Token=" + rotatedPair);
	return replaced === jar ? jar : replaced;
}
/** 秒级 epoch（字符串/数字都认）→ ISO；无效给 undefined。 */
function isoFromEpochSec(value) {
	const sec = num(value);
	return sec !== void 0 && sec > 0 ? (/* @__PURE__ */ new Date(sec * 1e3)).toISOString() : void 0;
}
/** QueryStepPlanRateLimit 响应 → 套餐点数窗口（纯函数，可离线测试）。 */
function planWindowsFrom(body) {
	const record = asRecord(typeof body === "string" ? JSON.parse(body) : body);
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
* 失败响应 → 人能读的原因（纯函数，可离线测试）。
* 网关的错误体形如 {"code":"unauthenticated","message":"auth failed: token is expired"}：
*   - expired  → Cookie 已过期（会话段 30 分钟寿命，触发自动续期前置条件）
*   - illegal / embezzled → Cookie 无效或被设备绑定校验拦下
*   - 其余 → 原样透出 message / 原文片段
*/
function planFailureNote(bodyText) {
	let message = "";
	try {
		const record = asRecord(JSON.parse(bodyText));
		const inner = asRecord(record["error"]);
		message = String(inner["message"] ?? record["message"] ?? record["desc"] ?? "");
	} catch {
		message = "";
	}
	if (message.includes("expired")) return "Cookie 已过期：请点「查询配置」重新保存控制台 Cookie";
	if (message.includes("illegal") || message.includes("embezzled")) return "Cookie 无效或校验失败：请点「查询配置」重新保存控制台 Cookie";
	const short = bodyText.slice(0, 120);
	return "Step Plan 点数查询失败：" + (message !== "" ? message : short !== "" ? short : "空响应");
}
/** 通用 curl POST（JSON，输出落文件；stdio:'ignore' 避开 electron 沙禁的管道捕获）。 */
function curlPostJson(url, cookie, body, outPath) {
	const headers = [
		"-H",
		"accept: */*",
		"-H",
		"connect-protocol-version: 1",
		"-H",
		"content-type: application/json",
		"-H",
		"oasis-appid: 10300",
		"-H",
		"oasis-platform: web",
		"-H",
		"origin: " + CONSOLE_ORIGIN,
		"-H",
		"user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
	];
	const args = [
		"-s",
		"--max-time",
		String(Math.ceil(TIMEOUT_MS / 1e3)),
		"-o",
		outPath,
		"--url",
		url,
		...headers
	];
	if (cookie !== void 0 && cookie !== "") args.push("-b", cookie);
	args.push("--data-raw", body);
	return spawnSync(curlBin(), args, {
		stdio: "ignore",
		timeout: TIMEOUT_MS + 5e3
	}).status === 0;
}
/** 查套餐点数。成功 = 窗口；失败 = note（分类好的文案）。 */
function planQuotaViaCurl(cookie) {
	const outPath = join(tmpdir(), "stepfun-plan-out.json");
	try {
		if (!curlPostJson(PLAN_RATE_LIMIT_RPC, cookie, "{}", outPath)) return {
			windows: [],
			note: "Step Plan 点数查询失败：curl 未执行成功"
		};
		const text = readFileSync(outPath, "utf8");
		if (text.includes("\"plan_credit_rate_limit\"")) return { windows: planWindowsFrom(JSON.parse(text)) };
		return {
			windows: [],
			note: planFailureNote(text)
		};
	} catch (error) {
		return {
			windows: [],
			note: "Step Plan 点数查询失败：" + (error instanceof Error ? error.message : String(error))
		};
	} finally {
		try {
			rmSync(outPath, { force: true });
		} catch {}
	}
}
/**
* 用 pair 的长效段换新会话：POST /passport/.../RefreshToken（空体，服务端从 cookie 读 pair）。
* @returns 轮换后的整串 Cookie 头；失败 undefined。
*/
function refreshSession(jar) {
	const outPath = join(tmpdir(), "stepfun-refresh-out.json");
	try {
		if (!curlPostJson(REFRESH_RPC, jar, "{}", outPath)) return void 0;
		const body = asRecord(JSON.parse(readFileSync(outPath, "utf8")));
		const access = readString(asRecord(body["accessToken"])["raw"]);
		const refresh = readString(asRecord(body["refreshToken"])["raw"]);
		if (access === void 0 || refresh === void 0) return void 0;
		return withRotatedToken(jar, access + "..." + refresh);
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
		return typeof baseUrl === "string" && /stepfun\.com/i.test(baseUrl);
	},
	queryConfigNeeded(baseUrl) {
		return typeof baseUrl === "string" && baseUrl.includes("api.stepfun.com") && /step_plan/i.test(baseUrl);
	},
	async query({ id, displayName, key, baseUrl, extras }) {
		const origin = originOf(baseUrl);
		const isPlanChannel = /step_plan/i.test(baseUrl ?? "");
		const base = origin !== void 0 && /stepfun\.com/i.test(origin) ? origin : "https://api.stepfun.com";
		if (isPlanChannel) {
			const consoleCookie = readString(extras["consoleCookie"]);
			const ref = readString(extras["consoleCookieRef"]) ?? id.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_CONSOLE_COOKIE";
			const seed = consoleCookie !== void 0 && consoleCookie.includes("Oasis-Token=") ? consoleCookie : void 0;
			let cookie = seed ?? loadCookieValue(ref, {
				path: legacySessionFile(),
				read: readLegacySession
			});
			if (cookie === void 0 || cookie === "") return account(id, displayName, "quota", {
				baseUrl: CONSOLE_ORIGIN,
				balances: [],
				windows: [],
				websiteUrl: "https://platform.stepfun.com",
				note: "查询方式为 Step Plan：请点「查询配置」保存控制台 Cookie 后刷新"
			});
			if (seed !== void 0) saveCookieValue(ref, seed);
			let plan = planQuotaViaCurl(cookie);
			if (plan.note !== void 0) {
				const rotated = refreshSession(cookie);
				if (rotated !== void 0) {
					saveCookieValue(ref, rotated);
					cookie = rotated;
					plan = planQuotaViaCurl(cookie);
				}
			}
			if (plan.note !== void 0) fail(plan.note);
			return account(id, displayName, "quota", {
				baseUrl: CONSOLE_ORIGIN,
				balances: [],
				windows: plan.windows,
				websiteUrl: "https://platform.stepfun.com"
			});
		}
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
		return account(id, displayName, "balance", {
			baseUrl: base,
			balances,
			websiteUrl: "https://platform.stepfun.com",
			note: balances.length === 0 ? "响应里没有 balance 字段" : void 0
		});
	}
};
//#endregion
export { stepfun_default as default, planFailureNote, planWindowsFrom, withRotatedToken };

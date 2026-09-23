import { resolveDshHome } from "../dsh-home.js";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
//#region src/adapters/cookie-store.ts
/**
* 统一 Cookie 存储：`$DSH_HOME/llm-provider-bridge/.cookies.yaml`（点前缀隐藏，对齐
* `.credentials.yaml` 习惯；只认这一个文件，不做曾用名兼容——用户批注 09-24）。
*
* 设计（用户批注 09-23：参考 .credentials.yaml，所有 cookie 值存一个文件，方便以后
* 适配更多 provider / 更多 cookie）：
*   - 范式对齐 .credentials.yaml：顶层 `version` + 扁平键值表；
*   - 键 = 凭据 ref 名（如 `STEPFUN_CONSOLE_COOKIE`，由路由 ID 派生）——与「查询配置」
*     写入的凭据一一对应，新 provider / 新 cookie 直接加键；
*   - 每条 `{ value, updatedAt, seedSha? }`：value 是整串 Cookie 头；updatedAt 记最近一次
*     写入（种子保存或续期轮换）；seedSha 记最近一次「种子凭据」的指纹——同一凭据的
*     后续刷新不再重复落种（否则轮换 pair 被静态凭据反复覆盖，文件每次刷新都变）；
*   - 解析只支持本文件手写子集（两空格键 + value/updatedAt/seedSha 行），值一律 JSON 双引号
*     标量（合法 YAML，转义由 JSON.stringify 保证）；手改文件时容忍注释、单引号、
*     裸标量，解析不出的行跳过——坏行不炸查询；
*   - 旧版单槽 JSON 会话文件（stepfun-console-session.json）由调用方经
*     readCookieEntry 的 legacy 参数迁移：首次读取自动并入新文件，写成功后移除旧文件。
*/
function cookieStoreFile() {
	return join(resolveDshHome(), "llm-provider-bridge", ".cookies.yaml");
}
/** 行内标量：JSON 双引号 → 原样解析；单引号 → YAML 转义（'' → '）；其余当裸标量。 */
function parseScalar(text) {
	const t = text.trim();
	if (t === "") return void 0;
	if (t.startsWith("\"")) try {
		const value = JSON.parse(t);
		return typeof value === "string" ? value : void 0;
	} catch {
		return;
	}
	if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
	return t;
}
/**
* 解析存储文本 → ref → 条目（纯函数，可离线测试）。
* 只认顶层 `cookies:` 段；缺 value 的键视为残缺、丢弃；坏行跳过不抛。
*/
function parseCookieStore(text) {
	const out = {};
	let inCookies = false;
	let current = null;
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const indent = rawLine.length - rawLine.trimStart().length;
		if (indent === 0) {
			inCookies = line === "cookies:";
			current = null;
			continue;
		}
		if (!inCookies) continue;
		if (indent <= 2) {
			const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/);
			current = keyMatch !== null ? keyMatch[1] : null;
			continue;
		}
		if (current === null) continue;
		const fieldMatch = line.match(/^(value|updatedAt|seedSha):\s*(.*)$/);
		if (fieldMatch === null) continue;
		const parsed = parseScalar(fieldMatch[2]);
		if (parsed === void 0) continue;
		const entry = out[current] ?? (out[current] = { value: "" });
		if (fieldMatch[1] === "value") entry.value = parsed;
		else if (parsed !== "") {
			if (fieldMatch[1] === "updatedAt") entry.updatedAt = parsed;
			else entry.seedSha = parsed;
		}
	}
	for (const key of Object.keys(out)) if (out[key].value === "") delete out[key];
	return out;
}
/** 序列化 → 存储文本（键按字母序，输出确定性强、便于 diff）。纯函数。 */
function serializeCookieStore(entries) {
	const lines = ["version: 1", "cookies:"];
	for (const key of Object.keys(entries).sort()) {
		lines.push("  " + key + ":");
		lines.push("    value: " + JSON.stringify(entries[key].value));
		lines.push("    updatedAt: " + JSON.stringify(entries[key].updatedAt ?? ""));
		if (entries[key].seedSha !== void 0) lines.push("    seedSha: " + JSON.stringify(entries[key].seedSha));
	}
	return lines.join("\n") + "\n";
}
function readStoreAt(path) {
	try {
		return parseCookieStore(readFileSync(path, "utf8"));
	} catch {
		return {};
	}
}
/** 读现存存储（只认 `.cookies.yaml`；坏行容忍）。 */
function readStore() {
	return readStoreAt(cookieStoreFile());
}
/** 种子凭据指纹：sha256 前 16 位（同一凭据去重判断用）。 */
function hashCookieValue(value) {
	return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
/**
* 读某 ref 的完整条目（含 seedSha）。新存储没有时按调用方给的 legacy 源迁移
* （stepfun 旧版单槽 JSON）：并入后移除；写失败保留旧文件，下次再迁（幂等）。
*/
function readCookieEntry(ref, legacy) {
	const existing = readStore()[ref];
	if (existing !== void 0 && existing.value !== "") return existing;
	if (legacy === void 0) return void 0;
	const value = legacy.read();
	if (value === void 0 || value === "") return void 0;
	if (writeCookieValue(ref, value) !== true) return { value };
	try {
		rmSync(legacy.path, { force: true });
	} catch {}
	return {
		value,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/**
* 写某 ref 的 cookie 值（读-改-写合并，不动其它 provider 的键）。
* @param seedSha 种子凭据指纹：续期轮换写带上它（轮换值是同一种子的派生 lineage），
*        纯值写省略即丢弃。
* @returns 是否落盘成功（false = 安全区只读等；调用方本轮用内存值即可）。
*/
function writeCookieValue(ref, value, seedSha) {
	try {
		const entries = readStore();
		const entry = {
			value,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		if (seedSha !== void 0 && seedSha !== "") entry.seedSha = seedSha;
		entries[ref] = entry;
		mkdirSync(join(resolveDshHome(), "llm-provider-bridge"), { recursive: true });
		writeFileSync(cookieStoreFile(), serializeCookieStore(entries));
		return true;
	} catch {
		return false;
	}
}
//#endregion
export { cookieStoreFile, hashCookieValue, parseCookieStore, readCookieEntry, serializeCookieStore, writeCookieValue };

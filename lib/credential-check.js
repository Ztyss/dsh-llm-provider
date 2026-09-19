import { createHash } from "node:crypto";
//#region src/credential-check.ts
/**
* 凭据体检：发现「多个 provider 用同一把 key」这类几乎肯定是填错的情况。
*
* 为什么放在插件里：dsh 的 credentials 层只负责存/取，不做跨 ref 的一致性检查，
* 而配置 UI 又永远拿不到 key 的值（describe 只返回 configured/source/writable），
* 所以这种错误在官方界面上的表现只是「某个 provider 一直查询失败」，看不出原因。
* 我们在宿主端本来就要 resolve 各家的 key，顺手比对一次，零额外成本。
*
* 只输出结论（谁和谁是同一个值），绝不把 key 值带出这个模块。
*/
/**
* 找出共用同一把 key 的 provider。
* @param resolved - 已解析的凭据列表；value 只在函数内参与比对。
* @returns 每个受影响 provider 一条结论。
*/
function findSharedCredentials(resolved) {
	const byDigest = /* @__PURE__ */ new Map();
	const refByProvider = /* @__PURE__ */ new Map();
	for (const entry of resolved) {
		if (typeof entry?.value !== "string" || entry.value === "") continue;
		refByProvider.set(entry.provider, entry.ref);
		const digest = createHash("sha256").update(entry.value).digest("hex");
		const group = byDigest.get(digest);
		if (group === void 0) byDigest.set(digest, [entry.provider]);
		else group.push(entry.provider);
	}
	const warnings = [];
	for (const providers of byDigest.values()) {
		if (providers.length < 2) continue;
		for (const provider of providers) {
			const others = providers.filter((other) => other !== provider);
			warnings.push({
				provider,
				reason: "shared-credential",
				message: `这个 provider 用的 key 和 ${others.join("、")} 完全相同（凭据名 ${String(refByProvider.get(provider))}），几乎可以肯定填错了`,
				others
			});
		}
	}
	return warnings;
}
//#endregion
export { findSharedCredentials };

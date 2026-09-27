import { asRecord } from "./types.js";
import { account, formatAmount } from "./adapters/shared.js";
//#region src/official-account.ts
/**
* 官方账号（deepseek-account）的额度行：纯映射层。
*
* 这条路由不在 llm-pi-ai 里、没有 apiKeyEnv——凭据在内核账号平台（dsh-deepseek-account-platform）
* 的登录态里，余额要调 deepseekAccount 服务的 getBalance（账号设置页同一条官方通道）。
* 服务获取（运行时取、缺席即无此行）在 src/index.ts 的 officialAccountRow；本文件只放
* 「getBalance 结果 → 账户行」的纯映射，离线测试直接吃 lib/official-account.js
* （与 kernel-compat 同一模式：不 import index.js，避免模块加载期拖起桥接）。
*/
/** 官方账号在额度快照里的固定 id；模型选择器的分组 id 与它一致（modlens 包装组走前缀回退）。 */
const OFFICIAL_ACCOUNT_ID = "deepseek-account";
/**
* getBalance 结果 → 账户行。
*
* 三种入参形态（官方 typert schema，dsh-api-account-controller#account/getBalance）：
*   - `null` = 未登录 → undefined，快照自然没有这一行（chip 维持无数字的现状）；
*   - `{status:'failed'}` = 平台查询失败（平台侧网络/协议，非凭据问题）→ 行 + error 文案；
*   - `{status:'ready', value: wallet[]}` = 普通钱包余额 → kind 'balance'，按币种格式化。
*     赠送钱包（bonusWallets）不进 chip：那是活动赠额，官方账号页有专门展示。
*/
function accountRowFromBalance(result, fetchedAt, usageUrl) {
	if (result === null || result === void 0) return void 0;
	const record = asRecord(result);
	const shared = {
		fetchedAt,
		websiteUrl: usageUrl,
		deletable: false
	};
	if (record["status"] !== "ready") return account(OFFICIAL_ACCOUNT_ID, "DeepSeek Account", "quota", {
		...shared,
		error: "账号平台查询失败（非凭据问题，稍后可重试）"
	});
	const wallets = Array.isArray(record["value"]) ? record["value"] : [];
	return account(OFFICIAL_ACCOUNT_ID, "DeepSeek Account", "balance", {
		...shared,
		balances: wallets.map((raw) => {
			const wallet = asRecord(raw);
			const currency = wallet["currency"];
			return {
				label: String(currency ?? "CNY"),
				value: formatAmount(wallet["balance"], currency)
			};
		})
	});
}
//#endregion
export { OFFICIAL_ACCOUNT_ID, accountRowFromBalance };

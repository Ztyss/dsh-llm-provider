import { account } from "./shared.js";
//#region src/adapters/qwen.ts
/**
* 没有公开额度接口的 provider（Qwen Token Plan）：不发请求，卡片上给控制台跳转链接。
*
* 为什么没有：阿里官方 FAQ 只让去百炼控制台看用量，官方 CLI 的 `bl usage token-plan`
* 声明 auth: "console"（要控制台 token），sk-sp- 只是推理凭证，而且个人版条款禁止自动化调用。
* 如果哪天找到可用接口，照 deepseek.js 的样子写一个新适配器替换这个兜底即可。
*/
var qwen_default = {
	id: "qwen-unsupported",
	label: "Qwen Token Plan",
	match(providerId, baseUrl) {
		if (/^qwen-token-plan|^qwen-sp|^token-plan/i.test(providerId)) return true;
		return typeof baseUrl === "string" && (baseUrl.includes("maas.aliyuncs.com") || baseUrl.includes("dashscope"));
	},
	async query({ id, displayName, baseUrl }) {
		return account(id, displayName, "unsupported", {
			authConfigured: true,
			baseUrl,
			consoleUrl: "https://bailian.console.aliyun.com/"
		});
	}
};
//#endregion
export { qwen_default as default };

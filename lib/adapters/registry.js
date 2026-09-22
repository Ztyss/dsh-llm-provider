import adapter from "./deepseek.js";
import glm_default from "./glm.js";
import kimi_coding_default from "./kimi-coding.js";
import minimax_default from "./minimax.js";
import moonshot_default from "./moonshot.js";
import opencode_go_default from "./opencode-go.js";
import openrouter_default from "./openrouter.js";
import qwen_default from "./qwen.js";
import stepfun_default from "./stepfun.js";
import zenmux_default from "./zenmux.js";
//#region src/adapters/registry.ts
/**
* 适配器注册表：顺序即优先级（先匹配先用）。
*
* 加新 provider = 在 lib/adapters/ 下加一个文件（照 deepseek.js 抄结构），
* 在这里 import + push 一行，完事。match() 认 provider id 或 baseURL。
*/
const adapters = [
	adapter,
	kimi_coding_default,
	moonshot_default,
	glm_default,
	minimax_default,
	opencode_go_default,
	zenmux_default,
	openrouter_default,
	qwen_default,
	stepfun_default
];
/** 按 provider id（必要时兜 baseURL）找适配器。 */
function findAdapter(providerId, baseUrl) {
	for (const adapter of adapters) try {
		if (adapter.match(providerId, baseUrl)) return adapter;
	} catch {}
}
//#endregion
export { adapters, findAdapter };

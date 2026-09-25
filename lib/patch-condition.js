//#region src/patch-condition.ts
/**
* bundle patch 的条件禁用表达式（P0 修复的核心）。
*
* 事故（2026-09-18 日志实证）：`cordis.patch.yml` 里用**静态** `disabled: true`
* 禁掉官方 `llm-pi-ai`。一旦宿主那份 pi-ai 的内容缺失（`dist/` 被清空），官方条目
* 已被本插件禁掉、桥接又建不起来，宿主报
*   failed to import loader entry llm-pi-ai (@deepseek-ai/dsh-llm-pi-ai):
*   Cannot find package '...pi-ai\index.js'
* 整棵插件树加载失败 —— DSH 直接起不来，用户只能卸载插件。静态禁用把一次
* 「依赖缺失」放大成了「宿主不可启动」。
*
* 修法：loader 的 `disabled` 原生支持 `!!js <表达式>`（实测求值链路
* `Entry.update` → `Entry._disabled` → `Entry.disabledOf`(378 行) →
* `Entry.evaluate`(381 行) → `evaluate`(`with (ctx) { return eval(expr) }`)）。
* 于是把「禁用官方条目」改成**有条件**的：只有**确认 pi-ai 真能加载**才禁用。
* 语义上宁可用不了，也不能起不来。
*
* 表达式运行环境的硬约束（全部实测，不是推测）：
*   1. **没有 `require` / `module`**（`typeof require === 'undefined'`），
*      只能用全局对象 `process`；`process.getBuiltinModule()` 可用；
*   2. **表达式抛错 = 整棵插件树加载失败**（实验：抛错后启动直接失败），
*      所以整体必须 try/catch 包住，任何异常都收敛成 `false`（不禁用）；
*   3. 值必须是布尔：`disabledOf` 只做 `Boolean(...)`。
*
* 内核 0.1.7 适配（handoff 2026-09-25）：
*   0.1.7 起官方 pi-ai 的 Config 变 `.volatile()`（`config.providers.get()` 响应式
*   访问器，按**条目自己的命名空间**读用户路由），桥接透传的旧语义 config 再也吃不到
*   用户的 `llm-pi-ai.providers` —— 实测 `no adapter serves provider "zai-coding-cn"`。
*   与其继续桥接（要 duck-type 官方内部形态，脆），不如**放行原生 llm-pi-ai 行**：
*   它的 volatile config 天然吃用户的 `llm-pi-ai.providers`，适配器注册由内核原生完成；
*   本插件在 0.1.7+ 只做额度查询 / provider 管理 / 模型选择器接管（这三样不依赖桥接）。
*   因此 `llm-pi-ai` 的禁用条件多一截：**内核 >= 0.1.7 → 不禁用**（其余三条照旧）。
*   版本读不出来时按旧内核处理（维持既有桥接行为，对现网零变化）。
*/
/** 生成 loader `disabled:` 用的一行表达式；求值 `true` 表示「禁用官方条目」。 */
function piAiGuardExpression() {
	return [
		"(()=>{",
		"try{",
		"const fs=process.getBuiltinModule?process.getBuiltinModule(\"node:fs\"):null;",
		"if(!fs||typeof fs.existsSync!==\"function\")return false;",
		"const sep=process.platform===\"win32\"?\"\\\\\":\"/\";",
		"const spec=\"node_modules\"+sep+\"@earendil-works\"+sep+\"pi-ai\";",
		"const starts=[];",
		"if(process.argv&&typeof process.argv[1]===\"string\")starts.push(process.argv[1]);",
		"if(typeof process.execPath===\"string\")starts.push(process.execPath);",
		"for(const start of starts){",
		"let dir=start;",
		"for(let hop=0;hop<12;hop+=1){",
		"const cut=Math.max(dir.lastIndexOf(\"/\"),dir.lastIndexOf(\"\\\\\"));",
		"if(cut<=0)break;",
		"dir=dir.slice(0,cut);",
		"const root=dir+sep+spec;",
		"if(fs.existsSync(root+sep+\"package.json\")&&fs.existsSync(root+sep+\"dist\"+sep+\"index.js\"))return true",
		"}",
		"}",
		"return false",
		"}catch{",
		"return false",
		"}",
		"})()"
	].join("");
}
/** 版本号是否 >= 0.1.7（原生 volatile 语义时代）。解析失败返回 false。可离线单测。 */
function isNativeEraVersion(version) {
	if (typeof version !== "string") return false;
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
	if (m === null) return false;
	const maj = Number(m[1]);
	const min = Number(m[2]);
	const patch = Number(m[3]);
	return maj > 0 || min > 1 || min === 1 && patch >= 7;
}
/**
* `llm-pi-ai` 行的禁用表达式：内核 >= 0.1.7（原生 volatile 时代）**不禁用**——
* 原生行自己吃用户的 llm-pi-ai.providers；旧内核维持「pi-ai 可加载才禁用」的桥接接管。
*/
function llmPiAiDisabledExpression() {
	return [
		"(()=>{",
		"try{",
		"const fs=process.getBuiltinModule?process.getBuiltinModule(\"node:fs\"):null;",
		"if(!fs||typeof fs.readFileSync!==\"function\"||typeof fs.existsSync!==\"function\")return false;",
		"const sep=process.platform===\"win32\"?\"\\\\\":\"/\";",
		"const pkg=\"node_modules\"+sep+\"@deepseek-ai\"+sep+\"dsh\"+sep+\"package.json\";",
		"const starts=[];",
		"if(process.argv&&typeof process.argv[1]===\"string\")starts.push(process.argv[1]);",
		"if(typeof process.execPath===\"string\")starts.push(process.execPath);",
		"for(const start of starts){",
		"let dir=start;",
		"for(let hop=0;hop<12;hop+=1){",
		"const cut=Math.max(dir.lastIndexOf(\"/\"),dir.lastIndexOf(\"\\\\\"));",
		"if(cut<=0)break;",
		"dir=dir.slice(0,cut);",
		"const root=dir+sep+pkg;",
		"if(fs.existsSync(root)){",
		"let native=false;",
		"try{const v=JSON.parse(fs.readFileSync(root,\"utf8\")).version;",
		"if(typeof v===\"string\"){const m=/^(\\d+)\\.(\\d+)\\.(\\d+)/.exec(v.trim());if(m)native=Number(m[1])>0||Number(m[2])>1||(Number(m[2])===1&&Number(m[3])>=7)",
		"}}catch{}",
		"if(native)return false;",
		"break;",
		"}",
		"}",
		"}",
		"const spec=\"node_modules\"+sep+\"@earendil-works\"+sep+\"pi-ai\";",
		"for(const start of starts){",
		"let dir=start;",
		"for(let hop=0;hop<12;hop+=1){",
		"const cut=Math.max(dir.lastIndexOf(\"/\"),dir.lastIndexOf(\"\\\\\"));",
		"if(cut<=0)break;",
		"dir=dir.slice(0,cut);",
		"const root=dir+sep+spec;",
		"if(fs.existsSync(root+sep+\"package.json\")&&fs.existsSync(root+sep+\"dist\"+sep+\"index.js\"))return true",
		"}",
		"}",
		"return false",
		"}catch{",
		"return false",
		"}",
		"})()"
	].join("");
}
//#endregion
export { isNativeEraVersion, llmPiAiDisabledExpression, piAiGuardExpression };

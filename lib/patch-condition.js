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
* 判据为什么是「宿主 pi-ai 可加载」而不是「插件桥接已就绪」：
*   patch 求值发生在 create 阶段，早于插件 apply（实测堆栈在 `Entry.update`），
*   此刻桥接状态还不存在，只能依据**文件系统事实**判断。
*   而 pi-ai 可加载正是「禁掉官方条目不会让树变脆」的充分理由。
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
//#endregion
export { piAiGuardExpression };

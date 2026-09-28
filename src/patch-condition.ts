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
export function piAiGuardExpression(): string {
  return [
    '(()=>{',
    'try{',
    'const fs=process.getBuiltinModule?process.getBuiltinModule("node:fs"):null;',
    'if(!fs||typeof fs.existsSync!=="function")return false;',
    'const sep=process.platform==="win32"?"\\\\":"/";',
    'const spec="node_modules"+sep+"@earendil-works"+sep+"pi-ai";',
    'const starts=[];',
    'if(process.argv&&typeof process.argv[1]==="string")starts.push(process.argv[1]);',
    'if(typeof process.execPath==="string")starts.push(process.execPath);',
    'for(const start of starts){',
    'let dir=start;',
    'for(let hop=0;hop<12;hop+=1){',
    'const cut=Math.max(dir.lastIndexOf("/"),dir.lastIndexOf("\\\\"));',
    'if(cut<=0)break;',
    'dir=dir.slice(0,cut);',
    'const root=dir+sep+spec;',
    'if(fs.existsSync(root+sep+"package.json")&&fs.existsSync(root+sep+"dist"+sep+"index.js"))return true',
    '}',
    '}',
    'return false',
    '}catch{',
    'return false',
    '}',
    '})()',
  ].join('')
}

/** 版本号是否 >= 0.1.7（原生 volatile 语义时代）。解析失败返回 false。可离线单测。 */
export function isNativeEraVersion(version: unknown): boolean {
  if (typeof version !== 'string') return false
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (m === null) return false
  const maj = Number(m[1])
  const min = Number(m[2])
  const patch = Number(m[3])
  return maj > 0 || min > 1 || (min === 1 && patch >= 7)
}

/**
 * `llm-pi-ai` 行的禁用表达式：内核 >= 0.1.7（原生 volatile 时代）**不禁用**——
 * 原生行自己吃用户的 llm-pi-ai.providers；旧内核维持「pi-ai 可加载才禁用」的桥接接管。
 */
export function llmPiAiDisabledExpression(): string {
  return hostProbeExpression('false', 'true', 'false')
}

/**
 * deepseek 基础路由的条件 base 声明表达式（insert 行 `config.providers` 的值）。
 *
 * ac0dcb5 曾按 0.1.7 场景整体移除 base 声明，但 0.1.5 系上用户 settings.yaml 常见
 * models-only 的 deepseek 条目——apiKeyEnv/api/baseURL 全靠插件 base 层字段级补全
 * （dsh-settings mergeLayers 是递归深合并），移除即卡片死掉（未配置 key / 查询失败 /
 * 没有凭据名，2026-09-28 实机回归）。修复：base 声明只在**桥接接管**时提供，判定与
 * {@link llmPiAiDisabledExpression} 同源（同一探测骨架）——内核 >= 0.1.7 返回 `{}`，
 * 官方 deepseek-account 登录态场景维持 ac0dcb5 决策；旧内核且 pi-ai 可加载返回完整
 * 声明；桥接建不起来（pi-ai 缺失）时同样返回 `{}`（不声明，与 P0 兜底哲学一致）。
 * 返回值是对象（config 值）；loader 对 config 里的 `!!js` 同样求值（实测：fiber 激活
 * 走 internal/config waterfall → interpolate）。
 */
export function deepseekBaseProvidersExpression(): string {
  const route = {
    displayName: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    api: 'openai-completions',
    baseURL: 'https://api.deepseek.com',
  }
  return hostProbeExpression('{}', JSON.stringify({ deepseek: route }), '{}')
}

/**
 * 宿主探测骨架：`llm-pi-ai` 行禁用条件与 {@link deepseekBaseProvidersExpression}
 * 共用同一套判定（读宿主 `@deepseek-ai/dsh` 版本判定 0.1.7，再探测
 * `@earendil-works/pi-ai` 可加载性），只有三个 return 点的值不同——两处语义必须
 * 联动（桥接接管 ⇔ 提供 base），共用骨架就是防漂移的手段。
 *
 * @param nativeEraReturn - 内核 >= 0.1.7 时的返回值。
 * @param bridgeReturn - 旧内核且 pi-ai 可加载（桥接接管）时的返回值。
 * @param fallbackReturn - 其余一切情况（版本读不出 / pi-ai 缺失 / 探测抛错）的返回值。
 */
function hostProbeExpression(nativeEraReturn: string, bridgeReturn: string, fallbackReturn: string): string {
  return [
    '(()=>{',
    'try{',
    'const fs=process.getBuiltinModule?process.getBuiltinModule("node:fs"):null;',
    `if(!fs||typeof fs.readFileSync!=="function"||typeof fs.existsSync!=="function")return ${fallbackReturn};`,
    'const sep=process.platform==="win32"?"\\\\":"/";',
    'const pkg="node_modules"+sep+"@deepseek-ai"+sep+"dsh"+sep+"package.json";',
    'const starts=[];',
    'if(process.argv&&typeof process.argv[1]==="string")starts.push(process.argv[1]);',
    'if(typeof process.execPath==="string")starts.push(process.execPath);',
    'for(const start of starts){',
    'let dir=start;',
    'for(let hop=0;hop<12;hop+=1){',
    'const cut=Math.max(dir.lastIndexOf("/"),dir.lastIndexOf("\\\\"));',
    'if(cut<=0)break;',
    'dir=dir.slice(0,cut);',
    'const root=dir+sep+pkg;',
    'if(fs.existsSync(root)){',
    'let native=false;',
    'try{const v=JSON.parse(fs.readFileSync(root,"utf8")).version;',
    'if(typeof v==="string"){const m=/^(\\d+)\\.(\\d+)\\.(\\d+)/.exec(v.trim());if(m)native=Number(m[1])>0||Number(m[2])>1||(Number(m[2])===1&&Number(m[3])>=7)',
    '}}catch{}',
    `if(native)return ${nativeEraReturn};`,
    'break;',
    '}',
    '}',
    '}',
    // 走到这里 = 旧内核（或版本读不出）：维持原判据——pi-ai 可加载才禁用（桥接接管）
    'const spec="node_modules"+sep+"@earendil-works"+sep+"pi-ai";',
    'for(const start of starts){',
    'let dir=start;',
    'for(let hop=0;hop<12;hop+=1){',
    'const cut=Math.max(dir.lastIndexOf("/"),dir.lastIndexOf("\\\\"));',
    'if(cut<=0)break;',
    'dir=dir.slice(0,cut);',
    'const root=dir+sep+spec;',
    `if(fs.existsSync(root+sep+"package.json")&&fs.existsSync(root+sep+"dist"+sep+"index.js"))return ${bridgeReturn}`,
    '}',
    '}',
    `return ${fallbackReturn}`,
    '}catch{',
    `return ${fallbackReturn}`,
    '}',
    '})()',
  ].join('')
}

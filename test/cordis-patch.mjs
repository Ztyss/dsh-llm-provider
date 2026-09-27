// cordis.patch.yml 的防回归检查。
//
// 三件连坐的事：
//   1. patch 禁用了内置 llm-deepseek。**DeepSeek 路由不再由本文件内置声明**（09-27 用户
//      决策：0.1.7+ 官方已有登录态 deepseek-account；API-key 版由用户在「模型服务」自行
//      添加）。此前插件 config 的 base 层会内置一条 deepseek 路由，用户删除后该路由按
//      pi-ai 目录默认值「复活」整套官方模型，违背删除预期——所以现在反过来：patch 里
//      **不允许**再出现 deepseek 基础声明，要走目录默认值得显式改这里的断言。
//   2. 本插件接管的那几个官方行必须都在禁用名单里。少一个的后果不是报错而是"两套并存"：
//      比如 ui-model-selection 没禁，官方就会再拉一份目录、再推一份 composer 置灰状态，
//      跟我们的状态机打架，而且只表现为偶发的显示不一致，很难追。
//   3. **禁用必须是有条件的**（P0 事故的教训）：静态 `disabled: true` 曾把一次
//      "宿主 pi-ai 内容缺失"放大成"DSH 起不来、只能卸载插件"。现在四条都走
//      `disabled: !!js <表达式>`，条件为假时官方条目自然保留，宿主照常启动。
//
// 只做文本检查（仓库不引 YAML 依赖，npm test 只跑 node 内置模块）。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const text = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : 'FAIL ') + name)
  if (!cond) failures += 1
}

/** 某个 id 是否被 `disabled: true` 静态禁掉（P0 的病因）。 */
function disabledStatically(id) {
  return new RegExp(`id:\\s*${id}\\s*\\n\\s*disabled:\\s*true\\s*(\\n|$)`).test(text)
}

/** 某个 id 是否走 `!!js` 条件禁用。 */
function disabledConditionally(id) {
  return new RegExp(`id:\\s*${id}\\s*\\n\\s*disabled:\\s*!!js\\s+\\S`).test(text)
}

const disablesDeepseek = disabledConditionally('llm-deepseek') || disabledStatically('llm-deepseek')
const declaresRoute = /providers:\s*\n\s*deepseek:/.test(text)

check('llm-pi-ai 走 !!js 条件禁用（pi-ai 不可用时官方条目保留）', disabledConditionally('llm-pi-ai'))
check('llm-deepseek 走 !!js 条件禁用', disabledConditionally('llm-deepseek'))
check('ui-model-selection 走 !!js 条件禁用', disabledConditionally('ui-model-selection'))
check('ui-settings-models 走 !!js 条件禁用', disabledConditionally('ui-settings-models'))

// 四条里任何一个退回静态 true，P0 就会复发。
check('没有任何官方条目被静态禁用（P0 防复发）',
  !disabledStatically('llm-pi-ai')
  && !disabledStatically('llm-deepseek')
  && !disabledStatically('ui-model-selection')
  && !disabledStatically('ui-settings-models'))

// 表达式必须自兜底：抛错会让整棵树加载失败，等同 P0。
const expressions = [...text.matchAll(/disabled:\s*!!js\s+(.+)/g)].map((m) => m[1].trim())
check('每条条件禁用都带 try/catch（表达式抛错 = 插件树加载失败）',
  expressions.length === 4 && expressions.every((e) => /try\s*\{/.test(e) && /catch/.test(e)))
check('表达式不依赖 require（求值作用域内没有 require，实测）',
  expressions.every((e) => !/\brequire\s*\(/.test(e)))

// 09-27 用户决策：不内置 deepseek 基础路由（官方已有登录态 deepseek-account；此前的基础
// 路由会在用户删除后按目录默认值复活整套官方模型，违背删除预期）。
check('patch 不再内置 deepseek 基础路由（09-27 决策防复发）', !declaresRoute)
check('patch 里也没有 deepseek 的 apiKeyEnv 声明', !/apiKeyEnv:\s*DEEPSEEK_API_KEY/.test(text))
check('llm-deepseek 的禁用理由注释已更新（不与新决策矛盾）', /登录态的 deepseek-account/.test(text))

console.log(failures === 0 ? '\npatch 层检查通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

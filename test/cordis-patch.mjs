// cordis.patch.yml 的防回归检查。
//
// 三件连坐的事：
//   1. patch 禁用了内置 llm-deepseek，DeepSeek 就只剩 pi-ai 的 deepseek 路由一条路，
//      而那条路由必须有人声明（插件 config 的 base 层）。万一有人删了 config 那块，
//      DeepSeek 会从模型列表里静默消失——没人会立刻发现。两者必须同时存在。
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

check('禁用 llm-deepseek 时必须自己声明 deepseek 路由', !disablesDeepseek || declaresRoute)
check('deepseek 路由声明在插件 config 里（不写宿主 settings）', /config:\s*\n\s*providers:\s*\n\s*deepseek:/.test(text))
check('路由声明带 apiKeyEnv（复用 DEEPSEEK_API_KEY 凭据）', /deepseek:[\s\S]{0,200}apiKeyEnv:\s*DEEPSEEK_API_KEY/.test(text))

console.log(failures === 0 ? '\npatch 层检查通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

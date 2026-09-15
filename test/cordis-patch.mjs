// cordis.patch.yml 的防回归检查。
//
// 这里有个连坐的坑：patch 禁用了内置 llm-deepseek，DeepSeek 就只剩 pi-ai 的
// deepseek 路由一条路，而那条路由必须有人声明（插件 config 的 base 层）。
// 万一有人删了 config 那块，DeepSeek 会从模型列表里静默消失——没人会立刻发现。
// 所以两者必须同时存在，这个测试就盯这件事。
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

const disablesDeepseek = /id:\s*llm-deepseek\s*\n\s*disabled:\s*true/.test(text)
const disablesPiAi = /id:\s*llm-pi-ai\s*\n\s*disabled:\s*true/.test(text)
const declaresRoute = /providers:\s*\n\s*deepseek:/.test(text)

check('禁用了内置 llm-pi-ai（桥接接管，否则路由重名抛 DUPLICATE_ADAPTER）', disablesPiAi)
check('禁用了内置 llm-deepseek（全世界只留 pi-ai 一套 adapter）', disablesDeepseek)
check('禁用 llm-deepseek 时必须自己声明 deepseek 路由', !disablesDeepseek || declaresRoute)
check('deepseek 路由声明在插件 config 里（不写宿主 settings）', /config:\s*\n\s*providers:\s*\n\s*deepseek:/.test(text))
check('路由声明带 apiKeyEnv（复用 DEEPSEEK_API_KEY 凭据）', /deepseek:[\s\S]{0,200}apiKeyEnv:\s*DEEPSEEK_API_KEY/.test(text))

console.log(failures === 0 ? '\npatch 层检查通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

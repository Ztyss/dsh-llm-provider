// cordis.patch.yml 里的条件表达式 == 源码生成器产出的那一份（防漂移）。
//
// 为什么单独测这一条：条件表达式有两个真相源——`src/patch-condition.ts`（可读、可测）
// 与 patch 文件（loader 真正读的那份）。手抄必然漂移，而漂移的后果正是 P0：
// patch 里躺着旧语义的表达式，没人发现，直到某次启动炸掉。
//
// 同时用**真实 loader 的 evaluate** 验证表达式在本机返回布尔值且不抛错——
// 表达式抛错会让整棵插件树加载失败，所以「不抛错」是硬要求。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : 'FAIL ') + name)
  if (!cond) failures += 1
}

const { piAiGuardExpression } = await import(pathToFileURL(join(root, 'lib', 'patch-condition.js')).href)
const expression = piAiGuardExpression()
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

check('patch 里逐字包含源码生成的条件表达式（无漂移）', patch.includes(expression))
check('表达式里没有 require（求值作用域内实测没有 require）', !/\brequire\s*\(/.test(expression))
check('表达式自带 try/catch 兜底', /try\s*\{/.test(expression) && /catch/.test(expression))

// 真实 loader 求值：只断言"不抛错 + 返回布尔"。
// 不去断言 true/false——那取决于本机 pi-ai 是否完好，会让测试变成环境的镜子。
try {
  const { evaluate } = await import('file:///D:/Software/DSH%20Desktop/resources/app/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js')
  let value
  let threw
  try {
    value = evaluate({ loader: {} }, expression)
  } catch (error) {
    threw = error
  }
  check('真实 loader 求值不抛错（抛错 = 插件树加载失败）', threw === undefined)
  check('求值结果是布尔值（disabledOf 只做 Boolean()）', typeof value === 'boolean')
  console.log(`       （本机求值结果：${String(value)}；true=会禁用官方条目）`)
} catch {
  console.log('  跳过：本机找不到 cordis-plugin-loader，无法做真实求值验证')
}

console.log(failures === 0 ? '\npatch 条件表达式检查通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

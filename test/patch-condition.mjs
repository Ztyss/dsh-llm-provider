// cordis.patch.yml 里的条件表达式 == 源码生成器产出的那一份（防漂移）。
//
// 为什么单独测这一条：条件表达式有两个真相源——`src/patch-condition.ts`（可读、可测）
// 与 patch 文件（loader 真正读的那份）。手抄必然漂移，而漂移的后果正是 P0：
// patch 里躺着旧语义的表达式，没人发现，直到某次启动炸掉。
//
// 同时用**真实 loader 的 evaluate** 验证表达式在本机返回布尔值且不抛错——
// 表达式抛错会让整棵插件树加载失败，所以「不抛错」是硬要求。
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : 'FAIL ') + name)
  if (!cond) failures += 1
}

const { piAiGuardExpression, llmPiAiDisabledExpression, deepseekBaseProvidersExpression, isNativeEraVersion } = await import(pathToFileURL(join(root, 'lib', 'patch-condition.js')).href)
const expression = piAiGuardExpression()
const llmPiAiExpression = llmPiAiDisabledExpression()
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

// 原生时代版本判定（与表达式内嵌的比较逻辑同口径）
check('0.1.5-rc.2 不是原生时代', isNativeEraVersion('0.1.5-rc.2') === false)
check('0.1.7-rc.1 是原生时代', isNativeEraVersion('0.1.7-rc.1') === true)
check('0.1.7 正式版是原生时代', isNativeEraVersion('0.1.7') === true)
check('0.1.6 不是', isNativeEraVersion('0.1.6') === false)
check('0.2.0 / 1.0.0 是', isNativeEraVersion('0.2.0') === true && isNativeEraVersion('1.0.0') === true)
check('垃圾输入不是', isNativeEraVersion('abc') === false && isNativeEraVersion(undefined) === false)

check('patch 里逐字包含源码生成的条件表达式（无漂移）', patch.includes(expression))
check('llm-pi-ai 行使用原生时代专用表达式（内核 >= 0.1.7 放行）', patch.includes(llmPiAiExpression) && llmPiAiExpression !== expression)
check('原生时代表达式带版本读取（readFileSync package.json）', llmPiAiExpression.includes('readFileSync') && llmPiAiExpression.includes('@deepseek-ai'))
check('原生时代表达式含 0.1.7 阈值比较', llmPiAiExpression.includes('Number(m[3])>=7'))
check('表达式里没有 require（求值作用域内实测没有 require）', !/\brequire\s*\(/.test(expression))
check('表达式自带 try/catch 兜底', /try\s*\{/.test(expression) && /catch/.test(expression))

// 真实 loader 求值：只断言"不抛错 + 返回布尔"。
// 不去断言 true/false——那取决于本机 pi-ai 是否完好，会让测试变成环境的镜子。
// ---- deepseek 基础路由的条件 base 声明（0.1.5 系回归修复）----
//
// ac0dcb5 按 0.1.7 场景移除了 base 声明，但 0.1.5 系上用户 settings.yaml 常见
// models-only 的 deepseek 条目，字段级补全全靠这层 base——移除即卡片死掉
// （未配置 key / 查询失败 / 没有凭据名）。修复语义：与 llm-pi-ai 行的禁用条件
// 同源——旧内核且桥接接管（pi-ai 可加载）才声明；内核 >= 0.1.7 返回 {}，
// 09-27 决策（不复活官方模型）在其场景内维持不变。
const deepseekExpr = deepseekBaseProvidersExpression()
const BASE_ROUTE = {
  displayName: 'DeepSeek',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  api: 'openai-completions',
  baseURL: 'https://api.deepseek.com',
}
check('deepseek base 表达式内嵌完整路由（JSON 形态四字段）',
  deepseekExpr.includes(JSON.stringify(BASE_ROUTE)))
check('deepseek base 表达式自带 try/catch 兜底', /try\s*\{/.test(deepseekExpr) && /catch/.test(deepseekExpr))
check('deepseek base 表达式里没有 require', !/\brequire\s*\(/.test(deepseekExpr))
check('patch 里逐字包含 deepseek base 表达式（无漂移）', patch.includes(deepseekExpr))

// 真实 loader 求值的三分支规格：自造假宿主树（版本号 + pi-ai 有无都是测试自己写的，
// 不是环境的镜子）。argv[1] 是表达式的爬升起点之一；execPath（node.exe）不在假树内。
function makeFakeHost(version, withPiAi) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-fakehost-'))
  mkdirSync(join(dir, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({ version }))
  if (withPiAi) {
    mkdirSync(join(dir, 'node_modules', '@earendil-works', 'pi-ai', 'dist'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', '@earendil-works', 'pi-ai', 'package.json'), '{}')
    writeFileSync(join(dir, 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'index.js'), '')
  }
  writeFileSync(join(dir, 'entry.mjs'), '')
  return join(dir, 'entry.mjs')
}

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
  let value2
  let threw2
  try {
    value2 = evaluate({ loader: {} }, llmPiAiExpression)
  } catch (error) {
    threw2 = error
  }
  check('llm-pi-ai 专用表达式真实求值不抛错', threw2 === undefined && typeof value2 === 'boolean')
  console.log(`       （本机求值结果：${String(value)} / ${String(value2)}；true=会禁用官方条目）`)

  // 三分支：返回值是对象（config 值，不是 disabled 布尔）。
  const evalAtHost = (expr, scriptPath) => {
    const oldArgv1 = process.argv[1]
    process.argv[1] = scriptPath
    try {
      return evaluate({ loader: {} }, expr)
    } finally {
      process.argv[1] = oldArgv1
    }
  }
  const host015 = makeFakeHost('0.1.5-rc.2', true)
  const host017 = makeFakeHost('0.1.7-rc.2', true)
  const hostNoPiAi = makeFakeHost('0.1.5-rc.2', false)
  try {
    const v015 = evalAtHost(deepseekExpr, host015)
    const v017 = evalAtHost(deepseekExpr, host017)
    const vNoPiAi = evalAtHost(deepseekExpr, hostNoPiAi)
    check('0.1.5 宿主 + pi-ai 在（桥接接管）→ 声明 deepseek base',
      JSON.stringify(v015) === JSON.stringify({ deepseek: BASE_ROUTE }))
    check('0.1.7 宿主（pi-ai 同样在）→ 返回 {}（0.1.7 行为不变）',
      JSON.stringify(v017) === '{}')
    check('旧内核 + pi-ai 缺失（桥接建不起来）→ 返回 {}',
      JSON.stringify(vNoPiAi) === '{}')
  } finally {
    for (const h of [host015, host017, hostNoPiAi]) rmSync(dirname(h), { recursive: true, force: true })
  }
} catch (error) {
  // 三分支规格不是"环境的镜子"：假宿主树找不到/loader 缺失都算规格失败，不静默跳过
  check('真实 loader 可用且三分支求值全部完成', false)
  console.log('       （求值段异常：' + (error instanceof Error ? error.message : String(error)) + '）')
}

console.log(failures === 0 ? '\npatch 条件表达式检查通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

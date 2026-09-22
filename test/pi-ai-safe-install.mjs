// 「启用最新版 pi-ai」下载落点与闸门 —— 离线回归（TDD：先红后绿）。
//
// 盯四件事：
//   1. updater 的下载落点是**安全区**（$DSH_HOME/llm-provider-bridge/pi-ai/<版本>/），
//      不再是插件包内的 vendor/pi-ai/——插件包会被整棵删，下载几百 MB不能放那儿；
//   2. installVersion 幂等：已就位的版本直接返回，绝不触网重下；
//   3. updateDecision 纯函数：上游 ≤ 当前生效版本时明确「无需下载」（Q2-C），
//      有新版且本地没有时才 install；
//   4. 后台自动检查整体移除：触网只发生在用户拨开关那一下（Q1），
//      功能常驻：无 kill switch，触网只与开关 ON 相关（拨动 + 每次启动检查一次）。
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installVersion, safeVersionDir, updateDecision } from '../lib/updater.js'
import { readFileSync } from 'node:fs'

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

// ---- 1. 落点在安全区，跟随 DSH_HOME ----
const sandbox = mkdtempSync(join(tmpdir(), 'dsh-safe-'))
process.env.DSH_HOME = sandbox
check(
  'safeVersionDir 落在 llm-provider-bridge/pi-ai/<版本>/',
  safeVersionDir('0.86.0') === join(sandbox, 'llm-provider-bridge', 'pi-ai', '0.86.0'),
  safeVersionDir('0.86.0'),
)

// ---- 2. installVersion 幂等：已就位（package.json + node_modules 都在）就跳过 ----
const ready = safeVersionDir('9.9.9')
mkdirSync(join(ready, 'node_modules'), { recursive: true })
writeFileSync(join(ready, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-ai', version: '9.9.9' }))
const lines = []
const target = await installVersion({ version: '9.9.9', integrity: 'sha512-占位' }, (line) => lines.push(line))
check('已就位的版本直接返回其目录', target === ready)
check('日志说明跳过下载', lines.some((line) => line.includes('已就位')), lines.join('|'))
check('没删掉已就位的目录', existsSync(join(ready, 'node_modules')) === true)

// ---- 3. updateDecision：什么时候才真的下载 ----
check(
  '上游更新且本地没有 → install',
  updateDecision({ version: '0.86.0' }, '0.85.1', ['0.85.1']).action === 'install',
)
check(
  '上游不比当前生效版本新 → 明确跳过（Q2-C：无新版时给结论）',
  (() => {
    const d = updateDecision({ version: '0.85.1' }, '0.85.1', [])
    return d.action === 'skip' && d.reason !== undefined && String(d.reason).length > 0
  })(),
)
check(
  '上游 0.86.0、本地已就位 0.86.0 → 跳过（不重下）',
  updateDecision({ version: '0.86.0' }, '0.85.1', ['0.86.0']).action === 'skip',
)
check(
  '上游 0.86.0、本地只有旧的 0.85.1 → install',
  updateDecision({ version: '0.86.0' }, undefined, ['0.85.1']).action === 'install',
)


// ---- 4. npm cache 不常驻：放 tmpdir 且装完即删（用户 09-22 批注：安全区那 177MB）----
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const updaterSrc = readFileSync(join(root, 'lib', 'updater.js'), 'utf8')
const indexSrc = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
check('npm cache 用 tmpdir 临时目录（不放安全区）', /pi-ai-npm-cache-/.test(updaterSrc))
check('npm cache 用完即删（removeTree finally）', /removeTree\(npmCache\)/.test(updaterSrc))
check('index 启动兜底清理安全区遗留 cache', /removeTree\(join\(safeRootDir\(\), ['"]\.npm-cache['"]\)\)/.test(indexSrc))
delete process.env.DSH_HOME
rmSync(sandbox, { force: true, recursive: true })

console.log(failures === 0 ? '\n下载落点与闸门测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

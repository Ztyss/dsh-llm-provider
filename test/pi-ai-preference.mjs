// 「启用最新版 pi-ai」偏好门控 —— 离线回归（TDD：先红后绿）。
//
// 功能：设置页开关拨 ON（preference=latest）时，桥接候选链才包含安全区
// （~/.dsh/llm-provider-bridge/pi-ai/<版本>/）里下载来的自有 pi-ai；拨 OFF（缺省）时
// 桥接只用 dsh 自带那份。另盯「选定即清理」：loadBridge 选中新版后，旧的自有版本目录
// 才被清掉（纯函数 obsoleteSafeVersions，当前进程绝不踩待删目录）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  obsoleteSafeVersions,
  piAiCandidates,
  readPiAiPreference,
  safeCandidates,
  safeInstalledVersions,
  safePiAiDir,
  setPiAiPreference,
} from '../lib/bridge.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const statusFile = join(root, 'vendor', 'status.json')

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

// ---- 1. 偏好的读取：缺省 dsh（存量用户无感升级）----
check('空状态读作 dsh（缺省只用 DSH 自带）', readPiAiPreference({}) === 'dsh')
check('piAiPreference=latest 读作 latest', readPiAiPreference({ piAiPreference: 'latest' }) === 'latest')
check('脏值回落到 dsh', readPiAiPreference({ piAiPreference: 'yes' }) === 'dsh')

// ---- 2. 偏好的持久化：拨 ON/OFF 落盘 vendor/status.json（gitignore 的运行时状态）----
const before = existsSync(statusFile) ? readFileSync(statusFile, 'utf8') : undefined
try {
  setPiAiPreference('latest')
  check('拨 ON 后 status.json 落盘 latest', readPiAiPreference(JSON.parse(readFileSync(statusFile, 'utf8'))) === 'latest')
  setPiAiPreference('dsh')
  check('拨 OFF 后 status.json 回落 dsh', readPiAiPreference(JSON.parse(readFileSync(statusFile, 'utf8'))) === 'dsh')
} finally {
  if (before === undefined) rmSync(statusFile, { force: true })
  else writeFileSync(statusFile, before)
}

// ---- 3. 安全区候选档：纯函数（版本清单 → 候选），新 → 旧 ----
const safeList = safeCandidates(['0.85.1', '0.86.0'])
check('安全区档的 key 带 safe- 前缀', safeList.every((c) => c.key.startsWith('safe-')))
check('安全区档新→旧排（0.86.0 在前）', safeList[0].version === '0.86.0' && safeList[1].version === '0.85.1')
check('安全区档的 root 在安全区里', safeList.every((c) => c.root.includes('llm-provider-bridge')))

// ---- 4. 真实候选链的门控：DSH_HOME 注入临时目录，预置两个安全区版本 ----
const sandbox = mkdtempSync(join(tmpdir(), 'dsh-pref-'))
process.env.DSH_HOME = sandbox
// safePiAiDir()/safeInstalledVersions() 每次调用都现场 resolve：注入即时生效
const fakeSafe = join(sandbox, 'llm-provider-bridge', 'pi-ai')
for (const version of ['0.85.1', '0.86.0']) {
  mkdirSync(join(fakeSafe, version, 'node_modules'), { recursive: true })
  writeFileSync(join(fakeSafe, version, 'package.json'), JSON.stringify({ version }))
}
check('safePiAiDir 跟 DSH_HOME 走', safePiAiDir() === fakeSafe)
check(
  '安全区已就位版本被列出（新→旧）',
  JSON.stringify(safeInstalledVersions()) === JSON.stringify(['0.85.1', '0.86.0']),
)

const off = piAiCandidates('dsh')
check('偏好 dsh 时候选链不含安全区档', off.every((c) => !c.key.startsWith('safe-')))
const on = piAiCandidates('latest')
check('偏好 latest 时候选链含安全区档', on.some((c) => c.key.startsWith('safe-')))
check('安全区档排在整个候选链最前', on[0].key.startsWith('safe-'))
check('latest 时安全区内也是新→旧', on[0].version === '0.86.0')
// 不变式：安全区档是**新增**在链首，不是替换——dsh 时候选链里的每一档在 latest 时都还在
// （本沙箱没有 dsh 安装树，宿主档天然缺席；所以断言「on ⊇ off」而不是「含 dsh 档」）
check(
  'latest 时候选链保留其余全部档位（兜底链完整）',
  off.every((c) => on.some((entry) => entry.key === c.key)),
  `off=${off.map((c) => c.key).join(',')} on=${on.map((c) => c.key).join(',')}`,
)
check('latest 时候选链只比 dsh 时多出安全区档', on.length === off.length + 2)

// ---- 5. 选定即清理：只清「选中的那版之外」的自有版本 ----
check(
  '选 0.86.0 时 0.85.1 是待清旧版',
  JSON.stringify(obsoleteSafeVersions(['0.85.1', '0.86.0'], '0.86.0')) === JSON.stringify(['0.85.1']),
)
check('待清清单不含选中版自己', !obsoleteSafeVersions(['0.85.1', '0.86.0'], '0.86.0').includes('0.86.0'))
check('只有一版时无事可清', obsoleteSafeVersions(['0.86.0'], '0.86.0').length === 0)

// ---- 6. 待重启事实的现场推导：下次启动会不会挂到与当前不同的桥（纯函数）----
// 曾经的坑：needsRestart 只在 updater「真的下载安装了」时置位——原地启用（安全区已就位、
// 走 skip 分支）永远不置位，界面于是显示「本地已就位，无需下载」而不说重启，开关拨了像没拨。
// 这个事实本该现场推：(偏好, 安全区已就位版本, 当前跑的那档) 三样都是现成的。
const { piAiNeedsRestart } = await import('../lib/bridge.js')
check('piAiNeedsRestart 已导出（纯函数）', typeof piAiNeedsRestart === 'function')
if (typeof piAiNeedsRestart === 'function') {
  check('原地启用 ON：文件就位但进程跑的还是官方 → 待重启', piAiNeedsRestart('latest', ['0.87.0'], 'dsh-app') === true)
  check('正在跑的就是将选中的安全区版 → 无待办', piAiNeedsRestart('latest', ['0.87.0'], 'safe-0.87.0') === false)
  check('安全区进了新版、进程还跑旧安全区版 → 待重启', piAiNeedsRestart('latest', ['0.86.0', '0.87.0'], 'safe-0.86.0') === true)
  check('latest 但安全区空 → 无待重启（没东西可切，界面走未下载/检查结论）', piAiNeedsRestart('latest', [], 'dsh') === false)
  check('拨 OFF 且进程还在跑安全区版 → 待重启（重启才回退官方）', piAiNeedsRestart('dsh', ['0.87.0'], 'safe-0.87.0') === true)
  check('拨 OFF 且进程正跑官方 → 无待办', piAiNeedsRestart('dsh', ['0.87.0'], 'dsh-app') === false)
  check('latest、有就位副本、桥接档位未知（降级态）→ 待重启', piAiNeedsRestart('latest', ['0.87.0'], undefined) === true)
  check('dsh、桥接档位未知（降级态）→ 无待办', piAiNeedsRestart('dsh', ['0.87.0'], undefined) === false)
}

delete process.env.DSH_HOME
rmSync(sandbox, { force: true, recursive: true })

console.log(failures === 0 ? '\n偏好门控测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

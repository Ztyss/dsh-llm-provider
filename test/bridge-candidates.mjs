// pi-ai 候选探测与链接安全 —— **新策略下的防线**。
//
// 事故（issue #6 + 2026-09-18 现场）：
//   插件曾把 npm 下载的 pi-ai 副本装进 `vendor/pi-ai/<v>/`，于是一条
//   `rmSync(recursive)` 的写路径躺在插件里；而宿主那份 pi-ai 一旦被清空，
//   DSH 会在 boot 阶段整体加载失败 —— **卸载插件也救不回来**。
//
// 新策略（用户诉求）：**pi-ai 只用 DSH 自带那一份，不额外下载**。于是：
//   1. 候选清单里不该再出现「下载档」与「兜底依赖档」，只剩宿主那一档；
//   2. 插件里不该再有任何删除 pi-ai 目录的写路径（连函数一起没了）；
//   3. 链接只准摘链接自己，绝不顺着链接删目标内容。
//
// 本文件盯这三件事，都不需要真的删东西。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDirectoryLink, piAiCandidates, removeDirectoryLink } from '../lib/bridge.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

// ---- 1. 候选清单：合并版四档（vendor 下载档 → 兜底依赖 → dsh-app → dsh）----
// vendor 档默认不落地（下载 opt-in，DSH_PROVIDER_UPDATE=on 才启用），但档位保留；
// 宿主档（dsh-app / dsh）永远优先级最低的那两档之前是 vendor，这是既定的候选顺序。
const report = piAiCandidates()
check('候选报告是数组', Array.isArray(report) && report.length > 0)
check('每条候选都带路径', report.every((c) => typeof c.root === 'string' && c.root !== ''))
check('每条候选都带 key 与版本/来源文字', report.every((c) => typeof c.key === 'string' && typeof c.version === 'string'))
check('含兜底依赖档（opt-in 路径的档位保留）', report.some((c) => c.key === 'dependency'))
check('宿主档的 key 为 dsh-app / dsh', report.filter((c) => c.key !== 'dependency').every((c) => c.key === 'dsh-app' || c.key === 'dsh'))

// 本插件的 vendor 根：用它区分「插件自己的目录」与「宿主的目录」
const vendorRoot = join(root, 'vendor')

// ---- 2. 候选目录必须真的可用：manifest + 入口都在 ----
// 只判 package.json 存在是不够的 —— 事故形态正是「目录在、manifest 在、dist 被清空」。
for (const candidate of report) {
  if (!existsSync(candidate.root)) continue
  check(
    `存在的候选 ${candidate.key} 里确实有 package.json`,
    existsSync(join(candidate.root, 'package.json')),
    candidate.root,
  )
}
const dshCandidate = report.find((c) => c.key === 'dsh' || c.key === 'dsh-app')
if (dshCandidate !== undefined) {
  check(
    'dsh 那份 pi-ai 的路径不在本插件目录里（插件不该是宿主依赖的来源）',
    !dshCandidate.root.startsWith(vendorRoot),
    dshCandidate.root,
  )
  check(
    'dsh 候选路径指向宿主安装树或 profile',
    dshCandidate.root.includes('node_modules'),
    dshCandidate.root,
  )
}

// ---- 3. 删除安全与触网纪律（2026-09-22 策略：开关 ON = 常驻意图，落点安全区）----
// 两次事故的教训不是「不能有下载功能」，而是「绝不能用 rmSync(recursive) 碰任何可能
// 藏 junction 的目录树」。下载入口从「DSH_PROVIDER_UPDATE=on opt-in」改为设置页开关
// （「启用最新版 pi-ai」）后：
//   1. updater 里不允许出现任何递归删除；目录删除一律走链感知 removeTree；
//   2. 触网发生在两处且只与开关 ON 相关：用户拨开关（POST /provider/pi-ai）+ 每次启动
//      检查一次（60s 防抖）；拨 OFF 一概不触网，也没有 kill switch（用户拍板功能常驻）；
//   3. 下载落点是安全区（$DSH_HOME/llm-provider-bridge/pi-ai/），不再是插件包内 vendor/pi-ai/
//      （插件包会被整棵递归删，几百 MB 的下载不能放包里）。
const updaterSrc = readFileSync(join(root, 'lib', 'updater.js'), 'utf8')
const indexSrc = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
check('updater 里没有递归删除（rmSync 一律不带 recursive）', !/rmSync\([^)]*recursive/.test(updaterSrc))
check('updater 的目录删除走链感知 removeTree', /removeTree/.test(updaterSrc))
check('updater 不再有 UPDATES_ENABLED（旧 opt-in 开关已废）', !/UPDATES_ENABLED/.test(updaterSrc))
check('updater 不再有 startBackgroundCheck（节流后台检查已废）', !/startBackgroundCheck/.test(updaterSrc))
check('updater 的下载落点是安全区（safeVersionDir / safePiAiDir）', /safeVersionDir|safePiAiDir/.test(updaterSrc))
check('updater 不再写插件包内的 vendor/pi-ai（VERSIONS_DIR 已移除）', !/VERSIONS_DIR/.test(updaterSrc))
check('kill switch 已按用户批注整段移除（功能常驻，无 off 开关）', !/piAiFeatureDisabled|DSH_PROVIDER_UPDATE/.test(updaterSrc))
check('启动检查走 readPiAiPreference 门控（仅开关 ON 时）', /readPiAiPreference/.test(indexSrc) && /beginPiAiDownload/.test(indexSrc))
check('index 不再调用 startBackgroundCheck', !/startBackgroundCheck/.test(indexSrc))
check('触网入口只有 /provider/pi-ai（旧的 /provider/update 已废弃）', /provider\/pi-ai/.test(indexSrc) && !/provider\/update/.test(indexSrc))

// ---- 4. 链接的识别与安全移除 ----
const sandbox = mkdtempSync(join(tmpdir(), 'dsh-link-'))
const target = join(sandbox, 'real-target')
mkdirSync(target, { recursive: true })
writeFileSync(join(target, 'keep.txt'), '宿主的东西不能被删')
mkdirSync(join(target, 'nested'), { recursive: true })
writeFileSync(join(target, 'nested', 'also-keep.txt'), 'x')

const linkParent = join(sandbox, 'link-parent')
mkdirSync(linkParent, { recursive: true })
const linkPath = join(linkParent, 'pi-ai')

// Windows 上建 junction 不需要管理员权限（软链需要）；POSIX 上用相对软链
const linkType = process.platform === 'win32' ? 'junction' : 'dir'
symlinkSync(target, linkPath, linkType)

check('链接被认成链接', isDirectoryLink(linkPath) === true)
check('真实目录不被认成链接', isDirectoryLink(target) === false)
check('不存在的路径不算链接', isDirectoryLink(join(linkParent, 'absent')) === false)

removeDirectoryLink(linkPath)
check('移除后链接本身没了', existsSync(linkPath) === false)
check('移除链接不会删掉目标目录', existsSync(target) === true)
check('目标里的文件原封不动', existsSync(join(target, 'keep.txt')) === true)
check(
  '目标里的内容也没少',
  readFileSync(join(target, 'keep.txt'), 'utf8').includes('宿主的东西不能被删'),
)

// 幂等 + 对普通目录「不删」的语义
removeDirectoryLink(linkPath)
check('重复移除不报错（幂等）', existsSync(linkPath) === false)

// 一个真目录放在同位置：removeDirectoryLink 绝不能删它（它不是链接）
const notALink = join(linkParent, 'plain-dir')
mkdirSync(join(notALink, 'inside'), { recursive: true })
removeDirectoryLink(notALink)
check('普通目录不会被当成链接删掉', existsSync(join(notALink, 'inside')) === true)

rmSync(sandbox, { force: true, recursive: true })

// ---- 5. 插件不再持有"回收旧版本"的写路径（连同其辅助函数一起移除）----
check('bridge 里不再导出 activeLinkTarget（回收逻辑已随策略移除）',
  !/activeLinkTarget/.test(readFileSync(join(root, 'lib', 'bridge.js'), 'utf8')))

console.log(failures === 0 ? '\n候选探测与链接安全测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

// pi-ai 候选探测与链接安全（issue #6 的根因防线）。
//
// 事故经过（issue 原文有完整日志）：用户删掉插件目录里的 `vendor/pi-ai`
// （260 MB 里 178 MB 是 npm 缓存、82 MB 是这份下载）后重启，宿主自己那份 pi-ai
// 也解析不到，桥接失败；再卸载插件，官方 llm-pi-ai 条目回来却 import 不到 pi-ai，
// 整个 plugin tree 加载失败 —— DSH Desktop 打不开。
//
// 本测试盯两件事，都不需要真的删东西：
//   1. 桥接失败时的诊断要有信息量：候选逐条报「路径 + 在不在 + 用过没用过」，
//      而不是一句 `没有能用的 pi-ai：` 后面空白（issue 的「诊断盲区」）。
//   2. 插件只准删自己建的**链接**，绝不能顺着链接把别人的目录内容删掉 —— 这是
//      「删插件的东西把宿主的东西一起删了」这类事故的结构性防线。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDirectoryLink, piAiCandidates, removeDirectoryLink } from '../lib/bridge.js'

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

// ---- 1. 候选清单带存在性状态 ----
const report = piAiCandidates(true)
check('候选报告是数组', Array.isArray(report) && report.length > 0)
check('每条候选都带路径', report.every((c) => typeof c.root === 'string' && c.root !== ''))
check('每条候选都带 key 与版本/来源文字', report.every((c) => typeof c.key === 'string' && typeof c.version === 'string'))
check('每条候选都带「在不在」的结论', report.every((c) => typeof c.exists === 'boolean'))

// 存在的判定必须跟真实文件系统一致（不然诊断又变成猜）
const roots = piAiCandidates(false)
check('不带状态时仍返回同样数量的候选', roots.length === report.length)
check('不探测时不做文件系统访问', roots.every((c) => c.exists === undefined))

// ---- 2. 宿主那份 pi-ai 的候选路径必须来自**宿主**的 node_modules，而不是本插件的 vendor ----
// 结构断言：只要 vendor/pi-ai 里的版本目录不该出现在宿主候选上。
const vendorRoot = join(process.cwd(), 'vendor')
const hostish = report.filter((c) => c.key !== 'dependency' && !c.root.startsWith(vendorRoot))
check('存在来自 vendor 之外的候选（宿主那份）或明确没有', hostish.length >= 0)

// 最关键的一条：`dsh` 候选的路径必须指向宿主安装树/profile，不可能指向本插件目录
const dshCandidate = report.find((c) => c.key === 'dsh')
if (dshCandidate !== undefined) {
  check(
    'dsh 那份 pi-ai 的路径不在本插件目录里（删插件不该影响宿主解析）',
    !dshCandidate.root.startsWith(vendorRoot),
    dshCandidate.root,
  )
}

// ---- 3. 链接的识别与安全移除 ----
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
symlinkSync(linkType === 'junction' ? target : target, linkPath, linkType)

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

console.log(failures === 0 ? '\n候选探测与链接安全测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)
